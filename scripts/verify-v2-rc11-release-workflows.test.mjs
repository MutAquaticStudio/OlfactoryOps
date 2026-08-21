import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));

it("RC11 release workflows enforce their immutable upgrade contract", () => {
  const output = execFileSync(process.execPath, [join(scripts, "verify-v2-rc11-release-workflows.mjs")], {
    encoding: "utf8",
  });
  expect(output).toMatch(/^RC11_RELEASE_WORKFLOW_CONTRACT=PASS$/m);
});
