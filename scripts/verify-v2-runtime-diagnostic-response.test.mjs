import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirectories = [];
const booleanKeys = [
  "databaseProbeCompleted",
  "hyperdriveConnectionReachable",
  "hyperdriveProductionDatabaseMatch",
  "runtimeCurrentUserMatchesExpected",
  "runtimeSessionUserMatchesExpected",
  "sessionContextProbeCompleted",
  "runtimeRequestHostnameContextPresent",
  "runtimeOrganizationContextPresent",
  "runtimeUserContextPresent",
  "rlsMetadataProbeCompleted",
  "workspaceHostnamesRls",
  "workspaceHostnamesForceRls",
  "organizationsRls",
  "organizationsForceRls",
  "resolverMetadataProbeCompleted",
  "resolverExists",
  "resolverSecurityDefiner",
  "functionOwnerOwnsWorkspaceHostnames",
  "functionOwnerOwnsOrganizations",
  "functionOwnerIsSuperuser",
  "functionOwnerBypassRls",
  "functionOwnerForceRlsConstrained",
  "resolverPrivilegeProbeCompleted",
  "runtimeExecuteGranted",
  "directHostnameProbeCompleted",
  "runtimeDirectHostnameVisible",
  "directOrganizationProbeCompleted",
  "runtimeDirectOrganizationVisible",
  "resolverInvocationProbeCompleted",
  "runtimeResolverResult",
  "runtimeResolverOrganizationMatch",
];

function responseFile(body) {
  const directory = mkdtempSync(
    join(tmpdir(), "olfactoryops-runtime-diagnostic-"),
  );
  tempDirectories.push(directory);
  const file = join(directory, "response.json");
  writeFileSync(file, JSON.stringify(body), "utf8");
  return file;
}

function run(mode, body) {
  return execFileSync(
    process.execPath,
    ["scripts/verify-v2-runtime-diagnostic-response.mjs", mode],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        RUNTIME_DIAGNOSTIC_RESPONSE_FILE: responseFile(body),
      },
    },
  );
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    rmSync(tempDirectories.pop(), { recursive: true, force: true });
  }
});

describe("runtime diagnostic response verifier", () => {
  it("accepts only the exact READY envelope", () => {
    expect(run("ready", { candidateRuntimeDiagnostic: "READY" })).toBe("");
    expect(() =>
      run("ready", {
        candidateRuntimeDiagnostic: "READY",
        internal: "not-allowed",
      }),
    ).toThrow();
  });

  it("accepts only the exact UNAVAILABLE envelope", () => {
    expect(
      run("unavailable", { candidateRuntimeDiagnostic: "UNAVAILABLE" }),
    ).toBe("");
    expect(() =>
      run("unavailable", {
        candidateRuntimeDiagnostic: "UNAVAILABLE",
        message: "sensitive failure",
      }),
    ).toThrow();
  });

  it("emits only the safe boolean matrix and classifications", () => {
    const matrix = Object.fromEntries(booleanKeys.map((key) => [key, true]));
    const output = run("matrix", {
      candidateRuntimeDiagnostic: "COMPLETE",
      ...matrix,
    });
    expect(output).toContain("DIAGNOSTIC_SAFE_BOOLEAN_MATRIX=PASS");
    expect(output).toContain("RUNTIME_DIAGNOSTIC_EXECUTION=PASS");
    expect(output).toContain("ACTUAL_HYPERDRIVE_RUNTIME_RESOLVER=PASS");
    expect(output).not.toContain("sensitive");
  });

  it("rejects an unexpected matrix field without emitting the raw response", () => {
    const matrix = Object.fromEntries(booleanKeys.map((key) => [key, true]));
    try {
      run("matrix", {
        candidateRuntimeDiagnostic: "COMPLETE",
        ...matrix,
        error: "database-name-or-secret",
      });
      throw new Error("expected the matrix verifier to fail");
    } catch (error) {
      const output = error.stdout?.toString() ?? "";
      expect(output).toContain("DIAGNOSTIC_SAFE_BOOLEAN_MATRIX=FAIL");
      expect(output).not.toContain("database-name-or-secret");
    }
  });
});
