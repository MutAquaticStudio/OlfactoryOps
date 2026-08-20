import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assignPlatformOwnerWithPg,
  main,
  safeBootstrapFailure,
} from "./bootstrap-v2-production-platform-owner-pg.mjs";

const environment = {
  PLATFORM_OWNER_BOOTSTRAP_EMAIL: "owner@example.invalid",
  PLATFORM_BOOTSTRAP_DATABASE_URL:
    "postgresql://owner:fixture@db.example.invalid/olfactoryops",
  PLATFORM_OWNER_BOOTSTRAP_ENVIRONMENT: "production",
  CONFIRM_PLATFORM_OWNER_BOOTSTRAP: "ASSIGN_PLATFORM_OWNER",
  V2_PRODUCTION_PLATFORM_OWNER_BOOTSTRAP_APPROVED: "ASSIGN_PLATFORM_OWNER",
  RELEASE_WORKTREE: "/safe/release",
};

const releaseContract = {
  platformOwnerAdvisoryLockSql: "SELECT pg_advisory_xact_lock(1)",
  platformOwnerInsertSql:
    "INSERT INTO v2_platform_operators (id, user_id) VALUES ($1, $2) RETURNING id",
  bootstrapConfig() {
    return {
      email: environment.PLATFORM_OWNER_BOOTSTRAP_EMAIL,
      databaseUrl: environment.PLATFORM_BOOTSTRAP_DATABASE_URL,
    };
  },
  safeBootstrapFailure(error) {
    return error instanceof Error &&
      error.message === "BOOTSTRAP_OWNER_ALREADY_ASSIGNED"
      ? error.message
      : "BOOTSTRAP_TRANSACTION_FAILED";
  },
};

class FakeClient {
  constructor({
    users = [{ id: "usr_fixture" }],
    owners = [],
    insertCount = 1,
    fail = undefined,
  } = {}) {
    this.users = users;
    this.owners = owners;
    this.insertCount = insertCount;
    this.fail = fail;
    this.queries = [];
  }

  async connect() {}

  async end() {}

  async query(sql, parameters = []) {
    this.queries.push({ sql, parameters });
    if (this.fail && sql === this.fail.sql) throw this.fail.error;
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rowCount: 0, rows: [] };
    }
    if (sql === releaseContract.platformOwnerAdvisoryLockSql) {
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("FROM v2_users")) {
      return { rowCount: this.users.length, rows: this.users };
    }
    if (sql.includes("FROM v2_platform_operators")) {
      return { rowCount: this.owners.length, rows: this.owners };
    }
    if (sql === releaseContract.platformOwnerInsertSql) {
      return { rowCount: this.insertCount, rows: [] };
    }
    if (sql.includes("INSERT INTO v2_platform_audit_events")) {
      return { rowCount: 1, rows: [] };
    }
    throw new Error("UNEXPECTED_QUERY");
  }
}

describe("pg Platform Owner bootstrap wrapper", () => {
  it("uses the exact release lock and insert contract in one transaction", async () => {
    const client = new FakeClient();
    await assignPlatformOwnerWithPg(
      client,
      releaseContract,
      "owner@example.invalid",
    );

    expect(client.queries.map(({ sql }) => sql)).toEqual([
      "BEGIN",
      releaseContract.platformOwnerAdvisoryLockSql,
      expect.stringContaining("FROM v2_users"),
      expect.stringContaining("FROM v2_platform_operators"),
      releaseContract.platformOwnerInsertSql,
      expect.stringContaining("INSERT INTO v2_platform_audit_events"),
      "COMMIT",
    ]);
    expect(client.queries[2].parameters).toEqual(["owner@example.invalid"]);
  });

  it("rolls back every failed assignment before returning a bounded failure", async () => {
    const failure = Object.assign(new Error("permission detail"), {
      code: "42501",
    });
    const client = new FakeClient({
      fail: { sql: releaseContract.platformOwnerInsertSql, error: failure },
    });
    const lines = [];
    const originalError = console.error;
    console.error = (line) => lines.push(line);
    try {
      await expect(
        assignPlatformOwnerWithPg(
          client,
          releaseContract,
          "owner@example.invalid",
        ),
      ).rejects.toBe(failure);
      const exitCode = await main(environment, { releaseContract, client });
      expect(exitCode).toBe(1);
    } finally {
      console.error = originalError;
    }

    expect(client.queries.map(({ sql }) => sql)).toContain("ROLLBACK");
    expect(lines.join("\n")).toContain(
      "PLATFORM_OWNER_BOOTSTRAP=FAIL BOOTSTRAP_DATABASE_PERMISSION_DENIED",
    );
    expect(lines.join("\n")).not.toContain("permission detail");
    expect(lines.join("\n")).not.toContain("owner@example.invalid");
  });

  it("classifies expected database failures without exposing database detail", () => {
    expect(
      safeBootstrapFailure(
        Object.assign(new Error("denied"), { code: "42501" }),
        releaseContract,
      ),
    ).toBe("BOOTSTRAP_DATABASE_PERMISSION_DENIED");
    expect(
      safeBootstrapFailure(
        Object.assign(new Error("duplicate"), { code: "23505" }),
        releaseContract,
      ),
    ).toBe("BOOTSTRAP_OWNER_ALREADY_ASSIGNED");
  });

  it("contains only the intended transaction writes and no route or release mutation", () => {
    const source = readFileSync(
      "scripts/bootstrap-v2-production-platform-owner-pg.mjs",
      "utf8",
    );
    expect(source).toContain("loadReleaseBootstrapContract");
    expect(source).toContain("releaseContract.platformOwnerAdvisoryLockSql");
    expect(source).toContain("releaseContract.platformOwnerInsertSql");
    expect(source).not.toMatch(
      /wrangler|workers\/domains|workers\/routes|git tag|git push/i,
    );
    expect(source).not.toMatch(/UPDATE\s+|DELETE\s+|ALTER\s+|DROP\s+/i);
  });
});
