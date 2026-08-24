import { execFileSync } from "node:child_process";

import { expect, test } from "vitest";

test("RC12 stale-route cleanup remains protected, exact, bounded, and candidate-only", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/verify-v2-rc12-candidate-stale-route-cleanup-workflow.mjs"],
    { encoding: "utf8" },
  );
  expect(output).toContain("RC12_STALE_ROUTE_CLEANUP_WORKFLOW=PASS");
  expect(output).toContain("RC12_STALE_ROUTE_CANDIDATE_ONLY=PASS");
  expect(output).toContain("RC12_STALE_ROUTE_MAX_DELETION_ONE=PASS");
  expect(output).toContain("RC12_STALE_ROUTE_LIVE_PRESERVATION=PASS");
});
