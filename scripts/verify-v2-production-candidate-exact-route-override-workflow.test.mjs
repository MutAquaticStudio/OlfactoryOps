import { execFileSync } from "node:child_process";

import { expect, test } from "vitest";

test("exact candidate route override workflow remains scoped and rollback-first", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/verify-v2-production-candidate-exact-route-override-workflow.mjs",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  expect(output).toContain("EXACT_CANDIDATE_ROUTE_OVERRIDE_WORKFLOW=PASS");
  expect(output).toContain(
    "EXACT_CANDIDATE_ROUTE_OVERRIDE_CANDIDATE_ONLY=PASS",
  );
  expect(output).toContain("EXACT_CANDIDATE_ROUTE_OVERRIDE_ROLLBACK=PASS");
});
