import { describe, expect, it } from "vitest";
import {
  createCandidateRuntimeDiagnostic,
  inspectCandidateRuntime,
  normalizedDiagnosticFixtureHostname,
  resolverHealth,
  runtimeDiagnosticExecutionPass,
  type RuntimeDiagnosticProbeExecutor,
  type V2TenantRouterRuntimeDiagnosticEnv,
} from "./v2-tenant-router-runtime-diagnostic.js";

const targetReleaseSha = "5985834a0e14728c81c8c028a72122ded544bd6b";
const expectedDatabaseSha =
  "a942b37ccfaf5a813b1432caa209a43b9d144e47ad0de1549c289c253e556cd5";
const fixtureHostname = "rc2-release-315960213001.next.labofscents.org";

const env: V2TenantRouterRuntimeDiagnosticEnv = {
  HYPERDRIVE: {} as Hyperdrive,
  CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN: "test-only-secret",
  DIAGNOSTIC_FIXTURE_HOSTNAME: fixtureHostname,
  TARGET_RELEASE_SHA: targetReleaseSha,
  V2_EXPECTED_DATABASE_NAME_SHA: expectedDatabaseSha,
  V2_RUNTIME_DB_ROLE: "hyperdrive_user",
};

function executor(
  overrides: Partial<RuntimeDiagnosticProbeExecutor> = {},
): RuntimeDiagnosticProbeExecutor {
  return {
    databaseIdentity: async () => ({
      databaseName: "postgres",
      currentUserMatchesExpected: true,
      sessionUserMatchesExpected: true,
    }),
    sessionContext: async () => ({
      requestHostnameContextPresent: false,
      organizationContextPresent: false,
      userContextPresent: false,
    }),
    rlsMetadata: async () => ({
      workspaceHostnamesRlsEnabled: true,
      workspaceHostnamesForceRls: true,
      organizationsRlsEnabled: true,
      organizationsForceRls: true,
    }),
    resolverMetadata: async () => ({
      resolverExists: true,
      resolverSecurityDefiner: true,
      functionOwnerOwnsWorkspaceHostnames: true,
      functionOwnerOwnsOrganizations: true,
      functionOwnerIsSuperuser: false,
      functionOwnerBypassRls: false,
      functionOwnerForceRlsConstrained: true,
    }),
    resolverPrivilege: async () => true,
    directHostnameVisibility: async () => false,
    directOrganizationVisibility: async () => false,
    resolverInvocation: async () => true,
    disconnect: async () => {},
    ...overrides,
  };
}

async function inspect(
  overrides: Partial<RuntimeDiagnosticProbeExecutor> = {},
) {
  return inspectCandidateRuntime(env, () => executor(overrides));
}

describe("candidate tenant-router runtime diagnostic", () => {
  it("accepts one exact fixture hostname only", () => {
    expect(
      normalizedDiagnosticFixtureHostname(
        "RC2-RELEASE-315960213001.next.labofscents.org.",
      ),
    ).toBe(fixtureHostname);
    expect(
      normalizedDiagnosticFixtureHostname("router.next.labofscents.org"),
    ).toBe("router.next.labofscents.org");
    expect(
      normalizedDiagnosticFixtureHostname("nested.router.next.labofscents.org"),
    ).toBeNull();
    expect(
      normalizedDiagnosticFixtureHostname("router.labofscents.org"),
    ).toBeNull();
  });

  it("marks later probes incomplete after a database connection failure without exposing its cause", async () => {
    const diagnostic = await inspect({
      databaseIdentity: async () => {
        throw new Error("database-name-or-secret");
      },
    });
    expect(diagnostic).toMatchObject({
      databaseProbeCompleted: false,
      hyperdriveConnectionReachable: false,
      resolverPrivilegeProbeCompleted: false,
      resolverInvocationProbeCompleted: false,
    });
    expect(JSON.stringify(diagnostic)).not.toContain("database-name-or-secret");
  });

  it("preserves independent evidence when execute is denied and resolver invocation throws", async () => {
    const diagnostic = await inspect({
      resolverPrivilege: async () => false,
      resolverInvocation: async () => {
        throw new Error("permission denied");
      },
    });
    expect(diagnostic).toMatchObject({
      databaseProbeCompleted: true,
      resolverPrivilegeProbeCompleted: true,
      runtimeExecuteGranted: false,
      directHostnameProbeCompleted: true,
      resolverInvocationProbeCompleted: false,
      runtimeResolverResult: false,
    });
    expect(resolverHealth(diagnostic)).toBe("UNPROVEN");
  });

  it("distinguishes a direct RLS query returning false from a probe failure", async () => {
    const diagnostic = await inspect({
      directHostnameVisibility: async () => false,
    });
    expect(diagnostic.directHostnameProbeCompleted).toBe(true);
    expect(diagnostic.runtimeDirectHostnameVisible).toBe(false);
  });

  it("records a resolver execution returning false as a resolver failure", async () => {
    const diagnostic = await inspect({ resolverInvocation: async () => false });
    expect(diagnostic.resolverInvocationProbeCompleted).toBe(true);
    expect(diagnostic.runtimeResolverResult).toBe(false);
    expect(resolverHealth(diagnostic)).toBe("FAIL");
  });

  it("records a resolver execution returning true as a resolver pass", async () => {
    const diagnostic = await inspect();
    expect(diagnostic.resolverInvocationProbeCompleted).toBe(true);
    expect(diagnostic.runtimeResolverResult).toBe(true);
    expect(resolverHealth(diagnostic)).toBe("PASS");
  });

  it("continues safe probes when catalog metadata is unavailable", async () => {
    const diagnostic = await inspect({
      resolverMetadata: async () => {
        throw new Error("catalog denied");
      },
    });
    expect(diagnostic.resolverMetadataProbeCompleted).toBe(false);
    expect(diagnostic.resolverPrivilegeProbeCompleted).toBe(true);
    expect(diagnostic.directHostnameProbeCompleted).toBe(true);
    expect(diagnostic.resolverInvocationProbeCompleted).toBe(true);
  });

  it("returns an authenticated complete safe matrix even when an expected probe fails", async () => {
    const inspector = async () =>
      inspect({
        resolverPrivilege: async () => {
          throw new Error("hidden");
        },
      });
    const worker = createCandidateRuntimeDiagnostic(inspector);
    expect(
      (await worker.fetch(new Request("https://diagnostic.example/"), env))
        .status,
    ).toBe(404);
    expect(
      (
        await worker.fetch(
          new Request("https://diagnostic.example/", {
            headers: { "x-olfactoryops-candidate-runtime-diagnostic": "wrong" },
          }),
          env,
        )
      ).status,
    ).toBe(404);

    const response = await worker.fetch(
      new Request("https://diagnostic.example/", {
        headers: {
          "x-olfactoryops-candidate-runtime-diagnostic": "test-only-secret",
        },
      }),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      candidateRuntimeDiagnostic: "COMPLETE",
      targetReleaseSha,
      databaseProbeCompleted: true,
      resolverPrivilegeProbeCompleted: false,
    });
    expect(JSON.stringify(body)).not.toContain("test-only-secret");
    expect(JSON.stringify(body)).not.toContain("postgres");
    expect(JSON.stringify(body)).not.toContain("hyperdrive_user");
    expect(JSON.stringify(body)).not.toContain("hidden");
  });

  it("keeps execution health independent from resolver outcome", async () => {
    const diagnostic = await inspect({ resolverInvocation: async () => false });
    expect(runtimeDiagnosticExecutionPass(diagnostic)).toBe(true);
    expect(resolverHealth(diagnostic)).toBe("FAIL");
  });
});
