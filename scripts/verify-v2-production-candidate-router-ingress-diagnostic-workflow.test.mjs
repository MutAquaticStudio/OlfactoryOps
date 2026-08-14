import { execFileSync } from "node:child_process";

import { expect, test } from "vitest";

test("router ingress diagnostic workflow is protected and read-only", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/verify-v2-production-candidate-router-ingress-diagnostic-workflow.mjs",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  expect(output).toContain("ROUTER_INGRESS_DIAGNOSTIC_WORKFLOW=PASS");
  expect(output).toContain(
    "ROUTER_INGRESS_DIAGNOSTIC_NO_CANDIDATE_OR_PUBLIC_RESOURCE_MUTATION=PASS",
  );
  expect(output).toContain("ROUTER_INGRESS_DIAGNOSTIC_SECRET_SCOPE=PASS");
});
