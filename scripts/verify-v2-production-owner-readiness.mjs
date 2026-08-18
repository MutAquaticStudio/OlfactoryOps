import { createRequire } from 'node:module'

const releaseRoot = process.env.RELEASE_WORKTREE || process.cwd()
const pg = createRequire(`${releaseRoot}/package.json`)('pg')
let client
try {
  client = new pg.Client({ connectionString: process.env.PRODUCTION_DATABASE_URL, connectionTimeoutMillis: 15_000, query_timeout: 15_000, statement_timeout: 15_000 })
  await client.connect()
  const result = await client.query("SELECT count(*)::int AS active_owners, bool_and(mfa_required) AS all_mfa FROM v2_platform_operators WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE'")
  const row = result.rows[0]
  if (row?.active_owners !== 1 || row?.all_mfa !== true) throw new Error('OWNER_NOT_READY')
  console.log('PLATFORM_OWNER_READY=PASS')
} catch {
  console.log('PLATFORM_OWNER_READY=UNPROVEN')
  process.exitCode = 1
} finally {
  await client?.end().catch(() => undefined)
}
