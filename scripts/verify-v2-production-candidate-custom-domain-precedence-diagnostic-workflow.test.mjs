import { execFileSync } from "node:child_process";

import { expect, test } from "vitest";

test("Custom Domain precedence diagnostic workflow is protected and read-only", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/verify-v2-production-candidate-custom-domain-precedence-diagnostic-workflow.mjs",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  expect(output).toContain("CUSTOM_DOMAIN_PRECEDENCE_DIAGNOSTIC_WORKFLOW=PASS");
  expect(output).toContain(
    "CUSTOM_DOMAIN_PRECEDENCE_DIAGNOSTIC_NO_CANDIDATE_OR_PUBLIC_RESOURCE_MUTATION=PASS",
  );
  expect(output).toContain(
    "CUSTOM_DOMAIN_PRECEDENCE_DIAGNOSTIC_SECRET_SCOPE=PASS",
  );
});
