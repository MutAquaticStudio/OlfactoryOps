import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requiredColumns = {
  v2_users: ["email", "verified_at"],
  v2_platform_operators: [
    "id",
    "user_id",
    "role_key",
    "status",
    "mfa_required",
  ],
  v2_platform_audit_events: [
    "id",
    "actor_user_id",
    "actor_role",
    "action",
    "outcome",
    "subject_type",
    "subject_id",
    "reason",
    "correlation_id",
  ],
};

const requiredTables = Object.keys(requiredColumns);
const platformOwnerGuardPredicate =
  "role_key='PLATFORM_OWNER'::textANDstatus='ACTIVE'::text";

export function safeSqlState(error) {
  return typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : "NONE";
}

export function classifyDatabaseFailure(error) {
  const sqlState = safeSqlState(error);
  const message = error instanceof Error ? error.message : "";

  if (sqlState === "28P01" || sqlState === "28000") {
    return { safeClass: "DATABASE_AUTH_FAILED", sqlState };
  }
  if (sqlState === "42P01") {
    return { safeClass: "DATABASE_TABLE_MISSING", sqlState };
  }
  if (sqlState === "42703") {
    return { safeClass: "DATABASE_COLUMN_MISSING", sqlState };
  }
  if (sqlState === "42501") {
    return { safeClass: "DATABASE_PERMISSION_DENIED", sqlState };
  }
  if (/tls|ssl|certificate/i.test(message)) {
    return { safeClass: "DATABASE_TLS_FAILED", sqlState };
  }
  if (/connect|socket|timeout|refused|dns|network/i.test(message)) {
    return { safeClass: "DATABASE_CONNECTION_FAILED", sqlState };
  }
  return { safeClass: "UNKNOWN_DATABASE_RUNTIME_FAILURE", sqlState };
}

export function classifyPrismaFailure(error) {
  const message = error instanceof Error ? error.message : "";
  if (/did not initialize|prisma generate/i.test(message)) {
    return "PRISMA_CLIENT_NOT_GENERATED";
  }
  if (error?.name === "PrismaClientInitializationError") {
    return "PRISMA_CLIENT_INITIALIZATION_FAILED";
  }
  return "PRISMA_CLIENT_INITIALIZATION_FAILED";
}

export function countClass(count) {
  if (count === 0) return "ZERO";
  if (count === 1) return "ONE";
  return "MULTIPLE";
}

export function safeRootCause(report) {
  if (report.NODE_PRISMA_CLIENT_READY === "FAIL") {
    return report.NODE_PRISMA_SAFE_CLASS;
  }
  if (report.DATABASE_TCP_CONNECTIVITY !== "PASS") {
    return report.DATABASE_SAFE_CLASS;
  }
  if (report.REQUIRED_TABLES_EXIST !== "PASS") return "DATABASE_TABLE_MISSING";
  if (report.REQUIRED_COLUMNS_EXIST !== "PASS")
    return "DATABASE_COLUMN_MISSING";
  if (report.MIGRATION_0025_INVARIANT_PRESENT !== "PASS") {
    return "DATABASE_MIGRATION_GUARD_MISSING";
  }
  if (report.BOOTSTRAP_USER_MATCH_COUNT !== "ONE") {
    return report.BOOTSTRAP_USER_MATCH_COUNT === "ZERO"
      ? "BOOTSTRAP_USER_NOT_FOUND"
      : "BOOTSTRAP_USER_AMBIGUOUS";
  }
  if (report.BOOTSTRAP_USER_VERIFIED !== "YES")
    return "BOOTSTRAP_USER_UNVERIFIED";
  if (report.ACTIVE_PLATFORM_OWNER_COUNT !== "ZERO") {
    return "PLATFORM_OWNER_ALREADY_ASSIGNED";
  }
  if (report.PLATFORM_AUDIT_TABLE_WRITABILITY_PREREQUISITES !== "PASS") {
    return "AUDIT_TABLE_PREREQUISITE_FAILED";
  }
  if (report.BOOTSTRAP_ROLE_PRIVILEGES !== "PASS") {
    return "DATABASE_PERMISSION_DENIED";
  }
  return "UNKNOWN_DATABASE_RUNTIME_FAILURE";
}

