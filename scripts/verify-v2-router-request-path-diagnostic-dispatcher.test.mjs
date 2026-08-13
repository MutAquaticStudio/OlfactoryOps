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

  it("fails closed before reusing temporary Worker names or classifying an unconfirmed public probe", () => {
    const workflow = readFileSync(
      ".github/workflows/v2-production-candidate-router-request-path-diagnostic.yml",
      "utf8",
    );
    expect(workflow).toContain("TEMPORARY_DIAGNOSTIC_NAME_PREFLIGHT=PASS");
    expect(workflow).toContain("CREATED_SERVICE_DIAGNOSTIC_CALLER=true");
    expect(workflow).toContain("CREATED_SERVICE_DIAGNOSTIC_SHADOW=true");
    expect(workflow).toContain("TAIL_PUBLIC_PROBE_CONFIRMED=NO");
    expect(workflow).toContain("tail_evidence=PUBLIC_UNCONFIRMED");
    expect(workflow).toContain("id: phase_b_version");
    expect(workflow).toContain(
      "classify-v2-router-request-path-diagnostic.mjs",
    );
    expect(workflow).toContain("ROUTER_REQUEST_PATH_ACTIVE_VERSION_STABLE");
    expect(workflow).toContain("chmod 700 .qa");
    expect(workflow).not.toMatch(/^\s*chmod\s+600\s+\.qa\s*$/m);
    expect(workflow).not.toContain("public_response=");
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
        V2_REQUEST_PATH_DIAGNOSTIC_CALLER_WORKER_NAME:
          "oo-v2-router-service-diag-31750000000",
        V2_REQUEST_PATH_DIAGNOSTIC_CONFIG: output,
      }),
    ).toContain("ROUTER_REQUEST_PATH_DIAGNOSTIC_CONFIG=PASS");
    const rendered = readFileSync(output, "utf8");
    expect(rendered).toContain("workers_dev = true");
    expect(rendered).toContain(
      'name = "oo-v2-router-service-diag-31750000000"',
    );
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
        V2_REQUEST_PATH_DIAGNOSTIC_CALLER_WORKER_NAME:
          "oo-v2-router-service-diag-31750000000",
        V2_REQUEST_PATH_DIAGNOSTIC_CONFIG: output,
      }),
    ).toThrow();
  });
});
