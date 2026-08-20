import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyDatabaseFailure,
  classifyPrismaFailure,
  countClass,
  diagnosePlatformOwnerBootstrap,
  emitDiagnostic,
  safeRootCause,
} from "./diagnose-v2-production-platform-owner-bootstrap.mjs";

class FakeClient {
  constructor(rows = {}) {
    this.rows = rows;
    this.queries = [];
    this.parameters = [];
  }

  async connect() {}

  async end() {}

  async query(sql, parameters) {
    this.queries.push(sql);
    this.parameters.push(parameters);
    if (sql === "SELECT 1" || sql === "BEGIN READ ONLY" || sql === "ROLLBACK") {
      return { rows: [] };
    }
    if (sql.includes("pg_tables")) return { rows: [{ matched: 3 }] };
    if (sql.includes("information_schema.columns")) {
      return {
        rows: [
          { table_name: "v2_users", column_name: "email" },
          { table_name: "v2_users", column_name: "verified_at" },
          { table_name: "v2_platform_operators", column_name: "id" },
          { table_name: "v2_platform_operators", column_name: "user_id" },
          { table_name: "v2_platform_operators", column_name: "role_key" },
          { table_name: "v2_platform_operators", column_name: "status" },
          { table_name: "v2_platform_operators", column_name: "mfa_required" },
          { table_name: "v2_platform_operators", column_name: "created_by" },
          { table_name: "v2_platform_audit_events", column_name: "id" },
          {
            table_name: "v2_platform_audit_events",
            column_name: "actor_user_id",
          },
          { table_name: "v2_platform_audit_events", column_name: "actor_role" },
          { table_name: "v2_platform_audit_events", column_name: "action" },
          { table_name: "v2_platform_audit_events", column_name: "outcome" },
          {
            table_name: "v2_platform_audit_events",
            column_name: "subject_type",
          },
          { table_name: "v2_platform_audit_events", column_name: "subject_id" },
          { table_name: "v2_platform_audit_events", column_name: "reason" },
          {
            table_name: "v2_platform_audit_events",
            column_name: "correlation_id",
          },
        ],
      };
    }
    if (sql.includes("pg_catalog.pg_index")) return { rows: [{ matched: 1 }] };
    if (sql.includes("FROM public.v2_users"))
      return { rows: this.rows.users ?? [{ verified: true }] };
    if (sql.includes("FROM public.v2_platform_operators"))
      return { rows: this.rows.owners ?? [] };
    if (sql.includes("has_table_privilege")) {
      return {
        rows: [
          {
            users_select: true,
            operators_select: true,
            operators_insert: true,
            audit_insert: true,
          },
        ],
      };
    }
    if (sql.includes("row_security_active")) {
      return {
        rows: [
          {
            operators_insert_bypasses_rls:
              this.rows.operators_insert_bypasses_rls ?? true,
            audit_insert_bypasses_rls:
              this.rows.audit_insert_bypasses_rls ?? true,
          },
        ],
      };
    }
    throw new Error("UNEXPECTED_QUERY");
  }
}

class FakePrismaClient {
  constructor() {
    this.transactionQueries = [];
  }

  async $transaction(callback) {
    return callback({
      $executeRawUnsafe: async (sql) => {
        this.transactionQueries.push(sql);
      },
      $queryRawUnsafe: async (sql) => {
        this.transactionQueries.push(sql);
        return [];
      },
    });
  }

  async $disconnect() {}
}

function createFakePrismaClient() {
  const client = new FakePrismaClient();
  return { client, create: () => client };
}

const environment = {
  PLATFORM_OWNER_BOOTSTRAP_EMAIL: "owner@example.invalid",
  PLATFORM_BOOTSTRAP_DATABASE_URL:
    "postgresql://owner:fixture@db.example.invalid/olfactoryops",
};

