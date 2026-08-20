import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const releaseRoot = process.env.RELEASE_WORKTREE || process.cwd()
const pg = createRequire(`${releaseRoot}/package.json`)('pg')

export function isProductionSmokeTenantHostname(value) {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/.test(value)
}

export async function verifyProductionSmokeTenantReadiness({
  environment = process.env,
  clientFactory = (options) => new pg.Client(options),
  emit = (line) => console.log(line),
} = {}) {
  const hostname = environment.PRODUCTION_SMOKE_TENANT_HOSTNAME?.trim()
  const email = environment.PRODUCTION_SMOKE_LOGIN_EMAIL?.trim()
  const password = environment.PRODUCTION_SMOKE_LOGIN_PASSWORD
  let client

  try {
    if (!isProductionSmokeTenantHostname(hostname)) throw new Error('TENANT_CONFIG')
    if (!email || !password) throw new Error('LOGIN_CONFIG')
    client = clientFactory({
      connectionString: environment.PRODUCTION_DATABASE_URL,
      connectionTimeoutMillis: 15_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    })
    await client.connect()
    const result = await client.query(
      `SELECT EXISTS (
         SELECT 1
         FROM public.v2_workspace_hostnames hostname
         INNER JOIN public.v2_organizations organization ON organization.id = hostname.organization_id
         INNER JOIN public.v2_users user_record ON user_record.email = $2 AND user_record.status = 'ACTIVE'
         INNER JOIN public.v2_memberships membership ON membership.organization_id = organization.id AND membership.user_id = user_record.id AND membership.status = 'ACTIVE'
         WHERE hostname.hostname = $1
           AND hostname.status = 'ACTIVE'
           AND organization.status = 'ACTIVE'
       ) AS active`,
      [hostname, email],
    )
    if (result.rows[0]?.active !== true) throw new Error('TENANT_OR_IDENTITY_NOT_ACTIVE')
    emit('PRODUCTION_SMOKE_TENANT_HOSTNAME_READY=PASS')
    emit('PRODUCTION_SMOKE_LOGIN_IDENTITY_READY=PASS')
    return { pass: true }
  } catch {
    emit('PRODUCTION_SMOKE_TENANT_HOSTNAME_READY=UNPROVEN')
    emit('PRODUCTION_SMOKE_LOGIN_IDENTITY_READY=UNPROVEN')
    return { pass: false }
  } finally {
    await client?.end().catch(() => undefined)
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await verifyProductionSmokeTenantReadiness()
  if (!result.pass) process.exitCode = 1
}
