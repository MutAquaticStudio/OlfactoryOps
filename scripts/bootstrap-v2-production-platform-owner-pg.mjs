import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const bootstrapUserLookupSql =
  "SELECT id FROM v2_users WHERE email = $1 AND verified_at IS NOT NULL LIMIT 2";
const activeOwnerLookupSql =
  "SELECT id FROM v2_platform_operators WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE' LIMIT 1";
const platformOwnerAuditInsertSql = `
  INSERT INTO v2_platform_audit_events (id, actor_user_id, actor_role, action, outcome, subject_type, subject_id, reason, correlation_id)
  VALUES ($1, $2, 'PLATFORM_OWNER', 'platform.owner.bootstrap', 'ALLOWED', 'platform_operator', $3, 'protected one-time bootstrap', $4)`;

export function safeSqlState(error) {
  return typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : "NONE";
}

export function safeBootstrapFailure(error, releaseContract) {
  const sqlState = safeSqlState(error);
  if (sqlState === "42501") return "BOOTSTRAP_DATABASE_PERMISSION_DENIED";
  if (sqlState === "23505") return "BOOTSTRAP_OWNER_ALREADY_ASSIGNED";
  if (sqlState === "42P01" || sqlState === "42703") {
    return "BOOTSTRAP_SCHEMA_NOT_READY";
  }
  return releaseContract.safeBootstrapFailure(error);
}

export function requireReleaseDependencies(releaseRoot) {
  return createRequire(resolve(releaseRoot, "package.json"));
}

export async function loadReleaseBootstrapContract(releaseRoot) {
  const moduleUrl = pathToFileURL(
    resolve(releaseRoot, "scripts", "bootstrap-platform-owner.mjs"),
  ).href;
  const contract = await import(moduleUrl);
  if (
    typeof contract.bootstrapConfig !== "function" ||
    typeof contract.safeBootstrapFailure !== "function" ||
    typeof contract.platformOwnerAdvisoryLockSql !== "string" ||
    typeof contract.platformOwnerInsertSql !== "string"
  ) {
    throw new Error("BOOTSTRAP_RELEASE_CONTRACT_INVALID");
  }
  return contract;
}

function opaqueId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export async function assignPlatformOwnerWithPg(
  client,
  releaseContract,
  email,
) {
  await client.query("BEGIN");
  try {
    await client.query(releaseContract.platformOwnerAdvisoryLockSql);
    const users = await client.query(bootstrapUserLookupSql, [email]);
    if (users.rowCount !== 1) {
      throw new Error("BOOTSTRAP_USER_NOT_UNIQUE_OR_UNVERIFIED");
    }

    const existing = await client.query(activeOwnerLookupSql);
    if (existing.rowCount !== 0) {
      throw new Error("BOOTSTRAP_OWNER_ALREADY_ASSIGNED");
    }

    const userId = users.rows[0]?.id;
    if (typeof userId !== "string" || userId.length === 0) {
      throw new Error("BOOTSTRAP_USER_NOT_UNIQUE_OR_UNVERIFIED");
    }

    const inserted = await client.query(
      releaseContract.platformOwnerInsertSql,
      [opaqueId("pop"), userId],
    );
    if (inserted.rowCount !== 1) {
      throw new Error("BOOTSTRAP_OWNER_ALREADY_ASSIGNED");
    }

    await client.query(platformOwnerAuditInsertSql, [
      opaqueId("pae"),
      userId,
      userId,
      randomUUID(),
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function main(environment = process.env, dependencies = {}) {
  const releaseRoot = environment.RELEASE_WORKTREE;
  let client;
  let releaseContract;
  try {
    if (!releaseRoot) throw new Error("BOOTSTRAP_RELEASE_CONTRACT_INVALID");
    releaseContract =
      dependencies.releaseContract ??
      (await loadReleaseBootstrapContract(releaseRoot));
    const { email, databaseUrl } = releaseContract.bootstrapConfig(environment);
    client = dependencies.client;
    if (!client) {
      const requireFromRelease =
        dependencies.requireFromRelease ??
        requireReleaseDependencies(releaseRoot);
      const pg = dependencies.pg ?? requireFromRelease("pg");
      client = new pg.Client({ connectionString: databaseUrl });
    }
    await client.connect();
    await assignPlatformOwnerWithPg(client, releaseContract, email);
    console.log("PLATFORM_OWNER_BOOTSTRAP=PASS");
    return 0;
  } catch (error) {
    const failure = releaseContract
      ? safeBootstrapFailure(error, releaseContract)
      : "BOOTSTRAP_RELEASE_CONTRACT_INVALID";
    console.error(`PLATFORM_OWNER_BOOTSTRAP=FAIL ${failure}`);
    return 1;
  } finally {
    await client?.end().catch(() => undefined);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main();
}