function defaultReport() {
  return {
    NODE_PRISMA_CLIENT_READY: "UNPROVEN",
    NODE_PRISMA_SAFE_CLASS: "UNPROVEN",
    DATABASE_TCP_CONNECTIVITY: "UNPROVEN",
    DATABASE_AUTHENTICATION: "UNPROVEN",
    DATABASE_SESSION: "UNPROVEN",
    REQUIRED_TABLES_EXIST: "UNPROVEN",
    REQUIRED_COLUMNS_EXIST: "UNPROVEN",
    MIGRATION_0025_INVARIANT_PRESENT: "UNPROVEN",
    BOOTSTRAP_USER_LOOKUP_EXECUTABLE: "UNPROVEN",
    BOOTSTRAP_USER_MATCH_COUNT: "UNPROVEN",
    BOOTSTRAP_USER_VERIFIED: "UNPROVEN",
    PLATFORM_OWNER_LOOKUP_EXECUTABLE: "UNPROVEN",
    ACTIVE_PLATFORM_OWNER_COUNT: "UNPROVEN",
    PLATFORM_AUDIT_TABLE_WRITABILITY_PREREQUISITES: "UNPROVEN",
    BOOTSTRAP_ROLE_PRIVILEGES: "UNPROVEN",
    DATABASE_SAFE_CLASS: "UNPROVEN",
    DATABASE_SQLSTATE: "NONE",
    BOOTSTRAP_EXECUTION_PATH_READY: "FAIL",
    PLATFORM_OWNER_DIAGNOSTIC: "FAIL",
    PLATFORM_OWNER_BOOTSTRAP_ROOT_CAUSE: "UNKNOWN_DATABASE_RUNTIME_FAILURE",
  };
}

function requireReleaseDependencies(releaseRoot) {
  return createRequire(resolve(releaseRoot, "package.json"));
}

async function verifyPrismaClient(requireFromRelease) {
  try {
    const { PrismaClient } = requireFromRelease("@prisma/client");
    const client = new PrismaClient();
    await client.$disconnect();
    return { ready: true, safeClass: "NONE" };
  } catch (error) {
    return { ready: false, safeClass: classifyPrismaFailure(error) };
  }
}

function completeDatabaseReadiness(report) {
  return [
    "DATABASE_TCP_CONNECTIVITY",
    "DATABASE_AUTHENTICATION",
    "DATABASE_SESSION",
    "REQUIRED_TABLES_EXIST",
    "REQUIRED_COLUMNS_EXIST",
    "MIGRATION_0025_INVARIANT_PRESENT",
    "BOOTSTRAP_USER_LOOKUP_EXECUTABLE",
    "PLATFORM_OWNER_LOOKUP_EXECUTABLE",
    "PLATFORM_AUDIT_TABLE_WRITABILITY_PREREQUISITES",
    "BOOTSTRAP_ROLE_PRIVILEGES",
  ].every((key) => report[key] === "PASS");
}

async function queryReadOnly(client, report, email) {
  await client.query("BEGIN READ ONLY");
  try {
    const tables = await client.query(
      "SELECT count(*)::int AS matched FROM pg_catalog.pg_tables WHERE schemaname = $1 AND tablename = ANY($2::text[])",
      ["public", requiredTables],
    );
    report.REQUIRED_TABLES_EXIST =
      Number(tables.rows[0]?.matched) === requiredTables.length
        ? "PASS"
        : "FAIL";

    const columnRequirements = Object.entries(requiredColumns).flatMap(
      ([table, columns]) => columns.map((column) => ({ table, column })),
    );
    const columns = await client.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = ANY($2::text[])",
      ["public", requiredTables],
    );
    const presentColumns = new Set(
      columns.rows.map((row) => `${row.table_name}.${row.column_name}`),
    );
    report.REQUIRED_COLUMNS_EXIST = columnRequirements.every(
      ({ table, column }) => presentColumns.has(`${table}.${column}`),
    )
      ? "PASS"
      : "FAIL";

    const migration = await client.query(
      "SELECT count(*)::int AS matched FROM pg_catalog.pg_index idx JOIN pg_catalog.pg_class rel ON rel.oid = idx.indrelid JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace JOIN pg_catalog.pg_class ind ON ind.oid = idx.indexrelid WHERE ns.nspname = 'public' AND rel.relname = 'v2_platform_operators' AND ind.relname = 'v2_platform_operators_single_active_owner' AND idx.indisunique AND regexp_replace(pg_catalog.pg_get_expr(idx.indpred, idx.indrelid), '[[:space:]()]', '', 'g') = $1",
      [platformOwnerGuardPredicate],
    );
    report.MIGRATION_0025_INVARIANT_PRESENT =
      Number(migration.rows[0]?.matched) === 1 ? "PASS" : "FAIL";

    const users = await client.query(
      "SELECT verified_at IS NOT NULL AS verified FROM public.v2_users WHERE lower(email) = lower($1) ORDER BY id LIMIT 2",
      [email],
    );
    report.BOOTSTRAP_USER_LOOKUP_EXECUTABLE = "PASS";
    report.BOOTSTRAP_USER_MATCH_COUNT = countClass(users.rows.length);
    report.BOOTSTRAP_USER_VERIFIED =
      users.rows.length === 1 && users.rows[0]?.verified === true
        ? "YES"
        : "NO";

    const owners = await client.query(
      "SELECT 1 FROM public.v2_platform_operators WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE' LIMIT 2",
    );
    report.PLATFORM_OWNER_LOOKUP_EXECUTABLE = "PASS";
    report.ACTIVE_PLATFORM_OWNER_COUNT = countClass(owners.rows.length);

    const privileges = await client.query(
      "SELECT has_table_privilege(current_user, 'public.v2_users', 'SELECT') AS users_select, has_table_privilege(current_user, 'public.v2_platform_operators', 'SELECT') AS operators_select, has_table_privilege(current_user, 'public.v2_platform_operators', 'INSERT') AS operators_insert, has_table_privilege(current_user, 'public.v2_platform_audit_events', 'INSERT') AS audit_insert",
    );
    const row = privileges.rows[0] ?? {};
    report.PLATFORM_AUDIT_TABLE_WRITABILITY_PREREQUISITES =
      row.audit_insert === true && report.REQUIRED_COLUMNS_EXIST === "PASS"
        ? "PASS"
        : "FAIL";
    report.BOOTSTRAP_ROLE_PRIVILEGES =
      row.users_select === true &&
      row.operators_select === true &&
      row.operators_insert === true &&
      row.audit_insert === true
        ? "PASS"
        : "FAIL";
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}

