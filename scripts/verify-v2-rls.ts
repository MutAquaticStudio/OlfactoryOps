import { PrismaClient, type Prisma } from '@prisma/client'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { PrismaPlatformRepository } from '../services/platform/src/prisma-repository.js'
import { PlatformError, PlatformService } from '../services/platform/src/service.js'
import { LabOperationsService } from '../services/lab-ops/src/service.js'
import { ScientificFeatureService, type ScientificRuntime } from '../services/scientific/src/service.js'
import { ModelDatasetService } from '../services/scientific/src/model-dataset-service.js'
import { OlfactoryIntelligenceService } from '../services/scientific/src/olfactory-intelligence-service.js'
import { ConsumerIntelligenceService } from '../services/sentiment/src/consumer-intelligence-service.js'
import { FormulaService } from '../services/formula/src/formula-service.js'
import { MaterialEvidenceService } from '../services/rag/src/material-evidence-service.js'
import { DurableAgentService } from '../services/agent-runtime/src/durable-agent-service.js'
import type { CompiledAgentToolRegistry } from '../services/agent-runtime/src/tool-registry.js'
import { TrialSensoryService } from '../services/trials-sensory/src/service.js'
import { ProductionService } from '../services/production/src/production-service.js'
import { CommerceService } from '../services/commerce/src/commerce-service.js'
import { AdvancedOperationsService } from '../services/advanced/src/advanced-service.js'

class RlsScientificRuntime implements ScientificRuntime {
  private structure(smiles: string) {
    const canonicalSmiles = smiles === 'OCC' ? 'CCO' : smiles
    const structureHash = 'a'.repeat(64)
    const inputHash = 'b'.repeat(64)
    const outputHash = 'c'.repeat(64)
    return { canonicalSmiles, inchi: null, inchiKey: null, structureHash, inputHash, outputHash, molecularGraph: { atoms: [{ index: 0, symbol: 'C', atomicNumber: 6 }], bonds: [] }, rdkitVersion: 'fixture-rdkit', standardizationVersion: 'fixture-standardization' }
  }
  async normalize(input: { smiles: string }) { return { runtimeVersion: 'rls-science-fixture/1', structure: this.structure(input.smiles), artifacts: [] } }
  async generateFeatures(input: { canonicalSmiles: string; featureKinds: Array<'ECFP' | 'BCFP' | 'MOLFTP' | 'OSMORDRED'> }) {
    const structure = this.structure(input.canonicalSmiles)
    return {
      runtimeVersion: 'rls-science-fixture/1', structure,
      artifacts: input.featureKinds.map((kind) => ({
        kind, status: kind === 'MOLFTP' ? 'NOT_EVALUATED' as const : 'VERIFIED' as const, schemaVersion: `${kind.toLowerCase()}/fixture`, componentKey: kind === 'ECFP' ? 'RDKIT' : kind, componentVersion: 'fixture/1', inputHash: structure.outputHash, contentHash: kind === 'ECFP' ? 'd'.repeat(64) : 'e'.repeat(64),
        payload: kind === 'MOLFTP' ? { reason: 'No target dataset is registered.' } : { onBits: [1, 5, 9], bitLength: 2048, onBitCount: 3 }, provenance: [{ kind: 'component', id: kind === 'ECFP' ? 'RDKIT' : kind, version: 'fixture/1' }],
      })),
    }
  }
}

const localTestDatabaseUrl = 'postgresql://olfactoryops:olfactoryops@127.0.0.1:5432/olfactoryops'
const databaseUrl = process.env.V2_QA_DATABASE_URL || process.env.V2_DATABASE_URL || process.env.DATABASE_URL || (process.env.V2_QA_ENVIRONMENT === 'test' ? localTestDatabaseUrl : undefined)

if (!databaseUrl) throw new Error('V2_RLS=BLOCKED configure V2_QA_DATABASE_URL for a disposable PostgreSQL instance.')
if (process.env.V2_QA_ENVIRONMENT !== 'test') throw new Error('V2_RLS=BLOCKED V2_QA_ENVIRONMENT=test is required.')

const parsedDatabaseUrl = new URL(databaseUrl)
if (!['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname)) throw new Error('V2_RLS=FAIL refusing a non-loopback PostgreSQL instance.')

const prismaCli = path.resolve('node_modules/prisma/build/index.js')

function executePrisma(url: string, statement?: string, migration?: string) {
  const args = [prismaCli, 'db', 'execute', '--url', url]
  if (migration) args.push('--file', migration)
  else args.push('--stdin')
  execFileSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    input: statement,
    stdio: 'inherit',
  })
}

function applyMigrations() {
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0001_platform_security_core.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0002_phase1_members_notifications.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0003_phase2_lab_operations.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0004_phase3_scientific_features.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0005_phase4_model_dataset_platform.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0006_phase5_olfactory_intelligence.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0007_phase5b_consumer_intelligence.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0008_phase6_formula_design_studio.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0009_phase4_6_completion_records.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0010_phase4_6_tenant_fk_hardening.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0011_phase7_trials_sensory.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0012_phase8_production_manufacturing.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0013_phase8_production_quality_revisions.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0014_phase8_finished_good_hold_and_rework.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0015_phase9_agentic_ai_platform.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0016_phase10_commerce_fulfillment.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0017_phase11_advanced_optimizer_imports.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0018_cloud_native_runtime.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0019_cloud_scientific_dispatch.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0020_staging_dlq_terminal_probe.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0021_trusted_workspace_hostname_resolver.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0022_platform_control_plane.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0023_platform_control_plane_operations.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0024_platform_tenant_state_transition_qualification.sql')
}

function resetDisposableSchema() {
  // This verifier is deliberately destructive only after its loopback and
  // explicit V2_QA_ENVIRONMENT=test gates above. A clean schema proves the
  // full V2 migration chain rather than inheriting an earlier local run.
  executePrisma(databaseUrl, 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
}

const applicationUrl = new URL(databaseUrl)
applicationUrl.username = 'v2_app'
applicationUrl.password = 'v2_app'

let adminClient: PrismaClient | undefined
let appClient: PrismaClient | undefined
let firstOrganizationId: string | undefined
let secondOrganizationId: string | undefined
let firstUserId: string | undefined
let restrictedUserId: string | undefined
let brandUserId: string | undefined
let panelistUserId: string | undefined

async function configureApplicationRole() {
  if (!adminClient) throw new Error('V2_RLS=FAIL disposable database was not initialized.')
  await adminClient.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
        CREATE ROLE v2_app LOGIN PASSWORD 'v2_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      ELSE
        ALTER ROLE v2_app LOGIN PASSWORD 'v2_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
    END
    $$;
  `)
  await adminClient.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO v2_app')
  await adminClient.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app')
  await adminClient.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO v2_app')
  await adminClient.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION public.v2_resolve_sensory_public_link(TEXT) TO v2_app')
  await adminClient.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION public.v2_resolve_active_workspace_hostname(TEXT) TO v2_app')
  await adminClient.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION public.v2_platform_workspace_directory(TEXT), public.v2_platform_workspace_detail(TEXT), public.v2_platform_overview_snapshot(), public.v2_platform_revoke_workspace_sessions(TEXT, TEXT), public.v2_platform_request_workspace_action(TEXT, TEXT, TEXT, TEXT, TEXT), public.v2_platform_set_workspace_entitlement(TEXT, TEXT, BOOLEAN, TIMESTAMPTZ), public.v2_platform_assign_workspace_plan(TEXT, TEXT, TIMESTAMPTZ), public.v2_platform_set_workspace_limit(TEXT, TEXT, INTEGER), public.v2_platform_set_operator_status(TEXT, TEXT), public.v2_platform_set_operator_role(TEXT, TEXT), public.v2_platform_set_tenant_state(TEXT, TEXT, TEXT, TEXT, TEXT) TO v2_app')
  const roles = await adminClient.$queryRawUnsafe<Array<{ rolbypassrls: boolean; rolsuper: boolean }>>("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'v2_app'")
  if (roles.length !== 1 || roles[0].rolbypassrls || roles[0].rolsuper) throw new Error('V2_RLS=FAIL application role is not constrained by RLS.')
}

async function scopedMembershipCount(organizationId?: string, userId?: string) {
  if (!appClient) throw new Error('V2_RLS=FAIL application client was not initialized.')
  return appClient.$transaction(async (tx) => {
    if (organizationId) await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", organizationId)
    if (userId) await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", userId)
    return tx.membership.count()
  })
}

const phase9TenantScopedTables = [
  'v2_agent_definitions',
  'v2_agent_runs',
  'v2_agent_run_messages',
  'v2_agent_tool_calls',
  'v2_agent_provider_usages',
  'v2_agent_evaluations',
  'v2_agent_lineage_refs',
  'v2_agent_run_quota_reservations',
] as const

const phase11TenantScopedTables = [
  'v2_reformulation_runs',
  'v2_reformulation_candidates',
  'v2_reformulation_candidate_reviews',
  'v2_import_jobs',
  'v2_import_rows',
  'v2_import_commits',
  'v2_dataops_runs',
  'v2_bulk_operations',
] as const

async function phase9TenantScopedCounts(organizationId: string, userId: string, targetOrganizationId: string) {
  if (!appClient) throw new Error('V2_RLS=FAIL application client was not initialized.')
  return appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", organizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", userId)
    const counts = await Promise.all(phase9TenantScopedTables.map(async (table) => {
      const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint AS count FROM ${table} WHERE organization_id = $1`,
        targetOrganizationId,
      )
      return [table, Number(rows[0]?.count ?? 0)] as const
    }))
    return Object.fromEntries(counts) as Record<(typeof phase9TenantScopedTables)[number], number>
  })
}

async function phase11TenantScopedCounts(organizationId: string, userId: string, targetOrganizationId: string) {
  if (!appClient) throw new Error('V2_RLS=FAIL application client was not initialized.')
  return appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", organizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", userId)
    const counts = await Promise.all(phase11TenantScopedTables.map(async (table) => {
      const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint AS count FROM ${table} WHERE organization_id = $1`,
        targetOrganizationId,
      )
      return [table, Number(rows[0]?.count ?? 0)] as const
    }))
    return Object.fromEntries(counts) as Record<(typeof phase11TenantScopedTables)[number], number>
  })
}

async function phase9PersistedPayloadsAreSafe(organizationId: string, userId: string) {
  if (!appClient) throw new Error('V2_RLS=FAIL application client was not initialized.')
  return appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", organizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", userId)
    const rows = await tx.$queryRawUnsafe<Array<{ unsafeCount: bigint }>>(`
      SELECT count(*)::bigint AS "unsafeCount"
      FROM (
        SELECT event.payload
        FROM v2_agent_events AS event
        JOIN v2_agent_runs AS run ON run.organization_id = event.organization_id AND run.id = event.run_id
        WHERE event.organization_id = $1 AND run.protocol_version = 'agent-runtime/v1'
        UNION ALL
        SELECT artifact.payload
        FROM v2_agent_artifacts AS artifact
        JOIN v2_agent_runs AS run ON run.organization_id = artifact.organization_id AND run.id = artifact.run_id
        WHERE artifact.organization_id = $1 AND run.protocol_version = 'agent-runtime/v1'
        UNION ALL
        SELECT message.payload
        FROM v2_agent_run_messages AS message
        JOIN v2_agent_runs AS run ON run.organization_id = message.organization_id AND run.id = message.run_id
        WHERE message.organization_id = $1 AND run.protocol_version = 'agent-runtime/v1'
        UNION ALL
        SELECT intent.action_payload AS payload
        FROM v2_agent_confirmation_intents AS intent
        JOIN v2_agent_runs AS run ON run.organization_id = intent.organization_id AND run.id = intent.run_id
        WHERE intent.organization_id = $1 AND run.protocol_version = 'agent-runtime/v1'
      ) AS persisted
      WHERE NOT public.v2_agent_runtime_payload_is_safe(payload)
    `, organizationId)
    return Number(rows[0]?.unsafeCount ?? 0) === 0
  })
}

async function phase9UnsafeMutatingTools(organizationId: string, userId: string) {
  if (!appClient) throw new Error('V2_RLS=FAIL application client was not initialized.')
  return appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", organizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", userId)
    return tx.$queryRawUnsafe<Array<{ toolKey: string; adapterKey: string }>>(`
      SELECT tool.tool_key AS "toolKey", version.adapter_key AS "adapterKey"
      FROM v2_agent_tools AS tool
      JOIN v2_agent_tool_versions AS version
        ON version.organization_id = tool.organization_id AND version.id = tool.active_version_id
      WHERE tool.organization_id = $1
        AND tool.status = 'ACTIVE'
        AND version.status = 'PUBLISHED'
        AND version.mode = 'MUTATING'
        AND version.adapter_key <> 'formula.candidate_save_draft'
      ORDER BY tool.tool_key ASC
    `, organizationId)
  })
}

async function phase9DatabaseRejects(organizationId: string, userId: string, statement: string, values: string[], expectedMessage: string) {
  if (!appClient) throw new Error('V2_RLS=FAIL application client was not initialized.')
  try {
    await appClient.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", organizationId)
      await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", userId)
      await tx.$executeRawUnsafe(statement, ...values)
    })
    return false
  } catch (error) {
    return error instanceof Error && error.message.includes(expectedMessage)
  }
}

async function phase9DatabaseAllows(organizationId: string, userId: string, statement: string, values: string[]) {
  if (!appClient) throw new Error('V2_RLS=FAIL application client was not initialized.')
  try {
    await appClient.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", organizationId)
      await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", userId)
      await tx.$executeRawUnsafe(statement, ...values)
    })
    return true
  } catch {
    return false
  }
}

/**
 * New signups get the current registry defaults, but production migrations
 * must also repair pre-Phase-8 authoritative policy documents. Re-run 0014
 * against a controlled legacy fixture to prove it preserves custom grants and
 * bumps the policy version exactly once.
 */
async function verifyLegacyProductionPolicyBackfill() {
  if (!adminClient) throw new Error('V2_RLS=FAIL administrative test client is unavailable.')
  const fixture = `legacy-p8-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const organizationId = `org_${fixture}`
  const userId = `usr_${fixture}`
  const ownerAdminPermissions = [
    'production.view', 'production.create', 'production.plan', 'production.allocate', 'production.weigh', 'production.process',
    'production.qc', 'production.qc.record', 'production.qc.approve', 'production.deviation.manage', 'production.release',
    'production.cancel', 'production.close', 'production.finishedGoods.view', 'production.documents.view', 'production.documents.manage',
  ]
  const labManagerPermissions = [
    'production.view', 'production.create', 'production.plan', 'production.allocate', 'production.weigh', 'production.process',
    'production.qc.record', 'production.qc.approve', 'production.deviation.manage', 'production.cancel', 'production.close',
    'production.documents.view', 'production.documents.manage', 'production.finishedGoods.view',
  ]
  const labTechnicianPermissions = [
    'production.view', 'production.weigh', 'production.process', 'production.qc.record', 'production.documents.view', 'production.finishedGoods.view',
  ]
  await adminClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('INSERT INTO v2_organizations (id, slug, name) VALUES ($1, $2, $3)', organizationId, fixture.slice(0, 60), 'Legacy policy fixture')
    await tx.$executeRawUnsafe('INSERT INTO v2_users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)', userId, `${fixture}@example.test`, 'Legacy policy fixture', 'not-a-login')
    for (const roleKey of ['Owner', 'Admin', 'Lab Manager', 'Lab Technician']) {
      await tx.$executeRawUnsafe(
        'INSERT INTO v2_role_policies (id, organization_id, role_key, permissions, version, updated_by) VALUES ($1, $2, $3, $4::jsonb, $5, $6)',
        `policy_${fixture}_${roleKey.replaceAll(' ', '_')}`, organizationId, roleKey, JSON.stringify(['tenant.view', `legacy.${roleKey.toLowerCase().replaceAll(' ', '')}`]), 7, userId,
      )
    }
  })
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0012_phase8_production_manufacturing.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0014_phase8_finished_good_hold_and_rework.sql')
  const afterFirst = await adminClient.$queryRawUnsafe<Array<{ roleKey: string; permissions: unknown; version: number }>>(
    'SELECT role_key AS "roleKey", permissions, version FROM v2_role_policies WHERE organization_id = $1 ORDER BY role_key ASC', organizationId,
  )
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0012_phase8_production_manufacturing.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0014_phase8_finished_good_hold_and_rework.sql')
  const afterSecond = await adminClient.$queryRawUnsafe<Array<{ roleKey: string; permissions: unknown; version: number }>>(
    'SELECT role_key AS "roleKey", permissions, version FROM v2_role_policies WHERE organization_id = $1 ORDER BY role_key ASC', organizationId,
  )
  const expectedByRole = new Map([
    ['Owner', { version: 8, permissions: ownerAdminPermissions, denied: [] }],
    ['Admin', { version: 8, permissions: ownerAdminPermissions, denied: [] }],
    ['Lab Manager', { version: 9, permissions: labManagerPermissions, denied: ['production.release'] }],
    ['Lab Technician', { version: 8, permissions: labTechnicianPermissions, denied: ['production.qc.approve', 'production.release'] }],
  ])
  const valid = (rows: Array<{ roleKey: string; permissions: unknown; version: number }>) => rows.length === expectedByRole.size
    && rows.every((row) => {
      const expected = expectedByRole.get(row.roleKey)
      return Boolean(expected)
        && Array.isArray(row.permissions)
        && row.version === expected.version
        && row.permissions.includes('tenant.view')
        && row.permissions.includes(`legacy.${row.roleKey.toLowerCase().replaceAll(' ', '')}`)
        && expected.permissions.every((permission) => row.permissions.includes(permission))
        && expected.denied.every((permission) => !row.permissions.includes(permission))
    })
  return valid(afterFirst) && valid(afterSecond)
}

/**
 * Phase 11 permissions live in persisted policy documents, so upgrades need
 * proof in addition to fresh-signup defaults. The migration must retain
 * tenant-specific grants and be harmless when replayed.
 */
