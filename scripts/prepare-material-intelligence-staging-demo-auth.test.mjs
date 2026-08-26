import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_APPROVAL,
  fixtureAdvisoryLockSql,
  fixtureAuditInsertSql,
  fixtureUserLookupSql,
  fixtureVerificationUpdateSql,
  fixtureWorkspaceLookupSql,
  prepareStagingDemoAuthFixture,
  stagingDemoAuthFixtureInputs,
} from "./prepare-material-intelligence-staging-demo-auth.mjs";

const validEnvironment = {
  V2_VC_DEMO_FIXTURE_ENVIRONMENT: "staging",
  V2_VC_DEMO_FIXTURE_APPROVED: FIXTURE_APPROVAL,
  STAGING_DATABASE_URL: "postgresql://staging-user:staging-password@staging-db.example.test/olfactoryops",
  MATERIAL_DEMO_TENANT_SLUG: "vc-demo-fixture",
  MATERIAL_DEMO_LOGIN_EMAIL: "vc-demo-owner@example.test",
};

function workspace(overrides = {}) {
  return {
    organizationId: "org_demo",
    roleKey: "Owner",
    membershipStatus: "ACTIVE",
    organizationStatus: "ACTIVE",
    hostnameKind: "DEFAULT",
    hostnameStatus: "ACTIVE",
    activeMembershipCount: 1,
    ...overrides,
  };
}

class FixtureClient {
  constructor({ verified = false, userRows, workspaceRows, updateCount = 1, auditCount = 1, failure } = {}) {
    this.verified = verified;
    this.userRows = userRows;
    this.workspaceRows = workspaceRows;
    this.updateCount = updateCount;
    this.auditCount = auditCount;
    this.failure = failure;
    this.queries = [];
    this.connected = false;
    this.ended = false;
  }

  async connect() {
    this.connected = true;
  }

  async query(sql, parameters = []) {
    this.queries.push({ sql, parameters });
    if (this.failure && sql === this.failure.sql) throw new Error(this.failure.message);
    if (sql === fixtureUserLookupSql) {
      return {
        rowCount: 1,
        rows: this.userRows ?? [{ id: "usr_demo", status: "ACTIVE", verified: this.verified }],
      };
    }
    if (sql === fixtureWorkspaceLookupSql) {
      return { rowCount: 1, rows: this.workspaceRows ?? [workspace()] };
    }
    if (sql === fixtureVerificationUpdateSql) {
      if (this.updateCount === 1) this.verified = true;
      return { rowCount: this.updateCount, rows: this.updateCount === 1 ? [{ id: "usr_demo" }] : [] };
    }
    if (sql === fixtureAuditInsertSql) return { rowCount: this.auditCount, rows: [] };
    return { rowCount: 1, rows: [] };
  }

  async end() {
    this.ended = true;
  }
}

function harness(client) {
  return prepareStagingDemoAuthFixture({
    environment: validEnvironment,
    clientFactory: () => client,
  });
}

