import { readFileSync } from 'node:fs'
import pg from 'pg'
import {
  MATERIAL_INTELLIGENCE_TABLES,
  assertMaterialIntelligenceRlsContract,
} from './material-intelligence-rls-contract.mjs'
import {
  V2_PLATFORM_REGISTRY_CLIENT_ROLES,
  V2_PLATFORM_REGISTRY_TABLES,
  assertV2PlatformRegistryClientGrants,
  assertV2PlatformRegistryRlsContract,
  assertV2PlatformRegistryRuntimeGrants,
} from './v2-platform-registry-security-contract.mjs'

const { Client } = pg

const migrations = [
  'infra/postgres/migrations/0001_platform_security_core.sql',
  'infra/postgres/migrations/0002_phase1_members_notifications.sql',
  'infra/postgres/migrations/0003_phase2_lab_operations.sql',
  'infra/postgres/migrations/0004_phase3_scientific_features.sql',
  'infra/postgres/migrations/0005_phase4_model_dataset_platform.sql',
  'infra/postgres/migrations/0006_phase5_olfactory_intelligence.sql',
  'infra/postgres/migrations/0007_phase5b_consumer_intelligence.sql',
  'infra/postgres/migrations/0008_phase6_formula_design_studio.sql',
  'infra/postgres/migrations/0009_phase4_6_completion_records.sql',
  'infra/postgres/migrations/0010_phase4_6_tenant_fk_hardening.sql',
  'infra/postgres/migrations/0011_phase7_trials_sensory.sql',
  'infra/postgres/migrations/0012_phase8_production_manufacturing.sql',
  'infra/postgres/migrations/0013_phase8_production_quality_revisions.sql',
  'infra/postgres/migrations/0014_phase8_finished_good_hold_and_rework.sql',
  'infra/postgres/migrations/0015_phase9_agentic_ai_platform.sql',
  'infra/postgres/migrations/0016_phase10_commerce_fulfillment.sql',
  'infra/postgres/migrations/0017_phase11_advanced_optimizer_imports.sql',
  'infra/postgres/migrations/0018_cloud_native_runtime.sql',
  'infra/postgres/migrations/0019_cloud_scientific_dispatch.sql',
  'infra/postgres/migrations/0020_staging_dlq_terminal_probe.sql',
  'infra/postgres/migrations/0021_trusted_workspace_hostname_resolver.sql',
  'infra/postgres/migrations/0022_platform_control_plane.sql',
  'infra/postgres/migrations/0023_platform_control_plane_operations.sql',
  'infra/postgres/migrations/0024_platform_tenant_state_transition_qualification.sql',
  'infra/postgres/migrations/0025_platform_owner_bootstrap_guard.sql',
  'infra/postgres/migrations/0026_platform_password_resets.sql',
  'infra/postgres/migrations/0027_material_intelligence_foundation.sql',
  'infra/postgres/migrations/0028_harden_v2_plans_and_component_pins_rls.sql',
]

const databaseUrl = process.env.STAGING_DATABASE_URL
const runtimeRole = process.env.V2_RUNTIME_DB_ROLE ?? 'hyperdrive_user'
const allowLoopbackTest = process.env.V2_STAGING_ALLOW_LOOPBACK_TEST === 'true' && process.env.V2_QA_ENVIRONMENT === 'test'

if (process.env.V2_STAGING_MIGRATION_APPROVED !== 'APPLY_STAGING') throw new Error('STAGING_MIGRATIONS=BLOCKED explicit approval is required')
if (!databaseUrl) throw new Error('STAGING_MIGRATIONS=BLOCKED STAGING_DATABASE_URL is required')
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(runtimeRole)) throw new Error('STAGING_MIGRATIONS=FAIL runtime role name is invalid')

const database = new URL(databaseUrl)
if (database.protocol !== 'postgresql:' && database.protocol !== 'postgres:') throw new Error('STAGING_MIGRATIONS=FAIL PostgreSQL is required')
if (['localhost', '127.0.0.1', '::1'].includes(database.hostname) && !allowLoopbackTest) throw new Error('STAGING_MIGRATIONS=FAIL loopback is permitted only for explicit test mode')

const client = new Client({ connectionString: databaseUrl })