async function verifyLegacyAdvancedPolicyBackfill() {
  if (!adminClient) throw new Error('V2_RLS=FAIL administrative test client is unavailable.')
  const fixture = `legacy-p11-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const organizationId = `org_${fixture}`
  const userId = `usr_${fixture}`
  const grants: Record<string, string[]> = {
    Owner: ['optimizer.view', 'optimizer.run', 'optimizer.review', 'imports.view', 'imports.preview', 'imports.commit', 'bulk.preview', 'bulk.execute', 'dataops.view', 'dataops.run'],
    Admin: ['optimizer.view', 'optimizer.run', 'optimizer.review', 'imports.view', 'imports.preview', 'imports.commit', 'bulk.preview', 'bulk.execute', 'dataops.view', 'dataops.run'],
    Perfumer: ['optimizer.view', 'optimizer.run', 'optimizer.review'],
    'R&D Scientist': ['optimizer.view', 'optimizer.run', 'dataops.view'],
    'Lab Manager': ['imports.view', 'imports.preview', 'imports.commit', 'bulk.preview', 'bulk.execute', 'dataops.view', 'dataops.run'],
    Procurement: ['imports.view', 'imports.preview', 'imports.commit', 'bulk.preview', 'bulk.execute', 'dataops.view'],
  }
  await adminClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('INSERT INTO v2_organizations (id, slug, name) VALUES ($1, $2, $3)', organizationId, fixture.slice(0, 60), 'Legacy Phase 11 policy fixture')
    await tx.$executeRawUnsafe('INSERT INTO v2_users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)', userId, `${fixture}@example.test`, 'Legacy Phase 11 policy fixture', 'not-a-login')
    for (const roleKey of Object.keys(grants)) {
      await tx.$executeRawUnsafe(
        'INSERT INTO v2_role_policies (id, organization_id, role_key, permissions, version, updated_by) VALUES ($1, $2, $3, $4::jsonb, $5, $6)',
        `policy_${fixture}_${roleKey.replaceAll(' ', '_')}`, organizationId, roleKey, JSON.stringify(['tenant.view', `legacy.${roleKey.toLowerCase().replaceAll(' ', '')}`]), 5, userId,
      )
    }
  })
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0017_phase11_advanced_optimizer_imports.sql')
  const afterFirst = await adminClient.$queryRawUnsafe<Array<{ roleKey: string; permissions: unknown; version: number }>>(
    'SELECT role_key AS "roleKey", permissions, version FROM v2_role_policies WHERE organization_id = $1 ORDER BY role_key ASC', organizationId,
  )
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0017_phase11_advanced_optimizer_imports.sql')
  const afterSecond = await adminClient.$queryRawUnsafe<Array<{ roleKey: string; permissions: unknown; version: number }>>(
    'SELECT role_key AS "roleKey", permissions, version FROM v2_role_policies WHERE organization_id = $1 ORDER BY role_key ASC', organizationId,
  )
  const valid = (rows: Array<{ roleKey: string; permissions: unknown; version: number }>) => rows.length === Object.keys(grants).length
    && rows.every((row) => Array.isArray(row.permissions)
      && row.version === 6
      && row.permissions.includes('tenant.view')
      && row.permissions.includes(`legacy.${row.roleKey.toLowerCase().replaceAll(' ', '')}`)
      && (grants[row.roleKey] ?? []).every((permission) => row.permissions.includes(permission)))
  return valid(afterFirst) && valid(afterSecond)
}

try {
  resetDisposableSchema()
  applyMigrations()
  adminClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  appClient = new PrismaClient({ datasources: { db: { url: applicationUrl.toString() } } })
  await configureApplicationRole()
  const legacyProductionPolicyBackfill = await verifyLegacyProductionPolicyBackfill()
  const legacyAdvancedPolicyBackfill = await verifyLegacyAdvancedPolicyBackfill()
  const repository = new PrismaPlatformRepository(appClient)
  const service = new PlatformService(repository, { baseDomain: 'olfactoryops.com', sessionPepper: 'rls-session', passwordPepper: 'rls-password' })
  const lab = new LabOperationsService(appClient, service)
  const scientific = new ScientificFeatureService(appClient, service, new RlsScientificRuntime())
  const modelDataset = new ModelDatasetService(appClient, service)
  const olfactory = new OlfactoryIntelligenceService(appClient, service)
  const consumer = new ConsumerIntelligenceService(appClient, service)
  const formula = new FormulaService(appClient, service)
  const evidence = new MaterialEvidenceService(appClient, service)
  const agent = new DurableAgentService(appClient, service)
  const trials = new TrialSensoryService(appClient, service, lab)
  const production = new ProductionService(appClient, service, lab)
  const commerce = new CommerceService(appClient, service)
  const advanced = new AdvancedOperationsService(appClient, service, formula, lab, { confirmationSecret: 'rls-phase11-confirmation-secret' })
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const slug = `rls-${suffix}`
  const secondSlug = `rls-second-${suffix}`
  const result = await service.signup({ organizationName: 'RLS Verification', workspaceSlug: slug, email: `${slug}@example.test`, displayName: 'RLS Verification', password: 'Correct Horse Battery 12!' })
  firstOrganizationId = result.membership.organizationId
  firstUserId = result.user.id
  await service.verifyEmail(result.verificationToken)
  const login = await service.login({ email: `${slug}@example.test`, password: 'Correct Horse Battery 12!', hostname: `${slug}.olfactoryops.com` })
  const context = await service.contextFromToken(login.rawSessionToken, `${slug}.olfactoryops.com`)
  const second = await service.signup({ organizationName: 'RLS Second', workspaceSlug: secondSlug, email: `${secondSlug}@example.test`, displayName: 'RLS Second', password: 'Correct Horse Battery 12!' })
  secondOrganizationId = second.membership.organizationId
  await service.verifyEmail(second.verificationToken)
  const trustedHostnameResolution = await appClient!.$queryRawUnsafe<Array<{ organizationId: string }>>(
    'SELECT organization_id AS "organizationId" FROM public.v2_resolve_active_workspace_hostname($1)',
    `${slug}.olfactoryops.com`,
  )
  const unknownHostnameResolution = await appClient!.$queryRawUnsafe<Array<{ organizationId: string }>>(
    'SELECT organization_id AS "organizationId" FROM public.v2_resolve_active_workspace_hostname($1)',
    `unknown-${suffix}.olfactoryops.com`,
  )
  if (trustedHostnameResolution.length !== 1 || trustedHostnameResolution[0]?.organizationId !== firstOrganizationId || unknownHostnameResolution.length !== 0) {
    throw new Error('V2_RLS=FAIL trusted hostname resolver did not return an exact active workspace only')
  }
  brandUserId = `usr_brand_${suffix.replace(/[^a-z0-9]/gi, '')}`
  await adminClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('INSERT INTO v2_users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)', brandUserId!, `${brandUserId}@example.test`, 'Brand QA', 'not-a-login')
    await tx.$executeRawUnsafe('INSERT INTO v2_memberships (id, organization_id, user_id, role_key, status) VALUES ($1, $2, $3, $4, $5)', `mem_${brandUserId}`, firstOrganizationId!, brandUserId!, 'Brand', 'ACTIVE')
  })
  panelistUserId = `usr_panelist_${suffix.replace(/[^a-z0-9]/gi, '')}`
  await adminClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('INSERT INTO v2_users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)', panelistUserId!, `${panelistUserId}@example.test`, 'Panelist QA', 'not-a-login')
    await tx.$executeRawUnsafe('INSERT INTO v2_memberships (id, organization_id, user_id, role_key, status) VALUES ($1, $2, $3, $4, $5)', `mem_${panelistUserId}`, firstOrganizationId!, panelistUserId!, 'Sensory Panelist', 'ACTIVE')
  })

  // Exercise the bounded platform state procedure as the constrained app role.
  // This catches ambiguous PL/pgSQL output-field references that schema-only
  // migration checks cannot observe.
  const platformTransitionOperatorId = `pop_rls_transition_${suffix.replace(/[^a-z0-9]/gi, '')}`
  await adminClient!.$executeRawUnsafe(
    `INSERT INTO v2_platform_operators (id, user_id, role_key, status, mfa_required, created_by)
     VALUES ($1, $2, 'PLATFORM_OWNER', 'ACTIVE', false, $2)`,
    platformTransitionOperatorId,
    firstUserId!,
  )
  const platformTransition = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.platform_user_id', $1, true)", firstUserId!)
    const suspended = await tx.$queryRawUnsafe<Array<{ organization_id: string; status: string }>>(
      'SELECT * FROM public.v2_platform_set_tenant_state($1, $2, $3, $4, $5)',
      firstOrganizationId!,
      'SUSPENDED',
      'Disposable platform lifecycle procedure verification.',
      `rls-platform-suspend-${suffix}`,
      `rls-platform-correlation-${suffix}`,
    )
    const replay = await tx.$queryRawUnsafe<Array<{ organization_id: string; status: string }>>(
      'SELECT * FROM public.v2_platform_set_tenant_state($1, $2, $3, $4, $5)',
      firstOrganizationId!,
      'SUSPENDED',
      'Disposable platform lifecycle procedure verification.',
      `rls-platform-suspend-${suffix}`,
      `rls-platform-correlation-replay-${suffix}`,
    )
    const active = await tx.$queryRawUnsafe<Array<{ organization_id: string; status: string }>>(
      'SELECT * FROM public.v2_platform_set_tenant_state($1, $2, $3, $4, $5)',
      firstOrganizationId!,
      'ACTIVE',
      'Restore disposable platform lifecycle verification workspace.',
      `rls-platform-reactivate-${suffix}`,
      `rls-platform-reactivate-correlation-${suffix}`,
    )
    return { suspended: suspended[0], replay: replay[0], active: active[0] }
  })
  const platformTransitionPass = platformTransition.suspended?.organization_id === firstOrganizationId
    && platformTransition.suspended?.status === 'SUSPENDED'
    && platformTransition.replay?.status === 'SUSPENDED'
    && platformTransition.active?.status === 'ACTIVE'

  let crossTenantDenied = false
  try {
    await service.contextFromToken(login.rawSessionToken, `${secondSlug}.olfactoryops.com`)
  } catch (error) {
    crossTenantDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'TENANT_ACCESS_DENIED'
  }

  const unscopedMemberships = await scopedMembershipCount()
  const firstTenantMemberships = await scopedMembershipCount(firstOrganizationId, context.user.id)
  const secondTenantVisibleFromFirstContext = await appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", context.user.id)
    return tx.membership.count({ where: { organizationId: secondOrganizationId! } })
  })

  const material = await lab.createMaterial(context.context, { name: 'RLS test material', internalCode: `RLS-${suffix}`, sensoryMetadata: { source: 'test' }, identifiers: [] }, `rls-material-${suffix}`)
  const duplicateMaterial = await lab.createMaterial(context.context, { name: 'RLS test material', internalCode: `RLS-${suffix}`, sensoryMetadata: { source: 'test' }, identifiers: [] }, `rls-material-${suffix}`)
  await lab.changeMaterialStatus(context.context, material.id, 'ACTIVE', `rls-material-status-${suffix}`)
  const structureJob = await scientific.normalizeMaterial(context.context, material.id, { smiles: 'OCC' }, `rls-science-structure-${suffix}`)
  const duplicateStructureJob = await scientific.normalizeMaterial(context.context, material.id, { smiles: 'OCC' }, `rls-science-structure-${suffix}`)
  const featureJob = await scientific.generateFeatures(context.context, material.id, { featureKinds: ['ECFP', 'MOLFTP'] }, `rls-science-features-${suffix}`)
  const scienceArtifacts = await scientific.materialArtifacts(context.context, material.id)
  const dataset = await modelDataset.createDataset(context.context, { key: `qa-dataset-${suffix.replace(/[^a-z0-9]/gi, '').slice(-20)}`, name: 'Isolated scaffold benchmark', task: 'Bounded fragrance research benchmark' }, `rls-dataset-create-${suffix}`)
  const duplicateDataset = await modelDataset.createDataset(context.context, { key: dataset.key, name: 'Isolated scaffold benchmark', task: 'Bounded fragrance research benchmark' }, `rls-dataset-create-${suffix}`)
  const datasetVersion = await modelDataset.registerDatasetVersion(context.context, dataset.id, {
    version: 'qa-1', sourceRepository: 'https://github.com/osmoai/publications', sourcePath: 'tests/fixture.csv', sourceCommit: '5aa9d2cd06a9b4dcae8b5fce2ec5e5d0f763fbd8', citation: 'Osmo Publications isolated fixture', sourceVersion: 'qa-source-1', schemaVersion: 'dataset/1', contentChecksum: '1'.repeat(64), materialUniverseHash: '2'.repeat(64), rowCount: 3,
    license: { spdxId: 'CC-BY-4.0', attribution: 'Osmo Publications dataset attribution preserved in fixture.', usagePolicy: 'Isolated QA benchmark only.', evidenceUrl: 'https://github.com/osmoai/publications', evidenceStatus: 'VERIFIED' },
    transformations: [{ key: 'scaffold-split', version: '1', codeRef: 'tests/fixture', configurationHash: '3'.repeat(64), inputHash: '1'.repeat(64), outputHash: '4'.repeat(64) }],
    artifacts: [{ kind: 'MANIFEST', storageRef: 'test://dataset/manifest', contentHash: '5'.repeat(64), schemaVersion: 'manifest/1' }],
  }, `rls-dataset-version-${suffix}`)
  const approvedDatasetVersion = await modelDataset.approveDatasetVersion(context.context, datasetVersion.id, `rls-dataset-approve-${suffix}`)
  const model = await modelDataset.createModel(context.context, { key: `qa-model-${suffix.replace(/[^a-z0-9]/gi, '').slice(-20)}`, name: 'Isolated KGCNN benchmark', intendedUse: 'Research-only architecture and provenance verification.' }, `rls-model-create-${suffix}`)
  const modelVersion = await modelDataset.registerModelVersion(context.context, model.id, {
    version: 'qa-1', architecture: { key: 'KGCNN', version: '2025.1', componentKey: 'KGCNN_KERAS_UNLOCKED', configurationHash: '6'.repeat(64) },
    featureContract: { key: 'qa-graph', version: '1', featureKinds: ['MOLECULAR_GRAPH'], schemaHash: '7'.repeat(64) }, trainingTask: 'Research-only binary fixture',
    modelCard: { purpose: 'Verify model registry provenance.', limitations: ['No scientific claim is made from this fixture.'], prohibitedInterpretations: ['Do not use as a production prediction.'] },
    checkpoint: { storageRef: 'test://checkpoint/qa', checkpointHash: '8'.repeat(64), format: 'KERAS' },
  }, `rls-model-version-${suffix}`)
  const trainingRun = await modelDataset.createTrainingRun(context.context, modelVersion.id, {
    seed: 42, splitStrategy: 'SCAFFOLD_GROUP', splitManifestHash: '9'.repeat(64), configurationHash: 'a'.repeat(64),
    datasets: [
      { datasetVersionId: datasetVersion.id, splitRole: 'TRAIN', splitArtifactHash: 'b'.repeat(64), groupSetHash: 'c'.repeat(64) },
      { datasetVersionId: datasetVersion.id, splitRole: 'VALIDATION', splitArtifactHash: 'd'.repeat(64), groupSetHash: 'e'.repeat(64) },
      { datasetVersionId: datasetVersion.id, splitRole: 'TEST', splitArtifactHash: 'f'.repeat(64), groupSetHash: '0'.repeat(64) },
    ],
  }, `rls-training-run-${suffix}`)
  const evaluation = await modelDataset.recordEvaluation(context.context, trainingRun.id, { datasetVersionId: datasetVersion.id, protocolVersion: 'qa-eval-1', leakageStatus: 'PASS', metrics: [{ key: 'accuracy', value: 0.75, unit: 'fraction' }] }, `rls-evaluation-${suffix}`)
  const modelRuntime = await modelDataset.runtimeStatus(context.context, modelVersion.id)
  const comparisonMaterial = await lab.createMaterial(context.context, { name: 'RLS similarity material', internalCode: `SIM-${suffix}`, sensoryMetadata: { source: 'test' }, identifiers: [] }, `rls-sim-material-${suffix}`)
  await lab.changeMaterialStatus(context.context, comparisonMaterial.id, 'ACTIVE', `rls-sim-material-status-${suffix}`)
  await scientific.normalizeMaterial(context.context, comparisonMaterial.id, { smiles: 'CCO' }, `rls-sim-structure-${suffix}`)
  await scientific.generateFeatures(context.context, comparisonMaterial.id, { featureKinds: ['ECFP'] }, `rls-sim-features-${suffix}`)
  const molecularEmbedding = await olfactory.createMolecularEmbedding(context.context, material.id, { featureKinds: ['ECFP'], method: 'FINGERPRINT_BINARY_VECTOR', normalization: 'L2', indexVersion: 'qa-index/1' }, `rls-embedding-${suffix}`)
  const molecularSimilarity = await olfactory.compareMolecularSimilarity(context.context, material.id, { candidateMaterialId: comparisonMaterial.id, featureKind: 'ECFP', indexVersion: 'qa-index/1' }, `rls-similarity-${suffix}`)
  const odorPrediction = await olfactory.recordOdorPredictionNotEvaluated(context.context, material.id, { modelVersionId: modelVersion.id, requestedTask: 'odor-descriptor' }, `rls-odor-prediction-${suffix}`)
  const explainability = await olfactory.explain(context.context, material.id, { featureKind: 'MOLFTP', requestedTask: 'odor-descriptor' }, `rls-explain-${suffix}`)
  const sentimentSource = await consumer.createSource(context.context, { key: `sentiment-${suffix.replace(/[^a-z0-9]/gi, '').slice(-20)}`, type: 'SURVEY', sourceScope: 'qa-project', storageRef: 'test://consumer-feedback', purpose: 'Isolated consumer preference verification.', consentRequired: true, retentionDays: 30 }, `rls-sentiment-source-${suffix}`)
  const sentimentFeedback = await consumer.ingestFeedback(context.context, { sourceId: sentimentSource.id, externalRefHash: '1'.repeat(64), contentHash: '2'.repeat(64), privateContentRef: 'private://qa-feedback/1', consentProofHash: '3'.repeat(64), languageHint: 'EN', collectedAt: new Date().toISOString() }, `rls-sentiment-feedback-${suffix}`)
  const sentimentAnalysis = await consumer.recordAnalysis(context.context, { feedbackItemId: sentimentFeedback.id, extractionVersion: 'manual-v1', provider: 'manual-review', modelVersion: 'manual-v1', language: 'EN', languageConfidence: 1, overall: { label: 'POSITIVE', score: 0.5, confidence: 0.8 }, descriptors: [{ id: 'woody', value: 0.6, confidence: 0.8 }], evidenceStatus: 'VERIFIED' }, `rls-sentiment-analysis-${suffix}`)
  const transientAnalysis = await consumer.analyzeTransientFeedback(context.context, { feedbackItemId: sentimentFeedback.id, rawText: 'A beautiful woody opening, but the drydown is a little weak.' }, `rls-sentiment-transient-${suffix}`)
  const preference = await consumer.createPreferenceVector(context.context, { sourceIds: [sentimentSource.id], sourceScope: 'qa-project', vocabularyVersion: 'v1', aggregationVersion: 'v1' }, `rls-sentiment-preference-${suffix}`)
  const inventoryMovementCountBeforeFormula = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_inventory_movements WHERE organization_id = $1', firstOrganizationId!)
    return Number(rows[0]!.count)
  })
  const formulaProject = await formula.createProject(context.context, { name: 'RLS formula', formulaType: 'ACCORD' }, `rls-formula-project-${suffix}`)
  const formulaDraft = await formula.createDraft(context.context, formulaProject.id, { components: [{ materialId: material.id, percentage: 100, position: 0, note: 'isolated test component' }], targetMassGrams: 100 }, `rls-formula-draft-${suffix}`)
  const formulaValidation = await formula.validateDraft(context.context, formulaDraft.id)
  const submittedFormula = await formula.submitReview(context.context, formulaDraft.id, 'Isolated deterministic formula review.', `rls-formula-submit-${suffix}`)
  const approvedFormula = await formula.approveDraft(context.context, formulaDraft.id, 'Isolated approval evidence.', `rls-formula-approve-${suffix}`)
  const designProject = await formula.createDesignProject(context.context, { name: 'RLS design', rawBrief: 'A compact woody research direction.', formulaProjectId: formulaProject.id }, `rls-design-project-${suffix}`)
  const reviewedBrief = await formula.reviewBrief(context.context, designProject.id, { structuredBrief: { product: { type: 'ACCORD' }, creativeDirection: 'Woody and transparent.', performance: ['moderate diffusion'], audience: [], markets: [], availabilityFirst: true, requiredMaterialIds: [material.id], prohibitedMaterialIds: [], unresolvedQuestions: [] } }, `rls-design-review-${suffix}`)
  const materialUniverse = await formula.buildMaterialUniverse(context.context, designProject.id, `rls-design-universe-${suffix}`)
  const indexedEvidence = await evidence.index(context.context, { materialId: material.id, sourceKind: 'MATERIAL_PROFILE', sourceRef: 'test://rls/profile', version: '1', contentHash: '9'.repeat(64), excerpts: ['Woody profile with a transparent drydown and material evidence.'] }, `rls-evidence-index-${suffix}`)
  const retrievedEvidence = await evidence.retrieve(context.context, { materialId: material.id, query: 'woody drydown', limit: 3 })
  const candidate = await formula.createCandidate(context.context, designProject.id, {
    narrative: 'A private single-material benchmark direction.',
    components: [{ materialId: material.id, percentage: 100, position: 0 }],
    evidenceReferences: {
      materialEvidenceSourceIds: [indexedEvidence.sourceId],
      scientificArtifactIds: scienceArtifacts.filter((artifact) => artifact.evidenceStatus === 'VERIFIED').slice(0, 1).map((artifact) => artifact.id),
      consumerPreferenceVectorId: preference.id,
    },
  }, `rls-design-candidate-${suffix}`)
  await formula.shareCandidate(context.context, candidate.id, { recipientUserIds: [brandUserId!], allowMaterialNames: false }, `rls-design-share-${suffix}`)
  const brandCandidate = await formula.candidateDetail({ ...context.context, userId: brandUserId!, role: 'Brand', sessionId: `ses_${brandUserId}` }, candidate.id)
  const savedCandidateDraft = await formula.saveCandidateAsDraft(context.context, candidate.id, formulaProject.id, `rls-design-save-${suffix}`)
  const duplicateCandidateDraft = await formula.saveCandidateAsDraft(context.context, candidate.id, formulaProject.id, `rls-design-save-duplicate-${suffix}`)
  const concurrentCandidate = await formula.createCandidate(context.context, designProject.id, {
    narrative: 'A second isolated candidate for concurrent-draft verification.',
    components: [{ materialId: material.id, percentage: 100, position: 0 }],
  }, `rls-design-candidate-concurrent-${suffix}`)
  const concurrentCandidateDrafts = await Promise.all([
    formula.saveCandidateAsDraft(context.context, concurrentCandidate.id, formulaProject.id, `rls-design-save-concurrent-a-${suffix}`),
    formula.saveCandidateAsDraft(context.context, concurrentCandidate.id, formulaProject.id, `rls-design-save-concurrent-b-${suffix}`),
  ])
  const concurrentCandidateDraftUnique = concurrentCandidateDrafts[0]?.id === concurrentCandidateDrafts[1]?.id
  const unrelatedFormulaProject = await formula.createProject(context.context, { name: 'RLS unrelated formula', formulaType: 'ACCORD' }, `rls-formula-project-unrelated-${suffix}`)
  let crossProjectCandidateDraftDenied = false
  try {
    await formula.saveCandidateAsDraft(context.context, candidate.id, unrelatedFormulaProject.id, `rls-design-save-cross-project-${suffix}`)
  } catch (error) {
    crossProjectCandidateDraftDenied = error instanceof Error
      && 'code' in error
      && (error as { code?: string }).code === 'DESIGN_CANDIDATE_FORMULA_PROJECT_MISMATCH'
  }
  const agentRun = await agent.start(context.context, { designProjectId: designProject.id, workflowKey: 'design-studio/1', inputHash: 'a'.repeat(64) }, `rls-agent-start-${suffix}`)
  const waitingAgentRun = await agent.execute(context.context, agentRun.id, `rls-agent-execute-${suffix}`)
  const confirmedAgentRun = await agent.confirm(context.context, agentRun.id, waitingAgentRun.confirmation.id, { accept: true }, `rls-agent-confirm-${suffix}`)
  const duplicateAgentConfirmation = await agent.confirm(context.context, agentRun.id, waitingAgentRun.confirmation.id, { accept: true }, `rls-agent-confirm-duplicate-${suffix}`)
  const replayedAgentRun = await agent.detail(context.context, agentRun.id, 0)
  const cancelableAgentRun = await agent.start(context.context, { designProjectId: designProject.id, workflowKey: 'design-studio/1', inputHash: 'b'.repeat(64) }, `rls-agent-cancel-start-${suffix}`)
  const cancelledAgentRun = await agent.cancel(context.context, cancelableAgentRun.id, `rls-agent-cancel-${suffix}`)
  const expiringAgentRun = await agent.start(context.context, { designProjectId: designProject.id, workflowKey: 'design-studio/1', inputHash: 'c'.repeat(64) }, `rls-agent-expire-start-${suffix}`)
  const waitingExpiredAgentRun = await agent.execute(context.context, expiringAgentRun.id, `rls-agent-expire-execute-${suffix}`)
  await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    await tx.$executeRawUnsafe('UPDATE v2_agent_confirmations SET expires_at = now() - interval \'1 second\' WHERE organization_id = $1 AND id = $2', firstOrganizationId!, waitingExpiredAgentRun.confirmation.id)
  })
  const expiredAgentConfirmation = await agent.confirm(context.context, expiringAgentRun.id, waitingExpiredAgentRun.confirmation.id, { accept: true }, `rls-agent-expire-confirm-${suffix}`)
  const retriedAgentRun = await agent.retry(context.context, expiringAgentRun.id, `rls-agent-retry-${suffix}`)
  const retriedCancelledAgentRun = await agent.cancel(context.context, expiringAgentRun.id, `rls-agent-retry-cancel-${suffix}`)
  const phase9Bootstrap = await agent.bootstrap(context.context)
  const phase9BootstrapReplay = await agent.bootstrap(context.context)
  const phase9Configuration = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId!)
    return tx.$queryRawUnsafe<Array<{ publishedActiveConfigurations: bigint }>>(`
      SELECT count(*)::bigint AS "publishedActiveConfigurations"
      FROM v2_agent_definitions AS definition
      JOIN v2_agent_definition_versions AS definition_version
        ON definition_version.organization_id = definition.organization_id
       AND definition_version.id = definition.active_version_id
       AND definition_version.status = 'PUBLISHED'
      JOIN v2_agent_workflow_versions AS workflow_version
        ON workflow_version.organization_id = definition.organization_id
       AND workflow_version.agent_definition_version_id = definition_version.id
       AND workflow_version.status = 'PUBLISHED'
      JOIN v2_agent_workflows AS workflow
        ON workflow.organization_id = workflow_version.organization_id
       AND workflow.id = workflow_version.workflow_id
       AND workflow.active_version_id = workflow_version.id
      JOIN v2_agent_policy_versions AS policy_version
        ON policy_version.organization_id = workflow_version.organization_id
       AND policy_version.id = workflow_version.policy_version_id
       AND policy_version.status = 'PUBLISHED'
      WHERE definition.organization_id = $1
        AND definition.agent_key = 'inventory-assistant'
        AND definition.status = 'ACTIVE'
    `, firstOrganizationId!)
  })
  const phase9Run = await agent.start(context.context, { definitionKey: 'inventory-assistant', input: {} }, `rls-p9-start-${suffix}`)
  const duplicatePhase9Run = await agent.start(context.context, { definitionKey: 'inventory-assistant', input: {} }, `rls-p9-start-${suffix}`)
  const phase9ToolExecution = await agent.execute(context.context, phase9Run.id, `rls-p9-execute-tool-${suffix}`)
  const phase9ArtifactExecution = await agent.execute(context.context, phase9Run.id, `rls-p9-execute-artifact-${suffix}`)
  const phase9Detail = await agent.detail(context.context, phase9Run.id, 0)
  const phase9Replay = await agent.replay(context.context, phase9Run.id, { afterSequence: 0, limit: 100 })
  const phase9Evidence = await agent.evidence(context.context, phase9Run.id)
  const phase9RunMetadata = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId!)
    return tx.$queryRawUnsafe<Array<{ policyVersionId: string; correlationId: string }>>(
      'SELECT policy_version_id AS "policyVersionId", correlation_id AS "correlationId" FROM v2_agent_runs WHERE organization_id = $1 AND id = $2',
      firstOrganizationId!, phase9Run.id,
    )
  })
  if (!phase9RunMetadata[0]) throw new Error('V2_RLS=FAIL Phase 9 run metadata is missing.')
  const phase9Evaluation = await agent.createEvaluation(context.context, {
    policyVersionId: phase9RunMetadata[0].policyVersionId,
    evaluationKey: 'rls.read-only',
    subjectKind: 'RUN',
    subjectRef: phase9Run.id,
    evaluatorKind: 'RULE',
    status: 'PASSED',
    score: 1,
    resultSummary: { metadata: { summary: 'Disposable verifier confirms a read-only tenant-scoped run.' } },
    resultHash: 'f'.repeat(64),
    correlationId: phase9RunMetadata[0].correlationId,
  }, `rls-p9-evaluation-${suffix}`)
  const duplicatePhase9Evaluation = await agent.createEvaluation(context.context, {
    policyVersionId: phase9RunMetadata[0].policyVersionId,
    evaluationKey: 'rls.read-only',
    subjectKind: 'RUN',
    subjectRef: phase9Run.id,
    evaluatorKind: 'RULE',
    status: 'PASSED',
    score: 1,
    resultSummary: { metadata: { summary: 'Disposable verifier confirms a read-only tenant-scoped run.' } },
    resultHash: 'f'.repeat(64),
    correlationId: phase9RunMetadata[0].correlationId,
  }, `rls-p9-evaluation-${suffix}`)
  const phase9CandidateDraftCountBeforeConfirmation = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId!)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_formula_drafts WHERE organization_id = $1 AND formula_project_id = $2', firstOrganizationId!, formulaProject.id)
    return Number(rows[0]?.count ?? 0)
  })
  const phase9ConfirmationInput = { definitionKey: 'formula-research', input: { candidateId: candidate.id, formulaProjectId: formulaProject.id } }
  const phase9ConfirmationRun = await agent.start(context.context, phase9ConfirmationInput, `rls-p9-confirm-start-${suffix}`)
  for (const [index, step] of ['materials', 'evidence', 'artifact', 'confirmation'].entries()) {
    await agent.execute(context.context, phase9ConfirmationRun.id, `rls-p9-confirm-execute-${step}-${index}-${suffix}`)
  }
  const phase9ConfirmationDetail = await agent.detail(context.context, phase9ConfirmationRun.id, 0)
  const phase9PendingConfirmation = phase9ConfirmationDetail.confirmations[0] as { id?: string } | undefined
  if (!phase9PendingConfirmation?.id) throw new Error('V2_RLS=FAIL Phase 9 candidate confirmation was not created.')
  const phase9RejectedConfirmation = await agent.confirm(context.context, phase9ConfirmationRun.id, phase9PendingConfirmation.id, { decision: 'REJECT' }, `rls-p9-confirm-reject-${suffix}`)
  const duplicatePhase9RejectedConfirmation = await agent.confirm(context.context, phase9ConfirmationRun.id, phase9PendingConfirmation.id, { decision: 'REJECT' }, `rls-p9-confirm-reject-duplicate-${suffix}`)
  const phase9ExpiringConfirmationRun = await agent.start(context.context, phase9ConfirmationInput, `rls-p9-confirm-expire-start-${suffix}`)
  for (const [index, step] of ['materials', 'evidence', 'artifact', 'confirmation'].entries()) {
    await agent.execute(context.context, phase9ExpiringConfirmationRun.id, `rls-p9-confirm-expire-execute-${step}-${index}-${suffix}`)
  }
  const phase9ExpiringConfirmationDetail = await agent.detail(context.context, phase9ExpiringConfirmationRun.id, 0)
  const phase9ExpiringConfirmation = phase9ExpiringConfirmationDetail.confirmations[0] as { id?: string } | undefined
  if (!phase9ExpiringConfirmation?.id) throw new Error('V2_RLS=FAIL Phase 9 expiring confirmation was not created.')
  await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId!)
    await tx.$executeRawUnsafe("UPDATE v2_agent_confirmations SET expires_at = now() - interval '1 second' WHERE organization_id = $1 AND id = $2", firstOrganizationId!, phase9ExpiringConfirmation.id)
  })
  const phase9ExpiredConfirmation = await agent.confirm(context.context, phase9ExpiringConfirmationRun.id, phase9ExpiringConfirmation.id, { decision: 'REJECT' }, `rls-p9-confirm-expire-${suffix}`)
  const phase9ApprovedConfirmationRun = await agent.start(context.context, phase9ConfirmationInput, `rls-p9-confirm-approve-start-${suffix}`)
  for (const [index, step] of ['materials', 'evidence', 'artifact', 'confirmation'].entries()) {
    await agent.execute(context.context, phase9ApprovedConfirmationRun.id, `rls-p9-confirm-approve-execute-${step}-${index}-${suffix}`)
  }
  const phase9ApprovedConfirmationDetail = await agent.detail(context.context, phase9ApprovedConfirmationRun.id, 0)
  const phase9ApprovedConfirmationPending = phase9ApprovedConfirmationDetail.confirmations[0] as { id?: string } | undefined
  if (!phase9ApprovedConfirmationPending?.id) throw new Error('V2_RLS=FAIL Phase 9 approved confirmation was not created.')
  const phase9ApprovedConfirmation = await agent.confirm(context.context, phase9ApprovedConfirmationRun.id, phase9ApprovedConfirmationPending.id, { decision: 'APPROVE' }, `rls-p9-confirm-approve-${suffix}`)
  const phase9ApprovedConfirmationDuplicate = await agent.confirm(context.context, phase9ApprovedConfirmationRun.id, phase9ApprovedConfirmationPending.id, { decision: 'APPROVE' }, `rls-p9-confirm-approve-duplicate-${suffix}`)
  const phase9InvalidConfirmationRun = await agent.start(context.context, { definitionKey: 'formula-research', input: { candidateId: candidate.id, formulaProjectId: unrelatedFormulaProject.id } }, `rls-p9-confirm-invalid-start-${suffix}`)
  for (const [index, step] of ['materials', 'evidence', 'artifact'].entries()) {
    await agent.execute(context.context, phase9InvalidConfirmationRun.id, `rls-p9-confirm-invalid-execute-${step}-${index}-${suffix}`)
  }
  let phase9InvalidConfirmationCode: string | undefined
  try {
    await agent.execute(context.context, phase9InvalidConfirmationRun.id, `rls-p9-confirm-invalid-execute-confirmation-${suffix}`)
  } catch (error) {
    if (error instanceof Error && 'code' in error) phase9InvalidConfirmationCode = (error as { code?: string }).code
  }
  const phase9InvalidConfirmationDetail = await agent.detail(context.context, phase9InvalidConfirmationRun.id, 0)
  const phase9InvalidQuotaReleased = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId!)
    const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>('SELECT status FROM v2_agent_run_quota_reservations WHERE organization_id = $1 AND run_id = $2', firstOrganizationId!, phase9InvalidConfirmationRun.id)
    return rows[0]?.status === 'RELEASED'
  })
  const phase9CandidateDraftCountAfterConfirmation = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId!)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_formula_drafts WHERE organization_id = $1 AND formula_project_id = $2', firstOrganizationId!, formulaProject.id)
    return Number(rows[0]?.count ?? 0)
  })
  // Cancellation and Formula approval are separate HTTP operations, so prove
  // both serialized outcomes against the same disposable database. A cancelled
  // pending run cannot later invoke Formula, while a durably PROCESSING effect
  // cannot be cancelled underneath the external Formula handoff.
  const phase9CancelledBeforeApprovalRun = await agent.start(context.context, phase9ConfirmationInput, `rls-p9-cancel-before-approve-start-${suffix}`)
  for (const [index, step] of ['materials', 'evidence', 'artifact', 'confirmation'].entries()) {
    await agent.execute(context.context, phase9CancelledBeforeApprovalRun.id, `rls-p9-cancel-before-approve-execute-${step}-${index}-${suffix}`)
  }
  const phase9CancelledBeforeApprovalDetail = await agent.detail(context.context, phase9CancelledBeforeApprovalRun.id, 0)
  const phase9CancelledBeforeApprovalConfirmation = phase9CancelledBeforeApprovalDetail.confirmations[0] as { id?: string } | undefined
  if (!phase9CancelledBeforeApprovalConfirmation?.id) throw new Error('V2_RLS=FAIL Phase 9 cancellation confirmation was not created.')
  const phase9CancelledBeforeApproval = await agent.cancel(context.context, phase9CancelledBeforeApprovalRun.id, `rls-p9-cancel-before-approve-${suffix}`)
  const phase9ConfirmAfterCancellation = await agent.confirm(context.context, phase9CancelledBeforeApprovalRun.id, phase9CancelledBeforeApprovalConfirmation.id, { decision: 'APPROVE' }, `rls-p9-confirm-after-cancel-${suffix}`)
  const phase9CancelledBeforeApprovalFinal = await agent.detail(context.context, phase9CancelledBeforeApprovalRun.id, 0)
  const phase9DraftCountAfterCancelledApproval = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId!)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_formula_drafts WHERE organization_id = $1 AND formula_project_id = $2', firstOrganizationId!, formulaProject.id)
    return Number(rows[0]?.count ?? 0)
  })
  const phase9ApproveBlocksCancelRun = await agent.start(context.context, phase9ConfirmationInput, `rls-p9-approve-blocks-cancel-start-${suffix}`)
  for (const [index, step] of ['materials', 'evidence', 'artifact', 'confirmation'].entries()) {
    await agent.execute(context.context, phase9ApproveBlocksCancelRun.id, `rls-p9-approve-blocks-cancel-execute-${step}-${index}-${suffix}`)
  }
  const phase9ApproveBlocksCancelDetail = await agent.detail(context.context, phase9ApproveBlocksCancelRun.id, 0)
  const phase9ApproveBlocksCancelConfirmation = phase9ApproveBlocksCancelDetail.confirmations[0] as { id?: string } | undefined
  if (!phase9ApproveBlocksCancelConfirmation?.id) throw new Error('V2_RLS=FAIL Phase 9 approval/cancellation confirmation was not created.')
  let signalFormulaWrite: (() => void) | undefined
  let releaseFormulaWrite: (() => void) | undefined
  const formulaWriteStarted = new Promise<void>((resolve) => { signalFormulaWrite = resolve })
  const allowFormulaWrite = new Promise<void>((resolve) => { releaseFormulaWrite = resolve })
  const phase9DelayedFormulaAgent = new DurableAgentService(appClient!, service, undefined, undefined, {
    saveCandidateDraft: async (agentContext, candidateId, formulaProjectId, idempotencyKey) => {
      signalFormulaWrite?.()
      await allowFormulaWrite
      return formula.saveCandidateAsDraft(agentContext, candidateId, formulaProjectId, idempotencyKey)
    },
  } as never)
  const phase9ApprovePromise = phase9DelayedFormulaAgent.confirm(context.context, phase9ApproveBlocksCancelRun.id, phase9ApproveBlocksCancelConfirmation.id, { decision: 'APPROVE' }, `rls-p9-approve-blocks-cancel-${suffix}`)
  await formulaWriteStarted
  let phase9CancelDuringApprovalCode: string | undefined
  try {
    await agent.cancel(context.context, phase9ApproveBlocksCancelRun.id, `rls-p9-cancel-during-approve-${suffix}`)
  } catch (error) {
    if (error instanceof Error && 'code' in error) phase9CancelDuringApprovalCode = (error as { code?: string }).code
  }
  releaseFormulaWrite?.()
  const phase9ApproveAfterCancelAttempt = await phase9ApprovePromise
  const phase9ApproveBlocksCancelFinal = await agent.detail(context.context, phase9ApproveBlocksCancelRun.id, 0)
  const phase9LeaseRun = await agent.start(context.context, { definitionKey: 'inventory-assistant', input: {} }, `rls-p9-lease-start-${suffix}`)
  await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId!)
    await tx.$executeRawUnsafe("UPDATE v2_agent_runs SET status = 'RUNNING', lease_token_hash = 'a', lease_expires_at = now() - interval '1 second' WHERE organization_id = $1 AND id = $2", firstOrganizationId!, phase9LeaseRun.id)
    await tx.$executeRawUnsafe("UPDATE v2_agent_jobs SET status = 'LEASED', lease_token_hash = 'a', lease_expires_at = now() - interval '1 second' WHERE organization_id = $1 AND run_id = $2", firstOrganizationId!, phase9LeaseRun.id)
  })
  const phase9RecoveredLease = await agent.execute(context.context, phase9LeaseRun.id, `rls-p9-lease-recover-${suffix}`)
  const phase9RecoveredLeaseCancelled = await agent.cancel(context.context, phase9LeaseRun.id, `rls-p9-lease-cancel-${suffix}`)
  let phase9ForceToolFailure = true
  const phase9FailureRegistry: CompiledAgentToolRegistry = {
    get: () => { throw new Error('RLS verifier invokes only the fixed registry path.') },
    has: () => true,
    manifest: () => [],
    invoke: async () => {
      if (phase9ForceToolFailure) {
        phase9ForceToolFailure = false
        throw new PlatformError('RLS_FORCED_TOOL_FAILURE', 'Disposable verifier forced the bounded read tool to fail once.', 503)
      }
      return { toolKey: 'inventory.visibility', version: '1.0.0', output: { state: 'RETRY_RECOVERED' }, outputHash: 'e'.repeat(64), metadata: { outputBytes: 27 } }
    },
  }
  const phase9FailureAgent = new DurableAgentService(appClient!, service, undefined, undefined, undefined, phase9FailureRegistry)
  const phase9RetryRun = await phase9FailureAgent.start(context.context, { definitionKey: 'inventory-assistant', input: {} }, `rls-p9-retry-start-${suffix}`)
  let phase9ForcedFailureCode: string | undefined
  try {
    await phase9FailureAgent.execute(context.context, phase9RetryRun.id, `rls-p9-retry-force-failure-${suffix}`)
  } catch (error) {
    if (error instanceof Error && 'code' in error) phase9ForcedFailureCode = (error as { code?: string }).code
  }
  const phase9FailedRetryDetail = await phase9FailureAgent.detail(context.context, phase9RetryRun.id, 0)
  const phase9FailedRetryNode = ((phase9FailedRetryDetail.run as { nodes?: Array<{ nodeKey?: string; status?: string; attempt?: number; errorCode?: string }> }).nodes ?? [])
    .find((node) => node.nodeKey === 'review_inventory')
  const phase9RetriedRun = await phase9FailureAgent.retry(context.context, phase9RetryRun.id, `rls-p9-retry-${suffix}`)
  const phase9RetryToolExecution = await phase9FailureAgent.execute(context.context, phase9RetryRun.id, `rls-p9-retry-execute-tool-${suffix}`)
  const phase9RetryArtifactExecution = await phase9FailureAgent.execute(context.context, phase9RetryRun.id, `rls-p9-retry-execute-artifact-${suffix}`)
  const phase9RetriedRunDetail = await phase9FailureAgent.detail(context.context, phase9RetryRun.id, 0)
  const phase9RetriedRunNode = ((phase9RetriedRunDetail.run as { nodes?: Array<{ nodeKey?: string; status?: string; attempt?: number; errorCode?: string }> }).nodes ?? [])
    .find((node) => node.nodeKey === 'review_inventory')
  const phase9CancelledRun = await agent.start(context.context, { definitionKey: 'inventory-assistant', input: {} }, `rls-p9-cancel-start-${suffix}`)
  const phase9Cancelled = await agent.cancel(context.context, phase9CancelledRun.id, `rls-p9-cancel-${suffix}`)
  const phase9EvidenceIds = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId!)
    return tx.$queryRawUnsafe<Array<{ eventId: string | null; artifactId: string | null; legacyEventId: string | null; legacyArtifactId: string | null }>>(`
      SELECT
        (SELECT id FROM v2_agent_events WHERE organization_id = $1 AND run_id = $2 AND protocol_version = 'agent-runtime/v1' ORDER BY sequence ASC LIMIT 1) AS "eventId",
        (SELECT id FROM v2_agent_artifacts WHERE organization_id = $1 AND run_id = $2 AND protocol_version = 'agent-runtime/v1' ORDER BY created_at ASC LIMIT 1) AS "artifactId",
        (SELECT id FROM v2_agent_events WHERE organization_id = $1 AND run_id = $3 AND protocol_version = 'phase6/v1' ORDER BY sequence ASC LIMIT 1) AS "legacyEventId",
        (SELECT id FROM v2_agent_artifacts WHERE organization_id = $1 AND run_id = $3 AND protocol_version = 'phase6/v1' ORDER BY created_at ASC LIMIT 1) AS "legacyArtifactId"
    `, firstOrganizationId!, phase9Run.id, agentRun.id)
  })
  const phase9EvidenceFixture = phase9EvidenceIds[0]
  if (!phase9EvidenceFixture?.eventId || !phase9EvidenceFixture.artifactId || !phase9EvidenceFixture.legacyEventId || !phase9EvidenceFixture.legacyArtifactId) {
    throw new Error('V2_RLS=FAIL Phase 9 or Phase 6 evidence fixture is missing.')
  }
  const phase9EventUpdateDenied = await phase9DatabaseRejects(firstOrganizationId!, firstUserId!, 'UPDATE v2_agent_events SET event_type = event_type WHERE organization_id = $1 AND id = $2', [firstOrganizationId!, phase9EvidenceFixture.eventId], 'V2_AGENT_RUNTIME_PROTOCOL_APPEND_ONLY')
  const phase9EventDeleteDenied = await phase9DatabaseRejects(firstOrganizationId!, firstUserId!, 'DELETE FROM v2_agent_events WHERE organization_id = $1 AND id = $2', [firstOrganizationId!, phase9EvidenceFixture.eventId], 'V2_AGENT_RUNTIME_PROTOCOL_APPEND_ONLY')
  const phase9ArtifactUpdateDenied = await phase9DatabaseRejects(firstOrganizationId!, firstUserId!, 'UPDATE v2_agent_artifacts SET artifact_type = artifact_type WHERE organization_id = $1 AND id = $2', [firstOrganizationId!, phase9EvidenceFixture.artifactId], 'V2_AGENT_RUNTIME_PROTOCOL_APPEND_ONLY')
  const phase9ArtifactDeleteDenied = await phase9DatabaseRejects(firstOrganizationId!, firstUserId!, 'DELETE FROM v2_agent_artifacts WHERE organization_id = $1 AND id = $2', [firstOrganizationId!, phase9EvidenceFixture.artifactId], 'V2_AGENT_RUNTIME_PROTOCOL_APPEND_ONLY')
  const phase6EventUpdateAllowed = await phase9DatabaseAllows(firstOrganizationId!, firstUserId!, 'UPDATE v2_agent_events SET event_type = event_type WHERE organization_id = $1 AND id = $2', [firstOrganizationId!, phase9EvidenceFixture.legacyEventId])
  const phase6ArtifactUpdateAllowed = await phase9DatabaseAllows(firstOrganizationId!, firstUserId!, 'UPDATE v2_agent_artifacts SET artifact_type = artifact_type WHERE organization_id = $1 AND id = $2', [firstOrganizationId!, phase9EvidenceFixture.legacyArtifactId])
  const phase9CompletedProviderWithoutProvenanceDenied = await phase9DatabaseRejects(firstOrganizationId!, firstUserId!, `
    INSERT INTO v2_agent_provider_usages (id, organization_id, run_id, provider_key, model_identifier, usage_status, request_hash, correlation_id)
    VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, $7)
  `, [`agent_usage_completed_${suffix}`, firstOrganizationId!, phase9Run.id, 'verifier.completed', 'verifier-model', '1'.repeat(64), phase9RunMetadata[0].correlationId], 'v2_agent_provider_usage_response_provenance_check')
  const phase9RecordedProviderWithoutProvenanceDenied = await phase9DatabaseRejects(firstOrganizationId!, firstUserId!, `
    INSERT INTO v2_agent_provider_usages (id, organization_id, run_id, provider_key, model_identifier, usage_status, request_hash, correlation_id)
    VALUES ($1, $2, $3, $4, $5, 'RECORDED', $6, $7)
  `, [`agent_usage_recorded_${suffix}`, firstOrganizationId!, phase9Run.id, 'verifier.recorded', 'verifier-model', '2'.repeat(64), phase9RunMetadata[0].correlationId], 'v2_agent_provider_usage_response_provenance_check')
  const phase9NotConfiguredProviderWithoutProvenanceAllowed = await phase9DatabaseAllows(firstOrganizationId!, firstUserId!, `
    INSERT INTO v2_agent_provider_usages (id, organization_id, run_id, provider_key, model_identifier, usage_status, request_hash, correlation_id)
    VALUES ($1, $2, $3, $4, $5, 'NOT_CONFIGURED', $6, $7)
  `, [`agent_usage_not_configured_${suffix}`, firstOrganizationId!, phase9Run.id, 'verifier.not-configured', 'verifier-model', '3'.repeat(64), phase9RunMetadata[0].correlationId])
  const phase9OtherRunNode = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId!)
    return tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM v2_agent_run_nodes WHERE organization_id = $1 AND run_id = $2 ORDER BY created_at ASC LIMIT 1',
      firstOrganizationId!, phase9RetryRun.id,
    )
  })
  if (!phase9OtherRunNode[0]) throw new Error('V2_RLS=FAIL Phase 9 cross-run node fixture is missing.')
  const phase9CrossRunNodeEvaluationDenied = await phase9DatabaseRejects(firstOrganizationId!, firstUserId!, `
    INSERT INTO v2_agent_evaluations (id, organization_id, run_id, run_node_id, policy_version_id, evaluation_key, subject_kind, subject_ref, evaluator_kind, status, score, result_summary, result_hash, evaluated_by, correlation_id)
    VALUES ($1, $2, $3, $4, $5, $6, 'RUN', $3, 'RULE', 'PASSED', 1, '{}'::jsonb, $7, $8, $9)
  `, [`agent_eval_cross_run_${suffix}`, firstOrganizationId!, phase9Run.id, phase9OtherRunNode[0].id, phase9RunMetadata[0].policyVersionId, `cross-run-node-${suffix}`, '4'.repeat(64), firstUserId!, phase9RunMetadata[0].correlationId], 'v2_agent_evaluation_node_run_tenant_fk')
  const phase9UnsafeMutatingToolRows = await phase9UnsafeMutatingTools(firstOrganizationId!, firstUserId!)
  const phase9SafePayloads = await phase9PersistedPayloadsAreSafe(firstOrganizationId!, firstUserId!)
  const inventoryMovementCountAfterFormula = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_inventory_movements WHERE organization_id = $1', firstOrganizationId!)
    return Number(rows[0]!.count)
  })
  const materialDocument = await lab.addMaterialDocument(context.context, material.id, { kind: 'SDS', objectRef: `test://material/${suffix}`, contentHash: `hash-${suffix}` }, `rls-material-document-${suffix}`)
  const supplier = await lab.createSupplier(context.context, { legalName: `RLS Supplier ${suffix}`, currency: 'USD', paymentTerms: {} }, `rls-supplier-${suffix}`)
  await lab.changeSupplierStatus(context.context, supplier.id, 'ACTIVE', `rls-supplier-status-${suffix}`)
  const supplierDocument = await lab.addSupplierDocument(context.context, supplier.id, { kind: 'CERTIFICATE', objectRef: `test://supplier/${suffix}`, contentHash: `hash-${suffix}` }, `rls-supplier-document-${suffix}`)
  const offer = await lab.createSupplierOffer(context.context, { supplierId: supplier.id, materialId: material.id, productCode: `RLS-OFFER-${suffix}`, minimumOrderQuantity: 1, unit: 'G', unitPrice: 0.02, currency: 'USD' }, `rls-offer-${suffix}`)
  await lab.changeSupplierOfferStatus(context.context, offer.id, 'ACTIVE', `rls-offer-status-${suffix}`)
  const priceRevision = await lab.reviseSupplierOfferPrice(context.context, offer.id, { unitPrice: 0.021, currency: 'USD', reason: 'isolated price evidence' }, `rls-offer-price-${suffix}`)
  const purchaseRequest = await lab.createPurchaseRequest(context.context, { notes: 'isolated phase 2 verification', lines: [{ materialId: material.id, requestedGrams: 1000, preferredSupplierId: supplier.id }] }, `rls-pr-${suffix}`)
  await lab.changePurchaseRequestStatus(context.context, purchaseRequest.id, 'SUBMITTED', `rls-pr-submit-${suffix}`)
  await lab.changePurchaseRequestStatus(context.context, purchaseRequest.id, 'APPROVED', `rls-pr-approve-${suffix}`)
  const purchaseOrder = await lab.createPurchaseOrder(context.context, { supplierId: supplier.id, purchaseRequestId: purchaseRequest.id, currency: 'USD', lines: [{ materialId: material.id, supplierOfferId: offer.id, orderedGrams: 1000, unitPrice: 0.02 }] }, `rls-po-${suffix}`)
  await lab.changePurchaseOrderStatus(context.context, purchaseOrder.id, 'PENDING_APPROVAL', `rls-po-submit-${suffix}`)
  await lab.changePurchaseOrderStatus(context.context, purchaseOrder.id, 'APPROVED', `rls-po-approve-${suffix}`)
  const shipment = await lab.createShipment(context.context, { purchaseOrderId: purchaseOrder.id, carrier: 'QA Carrier', shippedAt: new Date().toISOString() }, `rls-shipment-${suffix}`)
  const receipt = await lab.receiveGoods(context.context, {
    purchaseOrderId: purchaseOrder.id, shipmentId: shipment.id, freightCost: 10, dutyCost: 5, insuranceCost: 0, currency: 'USD',
    lines: [{ materialId: material.id, supplierOfferId: offer.id, quantity: 1, unit: 'KG', location: 'QA quarantine', unitPrice: 0.02 }],
  }, `rls-receipt-${suffix}`)
  let quarantineRejected = false
  try { await lab.fefo(context.context, material.id, 50) } catch (error) { quarantineRejected = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'LOT_NOT_ELIGIBLE' }
  const inspections = await Promise.allSettled([
    lab.inspectReceiptLine(context.context, receipt.id, receipt.lines[0].id, { disposition: 'ACCEPT', findings: { qa: 'pass' } }, `rls-inspection-a-${suffix}`),
    lab.inspectReceiptLine(context.context, receipt.id, receipt.lines[0].id, { disposition: 'ACCEPT', findings: { qa: 'pass' } }, `rls-inspection-b-${suffix}`),
  ])
  const accepted = inspections.find((result): result is PromiseFulfilledResult<{ id: string; disposition: 'ACCEPT' | 'REJECT' | 'RETURN'; lotStatus: string; qualityStatus: string }> => result.status === 'fulfilled')?.value
  const concurrentInspectionDenied = inspections.some((result) => result.status === 'rejected' && result.reason instanceof Error && 'code' in result.reason && (result.reason as { code?: string }).code === 'INSPECTION_ALREADY_DECIDED')
  if (!accepted) throw new Error('V2_RLS=FAIL concurrent receipt inspection did not produce an accepted disposition')
  const transfer = await lab.transferLot(context.context, receipt.lines[0].lotId, { location: 'QA available shelf', reason: 'inspection release location' }, `rls-transfer-${suffix}`)
  const trial = await trials.createTrial(context.context, { title: 'RLS Trial', sourceKind: 'FORMULA_VERSION', formulaVersionId: approvedFormula.id, plannedMassGrams: 100 }, `rls-trial-create-${suffix}`)
  const unassignedTrial = await trials.createTrial(context.context, { title: 'Unassigned blind-review control', sourceKind: 'MANUAL_EXPERIMENT', manualSource: 'Isolated access-control regression fixture.', plannedMassGrams: 10 }, `rls-trial-unassigned-${suffix}`)
  const plannedTrial = await trials.planTrial(context.context, trial.id, { notes: 'Isolated Trial plan.' }, `rls-trial-plan-${suffix}`)
  const releasedTrial = await trials.releaseTrial(context.context, trial.id, { rationale: 'Isolated deterministic Trial release review.' }, `rls-trial-release-${suffix}`)
  const trialWeighing = await trials.startPreparation(context.context, trial.id, { lines: [{ materialId: material.id, requestedGrams: 100, toleranceGrams: 0 }] }, `rls-trial-weigh-${suffix}`)
  const confirmedTrialPreparation = await trials.confirmPreparation(context.context, trial.id, trialWeighing.id, { lines: [{ lineId: trialWeighing.lines[0]!.id, lotId: receipt.lines[0].lotId, actualGrams: 100 }] }, `rls-trial-weigh-confirm-${suffix}`)
  const duplicateTrialPreparation = await trials.confirmPreparation(context.context, trial.id, trialWeighing.id, { lines: [{ lineId: trialWeighing.lines[0]!.id, lotId: receipt.lines[0].lotId, actualGrams: 100 }] }, `rls-trial-weigh-confirm-${suffix}`)
  const trialPreparationDetail = await trials.preparationDetail(context.context, trial.id, trialWeighing.id)
  const trialSample = await trials.createSample(context.context, trial.id, { sampleCode: `RLS-${suffix.replace(/[^a-z0-9]/gi, '').slice(-12).toUpperCase()}` }, `rls-trial-sample-${suffix}`)
  const secondTrialSample = await trials.createSample(context.context, trial.id, { sampleCode: `RLS-2-${suffix.replace(/[^a-z0-9]/gi, '').slice(-10).toUpperCase()}` }, `rls-trial-sample-second-${suffix}`)
  const trialEvidence = await trials.attachEvidence(context.context, trial.id, { evidenceKind: 'STABILITY', objectRef: `test://trials/${trial.id}/stability`, contentHash: 'a'.repeat(64), sampleId: trialSample.id }, `rls-trial-evidence-${suffix}`)
  const sensoryForm = await trials.createSensoryForm(context.context, {
    name: 'RLS Sensory Form', versionLabel: 'qa-1', timepoints: ['T0'],
    dimensions: [{ key: 'overall', label: 'Overall', kind: 'RATING', minimum: 1, maximum: 10, required: true, options: [] }],
    descriptorVocabulary: ['woody', 'fresh'], minimumEvidenceCount: 3,
  }, `rls-sensory-form-${suffix}`)
  const sensorySession = await trials.createSensorySession(context.context, trial.id, { formVersionId: sensoryForm.id, title: 'RLS Blind Session', blindMode: true, allowPeerResultsAfterClose: false }, `rls-sensory-session-${suffix}`)
  const panel = await trials.assignPanelist(context.context, sensorySession.id, { userId: panelistUserId! }, `rls-sensory-panel-${suffix}`)
  const assignedSample = await trials.assignSample(context.context, sensorySession.id, { sampleId: trialSample.id, blindCode: 'QA71' }, `rls-sensory-sample-${suffix}`)
  const publicLink = await trials.createPublicLink(context.context, sensorySession.id, { sampleAssignmentId: assignedSample.assignmentIds[0]!, presentationMode: 'BLIND', expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), maxSubmissions: 3 }, `rls-sensory-link-${suffix}`)
  const managedPanelists = await trials.sensoryPanelists(context.context, sensorySession.id)
  const managedPublicLinks = await trials.publicLinks(context.context, sensorySession.id)
  await trials.transitionSession(context.context, sensorySession.id, 'OPEN', {}, `rls-sensory-open-${suffix}`)
  const publicPresentation = await trials.publicPresentation(publicLink.token)
  const publicEvaluation = await trials.submitPublicEvaluation(publicLink.token, { timepoint: 'T0', ratings: { overall: 6 }, descriptors: ['woody'], observation: 'Public blind scorecard.', final: true }, `public-evaluation-${suffix}`)
  const panelContext = { ...context.context, userId: panelistUserId!, role: 'Sensory Panelist' as const, sessionId: `ses_${panelistUserId}` }
  const panelTrials = await trials.listTrials(panelContext)
  const panelScorecard = await trials.sensoryAssignmentsForCurrent(panelContext, sensorySession.id)
  const panelEvaluation = await trials.submitEvaluation(panelContext, sensorySession.id, { sampleAssignmentId: assignedSample.assignmentIds.find((id) => id !== assignedSample.assignmentIds[0])!, timepoint: 'T0', ratings: { overall: 7 }, descriptors: ['woody'], observation: 'Internal blind scorecard.', final: true }, `rls-sensory-evaluation-${suffix}`)
  const duplicatePublicEvaluation = await trials.submitPublicEvaluation(publicLink.token, { timepoint: 'T0', ratings: { overall: 6 }, descriptors: ['woody'], observation: 'Public blind scorecard.', final: true }, `public-evaluation-${suffix}`)
  const revokedPublicLink = await trials.revokePublicLink(context.context, publicLink.id, `rls-sensory-link-revoke-${suffix}`)
  let revokedPublicLinkDenied = false
  try { await trials.publicPresentation(publicLink.token) } catch (error) { revokedPublicLinkDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'PUBLIC_LINK_INVALID' }
  if (duplicatePublicEvaluation.id !== publicEvaluation.id) throw new Error('V2_RLS=FAIL duplicate public evaluation created a distinct result')
  if (panelScorecard.assignments.length !== 1 || panelScorecard.assignments[0]?.blindCode !== 'QA71') throw new Error('V2_RLS=FAIL panelist assignment projection is not safely scoped')
  if (trialPreparationDetail.lines.length !== 1 || trialPreparationDetail.lines[0]?.actualGrams !== 100) throw new Error('V2_RLS=FAIL trial preparation recovery projection is incomplete')
  if (managedPanelists.length !== 1 || managedPublicLinks.length !== 1 || 'token' in (managedPublicLinks[0] ?? {})) throw new Error(`V2_RLS=FAIL sensory manager projection is unsafe or incomplete (panelists=${managedPanelists.length}, links=${managedPublicLinks.length}, keys=${Object.keys(managedPublicLinks[0] ?? {}).join(',')})`)
  if (revokedPublicLink.status !== 'REVOKED' || !revokedPublicLinkDenied) throw new Error('V2_RLS=FAIL public scorecard revocation did not invalidate the opaque link')
  await trials.transitionSession(context.context, sensorySession.id, 'CLOSED', {}, `rls-sensory-close-${suffix}`)
  const unblinded = await trials.unblindSample(context.context, sensorySession.id, panel.id ? assignedSample.assignmentIds.find((id) => id !== assignedSample.assignmentIds[0])! : assignedSample.assignmentIds[0]!, { rationale: 'Controlled QA unblinding after closure.' }, `rls-sensory-unblind-${suffix}`)
  const trialDecision = await trials.decideTrial(context.context, trial.id, { decision: 'RETEST', rationale: 'Two independent scorecards are retained as insufficient sensory evidence.' }, `rls-trial-decision-${suffix}`)
  const trialMemory = await trials.retrieveTrialMemory(context.context, approvedFormula.id)
  let directTrialReversalDenied = false
  try { await lab.reverseMovement(context.context, confirmedTrialPreparation.lines[0]!.movementId, `rls-trial-direct-reversal-${suffix}`) } catch (error) { directTrialReversalDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'TRIAL_REVERSAL_WORKFLOW_REQUIRED' }
  const trialReversal = await trials.reversePreparationConsumption(context.context, trial.id, confirmedTrialPreparation.lines[0]!.movementId, `rls-trial-reversal-${suffix}`)
  const reversedTrialUsage = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ status: string; reversalMovementId: string | null }>>('SELECT status, reversal_movement_id AS "reversalMovementId" FROM v2_trial_usage_links WHERE organization_id = $1 AND trial_id = $2', firstOrganizationId!, trial.id)
  })
  const panelTrialDetail = await trials.detail(panelContext, trial.id)
  let panelUnassignedTrialDenied = false
  try {
    await trials.detail(panelContext, unassignedTrial.id)
  } catch (error) {
    panelUnassignedTrialDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'TENANT_ACCESS_DENIED'
  }
  let brandTrialDetailDenied = false
  try {
    await trials.detail({ ...context.context, userId: brandUserId!, role: 'Brand', sessionId: `ses_${brandUserId}` }, trial.id)
  } catch (error) {
    brandTrialDetailDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'TENANT_ACCESS_DENIED'
  }

  // Phase 8 is intentionally exercised through ProductionService. Direct Lab
  // Operations calls with a PRODUCTION context must remain blocked so raw
  // consumption, reversal, genealogy, and release gates cannot be bypassed.
  // Keep the manufacturing fixture on its own accepted lot. Phase 2 asserts
  // the opening-lot ledger independently, so sharing that lot here would make
  // a valid production consumption look like a Phase 2 regression.
  const productionReceipt = await lab.receiveGoods(context.context, {
    freightCost: 0,
    dutyCost: 0,
    insuranceCost: 0,
    currency: 'USD',
    lines: [{ materialId: material.id, supplierOfferId: offer.id, quantity: 1, unit: 'KG', location: 'QA production shelf', unitPrice: 0.02 }],
  }, `rls-p8-receipt-${suffix}`)
  const productionInspection = await lab.inspectReceiptLine(context.context, productionReceipt.id, productionReceipt.lines[0]!.id, {
    disposition: 'ACCEPT',
    findings: { qa: 'approved for isolated production fixture' },
  }, `rls-p8-receipt-inspection-${suffix}`)
  if (productionInspection.lotStatus !== 'AVAILABLE') throw new Error('V2_RLS=FAIL production fixture lot is not available')
  const productionLotId = productionReceipt.lines[0]!.lotId
  const p8OrderCode = `MFG-${suffix.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase()}`
  const p8Order = await production.createOrder(context.context, {
    formulaVersionId: approvedFormula.id,
    targetBulkGrams: 100,
    orderNumber: p8OrderCode,
    notes: 'Isolated production genealogy verification.',
  }, `rls-p8-order-${suffix}`)
  const p8Specification = await production.createQcSpecification(context.context, p8Order.id, {
    name: `QA appearance ${suffix}`,
    versionLabel: 'qa-1',
    checks: [{ key: 'appearance', label: 'Appearance accepted', kind: 'BOOLEAN', required: true }],
  }, `rls-p8-spec-${suffix}`)
  const p8Plan = await production.planOrder(context.context, p8Order.id, { equipmentRef: 'QA-pilot-vessel' }, `rls-p8-plan-${suffix}`)
  const p8PlanDetail = await production.detail(context.context, p8Order.id)
  const p8Requirement = p8PlanDetail.requirements[0]
  if (!p8Requirement) throw new Error('V2_RLS=FAIL production planning did not create a material requirement')
  const p8Allocations = await production.allocateMaterials(context.context, p8Order.id, {
    allocations: [{ requirementId: p8Requirement.id, lotId: productionLotId, allocatedGrams: 100 }],
  }, `rls-p8-allocate-${suffix}`)
  const p8AllocatedDetail = await production.detail(context.context, p8Order.id)
  const p8Allocation = p8AllocatedDetail.allocations[0]
  if (!p8Allocation) throw new Error('V2_RLS=FAIL production allocation did not persist')
  let directProductionWeighingDenied = false
  try {
    await lab.createWeighingSession(context.context, {
      contextType: 'PRODUCTION', contextId: p8Order.id,
      lines: [{ materialId: material.id, lotId: productionLotId, requestedGrams: 100, toleranceGrams: 0 }],
    }, `rls-p8-direct-weigh-${suffix}`)
  } catch (error) {
    directProductionWeighingDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'PRODUCTION_WEIGHING_WORKFLOW_REQUIRED'
  }
  const p8StartedWeighing = await production.startWeighing(context.context, p8Order.id, {
    lines: [{ allocationId: p8Allocation.id, requestedGrams: 100, toleranceGrams: 0 }],
  }, `rls-p8-weigh-start-${suffix}`)
  const p8StartedDetail = await production.detail(context.context, p8Order.id)
  const p8WeighingSession = p8StartedDetail.weighing.find((item) => item.status === 'IN_PROGRESS')
  if (!p8WeighingSession) throw new Error('V2_RLS=FAIL production weighing did not open')
  const p8WeighingLine = p8StartedDetail.weighingLines.find((item) => item.productionWeighingSessionId === p8WeighingSession.id)
  if (!p8WeighingLine) throw new Error('V2_RLS=FAIL production weighing lines are missing')
  const p8ConfirmedWeighing = await production.confirmWeighing(context.context, p8Order.id, p8WeighingSession.labWeighingSessionId, {
    lines: [{ lineId: p8WeighingLine.lineId, lotId: productionLotId, actualGrams: 100 }],
  }, `rls-p8-weigh-confirm-${suffix}`)
  const p8Document = await production.createDocumentSnapshot(context.context, p8Order.id, {
    documentKind: 'PROCESS_RECORD',
    objectRef: `test://production/${p8Order.id}/batch-record`,
    contentHash: 'b'.repeat(64),
    versionLabel: 'qa-1',
    metadata: { fixture: 'phase8' },
  }, `rls-p8-document-${suffix}`)
  for (const stage of ['COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING'] as const) {
    await production.startStage(context.context, p8Order.id, stage, { actualParameters: { fixture: 'phase8', stage } }, `rls-p8-${stage.toLowerCase()}-start-${suffix}`)
    await production.completeStage(context.context, p8Order.id, stage, { actualParameters: { fixture: 'phase8', stage, completed: true } }, `rls-p8-${stage.toLowerCase()}-complete-${suffix}`)
  }
  const p8Yield = await production.recordYield(context.context, p8Order.id, {
    bulkOutputGrams: 100,
    filledOutputGrams: 100,
    wasteGrams: 0,
    reworkGrams: 0,
    expectedLossGrams: 0,
    rationale: 'Isolated mass reconciliation.',
  }, `rls-p8-yield-${suffix}`)
  const p8QcResult = await production.recordQcResult(context.context, p8Order.id, {
    qcSpecificationId: p8Specification.id,
    checkKey: 'appearance',
    observedValue: true,
    notes: 'Visual release inspection passed.',
  }, `rls-p8-qc-result-${suffix}`)
  const p8QcApproval = await production.approveQcResult(context.context, p8Order.id, p8QcResult.id, {
    decision: 'APPROVE', rationale: 'Independent QA approval.',
  }, `rls-p8-qc-approve-${suffix}`)
  const p8Release = await production.releaseOrder(context.context, p8Order.id, {
    finishedGoodLotNumber: `FG-${suffix.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase()}`,
    location: 'QA finished goods shelf',
    rationale: 'All deterministic production release gates are satisfied.',
    documentSnapshotIds: [p8Document.id],
  }, `rls-p8-release-${suffix}`)
  const duplicateP8Release = await production.releaseOrder(context.context, p8Order.id, {
    finishedGoodLotNumber: `FG-${suffix.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase()}`,
    location: 'QA finished goods shelf',
    rationale: 'All deterministic production release gates are satisfied.',
    documentSnapshotIds: [p8Document.id],
  }, `rls-p8-release-${suffix}`)
  const p8Genealogy = await production.finishedGoodGenealogy(context.context, p8Release.finishedGoodLot.id)
  const p8Hold = await production.holdFinishedGoodLot(context.context, p8Release.finishedGoodLot.id, {
    rationale: 'Controlled post-release quality review requires the full lot to be held.',
    evidenceDocumentSnapshotIds: [p8Document.id],
  }, `rls-p8-fg-hold-${suffix}`)
  const duplicateP8Hold = await production.holdFinishedGoodLot(context.context, p8Release.finishedGoodLot.id, {
    rationale: 'Controlled post-release quality review requires the full lot to be held.',
    evidenceDocumentSnapshotIds: [p8Document.id],
  }, `rls-p8-fg-hold-${suffix}`)
  const p8FinishedGoodReworkResolution = await production.resolveDeviation(context.context, p8Order.id, p8Hold.deviationId, {
    disposition: 'REWORK',
    reworkTargetStage: 'FILLING',
    rationale: 'Repeat controlled filling before a new release decision.',
  }, `rls-p8-fg-rework-resolve-${suffix}`)
  const p8FinishedGoodRework = await production.startRework(context.context, p8Order.id, {
    deviationId: p8Hold.deviationId,
    sourceKind: 'FINISHED_GOOD_LOT',
    sourceFinishedGoodLotId: p8Release.finishedGoodLot.id,
    quantityGrams: p8Hold.heldQuantityGrams,
    targetStage: 'FILLING',
    reason: 'Controlled post-release rework of the held finished-good lot.',
  }, `rls-p8-fg-rework-start-${suffix}`)
  await production.startStage(context.context, p8Order.id, 'FILLING', { actualParameters: { fixture: 'phase8-fg-rework' } }, `rls-p8-fg-rework-fill-start-${suffix}`)
  await production.completeStage(context.context, p8Order.id, 'FILLING', { actualParameters: { fixture: 'phase8-fg-rework', completed: true } }, `rls-p8-fg-rework-fill-complete-${suffix}`)
  const p8FinishedGoodReworkComplete = await production.completeRework(context.context, p8Order.id, p8FinishedGoodRework.id, { actualParameters: { fixture: 'phase8-fg-rework', closed: true } }, `rls-p8-fg-rework-complete-${suffix}`)
  let p8ReworkReleaseBlocked = false
  try {
    await production.releaseOrder(context.context, p8Order.id, {
      finishedGoodLotNumber: `FG-RW-BLOCK-${suffix.replace(/[^a-z0-9]/gi, '').slice(-12).toUpperCase()}`,
      location: 'QA finished goods shelf',
      rationale: 'This release must be blocked until rework evidence is regenerated.',
      documentSnapshotIds: [p8Document.id],
    }, `rls-p8-fg-rework-release-blocked-${suffix}`)
  } catch (error) {
    p8ReworkReleaseBlocked = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'PRODUCTION_RELEASE_GATE_BLOCKED'
  }
  const p8ReworkDocument = await production.createDocumentSnapshot(context.context, p8Order.id, {
    documentKind: 'PROCESS_RECORD',
    objectRef: `test://production/${p8Order.id}/rework-record`,
    contentHash: 'c'.repeat(64),
    versionLabel: 'qa-rework-1',
    metadata: { fixture: 'phase8-finished-good-rework' },
  }, `rls-p8-fg-rework-document-${suffix}`)
  const p8ReworkYield = await production.recordYield(context.context, p8Order.id, {
    bulkOutputGrams: 100,
    filledOutputGrams: 100,
    wasteGrams: 0,
    reworkGrams: 0,
    expectedLossGrams: 0,
    rationale: 'Fresh reconciliation after controlled finished-good rework.',
  }, `rls-p8-fg-rework-yield-${suffix}`)
  const p8ReworkQcResult = await production.recordQcResult(context.context, p8Order.id, {
    qcSpecificationId: p8Specification.id,
    checkKey: 'appearance',
    observedValue: true,
    notes: 'Fresh appearance review after controlled rework.',
  }, `rls-p8-fg-rework-qc-record-${suffix}`)
  const p8ReworkQcApproval = await production.approveQcResult(context.context, p8Order.id, p8ReworkQcResult.id, {
    decision: 'APPROVE',
    rationale: 'Independent QA approval after controlled rework.',
  }, `rls-p8-fg-rework-qc-approve-${suffix}`)
  const p8ReRelease = await production.releaseOrder(context.context, p8Order.id, {
    finishedGoodLotNumber: `FG-RW-${suffix.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase()}`,
    location: 'QA finished goods shelf',
    rationale: 'All rework release gates are freshly satisfied.',
    documentSnapshotIds: [p8ReworkDocument.id],
  }, `rls-p8-fg-rerelease-${suffix}`)

  // Phase 10 uses the re-released finished-good lot, never a raw material lot
  // or an inbound procurement shipment. This covers a complete commercial
  // chain and leaves the returned quantity in quarantine for QC.
  const commerceRawMovementCountBefore = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_inventory_movements WHERE organization_id = $1', firstOrganizationId!)
    return Number(rows[0]?.count ?? 0)
  })
  const commerceCustomer = await commerce.createCustomer(context.context, {
    name: 'Isolated Commerce Customer', code: `CUS-${suffix.replace(/[^a-z0-9]/gi, '').slice(-12).toUpperCase()}`,
    paymentTerms: 'Net 30', commercialNotes: 'Isolated Phase 10 verifier customer.',
  }, `rls-p10-customer-${suffix}`)
  const commerceAddress = await commerce.addCustomerAddress(context.context, commerceCustomer.id, {
    kind: 'SHIPPING', label: 'QA receiving dock', recipientName: 'Commerce QA', line1: '10 Test Street', city: 'Verification City', countryCode: 'US', primary: true,
  }, `rls-p10-address-${suffix}`)
  const commerceProduct = await commerce.createProduct(context.context, {
    name: 'Isolated Eau de Parfum 50 g', sku: `EDP-${suffix.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase()}`,
    kind: 'FINISHED_GOOD', status: 'ACTIVE', formulaVersionId: approvedFormula.id, packSizeGrams: 50, packLabel: '50 g', availabilityPolicy: 'RELEASED_LOTS_ONLY',
  }, `rls-p10-product-${suffix}`)
  const commercePrice = await commerce.setProductPrice(context.context, commerceProduct.id, {
    currency: 'USD', unitPrice: 75,
  }, `rls-p10-price-${suffix}`)
  const commerceQuote = await commerce.createQuote(context.context, {
    customerId: commerceCustomer.id, currency: 'USD', validUntil: new Date(Date.now() + 86_400_000).toISOString(), paymentTerms: 'Net 30',
    lines: [{ productId: commerceProduct.id, quantity: 1 }],
  }, `rls-p10-quote-${suffix}`)
  const commerceQuoteSent = await commerce.transitionQuote(context.context, commerceQuote.id, 'SEND', { rationale: 'Customer-ready quotation.' }, `rls-p10-quote-send-${suffix}`)
  const commerceQuoteAccepted = await commerce.transitionQuote(context.context, commerceQuote.id, 'ACCEPT', { rationale: 'Customer accepted the quoted commercial terms.' }, `rls-p10-quote-accept-${suffix}`)
  const commerceOrder = await commerce.createOrder(context.context, {
    customerId: commerceCustomer.id, quoteId: commerceQuote.id, currency: 'USD', shippingAddressId: commerceAddress.id,
  }, `rls-p10-order-${suffix}`)
  const commerceOrderConfirmed = await commerce.confirmOrder(context.context, commerceOrder.id, `rls-p10-order-confirm-${suffix}`)
  const commerceSuggestions = await commerce.allocationSuggestions(context.context, commerceOrder.id)
  const commerceSuggestion = commerceSuggestions[0] as { orderLineId?: string; finishedGoodLotId?: string; suggestedQuantityGrams?: number } | undefined
  if (!commerceSuggestion?.orderLineId || !commerceSuggestion.finishedGoodLotId || !commerceSuggestion.suggestedQuantityGrams) throw new Error('V2_RLS=FAIL Commerce did not find an eligible released finished-good suggestion')
  const commerceAllocation = await commerce.allocateOrder(context.context, commerceOrder.id, {
    lines: [{ orderLineId: commerceSuggestion.orderLineId, finishedGoodLotId: commerceSuggestion.finishedGoodLotId, quantityGrams: commerceSuggestion.suggestedQuantityGrams }],
  }, `rls-p10-allocate-${suffix}`)
  const commerceReservation = commerceAllocation.reservations[0] as { id?: string } | undefined
  if (!commerceReservation?.id) throw new Error('V2_RLS=FAIL Commerce did not persist a finished-good reservation')
  const commerceFulfillment = await commerce.createFulfillment(context.context, commerceOrder.id, {
    carrier: 'QA Carrier', service: 'Ground', trackingNumber: `QA-${suffix}`, lines: [{ reservationId: commerceReservation.id, quantityGrams: commerceSuggestion.suggestedQuantityGrams }],
  }, `rls-p10-fulfillment-${suffix}`)
  let duplicateOpenFulfillmentDenied = false
  try {
    await commerce.createFulfillment(context.context, commerceOrder.id, {
      carrier: 'QA Carrier', lines: [{ reservationId: commerceReservation.id, quantityGrams: commerceSuggestion.suggestedQuantityGrams }],
    }, `rls-p10-fulfillment-duplicate-${suffix}`)
  } catch (error) {
    duplicateOpenFulfillmentDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'SALES_RESERVATION_ALREADY_IN_FULFILLMENT'
  }
  const commercePicking = await commerce.transitionFulfillment(context.context, commerceFulfillment.id, 'START_PICKING', {}, `rls-p10-pick-${suffix}`)
  const commercePacked = await commerce.transitionFulfillment(context.context, commerceFulfillment.id, 'PACK', {}, `rls-p10-pack-${suffix}`)
  const commerceShipped = await commerce.transitionFulfillment(context.context, commerceFulfillment.id, 'SHIP', { trackingNumber: `QA-${suffix}` }, `rls-p10-ship-${suffix}`)
  const commerceDelivered = await commerce.transitionFulfillment(context.context, commerceFulfillment.id, 'DELIVER', {}, `rls-p10-deliver-${suffix}`)
  const commerceReturn = await commerce.createReturn(context.context, {
    orderId: commerceOrder.id, reason: 'Isolated customer return for controlled quarantine intake.', lines: [{ orderLineId: commerceSuggestion.orderLineId, quantityGrams: 10 }],
  }, `rls-p10-return-${suffix}`)
  const commerceReturnAuthorized = await commerce.authorizeReturn(context.context, commerceReturn.id, { rationale: 'Return is authorized for isolated QC intake.' }, `rls-p10-return-authorize-${suffix}`)
  const commerceReturnLine = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM v2_sales_return_lines WHERE organization_id = $1 AND return_request_id = $2', firstOrganizationId!, commerceReturn.id)
  })
  if (!commerceReturnLine[0]?.id) throw new Error('V2_RLS=FAIL Commerce return line is missing')
  const commerceReturnPartiallyReceived = await commerce.receiveReturn(context.context, commerceReturn.id, {
    lines: [{ returnLineId: commerceReturnLine[0].id, finishedGoodLotId: p8ReRelease.finishedGoodLot.id, quantityGrams: 4 }],
    inspectionNotes: 'First parcel received into quarantine; further authorized quantity remains in transit.',
  }, `rls-p10-return-receive-first-${suffix}`)
  let commercePartialDispositionDenied = false
  try {
    await commerce.disposeReturn(context.context, commerceReturn.id, {
      disposition: 'HOLD_FOR_QUALITY',
      rationale: 'The workflow must not permit a partial return quality disposition.',
      evidenceDocumentSnapshotIds: [`comdoc_partial_${suffix}`],
    }, `rls-p10-return-disposition-partial-${suffix}`)
  } catch (error) {
    commercePartialDispositionDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'RETURN_DISPOSITION_STATE_INVALID'
  }
  const commerceReturnReceived = await commerce.receiveReturn(context.context, commerceReturn.id, {
    lines: [{ returnLineId: commerceReturnLine[0].id, finishedGoodLotId: p8ReRelease.finishedGoodLot.id, quantityGrams: 6 }],
    inspectionNotes: 'Final parcel received into quarantine; no automatic restock is permitted.',
  }, `rls-p10-return-receive-final-${suffix}`)
  const commerceReturnReceipts = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string; quantity: Prisma.Decimal; disposition: string; toBucket: string | null }>>(`
      SELECT receipt.id, receipt.quantity_g AS quantity, receipt.disposition, ledger.to_bucket AS "toBucket"
      FROM v2_sales_return_receipts receipt
      JOIN v2_finished_good_ledger_entries ledger
        ON ledger.organization_id = receipt.organization_id AND ledger.id = receipt.return_ledger_entry_id
      WHERE receipt.organization_id = $1 AND receipt.return_line_id = $2
    `, firstOrganizationId!, commerceReturnLine[0].id)
  })
  const commerceReturnReceipt = commerceReturnReceipts[0]
  const commerceReturnReceiptQuantity = commerceReturnReceipts.reduce((total, receipt) => total + Number(receipt.quantity), 0)
  const commerceReturnReceiptAppendOnlyDenied = commerceReturnReceipt
    ? await phase9DatabaseRejects(firstOrganizationId!, firstUserId!, 'UPDATE v2_sales_return_receipts SET quantity_g = quantity_g WHERE organization_id = $1 AND id = $2', [firstOrganizationId!, commerceReturnReceipt.id], 'commerce append-only evidence cannot be updated or deleted')
    : false
  const commerceDocument = await commerce.attachDocument(context.context, {
    documentKind: 'ORDER_CONFIRMATION', objectRef: `test://commerce/${commerceOrder.id}/confirmation`, contentHash: 'd'.repeat(64), subjectType: 'ORDER', subjectId: commerceOrder.id,
  }, `rls-p10-document-${suffix}`)
  const commerceReturnQcDocument = await commerce.attachDocument(context.context, {
    documentKind: 'RETURN_QC', objectRef: `test://commerce/${commerceReturn.id}/return-qc`, contentHash: 'e'.repeat(64), subjectType: 'RETURN', subjectId: commerceReturn.id,
  }, `rls-p10-return-qc-document-${suffix}`)
  const commerceReturnDispositionResult = await commerce.disposeReturn(context.context, commerceReturn.id, {
    disposition: 'RELEASE_TO_AVAILABLE',
    rationale: 'Controlled return QC evidence confirms the released finished-good lot remains eligible for saleable inventory.',
    evidenceDocumentSnapshotIds: [commerceReturnQcDocument.id],
  }, `rls-p10-return-disposition-${suffix}`)
  const commerceReturnDispositionRows = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string; disposition: string; movementType: string; fromBucket: string | null; toBucket: string | null }>>( `
      SELECT disposition.id, disposition.disposition, ledger.movement_type AS "movementType", ledger.from_bucket AS "fromBucket", ledger.to_bucket AS "toBucket"
      FROM v2_sales_return_dispositions disposition
      LEFT JOIN v2_finished_good_ledger_entries ledger
        ON ledger.organization_id = disposition.organization_id
       AND ledger.reference_type = 'SALES_RETURN_DISPOSITION'
       AND ledger.reference_id = disposition.id
      WHERE disposition.organization_id = $1 AND disposition.return_request_id = $2
    `, firstOrganizationId!, commerceReturn.id)
  })
  const commerceReturnDisposition = commerceReturnDispositionRows[0]
  const commerceReturnDispositionAppendOnlyDenied = commerceReturnDisposition
    ? await phase9DatabaseRejects(firstOrganizationId!, firstUserId!, 'UPDATE v2_sales_return_dispositions SET rationale = rationale WHERE organization_id = $1 AND id = $2', [firstOrganizationId!, commerceReturnDisposition.id], 'commerce append-only evidence cannot be updated or deleted')
    : false
  const commerceReturnClosed = await commerce.closeReturn(context.context, commerceReturn.id, {
    rationale: 'The return disposition is recorded and the controlled return workflow can close.',
  }, `rls-p10-return-close-${suffix}`)
  const commerceHeldReturn = await commerce.createReturn(context.context, {
    orderId: commerceOrder.id,
    reason: 'Controlled returned quantity kept in Quality quarantine pending a later review.',
    lines: [{ orderLineId: commerceSuggestion.orderLineId, quantityGrams: 5 }],
  }, `rls-p10-return-hold-${suffix}`)
  const commerceHeldReturnAuthorized = await commerce.authorizeReturn(context.context, commerceHeldReturn.id, {
    rationale: 'Hold-path return is authorized for controlled Quality custody.',
  }, `rls-p10-return-hold-authorize-${suffix}`)
  const commerceHeldReturnLine = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM v2_sales_return_lines WHERE organization_id = $1 AND return_request_id = $2', firstOrganizationId!, commerceHeldReturn.id)
  })
  if (!commerceHeldReturnLine[0]?.id) throw new Error('V2_RLS=FAIL Commerce hold-path return line is missing')
  const commerceHeldReturnReceived = await commerce.receiveReturn(context.context, commerceHeldReturn.id, {
    lines: [{ returnLineId: commerceHeldReturnLine[0].id, finishedGoodLotId: p8ReRelease.finishedGoodLot.id, quantityGrams: 5 }],
    inspectionNotes: 'Hold-path receipt entered Quality quarantine.',
  }, `rls-p10-return-hold-receive-${suffix}`)
  const commerceHoldQcDocument = await commerce.attachDocument(context.context, {
    documentKind: 'RETURN_QC', objectRef: `test://commerce/${commerceHeldReturn.id}/return-qc`, contentHash: 'f'.repeat(64), subjectType: 'RETURN', subjectId: commerceHeldReturn.id,
  }, `rls-p10-return-hold-document-${suffix}`)
  const commerceHoldDisposition = await commerce.disposeReturn(context.context, commerceHeldReturn.id, {
    disposition: 'HOLD_FOR_QUALITY',
    rationale: 'Evidence supports retaining this quantity in Quality quarantine.',
    evidenceDocumentSnapshotIds: [commerceHoldQcDocument.id],
  }, `rls-p10-return-hold-disposition-${suffix}`)
  const commerceHoldLedgerCount = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT count(*)::bigint AS count
      FROM v2_finished_good_ledger_entries
      WHERE organization_id = $1 AND reference_type = 'SALES_RETURN_DISPOSITION' AND reference_id = $2
    `, firstOrganizationId!, commerceHoldDisposition.disposition.id)
    return Number(rows[0]?.count ?? 0)
  })
  const commerceHeldReturnClosed = await commerce.closeReturn(context.context, commerceHeldReturn.id, {
    rationale: 'The retained Quality quarantine decision is documented and closed.',
  }, `rls-p10-return-hold-close-${suffix}`)
  const commerceRejectedReturn = await commerce.createReturn(context.context, {
    orderId: commerceOrder.id,
    reason: 'Controlled returned quantity rejected to waste after Quality review.',
    lines: [{ orderLineId: commerceSuggestion.orderLineId, quantityGrams: 5 }],
  }, `rls-p10-return-reject-${suffix}`)
  const commerceRejectedReturnAuthorized = await commerce.authorizeReturn(context.context, commerceRejectedReturn.id, {
    rationale: 'Reject-path return is authorized for controlled Quality custody.',
  }, `rls-p10-return-reject-authorize-${suffix}`)
  const commerceRejectedReturnLine = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM v2_sales_return_lines WHERE organization_id = $1 AND return_request_id = $2', firstOrganizationId!, commerceRejectedReturn.id)
  })
  if (!commerceRejectedReturnLine[0]?.id) throw new Error('V2_RLS=FAIL Commerce reject-path return line is missing')
  const commerceRejectedReturnReceived = await commerce.receiveReturn(context.context, commerceRejectedReturn.id, {
    lines: [{ returnLineId: commerceRejectedReturnLine[0].id, finishedGoodLotId: p8ReRelease.finishedGoodLot.id, quantityGrams: 5 }],
    inspectionNotes: 'Reject-path receipt entered Quality quarantine.',
  }, `rls-p10-return-reject-receive-${suffix}`)
  const commerceRejectQcDocument = await commerce.attachDocument(context.context, {
    documentKind: 'RETURN_QC', objectRef: `test://commerce/${commerceRejectedReturn.id}/return-qc`, contentHash: 'a'.repeat(64), subjectType: 'RETURN', subjectId: commerceRejectedReturn.id,
  }, `rls-p10-return-reject-document-${suffix}`)
  const commerceRejectDisposition = await commerce.disposeReturn(context.context, commerceRejectedReturn.id, {
    disposition: 'REJECT_TO_WASTE',
    rationale: 'Evidence confirms this returned quantity is not eligible for saleable inventory.',
    evidenceDocumentSnapshotIds: [commerceRejectQcDocument.id],
  }, `rls-p10-return-reject-disposition-${suffix}`)
  const commerceRejectDispositionRows = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ movementType: string; fromBucket: string | null; toBucket: string | null }>>( `
      SELECT movement_type AS "movementType", from_bucket AS "fromBucket", to_bucket AS "toBucket"
      FROM v2_finished_good_ledger_entries
      WHERE organization_id = $1 AND reference_type = 'SALES_RETURN_DISPOSITION' AND reference_id = $2
    `, firstOrganizationId!, commerceRejectDisposition.disposition.id)
  })
  const commerceRejectedReturnClosed = await commerce.closeReturn(context.context, commerceRejectedReturn.id, {
    rationale: 'The waste disposition is recorded and the controlled return workflow can close.',
  }, `rls-p10-return-reject-close-${suffix}`)
  const commerceDetail = await commerce.detail(context.context, commerceOrder.id)
  const concurrentCommerceOrders = await Promise.all([
    commerce.createOrder(context.context, { customerId: commerceCustomer.id, currency: 'USD', lines: [{ productId: commerceProduct.id, quantity: 1 }] }, `rls-p10-concurrent-order-a-${suffix}`),
    commerce.createOrder(context.context, { customerId: commerceCustomer.id, currency: 'USD', lines: [{ productId: commerceProduct.id, quantity: 1 }] }, `rls-p10-concurrent-order-b-${suffix}`),
  ])
  await Promise.all(concurrentCommerceOrders.map((order, index) => commerce.confirmOrder(context.context, order.id, `rls-p10-concurrent-confirm-${index}-${suffix}`)))
  const concurrentCommerceDetails = await Promise.all(concurrentCommerceOrders.map((order) => commerce.detail(context.context, order.id)))
  const concurrentCommerceAllocations = await Promise.allSettled(concurrentCommerceDetails.map((detail, index) => commerce.allocateOrder(context.context, concurrentCommerceOrders[index]!.id, {
    lines: [{ orderLineId: detail.lines[0]!.id, finishedGoodLotId: p8ReRelease.finishedGoodLot.id, quantityGrams: 50 }],
  }, `rls-p10-concurrent-allocate-${index}-${suffix}`)))
  const concurrentCommerceSuccesses = concurrentCommerceAllocations.filter((result): result is PromiseFulfilledResult<{ orderId: string; reservations: Record<string, unknown>[] }> => result.status === 'fulfilled')
  const concurrentCommerceFailures = concurrentCommerceAllocations.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  const concurrentCommerceWinner = concurrentCommerceSuccesses[0]?.value.orderId
  const concurrentCommerceCancellation = concurrentCommerceWinner
    ? await commerce.cancelOrder(context.context, concurrentCommerceWinner, { rationale: 'Release the isolated competing reservation after the concurrency assertion.' }, `rls-p10-concurrent-cancel-${suffix}`)
    : null
  const commerceRawMovementCountAfter = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_inventory_movements WHERE organization_id = $1', firstOrganizationId!)
    return Number(rows[0]?.count ?? 0)
  })
  const brandCommerceDetail = await commerce.detail({ ...context.context, userId: brandUserId!, role: 'Brand', sessionId: `ses_brand_commerce_${brandUserId}` }, commerceOrder.id)
  const p8FinishedGoods = await production.listFinishedGoodLots(context.context)
  const p8ClosedOrder = await production.closeOrder(context.context, p8Order.id, { rationale: 'Batch record archived after final rework release.' }, `rls-p8-close-${suffix}`)

  const p8CancelledOrder = await production.createOrder(context.context, {
    formulaVersionId: approvedFormula.id,
    targetBulkGrams: 10,
    orderNumber: `CAN-${suffix.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase()}`,
  }, `rls-p8-cancel-order-${suffix}`)
  const p8Cancellation = await production.cancelOrder(context.context, p8CancelledOrder.id, { rationale: 'No longer required before material consumption.' }, `rls-p8-cancel-${suffix}`)

  const p8CorrectionOrder = await production.createOrder(context.context, {
    formulaVersionId: approvedFormula.id,
    targetBulkGrams: 100,
    orderNumber: `COR-${suffix.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase()}`,
  }, `rls-p8-correction-order-${suffix}`)
  const p8CorrectionSpecification = await production.createQcSpecification(context.context, p8CorrectionOrder.id, {
    name: `QA correction ${suffix}`,
    versionLabel: 'qa-1',
    checks: [{ key: 'appearance', label: 'Appearance accepted', kind: 'BOOLEAN', required: true }],
  }, `rls-p8-correction-spec-${suffix}`)
  await production.planOrder(context.context, p8CorrectionOrder.id, { equipmentRef: 'QA-correction-vessel' }, `rls-p8-correction-plan-${suffix}`)
  const p8CorrectionPlan = await production.detail(context.context, p8CorrectionOrder.id)
  const p8CorrectionRequirement = p8CorrectionPlan.requirements[0]
  if (!p8CorrectionRequirement) throw new Error('V2_RLS=FAIL correction order is missing its requirement')
  await production.allocateMaterials(context.context, p8CorrectionOrder.id, {
    allocations: [{ requirementId: p8CorrectionRequirement.id, lotId: productionLotId, allocatedGrams: 100 }],
  }, `rls-p8-correction-allocate-${suffix}`)
  const p8CorrectionAllocated = await production.detail(context.context, p8CorrectionOrder.id)
  const p8CorrectionAllocation = p8CorrectionAllocated.allocations[0]
  if (!p8CorrectionAllocation) throw new Error('V2_RLS=FAIL correction allocation is missing')
  await production.startWeighing(context.context, p8CorrectionOrder.id, {
    lines: [{ allocationId: p8CorrectionAllocation.id, requestedGrams: 100, toleranceGrams: 0 }],
  }, `rls-p8-correction-weigh-start-${suffix}`)
  const p8CorrectionStarted = await production.detail(context.context, p8CorrectionOrder.id)
  const p8CorrectionSession = p8CorrectionStarted.weighing.find((item) => item.status === 'IN_PROGRESS')
  const p8CorrectionLine = p8CorrectionSession ? p8CorrectionStarted.weighingLines.find((item) => item.productionWeighingSessionId === p8CorrectionSession.id) : undefined
  if (!p8CorrectionSession || !p8CorrectionLine) throw new Error('V2_RLS=FAIL correction weighing did not open')
  await production.confirmWeighing(context.context, p8CorrectionOrder.id, p8CorrectionSession.labWeighingSessionId, {
    lines: [{ lineId: p8CorrectionLine.lineId, lotId: productionLotId, actualGrams: 100 }],
  }, `rls-p8-correction-weigh-confirm-${suffix}`)
  const p8CorrectionDetail = await production.detail(context.context, p8CorrectionOrder.id)
  const p8CorrectionUsage = p8CorrectionDetail.materialUsages[0]
  if (!p8CorrectionUsage) throw new Error('V2_RLS=FAIL correction usage is missing')
  let directProductionReversalDenied = false
  try { await lab.reverseMovement(context.context, p8CorrectionUsage.inventoryMovementId, `rls-p8-direct-reverse-${suffix}`) } catch (error) {
    directProductionReversalDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'PRODUCTION_REVERSAL_WORKFLOW_REQUIRED'
  }
  const p8Correction = await production.reverseMaterialUsage(context.context, p8CorrectionOrder.id, p8CorrectionUsage.id, {
    reason: 'The controlled lot selection needs a documented correction before processing.',
  }, `rls-p8-correction-reverse-${suffix}`)
  const duplicateP8Correction = await production.reverseMaterialUsage(context.context, p8CorrectionOrder.id, p8CorrectionUsage.id, {
    reason: 'The controlled lot selection needs a documented correction before processing.',
  }, `rls-p8-correction-reverse-${suffix}`)
  const p8CorrectionIntegration = p8Correction.production as { deviationId?: string; status?: string } | null
  if (!p8CorrectionIntegration?.deviationId) throw new Error('V2_RLS=FAIL controlled production correction did not create a deviation')
  let p8CorrectionIdempotencyConflict = false
  try {
    await production.reverseMaterialUsage(context.context, p8CorrectionOrder.id, p8CorrectionUsage.id, {
      reason: 'A different correction reason must conflict with the existing idempotency key.',
    }, `rls-p8-correction-reverse-${suffix}`)
  } catch (error) {
    p8CorrectionIdempotencyConflict = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'IDEMPOTENCY_CONFLICT'
  }
  const p8CorrectionResolution = await production.resolveDeviation(context.context, p8CorrectionOrder.id, p8CorrectionIntegration.deviationId, {
    disposition: 'CONTINUE', rationale: 'The compensating inventory movement is verified and the batch can be reweighed.',
  }, `rls-p8-correction-resolve-${suffix}`)
  const p8CorrectionResume = await production.resumeFromHold(context.context, p8CorrectionOrder.id, { targetStatus: 'READY_FOR_WEIGHING' }, `rls-p8-correction-resume-${suffix}`)
  const p8RestartWeighing = await production.startWeighing(context.context, p8CorrectionOrder.id, {
    lines: [{ allocationId: p8CorrectionAllocation.id, requestedGrams: 100, toleranceGrams: 0 }],
  }, `rls-p8-correction-restart-${suffix}`)
  const p8RestartedDetail = await production.detail(context.context, p8CorrectionOrder.id)
  const p8RestartedSession = p8RestartedDetail.weighing.find((item) => item.status === 'IN_PROGRESS')
  const p8RestartedLine = p8RestartedSession ? p8RestartedDetail.weighingLines.find((item) => item.productionWeighingSessionId === p8RestartedSession.id) : undefined
  if (!p8RestartedSession || !p8RestartedLine) throw new Error('V2_RLS=FAIL corrected production weighing did not restart')
  const p8RestartConfirmation = await production.confirmWeighing(context.context, p8CorrectionOrder.id, p8RestartedSession.labWeighingSessionId, {
    lines: [{ lineId: p8RestartedLine.lineId, lotId: productionLotId, actualGrams: 100 }],
  }, `rls-p8-correction-restart-confirm-${suffix}`)
  const p8ReworkDeviation = await production.recordDeviation(context.context, p8CorrectionOrder.id, {
    category: 'PROCESS', severity: 'HIGH', description: 'A controlled compounding rework is required for the isolated fixture.', immediateAction: 'Hold the batch before process start.',
  }, `rls-p8-rework-deviation-${suffix}`)
  const p8ReworkResolution = await production.resolveDeviation(context.context, p8CorrectionOrder.id, p8ReworkDeviation.id, {
    disposition: 'REWORK', reworkTargetStage: 'COMPOUNDING', rationale: 'Repeat the approved compounding stage with a documented rework record.',
  }, `rls-p8-rework-resolve-${suffix}`)
  const p8Rework = await production.startRework(context.context, p8CorrectionOrder.id, {
    deviationId: p8ReworkDeviation.id, sourceKind: 'IN_PROCESS', quantityGrams: 5, targetStage: 'COMPOUNDING', reason: 'Controlled rework of the in-process batch.',
  }, `rls-p8-rework-start-${suffix}`)
  for (const stage of ['COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING'] as const) {
    await production.startStage(context.context, p8CorrectionOrder.id, stage, { actualParameters: { rework: true, stage } }, `rls-p8-rework-${stage.toLowerCase()}-start-${suffix}`)
    await production.completeStage(context.context, p8CorrectionOrder.id, stage, { actualParameters: { rework: true, stage, completed: true } }, `rls-p8-rework-${stage.toLowerCase()}-complete-${suffix}`)
  }
  const p8CompletedRework = await production.completeRework(context.context, p8CorrectionOrder.id, p8Rework.id, { actualParameters: { rework: true, closed: true } }, `rls-p8-rework-complete-${suffix}`)
  let crossTenantProductionDenied = false
  let crossTenantFinishedGoodDenied = false
  const fefo = await lab.fefo(context.context, material.id, 150)
  const weighing = await lab.createWeighingSession(context.context, { contextType: 'AD_HOC', lines: [{ materialId: material.id, requestedGrams: 100, toleranceGrams: 0 }] }, `rls-weigh-${suffix}`)
  const confirmed = await lab.confirmWeighing(context.context, weighing.id, [{ lineId: weighing.lines[0].id, lotId: receipt.lines[0].lotId, actualGrams: 100 }], `rls-weigh-confirm-${suffix}`)
  const duplicateConfirmation = await lab.confirmWeighing(context.context, weighing.id, [{ lineId: weighing.lines[0].id, lotId: receipt.lines[0].lotId, actualGrams: 100 }], `rls-weigh-confirm-${suffix}`)
  const consumption = await appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM v2_inventory_movements WHERE organization_id = $1 AND reference_id = $2 AND movement_type = $3 LIMIT 1', firstOrganizationId!, weighing.id, 'CONSUMPTION')
  })
  const reversal = await lab.reverseMovement(context.context, consumption[0]!.id, `rls-reverse-${suffix}`)
  const reservation = await lab.reserve(context.context, { materialId: material.id, quantityGrams: 200, contextType: 'PRODUCTION_OUTPUT', contextId: `qa-${suffix}` }, `rls-reserve-${suffix}`)
  const reservedLots = await lab.listLots(context.context)
  const reservedWeighing = await lab.createWeighingSession(context.context, { contextType: 'AD_HOC', lines: [{ materialId: material.id, lotId: receipt.lines[0].lotId, reservationId: reservation.reservations[0]!.id, requestedGrams: 25, toleranceGrams: 0 }] }, `rls-reserved-weigh-${suffix}`)
  const reservedConfirmation = await lab.confirmWeighing(context.context, reservedWeighing.id, [{ lineId: reservedWeighing.lines[0].id, lotId: receipt.lines[0].lotId, actualGrams: 25 }], `rls-reserved-weigh-confirm-${suffix}`)
  const receiptMovement = await appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM v2_inventory_movements WHERE organization_id = $1 AND reference_id = $2 AND movement_type = $3 LIMIT 1', firstOrganizationId!, receipt.id, 'RECEIPT')
  })
  let unsafeReversalDenied = false
  try { await lab.reverseMovement(context.context, receiptMovement[0]!.id, `rls-unsafe-reverse-${suffix}`) } catch (error) { unsafeReversalDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'MOVEMENT_REVERSAL_WOULD_BREAK_STOCK' }
  const release = await lab.releaseReservation(context.context, reservation.reservations[0]!.id, `rls-release-${suffix}`)
  const reservedConsumption = await appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM v2_inventory_movements WHERE organization_id = $1 AND reference_id = $2 AND movement_type = $3 LIMIT 1', firstOrganizationId!, reservedWeighing.id, 'CONSUMPTION')
  })
  const reservedCorrection = await lab.reverseMovement(context.context, reservedConsumption[0]!.id, `rls-reserved-weigh-reverse-${suffix}`)
  const waste = await lab.adjustInventory(context.context, { lotId: receipt.lines[0].lotId, quantityDeltaGrams: -10, kind: 'WASTE', reason: 'isolated verification waste' }, `rls-waste-${suffix}`)
  const wasteReversal = await lab.reverseMovement(context.context, waste.id, `rls-waste-reverse-${suffix}`)
  const landedAttempts = await Promise.allSettled([
    lab.postLandedCost(context.context, receipt.id, `rls-landed-a-${suffix}`),
    lab.postLandedCost(context.context, receipt.id, `rls-landed-b-${suffix}`),
  ])
  const landed = landedAttempts.find((result): result is PromiseFulfilledResult<{ receiptId: string; totalCost: number; allocations: Array<{ id: string }> }> => result.status === 'fulfilled')?.value
  const concurrentLandedCostDenied = landedAttempts.some((result) => result.status === 'rejected' && result.reason instanceof Error && 'code' in result.reason && (result.reason as { code?: string }).code === 'LANDED_COST_ALREADY_POSTED')
  if (!landed) throw new Error('V2_RLS=FAIL concurrent landed-cost post did not produce an allocation')
  const returnedReceipt = await lab.receiveGoods(context.context, { freightCost: 0, dutyCost: 0, insuranceCost: 0, currency: 'USD', lines: [{ materialId: material.id, supplierOfferId: offer.id, quantity: 100, unit: 'G', location: 'QA return', unitPrice: 0.02 }] }, `rls-return-receipt-${suffix}`)
  const returned = await lab.inspectReceiptLine(context.context, returnedReceipt.id, returnedReceipt.lines[0].id, { disposition: 'RETURN', findings: { qa: 'return' }, reason: 'isolated return' }, `rls-return-inspection-${suffix}`)
  const reviewReceipt = await lab.receiveGoods(context.context, { freightCost: 0, dutyCost: 0, insuranceCost: 0, currency: 'USD', lines: [{ materialId: material.id, supplierOfferId: offer.id, quantity: 10, unit: 'G', location: 'QA review', unitPrice: 0.02 }] }, `rls-review-receipt-${suffix}`)
  const held = await lab.inspectReceiptLine(context.context, reviewReceipt.id, reviewReceipt.lines[0].id, { disposition: 'HOLD', findings: { qa: 'awaiting evidence' }, reason: 'open discrepancy' }, `rls-hold-${suffix}`)
  const resolvedReview = await lab.inspectReceiptLine(context.context, reviewReceipt.id, reviewReceipt.lines[0].id, { disposition: 'ACCEPT', findings: { qa: 'evidence accepted' } }, `rls-review-accept-${suffix}`)
  const blockedMaterial = await lab.createMaterial(context.context, { name: 'Blocked compliance material', internalCode: `BLOCK-${suffix}`, sensoryMetadata: {}, identifiers: [] }, `rls-blocked-material-${suffix}`)
  await lab.changeMaterialStatus(context.context, blockedMaterial.id, 'ACTIVE', `rls-blocked-material-status-${suffix}`)
  await lab.saveCompliance(context.context, blockedMaterial.id, { jurisdiction: 'QA', category: 'TEST', status: 'BLOCKED', source: 'isolated test', sourceVersion: '1', limits: {} }, `rls-blocked-compliance-${suffix}`)
  let blockedComplianceDenied = false
  try { await lab.receiveGoods(context.context, { freightCost: 0, dutyCost: 0, insuranceCost: 0, currency: 'USD', lines: [{ materialId: blockedMaterial.id, quantity: 1, unit: 'G', location: 'denied' }] }, `rls-blocked-receipt-${suffix}`) } catch (error) { blockedComplianceDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'MATERIAL_COMPLIANCE_BLOCKED' }

  // Phase 11: the optimizer is deterministic and advisory until the explicit
  // review writes a Formula-owned draft. Imports and bulk actions carry their
  // own bounded confirmation evidence and delegate domain mutations to LabOps.
  const phase11DraftCountBeforeRun = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_formula_drafts WHERE organization_id = $1', firstOrganizationId!)
    return Number(rows[0]?.count ?? 0)
  })
  const optimizerRun = await advanced.createOptimizerRun(context.context, {
    parentFormulaVersionId: approvedFormula.id,
    constraints: { requiredMaterialIds: [], prohibitedMaterialIds: [], replaceMaterialIds: [material.id], minComponentCount: 1, maxComponentCount: 2, complianceMode: 'REPORT_ONLY', requireAvailableInventory: false },
    objectives: { odorSimilarity: 0.55, briefAlignment: 0.2, availability: 0.15, cost: 0, sensoryEvidence: 0.05, consumerEvidence: 0.05 },
    solverConfig: { algorithmVersion: 'reformulation/1', candidateLimit: 1, randomSeed: 41 },
  }, `rls-p11-optimizer-${suffix}`)
  const duplicateOptimizerRun = await advanced.createOptimizerRun(context.context, {
    parentFormulaVersionId: approvedFormula.id,
    constraints: { requiredMaterialIds: [], prohibitedMaterialIds: [], replaceMaterialIds: [material.id], minComponentCount: 1, maxComponentCount: 2, complianceMode: 'REPORT_ONLY', requireAvailableInventory: false },
    objectives: { odorSimilarity: 0.55, briefAlignment: 0.2, availability: 0.15, cost: 0, sensoryEvidence: 0.05, consumerEvidence: 0.05 },
    solverConfig: { algorithmVersion: 'reformulation/1', candidateLimit: 1, randomSeed: 41 },
  }, `rls-p11-optimizer-${suffix}`)
  const optimizerDetail = await advanced.optimizerDetail(context.context, optimizerRun.id)
  const optimizerCandidate = optimizerDetail.candidates[0]
  if (!optimizerCandidate) throw new Error('V2_RLS=FAIL optimizer did not persist an advisory candidate')
  const phase11DraftCountAfterRun = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_formula_drafts WHERE organization_id = $1', firstOrganizationId!)
    return Number(rows[0]?.count ?? 0)
  })
  const phase11UnrelatedFormulaProject = await formula.createProject(context.context, { name: 'RLS P11 unrelated project', formulaType: 'ACCORD' }, `rls-p11-unrelated-project-${suffix}`)
  let optimizerProjectMismatchDenied = false
  try {
    await advanced.reviewOptimizerCandidate(context.context, optimizerCandidate.id, { decision: 'SAVE_AS_DRAFT', formulaProjectId: phase11UnrelatedFormulaProject.id, rationale: 'A candidate must remain bound to its immutable parent Formula Project.' }, `rls-p11-optimizer-mismatch-${suffix}`)
  } catch (error) {
    optimizerProjectMismatchDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'REFORMULATION_CANDIDATE_FORMULA_PROJECT_MISMATCH'
  }
  const optimizerReview = await advanced.reviewOptimizerCandidate(context.context, optimizerCandidate.id, { decision: 'SAVE_AS_DRAFT', formulaProjectId: formulaProject.id, rationale: 'Perfumer review accepts the advisory candidate only as a new Formula draft.' }, `rls-p11-optimizer-review-${suffix}`)
  const duplicateOptimizerReview = await advanced.reviewOptimizerCandidate(context.context, optimizerCandidate.id, { decision: 'SAVE_AS_DRAFT', formulaProjectId: formulaProject.id, rationale: 'Perfumer review accepts the advisory candidate only as a new Formula draft.' }, `rls-p11-optimizer-review-${suffix}`)
  const phase11DraftCountAfterReview = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_formula_drafts WHERE organization_id = $1', firstOrganizationId!)
    return Number(rows[0]?.count ?? 0)
  })

  const phase11ImportCsv = Buffer.from(`name,internalCode,description,cas\nP11 Imported Material ${suffix},P11-${suffix.replace(/[^a-z0-9]/gi, '').slice(-12)},Create-only test material,123-45-6\n`, 'utf8').toString('base64')
  const phase11DryRunImport = await advanced.createImport(context.context, { kind: 'MATERIALS', format: 'CSV', fileName: 'phase11-materials.csv', contentBase64: phase11ImportCsv, mapping: {}, dryRun: true }, `rls-p11-import-dry-${suffix}`)
  const phase11MappedImport = await advanced.createImport(context.context, { kind: 'MATERIALS', format: 'CSV', fileName: 'phase11-materials.csv', contentBase64: phase11ImportCsv, mapping: { name: 'name', internalCode: 'internalCode', description: 'description', cas: 'cas' }, dryRun: true }, `rls-p11-import-mapped-${suffix}`)
  const phase11ConfirmedImport = await advanced.createImport(context.context, { kind: 'MATERIALS', format: 'CSV', fileName: 'phase11-materials.csv', contentBase64: phase11ImportCsv, mapping: {}, dryRun: false }, `rls-p11-import-confirmed-${suffix}`)
  let phase11DryRunCommitDenied = false
  try { await advanced.commitImport(context.context, phase11DryRunImport.id, { confirmationToken: phase11DryRunImport.confirmationToken! }, `rls-p11-import-dry-commit-${suffix}`) } catch (error) {
    phase11DryRunCommitDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'IMPORT_DRY_RUN_ONLY'
  }
  if (!phase11ConfirmedImport.confirmationToken) throw new Error('V2_RLS=FAIL confirmed import did not return a volatile confirmation token')
  await advanced.commitImport(context.context, phase11ConfirmedImport.id, { confirmationToken: phase11ConfirmedImport.confirmationToken }, `rls-p11-import-commit-${suffix}`)
  const phase11CommittedImport = await advanced.importDetail(context.context, phase11ConfirmedImport.id)
  const phase11RenewalCsv = Buffer.from(`name,internalCode,description\nP11 Renewable Material ${suffix},P11-R-${suffix.replace(/[^a-z0-9]/gi, '').slice(-10)},Confirmation renewal test\n`, 'utf8').toString('base64')
  const phase11ExpiringImport = await advanced.createImport(context.context, { kind: 'MATERIALS', format: 'CSV', fileName: 'phase11-renewal.csv', contentBase64: phase11RenewalCsv, mapping: {}, dryRun: false }, `rls-p11-import-expiring-${suffix}`)
  await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId!)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    await tx.$executeRawUnsafe("UPDATE v2_import_jobs SET confirmation_expires_at = now() - interval '1 minute' WHERE organization_id = $1 AND id = $2", firstOrganizationId!, phase11ExpiringImport.id)
  })
  const phase11RenewedImport = await advanced.createImport(context.context, { kind: 'MATERIALS', format: 'CSV', fileName: 'phase11-renewal.csv', contentBase64: phase11RenewalCsv, mapping: {}, dryRun: false }, `rls-p11-import-renew-${suffix}`)
  if (!phase11RenewedImport.confirmationToken) throw new Error('V2_RLS=FAIL renewed import did not return a confirmation token')
  await advanced.commitImport(context.context, phase11RenewedImport.id, { confirmationToken: phase11RenewedImport.confirmationToken }, `rls-p11-import-renew-commit-${suffix}`)
  const phase11RenewalCommitted = await advanced.importDetail(context.context, phase11RenewedImport.id)
  const phase11LargeImportCsv = Buffer.from([
    'name,internalCode',
    ...Array.from({ length: 201 }, (_, index) => `P11 Bulk Material ${suffix}-${index + 1},P11-B-${suffix.replace(/[^a-z0-9]/gi, '').slice(-8)}-${index + 1}`),
    '',
  ].join('\n'), 'utf8').toString('base64')
  const phase11LargeImport = await advanced.createImport(context.context, { kind: 'MATERIALS', format: 'CSV', fileName: 'phase11-large.csv', contentBase64: phase11LargeImportCsv, mapping: {}, dryRun: false }, `rls-p11-import-large-${suffix}`)
  if (!phase11LargeImport.confirmationToken) throw new Error('V2_RLS=FAIL large import did not return a confirmation token')
  await advanced.commitImport(context.context, phase11LargeImport.id, { confirmationToken: phase11LargeImport.confirmationToken }, `rls-p11-import-large-commit-${suffix}`)
  const phase11LargeCommitted = await advanced.importDetail(context.context, phase11LargeImport.id)
  const phase11DuplicateImport = await advanced.createImport(context.context, {
    kind: 'MATERIALS', format: 'CSV', fileName: 'phase11-materials-retry.csv',
    contentBase64: Buffer.from(`name,internalCode,description\nP11 Imported Material ${suffix},P11-${suffix.replace(/[^a-z0-9]/gi, '').slice(-12)},Different source hash but same create-only key\n`, 'utf8').toString('base64'),
    mapping: {}, dryRun: true,
  }, `rls-p11-import-duplicate-${suffix}`)
  const phase11DuplicateDetail = await advanced.importDetail(context.context, phase11DuplicateImport.id)
  let phase11SpreadsheetInjectionDenied = false
  try {
    await advanced.createImport(context.context, { kind: 'MATERIALS', format: 'CSV', fileName: 'unsafe.csv', contentBase64: Buffer.from('name,internalCode\n"=HYPERLINK(""https://unsafe.test"")",P11-UNSAFE\n', 'utf8').toString('base64'), mapping: {}, dryRun: true }, `rls-p11-import-injection-${suffix}`)
  } catch (error) { phase11SpreadsheetInjectionDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'IMPORT_FORMULA_CELL_DENIED' }
  let phase11UnknownMappingDenied = false
  try {
    await advanced.createImport(context.context, { kind: 'MATERIALS', format: 'CSV', fileName: 'bad-mapping.csv', contentBase64: phase11ImportCsv, mapping: { unexpectedTarget: 'name' }, dryRun: true }, `rls-p11-import-mapping-invalid-${suffix}`)
  } catch (error) { phase11UnknownMappingDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'IMPORT_MAPPING_INVALID' }
  const phase11LocalDataOps = await advanced.runDataOps(context.context, { importJobId: phase11ConfirmedImport.id, adapter: 'LOCAL_QUALITY_GATE' }, `rls-p11-dataops-local-${suffix}`)
  const phase11VexoDataOps = await advanced.runDataOps(context.context, { importJobId: phase11ConfirmedImport.id, adapter: 'VEXO' }, `rls-p11-dataops-vexo-${suffix}`)
  const phase11ImportedMaterial = (await lab.listMaterials(context.context)).find((item) => item.internalCode === `P11-${suffix.replace(/[^a-z0-9]/gi, '').slice(-12)}`)
  if (!phase11ImportedMaterial) throw new Error('V2_RLS=FAIL committed import did not create its material through Lab Operations')
  const phase11BulkPreview = await advanced.previewBulkOperation(context.context, { kind: 'MATERIAL_STATUS', targetIds: [phase11ImportedMaterial.id], payload: { status: 'ACTIVE' }, rationale: 'Activate the create-only material through the governed bulk confirmation flow.' }, `rls-p11-bulk-preview-${suffix}`)
  let phase11BulkInvalidConfirmationDenied = false
  try { await advanced.commitBulkOperation(context.context, phase11BulkPreview.id, { confirmationToken: 'x'.repeat(64) }, `rls-p11-bulk-invalid-${suffix}`) } catch (error) {
    phase11BulkInvalidConfirmationDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'BULK_CONFIRMATION_INVALID'
  }
  await advanced.commitBulkOperation(context.context, phase11BulkPreview.id, { confirmationToken: phase11BulkPreview.confirmationToken }, `rls-p11-bulk-commit-${suffix}`)
  const phase11BulkMaterial = (await lab.listMaterials(context.context)).find((item) => item.id === phase11ImportedMaterial.id)
  const firstLots = await lab.listLots(context.context)
  const secondContext = await service.contextFromToken(second.rawSessionToken, `${secondSlug}.olfactoryops.com`)
  const phase9SecondBootstrap = await agent.bootstrap(secondContext.context)
  const phase9RowsInFirstTenant = await phase9TenantScopedCounts(firstOrganizationId!, firstUserId!, firstOrganizationId!)
  const phase9RowsVisibleFromSecondTenant = await phase9TenantScopedCounts(secondOrganizationId!, secondContext.context.userId, firstOrganizationId!)
  const phase11RowsInFirstTenant = await phase11TenantScopedCounts(firstOrganizationId!, firstUserId!, firstOrganizationId!)
  const phase11RowsVisibleFromSecondTenant = await phase11TenantScopedCounts(secondOrganizationId!, secondContext.context.userId, firstOrganizationId!)
  const secondMaterials = await lab.listMaterials(secondContext.context)
  const secondOffers = await lab.listSupplierOffers(secondContext.context)
  const deniedCode = async (action: () => Promise<unknown>, expected: string) => {
    try { await action(); return false } catch (error) { return error instanceof Error && 'code' in error && (error as { code?: string }).code === expected }
  }
  const crossTenantLotDenied = await deniedCode(() => lab.lotDetail(secondContext.context, receipt.lines[0].lotId), 'LOT_NOT_FOUND')
  const crossTenantReceiptDenied = await deniedCode(() => lab.postLandedCost(secondContext.context, receipt.id, `rls-cross-receipt-${suffix}`), 'RECEIPT_NOT_FOUND')
  const crossTenantShipmentDenied = await deniedCode(() => lab.changeShipmentStatus(secondContext.context, shipment.id, 'CANCELLED', undefined, `rls-cross-shipment-${suffix}`), 'SHIPMENT_NOT_FOUND')
  const crossTenantWeighingDenied = await deniedCode(() => lab.confirmWeighing(secondContext.context, weighing.id, [], `rls-cross-weigh-${suffix}`), 'WEIGHING_NOT_FOUND')
  const crossTenantSupplierDenied = await deniedCode(() => lab.createPurchaseOrder(secondContext.context, { supplierId: supplier.id, currency: 'USD', lines: [{ materialId: material.id, orderedGrams: 1 }] }, `rls-cross-order-${suffix}`), 'SUPPLIER_NOT_FOUND')
  const crossTenantScientificDenied = await deniedCode(() => scientific.materialArtifacts(secondContext.context, material.id), 'MATERIAL_NOT_FOUND')
  const crossTenantDatasetDenied = await deniedCode(() => modelDataset.datasetDetail(secondContext.context, dataset.id), 'DATASET_NOT_FOUND')
  const crossTenantModelDenied = await deniedCode(() => modelDataset.runtimeStatus(secondContext.context, modelVersion.id), 'MODEL_VERSION_NOT_FOUND')
  const crossTenantEmbeddingDenied = await deniedCode(() => olfactory.createMolecularEmbedding(secondContext.context, material.id, { featureKinds: ['ECFP'] }, `rls-cross-embedding-${suffix}`), 'MATERIAL_NOT_FOUND')
  const crossTenantSentimentDenied = await deniedCode(() => consumer.invalidateSource(secondContext.context, sentimentSource.id, { reasonCode: 'CROSS_TENANT' }, `rls-cross-sentiment-${suffix}`), 'FEEDBACK_SOURCE_NOT_FOUND')
  const crossTenantFormulaDenied = await deniedCode(() => formula.projectDetail(secondContext.context, formulaProject.id), 'FORMULA_PROJECT_NOT_FOUND')
  const crossTenantAgentDenied = await deniedCode(() => agent.detail(secondContext.context, agentRun.id), 'AGENT_RUN_NOT_FOUND')
  const crossTenantPhase9RunDenied = await deniedCode(() => agent.detail(secondContext.context, phase9Run.id), 'AGENT_RUN_NOT_FOUND')
  const crossTenantPhase9EvidenceDenied = await deniedCode(() => agent.evidence(secondContext.context, phase9Run.id), 'AGENT_RUN_NOT_FOUND')
  const crossTenantPhase9EvaluationDenied = await deniedCode(() => agent.evaluationDetail(secondContext.context, phase9Evaluation.id), 'AGENT_EVALUATION_NOT_FOUND')
  const crossTenantTrialDenied = await deniedCode(() => trials.detail(secondContext.context, trial.id), 'TRIAL_NOT_FOUND')
  crossTenantProductionDenied = await deniedCode(() => production.detail(secondContext.context, p8Order.id), 'PRODUCTION_ORDER_NOT_FOUND')
  crossTenantFinishedGoodDenied = await deniedCode(() => production.finishedGoodGenealogy(secondContext.context, p8Release.finishedGoodLot.id), 'FINISHED_GOOD_LOT_NOT_FOUND')
  const crossTenantCommerceDenied = await deniedCode(() => commerce.detail(secondContext.context, commerceOrder.id), 'SALES_ORDER_NOT_FOUND')
  const crossTenantOptimizerDenied = await deniedCode(() => advanced.optimizerDetail(secondContext.context, optimizerRun.id), 'OPTIMIZER_RUN_NOT_FOUND')
  const crossTenantImportDenied = await deniedCode(() => advanced.importDetail(secondContext.context, phase11ConfirmedImport.id), 'IMPORT_JOB_NOT_FOUND')
  const crossTenantBulkDenied = await deniedCode(() => advanced.commitBulkOperation(secondContext.context, phase11BulkPreview.id, { confirmationToken: phase11BulkPreview.confirmationToken }, `rls-p11-cross-bulk-${suffix}`), 'BULK_OPERATION_NOT_FOUND')
  const commerceRowsVisibleFromSecondTenant = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", secondOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", secondContext.context.userId)
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM v2_sales_orders WHERE organization_id = $1', firstOrganizationId!)
    return Number(rows[0]?.count ?? 0)
  })
  const crossTenantEvidence = await evidence.retrieve(secondContext.context, { materialId: material.id, query: 'woody', limit: 3 })
  const invalidation = await consumer.invalidateSource(context.context, sentimentSource.id, { reasonCode: 'CONSENT_REVOKED' }, `rls-sentiment-invalidate-${suffix}`)
  const invalidatedPreference = await consumer.latestPreference(context.context, 'qa-project')
  const secondDataset = await modelDataset.createDataset(secondContext.context, { key: `qa-other-${suffix.replace(/[^a-z0-9]/gi, '').slice(-20)}`, name: 'Second tenant dataset', task: 'Composite foreign-key isolation check' }, `rls-other-dataset-${suffix}`)
  const compositeCrossTenantDatasetDenied = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    try {
      await tx.$executeRawUnsafe(
        'INSERT INTO v2_dataset_versions (id, organization_id, dataset_id, version, source_repository, source_commit, citation, source_version, schema_version, content_checksum, material_universe_hash, row_count, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
        `datasetver_cross_${suffix.replace(/[^a-z0-9]/gi, '')}`,
        firstOrganizationId!,
        secondDataset.id,
        'cross-tenant-attempt',
        'https://example.test/source',
        'fixture',
        'Cross-tenant relationship attempt',
        'fixture',
        'dataset/1',
        'a'.repeat(64),
        'b'.repeat(64),
        0,
        firstUserId!,
      )
      return false
    } catch {
      return true
    }
  })

  restrictedUserId = `usr_restricted_${suffix.replace(/[^a-z0-9]/gi, '')}`
  await adminClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('INSERT INTO v2_users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)', restrictedUserId!, `${restrictedUserId}@example.test`, 'Restricted QA', 'not-a-login')
    await tx.$executeRawUnsafe('INSERT INTO v2_memberships (id, organization_id, user_id, role_key, status) VALUES ($1, $2, $3, $4, $5)', `mem_${restrictedUserId}`, firstOrganizationId!, restrictedUserId!, 'Perfumer', 'ACTIVE')
    // This role intentionally receives document visibility but not finished-good
    // visibility, proving that deep genealogy does not leak through its evidence
    // permission alone.
    await tx.$executeRawUnsafe(
      'UPDATE v2_role_policies SET permissions = $1::jsonb, version = version + 1, updated_at = now() WHERE organization_id = $2 AND role_key = $3',
      JSON.stringify(['production.view', 'production.documents.view']), firstOrganizationId!, 'Perfumer',
    )
  })
  const documentsOnlyProductionContext = { ...context.context, userId: restrictedUserId!, role: 'Perfumer' as const, sessionId: `ses_documents_only_${restrictedUserId}` }
  let permissionDenied = false
  try {
    await lab.receiveGoods({ ...context.context, userId: restrictedUserId, role: 'Perfumer', sessionId: `ses_${restrictedUserId}` }, { freightCost: 0, dutyCost: 0, insuranceCost: 0, currency: 'USD', lines: [{ materialId: material.id, quantity: 1, unit: 'G', location: 'denied' }] }, `rls-denied-${suffix}`)
  } catch (error) { permissionDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'TENANT_ACCESS_DENIED' }
  const finishedGoodGenealogyPermissionDenied = await deniedCode(() => production.finishedGoodGenealogy(documentsOnlyProductionContext, p8Release.finishedGoodLot.id), 'TENANT_ACCESS_DENIED')
  const scientificPermissionDenied = await deniedCode(() => scientific.materialArtifacts({ ...context.context, userId: restrictedUserId!, role: 'Perfumer', sessionId: `ses_science_${restrictedUserId}` }, material.id), 'TENANT_ACCESS_DENIED')
  const modelRegistryPermissionDenied = await deniedCode(() => modelDataset.createDataset({ ...context.context, userId: restrictedUserId!, role: 'Perfumer', sessionId: `ses_model_${restrictedUserId}` }, { key: `denied-${suffix.replace(/[^a-z0-9]/gi, '').slice(-20)}`, name: 'Denied', task: 'Denied' }, `rls-model-denied-${suffix}`), 'TENANT_ACCESS_DENIED')
  const sentimentPermissionDenied = await deniedCode(() => consumer.createSource({ ...context.context, userId: restrictedUserId!, role: 'Perfumer', sessionId: `ses_sentiment_${restrictedUserId}` }, { key: `denied-sentiment-${suffix.replace(/[^a-z0-9]/gi, '').slice(-12)}`, type: 'SURVEY', sourceScope: 'qa-project', storageRef: 'test://denied', purpose: 'Denied fixture', consentRequired: false, retentionDays: 30 }, `rls-sentiment-denied-${suffix}`), 'TENANT_ACCESS_DENIED')
  await adminClient!.$executeRawUnsafe(
    'UPDATE v2_role_policies SET permissions = $1::jsonb, version = version + 1, updated_at = now() WHERE organization_id = $2 AND role_key = $3',
    JSON.stringify(['orders.fulfill', 'production.qc.approve']), firstOrganizationId!, 'Perfumer',
  )
  const fulfillmentOnlyReturnDetail = await commerce.returnDetail({ ...context.context, userId: restrictedUserId!, role: 'Perfumer', sessionId: `ses_fulfillment_only_${restrictedUserId}` }, commerceReturn.id)
  const returnDocumentProjectionRedacted = fulfillmentOnlyReturnDetail.documents.length === 0
    && fulfillmentOnlyReturnDetail.disposition !== null
    && !('evidenceDocumentSnapshotIds' in fulfillmentOnlyReturnDetail.disposition)
    && !('outcomeSnapshot' in fulfillmentOnlyReturnDetail.disposition)
  const returnDispositionDocumentPermissionDenied = await deniedCode(() => commerce.disposeReturn(
    { ...context.context, userId: restrictedUserId!, role: 'Perfumer', sessionId: `ses_fulfillment_only_${restrictedUserId}` },
    commerceReturn.id,
    { disposition: 'HOLD_FOR_QUALITY', rationale: 'A Quality disposition must not be possible without document visibility.', evidenceDocumentSnapshotIds: [commerceReturnQcDocument.id] },
    `rls-p10-return-document-denied-${suffix}`,
  ), 'TENANT_ACCESS_DENIED')

  const projection = firstLots.find((lot) => lot.id === receipt.lines[0].lotId)?.projection
  const reservedProjection = reservedLots.find((lot) => lot.id === receipt.lines[0].lotId)?.projection
  const returnedProjection = firstLots.find((lot) => lot.id === returnedReceipt.lines[0].lotId)?.projection
  const phase2Pass = duplicateMaterial.id === material.id
    && quarantineRejected
    && accepted.lotStatus === 'AVAILABLE'
    && materialDocument.status === 'REVIEW_REQUIRED'
    && supplierDocument.status === 'REVIEW_REQUIRED'
    && Boolean(priceRevision.priceHistoryId)
    && concurrentInspectionDenied
    && shipment.status === 'IN_TRANSIT'
    && transfer.location === 'QA available shelf'
    && fefo[0]?.allocatedGrams === 150
    && confirmed.status === 'CONFIRMED'
    && duplicateConfirmation.status === 'CONFIRMED'
    && reversal.reversalOfId === consumption[0]?.id
    && reservation.reservations.length === 1
    && reservedProjection?.availableGrams === 800
    && reservedConfirmation.status === 'CONFIRMED'
    && release.status === 'RELEASED'
    && reservedCorrection.reversalOfId === reservedConsumption[0]?.id
    && unsafeReversalDenied
    && waste.movementType === 'WASTE'
    && wasteReversal.reversalOfId === waste.id
    && landed.allocations.length === 1
    && concurrentLandedCostDenied
    && projection?.onHandGrams === 1000
    && projection.availableGrams === 1000
    && returned.lotStatus === 'REJECTED'
    && returnedProjection?.onHandGrams === 0
    && held.lotStatus === 'HOLD'
    && resolvedReview.lotStatus === 'AVAILABLE'
    && blockedComplianceDenied
    && secondMaterials.length === 0
    && secondOffers.length === 0
    && crossTenantLotDenied
    && crossTenantReceiptDenied
    && crossTenantShipmentDenied
    && crossTenantWeighingDenied
    && crossTenantSupplierDenied
    && permissionDenied
  const phase3Pass = structureJob.status === 'SUCCEEDED'
    && duplicateStructureJob.id === structureJob.id
    && featureJob.status === 'SUCCEEDED'
    && scienceArtifacts.some((artifact) => artifact.artifactKind === 'STRUCTURE' && artifact.evidenceStatus === 'VERIFIED')
    && scienceArtifacts.some((artifact) => artifact.artifactKind === 'ECFP' && artifact.evidenceStatus === 'VERIFIED')
    && scienceArtifacts.some((artifact) => artifact.artifactKind === 'MOLFTP' && artifact.evidenceStatus === 'NOT_EVALUATED')
    && crossTenantScientificDenied
    && scientificPermissionDenied
  const phase4Pass = duplicateDataset.id === dataset.id
    && approvedDatasetVersion.status === 'APPROVED'
    && trainingRun.status === 'PLANNED'
    && evaluation.leakageStatus === 'PASS'
    && modelRuntime.status === 'NOT_CONFIGURED'
    && crossTenantDatasetDenied
    && crossTenantModelDenied
    && compositeCrossTenantDatasetDenied
    && modelRegistryPermissionDenied
    && molecularEmbedding.status === 'VERIFIED'
    && molecularSimilarity.status === 'VERIFIED'
    && odorPrediction.status === 'NOT_EVALUATED'
    && explainability.status === 'NOT_EVALUATED'
    && crossTenantEmbeddingDenied
  const phase5bPass = sentimentAnalysis.evidenceStatus === 'VERIFIED'
    && transientAnalysis.provider === 'deterministic-local'
    && transientAnalysis.rawContentStored === false
    && preference.evidenceStatus === 'NOT_ENOUGH_EVIDENCE'
    && crossTenantSentimentDenied
    && sentimentPermissionDenied
    && invalidation.status === 'INVALIDATED'
    && invalidatedPreference.status === 'NOT_ENOUGH_EVIDENCE'
  const phase6Pass = formulaDraft.math.valid
    && formulaValidation.math.valid
    && submittedFormula.status === 'IN_REVIEW'
    && approvedFormula.status === 'APPROVED'
    && reviewedBrief.status === 'REVIEWED'
    && materialUniverse.materialIds.includes(material.id)
    && candidate.status === 'ADVISORY'
    && brandCandidate.projection === 'SAFE_SHARE'
    && !('components' in brandCandidate)
    && savedCandidateDraft.status === 'DRAFT'
    && duplicateCandidateDraft.alreadySaved === true
    && concurrentCandidateDraftUnique
    && crossProjectCandidateDraftDenied
    && indexedEvidence.status === 'APPROVED'
    && retrievedEvidence.citations.length === 1
    && waitingAgentRun.status === 'WAITING_FOR_CONFIRMATION'
    && confirmedAgentRun.status === 'ACCEPTED'
    && duplicateAgentConfirmation.alreadyDecided === true
    && replayedAgentRun.run.status === 'SUCCEEDED'
    && replayedAgentRun.events.length >= 9
    && cancelledAgentRun.status === 'CANCELLED'
    && expiredAgentConfirmation.status === 'EXPIRED'
    && retriedAgentRun.status === 'QUEUED'
    && retriedCancelledAgentRun.status === 'CANCELLED'
    && inventoryMovementCountBeforeFormula === inventoryMovementCountAfterFormula
    && crossTenantFormulaDenied
    && crossTenantAgentDenied
    && crossTenantEvidence.citations.length === 0
  const phase7Pass = plannedTrial.status === 'PLANNED'
    && releasedTrial.status === 'READY'
    && releasedTrial.compliance.status === 'REVIEW_REQUIRED'
    && confirmedTrialPreparation.status === 'CONFIRMED'
    && duplicateTrialPreparation.status === 'CONFIRMED'
    && trialSample.status === 'AVAILABLE'
    && trialEvidence.status === 'ACTIVE'
    && publicPresentation.presentationMode === 'BLIND'
    && publicPresentation.title === 'Blind sensory sample'
    && publicPresentation.sampleCode === 'QA71'
    && publicEvaluation.final
    && panelEvaluation.final
    && unblinded.status === 'UNBLINDED'
    && trialDecision.status === 'CLOSED'
    && trialDecision.evidence.confidence === 'NOT_ENOUGH_EVIDENCE'
    && trialMemory[0]?.evidence.confidence === 'NOT_ENOUGH_EVIDENCE'
    && directTrialReversalDenied
    && trialReversal.integration?.status === 'REVERSED'
    && reversedTrialUsage[0]?.status === 'REVERSED'
    && Boolean(reversedTrialUsage[0]?.reversalMovementId)
    && !('formula' in panelTrialDetail.trial && panelTrialDetail.trial.formula !== undefined)
    && panelTrialDetail.usages.length === 0
    && panelTrialDetail.preparations.length === 0
    && panelTrialDetail.samples.length === 0
    && panelTrialDetail.evidence.length === 0
    && panelTrials.length === 1
    && panelTrials[0]?.id === trial.id
    && panelTrials[0]?.title === 'Assigned sensory evaluation'
    && panelUnassignedTrialDenied
    && crossTenantTrialDenied

  const p8StartedIntegration = p8StartedWeighing.production as { status?: string } | null
  const p8ConfirmedIntegration = p8ConfirmedWeighing.production as { status?: string } | null
  const p8AllocationIntegration = p8Allocations.production as { status?: string; reservationState?: string } | null
  const p8DuplicateCorrectionIntegration = duplicateP8Correction.production as { deviationId?: string; status?: string } | null
  const p8RestartIntegration = p8RestartWeighing.production as { status?: string } | null
  const p8RestartConfirmedIntegration = p8RestartConfirmation.production as { status?: string } | null
  const phase8Pass = p8Plan.status === 'PLANNED'
    && p8Specification.status === 'ACTIVE'
    && p8AllocationIntegration?.status === 'READY_FOR_WEIGHING'
    && p8AllocationIntegration?.reservationState === 'RESERVED'
    && directProductionWeighingDenied
    && p8StartedIntegration?.status === 'IN_PROGRESS'
    && p8ConfirmedIntegration?.status === 'CONFIRMED'
    && p8Yield.status === 'RECONCILED'
    && p8QcResult.status === 'PENDING'
    && p8QcApproval.status === 'PASSED'
    && p8Release.status === 'RELEASED'
    && duplicateP8Release.id === p8Release.id
    && p8Genealogy.rawMaterialUsages.length === 1
    && p8Genealogy.edges.some((edge) => edge.toEntityId === p8Release.finishedGoodLot.id)
    && p8Hold.status === 'HOLD'
    && p8Hold.heldQuantityGrams === 100
    && duplicateP8Hold.deviationId === p8Hold.deviationId
    && p8FinishedGoodReworkResolution.status === 'CLOSED'
    && p8FinishedGoodRework.status === 'PLANNED'
    && p8FinishedGoodReworkComplete.status === 'COMPLETED'
    && p8ReworkReleaseBlocked
    && p8ReworkYield.status === 'RECONCILED'
    && p8ReworkQcResult.revision === 2
    && p8ReworkQcApproval.status === 'PASSED'
    && p8ReRelease.status === 'RELEASED'
    && p8ReRelease.revision === p8Release.revision + 1
    && p8ReRelease.supersedesReleaseId === p8Release.id
    && p8FinishedGoods.some((lot) => lot.id === p8Release.finishedGoodLot.id && lot.status === 'REWORK')
    && p8FinishedGoods.some((lot) => lot.id === p8ReRelease.finishedGoodLot.id && lot.status === 'RELEASED')
    && finishedGoodGenealogyPermissionDenied
    && p8ClosedOrder.status === 'CLOSED'
    && p8Cancellation.status === 'CANCELLED'
    && p8CorrectionSpecification.status === 'ACTIVE'
    && directProductionReversalDenied
    && p8CorrectionIntegration?.status === 'REVERSED'
    && p8DuplicateCorrectionIntegration?.deviationId === p8CorrectionIntegration?.deviationId
    && p8CorrectionIdempotencyConflict
    && p8CorrectionResolution.status === 'CLOSED'
    && p8CorrectionResume.status === 'READY_FOR_WEIGHING'
    && p8RestartIntegration?.status === 'IN_PROGRESS'
    && p8RestartConfirmedIntegration?.status === 'CONFIRMED'
    && p8ReworkResolution.status === 'CLOSED'
    && p8Rework.status === 'PLANNED'
    && p8CompletedRework.status === 'COMPLETED'
    && legacyProductionPolicyBackfill
    && crossTenantProductionDenied
    && crossTenantFinishedGoodDenied

  const phase9DetailRun = phase9Detail.run as { status?: string; protocolVersion?: string; definitionKey?: string }
  const phase9FailedRetryRun = phase9FailedRetryDetail.run as { status?: string }
  const phase9RetriedRunProjection = phase9RetriedRunDetail.run as { status?: string }
  const phase9ProviderUsage = phase9Evidence.providerUsage as Array<{ usageStatus?: string; providerKey?: string }>
  const phase9RowsPresent = phase9TenantScopedTables.every((table) => phase9RowsInFirstTenant[table] > 0)
  const phase9CrossTenantRowsDenied = phase9TenantScopedTables.every((table) => phase9RowsVisibleFromSecondTenant[table] === 0)
  const phase9Pass = phase9Bootstrap.status === 'READY'
    && phase9BootstrapReplay.status === 'READY'
    && phase9SecondBootstrap.status === 'READY'
    && Number(phase9Configuration[0]?.publishedActiveConfigurations ?? 0) === 1
    && duplicatePhase9Run.id === phase9Run.id
    && phase9ToolExecution.status === 'RUNNING'
    && phase9ArtifactExecution.status === 'SUCCEEDED'
    && phase9DetailRun.status === 'SUCCEEDED'
    && phase9DetailRun.protocolVersion === 'agent-runtime/v1'
    && phase9DetailRun.definitionKey === 'inventory-assistant'
    && phase9Detail.toolCalls.length === 1
    && phase9Detail.artifacts.length >= 2
    && phase9Replay.events.length >= 6
    && phase9Replay.resyncRequired === false
    && phase9ProviderUsage.length === 1
    && phase9ProviderUsage[0]?.usageStatus === 'NOT_CONFIGURED'
    && duplicatePhase9Evaluation.id === phase9Evaluation.id
    && phase9Evaluation.status === 'PASSED'
    && phase9RejectedConfirmation.status === 'REJECTED'
    && duplicatePhase9RejectedConfirmation.alreadyDecided === true
    && phase9ExpiredConfirmation.status === 'EXPIRED'
    && phase9ApprovedConfirmation.status === 'ACCEPTED'
    && phase9ApprovedConfirmationDuplicate.alreadyDecided === true
    && phase9InvalidConfirmationCode === 'DESIGN_CANDIDATE_FORMULA_PROJECT_MISMATCH'
    && phase9InvalidConfirmationDetail.run.status === 'FAILED'
    && phase9InvalidQuotaReleased
    && phase9CandidateDraftCountBeforeConfirmation === phase9CandidateDraftCountAfterConfirmation
    && phase9CancelledBeforeApproval.status === 'CANCELLED'
    && phase9ConfirmAfterCancellation.status === 'CANCELLED'
    && phase9ConfirmAfterCancellation.alreadyDecided === true
    && phase9CancelledBeforeApprovalFinal.run.status === 'CANCELLED'
    && phase9DraftCountAfterCancelledApproval === phase9CandidateDraftCountAfterConfirmation
    && phase9CancelDuringApprovalCode === 'AGENT_CONFIRMATION_PROCESSING'
    && phase9ApproveAfterCancelAttempt.status === 'ACCEPTED'
    && phase9ApproveBlocksCancelFinal.run.status === 'SUCCEEDED'
    && phase9RecoveredLease.status === 'RUNNING'
    && phase9RecoveredLeaseCancelled.status === 'CANCELLED'
    && phase9ForcedFailureCode === 'RLS_FORCED_TOOL_FAILURE'
    && phase9FailedRetryRun.status === 'FAILED'
    && phase9FailedRetryNode?.status === 'FAILED'
    && phase9FailedRetryNode?.attempt === 1
    && phase9FailedRetryNode?.errorCode === 'RLS_FORCED_TOOL_FAILURE'
    && phase9RetriedRun.status === 'QUEUED'
    && phase9RetryToolExecution.status === 'RUNNING'
    && phase9RetryArtifactExecution.status === 'SUCCEEDED'
    && phase9RetriedRunProjection.status === 'SUCCEEDED'
    && phase9RetriedRunNode?.status === 'SUCCEEDED'
    && phase9RetriedRunNode?.attempt === 2
    && phase9Cancelled.status === 'CANCELLED'
    && phase9SafePayloads
    && phase9UnsafeMutatingToolRows.length === 0
    && phase9EventUpdateDenied
    && phase9EventDeleteDenied
    && phase9ArtifactUpdateDenied
    && phase9ArtifactDeleteDenied
    && phase6EventUpdateAllowed
    && phase6ArtifactUpdateAllowed
    && phase9CompletedProviderWithoutProvenanceDenied
    && phase9RecordedProviderWithoutProvenanceDenied
    && phase9NotConfiguredProviderWithoutProvenanceAllowed
    && phase9CrossRunNodeEvaluationDenied
    && inventoryMovementCountBeforeFormula === inventoryMovementCountAfterFormula
    && phase9RowsPresent
    && phase9CrossTenantRowsDenied
    && crossTenantPhase9RunDenied
    && crossTenantPhase9EvidenceDenied
    && crossTenantPhase9EvaluationDenied

  const brandCommerceLine = brandCommerceDetail.lines[0]
  const phase10Pass = commercePrice.status === 'ACTIVE'
    && commerceQuoteSent.status === 'SENT'
    && commerceQuoteAccepted.status === 'ACCEPTED'
    && commerceOrderConfirmed.status === 'CONFIRMED'
    && commerceAllocation.status === 'ALLOCATED'
    && commercePicking.status === 'PICKING'
    && commercePacked.status === 'PACKED'
    && commerceShipped.status === 'SHIPPED'
    && commerceDelivered.status === 'DELIVERED'
    && duplicateOpenFulfillmentDenied
    && commerceReturnAuthorized.status === 'AUTHORIZED'
    && commerceReturnPartiallyReceived.status === 'AUTHORIZED'
    && commercePartialDispositionDenied
    && commerceReturnReceived.status === 'INSPECTING'
    && commerceReturnReceipts.length === 2
    && commerceReturnReceiptQuantity === 10
    && commerceReturnReceipts.every((receipt) => receipt.disposition === 'QUARANTINE' && receipt.toBucket === 'QUARANTINE')
    && commerceReturnReceiptAppendOnlyDenied
    && commerceReturnQcDocument.status === 'ACTIVE'
    && commerceReturnDispositionResult.status === 'DISPOSITIONED'
    && commerceReturnDisposition?.disposition === 'RELEASE_TO_AVAILABLE'
    && commerceReturnDisposition?.movementType === 'QUALITY_RELEASE'
    && commerceReturnDisposition?.fromBucket === 'QUARANTINE'
    && commerceReturnDisposition?.toBucket === 'AVAILABLE'
    && commerceReturnDispositionAppendOnlyDenied
    && commerceReturnClosed.status === 'CLOSED'
    && commerceHeldReturnAuthorized.status === 'AUTHORIZED'
    && commerceHeldReturnReceived.status === 'INSPECTING'
    && commerceHoldDisposition.status === 'DISPOSITIONED'
    && commerceHoldLedgerCount === 0
    && commerceHeldReturnClosed.status === 'CLOSED'
    && commerceRejectedReturnAuthorized.status === 'AUTHORIZED'
    && commerceRejectedReturnReceived.status === 'INSPECTING'
    && commerceRejectDisposition.status === 'REJECTED'
    && commerceRejectDispositionRows.length === 1
    && commerceRejectDispositionRows[0]?.movementType === 'WASTE'
    && commerceRejectDispositionRows[0]?.fromBucket === 'QUARANTINE'
    && commerceRejectDispositionRows[0]?.toBucket === null
    && commerceRejectedReturnClosed.status === 'CLOSED'
    && commerceDocument.status === 'ACTIVE'
    && commerceDetail.order.status === 'FULFILLED'
    && commerceDetail.reservations.length === 1
    && commerceDetail.documents.length === 1
    && commerceDetail.traceability.length >= 4
    && brandCommerceDetail.reservations.length === 0
    && brandCommerceDetail.traceability.length === 0
    && !('formulaVersionId' in (brandCommerceLine?.productSnapshot ?? {}))
    && returnDocumentProjectionRedacted
    && returnDispositionDocumentPermissionDenied
    && concurrentCommerceSuccesses.length === 1
    && concurrentCommerceFailures.length === 1
    && commerceRawMovementCountBefore === commerceRawMovementCountAfter
    && concurrentCommerceCancellation?.status === 'CANCELLED'
    && crossTenantCommerceDenied
    && commerceRowsVisibleFromSecondTenant === 0

  const phase11RowsPresent = phase11TenantScopedTables.every((table) => phase11RowsInFirstTenant[table] > 0)
  const phase11CrossTenantRowsDenied = phase11TenantScopedTables.every((table) => phase11RowsVisibleFromSecondTenant[table] === 0)
  const phase11Pass = optimizerRun.status === 'COMPLETED'
    && duplicateOptimizerRun.id === optimizerRun.id
    && optimizerCandidate.status === 'ADVISORY'
    && Array.isArray(optimizerCandidate.componentProposal)
    && optimizerCandidate.componentProposal.every((component) => component.materialId !== material.id)
    && phase11DraftCountAfterRun === phase11DraftCountBeforeRun
    && optimizerProjectMismatchDenied
    && optimizerReview.status === 'SAVED_AS_DRAFT'
    && duplicateOptimizerReview.reviewId === optimizerReview.reviewId
    && phase11DraftCountAfterReview === phase11DraftCountBeforeRun + 1
    && phase11DryRunImport.id !== phase11ConfirmedImport.id
    && phase11MappedImport.id !== phase11DryRunImport.id
    && phase11DryRunCommitDenied
    && phase11CommittedImport.job.status === 'COMMITTED'
    && phase11CommittedImport.rows.every((row) => row.status === 'COMMITTED')
    && phase11RenewedImport.id === phase11ExpiringImport.id
    && phase11RenewalCommitted.job.status === 'COMMITTED'
    && phase11LargeCommitted.job.status === 'COMMITTED'
    && phase11LargeCommitted.job.committedRowCount === 201
    && phase11DuplicateDetail.rows.length === 1
    && phase11DuplicateDetail.rows[0]?.status === 'DUPLICATE'
    && phase11SpreadsheetInjectionDenied
    && phase11UnknownMappingDenied
    && phase11LocalDataOps.status === 'SUCCEEDED'
    && phase11VexoDataOps.status === 'NOT_CONFIGURED'
    && phase11BulkInvalidConfirmationDenied
    && phase11BulkMaterial?.status === 'ACTIVE'
    && legacyAdvancedPolicyBackfill
    && phase11RowsPresent
    && phase11CrossTenantRowsDenied
    && crossTenantOptimizerDenied
    && crossTenantImportDenied
    && crossTenantBulkDenied

  if (!crossTenantDenied || !platformTransitionPass || unscopedMemberships !== 0 || firstTenantMemberships !== 3 || secondTenantVisibleFromFirstContext !== 0 || !phase2Pass || !phase3Pass || !phase4Pass || !phase5bPass || !phase6Pass || !phase7Pass || !phase8Pass || !phase9Pass || !phase10Pass || !phase11Pass) {
    throw new Error(`V2_RLS=FAIL unexpected isolation result: ${JSON.stringify({
      crossTenantDenied,
      platformTransition,
      platformTransitionPass,
      unscopedMemberships,
      firstTenantMemberships,
      secondTenantVisibleFromFirstContext,
      phase2Pass,
      phase3Pass,
      phase4Pass,
      phase5bPass,
      phase6Pass,
      phase7Pass,
      phase8Pass,
      phase9Pass,
      phase10Pass,
      phase11Pass,
      phase11Diagnostic: {
        optimizer: { run: optimizerRun, duplicate: duplicateOptimizerRun.id === optimizerRun.id, candidate: optimizerCandidate, draftCounts: { before: phase11DraftCountBeforeRun, afterRun: phase11DraftCountAfterRun, afterReview: phase11DraftCountAfterReview }, projectMismatchDenied: optimizerProjectMismatchDenied, review: optimizerReview, duplicateReview: duplicateOptimizerReview },
        imports: { dry: phase11DryRunImport, mapped: phase11MappedImport, confirmed: phase11ConfirmedImport, dryCommitDenied: phase11DryRunCommitDenied, committed: phase11CommittedImport.job.status, renewal: { before: phase11ExpiringImport, after: phase11RenewedImport, committed: phase11RenewalCommitted.job.status }, large: { status: phase11LargeCommitted.job.status, committedRows: phase11LargeCommitted.job.committedRowCount }, duplicateRows: phase11DuplicateDetail.rows, injectionDenied: phase11SpreadsheetInjectionDenied, unknownMappingDenied: phase11UnknownMappingDenied },
        dataOps: { local: phase11LocalDataOps, vexo: phase11VexoDataOps },
        bulk: { preview: phase11BulkPreview, invalidConfirmationDenied: phase11BulkInvalidConfirmationDenied, material: phase11BulkMaterial },
        legacyAdvancedPolicyBackfill,
        rows: { first: phase11RowsInFirstTenant, second: phase11RowsVisibleFromSecondTenant },
        crossTenant: { optimizer: crossTenantOptimizerDenied, import: crossTenantImportDenied, bulk: crossTenantBulkDenied },
      },
      phase8Diagnostic: {
        plan: p8Plan.status,
        allocation: p8AllocationIntegration?.status,
        allocationReservationState: p8AllocationIntegration?.reservationState,
        directProductionWeighingDenied,
        started: p8StartedIntegration?.status,
        confirmed: p8ConfirmedIntegration?.status,
        yield: p8Yield.status,
        qcResult: p8QcResult.status,
        qcApproval: p8QcApproval.status,
        release: { status: p8Release.status, revision: p8Release.revision },
        duplicateRelease: duplicateP8Release.id === p8Release.id,
        genealogyUsageCount: p8Genealogy.rawMaterialUsages.length,
        genealogyHasFinishedGood: p8Genealogy.edges.some((edge) => edge.toEntityId === p8Release.finishedGoodLot.id),
        hold: { status: p8Hold.status, grams: p8Hold.heldQuantityGrams, duplicate: duplicateP8Hold.deviationId === p8Hold.deviationId },
        finishedGoodRework: { resolution: p8FinishedGoodReworkResolution.status, started: p8FinishedGoodRework.status, complete: p8FinishedGoodReworkComplete.status },
        reworkReleaseBlocked: p8ReworkReleaseBlocked,
        reworkYield: p8ReworkYield.status,
        reworkQc: { revision: p8ReworkQcResult.revision, approval: p8ReworkQcApproval.status },
        rerelease: { status: p8ReRelease.status, revision: p8ReRelease.revision, supersedes: p8ReRelease.supersedesReleaseId === p8Release.id },
        finishedGoodStatuses: p8FinishedGoods.map((lot) => ({ id: lot.id, status: lot.status })),
        genealogyPermissionDenied: finishedGoodGenealogyPermissionDenied,
        close: p8ClosedOrder.status,
        cancellation: p8Cancellation.status,
        correction: { specification: p8CorrectionSpecification.status, directDenied: directProductionReversalDenied, status: p8CorrectionIntegration?.status, duplicate: p8DuplicateCorrectionIntegration?.deviationId === p8CorrectionIntegration?.deviationId, conflict: p8CorrectionIdempotencyConflict, resolution: p8CorrectionResolution.status, resume: p8CorrectionResume.status, restart: p8RestartIntegration?.status, restartConfirm: p8RestartConfirmedIntegration?.status },
        inProcessRework: { resolution: p8ReworkResolution.status, started: p8Rework.status, complete: p8CompletedRework.status },
        legacyProductionPolicyBackfill,
        crossTenantProductionDenied,
        crossTenantFinishedGoodDenied,
      },
      phase2Diagnostic: {
        accepted: accepted.lotStatus,
        reservedProjection,
        shipment: shipment.status,
        transfer: transfer.location,
        fefo: fefo[0]?.allocatedGrams,
        projection,
      },
      crossTenantFormulaDenied,
      crossTenantAgentDenied,
      crossTenantTrialDenied,
      crossTenantProductionDenied,
      crossTenantFinishedGoodDenied,
      phase9Diagnostic: {
        bootstrap: { first: phase9Bootstrap.status, replay: phase9BootstrapReplay.status, second: phase9SecondBootstrap.status },
        publishedActiveConfigurations: Number(phase9Configuration[0]?.publishedActiveConfigurations ?? 0),
        run: { started: phase9Run.status, duplicate: duplicatePhase9Run.id === phase9Run.id, tool: phase9ToolExecution.status, artifact: phase9ArtifactExecution.status, detail: phase9DetailRun, replayCount: phase9Replay.events.length, replayResyncRequired: phase9Replay.resyncRequired },
        providerUsage: phase9ProviderUsage,
        evaluation: { status: phase9Evaluation.status, duplicate: duplicatePhase9Evaluation.id === phase9Evaluation.id },
        confirmation: { rejected: phase9RejectedConfirmation.status, duplicateRejected: duplicatePhase9RejectedConfirmation.alreadyDecided, expired: phase9ExpiredConfirmation.status, approved: phase9ApprovedConfirmation.status, duplicateApproved: phase9ApprovedConfirmationDuplicate.alreadyDecided, invalidCode: phase9InvalidConfirmationCode, invalidRun: phase9InvalidConfirmationDetail.run.status, invalidQuotaReleased: phase9InvalidQuotaReleased, candidateDraftsChanged: phase9CandidateDraftCountBeforeConfirmation !== phase9CandidateDraftCountAfterConfirmation, cancellationRace: { cancelFirst: phase9CancelledBeforeApproval.status, confirmAfterCancel: phase9ConfirmAfterCancellation.status, cancelFirstRun: phase9CancelledBeforeApprovalFinal.run.status, cancelledDraftsChanged: phase9DraftCountAfterCancelledApproval !== phase9CandidateDraftCountAfterConfirmation, cancelDuringApproval: phase9CancelDuringApprovalCode, approveAfterCancelAttempt: phase9ApproveAfterCancelAttempt.status, approveFirstRun: phase9ApproveBlocksCancelFinal.run.status } },
        recovery: { reclaimedLease: phase9RecoveredLease.status, reclaimedLeaseCancelled: phase9RecoveredLeaseCancelled.status, forcedFailure: { code: phase9ForcedFailureCode, run: phase9FailedRetryRun.status, node: phase9FailedRetryNode }, retry: { queued: phase9RetriedRun.status, tool: phase9RetryToolExecution.status, artifact: phase9RetryArtifactExecution.status, run: phase9RetriedRunProjection.status, node: phase9RetriedRunNode }, cancel: phase9Cancelled.status },
        safePayloads: phase9SafePayloads,
        unsafeMutatingTools: phase9UnsafeMutatingToolRows,
        persistenceGuards: {
          p9Event: { updateDenied: phase9EventUpdateDenied, deleteDenied: phase9EventDeleteDenied },
          p9Artifact: { updateDenied: phase9ArtifactUpdateDenied, deleteDenied: phase9ArtifactDeleteDenied },
          phase6EvidenceUpdateAllowed: phase6EventUpdateAllowed && phase6ArtifactUpdateAllowed,
          provider: { completedWithoutProvenanceDenied: phase9CompletedProviderWithoutProvenanceDenied, recordedWithoutProvenanceDenied: phase9RecordedProviderWithoutProvenanceDenied, notConfiguredWithoutProvenanceAllowed: phase9NotConfiguredProviderWithoutProvenanceAllowed },
          crossRunNodeEvaluationDenied: phase9CrossRunNodeEvaluationDenied,
        },
        rowsInFirstTenant: phase9RowsInFirstTenant,
        rowsVisibleFromSecondTenant: phase9RowsVisibleFromSecondTenant,
        crossTenant: { run: crossTenantPhase9RunDenied, evidence: crossTenantPhase9EvidenceDenied, evaluation: crossTenantPhase9EvaluationDenied },
      },
      phase10Diagnostic: {
        quote: { sent: commerceQuoteSent.status, accepted: commerceQuoteAccepted.status },
        order: { confirmed: commerceOrderConfirmed.status, allocated: commerceAllocation.status, detail: commerceDetail.order.status },
        fulfillment: { picking: commercePicking.status, packed: commercePacked.status, shipped: commerceShipped.status, delivered: commerceDelivered.status, duplicateOpenDenied: duplicateOpenFulfillmentDenied },
        return: {
          authorized: commerceReturnAuthorized.status,
          partiallyReceived: commerceReturnPartiallyReceived.status,
          received: commerceReturnReceived.status,
          receipt: { count: commerceReturnReceipts.length, quantity: commerceReturnReceiptQuantity, allQuarantined: commerceReturnReceipts.every((receipt) => receipt.disposition === 'QUARANTINE' && receipt.toBucket === 'QUARANTINE'), appendOnly: commerceReturnReceiptAppendOnlyDenied },
          disposition: { status: commerceReturnDispositionResult.status, action: commerceReturnDisposition?.disposition ?? null, movement: commerceReturnDisposition?.movementType ?? null, appendOnly: commerceReturnDispositionAppendOnlyDenied },
          closed: commerceReturnClosed.status,
          hold: { received: commerceHeldReturnReceived.status, disposition: commerceHoldDisposition.status, dispositionLedgerCount: commerceHoldLedgerCount, closed: commerceHeldReturnClosed.status },
          reject: { received: commerceRejectedReturnReceived.status, disposition: commerceRejectDisposition.status, movement: commerceRejectDispositionRows[0]?.movementType ?? null, closed: commerceRejectedReturnClosed.status },
        },
        document: commerceDocument.status,
        brandRedaction: { reservations: brandCommerceDetail.reservations.length, traceability: brandCommerceDetail.traceability.length, hasFormulaReference: 'formulaVersionId' in (brandCommerceLine?.productSnapshot ?? {}) },
        returnDocumentProjectionRedacted,
        returnDispositionDocumentPermissionDenied,
        concurrentAllocation: { successCount: concurrentCommerceSuccesses.length, failureCount: concurrentCommerceFailures.length, winnerCancelled: concurrentCommerceCancellation?.status ?? null },
        rawInventoryMovementChanged: commerceRawMovementCountBefore !== commerceRawMovementCountAfter,
        crossTenantCommerceDenied,
        crossTenantRows: commerceRowsVisibleFromSecondTenant,
      },
      crossTenantEvidenceCount: crossTenantEvidence.citations.length,
    })}`)
  }

  console.log(JSON.stringify({
    applicationRole: 'v2_app',
    roleBypassesRls: false,
    signup: result.membership.role,
    login: login.membership.role,
    organizationId: context.context.organizationId,
    crossTenantDenied,
    unscopedMemberships,
    firstTenantMemberships,
    secondTenantVisibleFromFirstContext,
    phase2: {
      duplicateMaterial: duplicateMaterial.id === material.id,
      quarantineRejected,
      accepted: accepted.lotStatus,
      materialDocument: materialDocument.status,
      supplierDocument: supplierDocument.status,
      priceRevision: Boolean(priceRevision.priceHistoryId),
      concurrentInspectionDenied,
      purchaseRequest: purchaseRequest.id,
      purchaseOrder: purchaseOrder.id,
      shipment: shipment.id,
      transfer: transfer.location,
      fefoAllocated: fefo[0]?.allocatedGrams,
      weighing: confirmed.status,
      reversal: reversal.reversalOfId,
      reservationCount: reservation.reservations.length,
      reservationAvailable: reservedProjection?.availableGrams,
      reservedConsumption: reservedConfirmation.status,
      released: release.status,
      reservedCorrection: reservedCorrection.reversalOfId,
      unsafeReversalDenied,
      waste: waste.movementType,
      landedAllocationCount: landed.allocations.length,
      concurrentLandedCostDenied,
      projection,
      returned: { lotStatus: returned.lotStatus, projection: returnedProjection },
      held: held.lotStatus,
      resolvedReview: resolvedReview.lotStatus,
      blockedComplianceDenied,
      secondTenantMaterials: secondMaterials.length,
      secondOffers: secondOffers.length,
      crossTenantLotDenied,
      crossTenantReceiptDenied,
      crossTenantShipmentDenied,
      crossTenantWeighingDenied,
      crossTenantSupplierDenied,
      permissionDenied,
    },
    phase3: {
      structure: structureJob.status,
      duplicateStructure: duplicateStructureJob.id === structureJob.id,
      featureJob: featureJob.status,
      artifacts: scienceArtifacts.map((artifact) => `${artifact.artifactKind}:${artifact.evidenceStatus}`),
      crossTenantScientificDenied,
      scientificPermissionDenied,
    },
    phase4: {
      duplicateDataset: duplicateDataset.id === dataset.id,
      approvedDatasetVersion: approvedDatasetVersion.status,
      trainingRun: trainingRun.status,
      evaluation: evaluation.leakageStatus,
      modelRuntime: modelRuntime.status,
      crossTenantDatasetDenied,
      crossTenantModelDenied,
      compositeCrossTenantDatasetDenied,
      modelRegistryPermissionDenied,
    },
    phase5: {
      molecularEmbedding: molecularEmbedding.status,
      molecularSimilarity: molecularSimilarity.status,
      odorPrediction: odorPrediction.status,
      explainability: explainability.status,
      crossTenantEmbeddingDenied,
    },
    phase5b: {
      sentimentAnalysis: sentimentAnalysis.evidenceStatus,
      transientAnalysis: transientAnalysis.evidenceStatus,
      preference: preference.evidenceStatus,
      crossTenantSentimentDenied,
      sentimentPermissionDenied,
      invalidation: invalidation.status,
      invalidatedPreference: invalidatedPreference.status,
    },
    phase6: {
      formulaDraft: formulaDraft.status,
      formulaValidation: formulaValidation.math.valid,
      approvedFormula: approvedFormula.status,
      reviewedBrief: reviewedBrief.status,
      materialUniverseCount: materialUniverse.materialIds.length,
      candidate: candidate.status,
      brandProjection: brandCandidate.projection,
      savedCandidateDraft: savedCandidateDraft.status,
      duplicateCandidateDraft: duplicateCandidateDraft.alreadySaved,
      evidenceCitationCount: retrievedEvidence.citations.length,
      agent: replayedAgentRun.run.status,
      replayedEventCount: replayedAgentRun.events.length,
      agentConfirmation: confirmedAgentRun.status,
      cancelledAgent: cancelledAgentRun.status,
      expiredAgentConfirmation: expiredAgentConfirmation.status,
      retriedAgent: retriedAgentRun.status,
      inventoryMovementsChanged: inventoryMovementCountBeforeFormula !== inventoryMovementCountAfterFormula,
      crossTenantFormulaDenied,
      crossTenantAgentDenied,
      crossTenantEvidenceCount: crossTenantEvidence.citations.length,
      trustedHostnameResolver: trustedHostnameResolution[0]?.organizationId === firstOrganizationId && unknownHostnameResolution.length === 0,
    },
    phase7: {
      trial: trial.id,
      released: releasedTrial.compliance.status,
      preparation: confirmedTrialPreparation.status,
      duplicatePreparation: duplicateTrialPreparation.status,
      recoveredPreparationLines: trialPreparationDetail.lines.length,
      sample: trialSample.status,
      secondSample: secondTrialSample.status,
      publicPresentation: publicPresentation.sampleCode,
      publicEvaluation: publicEvaluation.final,
      publicLinkRevoked: revokedPublicLinkDenied,
      panelEvaluation: panelEvaluation.final,
      panelAssignmentScope: panelTrials.length === 1 && panelUnassignedTrialDenied,
      decision: trialDecision.decision,
      memoryConfidence: trialDecision.evidence.confidence,
      reversal: reversedTrialUsage[0]?.status,
      directReversalDenied: directTrialReversalDenied,
      managedPanelistCount: managedPanelists.length,
      managedPublicLinkCount: managedPublicLinks.length,
      brandTrialDetailDenied,
      crossTenantTrialDenied,
    },
    phase8: {
      order: p8Order.id,
      planned: p8Plan.status,
      allocation: p8Allocations.status,
      directProductionWeighingDenied,
      weighing: p8ConfirmedIntegration?.status,
      yield: p8Yield.status,
      qc: p8QcApproval.status,
      release: p8Release.status,
      duplicateRelease: duplicateP8Release.id === p8Release.id,
      finishedGoodLot: p8Release.finishedGoodLot.id,
      genealogyUsageCount: p8Genealogy.rawMaterialUsages.length,
      closed: p8ClosedOrder.status,
      cancelled: p8Cancellation.status,
      directProductionReversalDenied,
      correction: p8CorrectionIntegration?.status,
      correctionConflict: p8CorrectionIdempotencyConflict,
      correctionResume: p8CorrectionResume.status,
      rework: p8CompletedRework.status,
      crossTenantProductionDenied,
      crossTenantFinishedGoodDenied,
      finishedGoodGenealogyPermissionDenied,
    },
    phase9: {
      bootstrap: { first: phase9Bootstrap.status, replay: phase9BootstrapReplay.status, second: phase9SecondBootstrap.status },
      publishedActiveConfigurations: Number(phase9Configuration[0]?.publishedActiveConfigurations ?? 0),
      run: { id: phase9Run.id, duplicate: duplicatePhase9Run.id === phase9Run.id, tool: phase9ToolExecution.status, artifact: phase9ArtifactExecution.status, detail: phase9DetailRun.status, replayedEvents: phase9Replay.events.length },
      providerUsage: phase9ProviderUsage,
      evaluation: { status: phase9Evaluation.status, duplicate: duplicatePhase9Evaluation.id === phase9Evaluation.id },
      confirmation: { rejected: phase9RejectedConfirmation.status, duplicateRejected: duplicatePhase9RejectedConfirmation.alreadyDecided, expired: phase9ExpiredConfirmation.status, approved: phase9ApprovedConfirmation.status, duplicateApproved: phase9ApprovedConfirmationDuplicate.alreadyDecided, invalidCode: phase9InvalidConfirmationCode, invalidRun: phase9InvalidConfirmationDetail.run.status, invalidQuotaReleased: phase9InvalidQuotaReleased, candidateDraftsChanged: phase9CandidateDraftCountBeforeConfirmation !== phase9CandidateDraftCountAfterConfirmation, cancellationRace: { cancelFirst: phase9CancelledBeforeApproval.status, confirmAfterCancel: phase9ConfirmAfterCancellation.status, cancelFirstRun: phase9CancelledBeforeApprovalFinal.run.status, cancelledDraftsChanged: phase9DraftCountAfterCancelledApproval !== phase9CandidateDraftCountAfterConfirmation, cancelDuringApproval: phase9CancelDuringApprovalCode, approveAfterCancelAttempt: phase9ApproveAfterCancelAttempt.status, approveFirstRun: phase9ApproveBlocksCancelFinal.run.status } },
      recovery: { reclaimedLease: phase9RecoveredLease.status, forcedFailure: { code: phase9ForcedFailureCode, node: phase9FailedRetryNode }, retry: { queued: phase9RetriedRun.status, final: phase9RetriedRunProjection.status, node: phase9RetriedRunNode }, cancelled: phase9Cancelled.status },
      safePayloads: phase9SafePayloads,
      unsafeMutatingTools: phase9UnsafeMutatingToolRows,
      persistenceGuards: {
        p9Event: { updateDenied: phase9EventUpdateDenied, deleteDenied: phase9EventDeleteDenied },
        p9Artifact: { updateDenied: phase9ArtifactUpdateDenied, deleteDenied: phase9ArtifactDeleteDenied },
        phase6EvidenceUpdateAllowed: phase6EventUpdateAllowed && phase6ArtifactUpdateAllowed,
        provider: { completedWithoutProvenanceDenied: phase9CompletedProviderWithoutProvenanceDenied, recordedWithoutProvenanceDenied: phase9RecordedProviderWithoutProvenanceDenied, notConfiguredWithoutProvenanceAllowed: phase9NotConfiguredProviderWithoutProvenanceAllowed },
        crossRunNodeEvaluationDenied: phase9CrossRunNodeEvaluationDenied,
      },
      inventoryMovementsChanged: inventoryMovementCountBeforeFormula !== inventoryMovementCountAfterFormula,
      rowsInFirstTenant: phase9RowsInFirstTenant,
      rowsVisibleFromSecondTenant: phase9RowsVisibleFromSecondTenant,
      crossTenant: { run: crossTenantPhase9RunDenied, evidence: crossTenantPhase9EvidenceDenied, evaluation: crossTenantPhase9EvaluationDenied },
    },
    phase10: {
      customer: commerceCustomer.id,
      product: commerceProduct.id,
      price: commercePrice.status,
      quote: { sent: commerceQuoteSent.status, accepted: commerceQuoteAccepted.status },
      order: { id: commerceOrder.id, confirmed: commerceOrderConfirmed.status, allocated: commerceAllocation.status, status: commerceDetail.order.status },
      fulfillment: { picking: commercePicking.status, packed: commercePacked.status, shipped: commerceShipped.status, delivered: commerceDelivered.status, duplicateOpenDenied: duplicateOpenFulfillmentDenied },
      return: {
        requested: commerceReturn.status,
        authorized: commerceReturnAuthorized.status,
        partiallyReceived: commerceReturnPartiallyReceived.status,
        received: commerceReturnReceived.status,
        receipt: { count: commerceReturnReceipts.length, quantity: commerceReturnReceiptQuantity, allQuarantined: commerceReturnReceipts.every((receipt) => receipt.disposition === 'QUARANTINE' && receipt.toBucket === 'QUARANTINE'), appendOnly: commerceReturnReceiptAppendOnlyDenied },
        disposition: { status: commerceReturnDispositionResult.status, action: commerceReturnDisposition?.disposition ?? null, movement: commerceReturnDisposition?.movementType ?? null, appendOnly: commerceReturnDispositionAppendOnlyDenied },
        closed: commerceReturnClosed.status,
        hold: { received: commerceHeldReturnReceived.status, disposition: commerceHoldDisposition.status, dispositionLedgerCount: commerceHoldLedgerCount, closed: commerceHeldReturnClosed.status },
        reject: { received: commerceRejectedReturnReceived.status, disposition: commerceRejectDisposition.status, movement: commerceRejectDispositionRows[0]?.movementType ?? null, closed: commerceRejectedReturnClosed.status },
      },
      document: commerceDocument.status,
      brandRedaction: { reservations: brandCommerceDetail.reservations.length, traceability: brandCommerceDetail.traceability.length, formulaReferenceRedacted: !('formulaVersionId' in (brandCommerceLine?.productSnapshot ?? {})) },
      returnDocumentProjectionRedacted,
      returnDispositionDocumentPermissionDenied,
      concurrentAllocation: { successCount: concurrentCommerceSuccesses.length, failureCount: concurrentCommerceFailures.length, winnerCancelled: concurrentCommerceCancellation?.status ?? null },
      rawInventoryMovementsChanged: commerceRawMovementCountBefore !== commerceRawMovementCountAfter,
      crossTenantCommerceDenied,
      crossTenantRows: commerceRowsVisibleFromSecondTenant,
    },
    phase11: {
      optimizer: {
        run: optimizerRun.status,
        advisory: optimizerCandidate.status,
        duplicateRun: duplicateOptimizerRun.id === optimizerRun.id,
        projectMismatchDenied: optimizerProjectMismatchDenied,
        formulaDraftCreatedOnlyAfterReview: phase11DraftCountAfterRun === phase11DraftCountBeforeRun && phase11DraftCountAfterReview === phase11DraftCountBeforeRun + 1,
      },
      imports: {
        dryRunDistinct: phase11DryRunImport.id !== phase11ConfirmedImport.id,
        mappingSnapshotDistinct: phase11MappedImport.id !== phase11DryRunImport.id,
        dryRunCommitDenied: phase11DryRunCommitDenied,
        committed: phase11CommittedImport.job.status,
        confirmationRenewed: phase11RenewedImport.id === phase11ExpiringImport.id && phase11RenewalCommitted.job.status === 'COMMITTED',
        largeCreateOnlyCommittedRows: phase11LargeCommitted.job.committedRowCount,
        createOnlyDuplicate: phase11DuplicateDetail.rows[0]?.status,
        formulaInjectionDenied: phase11SpreadsheetInjectionDenied,
        unknownMappingDenied: phase11UnknownMappingDenied,
      },
      dataOps: { local: phase11LocalDataOps.status, vexo: phase11VexoDataOps.status },
      bulk: { invalidConfirmationDenied: phase11BulkInvalidConfirmationDenied, targetStatus: phase11BulkMaterial?.status },
      legacyPolicyBackfill: legacyAdvancedPolicyBackfill,
      rowsInFirstTenant: phase11RowsInFirstTenant,
      rowsVisibleFromSecondTenant: phase11RowsVisibleFromSecondTenant,
      crossTenant: { optimizer: crossTenantOptimizerDenied, import: crossTenantImportDenied, bulk: crossTenantBulkDenied },
    },
  }))
} finally {
  await appClient?.$disconnect()
  await adminClient?.$disconnect()
  // The verifier is gated to a loopback test database and starts from zero.
  // Resetting the schema after connections close is safer than attempting to
  // delete an interdependent audit graph inside one transaction.
  resetDisposableSchema()
}
