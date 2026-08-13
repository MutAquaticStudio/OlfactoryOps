import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  createCandidateRuntimeDiagnostic,
  inspectCandidateRuntime,
  normalizedDiagnosticFixtureHostname,
  resolverHealth,
  runtimeDiagnosticExecutionPass,
  type RuntimeDiagnosticProbeExecutor,
  type V2TenantRouterRuntimeDiagnosticEnv,
} from "./v2-tenant-router-runtime-diagnostic.js";

const targetReleaseSha = "de0734df2d2b5b2dd3a2a67ee542131235e75eb7";
const expectedDatabaseSha =
  "a942b37ccfaf5a813b1432caa209a43b9d144e47ad0de1549c289c253e556cd5";
const fixtureHostname =
  "rc9-release-31736285494-469ca8942a.next.labofscents.org";
const expectedOrganizationId = "org_runtime_diagnostic_fixture";
const expectedRuntimeRole = "runtime_diagnostic_role";
const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const env: V2TenantRouterRuntimeDiagnosticEnv = {
  HYPERDRIVE: {} as Hyperdrive,
  CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN: "test-only-secret",
  DIAGNOSTIC_FIXTURE_HOSTNAME: fixtureHostname,
  TARGET_RELEASE_SHA: targetReleaseSha,
  V2_EXPECTED_DATABASE_NAME_SHA: expectedDatabaseSha,
  V2_EXPECTED_ORGANIZATION_ID_SHA: sha256(expectedOrganizationId),
  V2_EXPECTED_RUNTIME_ROLE_SHA: sha256(expectedRuntimeRole),
};

function executor(
  overrides: Partial<RuntimeDiagnosticProbeExecutor> = {},
): RuntimeDiagnosticProbeExecutor {
  return {
    databaseIdentity: async () => ({
      databaseName: "postgres",
      currentUser: expectedRuntimeRole,
      sessionUser: expectedRuntimeRole,
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
    resolverInvocation: async () => ({
      resolverResult: true,
      organizationId: expectedOrganizationId,
    }),
    disconnect: async () => {},
    ...overrides,
  };
}

async function inspect(
  overrides: Partial<RuntimeDiagnosticProbeExecutor> = {},
) {
  return inspectCandidateRuntime(env, () => executor(overrides));
}

function diagnosticRequest(path: string, token?: string, method = "GET") {
  return new Request(`https://diagnostic.example${path}`, {
    method,
    headers: token
      ? { "x-olfactoryops-candidate-runtime-diagnostic": token }
      : undefined,
  });
}

describe("candidate tenant-router runtime diagnostic", () => {
  it("accepts one exact fixture hostname only", () => {
    expect(
      normalizedDiagnosticFixtureHostname(
        "RC9-RELEASE-31736285494-469CA8942A.next.labofscents.org.",
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
    const diagnostic = await inspect({
      resolverInvocation: async () => ({
        resolverResult: false,
        organizationId: null,
      }),
    });
    expect(diagnostic.resolverInvocationProbeCompleted).toBe(true);
    expect(diagnostic.runtimeResolverResult).toBe(false);
    expect(resolverHealth(diagnostic)).toBe("FAIL");
  });

  it("records a resolver execution returning true as a resolver pass", async () => {
    const diagnostic = await inspect();
    expect(diagnostic.resolverInvocationProbeCompleted).toBe(true);
    expect(diagnostic.runtimeResolverResult).toBe(true);
    expect(diagnostic.runtimeResolverOrganizationMatch).toBe(true);
    expect(resolverHealth(diagnostic)).toBe("PASS");
  });

  it("fails the resolver health gate when an internal organization comparison mismatches", async () => {
    const diagnostic = await inspect({
      resolverInvocation: async () => ({
        resolverResult: true,
        organizationId: "org_different_fixture",
      }),
    });
    expect(diagnostic.runtimeResolverResult).toBe(true);
    expect(diagnostic.runtimeResolverOrganizationMatch).toBe(false);
    expect(resolverHealth(diagnostic)).toBe("FAIL");
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

  it("returns controlled 404 responses for unauthorized and unsupported paths", async () => {
    let inspectorCalls = 0;
    const worker = createCandidateRuntimeDiagnostic(async (requestEnv) => {
      inspectorCalls += 1;
      return inspectCandidateRuntime(requestEnv, () => executor());
    });

    for (const request of [
      diagnosticRequest("/ready"),
      diagnosticRequest("/diagnose"),
      diagnosticRequest("/ready", "wrong"),
      diagnosticRequest("/diagnose", "wrong"),
      diagnosticRequest("/other", "test-only-secret"),
      diagnosticRequest("/ready", "test-only-secret", "POST"),
    ]) {
      expect((await worker.fetch(request, env)).status).toBe(404);
    }
    expect(inspectorCalls).toBe(0);
  });

  it("returns the exact authenticated readiness envelope without opening a database probe", async () => {
    let inspectorCalls = 0;
    const worker = createCandidateRuntimeDiagnostic(async (requestEnv) => {
      inspectorCalls += 1;
      return inspectCandidateRuntime(requestEnv, () => executor());
    });

    const response = await worker.fetch(
      diagnosticRequest("/ready", "test-only-secret"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      candidateRuntimeDiagnostic: "READY",
    });
    expect(inspectorCalls).toBe(0);
  });

  it("returns an authenticated complete safe matrix from /diagnose when an expected probe fails", async () => {
    const inspector = async () =>
      inspect({
        resolverPrivilege: async () => {
          throw new Error("hidden");
        },
      });
    const worker = createCandidateRuntimeDiagnostic(inspector);

    const response = await worker.fetch(
      diagnosticRequest("/diagnose", "test-only-secret"),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      candidateRuntimeDiagnostic: "COMPLETE",
      databaseProbeCompleted: true,
      resolverPrivilegeProbeCompleted: false,
    });
    expect(JSON.stringify(body)).not.toContain("test-only-secret");
    expect(JSON.stringify(body)).not.toContain(targetReleaseSha);
    expect(JSON.stringify(body)).not.toContain("postgres");
    expect(JSON.stringify(body)).not.toContain(expectedRuntimeRole);
    expect(JSON.stringify(body)).not.toContain(expectedOrganizationId);
    expect(JSON.stringify(body)).not.toContain("hidden");
  });

  it("returns a fixed safe 503 envelope for an unexpected /diagnose inspector failure", async () => {
    const worker = createCandidateRuntimeDiagnostic(async () => {
      throw new Error("database-or-secret-details");
    });

    const response = await worker.fetch(
      diagnosticRequest("/diagnose", "test-only-secret"),
      env,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      candidateRuntimeDiagnostic: "UNAVAILABLE",
    });
    expect(JSON.stringify(body)).not.toContain("database-or-secret-details");
    expect(JSON.stringify(body)).not.toContain("test-only-secret");
  });

  it("keeps execution health independent from resolver outcome", async () => {
    const diagnostic = await inspect({
      resolverInvocation: async () => ({
        resolverResult: false,
        organizationId: null,
      }),
    });
    expect(runtimeDiagnosticExecutionPass(diagnostic)).toBe(true);
    expect(resolverHealth(diagnostic)).toBe("FAIL");
  });
});
