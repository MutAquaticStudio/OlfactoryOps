import { describe, expect, it } from "vitest";

import {
  PRODUCTION_SERVICES,
  captureFirstReleaseRouteBaseline,
  deleteFirstReleaseWorkers,
  handoffApprovedRoutes,
  parseBaseline,
  restoreApprovedRoutes,
  serializeBaseline,
  verifyCurrentRouteBaseline,
} from "./v2-first-release-route-policy.mjs";

const account = "account-fixture";
const releaseSha = "f".repeat(40);
const hyperdriveId = "hyperdrive-fixture";
const tenantHostname = "smoke-fixture.next.labofscents.org";

function response(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  };
}

function activeDeployment(versionId = "version-fixture") {
  return {
    success: true,
    result: {
      deployments: [
        {
          strategy: "percentage",
          versions: [{ percentage: 100, version_id: versionId }],
        },
      ],
    },
  };
}

function rc10Bindings(service, mismatch) {
  const common = [
    {
      type: "plain_text",
      name: "RELEASE_GIT_SHA",
      text: mismatch ? "0".repeat(40) : releaseSha,
    },
    { type: "plain_text", name: "RELEASE_ENVIRONMENT", text: "production" },
    { type: "hyperdrive", name: "HYPERDRIVE", id: hyperdriveId },
  ];
  if (service === PRODUCTION_SERVICES.api) {
    return common.concat([
      {
        type: "plain_text",
        name: "V2_API_PUBLIC_HOSTNAME",
        text: "api.labofscents.org",
      },
      {
        type: "plain_text",
        name: "V2_PUBLIC_PAGES_HOSTNAME",
        text: "labofscents.org",
      },
      {
        type: "plain_text",
        name: "V2_PLATFORM_ADMIN_HOSTNAME",
        text: "admin.labofscents.org",
      },
      {
        type: "plain_text",
        name: "V2_WORKSPACE_BASE_DOMAIN",
        text: "labofscents.org",
      },
    ]);
  }
  return common.concat([
    {
      type: "plain_text",
      name: "V2_WORKSPACE_BASE_DOMAIN",
      text: "labofscents.org",
    },
    {
      type: "plain_text",
      name: "PAGES_ORIGIN",
      text: "https://deployment.olfactoryops-v2-production.pages.dev",
    },
  ]);
}

function fixture() {
  const state = {
    routes: [
      {
        id: "route-api-fixture",
        pattern: "api.labofscents.org/*",
        script: "existing-api-service",
      },
      {
        id: "route-router-fixture",
        pattern: "*.labofscents.org/*",
        script: "existing-router-service",
      },
    ],
    productionPresent: false,
    healthFailure: false,
    apiReleaseMismatch: false,
    routerReleaseMismatch: false,
    releaseMismatch: false,
    predecessorVersionOverride: undefined,
    deleted: [],
    requests: [],
  };
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    const path = url.pathname;
    state.requests.push({ method: init.method ?? "GET", path });
    if (url.hostname === "api.labofscents.org") {
      return response(
        {
          releaseGitSha: state.apiReleaseMismatch ? "0".repeat(40) : releaseSha,
        },
        state.healthFailure ? 503 : 200,
      );
    }
    if (url.hostname === tenantHostname) {
      return response({}, state.healthFailure ? 503 : 200, {
        "x-olfactoryops-release-sha": state.routerReleaseMismatch
          ? "0".repeat(40)
          : releaseSha,
      });
    }
    if (path === "/client/v4/zones") {
      return response({
        success: true,
        result: [{ id: "zone-fixture", name: "labofscents.org" }],
      });
    }
    if (path === "/client/v4/zones/zone-fixture/workers/routes") {
      return response({ success: true, result: state.routes });
    }
    const route = path.match(
      /^\/client\/v4\/zones\/zone-fixture\/workers\/routes\/([^/]+)$/,
    );
    if (route) {
      const existing = state.routes.find((item) => item.id === route[1]);
      if (!existing) {
        return response({ success: false, errors: [{ code: 7003 }] }, 404);
      }
      if ((init.method ?? "GET") === "PUT") {
        const body = JSON.parse(init.body);
        Object.assign(existing, body);
        return response({ success: true, result: existing });
      }
      return response({ success: true, result: existing });
    }
    const domain = path.match(
      /^\/client\/v4\/accounts\/[^/]+\/workers\/domains$/,
    );
    if (domain) return response({ success: true, result: [] });
    const version = path.match(
      /^\/client\/v4\/accounts\/[^/]+\/workers\/scripts\/([^/]+)\/versions\/version-fixture$/,
    );
    if (version) {
      const service = decodeURIComponent(version[1]);
      return response({
        success: true,
        result: {
          id: "version-fixture",
          resources: {
            bindings: rc10Bindings(service, state.releaseMismatch),
          },
        },
      });
    }
    const worker = path.match(
      /^\/client\/v4\/accounts\/[^/]+\/workers\/scripts\/([^/]+)(\/deployments)?$/,
    );
    if (worker) {
      const service = decodeURIComponent(worker[1]);
      const isProduction = Object.values(PRODUCTION_SERVICES).includes(service);
      if (!worker[2] && (init.method ?? "GET") === "DELETE") {
        state.deleted.push(service);
        return response({ success: true, result: {} });
      }
      if (isProduction && !state.productionPresent) {
        return response({ success: false, errors: [{ code: 10007 }] }, 404);
      }
      return response(
        activeDeployment(
          isProduction
            ? "version-fixture"
            : (state.predecessorVersionOverride ?? "version-fixture"),
        ),
      );
    }
    throw new Error("unexpected test endpoint");
  };
  return { state, fetchImpl };
}

