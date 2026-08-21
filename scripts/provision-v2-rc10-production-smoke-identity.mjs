import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const productionSmokeTenantHostnamePattern =
  /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.labofscents\.org$/;
export const productionSmokeMembershipRole = "Viewer";

export function isProductionSmokeTenantHostname(value) {
  const match = typeof value === "string"
    ? productionSmokeTenantHostnamePattern.exec(value)
    : null;
  return Boolean(match) && !new Set(["api", "admin", "next", "www"]).has(match[1]);
}

export const smokeIdentityAdvisoryLockSql =
  "SELECT pg_advisory_xact_lock(hashtext('olfactoryops:v2:production-smoke-identity'))";
export const activeSmokeTenantLookupSql = `
  SELECT hostname.organization_id
  FROM public.v2_workspace_hostnames AS hostname
  INNER JOIN public.v2_organizations AS organization ON organization.id = hostname.organization_id
  WHERE hostname.hostname = $1
    AND hostname.status = 'ACTIVE'
    AND organization.status = 'ACTIVE'
  LIMIT 2
`;
export const viewerRolePolicyLookupSql = `
  SELECT id
  FROM public.v2_role_policies
  WHERE organization_id = $1 AND role_key = 'Viewer'
  LIMIT 2
`;
export const existingSmokeUserLookupSql =
  "SELECT id FROM public.v2_users WHERE lower(email) = lower($1) LIMIT 1";
export const insertSmokeUserSql = `
  INSERT INTO public.v2_users (id, email, display_name, password_hash, status, verified_at)
  VALUES ($1, $2, 'Production Smoke', $3, 'ACTIVE', now())
`;
export const insertSmokeMembershipSql = `
  INSERT INTO public.v2_memberships (id, organization_id, user_id, role_key, status)
  VALUES ($1, $2, $3, 'Viewer', 'ACTIVE')
`;
export const verifySmokeIdentitySql = `
  SELECT
    EXISTS (
      SELECT 1
      FROM public.v2_users AS user_record
      INNER JOIN public.v2_memberships AS membership
        ON membership.user_id = user_record.id
       AND membership.organization_id = $2
      WHERE user_record.id = $1
        AND user_record.status = 'ACTIVE'
        AND user_record.verified_at IS NOT NULL
        AND membership.status = 'ACTIVE'
        AND membership.role_key = 'Viewer'
    ) AS identity_ready,
    NOT EXISTS (
      SELECT 1
      FROM public.v2_platform_operators AS operator
      WHERE operator.user_id = $1
    ) AS no_platform_operator
`;
export const appendSmokeIdentityAuditSql = `
  INSERT INTO public.v2_audit_events (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id)
  VALUES ($1, $2, NULL, 'tenant.smoke_identity.provision', 'allowed', 'user', $3, $4)
`;

function opaqueId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function normalizedEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function safeSqlState(error) {
  return typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : "NONE";
}

export function safeProvisioningFailure(error) {
  const known = error instanceof Error ? error.message : "";
  if (known === "SMOKE_IDENTITY_CONFIG_INVALID") return known;
  if (known === "SMOKE_TENANT_NOT_EXACTLY_ONE") return known;
  if (known === "SMOKE_VIEWER_ROLE_POLICY_UNAVAILABLE") return known;
  if (known === "SMOKE_IDENTITY_ALREADY_EXISTS") return known;
  if (known === "SMOKE_IDENTITY_POSTCONDITION_FAILED") return known;
  if (known === "SMOKE_PASSWORD_HASH_INVALID") return known;

  const sqlState = safeSqlState(error);
  if (sqlState === "42501") return "SMOKE_IDENTITY_DATABASE_PERMISSION_DENIED";
  if (sqlState === "23505") return "SMOKE_IDENTITY_ALREADY_EXISTS";
  if (sqlState === "42P01" || sqlState === "42703")
    return "SMOKE_IDENTITY_SCHEMA_UNAVAILABLE";
  return "SMOKE_IDENTITY_TRANSACTION_FAILED";
}

export function provisioningConfig(environment = process.env) {
  const tenantHostname =
    environment.PRODUCTION_SMOKE_TENANT_HOSTNAME?.trim().toLowerCase();
  const email = normalizedEmail(environment.PRODUCTION_SMOKE_LOGIN_EMAIL);
  const password = environment.PRODUCTION_SMOKE_LOGIN_PASSWORD;
  const passwordPepper = environment.V2_PASSWORD_PEPPER;
  const databaseUrl = environment.PRODUCTION_DATABASE_URL;
  const releaseRoot = environment.RELEASE_WORKTREE;

  if (
    !releaseRoot ||
    !isProductionSmokeTenantHostname(tenantHostname) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 16 ||
    typeof passwordPepper !== "string" ||
    passwordPepper.length < 16 ||
    typeof databaseUrl !== "string" ||
    !databaseUrl
  ) {
    throw new Error("SMOKE_IDENTITY_CONFIG_INVALID");
  }

  return {
    tenantHostname,
    email,
    password,
    passwordPepper,
    databaseUrl,
    releaseRoot,
  };
}

