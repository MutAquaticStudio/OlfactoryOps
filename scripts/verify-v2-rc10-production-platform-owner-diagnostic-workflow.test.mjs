import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

test("Platform Owner diagnostic workflow is protected and read-only", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/verify-v2-rc10-production-platform-owner-diagnostic-workflow.mjs",
    ],
    { encoding: "utf8" },
  );
  expect(output).toContain("PLATFORM_OWNER_DIAGNOSTIC_WORKFLOW=PASS");
  expect(output).toContain("PLATFORM_OWNER_DIAGNOSTIC_READ_ONLY=PASS");
});
