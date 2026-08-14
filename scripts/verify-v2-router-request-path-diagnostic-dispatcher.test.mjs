import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories = [];

function runRenderer(environment) {
  return execFileSync(
    process.execPath,
    ["scripts/render-v2-tenant-router-request-path-diagnostic-config.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...environment },
    },
  );
}

afterEach(() => {
  while (temporaryDirectories.length)
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
});

describe("RC9 router request-path diagnostic dispatcher", () => {
  it("passes its checked-in, operations-only workflow contract", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/verify-v2-router-request-path-diagnostic-dispatcher.mjs"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(output).toContain("ROUTER_REQUEST_PATH_DIAGNOSTIC_CONTRACT=PASS");
    expect(output).toContain("ROUTER_REQUEST_PATH_DIAGNOSTIC_ROUTE_FREE=PASS");
    expect(output).toContain("ROUTER_REQUEST_PATH_DIAGNOSTIC_CLEANUP=PASS");
  });

  it("renders a route-free caller binding only to the active candidate Router", () => {
    const directory = mkdtempSync(join(tmpdir(), "oo-router-request-render-"));
    temporaryDirectories.push(directory);
    const output = join(directory, "caller.toml");
    expect(
      runRenderer({
        V2_REQUEST_PATH_DIAGNOSTIC_TARGET_RELEASE_SHA:
          "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
        V2_REQUEST_PATH_DIAGNOSTIC_FIXTURE_HOSTNAME:
          "rc9-release-31736285494-469ca8942a.next.labofscents.org",
        V2_REQUEST_PATH_DIAGNOSTIC_CORRELATION_NONCE: "a".repeat(32),
        V2_REQUEST_PATH_DIAGNOSTIC_PROBE_TARGET: "TARGET_ROUTER",
        V2_REQUEST_PATH_DIAGNOSTIC_PROBE_QUERY_KEY: "oo_service_diag",
        V2_REQUEST_PATH_DIAGNOSTIC_CONFIG: output,
      }),
    ).toContain("ROUTER_REQUEST_PATH_DIAGNOSTIC_CONFIG=PASS");
    const rendered = readFileSync(output, "utf8");
    expect(rendered).toContain("workers_dev = true");
    expect(rendered).toContain('binding = "TARGET_ROUTER"');
    expect(rendered).not.toMatch(
      /(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/,
    );
  });

  it("requires the shadow binding only when the shadow probe is explicitly selected", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "oo-router-request-render-shadow-"),
    );
    temporaryDirectories.push(directory);
    const output = join(directory, "caller.toml");
    expect(() =>
      runRenderer({
        V2_REQUEST_PATH_DIAGNOSTIC_TARGET_RELEASE_SHA:
          "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
        V2_REQUEST_PATH_DIAGNOSTIC_FIXTURE_HOSTNAME:
          "rc9-release-31736285494-469ca8942a.next.labofscents.org",
        V2_REQUEST_PATH_DIAGNOSTIC_CORRELATION_NONCE: "a".repeat(32),
        V2_REQUEST_PATH_DIAGNOSTIC_PROBE_TARGET: "SHADOW_ROUTER",
        V2_REQUEST_PATH_DIAGNOSTIC_PROBE_QUERY_KEY: "oo_shadow_diag",
        V2_REQUEST_PATH_DIAGNOSTIC_CONFIG: output,
      }),
    ).toThrow();
  });
});
