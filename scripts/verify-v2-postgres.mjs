import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const schema = 'infra/postgres/prisma/schema.prisma'
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
const localTestDatabaseUrl = 'postgresql://olfactoryops:olfactoryops@127.0.0.1:5432/olfactoryops'
const prismaCli = path.resolve('node_modules/prisma/build/index.js')

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  return JSON.stringify(value)
}

function componentHash(component) {
  return createHash('sha256').update(stableJson(component)).digest('hex')
}

function isLoopbackDatabase(url) {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

if (!existsSync(schema) || migrations.some((migration) => !existsSync(migration))) {
  console.error('V2_POSTGRES=FAIL missing schema or migration')
  process.exit(1)
}

const configuredUrl = process.env.V2_QA_DATABASE_URL || process.env.V2_DATABASE_URL || process.env.DATABASE_URL
const databaseUrl = configuredUrl || (process.env.V2_QA_ENVIRONMENT === 'test' ? localTestDatabaseUrl : undefined)
if (databaseUrl && !isLoopbackDatabase(databaseUrl) && process.env.V2_QA_ENVIRONMENT === 'test') {
  console.error('V2_POSTGRES=FAIL refusing a non-loopback database in test mode')
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL: databaseUrl || localTestDatabaseUrl }
try {
  execFileSync(process.execPath, [prismaCli, 'validate', '--schema', schema], { stdio: 'inherit', env })
} catch {
  console.error('V2_POSTGRES=FAIL prisma schema validation')
  process.exit(1)
}

if (!databaseUrl) {
  console.log('V2_POSTGRES=NOT_CONFIGURED no database URL supplied; schema-only verification completed')
  process.exit(process.env.V2_REQUIRE_DATABASE === 'true' ? 2 : 0)
}

try {
  for (const migration of migrations) execFileSync(process.execPath, [prismaCli, 'db', 'execute', '--schema', schema, '--file', migration], { stdio: 'inherit', env })
  const pins = JSON.parse(readFileSync('services/scientific/runtime/component-pins.json', 'utf8')).components
  const modelPins = JSON.parse(readFileSync('services/scientific/runtime/model-component-pins.json', 'utf8')).components
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    const rows = await client.$queryRawUnsafe('SELECT component_key, repository, license, upstream_ref, upstream_commit, adapter_version, runtime_version, patch_status, compatibility_test, manifest_hash FROM v2_scientific_component_pins')
    if (rows.length !== Object.keys(pins).length) throw new Error('Scientific component registry row count mismatch')
    for (const row of rows) {
      const pin = pins[row.component_key]
      if (!pin || row.repository !== pin.repository || row.license !== pin.license || row.upstream_ref !== pin.upstreamRef || row.upstream_commit !== pin.upstreamCommit || row.adapter_version !== pin.adapterVersion || row.runtime_version !== pin.runtimeVersion || row.patch_status !== pin.patchStatus || row.compatibility_test !== pin.compatibilityTest || row.manifest_hash !== componentHash(pin)) {
        throw new Error(`Scientific component registry diverged for ${row.component_key}`)
      }
    }
    const modelRows = await client.$queryRawUnsafe('SELECT component_key, repository, license, license_evidence_status, upstream_ref, upstream_commit, adapter_version, patch_status, compatibility_test, manifest_hash FROM v2_model_component_pins')
    if (modelRows.length !== Object.keys(modelPins).length) throw new Error('Model component registry row count mismatch')
    for (const row of modelRows) {
      const pin = modelPins[row.component_key]
      if (!pin || row.repository !== pin.repository || row.license !== pin.license || row.license_evidence_status !== pin.licenseEvidenceStatus || row.upstream_ref !== pin.upstreamRef || row.upstream_commit !== pin.upstreamCommit || row.adapter_version !== pin.adapterVersion || row.patch_status !== pin.patchStatus || row.compatibility_test !== pin.compatibilityTest || row.manifest_hash !== componentHash(pin)) {
        throw new Error(`Model component registry diverged for ${row.component_key}`)
      }
    }
    const phase7Tables = [
      'v2_trials', 'v2_trial_versions', 'v2_trial_releases', 'v2_trial_preparations', 'v2_trial_usage_links', 'v2_trial_material_usages', 'v2_trial_samples', 'v2_trial_evidence',
  'v2_sensory_form_versions', 'v2_sensory_sessions', 'v2_sensory_panel_assignments', 'v2_sensory_sample_assignments', 'v2_sensory_public_links', 'v2_sensory_evaluations', 'v2_sensory_public_submission_requests', 'v2_trial_decisions',
      'v2_private_sensory_memories', 'v2_private_sensory_memory_versions', 'v2_private_sensory_memory_sources', 'v2_sensory_memory_jobs',
    ]
    const phase7Rls = await client.$queryRawUnsafe(`
      SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, phase7Tables)
    if (phase7Rls.length !== phase7Tables.length || phase7Rls.some((row) => !row.rls_enabled || !row.rls_forced)) {
      throw new Error('Phase 7 table or forced RLS policy is missing')
    }
    const resolver = await client.$queryRawUnsafe(`
      SELECT p.prosecdef AS security_definer
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'v2_resolve_sensory_public_link'
        AND pg_get_function_identity_arguments(p.oid) = 'p_token_hash text'
    `)
    if (resolver.length !== 1 || !resolver[0].security_definer) {
      throw new Error('Phase 7 public sensory link resolver is missing or not SECURITY DEFINER')
    }
    const hostnameResolver = await client.$queryRawUnsafe(`
      SELECT p.prosecdef AS security_definer
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'v2_resolve_active_workspace_hostname'
        AND pg_get_function_identity_arguments(p.oid) = 'p_hostname text'
    `)
    if (hostnameResolver.length !== 1 || !hostnameResolver[0].security_definer) {
      throw new Error('Trusted active workspace hostname resolver is missing or not SECURITY DEFINER')
    }
    const phase8Tables = [
      'v2_production_orders', 'v2_production_formula_snapshots', 'v2_production_material_requirements',
      'v2_production_allocations', 'v2_production_weighing_sessions', 'v2_production_material_usages',
      'v2_production_process_steps', 'v2_production_qc_specifications', 'v2_production_qc_results',
      'v2_production_deviations', 'v2_production_capa_actions', 'v2_production_yield_records',
      'v2_production_rework_records', 'v2_production_releases', 'v2_finished_good_lots',
      'v2_finished_good_ledger_entries', 'v2_production_genealogy_edges', 'v2_production_document_snapshots',
      'v2_production_deviation_evidence',
    ]
    const cloudRuntimeTables = ['v2_cloud_job_dispatches', 'v2_cloud_job_events']
    const cloudRuntimeRls = await client.$queryRawUnsafe(`
      SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, cloudRuntimeTables)
    if (cloudRuntimeRls.length !== cloudRuntimeTables.length || cloudRuntimeRls.some((row) => !row.rls_enabled || !row.rls_forced)) {
      throw new Error('Cloud runtime dispatch tables or forced RLS policy is missing')
    }
    const cloudRuntimeTrigger = await client.$queryRawUnsafe(`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'v2_cloud_job_events'::regclass AND tgname = 'v2_cloud_job_events_append_only_trigger' AND NOT tgisinternal
    `)
    if (cloudRuntimeTrigger.length !== 1) throw new Error('Cloud runtime job event append-only trigger is missing')
    const cloudScientificInput = await client.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'v2_scientific_jobs' AND column_name = 'cloud_input'
    `)
    if (cloudScientificInput.length !== 1) throw new Error('Cloud scientific dispatch input snapshot column is missing')
    const phase8Rls = await client.$queryRawUnsafe(`
      SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, phase8Tables)
    if (phase8Rls.length !== phase8Tables.length || phase8Rls.some((row) => !row.rls_enabled || !row.rls_forced)) {
      throw new Error('Phase 8 table or forced RLS policy is missing')
    }
    const phase8Provenance = await client.$queryRawUnsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'v2_production_qc_results' AND column_name = ANY($1::text[]))
          OR (table_name = 'v2_production_deviations' AND column_name = ANY($2::text[]))
          OR (table_name = 'v2_production_rework_records' AND column_name = 'deviation_id')
          OR (table_name = 'v2_production_releases' AND column_name = ANY($3::text[]))
        )
    `, ['revision', 'supersedes_result_id'], ['rework_target_stage', 'finished_good_lot_id'], ['revision', 'supersedes_release_id'])
    if (phase8Provenance.length !== 7) throw new Error('Phase 8 QC, rework, release revision, or finished-good hold provenance columns are missing')
    const phase8Constraints = await client.$queryRawUnsafe(`
      SELECT conname FROM pg_constraint
      WHERE conname = ANY($1::text[])
    `, [
      'v2_production_qc_result_revision_unique',
      'v2_production_qc_result_supersedes_tenant_fk',
      'v2_production_rework_deviation_tenant_fk',
      'v2_production_deviation_finished_good_lot_tenant_fk',
      'v2_production_deviation_evidence_deviation_tenant_fk',
      'v2_production_deviation_evidence_document_tenant_fk',
      'v2_production_release_revision_unique',
      'v2_production_release_order_id_unique',
      'v2_production_release_supersedes_order_fk',
    ])
    if (phase8Constraints.length !== 9) throw new Error('Phase 8 QC, release revision, rework provenance, or finished-good evidence tenant constraints are missing')
    const phase9Tables = [
      'v2_agent_definitions', 'v2_agent_definition_versions', 'v2_agent_workflows', 'v2_agent_workflow_versions',
      'v2_agent_tools', 'v2_agent_tool_versions', 'v2_agent_policies', 'v2_agent_policy_versions',
      'v2_agent_workflow_tool_bindings', 'v2_agent_run_nodes', 'v2_agent_run_messages', 'v2_agent_confirmation_intents',
      'v2_agent_provider_usages', 'v2_agent_evaluations', 'v2_agent_lineage_refs',
      'v2_agent_confirmation_effects', 'v2_agent_run_quota_reservations',
    ]
    const phase9Rls = await client.$queryRawUnsafe(`
      SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, phase9Tables)
    if (phase9Rls.length !== phase9Tables.length || phase9Rls.some((row) => !row.rls_enabled || !row.rls_forced)) {
      throw new Error('Phase 9 table or forced RLS policy is missing')
    }
    const phase9PointerColumns = await client.$queryRawUnsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND (
        (table_name = ANY($1::text[]) AND column_name = 'active_version_id')
        OR (table_name = ANY($2::text[]) AND column_name = ANY($3::text[]))
      )
    `, [
      'v2_agent_definitions', 'v2_agent_workflows', 'v2_agent_tools', 'v2_agent_policies',
    ], [
      'v2_agent_definition_versions', 'v2_agent_workflow_versions', 'v2_agent_tool_versions', 'v2_agent_policy_versions',
    ], ['status', 'published_at'])
    if (phase9PointerColumns.length !== 12) throw new Error('Phase 9 active-version or publication columns are missing')
    const phase9Constraints = await client.$queryRawUnsafe(`
      SELECT conname FROM pg_constraint
      WHERE conname = ANY($1::text[])
    `, [
      'v2_agent_definition_active_version_tenant_fk',
      'v2_agent_workflow_active_version_tenant_fk',
      'v2_agent_tool_active_version_tenant_fk',
      'v2_agent_policy_active_version_tenant_fk',
      'v2_agent_run_definition_version_tenant_fk',
      'v2_agent_run_workflow_version_tenant_fk',
      'v2_agent_run_policy_version_tenant_fk',
      'v2_agent_definition_version_publication_check',
      'v2_agent_workflow_version_publication_check',
      'v2_agent_tool_version_publication_check',
      'v2_agent_policy_version_publication_check',
      'v2_agent_tool_version_mutation_confirmation_check',
      'v2_agent_tool_version_mutation_adapter_check',
      'v2_agent_confirmation_intent_tool_tenant_fk',
      'v2_agent_provider_usage_status_check',
      'v2_agent_provider_usage_response_provenance_check',
      'v2_agent_run_nodes_org_run_id_unique',
      'v2_agent_evaluation_node_run_tenant_fk',
      'v2_agent_confirmation_effect_run_tenant_fk',
      'v2_agent_confirmation_effect_confirmation_run_tenant_fk',
      'v2_agent_confirmation_effect_intent_run_tenant_fk',
      'v2_agent_run_quota_reservation_run_tenant_fk',
    ])
    if (phase9Constraints.length !== 22) throw new Error('Phase 9 version publication, provenance, confirmation, or tenant constraints are missing')
    const phase9ConstraintDefinitions = await client.$queryRawUnsafe(`
      SELECT conname, condeferrable, condeferred, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = ANY($1::text[])
    `, [
      'v2_agent_provider_usage_response_provenance_check',
      'v2_agent_evaluation_node_run_tenant_fk',
      'v2_agent_confirmation_status_check',
      'v2_agent_run_quota_reservation_run_tenant_fk',
    ])
    const phase9Definitions = new Map(phase9ConstraintDefinitions.map((row) => [row.conname, String(row.definition).toLowerCase()]))
    const providerProvenanceDefinition = phase9Definitions.get('v2_agent_provider_usage_response_provenance_check') ?? ''
    const evaluationNodeDefinition = phase9Definitions.get('v2_agent_evaluation_node_run_tenant_fk') ?? ''
    const confirmationStatusDefinition = phase9Definitions.get('v2_agent_confirmation_status_check') ?? ''
    const quotaReservationConstraint = phase9ConstraintDefinitions.find((row) => row.conname === 'v2_agent_run_quota_reservation_run_tenant_fk')
    if (!providerProvenanceDefinition.includes('response_hash is not null') || !providerProvenanceDefinition.includes('completed') || !providerProvenanceDefinition.includes('recorded')) {
      throw new Error('Phase 9 provider completion provenance constraint is missing')
    }
    if (!evaluationNodeDefinition.includes('foreign key (organization_id, run_id, run_node_id) references v2_agent_run_nodes(organization_id, run_id, id)')) {
      throw new Error('Phase 9 evaluation node constraint does not bind the node to its run')
    }
    if (!confirmationStatusDefinition.includes('processing')) throw new Error('Phase 9 confirmation processing state is missing')
    if (!quotaReservationConstraint?.condeferrable || !quotaReservationConstraint.condeferred) {
      throw new Error('Phase 9 quota reservation run reference must be deferred for atomic reservation-before-run creation')
    }
    const phase9ConfirmationEffectColumns = await client.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'v2_agent_confirmation_effects'
        AND column_name = ANY($1::text[])
    `, ['claim_token_hash', 'claim_expires_at'])
    if (phase9ConfirmationEffectColumns.length !== 2) {
      throw new Error('Phase 9 confirmation effect fencing columns are missing')
    }
    const formulaOriginInvariant = await client.$queryRawUnsafe(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'v2_formula_drafts'
        AND indexname = 'v2_formula_drafts_origin_reference_unique'
    `)
    if (formulaOriginInvariant.length !== 1
      || !String(formulaOriginInvariant[0].indexdef).includes('(organization_id, formula_project_id, origin_type, origin_reference_id)')) {
      throw new Error('Formula candidate origin uniqueness invariant is missing')
    }
    const phase9Triggers = await client.$queryRawUnsafe(`
      SELECT tgname FROM pg_trigger
      WHERE NOT tgisinternal AND tgname = ANY($1::text[])
    `, [
      'v2_agent_definition_active_version_published',
      'v2_agent_workflow_active_version_published',
      'v2_agent_tool_active_version_published',
      'v2_agent_policy_active_version_published',
      'v2_agent_definition_version_append_only',
      'v2_agent_workflow_version_append_only',
      'v2_agent_tool_version_append_only',
      'v2_agent_policy_version_append_only',
      'v2_agent_workflow_version_published_dependencies',
      'v2_agent_workflow_binding_published_dependencies',
      'v2_agent_event_safe_payload',
      'v2_agent_artifact_safe_payload',
      'v2_agent_event_p9_append_only',
      'v2_agent_artifact_p9_append_only',
      'v2_agent_run_message_safe_payload',
      'v2_agent_confirmation_intent_safe_payload',
    ])
    if (phase9Triggers.length !== 16) throw new Error('Phase 9 published-version guard, immutable evidence trigger, dependency trigger, or safe payload trigger is missing')
    const phase9ActivePointerGuard = await client.$queryRawUnsafe(`
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'v2_require_agent_active_version_published'
    `)
    if (phase9ActivePointerGuard.length !== 1 || !phase9ActivePointerGuard[0].definition.includes("status = ''PUBLISHED''")) {
      throw new Error('Phase 9 active-version guard does not require a PUBLISHED snapshot')
    }
    const phase9EvidenceGuard = await client.$queryRawUnsafe(`
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'v2_guard_agent_runtime_p9_evidence_mutation'
    `)
    if (phase9EvidenceGuard.length !== 1 || !phase9EvidenceGuard[0].definition.includes("'agent-runtime/v1'")) {
      throw new Error('Phase 9 protocol-scoped append-only evidence guard is missing')
    }
    const phase10Tables = [
      'v2_customers', 'v2_customer_contacts', 'v2_customer_addresses', 'v2_commerce_products',
      'v2_commerce_product_prices', 'v2_quotes', 'v2_quote_versions', 'v2_quote_lines',
      'v2_sales_orders', 'v2_sales_order_lines', 'v2_sales_order_events',
      'v2_sales_finished_good_reservations', 'v2_sales_fulfillments', 'v2_sales_fulfillment_lines',
      'v2_sales_shipments', 'v2_sales_return_requests', 'v2_sales_return_lines', 'v2_sales_return_receipts', 'v2_sales_return_dispositions',
      'v2_commerce_documents', 'v2_commerce_traceability_edges',
    ]
    const phase10Rls = await client.$queryRawUnsafe(`
      SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, phase10Tables)
    if (phase10Rls.length !== phase10Tables.length || phase10Rls.some((row) => !row.rls_enabled || !row.rls_forced)) {
      throw new Error('Phase 10 table or forced RLS policy is missing')
    }
    const phase10Constraints = await client.$queryRawUnsafe(`
      SELECT conname
      FROM pg_constraint
      WHERE conname = ANY($1::text[])
    `, [
      'v2_commerce_product_formula_tenant_fk',
      'v2_commerce_product_pack_check',
      'v2_sales_reservation_lot_tenant_fk',
      'v2_sales_reservation_ledger_tenant_fk',
      'v2_sales_fulfillment_line_ledger_tenant_fk',
      'v2_sales_return_receipt_line_tenant_fk',
      'v2_sales_return_receipt_lot_tenant_fk',
      'v2_sales_return_receipt_ledger_tenant_fk',
      'v2_sales_return_disposition_request_tenant_fk',
      'v2_sales_return_disposition_request_unique',
      'v2_sales_shipment_fulfillment_unique',
      'v2_commerce_document_content_unique',
      'v2_commerce_traceability_order_tenant_fk',
    ])
    if (phase10Constraints.length !== 13) throw new Error('Phase 10 commercial, finished-good, return-disposition, or document tenant constraints are missing')
    const phase10ReturnQcDocumentConstraint = await client.$queryRawUnsafe(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'v2_commerce_documents'::regclass
        AND conname = 'v2_commerce_documents_document_kind_check'
    `)
    if (phase10ReturnQcDocumentConstraint.length !== 1 || !phase10ReturnQcDocumentConstraint[0].definition.includes("'RETURN_QC'")) {
      throw new Error('Phase 10 return QC document type is not enforced by the database contract')
    }
    const phase10ReturnDispositionTraceConstraint = await client.$queryRawUnsafe(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'v2_commerce_traceability_edges'::regclass
        AND conname = 'v2_commerce_traceability_edges_edge_type_check'
    `)
    if (phase10ReturnDispositionTraceConstraint.length !== 1
      || !phase10ReturnDispositionTraceConstraint[0].definition.includes("'RETURN_RELEASED_TO_AVAILABLE'")
      || !phase10ReturnDispositionTraceConstraint[0].definition.includes("'RETURN_REJECTED_TO_WASTE'")) {
      throw new Error('Phase 10 return disposition trace edge types are not enforced by the database contract')
    }
    const phase10Triggers = await client.$queryRawUnsafe(`
      SELECT tgname FROM pg_trigger
      WHERE NOT tgisinternal AND tgname = ANY($1::text[])
    `, ['v2_sales_order_events_append_only', 'v2_commerce_traceability_append_only', 'v2_sales_return_receipts_append_only', 'v2_sales_return_dispositions_append_only'])
    if (phase10Triggers.length !== 4) throw new Error('Phase 10 append-only order, return, disposition, or traceability evidence trigger is missing')
    const phase10ForbiddenReferences = await client.$queryRawUnsafe(`
      SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid::regclass::text = ANY($1::text[])
        AND contype = 'f'
        AND (pg_get_constraintdef(oid) ILIKE '%v2_shipments%' OR pg_get_constraintdef(oid) ILIKE '%v2_inventory_reservations%')
    `, phase10Tables.map((table) => `public.${table}`))
    if (phase10ForbiddenReferences.length) throw new Error('Phase 10 must not reuse procurement shipments or raw inventory reservations')
    const phase11Tables = [
      'v2_reformulation_runs', 'v2_reformulation_candidates', 'v2_reformulation_candidate_reviews',
      'v2_import_jobs', 'v2_import_rows', 'v2_import_commits', 'v2_dataops_runs', 'v2_bulk_operations',
    ]
    const phase11Rls = await client.$queryRawUnsafe(`
      SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, phase11Tables)
    if (phase11Rls.length !== phase11Tables.length || phase11Rls.some((row) => !row.rls_enabled || !row.rls_forced)) {
      throw new Error('Phase 11 table or forced RLS policy is missing')
    }
    const phase11Constraints = await client.$queryRawUnsafe(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = ANY($1::text[])
    `, [
      'v2_reformulation_runs_formula_tenant_fk',
      'v2_reformulation_candidates_run_tenant_fk',
      'v2_reformulation_candidates_draft_tenant_fk',
      'v2_reformulation_candidate_reviews_candidate_tenant_fk',
      'v2_reformulation_candidate_reviews_project_tenant_fk',
      'v2_reformulation_candidate_reviews_project_check',
      'v2_import_jobs_source_validation_mode_unique',
      'v2_import_rows_job_tenant_fk',
      'v2_import_commits_job_tenant_fk',
      'v2_dataops_runs_job_tenant_fk',
      'v2_bulk_operations_execution_check',
    ])
    if (phase11Constraints.length !== 11) throw new Error('Phase 11 optimizer, import, bulk, or tenant constraints are missing')
    const phase11Definitions = new Map(phase11Constraints.map((row) => [row.conname, String(row.definition).toLowerCase()]))
    const importUniqueness = phase11Definitions.get('v2_import_jobs_source_validation_mode_unique')
    if (!importUniqueness?.includes('dry_run') || !importUniqueness.includes('validation_hash')) {
      throw new Error('Phase 11 import uniqueness must distinguish dry-run mode and validation snapshots')
    }
    if (!phase11Definitions.get('v2_reformulation_candidate_reviews_project_check')?.includes('save_as_draft')) {
      throw new Error('Phase 11 candidate review decision/project invariant is missing')
    }
    const phase11Columns = await client.$queryRawUnsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'v2_import_jobs' AND column_name = 'confirmation_expires_at')
          OR (table_name = 'v2_bulk_operations' AND column_name = 'confirmation_expires_at'))
    `)
    if (phase11Columns.length !== 2) throw new Error('Phase 11 confirmation expiry columns are missing')
    const phase11Triggers = await client.$queryRawUnsafe(`
      SELECT tgname FROM pg_trigger
      WHERE NOT tgisinternal AND tgname = ANY($1::text[])
    `, ['v2_reformulation_candidate_reviews_append_only', 'v2_import_commits_append_only'])
    if (phase11Triggers.length !== 2) throw new Error('Phase 11 review or import-commit audit evidence is not append-only')
    const phase11FormulaOrigin = await client.$queryRawUnsafe(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'v2_formula_drafts'::regclass
        AND conname = 'v2_formula_drafts_origin_type_check'
    `)
    if (phase11FormulaOrigin.length !== 1 || !String(phase11FormulaOrigin[0].definition).includes("'REFORMULATION_OPTIMIZER'")) {
      throw new Error('Phase 11 Formula origin type is not registered')
    }
    const platformControlTables = [
      'v2_platform_operators', 'v2_platform_audit_events', 'v2_platform_feature_overrides',
      'v2_platform_tenant_state_events', 'v2_platform_mutation_receipts', 'v2_platform_workspace_requests',
    ]
    const platformControlRls = await client.$queryRawUnsafe(`
      SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, platformControlTables)
    if (platformControlRls.length !== platformControlTables.length || platformControlRls.some((row) => !row.rls_enabled || !row.rls_forced)) {
      throw new Error('Platform control-plane tables or forced RLS policies are missing')
    }
    const platformControlFunctions = await client.$queryRawUnsafe(`
      SELECT p.proname, p.prosecdef AS security_definer
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])
    `, [
      'v2_platform_workspace_directory', 'v2_platform_workspace_detail', 'v2_platform_overview_snapshot',
      'v2_platform_revoke_workspace_sessions', 'v2_platform_request_workspace_action',
      'v2_platform_set_workspace_entitlement', 'v2_platform_assign_workspace_plan', 'v2_platform_set_workspace_limit',
      'v2_platform_set_operator_status', 'v2_platform_set_operator_role', 'v2_platform_set_tenant_state',
    ])
    if (platformControlFunctions.length !== 11 || platformControlFunctions.some((row) => !row.security_definer)) {
      throw new Error('Platform control-plane bounded security-definer functions are missing')
    }
    const platformControlTriggers = await client.$queryRawUnsafe(`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])
    `, ['v2_platform_audit_events_append_only', 'v2_platform_tenant_state_events_append_only', 'v2_platform_mutation_receipts_append_only'])
    if (platformControlTriggers.length !== 3) throw new Error('Platform control-plane immutable evidence triggers are missing')
    const platformOwnerInvariant = await client.$queryRawUnsafe(`
      SELECT i.indisunique AS "isUnique", pg_get_expr(i.indpred, i.indrelid) AS predicate, pg_get_indexdef(i.indexrelid) AS definition
      FROM pg_index i
      JOIN pg_class index_class ON index_class.oid = i.indexrelid
      JOIN pg_class table_class ON table_class.oid = i.indrelid
      JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
      WHERE namespace.nspname = 'public'
        AND table_class.relname = 'v2_platform_operators'
        AND index_class.relname = 'v2_platform_operators_single_active_owner'
    `)
    const ownerInvariant = platformOwnerInvariant[0]
    if (platformOwnerInvariant.length !== 1
      || !ownerInvariant?.isUnique
      || !String(ownerInvariant.predicate).includes("role_key = 'PLATFORM_OWNER'::text")
      || !String(ownerInvariant.predicate).includes("status = 'ACTIVE'::text")
      || !String(ownerInvariant.definition).includes('(role_key)')) {
      throw new Error('Platform Owner active-role uniqueness invariant is missing')
    }
    const materialIntelligenceTables = [
      'v2_chemical_entities', 'v2_chemical_identifiers', 'v2_material_components',
      'v2_material_intelligence_evidence', 'v2_scientific_eligibility_decisions',
    ]
    const materialIntelligenceRls = await client.$queryRawUnsafe(`
      SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, materialIntelligenceTables)
    if (materialIntelligenceRls.length !== materialIntelligenceTables.length || materialIntelligenceRls.some((row) => !row.rls_enabled || !row.rls_forced)) {
      throw new Error('Material Intelligence tables or forced RLS policies are missing')
    }
    const materialIntelligenceIndexes = await client.$queryRawUnsafe(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY($1::text[])
    `, ['v2_chemical_entity_verified_structure_unique', 'v2_chemical_entity_verified_inchikey_unique'])
    if (materialIntelligenceIndexes.length !== 2 || materialIntelligenceIndexes.some((row) => !row.indexdef.includes('(organization_id, verified_'))) {
      throw new Error('Material Intelligence strong-identity tenant deduplication indexes are missing')
    }
    const materialIntelligenceTriggers = await client.$queryRawUnsafe(`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])
    `, ['v2_chemical_entity_verified_identity_guard', 'v2_material_intelligence_evidence_append_only', 'v2_scientific_eligibility_append_only'])
    if (materialIntelligenceTriggers.length !== 3) throw new Error('Material Intelligence identity guard or append-only evidence triggers are missing')
  } finally {
    await client.$disconnect()
  }
  console.log('V2_POSTGRES=PASS migration executed against configured database')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  console.error('V2_POSTGRES=FAIL migration execution')
  process.exit(1)
}