describe("production Platform Owner diagnostic", () => {
  it("maps only bounded database and Prisma failures", () => {
    expect(classifyDatabaseFailure({ code: "28P01" }).safeClass).toBe(
      "DATABASE_AUTH_FAILED",
    );
    expect(classifyDatabaseFailure({ code: "42P01" }).safeClass).toBe(
      "DATABASE_TABLE_MISSING",
    );
    expect(
      classifyDatabaseFailure(new Error("tls handshake failed")).safeClass,
    ).toBe("DATABASE_TLS_FAILED");
    expect(
      classifyPrismaFailure(
        new Error(
          "Prisma Client did not initialize yet. Please run prisma generate",
        ),
      ),
    ).toBe("PRISMA_CLIENT_NOT_GENERATED");
    expect(countClass(0)).toBe("ZERO");
    expect(countClass(1)).toBe("ONE");
    expect(countClass(2)).toBe("MULTIPLE");
  });

  it("fails closed when exact release dependencies cannot be loaded", async () => {
    const report = await diagnosePlatformOwnerBootstrap({
      environment,
      dependencies: {
        requireFromRelease() {
          throw new Error("release dependency unavailable");
        },
      },
    });

    expect(report.NODE_PRISMA_CLIENT_READY).toBe("FAIL");
    expect(report.NODE_PRISMA_SAFE_CLASS).toBe(
      "PRISMA_CLIENT_INITIALIZATION_FAILED",
    );
    expect(report.PLATFORM_OWNER_DIAGNOSTIC).toBe("FAIL");
  });

  it("classifies a generated-client failure while continuing read-only database checks", async () => {
    const client = new FakeClient();
    const report = await diagnosePlatformOwnerBootstrap({
      environment,
      dependencies: {
        client,
        requireFromRelease(name) {
          if (name === "@prisma/client") {
            return {
              PrismaClient: class {
                constructor() {
                  throw new Error(
                    "Prisma Client did not initialize yet. Please run prisma generate",
                  );
                }
              },
            };
          }
          return { Client: class {} };
        },
      },
    });

    expect(report.NODE_PRISMA_CLIENT_READY).toBe("FAIL");
    expect(report.NODE_PRISMA_SAFE_CLASS).toBe("PRISMA_CLIENT_NOT_GENERATED");
    expect(report.DATABASE_SESSION).toBe("PASS");
    expect(report.PLATFORM_OWNER_DIAGNOSTIC).toBe("PASS");
    expect(report.BOOTSTRAP_EXECUTION_PATH_READY).toBe("FAIL");
    expect(report.PLATFORM_OWNER_BOOTSTRAP_ROOT_CAUSE).toBe(
      "PRISMA_CLIENT_NOT_GENERATED",
    );
    expect(client.queries).toContain("BEGIN READ ONLY");
    expect(client.queries).toContain("ROLLBACK");
    expect(client.queries.join("\n")).not.toMatch(
      /\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+(?:TABLE|INDEX|POLICY)|DROP\s+(?:TABLE|INDEX|POLICY))\b/i,
    );
  });

  it("checks the owner guard with a parameterized semantic predicate", async () => {
    const client = new FakeClient();
    const prisma = createFakePrismaClient();
    const report = await diagnosePlatformOwnerBootstrap({
      environment,
      dependencies: {
        client,
        requireFromRelease() {
          return {
            PrismaClient: FakePrismaClient,
          };
        },
        createPrismaClient: prisma.create,
      },
    });
    const migrationQueryIndex = client.queries.findIndex((query) =>
      query.includes("pg_catalog.pg_index"),
    );

    expect(report.MIGRATION_0025_INVARIANT_PRESENT).toBe("PASS");
    expect(client.queries[migrationQueryIndex]).toContain("= $1");
    expect(client.queries[migrationQueryIndex]).toContain("regexp_replace");
    expect(client.queries[migrationQueryIndex]).not.toContain('= \\"(');
    expect(client.parameters[migrationQueryIndex]).toEqual([
      "role_key='PLATFORM_OWNER'::textANDstatus='ACTIVE'::text",
    ]);
  });

  it("distinguishes bootstrap user and existing-owner states without exposing identity", async () => {
    const prisma = createFakePrismaClient();
    const report = await diagnosePlatformOwnerBootstrap({
      environment,
      dependencies: {
        client: new FakeClient({
          users: [{ verified: false }],
          owners: [{}, {}],
        }),
        requireFromRelease() {
          return {
            PrismaClient: FakePrismaClient,
          };
        },
        createPrismaClient: prisma.create,
      },
    });

    expect(report.BOOTSTRAP_USER_MATCH_COUNT).toBe("ONE");
    expect(report.BOOTSTRAP_USER_VERIFIED).toBe("NO");
    expect(report.ACTIVE_PLATFORM_OWNER_COUNT).toBe("MULTIPLE");
    expect(safeRootCause(report)).toBe("BOOTSTRAP_USER_UNVERIFIED");
  });

  it("uses the exact Prisma transaction shape with a read-only transaction", async () => {
    const client = new FakeClient();
    const prisma = createFakePrismaClient();
    const report = await diagnosePlatformOwnerBootstrap({
      environment,
      dependencies: {
        client,
        requireFromRelease() {
          return { PrismaClient: FakePrismaClient };
        },
        createPrismaClient: prisma.create,
      },
    });

    expect(report.NODE_PRISMA_CLIENT_READY).toBe("PASS");
    expect(report.PRISMA_READ_ONLY_TRANSACTION).toBe("PASS");
    expect(prisma.client.transactionQueries).toEqual([
      "SET TRANSACTION READ ONLY",
      "SELECT 1",
    ]);
    expect(prisma.client.transactionQueries.join("\n")).not.toMatch(
      /\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+(?:TABLE|INDEX|POLICY)|DROP\s+(?:TABLE|INDEX|POLICY))\b/i,
    );
  });

  it("classifies a Prisma transaction runtime failure without exposing its cause", async () => {
    const runtimeFailure = new Error("driver failed for owner@example.invalid");
    runtimeFailure.name = "PrismaClientUnknownRequestError";
    const report = await diagnosePlatformOwnerBootstrap({
      environment,
      dependencies: {
        client: new FakeClient(),
        requireFromRelease() {
          return { PrismaClient: FakePrismaClient };
        },
        createPrismaClient() {
          return {
            async $transaction() {
              throw runtimeFailure;
            },
            async $disconnect() {},
          };
        },
      },
    });

    expect(report.NODE_PRISMA_CLIENT_READY).toBe("FAIL");
    expect(report.PRISMA_READ_ONLY_TRANSACTION_SAFE_CLASS).toBe(
      "PRISMA_CLIENT_RUNTIME_TRANSACTION_FAILED",
    );
    expect(report.PLATFORM_OWNER_BOOTSTRAP_ROOT_CAUSE).toBe(
      "PRISMA_CLIENT_RUNTIME_TRANSACTION_FAILED",
    );
    const lines = [];
    emitDiagnostic(report, (line) => lines.push(line));
    expect(lines.join("\n")).not.toContain("owner@example.invalid");
  });

  it("fails closed when forced RLS applies to either bootstrap write table", async () => {
    const prisma = createFakePrismaClient();
    const report = await diagnosePlatformOwnerBootstrap({
      environment,
      dependencies: {
        client: new FakeClient({ operators_insert_bypasses_rls: false }),
        requireFromRelease() {
          return { PrismaClient: FakePrismaClient };
        },
        createPrismaClient: prisma.create,
      },
    });

    expect(report.BOOTSTRAP_RLS_WRITE_PATH).toBe("FAIL");
    expect(report.BOOTSTRAP_EXECUTION_PATH_READY).toBe("FAIL");
    expect(report.PLATFORM_OWNER_BOOTSTRAP_ROOT_CAUSE).toBe(
      "DATABASE_RLS_BOOTSTRAP_PATH_DENIED",
    );
  });

  it("emits only safe classifications", () => {
    const lines = [];
    emitDiagnostic(
      {
        DATABASE_SAFE_CLASS: "DATABASE_AUTH_FAILED",
        DATABASE_SQLSTATE: "28P01",
        PLATFORM_OWNER_BOOTSTRAP_ROOT_CAUSE: "PRISMA_CLIENT_NOT_GENERATED",
      },
      (line) => lines.push(line),
    );
    expect(lines.join("\n")).not.toContain("owner@example.invalid");
    expect(lines.join("\n")).not.toContain("postgresql://");
  });

  it("contains no production mutation statement or owner assignment call", () => {
    const source = readFileSync(
      "scripts/diagnose-v2-production-platform-owner-bootstrap.mjs",
      "utf8",
    );
    expect(source).toContain("BEGIN READ ONLY");
    expect(source).toContain("SET TRANSACTION READ ONLY");
    expect(source).toContain('client.query("ROLLBACK")');
    expect(source).not.toMatch(
      /\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+(?:TABLE|INDEX|POLICY)|DROP\s+(?:TABLE|INDEX|POLICY)|pg_advisory_xact_lock)\b/i,
    );
    expect(source).not.toContain("assignPlatformOwner");
  });
});
