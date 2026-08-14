import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  createExactRouteOverride,
  exactRouteOverrideConfig,
  exactRouteOverrideExpectation,
  inspectRouteInventory,
  preflightExactRouteOverride,
  rollbackExactRouteOverride,
} from "./override-v2-production-candidate-exact-route.mjs";
import { routerIngressExpectation } from "./inspect-v2-production-candidate-router-ingress.mjs";

const zoneId = "opaque-zone-id";
const versionId = "96a902d8-9477-4e4e-b732-228dd17d376b";
const wildcard = {
  id: "wildcard-route",
  pattern: "https://*.next.labofscents.org/*",
  script: "legacy-non-candidate-router",
};

function bindings() {
  return [
    {
      name: "RELEASE_GIT_SHA",
      type: "plain_text",
      text: routerIngressExpectation.releaseSha,
    },
    {
      name: "PAGES_ORIGIN",
      type: "plain_text",
      text: routerIngressExpectation.pagesOrigin,
    },
    {
      name: "V2_WORKSPACE_BASE_DOMAIN",
      type: "plain_text",
      text: routerIngressExpectation.workspaceBaseDomain,
    },
    { name: "RELEASE_ENVIRONMENT", type: "plain_text", text: "production" },
    {
      name: "HYPERDRIVE",
      type: "hyperdrive",
      id: routerIngressExpectation.hyperdriveId,
    },
  ];
}

function response(status, result, success = true) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => ({ success, result }),
  };
}

function environment(directory, overrides = {}) {
  return {
    RUNNER_TEMP: tmpdir(),
    EXACT_ROUTE_OVERRIDE_DIR: directory,
    EXACT_ROUTE_OVERRIDE_RELEASE_SHA: exactRouteOverrideExpectation.releaseSha,
    EXACT_ROUTE_OVERRIDE_FIXTURE_HOSTNAME:
      exactRouteOverrideExpectation.fixtureHostname,
    ...overrides,
  };
}

test("the exact candidate route wins while another tenant remains on the wildcard", () => {
  const exact = {
    id: "exact-route",
    pattern: exactRouteOverrideExpectation.routePattern,
    script: exactRouteOverrideExpectation.routerService,
  };
  const candidate = inspectRouteInventory([wildcard, exact]);
  expect(candidate.matching).toHaveLength(2);
  expect(candidate.candidateWins).toBe(true);

  const otherTenant = inspectRouteInventory([wildcard, exact], {
    ...exactRouteOverrideExpectation,
    fixtureHostname: "another.next.labofscents.org",
    routePattern: "https://another.next.labofscents.org/*",
  });
  expect(otherTenant.matching).toHaveLength(1);
  expect(otherTenant.candidateWins).toBe(false);
});

test("rejects wrong immutable fixture or release inputs and duplicate exact routes", () => {
  expect(() =>
    exactRouteOverrideConfig(
      environment("/tmp/unused", { EXACT_ROUTE_OVERRIDE_RELEASE_SHA: "wrong" }),
    ),
  ).toThrow();
  expect(() =>
    exactRouteOverrideConfig(
      environment("/tmp/unused", {
        EXACT_ROUTE_OVERRIDE_FIXTURE_HOSTNAME: "other.next.labofscents.org",
      }),
    ),
  ).toThrow();
  const duplicate = inspectRouteInventory([
    wildcard,
    {
      id: "exact-1",
      pattern: exactRouteOverrideExpectation.routePattern,
      script: exactRouteOverrideExpectation.routerService,
    },
    {
      id: "exact-2",
      pattern: exactRouteOverrideExpectation.routePattern,
      script: exactRouteOverrideExpectation.routerService,
    },
  ]);
  expect(duplicate.exactCount).toBe(2);
  expect(duplicate.candidateWins).toBe(false);
  const wrongService = inspectRouteInventory([
    wildcard,
    {
      id: "wrong-service",
      pattern: exactRouteOverrideExpectation.routePattern,
      script: "other-router",
    },
  ]);
  expect(wrongService.exactWrong).toBe(true);
  expect(wrongService.candidateWins).toBe(false);
});

test("ambiguous create recovers through inventory and rollback deletes only the created exact route", async () => {
  const directory = mkdtempSync(join(tmpdir(), "oo-v2-exact-route-override-"));
  const env = environment(directory);
  const config = {
    accountId: "account",
    apiToken: "token",
    releaseSha: exactRouteOverrideExpectation.releaseSha,
    fixtureHostname: exactRouteOverrideExpectation.fixtureHostname,
  };
  let routes = [wildcard];
  let postAttempts = 0;
  const fetchFn = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/workers/domains"))
      return response(200, [
        {
          hostname: exactRouteOverrideExpectation.fixtureHostname,
          service: exactRouteOverrideExpectation.routerService,
          zone_name: exactRouteOverrideExpectation.zoneName,
          zone_id: zoneId,
        },
      ]);
    if (path.endsWith(`/zones/${zoneId}`))
      return response(200, { status: "active" });
    if (path.endsWith("/deployments"))
      return response(200, {
        deployments: [
          {
            strategy: "percentage",
            versions: [{ version_id: versionId, percentage: 100 }],
          },
        ],
      });
    if (path.endsWith(`/versions/${versionId}`))
      return response(200, {
        id: versionId,
        resources: { bindings: bindings() },
      });
    if (path.endsWith("/workers/routes") && (init.method ?? "GET") === "GET")
      return response(200, routes);
    if (path.endsWith("/workers/routes") && init.method === "POST") {
      postAttempts += 1;
      routes = routes.concat({
        id: "created-route",
        pattern: exactRouteOverrideExpectation.routePattern,
        script: exactRouteOverrideExpectation.routerService,
      });
      return response(503, undefined, false);
    }
    if (
      path.endsWith("/workers/routes/created-route") &&
      init.method === "DELETE"
    ) {
      routes = routes.filter((route) => route.id !== "created-route");
      return response(200, {});
    }
    throw new Error("unexpected request");
  };

  try {
    await preflightExactRouteOverride({ config, environment: env, fetchFn });
    await createExactRouteOverride({ config, environment: env, fetchFn });
    expect(postAttempts).toBe(1);
    expect(routes).toHaveLength(2);
    await rollbackExactRouteOverride({ config, environment: env, fetchFn });
    expect(routes).toEqual([wildcard]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
