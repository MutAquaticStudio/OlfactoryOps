import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("generated-login diagnostic workflow contract", () => {
  it("is protected, dispatch-only, and carries no remediation command", () => {
    const output = execFileSync(
      process.execPath,
      [
        "scripts/verify-v2-production-candidate-generated-login-diagnostic-workflow.mjs",
      ],
      { encoding: "utf8" },
    );
    expect(output).toContain("GENERATED_LOGIN_DIAGNOSTIC_WORKFLOW");
    expect(output).toContain("GENERATED_LOGIN_DIAGNOSTIC_NO_REMEDIATION");
  });
});