export async function loadExactRc10PasswordHasher(releaseRoot) {
  const cryptoModule = await import(
    pathToFileURL(resolve(releaseRoot, "services/platform/src/crypto.ts")).href
  );
  if (typeof cryptoModule.hashPassword !== "function")
    throw new Error("SMOKE_PASSWORD_HASH_INVALID");
  return cryptoModule.hashPassword;
}

export function requireReleaseDependencies(releaseRoot) {
  return createRequire(resolve(releaseRoot, "package.json"));
}

export async function provisionDedicatedProductionSmokeIdentity(
  client,
  { tenantHostname, email, passwordHash, createId = opaqueId } = {},
) {
  await client.query("BEGIN");
  try {
    await client.query(smokeIdentityAdvisoryLockSql);
    const tenant = await client.query(activeSmokeTenantLookupSql, [
      tenantHostname,
    ]);
    if (
      tenant.rowCount !== 1 ||
      typeof tenant.rows[0]?.organization_id !== "string" ||
      !tenant.rows[0].organization_id
    ) {
      throw new Error("SMOKE_TENANT_NOT_EXACTLY_ONE");
    }
    const organizationId = tenant.rows[0].organization_id;

    await client.query("SELECT set_config('app.organization_id', $1, true)", [
      organizationId,
    ]);
    const rolePolicy = await client.query(viewerRolePolicyLookupSql, [
      organizationId,
    ]);
    if (rolePolicy.rowCount !== 1)
      throw new Error("SMOKE_VIEWER_ROLE_POLICY_UNAVAILABLE");

    await client.query("SELECT set_config('app.login_email', $1, true)", [
      email,
    ]);
    const existingUser = await client.query(existingSmokeUserLookupSql, [
      email,
    ]);
    if (existingUser.rowCount === 1) {
      const existingUserId = existingUser.rows[0]?.id;
      if (typeof existingUserId !== "string" || !existingUserId) {
        throw new Error("SMOKE_IDENTITY_ALREADY_EXISTS");
      }
      await client.query("SELECT set_config('app.user_id', $1, true)", [
        existingUserId,
      ]);
      const existingIdentity = await client.query(verifySmokeIdentitySql, [
        existingUserId,
        organizationId,
      ]);
      if (
        existingIdentity.rows[0]?.identity_ready !== true ||
        existingIdentity.rows[0]?.no_platform_operator !== true
      ) {
        throw new Error("SMOKE_IDENTITY_ALREADY_EXISTS");
      }
      await client.query("COMMIT");
      return;
    }
    if (existingUser.rowCount !== 0)
      throw new Error("SMOKE_IDENTITY_ALREADY_EXISTS");

    const userId = createId("usr_smoke");
    const membershipId = createId("mem_smoke");
    const auditId = createId("audit_smoke");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    await client.query(insertSmokeUserSql, [userId, email, passwordHash]);
    await client.query(insertSmokeMembershipSql, [
      membershipId,
      organizationId,
      userId,
    ]);

    const verified = await client.query(verifySmokeIdentitySql, [
      userId,
      organizationId,
    ]);
    if (
      verified.rows[0]?.identity_ready !== true ||
      verified.rows[0]?.no_platform_operator !== true
    ) {
      throw new Error("SMOKE_IDENTITY_POSTCONDITION_FAILED");
    }

    await client.query(appendSmokeIdentityAuditSql, [
      auditId,
      organizationId,
      userId,
      randomUUID(),
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function provisionProductionSmokeIdentity({
  environment = process.env,
  pgModule,
  passwordHasher,
  emit = console.log,
} = {}) {
  let client;
  try {
    const config = provisioningConfig(environment);
    const hashPassword =
      passwordHasher ?? (await loadExactRc10PasswordHasher(config.releaseRoot));
    const passwordHash = await hashPassword(
      config.email,
      config.password,
      config.passwordPepper,
    );
    if (
      typeof passwordHash !== "string" ||
      !/^pbkdf2:v2:sha256:120000:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(
        passwordHash,
      )
    ) {
      throw new Error("SMOKE_PASSWORD_HASH_INVALID");
    }
    const pg = pgModule ?? requireReleaseDependencies(config.releaseRoot)("pg");
    client = new pg.Client({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 15_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    });
    await client.connect();
    await provisionDedicatedProductionSmokeIdentity(client, {
      ...config,
      passwordHash,
    });
    emit("PRODUCTION_SMOKE_TENANT_HOSTNAME_READY=PASS");
    emit("PRODUCTION_SMOKE_LOGIN_IDENTITY_READY=PASS");
    emit("PRODUCTION_SMOKE_IDENTITY_ROLE=VIEWER");
    emit("PRODUCTION_SMOKE_PLATFORM_OPERATOR=ABSENT");
    emit("PRODUCTION_SMOKE_IDENTITY_PROVISIONING=PASS");
    return { pass: true };
  } catch (error) {
    emit(
      `PRODUCTION_SMOKE_IDENTITY_PROVISIONING=FAIL ${safeProvisioningFailure(error)}`,
    );
    return { pass: false };
  } finally {
    await client?.end?.().catch(() => undefined);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await provisionProductionSmokeIdentity();
  if (!result.pass) process.exitCode = 1;
}
