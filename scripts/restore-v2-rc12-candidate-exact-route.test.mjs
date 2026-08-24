import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import { staleRouteCleanupExpectation as expectation } from "./cleanup-v2-rc12-candidate-stale-route.mjs";
import {
  createRecoveredRoute,
  preflightRouteRecovery,
  rollbackRecoveredRoute,
  verifyRecoveredRoute,
} from "./restore-v2-rc12-candidate-exact-route.mjs";

const zoneId = "opaque-zone-id";
const domainId = "opaque-domain-id";
const createdRouteId = "opaque-created-route-id";
const candidateVersion = "74ba4c1d-bdc4-4989-81cd-bf9848a20eaf";
const liveVersion = "9715af4f-e72a-41c2-b88a-ec6fc7e81b27";
const exactRoute = {
  id: createdRouteId,
  pattern: expectation.staleRoutePattern,
  script: expectation.candidateRouterService,
};
const liveRoute = {
  id: "opaque-live-route-id",
  pattern: "*.labofscents.org/*",
  script: expectation.liveRouterService,
};

function jsonResponse(status, result, success = true) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => ({ success, result }),
  };
}

function candidateBindings() {
  return [
    {
      name: "RELEASE_GIT_SHA",
      type: "plain_text",
      text: expectation.releaseSha,
    },
    {
      name: "PAGES_ORIGIN",
      type: "plain_text",
      text: expectation.candidatePagesOrigin,
    },
    {
      name: "V2_WORKSPACE_BASE_DOMAIN",
      type: "plain_text",
      text: expectation.workspaceBaseDomain,
    },
    {
      name: "RELEASE_ENVIRONMENT",
      type: "plain_text",
      text: "production",
    },
    {
      name: "HYPERDRIVE",
      type: "hyperdrive",
      id: expectation.hyperdriveId,
    },
  ];
}

function htmlResponse(status = 200) {
  const headers = new Map([
    ["content-type", "text/html; charset=utf-8"],
    ["x-olfactoryops-workspace-router", "active"],
    ["x-olfactoryops-release-environment", "production"],
    ["x-olfactoryops-release-sha", expectation.releaseSha],
  ]);
  return { status, headers: { get: (name) => headers.get(name) ?? null } };
}

function harness({
  initialRoutes = [liveRoute],
  createResponse = jsonResponse(200, { id: createdRouteId }),
  publicReady = true,
  createMaterializes = true,
} = {}) {
  let routes = [...initialRoutes];
  let postCount = 0;
  let deleteCount = 0;
  const fetchFn = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    if (url.pathname.endsWith("/workers/domains"))
      return jsonResponse(200, [
        {
          id: domainId,
          hostname: expectation.fixtureHostname,
          service: expectation.candidateRouterService,
          zone_id: zoneId,
          zone_name: expectation.zoneName,
        },
      ]);
    if (url.pathname.endsWith("/deployments")) {
      const version = url.pathname.includes(expectation.candidateRouterService)
        ? candidateVersion
        : liveVersion;
      return jsonResponse(200, {
        deployments: [
          {
            strategy: "percentage",
            versions: [{ version_id: version, percentage: 100 }],
          },
        ],
      });
    }
    if (url.pathname.endsWith(`/versions/${candidateVersion}`))
      return jsonResponse(200, {
        id: candidateVersion,
        resources: { bindings: candidateBindings() },
      });
    if (url.pathname.endsWith("/workers/routes") && method === "GET")
      return jsonResponse(200, routes);
    if (url.pathname.endsWith("/workers/routes") && method === "POST") {
      postCount += 1;
      if (createMaterializes) routes = [...routes, exactRoute];
      return createResponse;
    }
    if (
      url.pathname.endsWith(`/workers/routes/${createdRouteId}`) &&
      method === "DELETE"
    ) {
      deleteCount += 1;
      routes = routes.filter((route) => route.id !== createdRouteId);
      return jsonResponse(200, {});
    }
    throw new Error("unexpected request");
  };
  const publicFetchFn = async (input) => {
    const path = new URL(input).pathname;
    const routePresent = routes.some((route) => route.id === createdRouteId);
    if (!routePresent) return htmlResponse(404);
    if (!publicReady) return htmlResponse(503);
    if (path === "/release.json")
      return {
        status: 200,
        json: async () => ({
          fullGitSha: expectation.releaseSha,
          artifact: "pages",
        }),
      };
    return htmlResponse();
  };
  return {
    fetchFn,
    publicFetchFn,
    get routes() {
      return routes;
    },
    get postCount() {
      return postCount;
    },
    get deleteCount() {
      return deleteCount;
    },
  };
}

function context() {
  const directory = mkdtempSync(
    join(tmpdir(), "oo-v2-rc12-route-recovery-"),
  );
  return {
    directory,
    environment: {
      RUNNER_TEMP: tmpdir(),
      RC12_ROUTE_RECOVERY_DIR: directory,
    },
    config: {
      accountId: "account-sentinel",
      apiToken: "token-sentinel",
      releaseSha: expectation.releaseSha,
      fixtureHostname: expectation.fixtureHostname,
    },
  };
}

