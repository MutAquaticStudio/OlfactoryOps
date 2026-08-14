import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories = [];
const releaseSha = "de0734df2d2b5b2dd3a2a67ee542131235e75eb7";

function responseFile(response) {
  const directory = mkdtempSync(join(tmpdir(), "oo-router-request-path-"));
  temporaryDirectories.push(directory);
  const file = join(directory, "response.json");
  writeFileSync(file, JSON.stringify(response), "utf8");
  return file;
}

function run(mode, response) {
  return execFileSync(
    process.execPath,
    ["scripts/verify-v2-router-request-path-diagnostic-response.mjs", mode],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ROUTER_REQUEST_PATH_DIAGNOSTIC_RESPONSE_FILE: responseFile(response),
      },
    },
  );
}

function probe(target = "TARGET_ROUTER", overrides = {}) {
  return {
    candidateRouterRequestPathDiagnostic: "COMPLETE",
    probeTarget: target,
    targetStatusClass: "2XX",
    targetRouterHeaderActive: true,
    targetReleaseEnvironmentProduction: true,
    targetReleaseShaMatch: true,
    targetCacheControlPresent: true,
    targetBodyClass: "OTHER",
    ...overrides,
  };
}

afterEach(() => {
  while (temporaryDirectories.length) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("router request-path diagnostic response verifier", () => {
  it("accepts only the exact safe ready and unavailable envelopes", () => {
    expect(
      run("ready", { candidateRouterRequestPathDiagnostic: "READY" }),
    ).toBe("");
    expect(
      run("unavailable", {
        candidateRouterRequestPathDiagnostic: "UNAVAILABLE",
      }),
    ).toBe("");
    expect(() =>
      run("ready", {
        candidateRouterRequestPathDiagnostic: "READY",
        secret: "must-not-appear",
      }),
    ).toThrow();
  });

  it("emits only safe classifications for a healthy active Router", () => {
    const output = run("target", probe());
    expect(output).toContain("ACTUAL_ROUTER_SERVICE_BINDING_PROBE=PASS");
    expect(output).toContain("TARGET_RELEASE_SHA_MATCH=PASS");
    expect(output).not.toContain(releaseSha);
  });

  it("classifies a controlled 404 without printing an unexpected response field", () => {
    const output = run(
      "target",
      probe("TARGET_ROUTER", {
        targetStatusClass: "404",
        targetRouterHeaderActive: false,
        targetReleaseEnvironmentProduction: false,
        targetReleaseShaMatch: false,
        targetBodyClass: "NOT_FOUND",
      }),
    );
    expect(output).toContain("ACTUAL_ROUTER_SERVICE_BINDING_PROBE=FAIL_404");
    expect(output).not.toContain("raw-error");
  });

  it("uses the shadow-specific verdict only for an exact shadow envelope", () => {
    const output = run("shadow", probe("SHADOW_ROUTER"));
    expect(output).toContain("EXACT_RC9_SHADOW_PROBE=PASS");
    expect(() => run("shadow", probe("TARGET_ROUTER"))).toThrow();
  });

  it("rejects extra fields without echoing them", () => {
    try {
      run("target", { ...probe(), rawError: "database-name-or-token" });
      throw new Error("expected verifier failure");
    } catch (error) {
      const output = error.stdout?.toString() ?? "";
      expect(output).toContain("ROUTER_REQUEST_PATH_DIAGNOSTIC_RESPONSE=FAIL");
      expect(output).not.toContain("database-name-or-token");
    }
  });
});
