import { readFileSync } from 'node:fs'
import pg from 'pg'

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
]

const databaseUrl = process.env.STAGING_DATABASE_URL
const allowLoopbackTest = process.env.V2_STAGING_ALLOW_LOOPBACK_TEST === 'true' && process.env.V2_QA_ENVIRONMENT === 'test'

if (process.env.V2_STAGING_MIGRATION_APPROVED !== 'APPLY_STAGING') throw new Error('STAGING_MIGRATIONS=BLOCKED explicit approval is required')
if (!databaseUrl) throw new Error('STAGING_MIGRATIONS=BLOCKED STAGING_DATABASE_URL is required')

const database = new URL(databaseUrl)
if (database.protocol !== 'postgresql:' && database.protocol !== 'postgres:') throw new Error('STAGING_MIGRATIONS=FAIL PostgreSQL is required')
if (['localhost', '127.0.0.1', '::1'].includes(database.hostname) && !allowLoopbackTest) throw new Error('STAGING_MIGRATIONS=FAIL loopback is permitted only for explicit test mode')

const client = new Client({ connectionString: databaseUrl })

try {
  await client.connect()
  for (const migration of migrations) await client.query(readFileSync(migration, 'utf8'))
  const { rows } = await client.query(`
    SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY($1::text[])
  `, [['v2_organizations', 'v2_workspace_hostnames', 'v2_inventory_movements', 'v2_formula_versions', 'v2_cloud_job_dispatches', 'v2_cloud_job_events', 'v2_password_resets']])
  if (rows.length !== 7 || rows.some((row) => !row.rls_enabled || !row.rls_forced)) throw new Error('STAGING_MIGRATIONS=FAIL required V2 RLS tables are incomplete')
  console.log(JSON.stringify({ stagingMigrations: 'PASS', migrationCount: migrations.length, rlsTablesVerified: rows.length, loopbackTest: allowLoopbackTest }))
} finally {
  await client.end().catch(() => undefined)
}