try {
  await client.connect()
  for (const migration of migrations) await client.query(readFileSync(migration, 'utf8'))
  const { rows: baselineRlsRows } = await client.query(`
    SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY($1::text[])
  `, [['v2_organizations', 'v2_workspace_hostnames', 'v2_inventory_movements', 'v2_formula_versions', 'v2_cloud_job_dispatches', 'v2_cloud_job_events', 'v2_password_resets']])
  if (baselineRlsRows.length !== 7 || baselineRlsRows.some((row) => !row.rls_enabled || !row.rls_forced)) throw new Error('STAGING_MIGRATIONS=FAIL required V2 RLS tables are incomplete')
  const { rows: materialRlsRows } = await client.query(`
    SELECT c.relname AS "tableName", c.relrowsecurity AS "rlsEnabled", c.relforcerowsecurity AS "rlsForced"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
  `, [MATERIAL_INTELLIGENCE_TABLES])
  const { rows: materialPolicyRows } = await client.query(`
    SELECT tablename AS "tableName", policyname AS "policyName", permissive, roles, cmd AS command,
      qual AS "usingExpression", with_check AS "checkExpression"
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY($1::text[])
  `, [MATERIAL_INTELLIGENCE_TABLES])
  assertMaterialIntelligenceRlsContract({ rlsRows: materialRlsRows, policyRows: materialPolicyRows })
  const { rows: registryRlsRows } = await client.query(`
    SELECT c.relname AS "tableName", c.relrowsecurity AS "rlsEnabled", c.relforcerowsecurity AS "rlsForced"
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
  `, [V2_PLATFORM_REGISTRY_TABLES])
  const { rows: registryPolicyRows } = await client.query(`
    SELECT tablename AS "tableName", policyname AS "policyName", permissive, roles, cmd AS command,
      qual AS "usingExpression", with_check AS "checkExpression"
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY($1::text[])
  `, [V2_PLATFORM_REGISTRY_TABLES])
  const { rows: registryClientGrantRows } = await client.query(`
    SELECT role_name AS "roleName", table_name AS "tableName",
      has_table_privilege(role_name, format('public.%I', table_name), 'SELECT') AS "canSelect",
      has_table_privilege(role_name, format('public.%I', table_name), 'INSERT') AS "canInsert",
      has_table_privilege(role_name, format('public.%I', table_name), 'UPDATE') AS "canUpdate",
      has_table_privilege(role_name, format('public.%I', table_name), 'DELETE') AS "canDelete",
      has_table_privilege(role_name, format('public.%I', table_name), 'TRUNCATE') AS "canTruncate",
      has_table_privilege(role_name, format('public.%I', table_name), 'REFERENCES') AS "canReferences",
      has_table_privilege(role_name, format('public.%I', table_name), 'TRIGGER') AS "canTrigger"
    FROM unnest($1::text[]) AS role_name
    CROSS JOIN unnest($2::text[]) AS table_name
    WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name)
  `, [V2_PLATFORM_REGISTRY_CLIENT_ROLES, V2_PLATFORM_REGISTRY_TABLES])
  const { rows: registryRuntimeGrantRows } = await client.query(`
    SELECT table_name AS "tableName",
      has_table_privilege($1, format('public.%I', table_name), 'SELECT') AS "canSelect",
      has_table_privilege($1, format('public.%I', table_name), 'INSERT') AS "canInsert",
      has_table_privilege($1, format('public.%I', table_name), 'UPDATE') AS "canUpdate",
      has_table_privilege($1, format('public.%I', table_name), 'DELETE') AS "canDelete",
      has_table_privilege($1, format('public.%I', table_name), 'TRUNCATE') AS "canTruncate",
      has_table_privilege($1, format('public.%I', table_name), 'REFERENCES') AS "canReferences",
      has_table_privilege($1, format('public.%I', table_name), 'TRIGGER') AS "canTrigger"
    FROM unnest($2::text[]) AS table_name
    WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
  `, [runtimeRole, V2_PLATFORM_REGISTRY_TABLES])
  assertV2PlatformRegistryRlsContract({ rlsRows: registryRlsRows, policyRows: registryPolicyRows })
  assertV2PlatformRegistryClientGrants(registryClientGrantRows)
  assertV2PlatformRegistryRuntimeGrants(registryRuntimeGrantRows)
  console.log(JSON.stringify({
    stagingMigrations: 'PASS',
    migrationCount: migrations.length,
    rlsTablesVerified: baselineRlsRows.length + materialRlsRows.length + registryRlsRows.length,
    materialIntelligenceRlsTablesVerified: materialRlsRows.length,
    materialIntelligenceTenantPoliciesVerified: materialPolicyRows.length,
    platformRegistryRlsTablesVerified: registryRlsRows.length,
    platformRegistryReadPoliciesVerified: registryPolicyRows.length,
    platformRegistryClientGrantRowsVerified: registryClientGrantRows.length,
    platformRegistryRuntimeGrantRowsVerified: registryRuntimeGrantRows.length,
    loopbackTest: allowLoopbackTest,
  }))
} finally {
  await client.end().catch(() => undefined)
}
