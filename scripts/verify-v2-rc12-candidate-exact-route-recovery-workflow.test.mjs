import { execFileSync } from "node:child_process";

import { expect, test } from "vitest";

test("RC12 candidate route recovery remains protected, exact, bounded, and reversible", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/verify-v2-rc12-candidate-exact-route-recovery-workflow.mjs"],
    { encoding: "utf8" },
  );
  expect(output).toContain(
    "RC12_CANDIDATE_EXACT_ROUTE_RECOVERY_WORKFLOW=PASS",
  );
  expect(output).toContain("RC12_CANDIDATE_EXACT_ROUTE_CREATE_ONCE=PASS");
  expect(output).toContain("RC12_CANDIDATE_EXACT_ROUTE_ROLLBACK=PASS");
  expect(output).toContain(
    "RC12_CANDIDATE_EXACT_ROUTE_LIVE_PRESERVATION=PASS",
  );
});
