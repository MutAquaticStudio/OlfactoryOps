import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories = [];
const version = "7640f2d6-0a0e-4fb8-81ed-22f6eb9a56bc";

function run(body) {
  const directory = mkdtempSync(join(tmpdir(), "oo-router-active-deployment-"));
  directories.push(directory);
  const file = join(directory, "deployment.json");
  writeFileSync(file, JSON.stringify(body), "utf8");
  return execFileSync(
    process.execPath,
    ["scripts/verify-v2-router-request-path-active-deployment.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ROUTER_ACTIVE_DEPLOYMENT_FILE: file,
        ROUTER_EXPECTED_VERSION: version,
      },
    },
  );
}

afterEach(() => {
  while (directories.length)
    rmSync(directories.pop(), { recursive: true, force: true });
});

describe("router request-path active deployment verifier", () => {
  it("accepts only a 100 percent exact active version", () => {
    expect(
      run({
        success: true,
        result: {
          deployments: [
            { versions: [{ version_id: version, percentage: 100 }] },
          ],
        },
      }),
    ).toContain("ACTIVE_ROUTER_VERSION_MATCH=PASS");
  });

  it("rejects a stale or split deployment without echoing it", () => {
    expect(() =>
      run({
        success: true,
        result: {
          deployments: [
            {
              versions: [
                { version_id: version, percentage: 50 },
                { version_id: "stale-version-not-printed", percentage: 50 },
              ],
            },
          ],
        },
      }),
    ).toThrow();
  });
});
