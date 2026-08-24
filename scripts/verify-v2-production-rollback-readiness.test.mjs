import { describe, expect, it, vi } from "vitest";

import {
  inspectWorkerRollback,
  verifyProductionRollbackReadiness,
} from "./verify-v2-production-rollback-readiness.mjs";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function deployment(versions) {
  return response({
    success: true,
    result: { deployments: [{ versions }] },
  });
}

function pagesResult(result) {
  return response({
    success: true,
    result,
    result_info: { total_pages: 1 },
  });
}

function productionPagesDeployment() {
  return {
    id: "pages-deployment-fixture",
    project_name: "olfactoryops-v2-production",
    environment: "production",
    is_skipped: false,
    latest_stage: { status: "success" },
    deployment_trigger: { metadata: { branch: "production" } },
    url: "https://fixture.olfactoryops-v2-production.pages.dev",
  };
}

describe("production rollback readiness", () => {
  it("proves exactly one active worker rollback version without returning its id", async () => {
    const result = await inspectWorkerRollback({
      account: "account-fixture",
      service: "service-fixture",
      token: "worker-token-fixture",
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          deployment([{ percentage: 100, version_id: "version-fixture" }]),
        ),
    });

    expect(result).toMatchObject({
      ready: true,
      state: "READY",
      httpStatus: "200",
      cfErrorCode: "NONE",
    });
    expect(JSON.stringify(result)).not.toContain("version-fixture");
  });

  it("classifies an empty deployment list without treating it as rollback-ready", async () => {
    const result = await inspectWorkerRollback({
      account: "account-fixture",
      service: "service-fixture",
      token: "worker-token-fixture",
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          response({ success: true, result: { deployments: [] } }),
        ),
    });

    expect(result).toMatchObject({
      ready: false,
      state: "NO_DEPLOYMENT",
      httpStatus: "200",
      cfErrorCode: "NONE",
    });
  });

  it("emits only safe API evidence for provider failures", async () => {
    const result = await inspectWorkerRollback({
      account: "account-fixture",
      service: "service-fixture",
      token: "worker-token-fixture",
      fetchImpl: vi.fn().mockResolvedValue(
        response(
          {
            success: false,
            errors: [{ code: 10000, message: "provider-secret-message" }],
          },
          403,
        ),
      ),
    });

    expect(result).toEqual({
      ready: false,
      state: "API_FAILURE",
      httpStatus: "403",
      cfErrorCode: "10000",
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret-message");
    expect(JSON.stringify(result)).not.toContain("worker-token-fixture");
  });

  it("keeps split active traffic fail-closed", async () => {
    const result = await inspectWorkerRollback({
      account: "account-fixture",
      service: "service-fixture",
      token: "worker-token-fixture",
      fetchImpl: vi.fn().mockResolvedValue(
        deployment([
          { percentage: 50, version_id: "version-one" },
          { percentage: 50, version_id: "version-two" },
        ]),
      ),
    });

    expect(result).toMatchObject({
      ready: false,
      state: "NO_SINGLE_ACTIVE_VERSION",
    });
  });

  it("does not convert incomplete Worker evidence into a global pass", async () => {
    const output = [];
    const result = await verifyProductionRollbackReadiness({
      environment: { PRODUCTION_PAGES_PROJECT: "wrong-project" },
      emit: (line) => output.push(line),
    });

    expect(result.pass).toBe(false);
    expect(output).toEqual(
      expect.arrayContaining([
        "ROLLBACK_CLOUDRUNTIME_DEPLOYMENT_STATE=CREDENTIAL_UNAVAILABLE",
        "ROLLBACK_API_DEPLOYMENT_STATE=CREDENTIAL_UNAVAILABLE",
        "ROLLBACK_ROUTER_DEPLOYMENT_STATE=CREDENTIAL_UNAVAILABLE",
        "PRODUCTION_ROLLBACK_READY=UNPROVEN",
      ]),
    );
  });

  it("preserves the explicit live-upgrade Pages policy in rollback proof", async () => {
    const canonical = productionPagesDeployment();
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes("/workers/scripts/")) {
        return deployment([
          { percentage: 100, version_id: "worker-version-fixture" },
        ]);
      }
      if (url.endsWith("/pages/projects")) {
        return pagesResult([{ name: "olfactoryops-v2-production" }]);
      }
      if (url.endsWith("/pages/projects/olfactoryops-v2-production")) {
        return response({
          success: true,
          result: {
            name: "olfactoryops-v2-production",
            production_branch: "production",
            canonical_deployment: canonical,
          },
        });
      }
      if (url.endsWith("/domains")) {
        return pagesResult([
          { name: "labofscents.org", status: "active" },
        ]);
      }
      if (url.includes("/deployments?env=production")) {
        return pagesResult([canonical]);
      }
      if (url.endsWith("/deployments/pages-deployment-fixture")) {
        return response({ success: true, result: canonical });
      }
      throw new Error("UNEXPECTED_TEST_REQUEST");
    });
    const output = [];

    const result = await verifyProductionRollbackReadiness({
      environment: {
        CLOUDFLARE_ACCOUNT_ID: "account-fixture",
        CLOUDFLARE_API_TOKEN: "worker-token-fixture",
        CLOUDFLARE_PAGES_READ_TOKEN: "pages-token-fixture",
        PRODUCTION_PAGES_PROJECT: "olfactoryops-v2-production",
        PRODUCTION_PAGES_BASELINE_POLICY: "EXISTING_LIVE_UPGRADE",
      },
      fetchImpl,
      emit: (line) => output.push(line),
    });

    expect(result.pass).toBe(true);
    expect(result.pagesResult).toEqual({
      ready: true,
      baseline: "EXISTING_DEPLOYMENT",
    });
    expect(output).toEqual(
      expect.arrayContaining([
        "PRODUCTION_PAGES_BASELINE_POLICY=EXISTING_LIVE_UPGRADE",
        "PRODUCTION_PAGES_PUBLIC_DOMAIN_BASELINE=EXACT_APEX_ACTIVE",
        "ROLLBACK_PAGES_READY=PASS",
        "PRODUCTION_ROLLBACK_READY=PASS",
      ]),
    );
    expect(output.join("\n")).not.toContain("pages-token-fixture");
    expect(output.join("\n")).not.toContain("worker-version-fixture");
  });
});
