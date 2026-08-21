import { describe, expect, it, vi } from "vitest";

import { serializeBaseline } from "./v2-first-release-route-policy.mjs";
import { verifyProductionPostcutoverRouteRollback } from "./verify-v2-production-postcutover-route-rollback.mjs";

const releaseSha = "f".repeat(40);
const baseline = {
  schema: "olfactoryops/first-release-route-baseline/v1",
  releaseSha,
  capturedAt: "2026-08-21T00:00:00.000Z",
  zoneId: "zone-fixture",
  routes: [
    {
      key: "api",
      pattern: "api.labofscents.org/*",
      id: "route-api-fixture",
      script: "predecessor-api",
      versionId: "predecessor-api-version",
    },
    {
      key: "tenantRouter",
      pattern: "*.labofscents.org/*",
      id: "route-router-fixture",
      script: "predecessor-router",
      versionId: "predecessor-router-version",
    },
  ],
  absentServices: [
    "olfactoryops-v2-cloud-runtime-production",
    "olfactoryops-v2-api-production",
    "olfactoryops-v2-tenant-router-production",
  ],
};

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function fetchForPostcutover({
  predecessorVersionChanged = false,
  handoffDrift = false,
  customDomainPresent = false,
} = {}) {
  return vi.fn(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/client/v4/zones") {
      return response({
        success: true,
        result: [{ id: "zone-fixture", name: "labofscents.org" }],
      });
    }
    if (path === "/client/v4/zones/zone-fixture/workers/routes") {
      return response({
        success: true,
        result: [
          {
            id: "route-api-fixture",
            pattern: "api.labofscents.org/*",
            script: "olfactoryops-v2-api-production",
          },
          {
            id: "route-router-fixture",
            pattern: "*.labofscents.org/*",
            script: handoffDrift
              ? "unexpected-router-service"
              : "olfactoryops-v2-tenant-router-production",
          },
        ],
      });
    }
    if (path === "/client/v4/accounts/account-fixture/workers/domains") {
      return response({
        success: true,
        result: customDomainPresent
          ? [{ service: "olfactoryops-v2-api-production" }]
          : [],
      });
    }
    if (path.includes("/predecessor-api/deployments")) {
      return response({
        success: true,
        result: {
          deployments: [
            {
              strategy: "percentage",
              versions: [
                { percentage: 100, version_id: "predecessor-api-version" },
              ],
            },
          ],
        },
      });
    }
    if (path.includes("/predecessor-router/deployments")) {
      return response({
        success: true,
        result: {
          deployments: [
            {
              strategy: "percentage",
              versions: [
                {
                  percentage: 100,
                  version_id: predecessorVersionChanged
                    ? "changed-version"
                    : "predecessor-router-version",
                },
              ],
            },
          ],
        },
      });
    }
    throw new Error("unexpected endpoint");
  });
}

function environment() {
  return {
    CLOUDFLARE_ACCOUNT_ID: "account-fixture",
    CLOUDFLARE_API_TOKEN: "token-fixture",
    RELEASE_SHA: releaseSha,
    PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE: serializeBaseline(baseline),
  };
}

describe("post-cutover first-release route rollback readiness", () => {
  it("proves the exact handoff and both predecessor targets without emitting baseline contents", async () => {
    const output = [];
    const fetchImpl = fetchForPostcutover();
    const result = await verifyProductionPostcutoverRouteRollback({
      environment: environment(),
      fetchImpl,
      emit: (line) => output.push(line),
    });

    expect(result).toMatchObject({ pass: true, state: "READY" });
    expect(output).toEqual([
      "POSTCUTOVER_ROUTE_HANDOFF_STATE=PASS",
      "PREVIOUS_API_ROUTE_TARGET_PROVEN=PASS",
      "PREVIOUS_TENANT_ROUTER_ROUTE_TARGET_PROVEN=PASS",
      "FIRST_RELEASE_ROUTE_ROLLBACK_POLICY=PASS",
      "ROLLBACK_TO_EXISTING_ROUTE_TARGET_READY=PASS",
      "ROLLBACK_TO_ABSENCE_READY=PASS",
      "PRODUCTION_ROUTE_ROLLBACK_READY=PASS",
    ]);
    expect(JSON.stringify(output)).not.toContain("predecessor-api");
    expect(JSON.stringify(output)).not.toContain("token-fixture");
    expect(
      fetchImpl.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });

  it("fails closed when either preserved predecessor target changes", async () => {
    const output = [];
    const result = await verifyProductionPostcutoverRouteRollback({
      environment: environment(),
      fetchImpl: fetchForPostcutover({ predecessorVersionChanged: true }),
      emit: (line) => output.push(line),
    });

    expect(result).toMatchObject({
      pass: false,
      state: "PREVIOUS_TARGET_UNPROVEN",
      previousTargets: { api: true, tenantRouter: false },
    });
    expect(output).toContain(
      "PREVIOUS_TENANT_ROUTER_ROUTE_TARGET_PROVEN=UNPROVEN",
    );
    expect(output).toContain(
      "PRODUCTION_ROUTE_ROLLBACK_READY=UNPROVEN",
    );
  });

  it("fails closed before predecessor checks when a handed-off route drifts", async () => {
    const fetchImpl = fetchForPostcutover({ handoffDrift: true });
    const result = await verifyProductionPostcutoverRouteRollback({
      environment: environment(),
      fetchImpl,
      emit: () => {},
    });

    expect(result).toMatchObject({ pass: false, state: "ROUTE_HANDOFF_DRIFT" });
    expect(
      fetchImpl.mock.calls.some(([input]) =>
        String(input).includes("/predecessor-"),
      ),
    ).toBe(false);
  });

  it("refuses a route-restoration cleanup plan when an RC10 Custom Domain remains", async () => {
    const result = await verifyProductionPostcutoverRouteRollback({
      environment: environment(),
      fetchImpl: fetchForPostcutover({ customDomainPresent: true }),
      emit: () => {},
    });

    expect(result).toMatchObject({
      pass: false,
      state: "RC10_CUSTOM_DOMAIN_CLEANUP_UNPROVEN",
      cleanupReady: false,
    });
  });
});
