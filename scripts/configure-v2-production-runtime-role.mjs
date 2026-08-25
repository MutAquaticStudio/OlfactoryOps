import pg from 'pg'
import {
  assertHostedRoleIsNotPrivileged,
  hostedSafeAlterRoleStatement,
  quotePostgresIdentifier,
  requiresSafeAttributeHardening,
} from './production-runtime-role-hardening.mjs'
import {
  MATERIAL_INTELLIGENCE_TABLES,
  assertMaterialIntelligenceRuntimeGrants,
} from './material-intelligence-rls-contract.mjs'
import {
  V2_PLATFORM_REGISTRY_TABLES,
  assertV2PlatformRegistryRuntimeGrants,
} from './v2-platform-registry-security-contract.mjs'

const { Client } = pg
const databaseUrl = process.env.PRODUCTION_DATABASE_URL
const role = process.env.V2_RUNTIME_DB_ROLE ?? 'hyperdrive_user'
if (process.env.V2_PRODUCTION_MIGRATION_APPROVED !== 'APPLY_PRODUCTION') throw new Error('PRODUCTION_RUNTIME_PRIVILEGES=BLOCKED explicit production approval is required')
if (!databaseUrl || !/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('PRODUCTION_RUNTIME_PRIVILEGES=BLOCKED protected production inputs are required')
const database = new URL(databaseUrl)
if (!['postgresql:', 'postgres:'].includes(database.protocol) || ['localhost', '127.0.0.1', '::1'].includes(database.hostname)) throw new Error('PRODUCTION_RUNTIME_PRIVILEGES=FAIL a non-loopback PostgreSQL origin is required')
const identifier = quotePostgresIdentifier(role)
const client = new Client({ connectionString: databaseUrl })
try {
  await client.connect()
  const roleResult = await client.query('SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = $1', [role])
  if (roleResult.rowCount !== 1) throw new Error('PRODUCTION_RUNTIME_PRIVILEGES=BLOCKED configured Hyperdrive role does not exist')
  const roleState = roleResult.rows[0]
  assertHostedRoleIsNotPrivileged(roleState)
  const ownership = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT c.oid
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
      WHERE n.nspname = 'public' AND r.rolname = $1 AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
      UNION ALL
      SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles r ON r.oid = p.proowner
      WHERE n.nspname = 'public' AND r.rolname = $1
    ) owned_objects
  `, [role])
  if (ownership.rows[0].count !== 0) throw new Error('PRODUCTION_RUNTIME_PRIVILEGES=FAIL runtime role owns V2 objects')
  const memberships = await client.query(`SELECT parent.rolname FROM pg_auth_members membership JOIN pg_roles parent ON parent.oid = membership.roleid JOIN pg_roles member ON member.oid = membership.member WHERE member.rolname = $1`, [role])
  await client.query('BEGIN')
  try {
    const databaseName = (await client.query('SELECT current_database() AS name')).rows[0].name
    for (const membership of memberships.rows) await client.query(`REVOKE ${quotePostgresIdentifier(membership.rolname)} FROM ${identifier}`)
    if (requiresSafeAttributeHardening(roleState)) await client.query(hostedSafeAlterRoleStatement(identifier))
    await client.query(`GRANT CONNECT ON DATABASE "${databaseName.replaceAll('"', '""')}" TO ${identifier}`)
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
    await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${identifier}`)
    await client.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${identifier}`)
    await client.query(`REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${identifier}`)
    await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier}`)
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${identifier}`)
    await client.query(`REVOKE UPDATE, DELETE ON public.v2_material_intelligence_evidence, public.v2_scientific_eligibility_decisions FROM ${identifier}`)
    await client.query(`REVOKE ALL PRIVILEGES ON public.v2_plans, public.v2_scientific_component_pins, public.v2_model_component_pins FROM ${identifier}`)
    await client.query(`GRANT SELECT ON public.v2_plans, public.v2_scientific_component_pins, public.v2_model_component_pins TO ${identifier}`)
    await client.query(`GRANT EXECUTE ON FUNCTION public.v2_resolve_sensory_public_link(TEXT), public.v2_resolve_active_workspace_hostname(TEXT), public.v2_platform_has_role(TEXT[]), public.v2_platform_set_tenant_state(TEXT, TEXT, TEXT, TEXT, TEXT), public.v2_platform_workspace_directory(TEXT), public.v2_platform_workspace_detail(TEXT), public.v2_platform_overview_snapshot(), public.v2_platform_revoke_workspace_sessions(TEXT, TEXT), public.v2_platform_request_workspace_action(TEXT, TEXT, TEXT, TEXT, TEXT), public.v2_platform_set_workspace_entitlement(TEXT, TEXT, BOOLEAN, TIMESTAMPTZ), public.v2_platform_assign_workspace_plan(TEXT, TEXT, TIMESTAMPTZ), public.v2_platform_set_workspace_limit(TEXT, TEXT, INTEGER), public.v2_platform_set_operator_status(TEXT, TEXT), public.v2_platform_set_operator_role(TEXT, TEXT) TO ${identifier}`)
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error }
  const { rows } = await client.query(`
    SELECT r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolinherit, r.rolbypassrls, r.rolreplication,
      has_schema_privilege($1, 'public', 'USAGE') AS schema_usage,
      has_schema_privilege($1, 'public', 'CREATE') AS schema_create,
      has_table_privilege($1, 'v2_organizations', 'SELECT,INSERT,UPDATE,DELETE') AS table_access,
      has_function_privilege($1, 'public.v2_platform_overview_snapshot()', 'EXECUTE') AS platform_overview_execute,
      has_function_privilege($1, 'public.v2_platform_workspace_directory(text)', 'EXECUTE') AS platform_directory_execute,
      has_function_privilege($1, 'public.v2_platform_set_workspace_limit(text, text, integer)', 'EXECUTE') AS platform_limit_execute,
      has_function_privilege($1, 'public.v2_platform_set_operator_role(text, text)', 'EXECUTE') AS platform_operator_role_execute
    FROM pg_roles r WHERE r.rolname = $1
  `, [role])
  const { rows: materialGrantRows } = await client.query(`
    SELECT table_name AS "tableName",
      has_table_privilege($1, format('public.%I', table_name), 'SELECT') AS "canSelect",
      has_table_privilege($1, format('public.%I', table_name), 'INSERT') AS "canInsert",
      has_table_privilege($1, format('public.%I', table_name), 'UPDATE') AS "canUpdate",
      has_table_privilege($1, format('public.%I', table_name), 'DELETE') AS "canDelete"
    FROM unnest($2::text[]) AS table_name
  `, [role, MATERIAL_INTELLIGENCE_TABLES])
  assertMaterialIntelligenceRuntimeGrants(materialGrantRows)
  const { rows: platformRegistryGrantRows } = await client.query(`
    SELECT table_name AS "tableName",
      has_table_privilege($1, format('public.%I', table_name), 'SELECT') AS "canSelect",
      has_table_privilege($1, format('public.%I', table_name), 'INSERT') AS "canInsert",
      has_table_privilege($1, format('public.%I', table_name), 'UPDATE') AS "canUpdate",
      has_table_privilege($1, format('public.%I', table_name), 'DELETE') AS "canDelete",
      has_table_privilege($1, format('public.%I', table_name), 'TRUNCATE') AS "canTruncate",
      has_table_privilege($1, format('public.%I', table_name), 'REFERENCES') AS "canReferences",
      has_table_privilege($1, format('public.%I', table_name), 'TRIGGER') AS "canTrigger"
    FROM unnest($2::text[]) AS table_name
  `, [role, V2_PLATFORM_REGISTRY_TABLES])
  assertV2PlatformRegistryRuntimeGrants(platformRegistryGrantRows)
  const parentRoleCount = (await client.query('SELECT COUNT(*)::int AS count FROM pg_auth_members membership JOIN pg_roles member ON member.oid = membership.member WHERE member.rolname = $1', [role])).rows[0].count
  const finalOwnership = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT c.oid
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
      WHERE n.nspname = 'public' AND r.rolname = $1 AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
      UNION ALL
      SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles r ON r.oid = p.proowner
      WHERE n.nspname = 'public' AND r.rolname = $1
    ) owned_objects
  `, [role])
  const result = rows[0]
  if (!result?.rolcanlogin || result.rolsuper || result.rolcreatedb || result.rolcreaterole || result.rolinherit || result.rolbypassrls || result.rolreplication || parentRoleCount !== 0 || finalOwnership.rows[0].count !== 0 || !result.schema_usage || result.schema_create || !result.table_access || !result.platform_overview_execute || !result.platform_directory_execute || !result.platform_limit_execute || !result.platform_operator_role_execute) throw new Error('PRODUCTION_RUNTIME_PRIVILEGES=FAIL least-privilege verification failed')
  console.log(JSON.stringify({ productionRuntimePrivileges: 'PASS', role, superuser: false, bypassRls: false, privilegedMembership: 'NONE' }))
} finally { await client.end().catch(() => undefined) }
