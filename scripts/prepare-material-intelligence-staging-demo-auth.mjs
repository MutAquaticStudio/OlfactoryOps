import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;

export const STAGING_WORKSPACE_BASE_DOMAIN = "api-beta.labofscents.org";
export const FIXTURE_APPROVAL = "VERIFY_VC_DEMO_STAGING_FIXTURE";
export const fixtureAdvisoryLockSql =
  "SELECT pg_advisory_xact_lock(hashtext('olfactoryops:v2:staging-material-demo-auth-fixture'))";

export const fixtureUserLookupSql = `
  SELECT id, status, verified_at IS NOT NULL AS "verified"
  FROM public.v2_users
  WHERE lower(email) = lower($1)
  ORDER BY id
  LIMIT 2
  FOR UPDATE
`;

export const fixtureWorkspaceLookupSql = `
  SELECT
    membership.organization_id AS "organizationId",
    membership.role_key AS "roleKey",
    membership.status AS "membershipStatus",
    organization.status AS "organizationStatus",
    hostname.kind AS "hostnameKind",
    hostname.status AS "hostnameStatus",
    (
      SELECT count(*)::int
      FROM public.v2_memberships AS active_membership
      WHERE active_membership.user_id = $1
        AND active_membership.status = 'ACTIVE'
    ) AS "activeMembershipCount"
  FROM public.v2_memberships AS membership
  INNER JOIN public.v2_organizations AS organization
    ON organization.id = membership.organization_id
  INNER JOIN public.v2_workspace_hostnames AS hostname
    ON hostname.organization_id = membership.organization_id
  WHERE membership.user_id = $1
    AND organization.slug = $2
    AND hostname.hostname = $3
  ORDER BY membership.id, hostname.id
  LIMIT 2
`;

export const fixtureVerificationUpdateSql = `
  UPDATE public.v2_users
  SET verified_at = COALESCE(verified_at, now()),
      updated_at = now()
  WHERE id = $1
    AND status = 'ACTIVE'
    AND verified_at IS NULL
  RETURNING id
`;

export const fixtureAuditInsertSql = `
  INSERT INTO public.v2_audit_events (
    id,
    organization_id,
    actor_user_id,
    action,
    outcome,
    subject_type,
    subject_id,
    correlation_id,
    payload_hash
  )
  VALUES ($1, $2, NULL, 'platform.fixture.email_verification', 'allowed', 'user', $3, $4, $5)
  RETURNING id
`;

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export class DemoAuthFixtureError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function required(condition, code) {
  if (!condition) throw new DemoAuthFixtureError(code);
}

function databaseOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new DemoAuthFixtureError("MATERIAL_DEMO_AUTH_FIXTURE_INPUT_INVALID");
  }
  required(
    ["postgres:", "postgresql:"].includes(parsed.protocol)
      && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname),
    "MATERIAL_DEMO_AUTH_FIXTURE_INPUT_INVALID",
  );
  return parsed.toString();
}

export function stagingDemoAuthFixtureInputs(environment = process.env) {
  required(
    environment.V2_VC_DEMO_FIXTURE_ENVIRONMENT === "staging"
      && environment.V2_VC_DEMO_FIXTURE_APPROVED === FIXTURE_APPROVAL,
    "MATERIAL_DEMO_AUTH_FIXTURE_BLOCKED",
  );

  const databaseUrl = databaseOrigin(environment.STAGING_DATABASE_URL ?? "");
  const tenantSlug = environment.MATERIAL_DEMO_TENANT_SLUG?.trim().toLowerCase() ?? "";
  const email = environment.MATERIAL_DEMO_LOGIN_EMAIL?.trim().toLowerCase() ?? "";

  required(slugPattern.test(tenantSlug), "MATERIAL_DEMO_AUTH_FIXTURE_INPUT_INVALID");
  required(
    email.length >= 3 && email.length <= 320 && email.includes("@"),
    "MATERIAL_DEMO_AUTH_FIXTURE_INPUT_INVALID",
  );

  return {
    databaseUrl,
    tenantSlug,
    email,
    hostname: `${tenantSlug}.${STAGING_WORKSPACE_BASE_DOMAIN}`,
  };
}

function exactUser(rows) {
  required(rows.length === 1, "MATERIAL_DEMO_AUTH_FIXTURE_USER_NOT_EXACT");
  const user = rows[0];
  required(
    typeof user?.id === "string" && user.id.length > 0 && user.status === "ACTIVE",
    "MATERIAL_DEMO_AUTH_FIXTURE_USER_NOT_ACTIVE",
  );
  return user;
}

