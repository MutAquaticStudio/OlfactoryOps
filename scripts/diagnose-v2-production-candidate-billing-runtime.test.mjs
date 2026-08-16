import { describe, expect, it } from "vitest";
import {
  classifyBillingRuntime,
  readBillingRuntimeMatrix,
  runBillingRuntimeDiagnostic,
} from "./diagnose-v2-production-candidate-billing-runtime.mjs";

const environment = {
  RELEASE_SHA: "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  CONFIRM_DIAGNOSTIC: "DIAGNOSE_RC9_BILLING_RUNTIME",
  V2_PRODUCTION_CANDIDATE_API_ORIGIN: "https://api-next.labofscents.org",
  V2_PRODUCTION_CANDIDATE_TENANT_URL:
    "https://rc9-release-31736285494-469ca8942a.next.labofscents.org",
  PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL:
    "postgresql://private.invalid/private",
  BILLING_RUNTIME_DIAGNOSTIC_URL: "https://private.workers.dev",
  BILLING_RUNTIME_DIAGNOSTIC_TOKEN: "x".repeat(64),
};

function body(statuses = {}) {
  const probe = (name) => ({
    status: statuses[name] ?? "PASS",
    errorClass: "NONE",
  });
  return {
    billingRuntimeDiagnostic: "MATRIX",
    subscriptionWithPlanInclude: probe("include"),
    subscriptionPlain: probe("plain"),
    planDirect: probe("plan"),
    entitlements: probe("entitlements"),
    usageLimits: probe("usage"),
    manualProjection: probe("projection"),
    serialization: probe("serialization"),
    sequentialTransaction: probe("transaction"),
    failureSafeClass: "NONE",
  };
}

function adapters(matrix = body(), cleanup = async () => undefined) {
  return {
    activeVersion: async () => ({
      pass: true,
      versionId: "9a926029-0294-4903-9545-08baef949fd6",
    }),
    signup: async () => ({
      status: 200,
      fixture: {
        userId: "user-private",
        organizationId: "organization-private",
        hostname: "host-private",
      },
    }),
    fixtureReady: async () => true,
    probe: async () => ({ status: 200, body: matrix }),
    cleanupFixture: cleanup,
  };
}

describe("billing runtime differential orchestration", () => {
  it("classifies an include-only failure as the sole RC9 source-defect case", () => {
    const matrix = readBillingRuntimeMatrix(body({ include: "FAIL" }));
    expect(classifyBillingRuntime({ matrix, versionStable: "YES" })).toEqual({
      rootCause: "PRISMA_RELATION_INCLUDE_RUNTIME_INCOMPATIBILITY",
      sourceDefect: "YES",
      rc10Required: "YES",
    });
  });

  it("keeps a plain subscription failure unproven", () => {
    const matrix = readBillingRuntimeMatrix(body({ plain: "FAIL" }));
    expect(
      classifyBillingRuntime({ matrix, versionStable: "YES" }).rootCause,
    ).toBe("SUBSCRIPTION_PRISMA_RUNTIME_PATH");
  });

  it("classifies all isolated probes passing as candidate API specific", () => {
    expect(
      classifyBillingRuntime({
        matrix: readBillingRuntimeMatrix(body()),
        versionStable: "YES",
      }),
    ).toMatchObject({
      rootCause: "CANDIDATE_API_SPECIFIC_RUNTIME_DISCREPANCY",
      sourceDefect: "NO",
    });
  });

  it("always archives its one generated fixture without leaking fixture values", async () => {
    const records = [];
    let cleaned = false;
    await runBillingRuntimeDiagnostic({
      adapters: adapters(body(), async () => {
        cleaned = true;
      }),
      environment,
      emitRecord: (record) => records.push(record),
    });
    expect(cleaned).toBe(true);
    const output = JSON.stringify(records);
    expect(output).toContain("BILLING_RUNTIME_DIAGNOSTIC_FIXTURE_CLEANUP");
    expect(output).not.toContain("organization-private");
    expect(output).not.toContain("private.invalid");
  });

  it("still cleans up when the Worker matrix cannot be safely decoded", async () => {
    let cleaned = false;
    await expect(
      runBillingRuntimeDiagnostic({
        adapters: adapters({ invalid: true }, async () => {
          cleaned = true;
        }),
        environment,
        emitRecord: () => undefined,
      }),
    ).rejects.toThrow("BILLING_MATRIX_NOT_RECEIVED");
    expect(cleaned).toBe(true);
  });
});
