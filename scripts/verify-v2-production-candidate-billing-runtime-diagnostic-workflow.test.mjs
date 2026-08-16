import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("billing runtime diagnostic workflow contract", () => {
  it("remains protected, route-free, and temporary-worker scoped", () => {
    const output = execFileSync(
      process.execPath,
      [
        "scripts/verify-v2-production-candidate-billing-runtime-diagnostic-workflow.mjs",
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(output)).toEqual({
      BILLING_RUNTIME_DIAGNOSTIC_WORKFLOW: "PASS",
      BILLING_RUNTIME_DIAGNOSTIC_NO_CANDIDATE_API_DEPLOYMENT_OR_ROUTE_MUTATION:
        "PASS",
    });
  });
});
