import { describe, expect, it } from "vitest";
import {
  RC9_SHA,
  classifyLoginDiagnostic,
  inspectActiveApiVersion,
  inspectBindings,
  runGeneratedLoginDiagnostic,
} from "./diagnose-v2-production-candidate-generated-login.mjs";

const secret = "sentinel-secret-value";
const password = "sentinel-password-value";
const dbUrl =
  "postgres://diagnostic:sentinel-db-url@db.example.invalid/olfactoryops";
const version = "11111111-1111-4111-8111-111111111111";

function environment() {
  return {
    RELEASE_SHA: RC9_SHA,
    CONFIRM_DIAGNOSTIC: "DIAGNOSE_RC9_GENERATED_LOGIN",
    V2_PRODUCTION_CANDIDATE_API_ORIGIN: "https://api-next.labofscents.org",
    V2_PRODUCTION_CANDIDATE_WORKSPACE_BASE_DOMAIN: "next.labofscents.org",
    V2_PRODUCTION_CANDIDATE_TENANT_URL: "https://fixture.next.labofscents.org",
    PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL: dbUrl,
  };
}
function bindings() {
  return {
    hyperdrive: true,
    secrets: {
      V2_SESSION_PEPPER: true,
      V2_PASSWORD_PEPPER: true,
      V2_INVITATION_ENCRYPTION_KEY: true,
    },
    variables: {
      V2_WORKSPACE_BASE_DOMAIN: true,
      V2_API_PUBLIC_HOSTNAME: true,
      V2_PLATFORM_ADMIN_HOSTNAME: true,
      V2_PUBLIC_PAGES_HOSTNAME: true,
      RELEASE_ENVIRONMENT: true,
      RELEASE_GIT_SHA: true,
    },
    pass: true,
  };
}
function adapters({ failAt, generatedStatus = 503, publicStatus = 503 } = {}) {
  const calls = { signup: 0, cleanup: 0 };
  let activeVersionCalls = 0;
  const fixture = {
    userId: "user-generated",
    organizationId: "org-generated",
    hostname: "generated.next.labofscents.org",
  };
  return {
    calls,
    value: {
      health: async () => ({
        status: 200,
        runtime: "v2-api-worker/1",
        environment: "production",
        database: "hyperdrive",
        releaseGitSha: RC9_SHA,
      }),
      activeVersion: async () => {
        activeVersionCalls += 1;
        if (failAt === "version-recheck" && activeVersionCalls === 2)
          throw new Error(secret);
        return { pass: true, versionId: version };
      },
      bindings: async () => bindings(),
      databaseCredentialPresent: () => true,
      passwordPepperAvailable: () => false,
      passwordPepper: () => secret,
      signup: async () => {
        calls.signup += 1;
        if (failAt === "signup") throw new Error(password);
        return { status: 200, fixture };
      },
      inspectFixture: async () => {
        if (failAt === "db") throw new Error(secret);
        return {
          userExists: true,
          userActive: true,
          passwordHashPresent: true,
          passwordHashPbkdf2V2: true,
          passwordHash: "pbkdf2:v2:sha256:120000:salt:hash",
          membershipExists: true,
          membershipActive: true,
          organizationActive: true,
          hostnameExists: true,
          hostnameActive: true,
          hostnameOrganizationMatch: true,
          defaultHostname: true,
        };
      },
      afterSignup: async () => {
        if (failAt === "after-signup") throw new Error(secret);
      },
      afterDbRead: async () => {
        if (failAt === "after-db-read") throw new Error(password);
      },
      markVerified: async () => {
        if (failAt === "verify") throw new Error(password);
      },
      userVerified: async () => true,
      afterVerification: async () => {
        if (failAt === "after-verification") throw new Error(secret);
      },
      resolveHostname: async () => fixture.organizationId,
      login: async ({ hostname }) => {
        if (
          failAt === "generated-login" ||
          (failAt === "public-login" && hostname === "api-next.labofscents.org")
        )
          throw new Error(secret);
        return hostname === "api-next.labofscents.org"
          ? { status: publicStatus, errorCode: "NOT_CONFIGURED" }
          : {
              status: generatedStatus,
              errorCode: "NOT_CONFIGURED",
              cookiePresent: false,
              csrfPresent: false,
            };
      },
      cleanupFixture: async () => {
        calls.cleanup += 1;
      },
    },
  };
}

