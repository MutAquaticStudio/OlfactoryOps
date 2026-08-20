import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const smokeHostnamePattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/

export const productionSmokeIdentityInventorySql = `
  WITH active_smoke_tenants AS (
    SELECT hostname.hostname, hostname.organization_id
    FROM public.v2_workspace_hostnames AS hostname
    INNER JOIN public.v2_organizations AS organization ON organization.id = hostname.organization_id
    WHERE hostname.hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.next\\.labofscents\\.org$'
      AND hostname.status = 'ACTIVE'
      AND organization.status = 'ACTIVE'
  ),
  active_non_owner_identities AS (
    SELECT tenant.hostname
    FROM active_smoke_tenants AS tenant
    INNER JOIN public.v2_memberships AS membership ON membership.organization_id = tenant.organization_id
    INNER JOIN public.v2_users AS user_record ON user_record.id = membership.user_id
    WHERE membership.status = 'ACTIVE'
      AND user_record.status = 'ACTIVE'
      AND user_record.verified_at IS NOT NULL
      AND length(user_record.password_hash) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.v2_platform_operators AS operator
        WHERE operator.user_id = user_record.id
          AND operator.role_key = 'PLATFORM_OWNER'
          AND operator.status = 'ACTIVE'
      )
  )
  SELECT
    EXISTS (SELECT 1 FROM active_smoke_tenants) AS smoke_tenant_available,
    EXISTS (SELECT 1 FROM active_non_owner_identities) AS smoke_login_identity_available,
    EXISTS (
      SELECT 1
      FROM public.v2_platform_operators AS operator
      WHERE operator.role_key = 'PLATFORM_OWNER'
        AND operator.status = 'ACTIVE'
    ) AS active_platform_owner_available,
    (SELECT hostname FROM active_non_owner_identities ORDER BY hostname ASC LIMIT 1) AS smoke_tenant_hostname
`

function yesNo(value) {
  return value === true ? 'YES' : 'NO'
}

export function summarizeProductionSmokeIdentityAvailability(row) {
  const tenantAvailable = row?.smoke_tenant_available === true
  const hostname = typeof row?.smoke_tenant_hostname === 'string' && smokeHostnamePattern.test(row.smoke_tenant_hostname)
    ? row.smoke_tenant_hostname
    : undefined
  const identityAvailable = row?.smoke_login_identity_available === true && Boolean(hostname)
  const platformOwnerReuseRequired = !identityAvailable && row?.active_platform_owner_available === true
  const report = [
    `EXISTING_SMOKE_TENANT_AVAILABLE=${yesNo(tenantAvailable)}`,
    `EXISTING_SMOKE_LOGIN_IDENTITY_AVAILABLE=${yesNo(identityAvailable)}`,
    `PLATFORM_OWNER_CREDENTIAL_REUSE_REQUIRED=${yesNo(platformOwnerReuseRequired)}`,
  ]

  if (identityAvailable) report.push(`EXISTING_SMOKE_TENANT_HOSTNAME=${hostname}`)
  return report
}

export async function inspectProductionSmokeIdentityAvailability({
  environment = process.env,
  pgModule,
  emit = console.log,
} = {}) {
  let client

  try {
    const releaseRoot = environment.RELEASE_WORKTREE || process.cwd()
    const pg = pgModule ?? createRequire(`${releaseRoot}/package.json`)('pg')
    client = new pg.Client({
      connectionString: environment.PRODUCTION_DATABASE_URL,
      connectionTimeoutMillis: 15_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    })
    await client.connect()
    const result = await client.query(productionSmokeIdentityInventorySql)
    const report = summarizeProductionSmokeIdentityAvailability(result.rows?.[0])
    report.forEach(emit)
    return { pass: true, report }
  } catch {
    const report = summarizeProductionSmokeIdentityAvailability()
    report.forEach(emit)
    return { pass: false, report }
  } finally {
    try {
      await client?.end?.()
    } catch {}
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectProductionSmokeIdentityAvailability()
  if (!result.pass) process.exitCode = 1
}