function exactWorkspace(rows) {
  required(rows.length === 1, "MATERIAL_DEMO_AUTH_FIXTURE_WORKSPACE_NOT_EXACT");
  const workspace = rows[0];
  required(
    workspace?.roleKey === "Owner"
      && workspace.membershipStatus === "ACTIVE"
      && workspace.organizationStatus === "ACTIVE"
      && workspace.hostnameKind === "DEFAULT"
      && workspace.hostnameStatus === "ACTIVE"
      && workspace.activeMembershipCount === 1,
    "MATERIAL_DEMO_AUTH_FIXTURE_PRECONDITION_FAILED",
  );
  return workspace;
}

function fixturePayloadHash(userId, organizationId, hostname) {
  return createHash("sha256")
    .update(`staging-material-demo-auth-fixture:${userId}:${organizationId}:${hostname}`)
    .digest("hex");
}

export async function prepareStagingDemoAuthFixture({
  environment = process.env,
  clientFactory = (connectionString) => new Client({
    connectionString,
    connectionTimeoutMillis: 15_000,
  }),
} = {}) {
  const inputs = stagingDemoAuthFixtureInputs(environment);
  const client = clientFactory(inputs.databaseUrl);
  let began = false;

  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    began = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '20s'");
    await client.query(fixtureAdvisoryLockSql);
    await client.query("SELECT set_config('app.login_email', $1, true)", [inputs.email]);

    const initialUsers = await client.query(fixtureUserLookupSql, [inputs.email]);
    const user = exactUser(initialUsers.rows);
    await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
    await client.query("SELECT set_config('app.request_hostname', $1, true)", [inputs.hostname]);

    const initialWorkspaces = await client.query(fixtureWorkspaceLookupSql, [
      user.id,
      inputs.tenantSlug,
      inputs.hostname,
    ]);
    const workspace = exactWorkspace(initialWorkspaces.rows);
    await client.query("SELECT set_config('app.organization_id', $1, true)", [workspace.organizationId]);

    let disposition = "ALREADY_VERIFIED";
    let auditAppended = false;
    if (user.verified !== true) {
      const updated = await client.query(fixtureVerificationUpdateSql, [user.id]);
      required(updated.rowCount === 1, "MATERIAL_DEMO_AUTH_FIXTURE_UPDATE_CONFLICT");

      const audit = await client.query(fixtureAuditInsertSql, [
        `aud_demo_verify_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
        workspace.organizationId,
        user.id,
        randomUUID(),
        fixturePayloadHash(user.id, workspace.organizationId, inputs.hostname),
      ]);
      required(audit.rowCount === 1, "MATERIAL_DEMO_AUTH_FIXTURE_AUDIT_FAILED");
      disposition = "VERIFIED_NOW";
      auditAppended = true;
    }

    const finalUsers = await client.query(fixtureUserLookupSql, [inputs.email]);
    const finalUser = exactUser(finalUsers.rows);
    required(finalUser.id === user.id && finalUser.verified === true, "MATERIAL_DEMO_AUTH_FIXTURE_POSTCONDITION_FAILED");

    const finalWorkspaces = await client.query(fixtureWorkspaceLookupSql, [
      user.id,
      inputs.tenantSlug,
      inputs.hostname,
    ]);
    const finalWorkspace = exactWorkspace(finalWorkspaces.rows);
    required(
      finalWorkspace.organizationId === workspace.organizationId,
      "MATERIAL_DEMO_AUTH_FIXTURE_POSTCONDITION_FAILED",
    );

    await client.query("COMMIT");
    began = false;
    return {
      disposition,
      activeMembershipCount: finalWorkspace.activeMembershipCount,
      auditAppended,
    };
  } catch (error) {
    if (began) await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof DemoAuthFixtureError) throw error;
    throw new DemoAuthFixtureError("MATERIAL_DEMO_AUTH_FIXTURE_DATABASE_FAILURE");
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareStagingDemoAuthFixture()
    .then((result) => {
      console.log("MATERIAL_DEMO_AUTH_FIXTURE=PASS");
      console.log(`MATERIAL_DEMO_AUTH_FIXTURE_DISPOSITION=${result.disposition}`);
      console.log(`MATERIAL_DEMO_AUTH_FIXTURE_ACTIVE_MEMBERSHIP_COUNT=${result.activeMembershipCount}`);
      console.log(`MATERIAL_DEMO_AUTH_FIXTURE_AUDIT_APPENDED=${result.auditAppended ? "YES" : "NO"}`);
    })
    .catch((error) => {
      const code = error instanceof DemoAuthFixtureError
        ? error.code
        : "MATERIAL_DEMO_AUTH_FIXTURE_FAILED";
      console.error(code);
      process.exitCode = 1;
    });
}
