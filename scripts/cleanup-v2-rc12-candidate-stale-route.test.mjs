import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import {
  deleteStaleRoute,
  inspectStaleRouteInventory,
  preflightStaleRouteCleanup,
  staleRouteCleanupExpectation,
  verifyStaleRouteCleanup,
} from "./cleanup-v2-rc12-candidate-stale-route.mjs";

const zoneId = "opaque-zone-id";
const domainId = "opaque-domain-id";
const candidateVersion = "74ba4c1d-bdc4-4989-81cd-bf9848a20eaf";
const liveVersion = "9715af4f-e72a-41c2-b88a-ec6fc7e81b27";
const staleRoute = {
  id: "opaque-stale-route-id",
  pattern: staleRouteCleanupExpectation.staleRoutePattern,
  script: staleRouteCleanupExpectation.candidateRouterService,
};
const liveRoute = {
  id: "opaque-live-route-id",
  pattern: "*.labofscents.org/*",
  script: staleRouteCleanupExpectation.liveRouterService,
};

function jsonResponse(status, result, success = true) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => ({ success, result }),
  };
}

function publicResponse(path) {
  if (path === "/release.json")
    return {
      status: 200,
      json: async () => ({
        fullGitSha: staleRouteCleanupExpectation.releaseSha,
        artifact: "pages",
      }),
    };
  const headers = new Map([
    ["content-type", "text/html; charset=utf-8"],
    ["x-olfactoryops-workspace-router", "active"],
    ["x-olfactoryops-release-environment", "production"],
    ["x-olfactoryops-release-sha", staleRouteCleanupExpectation.releaseSha],
  ]);
  return { status: 200, headers: { get: (name) => headers.get(name) ?? null } };
}

function candidateBindings() {
  return [
    { name: "RELEASE_GIT_SHA", type: "plain_text", text: staleRouteCleanupExpectation.releaseSha },
    { name: "PAGES_ORIGIN", type: "plain_text", text: staleRouteCleanupExpectation.candidatePagesOrigin },
    { name: "V2_WORKSPACE_BASE_DOMAIN", type: "plain_text", text: staleRouteCleanupExpectation.workspaceBaseDomain },
    { name: "RELEASE_ENVIRONMENT", type: "plain_text", text: "production" },
    { name: "HYPERDRIVE", type: "hyperdrive", id: staleRouteCleanupExpectation.hyperdriveId },
  ];
}

function harness({ deleteResponse = jsonResponse(200, {}), initialRoutes } = {}) {
  let routes = initialRoutes ?? [staleRoute, liveRoute];
  let deleteCount = 0;
  const fetchFn = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    if (url.pathname.endsWith("/workers/domains"))
      return jsonResponse(200, [
        {
          id: domainId,
          hostname: staleRouteCleanupExpectation.fixtureHostname,
          service: staleRouteCleanupExpectation.candidateRouterService,
          zone_id: zoneId,
          zone_name: staleRouteCleanupExpectation.zoneName,
        },
      ]);
    if (url.pathname.endsWith("/deployments")) {
      const version = url.pathname.includes(
        staleRouteCleanupExpectation.candidateRouterService,
      )
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
    if (
      url.pathname.endsWith(`/workers/routes/${staleRoute.id}`) &&
      method === "DELETE"
    ) {
      deleteCount += 1;
      routes = routes.filter((route) => route.id !== staleRoute.id);
      return deleteResponse;
    }
    throw new Error("unexpected request");
  };
  return {
    fetchFn,
    publicFetchFn: async (input) => publicResponse(new URL(input).pathname),
    get routes() {
      return routes;
    },
    get deleteCount() {
      return deleteCount;
    },
  };
}

function context() {
  const directory = mkdtempSync(
    join(tmpdir(), "oo-v2-rc12-stale-route-cleanup-"),
  );
  return {
    directory,
    environment: {
      RUNNER_TEMP: tmpdir(),
      RC12_STALE_ROUTE_CLEANUP_DIR: directory,
    },
    config: {
      accountId: "account",
      apiToken: "token-sentinel",
      releaseSha: staleRouteCleanupExpectation.releaseSha,
      fixtureHostname: staleRouteCleanupExpectation.fixtureHostname,
    },
  };
}

