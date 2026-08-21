import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  activeSmokeTenantLookupSql,
  appendSmokeIdentityAuditSql,
  existingSmokeUserLookupSql,
  insertSmokeMembershipSql,
  insertSmokeUserSql,
  isProductionSmokeTenantHostname,
  provisionDedicatedProductionSmokeIdentity,
  provisionProductionSmokeIdentity,
  safeProvisioningFailure,
  smokeIdentityAdvisoryLockSql,
  verifySmokeIdentitySql,
  viewerRolePolicyLookupSql,
} from "./provision-v2-rc10-production-smoke-identity.mjs";

const environment = {
  RELEASE_WORKTREE: "/safe/release",
  PRODUCTION_DATABASE_URL:
    "postgresql://admin:fixture@db.example.invalid/olfactoryops",
  PRODUCTION_SMOKE_TENANT_HOSTNAME: "smoke-fixture.labofscents.org",
  PRODUCTION_SMOKE_LOGIN_EMAIL: "smoke-user@example.invalid",
  PRODUCTION_SMOKE_LOGIN_PASSWORD: "fixture-password-at-least-sixteen",
  V2_PASSWORD_PEPPER: "fixture-password-pepper-at-least-sixteen",
};

class FakeClient {
  constructor({ existingUser = false, postcondition = true, failure } = {}) {
    this.existingUser = existingUser;
    this.postcondition = postcondition;
    this.failure = failure;
    this.queries = [];
    this.closed = false;
  }

  async connect() {}

  async end() {
    this.closed = true;
  }

  async query(sql, parameters = []) {
    this.queries.push({ sql, parameters });
    if (this.failure?.sql === sql) throw this.failure.error;
    if (
      sql === "BEGIN" ||
      sql === "COMMIT" ||
      sql === "ROLLBACK" ||
      sql.startsWith("SELECT set_config(")
    ) {
      return { rowCount: 0, rows: [] };
    }
    if (sql === smokeIdentityAdvisoryLockSql) return { rowCount: 1, rows: [] };
    if (sql === activeSmokeTenantLookupSql)
      return { rowCount: 1, rows: [{ organization_id: "org_fixture" }] };
    if (sql === viewerRolePolicyLookupSql)
      return { rowCount: 1, rows: [{ id: "policy_fixture" }] };
    if (sql === existingSmokeUserLookupSql)
      return {
        rowCount: this.existingUser ? 1 : 0,
        rows: this.existingUser ? [{ id: "usr_existing" }] : [],
      };
    if (
      sql === insertSmokeUserSql ||
      sql === insertSmokeMembershipSql ||
      sql === appendSmokeIdentityAuditSql
    ) {
      return { rowCount: 1, rows: [] };
    }
    if (sql === verifySmokeIdentitySql) {
      return {
        rowCount: 1,
        rows: [
          {
            identity_ready: this.postcondition,
            no_platform_operator: this.postcondition,
          },
        ],
      };
    }
    throw new Error("UNEXPECTED_QUERY");
  }
}

function fakeId(prefix) {
  return `${prefix}_fixture`;
}

function pgFor(client) {
  return {
    Client: class {
      constructor() {
        return client;
      }
    },
  };
}

