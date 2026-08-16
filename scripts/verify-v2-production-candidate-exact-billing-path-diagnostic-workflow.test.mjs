import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("exact billing path workflow contract", () => {
  it("passes the static no-mutation verifier", () => {
    const output = execFileSync(process.execPath, ["scripts/verify-v2-production-candidate-exact-billing-path-diagnostic-workflow.mjs"], { encoding: "utf8" });
    expect(output).toContain('"EXACT_BILLING_PATH_DIAGNOSTIC_WORKFLOW":"PASS"');
  });
});
