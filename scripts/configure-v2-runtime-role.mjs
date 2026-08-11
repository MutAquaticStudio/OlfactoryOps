import pg from 'pg'

const { Client } = pg

const databaseUrl = process.env.STAGING_DATABASE_URL
const role = process.env.V2_RUNTIME_DB_ROLE ?? 'hyperdrive_user'
const allowLoopbackTest = process.env.V2_STAGING_ALLOW_LOOPBACK_TEST === 'true' && process.env.V2_QA_ENVIRONMENT === 'test'

if (process.env.V2_STAGING_MIGRATION_APPROVED !== 'APPLY_STAGING') throw new Error('RUNTIME_DB_PRIVILEGES=BLOCKED explicit approval is required')
if (!databaseUrl) throw new Error('RUNTIME_DB_PRIVILEGES=BLOCKED STAGING_DATABASE_URL is required')
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('RUNTIME_DB_PRIVILEGES=FAIL runtime role name is invalid')

const database = new URL(databaseUrl)
if (database.protocol !== 'postgresql:' && database.protocol !== 'postgres:') throw new Error('RUNTIME_DB_PRIVILEGES=FAIL PostgreSQL is required')
if (['localhost', '127.0.0.1', '::1'].includes(database.hostname) && !allowLoopbackTest) throw new Error('RUNTIME_DB_PRIVILEGES=FAIL loopback is permitted only for explicit test mode')

const identifier = `"${role}"`
const client = new Client({ connectionString: databaseUrl })

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`

try {
  await client.connect()
  const roleResult = await client.query(`
    SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls, rolreplication
    FROM pg_roles
    WHERE rolname = $1
  `, [role])
  if (roleResult.rowCount !== 1) throw new Error('RUNTIME_DB_PRIVILEGES=BLOCKED configured Hyperdrive role does not exist')
  const ownership = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles r ON r.oid = c.relowner
    WHERE n.nspname = 'public' AND r.rolname = $1 AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
  `, [role])
  if (ownership.rows[0].count !== 0) throw new Error('RUNTIME_DB_PRIVILEGES=FAIL runtime role owns V2 objects')

  const memberships = await client.query(`
    SELECT parent.rolname
    FROM pg_auth_members membership
    JOIN pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE member.rolname = $1
  `, [role])
  const roleState = roleResult.rows[0]
  if (roleState.rolsuper) {
    throw new Error('RUNTIME_DB_PRIVILEGES=BLOCKED configured Hyperdrive role is still SUPERUSER in the staging database targeted by STAGING_DATABASE_URL')
  }

  await client.query('BEGIN')
  try {
    const databaseName = (await client.query('SELECT current_database() AS name')).rows[0].name
    for (const membership of memberships.rows) {
      await client.query(`REVOKE ${quoteIdentifier(membership.rolname)} FROM ${identifier}`)
    }
    if (!roleState.rolcanlogin || roleState.rolcreatedb || roleState.rolcreaterole || roleState.rolbypassrls || roleState.rolreplication) {
      await client.query(`ALTER ROLE ${identifier} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION`)
    }
    await client.query(`GRANT CONNECT ON DATABASE "${databaseName.replaceAll('"', '""')}" TO ${identifier}`)
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
    await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${identifier}`)
    await client.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${identifier}`)
    await client.query(`REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${identifier}`)
    await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier}`)
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${identifier}`)
    await client.query(`GRANT EXECUTE ON FUNCTION public.v2_resolve_sensory_public_link(TEXT) TO ${identifier}`)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }

  const verification = await client.query(`
    SELECT r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolinherit, r.rolbypassrls, r.rolreplication,
      has_schema_privilege($1, 'public', 'USAGE') AS schema_usage,
      has_schema_privilege($1, 'public', 'CREATE') AS schema_create,
      has_table_privilege($1, 'v2_organizations', 'SELECT,INSERT,UPDATE,DELETE') AS table_access,
      has_function_privilege($1, 'public.v2_resolve_sensory_public_link(text)', 'EXECUTE') AS sensory_link_execute
    FROM pg_roles r
    WHERE r.rolname = $1
  `, [role])
  const result = verification.rows[0]
  const parentRoleCount = (await client.query(`
    SELECT COUNT(*)::int AS count
    FROM pg_auth_members membership
    JOIN pg_roles member ON member.oid = membership.member
    WHERE member.rolname = $1
  `, [role])).rows[0].count
  if (!result?.rolcanlogin || result.rolsuper || result.rolcreatedb || result.rolcreaterole || result.rolbypassrls || result.rolreplication || parentRoleCount !== 0 || !result.schema_usage || result.schema_create || !result.table_access || !result.sensory_link_execute) {
    throw new Error('RUNTIME_DB_PRIVILEGES=FAIL least-privilege verification failed')
  }
  console.log(JSON.stringify({ runtimeDbPrivileges: 'PASS', role, loopbackTest: allowLoopbackTest, bypassRls: false, superuser: false, privilegedMembership: 'NONE' }))
} finally {
  await client.end().catch(() => undefined)
}
