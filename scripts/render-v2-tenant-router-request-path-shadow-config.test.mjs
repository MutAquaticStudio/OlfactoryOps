import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories = [];
const releaseSha = "de0734df2d2b5b2dd3a2a67ee542131235e75eb7";
const hyperdriveId = "b415b7572d9f45058ebb4ec4166b8739";
const shadowWorkerName = "oo-v2-router-rc9-shadow-31750000000";

function rc9WorktreeFixture() {
  const worktree = mkdtempSync(join(tmpdir(), "oo-exact-rc9-shadow-"));
  temporaryDirectories.push(worktree);
  mkdirSync(join(worktree, "worker"));
  writeFileSync(
    join(worktree, "package.json"),
    JSON.stringify({ dependencies: { pg: "^8.13.0" } }),
  );
  writeFileSync(
    join(worktree, "package-lock.json"),
    '{"packages":{"node_modules/wrangler":{"version":"4.118.0"}}}',
  );
  writeFileSync(join(worktree, "worker", "v2-tenant-router.ts"), "export {}\n");
  return worktree;
}

function run(worktree, output) {
  return execFileSync(
    process.execPath,
    ["scripts/render-v2-tenant-router-request-path-shadow-config.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        V2_REQUEST_PATH_SHADOW_RELEASE_SHA: releaseSha,
        V2_REQUEST_PATH_SHADOW_WORKTREE: worktree,
        V2_REQUEST_PATH_SHADOW_HYPERDRIVE_ID: hyperdriveId,
        V2_REQUEST_PATH_SHADOW_WORKER_NAME: shadowWorkerName,
        V2_REQUEST_PATH_SHADOW_CONFIG: output,
      },
    },
  );
}

afterEach(() => {
  while (temporaryDirectories.length)
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
});

describe("exact RC9 shadow Router config renderer", () => {
  it("uses only the RC9 lock contract and service-bound-only configuration", () => {
    const worktree = rc9WorktreeFixture();
    const output = join(worktree, ".ops", "shadow.toml");
    expect(run(worktree, output)).toContain("EXACT_RC9_SHADOW_CONFIG=PASS");
    const rendered = readFileSync(output, "utf8");
    expect(rendered).toContain(`name = "${shadowWorkerName}"`);
    expect(rendered).toContain("workers_dev = false");
    expect(rendered).toContain(`id = "${hyperdriveId}"`);
    expect(rendered).toContain(`RELEASE_GIT_SHA = "${releaseSha}"`);
    expect(rendered).not.toMatch(
      /(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/,
    );
  });

  it("rejects a non-RC9 lockfile before a shadow Worker can be deployed", () => {
    const worktree = rc9WorktreeFixture();
    writeFileSync(join(worktree, "package-lock.json"), "{}", "utf8");
    expect(() =>
      run(worktree, join(worktree, ".ops", "shadow.toml")),
    ).toThrow();
  });
});
