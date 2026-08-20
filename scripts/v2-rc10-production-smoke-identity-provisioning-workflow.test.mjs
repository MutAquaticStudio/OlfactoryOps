import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

test("dedicated RC10 smoke identity provisioning is protected and tightly bounded", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/verify-v2-rc10-production-smoke-identity-provisioning-workflow.mjs",
    ],
    { encoding: "utf8" },
  );

  expect(output).toContain(
    "PRODUCTION_SMOKE_IDENTITY_PROVISIONING_WORKFLOW=PASS",
  );
  expect(output).toContain(
    "PRODUCTION_SMOKE_IDENTITY_PROVISIONING_BOUNDARY=PASS",
  );
});