describe("RC10 dedicated production smoke identity provisioning", () => {
  it("accepts only a non-public production tenant hostname", () => {
    expect(isProductionSmokeTenantHostname("smoke-fixture.labofscents.org")).toBe(true);
    expect(isProductionSmokeTenantHostname("smoke.next.labofscents.org")).toBe(false);
    expect(isProductionSmokeTenantHostname("api.labofscents.org")).toBe(false);
    expect(isProductionSmokeTenantHostname("next.labofscents.org")).toBe(false);
  });

  it("creates only a verified active Viewer membership inside the selected active tenant", async () => {
    const client = new FakeClient();

    await provisionDedicatedProductionSmokeIdentity(client, {
      tenantHostname: environment.PRODUCTION_SMOKE_TENANT_HOSTNAME,
      email: environment.PRODUCTION_SMOKE_LOGIN_EMAIL,
      passwordHash: "pbkdf2:v2:sha256:120000:salt_fixture:digest_fixture",
      createId: fakeId,
    });

    expect(client.queries.map(({ sql }) => sql)).toEqual([
      "BEGIN",
      smokeIdentityAdvisoryLockSql,
      activeSmokeTenantLookupSql,
      "SELECT set_config('app.organization_id', $1, true)",
      viewerRolePolicyLookupSql,
      "SELECT set_config('app.login_email', $1, true)",
      existingSmokeUserLookupSql,
      "SELECT set_config('app.user_id', $1, true)",
      insertSmokeUserSql,
      insertSmokeMembershipSql,
      verifySmokeIdentitySql,
      appendSmokeIdentityAuditSql,
      "COMMIT",
    ]);
    expect(
      client.queries.find(({ sql }) => sql === insertSmokeMembershipSql)
        ?.parameters,
    ).toEqual(["mem_smoke_fixture", "org_fixture", "usr_smoke_fixture"]);
    expect(insertSmokeMembershipSql).toContain("'Viewer'");
    expect(verifySmokeIdentitySql).toContain("NOT EXISTS");
  });

  it("idempotently accepts an existing safe Viewer identity without writing", async () => {
    const client = new FakeClient({ existingUser: true });

    await provisionDedicatedProductionSmokeIdentity(client, {
      tenantHostname: environment.PRODUCTION_SMOKE_TENANT_HOSTNAME,
      email: environment.PRODUCTION_SMOKE_LOGIN_EMAIL,
      passwordHash: "pbkdf2:v2:sha256:120000:salt_fixture:digest_fixture",
      createId: fakeId,
    });

    expect(client.queries.map(({ sql }) => sql)).toContain("COMMIT");
    expect(client.queries.map(({ sql }) => sql)).not.toContain(
      insertSmokeUserSql,
    );
    expect(client.queries.map(({ sql }) => sql)).not.toContain(
      insertSmokeMembershipSql,
    );
    expect(client.queries.map(({ sql }) => sql)).not.toContain(
      appendSmokeIdentityAuditSql,
    );
  });

  it("rolls back when an existing identity fails the selected-tenant postcondition", async () => {
    const client = new FakeClient({ existingUser: true, postcondition: false });

    await expect(
      provisionDedicatedProductionSmokeIdentity(client, {
        tenantHostname: environment.PRODUCTION_SMOKE_TENANT_HOSTNAME,
        email: environment.PRODUCTION_SMOKE_LOGIN_EMAIL,
        passwordHash: "pbkdf2:v2:sha256:120000:salt_fixture:digest_fixture",
        createId: fakeId,
      }),
    ).rejects.toThrow("SMOKE_IDENTITY_ALREADY_EXISTS");

    expect(client.queries.map(({ sql }) => sql)).toContain("ROLLBACK");
    expect(client.queries.map(({ sql }) => sql)).not.toContain(
      insertSmokeUserSql,
    );
    expect(client.queries.map(({ sql }) => sql)).not.toContain(
      insertSmokeMembershipSql,
    );
  });

  it("rolls back if any postcondition would make the smoke identity unsafe", async () => {
    const client = new FakeClient({ postcondition: false });

    await expect(
      provisionDedicatedProductionSmokeIdentity(client, {
        tenantHostname: environment.PRODUCTION_SMOKE_TENANT_HOSTNAME,
        email: environment.PRODUCTION_SMOKE_LOGIN_EMAIL,
        passwordHash: "pbkdf2:v2:sha256:120000:salt_fixture:digest_fixture",
        createId: fakeId,
      }),
    ).rejects.toThrow("SMOKE_IDENTITY_POSTCONDITION_FAILED");

    expect(client.queries.map(({ sql }) => sql)).toContain("ROLLBACK");
    expect(client.queries.map(({ sql }) => sql)).not.toContain(
      appendSmokeIdentityAuditSql,
    );
  });

  it("uses the exact RC10 password-hash contract and emits safe proof only", async () => {
    const client = new FakeClient();
    const output = [];
    const result = await provisionProductionSmokeIdentity({
      environment,
      pgModule: pgFor(client),
      passwordHasher: async () =>
        "pbkdf2:v2:sha256:120000:salt_fixture:digest_fixture",
      emit: (line) => output.push(line),
    });

    expect(result.pass).toBe(true);
    expect(output).toEqual([
      "PRODUCTION_SMOKE_TENANT_HOSTNAME_READY=PASS",
      "PRODUCTION_SMOKE_LOGIN_IDENTITY_READY=PASS",
      "PRODUCTION_SMOKE_IDENTITY_ROLE=VIEWER",
      "PRODUCTION_SMOKE_PLATFORM_OPERATOR=ABSENT",
      "PRODUCTION_SMOKE_IDENTITY_PROVISIONING=PASS",
    ]);
    expect(JSON.stringify(output)).not.toContain(
      environment.PRODUCTION_SMOKE_LOGIN_EMAIL,
    );
    expect(JSON.stringify(output)).not.toContain(
      environment.PRODUCTION_SMOKE_LOGIN_PASSWORD,
    );
    expect(JSON.stringify(output)).not.toContain(
      environment.V2_PASSWORD_PEPPER,
    );
    expect(client.closed).toBe(true);
  });

  it("classifies database errors without exposing their detail", () => {
    const error = Object.assign(new Error("database detail must not escape"), {
      code: "42501",
    });
    expect(safeProvisioningFailure(error)).toBe(
      "SMOKE_IDENTITY_DATABASE_PERMISSION_DENIED",
    );
    expect(
      safeProvisioningFailure(
        Object.assign(new Error("duplicate"), { code: "23505" }),
      ),
    ).toBe("SMOKE_IDENTITY_ALREADY_EXISTS");
  });

  it("contains no Platform Operator, route, deployment, or credential-output mutation path", () => {
    const source = readFileSync(
      "scripts/provision-v2-rc10-production-smoke-identity.mjs",
      "utf8",
    );
    expect(source).toContain("services/platform/src/crypto.ts");
    expect(source).toContain("'Viewer'");
    expect(source).not.toMatch(
      /INSERT\s+INTO\s+public\.v2_platform_operators|wrangler|workers\/routes|workers\/domains|git\s+(?:tag|push)|console\.(?:error|warn)/i,
    );
    expect(source).not.toMatch(
      /process\.env\.PRODUCTION_SMOKE_LOGIN_(?:EMAIL|PASSWORD).*console/i,
    );
  });
});