test("deletes exactly one candidate-only stale route and preserves live routes and the Custom Domain", async () => {
  const ctx = context();
  const api = harness();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await preflightStaleRouteCleanup({ ...ctx, fetchFn: api.fetchFn });
    await deleteStaleRoute({ ...ctx, fetchFn: api.fetchFn });
    await verifyStaleRouteCleanup({
      ...ctx,
      fetchFn: api.fetchFn,
      publicFetchFn: api.publicFetchFn,
    });
    expect(api.deleteCount).toBe(1);
    expect(api.routes).toEqual([liveRoute]);
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("STALE_ROUTE_IDENTIFIED=PASS");
    expect(output).toContain("ROUTE_DELETION_COUNT=1");
    expect(output).toContain("TENANT_ROUTER_EXACT_ROUTE=PASS");
    expect(output).toContain("LIVE_ROUTE_SET_UNCHANGED=PASS");
    expect(output).not.toContain(staleRoute.id);
    expect(output).not.toContain(domainId);
    expect(output).not.toContain("token-sentinel");
    expect(log.mock.calls.every((call) => call.length === 1)).toBe(true);
  } finally {
    log.mockRestore();
    rmSync(ctx.directory, { recursive: true, force: true });
  }
});

test("accepts one ambiguous 2xx delete only after the exact route is confirmed absent", async () => {
  const ctx = context();
  const api = harness({
    deleteResponse: {
      status: 200,
      ok: true,
      json: async () => {
        throw new Error("raw-body-sentinel");
      },
    },
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await preflightStaleRouteCleanup({ ...ctx, fetchFn: api.fetchFn });
    await deleteStaleRoute({ ...ctx, fetchFn: api.fetchFn });
    expect(api.deleteCount).toBe(1);
    expect(log.mock.calls.flat().join("\n")).toContain(
      "STALE_ROUTE_DELETE_RESPONSE=ACKNOWLEDGED_UNCONFIRMED",
    );
    expect(log.mock.calls.flat().join("\n")).not.toContain(
      "raw-body-sentinel",
    );
  } finally {
    log.mockRestore();
    rmSync(ctx.directory, { recursive: true, force: true });
  }
});

test("never deletes a live target, a conflicting exact route, or more than one candidate route", async () => {
  const conflicting = inspectStaleRouteInventory([
    liveRoute,
    {
      id: "wrong-target",
      pattern: staleRouteCleanupExpectation.staleRoutePattern,
      script: staleRouteCleanupExpectation.liveRouterService,
    },
  ]);
  expect(conflicting.conflictingExactRoutes).toHaveLength(1);

  for (const initialRoutes of [
    [
      liveRoute,
      staleRoute,
      { ...staleRoute, id: "second-candidate", pattern: "other.example/*" },
    ],
    [
      liveRoute,
      {
        id: "wrong-target",
        pattern: staleRouteCleanupExpectation.staleRoutePattern,
        script: staleRouteCleanupExpectation.liveRouterService,
      },
    ],
  ]) {
    const ctx = context();
    const api = harness({ initialRoutes });
    try {
      await expect(
        preflightStaleRouteCleanup({ ...ctx, fetchFn: api.fetchFn }),
      ).rejects.toThrow();
      expect(api.deleteCount).toBe(0);
    } finally {
      rmSync(ctx.directory, { recursive: true, force: true });
    }
  }
});

test("does not retry a rejected delete or reveal provider errors", async () => {
  const ctx = context();
  const api = harness({
    deleteResponse: {
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
    await preflightStaleRouteCleanup({ ...ctx, fetchFn: api.fetchFn });
    await expect(
      deleteStaleRoute({ ...ctx, fetchFn: api.fetchFn }),
    ).rejects.toThrow();
    expect(api.deleteCount).toBe(1);
    expect(log.mock.calls.flat().join("\n")).not.toContain(
      "provider-error-sentinel",
    );
  } finally {
    log.mockRestore();
    rmSync(ctx.directory, { recursive: true, force: true });
  }
});

test("is idempotent when the exact stale route is already absent", async () => {
  const ctx = context();
  const api = harness({ initialRoutes: [liveRoute] });
  try {
    await preflightStaleRouteCleanup({ ...ctx, fetchFn: api.fetchFn });
    await deleteStaleRoute({ ...ctx, fetchFn: api.fetchFn });
    await verifyStaleRouteCleanup({
      ...ctx,
      fetchFn: api.fetchFn,
      publicFetchFn: api.publicFetchFn,
    });
    expect(api.deleteCount).toBe(0);
    expect(api.routes).toEqual([liveRoute]);
  } finally {
    rmSync(ctx.directory, { recursive: true, force: true });
  }
});
