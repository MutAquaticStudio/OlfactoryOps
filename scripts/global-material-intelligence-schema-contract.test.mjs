import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationPath = 'infra/postgres/migrations/0029_global_material_intelligence_catalog.sql'
const readMigration = () => readFile(migrationPath, 'utf8')

const GLOBAL_TABLES = [
  'v2_global_material_intelligence_releases',
  'v2_global_molecular_identities',
  'v2_global_chemical_entities',
  'v2_global_chemical_identifiers',
  'v2_global_identity_evidence',
  'v2_global_canonical_materials',
  'v2_global_material_source_observations',
  'v2_global_physical_property_assertions',
  'v2_osmo_taxonomy_releases',
  'v2_osmo_taxonomy_nodes',
  'v2_osmo_taxonomy_assignments',
]

describe('global Material Intelligence schema contract', () => {
  it('is a forward-only additive catalog that leaves tenant material storage intact', async () => {
    const migration = await readMigration()

    for (const table of GLOBAL_TABLES) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`)
    }
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.v2_tenant_material_preparations')
    expect(migration).not.toMatch(/ALTER TABLE\s+(?:public\.)?v2_materials\b/i)
    expect(migration).not.toMatch(/DROP TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?v2_/i)
  })

  it('accounts every source row with exactly one bounded disposition', async () => {
    const migration = await readMigration()

    for (const disposition of [
      'GLOBAL_CANONICAL_NEAT',
      'DILUTION_MERGED_TO_NEAT',
      'EXCLUDED_NATURAL',
      'DEFERRED_MIXTURE',
      'DEFERRED_BASE',
      'REVIEW_REQUIRED',
    ]) {
      expect(migration).toContain(`'${disposition}'`)
    }
    expect(migration).not.toContain("'CANONICAL_ACTIVE'")
    expect(migration).not.toContain("'MERGED_TO_CANONICAL'")
    expect(migration).not.toContain("'DEFERRED_INSUFFICIENT_IDENTITY'")
    expect(migration).toContain('v2_global_material_source_observation_exact_disposition')
    expect(migration).toContain('UNIQUE (release_id, source_row_number)')
    expect(migration).toContain('accounted_row_count = global_canonical_neat_row_count')
    expect(migration).toContain('active_material_count <> NEW.global_canonical_neat_count')
    expect(migration).toContain('canonical_count <> NEW.global_canonical_neat_row_count')
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS v2_global_material_source_canonical_idx')
    expect(migration).not.toContain('v2_global_material_source_primary_unique')
    expect(migration).toContain('V2_GLOBAL_MATERIAL_INTELLIGENCE_RELEASE_ACCOUNTING_MISMATCH')
    expect(migration).toContain('V2_GLOBAL_MATERIAL_INTELLIGENCE_CANONICAL_SOURCE_MISSING')
    expect(migration).toContain('V2_GLOBAL_MATERIAL_INTELLIGENCE_SOURCE_TARGET_NOT_ACTIVE')
    expect(migration).toContain('V2_GLOBAL_MATERIAL_INTELLIGENCE_ACTIVATED_RELEASE_IMMUTABLE')
    expect(migration).toContain('V2_GLOBAL_MATERIAL_INTELLIGENCE_ACTIVE_RELEASE_ONLY_SUPERSEDABLE')
  })

  it('requires a verified global single-substance identity for every active canonical material', async () => {
    const migration = await readMigration()

    expect(migration).toContain('v2_global_molecular_identity_verified_shape')
    expect(migration).toContain('v2_global_molecular_identity_verified_structure_unique')
    expect(migration).toContain('v2_global_molecular_identity_verified_inchikey_unique')
    expect(migration).toContain('v2_global_chemical_entity_verified_identity_unique')
    expect(migration).toContain("product_classification = 'NEAT_SUBSTANCE'")
    expect(migration).toContain('V2_GLOBAL_CANONICAL_MATERIAL_REQUIRES_VERIFIED_SINGLE_SUBSTANCE')
    expect(migration).toContain('V2_GLOBAL_CANONICAL_MATERIAL_REQUIRES_AUTHORITATIVE_IDENTITY_EVIDENCE')
    expect(migration).toContain("source_kind IN ('AUTHORITATIVE_PUBLIC_DATABASE','SUPPLIER_DOCUMENT','SOURCE_WORKBOOK','CURATOR_ASSERTION')")
    expect(migration).toContain("evidence.source_kind IN ('AUTHORITATIVE_PUBLIC_DATABASE','SUPPLIER_DOCUMENT')")
    expect(migration).toContain("evidence.evidence_status = 'VERIFIED'")
    expect(migration).toContain("lifecycle_status <> 'ACTIVE' OR evidence_status = 'VERIFIED'")
  })

  it('keeps conflicting physical-property evidence source-aware instead of overwriting it', async () => {
    const migration = await readMigration()

    expect(migration).toContain('v2_global_physical_property_subject CHECK (num_nonnulls(chemical_entity_id, canonical_material_id) = 1)')
    expect(migration).toContain("value_kind IN ('EXACT_NUMERIC','RANGE_NUMERIC','TEXT')")
    expect(migration).toContain('source_observation_id TEXT')
    expect(migration).toContain('source_ref TEXT NOT NULL')
    expect(migration).toContain('source_version TEXT NOT NULL')
    expect(migration).toContain("content_hash ~ '^[a-f0-9]{64}$'")
    expect(migration).not.toMatch(/UNIQUE\s*\([^)]*property_key[^)]*\)/)
  })

  it('pins licensed Osmo taxonomy releases and validates declared counts', async () => {
    const migration = await readMigration()

    expect(migration).toContain("upstream_commit TEXT NOT NULL UNIQUE CHECK (upstream_commit ~ '^[a-f0-9]{40}$')")
    expect(migration).toContain('license_spdx TEXT NOT NULL')
    expect(migration).toContain('license_url TEXT NOT NULL')
    expect(migration).toContain("node_kind IN ('GRAND_FAMILY','SUBFAMILY','DESCRIPTOR','TEXTURE','SENSATION')")
    expect(migration).toContain("node_kind = 'SUBFAMILY' AND parent_node_id IS NOT NULL")
    expect(migration).toContain("node_kind IN ('GRAND_FAMILY','DESCRIPTOR','TEXTURE','SENSATION') AND parent_node_id IS NULL")
    expect(migration).toContain("jsonb_typeof(metadata) = 'object'")
    expect(migration).toContain('V2_OSMO_TAXONOMY_SUBFAMILY_REQUIRES_GRAND_FAMILY_PARENT')
    expect(migration).toContain('node_count BIGINT NOT NULL CHECK (node_count > 0)')
    expect(migration).toContain('assignment_count BIGINT NOT NULL CHECK (assignment_count >= 0)')
    expect(migration).toContain("assignment_kind IN ('SOURCE_VERIFIED','NORMALIZED','MODEL_PREDICTED','SENSORY_PANEL')")
    expect(migration).toContain("assignment_kind <> 'MODEL_PREDICTED' OR (evidence_status <> 'VERIFIED' AND confidence IS NOT NULL)")
    expect(migration).toContain('v2_osmo_taxonomy_assignment_subject CHECK (num_nonnulls(chemical_entity_id, canonical_material_id) = 1)')
    expect(migration).toContain('V2_OSMO_TAXONOMY_RELEASE_COUNT_MISMATCH')
    expect(migration).toContain('V2_OSMO_TAXONOMY_ACTIVATED_RELEASE_IMMUTABLE')
  })

  it('bridges tenant preparations without changing tenant material ownership or scope', async () => {
    const migration = await readMigration()

    expect(migration).toContain('FOREIGN KEY (organization_id, material_id)')
    expect(migration).toContain('REFERENCES public.v2_materials(organization_id, id) ON DELETE CASCADE')
    expect(migration).toContain('FOREIGN KEY (global_material_release_id, global_material_id)')
    expect(migration).toContain('REFERENCES public.v2_global_canonical_materials(release_id, id) ON DELETE RESTRICT')
    expect(migration).toContain("preparation_kind IN ('NEAT_REFERENCE','DILUTION','WORKING_STOCK')")
    expect(migration).toContain("organization_id::text = current_setting('app.organization_id', true)")
    expect(migration).toContain('ALTER TABLE public.v2_tenant_material_preparations FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('V2_TENANT_MATERIAL_PREPARATION_REQUIRES_ACTIVE_GLOBAL_MATERIAL')
  })

  it('gives application roles SELECT-only global access and reserves writes for the curator role', async () => {
    const migration = await readMigration()

    expect(migration).toContain('CREATE ROLE v2_global_material_intelligence_reader')
    expect(migration).toContain('CREATE ROLE v2_global_material_intelligence_curator')
    expect(migration).toContain('NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION')
    expect(migration).toContain("FOREACH role_name IN ARRAY ARRAY['v2_app', 'hyperdrive_user']")
    expect(migration).toContain("EXECUTE format('GRANT SELECT ON TABLE %s TO %I', global_tables, role_name)")
    expect(migration).toContain("EXECUTE format('REVOKE v2_global_material_intelligence_curator FROM %I', role_name)")
    expect(migration).toContain('TO v2_global_material_intelligence_curator;')
    expect(migration).toContain("FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']")
    expect(migration).not.toContain('SECURITY DEFINER')
    expect((migration.match(/FORCE ROW LEVEL SECURITY/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(migration).toContain("EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name)")
  })
})
