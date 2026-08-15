import { execFileSync } from "node:child_process";

import { expect, test } from "vitest";

test("candidate browser runtime workflow remains exact and read-only", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/verify-v2-production-candidate-browser-runtime-diagnostic-workflow.mjs",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  expect(output).toContain(
    "CANDIDATE_BROWSER_RUNTIME_DIAGNOSTIC_WORKFLOW=PASS",
  );
  expect(output).toContain(
    "CANDIDATE_BROWSER_RUNTIME_DIAGNOSTIC_READ_ONLY=PASS",
  );
});