test("restores one exact candidate route and proves the five routes plus release identity", async () => {
  const ctx = context();
  const api = harness();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await preflightRouteRecovery({
      ...ctx,
      fetchFn: api.fetchFn,
      publicFetchFn: api.publicFetchFn,
    });
    await createRecoveredRoute({ ...ctx, fetchFn: api.fetchFn });
    await verifyRecoveredRoute({
      ...ctx,
      fetchFn: api.fetchFn,
      publicFetchFn: api.publicFetchFn,
      waitFn: async () => {},
    });
    expect(api.postCount).toBe(1);
    expect(api.deleteCount).toBe(0);
    expect(api.routes).toEqual([liveRoute, exactRoute]);
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("RC12_EXACT_CANDIDATE_ROUTE_RECOVERY=PASS");
    expect(output).toContain("EXACT_FIXTURE_RELEASE_IDENTITY=PASS");
    expect(output).toContain("LIVE_ROUTE_SET_UNCHANGED=PASS");
    expect(output).not.toContain(createdRouteId);
    expect(output).not.toContain(domainId);
    expect(output).not.toContain("token-sentinel");
    expect(log.mock.calls.every((call) => call.length === 1)).toBe(true);
  } finally {
    log.mockRestore();
    rmSync(ctx.directory, { recursive: true, force: true });
  }
});

test("accepts an ambiguous 2xx create only after exact inventory confirmation", async () => {
  const ctx = context();
  const api = harness({
    createResponse: {
      status: 200,
      ok: true,
      json: async () => {
        throw new Error("raw-response-sentinel");
      },
    },
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await preflightRouteRecovery({
      ...ctx,
      fetchFn: api.fetchFn,
      publicFetchFn: api.publicFetchFn,
    });
    await createRecoveredRoute({ ...ctx, fetchFn: api.fetchFn });
    expect(api.postCount).toBe(1);
    expect(log.mock.calls.flat().join("\n")).not.toContain(
      "raw-response-sentinel",
    );
  } finally {
    log.mockRestore();
    rmSync(ctx.directory, { recursive: true, force: true });
  }
});

test("fails before mutation for a conflicting or pre-existing candidate route", async () => {
  for (const initialRoutes of [
    [liveRoute, exactRoute],
    [
      liveRoute,
      {
        id: "wrong-target",
        pattern: expectation.staleRoutePattern,
        script: expectation.liveRouterService,
      },
    ],
    [
      liveRoute,
      {
        id: "other-candidate-route",
        pattern: "https://other.next.labofscents.org/*",
        script: expectation.candidateRouterService,
      },
    ],
  ]) {
    const ctx = context();
    const api = harness({ initialRoutes });
    try {
      await expect(
        preflightRouteRecovery({
          ...ctx,
          fetchFn: api.fetchFn,
          publicFetchFn: api.publicFetchFn,
        }),
      ).rejects.toThrow();
      expect(api.postCount).toBe(0);
    } finally {
      rmSync(ctx.directory, { recursive: true, force: true });
    }
  }
});

test("records and rolls back an observed route when the create response is rejected", async () => {
  const ctx = context();
  const api = harness({
    createResponse: {
      status: 403,
      ok: false,
      json: async () => ({
        success: false,
        errors: [{ code: 10000, message: "provider-error-sentinel" }],
      }),
    },
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await preflightRouteRecovery({
      ...ctx,
      fetchFn: api.fetchFn,
      publicFetchFn: api.publicFetchFn,
    });
    await expect(
      createRecoveredRoute({ ...ctx, fetchFn: api.fetchFn }),
    ).rejects.toThrow();
    await rollbackRecoveredRoute({ ...ctx, fetchFn: api.fetchFn });
    expect(api.postCount).toBe(1);
    expect(api.deleteCount).toBe(1);
    expect(api.routes).toEqual([liveRoute]);
    expect(log.mock.calls.flat().join("\n")).not.toContain(
      "provider-error-sentinel",
    );
  } finally {
    log.mockRestore();
    rmSync(ctx.directory, { recursive: true, force: true });
  }
});

test("rolls back only the route created by this run when fixture verification fails", async () => {
  const ctx = context();
  const api = harness({ publicReady: false });
  try {
    await preflightRouteRecovery({
      ...ctx,
      fetchFn: api.fetchFn,
      publicFetchFn: api.publicFetchFn,
    });
    await createRecoveredRoute({ ...ctx, fetchFn: api.fetchFn });
    await expect(
      verifyRecoveredRoute({
        ...ctx,
        fetchFn: api.fetchFn,
        publicFetchFn: api.publicFetchFn,
        waitFn: async () => {},
      }),
    ).rejects.toThrow();
    await rollbackRecoveredRoute({ ...ctx, fetchFn: api.fetchFn });
    expect(api.postCount).toBe(1);
    expect(api.deleteCount).toBe(1);
    expect(api.routes).toEqual([liveRoute]);
  } finally {
    rmSync(ctx.directory, { recursive: true, force: true });
  }
});
