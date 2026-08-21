import { describe, expect, it } from "vitest";
import {
  runBillingRuntimeMatrix,
  safeBillingErrorClass,
} from "./v2-billing-runtime-diagnostic";
import worker from "./v2-billing-runtime-diagnostic";

function prisma(failures: Record<string, unknown> = {}) {
  const query = async (name: string, value: unknown) => {
    if (failures[name]) throw failures[name];
    return value;
  };
  const client: any = {
    subscription: {
      findFirst: (input: any) =>
        query(input.include ? "subscriptionInclude" : "subscriptionPlain", {
          planId: "private-plan-id",
        }),
    },
    plan: { findUnique: () => query("plan", { id: "private-plan-id" }) },
    entitlement: {
      findMany: () =>
        query("entitlements", [{ capability: "private", enabled: true }]),
    },
    usageLimit: {
      findMany: () => query("usage", [{ key: "private", value: 7 }]),
    },
    $transaction: async (callback: any) => callback(client),
    $disconnect: async () => undefined,
  };
  return client;
}

describe("v2 billing runtime diagnostic", () => {
  it("fails closed before loading Prisma for an unauthorized request", async () => {
    const response = await worker.fetch(
      new Request("https://temporary.workers.dev/probe", { method: "POST" }),
      {
        HYPERDRIVE: { connectionString: "postgresql://private" },
        BILLING_RUNTIME_DIAGNOSTIC_TOKEN: "private-token",
      },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      billingRuntimeDiagnostic: "NOT_FOUND",
    });
  });

  it("rejects a non-record probe payload before loading Prisma", async () => {
    const response = await worker.fetch(
      new Request("https://temporary.workers.dev/probe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-olfactoryops-billing-runtime-diagnostic": "private-token",
        },
        body: "[]",
      }),
      {
        HYPERDRIVE: { connectionString: "postgresql://private" },
        BILLING_RUNTIME_DIAGNOSTIC_TOKEN: "private-token",
      },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      billingRuntimeDiagnostic: "NOT_FOUND",
    });
  });

  it("runs the exact include query and every independent read without returning tenant data", async () => {
    const matrix = await runBillingRuntimeMatrix(
      prisma(),
      "private-organization-id",
    );
    expect(matrix.subscriptionWithPlanInclude.status).toBe("PASS");
    expect(matrix.subscriptionPlain.status).toBe("PASS");
    expect(matrix.planDirect.status).toBe("PASS");
    expect(matrix.entitlements.status).toBe("PASS");
    expect(matrix.usageLimits.status).toBe("PASS");
    expect(matrix.manualProjection.status).toBe("PASS");
    expect(matrix.serialization.status).toBe("PASS");
    expect(matrix.sequentialTransaction.status).toBe("PASS");
    expect(JSON.stringify(matrix)).not.toContain("private");
  });

  it("keeps relation include failure separate from independently passing probes", async () => {
    const matrix = await runBillingRuntimeMatrix(
      prisma({ subscriptionInclude: { code: "P2010", message: "private" } }),
      "private-organization-id",
    );
    expect(matrix.subscriptionWithPlanInclude).toEqual({
      status: "FAIL",
      errorClass: "PRISMA_Pxxxx",
    });
    expect(matrix.subscriptionPlain.status).toBe("PASS");
    expect(matrix.sequentialTransaction.status).toBe("PASS");
  });

  it("classifies only structured database error codes", () => {
    expect(safeBillingErrorClass({ code: "42501", message: "private" })).toBe(
      "POSTGRES_PERMISSION_DENIED",
    );
    expect(safeBillingErrorClass({ code: "08006" })).toBe(
      "POSTGRES_CONNECTION_FAILED",
    );
    expect(safeBillingErrorClass({ message: "private" })).toBe("UNCLASSIFIED");
  });
});