export async function diagnosePlatformOwnerBootstrap({
  environment = process.env,
  dependencies = {},
} = {}) {
  const report = defaultReport();
  const email =
    environment.PLATFORM_OWNER_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const databaseUrl = environment.PLATFORM_BOOTSTRAP_DATABASE_URL;
  const releaseRoot = environment.RELEASE_WORKTREE || process.cwd();

  if (!email || !databaseUrl) {
    report.DATABASE_SAFE_CLASS = "DATABASE_CONNECTION_FAILED";
    report.PLATFORM_OWNER_BOOTSTRAP_ROOT_CAUSE = report.DATABASE_SAFE_CLASS;
    return report;
  }

  let requireFromRelease;
  try {
    requireFromRelease =
      dependencies.requireFromRelease ??
      requireReleaseDependencies(releaseRoot);
  } catch {
    report.NODE_PRISMA_CLIENT_READY = "FAIL";
    report.NODE_PRISMA_SAFE_CLASS = "PRISMA_CLIENT_INITIALIZATION_FAILED";
    report.DATABASE_SAFE_CLASS = "UNKNOWN_DATABASE_RUNTIME_FAILURE";
    report.PLATFORM_OWNER_BOOTSTRAP_ROOT_CAUSE = safeRootCause(report);
    return report;
  }
  const prisma = await verifyPrismaClient(requireFromRelease);
  report.NODE_PRISMA_CLIENT_READY = prisma.ready ? "PASS" : "FAIL";
  report.NODE_PRISMA_SAFE_CLASS = prisma.safeClass;

  let client;

  try {
    const pg = dependencies.pg ?? requireFromRelease("pg");
    client =
      dependencies.client ??
      new pg.Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 15_000,
        query_timeout: 15_000,
        statement_timeout: 15_000,
      });
    await client.connect();
    report.DATABASE_TCP_CONNECTIVITY = "PASS";
    report.DATABASE_AUTHENTICATION = "PASS";
    await client.query("SELECT 1");
    report.DATABASE_SESSION = "PASS";
    await queryReadOnly(client, report, email);
    report.DATABASE_SAFE_CLASS = "NONE";
  } catch (error) {
    const failure = classifyDatabaseFailure(error);
    report.DATABASE_SAFE_CLASS = failure.safeClass;
    report.DATABASE_SQLSTATE = failure.sqlState;
    if (report.DATABASE_TCP_CONNECTIVITY === "UNPROVEN") {
      report.DATABASE_TCP_CONNECTIVITY =
        failure.safeClass === "DATABASE_AUTH_FAILED" ? "PASS" : "FAIL";
      report.DATABASE_AUTHENTICATION =
        failure.safeClass === "DATABASE_AUTH_FAILED" ? "FAIL" : "UNPROVEN";
    } else if (report.DATABASE_SESSION === "UNPROVEN") {
      report.DATABASE_SESSION = "FAIL";
    }
    if (failure.safeClass === "DATABASE_TABLE_MISSING") {
      report.REQUIRED_TABLES_EXIST = "FAIL";
    }
    if (failure.safeClass === "DATABASE_COLUMN_MISSING") {
      report.REQUIRED_COLUMNS_EXIST = "FAIL";
    }
    if (failure.safeClass === "DATABASE_PERMISSION_DENIED") {
      report.BOOTSTRAP_ROLE_PRIVILEGES = "FAIL";
    }
  } finally {
    await client?.end().catch(() => undefined);
  }

  report.BOOTSTRAP_EXECUTION_PATH_READY =
    report.NODE_PRISMA_CLIENT_READY === "PASS" &&
    completeDatabaseReadiness(report)
      ? "PASS"
      : "FAIL";
  report.PLATFORM_OWNER_DIAGNOSTIC = completeDatabaseReadiness(report)
    ? "PASS"
    : "FAIL";
  report.PLATFORM_OWNER_BOOTSTRAP_ROOT_CAUSE = safeRootCause(report);
  return report;
}

export function emitDiagnostic(report, write = console.log) {
  for (const [key, value] of Object.entries(report)) {
    write(`${key}=${value}`);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await diagnosePlatformOwnerBootstrap();
  emitDiagnostic(report);
  process.exitCode = report.PLATFORM_OWNER_DIAGNOSTIC === "PASS" ? 0 : 1;
}
