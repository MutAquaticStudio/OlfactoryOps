import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

test("candidate Custom Domain reset workflow is exact, protected, and candidate-only", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/verify-v2-production-candidate-custom-domain-reset-workflow.mjs"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  expect(output).toContain("CANDIDATE_CUSTOM_DOMAIN_RESET_WORKFLOW=PASS");
  expect(output).toContain("CANDIDATE_CUSTOM_DOMAIN_RESET_CANDIDATE_ONLY=PASS");
  expect(output).toContain("CANDIDATE_CUSTOM_DOMAIN_RESET_SECRET_SCOPE=PASS");
});

test("candidate Custom Domain reset Bash steps have no syntax regression", () => {
  if (process.platform === "win32") return;
  const workflow = readFileSync(
    ".github/workflows/v2-production-candidate-custom-domain-reset.yml",
    "utf8",
  );
  const runBlocks = [
    ...workflow.matchAll(/^        run: \|\r?\n((?:          .*\r?\n?)*)/gm),
  ].map((match) =>
    match[1]
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => line.slice(10))
      .join("\n"),
  );

  expect(runBlocks.length).toBeGreaterThan(0);
  for (const block of runBlocks)
    expect(() => execFileSync("bash", ["-n", "-c", block])).not.toThrow();
});
