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
});
