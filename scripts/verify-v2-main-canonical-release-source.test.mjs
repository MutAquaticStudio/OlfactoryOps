import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

test("production workflows use immutable tags instead of temporary source branches", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/verify-v2-main-canonical-release-source.mjs"],
    { encoding: "utf8" },
  );

  expect(output).toContain("TEMP_RELEASE_BRANCH_RUNTIME_REFERENCES=0");
  expect(output).toContain("IMMUTABLE_RELEASE_TAG_CONTRACTS=PASS");
  expect(output).toContain("PORTABLE_PACKAGE_LOCK_CONTRACT=PASS");
});
