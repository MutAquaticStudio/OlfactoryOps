import { createRequire } from 'node:module'

const releaseRoot = process.env.RELEASE_WORKTREE || process.cwd()
const pg = createRequire(`${releaseRoot}/package.json`)('pg')
const hostname = process.env.PRODUCTION_SMOKE_TENANT_HOSTNAME?.trim()
const email = process.env.PRODUCTION_SMOKE_LOGIN_EMAIL?.trim()
const password = process.env.PRODUCTION_SMOKE_LOGIN_PASSWORD
let client

try {
  if (!hostname || !/^next\.labofscents\.org$/.test(hostname)) throw new Error('TENANT_CONFIG')
  if (!email || !password) throw new Error('LOGIN_CONFIG')
  client = new pg.Client({ connectionString: process.env.PRODUCTION_DATABASE_URL, connectionTimeoutMillis: 15_000, query_timeout: 15_000, statement_timeout: 15_000 })
  await client.connect()
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM public.v2_workspace_hostnames hostname
       INNER JOIN public.v2_organizations organization ON organization.id = hostname.organization_id
       WHERE hostname.hostname = $1
         AND hostname.status = 'ACTIVE'
         AND organization.status = 'ACTIVE'
     ) AS active`,
    [hostname],
  )
  if (result.rows[0]?.active !== true) throw new Error('TENANT_NOT_ACTIVE')
  console.log('PRODUCTION_SMOKE_TENANT_HOSTNAME_READY=PASS')
  console.log('PRODUCTION_SMOKE_LOGIN_IDENTITY_READY=PASS')
} catch {
  console.log('PRODUCTION_SMOKE_TENANT_HOSTNAME_READY=UNPROVEN')
  console.log('PRODUCTION_SMOKE_LOGIN_IDENTITY_READY=UNPROVEN')
  process.exitCode = 1
} finally {
  await client?.end().catch(() => undefined)
}
