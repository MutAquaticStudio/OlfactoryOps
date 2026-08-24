import { createRequire } from 'node:module'

const releaseRoot = process.env.RELEASE_WORKTREE || process.cwd()
const requireFromRelease = createRequire(`${releaseRoot}/package.json`)
const pg = requireFromRelease('pg')
const runtimeRole = 'hyperdrive_user'
const tables = [
  ['v2_organizations', 'SELECT'],
  ['v2_users', 'SELECT'],
  ['v2_memberships', 'SELECT'],
  ['v2_workspace_hostnames', 'SELECT'],
  ['v2_sessions', 'SELECT,INSERT,UPDATE'],
  ['v2_password_resets', 'SELECT,INSERT,UPDATE'],
  ['v2_audit_events', 'INSERT'],
]

let client
try {
  client = new pg.Client({ connectionString: process.env.PRODUCTION_DATABASE_URL, connectionTimeoutMillis: 15_000, query_timeout: 15_000, statement_timeout: 15_000 })
  await client.connect()
  await client.query('BEGIN')
  const role = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [runtimeRole])
  if (role.rowCount !== 1) fail('PRODUCTION_RUNTIME_ROLE=FAIL')

  for (const [table, privileges] of tables) {
    const result = await client.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [runtimeRole, `public.${table}`, privileges])
    if (result.rows[0]?.allowed !== true) fail('PRODUCTION_RUNTIME_PRIVILEGES=FAIL')
  }

  const rls = await client.query(`
    SELECT count(*) FILTER (WHERE relname IN ('v2_organizations','v2_users','v2_memberships','v2_workspace_hostnames','v2_sessions','v2_password_resets','v2_audit_events') AND relrowsecurity) AS enabled,
           count(*) FILTER (WHERE relname IN ('v2_organizations','v2_users','v2_memberships','v2_workspace_hostnames','v2_sessions','v2_password_resets','v2_audit_events') AND relforcerowsecurity) AS forced
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('v2_organizations','v2_users','v2_memberships','v2_workspace_hostnames','v2_sessions','v2_password_resets','v2_audit_events')
  `)
  if (Number(rls.rows[0]?.enabled) !== 7 || Number(rls.rows[0]?.forced) !== 7) fail('PRODUCTION_RLS_RUNTIME_EFFECT=FAIL')
  await client.query("SELECT set_config('app.organization_id', 'readiness-probe', true), set_config('app.user_id', 'readiness-probe', true)")
  const context = await client.query("SELECT current_setting('app.organization_id', true) = 'readiness-probe' AS organization_context, current_setting('app.user_id', true) = 'readiness-probe' AS user_context")
  if (context.rows[0]?.organization_context !== true || context.rows[0]?.user_context !== true) fail('PRODUCTION_RLS_RUNTIME_EFFECT=FAIL')
  await client.query('ROLLBACK')
  console.log('PRODUCTION_RUNTIME_ROLE=PASS')
  console.log('PRODUCTION_RUNTIME_PRIVILEGES=PASS')
  console.log('PRODUCTION_RLS_RUNTIME_EFFECT=PASS')
} catch {
  await client?.query('ROLLBACK').catch(() => undefined)
  console.log('PRODUCTION_RUNTIME_ROLE=UNPROVEN')
  console.log('PRODUCTION_RUNTIME_PRIVILEGES=UNPROVEN')
  console.log('PRODUCTION_RLS_RUNTIME_EFFECT=UNPROVEN')
  process.exitCode = 1
} finally {
  await client?.end().catch(() => undefined)
}

function fail(marker) {
  console.log(marker)
  throw new Error('READINESS_CHECK_FAILED')
}