describe("Material Intelligence protected staging demo auth fixture", () => {
  it("requires explicit staging approval, a non-loopback PostgreSQL target, and exact protected inputs", () => {
    expect(stagingDemoAuthFixtureInputs(validEnvironment)).toMatchObject({
      tenantSlug: "vc-demo-fixture",
      email: "vc-demo-owner@example.test",
      hostname: "vc-demo-fixture.api-beta.labofscents.org",
    });

    for (const override of [
      { V2_VC_DEMO_FIXTURE_ENVIRONMENT: "production" },
      { V2_VC_DEMO_FIXTURE_APPROVED: "" },
      { STAGING_DATABASE_URL: "postgresql://local@127.0.0.1/olfactoryops" },
      { STAGING_DATABASE_URL: "https://staging-db.example.test/olfactoryops" },
      { MATERIAL_DEMO_TENANT_SLUG: "two.labels" },
      { MATERIAL_DEMO_LOGIN_EMAIL: "invalid" },
    ]) {
      expect(() => stagingDemoAuthFixtureInputs({ ...validEnvironment, ...override })).toThrow(
        /MATERIAL_DEMO_AUTH_FIXTURE_(?:BLOCKED|INPUT_INVALID)/,
      );
    }
  });

  it("locks, verifies only the exact unverified user, appends audit evidence, and rechecks before commit", async () => {
    const client = new FixtureClient();
    const result = await harness(client);

    expect(result).toEqual({
      disposition: "VERIFIED_NOW",
      activeMembershipCount: 1,
      auditAppended: true,
    });
    expect(client.connected).toBe(true);
    expect(client.ended).toBe(true);
    expect(client.queries.map((query) => query.sql)).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
      "SET LOCAL lock_timeout = '5s'",
      "SET LOCAL statement_timeout = '20s'",
      fixtureAdvisoryLockSql,
      "SELECT set_config('app.login_email', $1, true)",
      fixtureUserLookupSql,
      "SELECT set_config('app.user_id', $1, true)",
      "SELECT set_config('app.request_hostname', $1, true)",
      fixtureWorkspaceLookupSql,
      "SELECT set_config('app.organization_id', $1, true)",
      fixtureVerificationUpdateSql,
      fixtureAuditInsertSql,
      fixtureUserLookupSql,
      fixtureWorkspaceLookupSql,
      "COMMIT",
    ]);
    expect(client.queries.find((query) => query.sql === fixtureVerificationUpdateSql)?.parameters).toEqual(["usr_demo"]);
    expect(client.queries.find((query) => query.sql === fixtureAuditInsertSql)?.parameters).toEqual([
      expect.stringMatching(/^aud_demo_verify_[a-f0-9]{20}$/),
      "org_demo",
      "usr_demo",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
  });

  it("is idempotent when the exact fixture is already verified", async () => {
    const client = new FixtureClient({ verified: true });
    await expect(harness(client)).resolves.toEqual({
      disposition: "ALREADY_VERIFIED",
      activeMembershipCount: 1,
      auditAppended: false,
    });
    expect(client.queries.some((query) => query.sql === fixtureVerificationUpdateSql)).toBe(false);
    expect(client.queries.some((query) => query.sql === fixtureAuditInsertSql)).toBe(false);
    expect(client.queries.at(-1)?.sql).toBe("COMMIT");
  });

  it.each([
    ["duplicate user", { userRows: [
      { id: "usr_a", status: "ACTIVE", verified: false },
      { id: "usr_b", status: "ACTIVE", verified: false },
    ] }],
    ["wrong role", { workspaceRows: [workspace({ roleKey: "Viewer" })] }],
    ["multiple active memberships", { workspaceRows: [workspace({ activeMembershipCount: 2 })] }],
    ["inactive hostname", { workspaceRows: [workspace({ hostnameStatus: "ARCHIVED" })] }],
    ["concurrent update", { updateCount: 0 }],
  ])("rolls back without broadening scope for %s", async (_label, options) => {
    const client = new FixtureClient(options);
    await expect(harness(client)).rejects.toThrow(/MATERIAL_DEMO_AUTH_FIXTURE_/);
    expect(client.queries.at(-1)?.sql).toBe("ROLLBACK");
    expect(client.queries.some((query) => query.sql === fixtureAuditInsertSql)).toBe(false);
    expect(client.ended).toBe(true);
  });

  it("classifies database failures without leaking protected values", async () => {
    const client = new FixtureClient({
      failure: {
        sql: fixtureAdvisoryLockSql,
        message: `${validEnvironment.MATERIAL_DEMO_LOGIN_EMAIL} ${validEnvironment.STAGING_DATABASE_URL}`,
      },
    });
    let error;
    try {
      await harness(client);
    } catch (caught) {
      error = caught;
    }
    expect(error?.message).toBe("MATERIAL_DEMO_AUTH_FIXTURE_DATABASE_FAILURE");
    expect(error?.message).not.toContain(validEnvironment.MATERIAL_DEMO_LOGIN_EMAIL);
    expect(error?.message).not.toContain(validEnvironment.STAGING_DATABASE_URL);
    expect(client.queries.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("keeps the mutation in a separate exact-SHA staging-only workflow", async () => {
    const workflow = await readFile(
      resolve(".github/workflows/v2-staging-material-intelligence-vc-demo-auth-fixture.yml"),
      "utf8",
    );
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain('test "$STAGING_SHA" = "$(git rev-parse FETCH_HEAD)"');
    expect(workflow).toContain("VERIFY_VC_DEMO_STAGING_FIXTURE");
    expect(workflow).toContain("secrets.STAGING_DATABASE_URL");
    expect(workflow).toContain("secrets.MATERIAL_DEMO_LOGIN_EMAIL");
    expect(workflow).toContain("vars.MATERIAL_DEMO_TENANT_SLUG");
    expect(workflow).toContain("prepare-material-intelligence-staging-demo-auth.mjs");
    expect(workflow).not.toMatch(/production|material-intelligence-bulk|APPLY_MATERIAL_INTELLIGENCE_STAGING/i);
  });
});
