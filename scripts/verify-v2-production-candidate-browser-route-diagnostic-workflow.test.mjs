import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("browser route diagnostic workflow is exact, protected, and read-only", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/verify-v2-production-candidate-browser-route-diagnostic-workflow.mjs",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  expect(output).toContain("CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_WORKFLOW=PASS");
  expect(output).toContain("CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_READ_ONLY=PASS");
});

test("browser route diagnostic does not weaken the candidate smoke workflow", () => {
  const smoke = readFileSync(
    ".github/workflows/v2-production-candidate-dispatch.yml",
    "utf8",
  );
  expect(smoke).toContain("smoke-candidate:");
  expect(smoke).toContain("test:qa:v2-production-candidate-browser");
  expect(smoke).toContain("test:qa:v2-production-candidate-acceptance");
});