describe("generated login diagnostic", () => {
  it("accepts only a single 100 percent active version", () => {
    expect(
      inspectActiveApiVersion({
        success: true,
        result: {
          deployments: [
            {
              strategy: "percentage",
              versions: [{ version_id: version, percentage: 100 }],
            },
          ],
        },
      }).pass,
    ).toBe(true);
    expect(
      inspectActiveApiVersion({
        success: true,
        result: {
          deployments: [
            {
              strategy: "percentage",
              versions: [{ version_id: version, percentage: 50 }],
            },
          ],
        },
      }).pass,
    ).toBe(false);
  });
  it("requires Hyperdrive, exact secret names, and exact runtime vars internally", () => {
    const base = [
      { type: "hyperdrive", name: "HYPERDRIVE" },
      ...Object.keys(bindings().secrets).map((name) => ({
        type: "secret_text",
        name,
      })),
      ...Object.entries({
        V2_WORKSPACE_BASE_DOMAIN: "next.labofscents.org",
        V2_API_PUBLIC_HOSTNAME: "api-next.labofscents.org",
        V2_PLATFORM_ADMIN_HOSTNAME: "admin-next.labofscents.org",
        V2_PUBLIC_PAGES_HOSTNAME: "next.labofscents.org",
        RELEASE_ENVIRONMENT: "production",
        RELEASE_GIT_SHA: RC9_SHA,
      }).map(([name, text]) => ({ type: "plain_text", name, text })),
    ];
    expect(
      inspectBindings(
        { result: { id: version, resources: { bindings: base } } },
        version,
      ).pass,
    ).toBe(true);
    expect(
      inspectBindings(
        {
          result: {
            id: version,
            resources: {
              bindings: base.filter(
                (entry) => entry.name !== "V2_PASSWORD_PEPPER",
              ),
            },
          },
        },
        version,
      ).pass,
    ).toBe(false);
    expect(
      inspectBindings(
        { result: { id: "other", resources: { bindings: base } } },
        version,
      ).pass,
    ).toBe(false);
  });
  it("creates at most one fixture, classifies dual failures, and never emits sentinels", async () => {
    const test = adapters();
    const records = [];
    await runGeneratedLoginDiagnostic({
      adapters: test.value,
      environment: environment(),
      emitRecord: (record) => records.push(JSON.stringify(record)),
    });
    expect(test.calls.signup).toBe(1);
    expect(test.calls.cleanup).toBe(1);
    expect(records.join("\n")).not.toContain(secret);
    expect(records.join("\n")).not.toContain(password);
    expect(records.join("\n")).not.toContain(dbUrl);
    expect(records.join("\n")).toContain(
      "LOGIN_SPECIFIC_RUNTIME_OR_TRANSACTION_PATH",
    );
  });
  for (const failAt of [
    "after-signup",
    "db",
    "after-db-read",
    "verify",
    "after-verification",
    "generated-login",
    "public-login",
    "version-recheck",
  ]) {
    it(`always archives the one fixture after ${failAt} failure`, async () => {
      const test = adapters({ failAt });
      await expect(
        runGeneratedLoginDiagnostic({
          adapters: test.value,
          environment: environment(),
          emitRecord: () => undefined,
        }),
      ).rejects.toThrow();
      expect(test.calls.cleanup).toBe(1);
    });
  }
  it("refuses a binding drift before fixture creation", async () => {
    const test = adapters();
    test.value.bindings = async () => ({ ...bindings(), pass: false });
    await expect(
      runGeneratedLoginDiagnostic({
        adapters: test.value,
        environment: environment(),
        emitRecord: () => undefined,
      }),
    ).rejects.toThrow();
    expect(test.calls.signup).toBe(0);
    expect(test.calls.cleanup).toBe(0);
  });
  it("does not emit an available password pepper", async () => {
    const test = adapters();
    test.value.passwordPepperAvailable = () => true;
    const records = [];
    await runGeneratedLoginDiagnostic({
      adapters: test.value,
      environment: environment(),
      emitRecord: (record) => records.push(JSON.stringify(record)),
    });
    expect(records.join("\n")).not.toContain(secret);
  });
  it("fails the run when archival cleanup cannot be proven", async () => {
    const test = adapters();
    test.value.cleanupFixture = async () => {
      throw new Error(secret);
    };
    await expect(
      runGeneratedLoginDiagnostic({
        adapters: test.value,
        environment: environment(),
        emitRecord: () => undefined,
      }),
    ).rejects.toThrow("CLEANUP_UNPROVEN");
  });
  it("keeps root-cause classification conservative", () => {
    expect(
      classifyLoginDiagnostic({
        preflightPass: true,
        passwordVerify: "PASS",
        generatedLogin: { status: 503 },
        publicLogin: { status: 200 },
        versionStable: true,
        phase: "UNCLASSIFIED",
      }),
    ).toBe("GENERATED_HOST_LOGIN_RESOLUTION_PATH");
    expect(
      classifyLoginDiagnostic({
        preflightPass: true,
        passwordVerify: "FAIL",
        generatedLogin: { status: 503 },
        publicLogin: { status: 503 },
        versionStable: true,
        phase: "LOGIN_VERIFY_PASSWORD",
      }),
    ).toBe("PASSWORD_HASH_OR_PEPPER_COHERENCE");
  });
});