async function capture(context) {
  return captureFirstReleaseRouteBaseline({
    account,
    token: "token-fixture",
    releaseSha,
    fetchImpl: context.fetchImpl,
    now: () => "2026-08-20T00:00:00.000Z",
  });
}

function handoff(context, captured, overrides = {}) {
  return handoffApprovedRoutes({
    account,
    token: "token-fixture",
    baseline: captured.manifest,
    releaseSha,
    expectedHyperdriveId: hyperdriveId,
    tenantHostname,
    fetchImpl: context.fetchImpl,
    healthAttempts: 1,
    sleep: async () => {},
    ...overrides,
  });
}

describe("first-release route policy", () => {
  it("captures a deterministic absence-and-route-handoff baseline without exposing targets in safe evidence", async () => {
    const context = fixture();
    const result = await capture(context);

    expect(result.pass).toBe(true);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(parseBaseline(serializeBaseline(result.manifest))).toEqual(
      result.manifest,
    );
    expect(
      JSON.stringify({ pass: result.pass, fingerprint: result.fingerprint }),
    ).not.toContain("existing-api-service");
  });

  it.each([
    [
      "zero",
      (state) => (state.routes = state.routes.slice(1)),
      "ROUTE_MISSING",
    ],
    [
      "ambiguous",
      (state) =>
        state.routes.push({
          id: "route-api-second",
          pattern: "api.labofscents.org/*",
          script: "other-existing-service",
        }),
      "ROUTE_AMBIGUOUS",
    ],
    [
      "unexpected",
      (state) => (state.routes[0].script = PRODUCTION_SERVICES.api),
      "ROUTE_TARGET_UNEXPECTED",
    ],
  ])("fails closed for %s route state", async (_name, mutate, expected) => {
    const context = fixture();
    mutate(context.state);
    await expect(capture(context)).resolves.toMatchObject({
      pass: false,
      state: expected,
    });
  });

  it("detects baseline drift before any handoff mutation", async () => {
    const context = fixture();
    const captured = await capture(context);
    context.state.productionPresent = true;
    context.state.routes[0].script = "drifted-existing-service";

    await expect(
      verifyCurrentRouteBaseline({
        account,
        token: "token-fixture",
        baseline: captured.manifest,
        releaseSha,
        expectedHyperdriveId: hyperdriveId,
        fetchImpl: context.fetchImpl,
      }),
    ).resolves.toEqual({ pass: false, state: "CUTOVER_ROUTE_BASELINE_DRIFT" });
    await expect(handoff(context, captured)).resolves.toMatchObject({
      pass: false,
      state: "CUTOVER_ROUTE_BASELINE_DRIFT",
    });
    expect(
      context.state.requests.some((request) => request.method === "PUT"),
    ).toBe(false);
  });

  it("refuses handoff when a predecessor version changed after baseline capture", async () => {
    const context = fixture();
    const captured = await capture(context);
    context.state.productionPresent = true;
    context.state.predecessorVersionOverride = "version-replaced";

    await expect(handoff(context, captured)).resolves.toEqual({
      pass: false,
      state: "PREVIOUS_TARGET_UNPROVEN",
    });
    expect(
      context.state.requests.some((request) => request.method === "PUT"),
    ).toBe(false);
  });

  it("hands off only to exact RC10 targets and restores only approved old targets", async () => {
    const context = fixture();
    const captured = await capture(context);
    context.state.productionPresent = true;

    await expect(handoff(context, captured)).resolves.toEqual({
      pass: true,
      state: "READY",
    });
    expect(context.state.routes.map((route) => route.script)).toEqual([
      PRODUCTION_SERVICES.api,
      PRODUCTION_SERVICES.router,
    ]);

    await expect(
      restoreApprovedRoutes({
        account,
        token: "token-fixture",
        baseline: captured.manifest,
        releaseSha,
        expectedHyperdriveId: hyperdriveId,
        fetchImpl: context.fetchImpl,
      }),
    ).resolves.toEqual({ pass: true, state: "READY" });
    expect(context.state.routes.map((route) => route.script)).toEqual([
      "existing-api-service",
      "existing-router-service",
    ]);
  });

  it("restores the approved baseline when post-handoff health fails", async () => {
    const context = fixture();
    const captured = await capture(context);
    context.state.productionPresent = true;
    context.state.healthFailure = true;

    await expect(handoff(context, captured)).resolves.toEqual({
      pass: false,
      state: "API_EDGE_NOT_READY",
      rollback: "PASS",
    });
    expect(context.state.routes.map((route) => route.script)).toEqual([
      "existing-api-service",
      "existing-router-service",
    ]);
  });

  it("refuses a handoff when the new target does not expose the exact RC10 binding", async () => {
    const context = fixture();
    const captured = await capture(context);
    context.state.productionPresent = true;
    context.state.releaseMismatch = true;

    await expect(handoff(context, captured)).resolves.toEqual({
      pass: false,
      state: "RC10_TARGET_UNPROVEN",
    });
    expect(
      context.state.requests.some((request) => request.method === "PUT"),
    ).toBe(false);
  });

  it("fails closed before any handoff for an invalid dedicated smoke tenant", async () => {
    const context = fixture();
    const captured = await capture(context);
    context.state.productionPresent = true;

    await expect(
      handoff(context, captured, { tenantHostname: "next.labofscents.org" }),
    ).resolves.toEqual({ pass: false, state: "SMOKE_TENANT_UNPROVEN" });
    expect(
      context.state.requests.some((request) => request.method === "PUT"),
    ).toBe(false);
  });

  it.each([
    ["API", "apiReleaseMismatch", "API_EDGE_RELEASE_IDENTITY_UNPROVEN"],
    [
      "tenant Router",
      "routerReleaseMismatch",
      "TENANT_ROUTER_EDGE_RELEASE_IDENTITY_UNPROVEN",
    ],
  ])(
    "restores the approved baseline when %s edge release identity is unproven",
    async (_name, stateKey, expectedState) => {
      const context = fixture();
      const captured = await capture(context);
      context.state.productionPresent = true;
      context.state[stateKey] = true;

      await expect(handoff(context, captured)).resolves.toEqual({
        pass: false,
        state: expectedState,
        rollback: "PASS",
      });
      expect(context.state.routes.map((route) => route.script)).toEqual([
        "existing-api-service",
        "existing-router-service",
      ]);
    },
  );

  it("refuses cleanup before restoration and deletes only exact first-release resources afterward", async () => {
    const context = fixture();
    const captured = await capture(context);
    context.state.productionPresent = true;

    await expect(
      deleteFirstReleaseWorkers({
        account,
        token: "token-fixture",
        baseline: captured.manifest,
        routeRestored: false,
        fetchImpl: context.fetchImpl,
      }),
    ).resolves.toEqual({ pass: false, state: "CLEANUP_PRECONDITION_FAILED" });

    await expect(
      deleteFirstReleaseWorkers({
        account,
        token: "token-fixture",
        baseline: captured.manifest,
        routeRestored: true,
        fetchImpl: context.fetchImpl,
      }),
    ).resolves.toEqual({ pass: true, state: "READY" });
    expect(context.state.deleted).toEqual(Object.values(PRODUCTION_SERVICES));
  });
});
