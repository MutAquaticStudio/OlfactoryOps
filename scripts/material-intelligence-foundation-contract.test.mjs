import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const read = (path) => readFile(path, 'utf8')

describe('material intelligence migration contract', () => {
  it('is registered in every controlled V2 migration runner', async () => {
    for (const path of ['scripts/apply-v2-staging-migrations.mjs', 'scripts/apply-v2-production-migrations.mjs', 'scripts/verify-v2-postgres.mjs']) {
      expect(await read(path)).toContain("'infra/postgres/migrations/0027_material_intelligence_foundation.sql'")
    }
  })

  it('uses tenant-composite references, forced RLS, and append-only evidence', async () => {
    const migration = await read('infra/postgres/migrations/0027_material_intelligence_foundation.sql')
    for (const table of ['v2_chemical_entities', 'v2_chemical_identifiers', 'v2_material_components', 'v2_material_intelligence_evidence', 'v2_scientific_eligibility_decisions']) {
      expect(migration).toContain(`'${table}'`)
    }
    expect(migration).toContain("ALTER TABLE %I FORCE ROW LEVEL SECURITY")
    expect(migration).toContain('FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id)')
    expect(migration).toContain('FOREIGN KEY (organization_id, chemical_entity_id) REFERENCES v2_chemical_entities(organization_id, id)')
    expect(migration).toContain('v2_material_intelligence_evidence_append_only')
    expect(migration).toContain('v2_scientific_eligibility_append_only')
    expect(migration).toContain('v2_chemical_entity_verified_identity_guard')
    expect(migration).toContain("identity.structure_hash = NEW.verified_structure_hash")
    expect(migration).toContain("identity.inchikey = NEW.verified_inchikey")
    expect(migration).toContain('REVOKE UPDATE, DELETE ON v2_material_intelligence_evidence, v2_scientific_eligibility_decisions FROM PUBLIC')
  })

  it('deduplicates only verified tenant-owned strong molecular identities', async () => {
    const migration = await read('infra/postgres/migrations/0027_material_intelligence_foundation.sql')
    expect(migration).toContain('ON v2_chemical_entities(organization_id, verified_structure_hash)')
    expect(migration).toContain('ON v2_chemical_entities(organization_id, verified_inchikey)')
    expect(migration).toContain("WHERE verified_structure_hash IS NOT NULL AND evidence_status = 'VERIFIED'")
    expect(migration).not.toMatch(/UNIQUE\s*\(verified_(structure_hash|inchikey)\)/)
  })

  it('does not add a bulk feature-computation or training path', async () => {
    const migration = await read('infra/postgres/migrations/0027_material_intelligence_foundation.sql')
    const pilot = await read('scripts/run-material-intelligence-pilot50.ts')
    expect(`${migration}\n${pilot}`).not.toMatch(/INSERT INTO v2_scientific_jobs|train_candidate|FEATURE_GENERATE/)
  })
})

describe('material intelligence pilot evidence contract', () => {
  it('pins source evidence separately from repository-normalized structures', async () => {
    const fixture = JSON.parse(await read('services/scientific/testdata/material-intelligence-pilot50.json'))
    expect(fixture.normalizationVersion).toBe('olfactoryops-rdkit-standardization/1.0.0')
    expect(fixture.rdkitVersion).toBe('2023.09.3')
    const verified = fixture.cases.filter((item) => item.evidenceStatus === 'VERIFIED')
    expect(verified).toHaveLength(16)
    for (const item of verified) {
      const content = JSON.stringify({
        canonicalSmiles: item.sourceCanonicalSmiles,
        inchiKey: item.inchiKey,
        sourceVersion: `PubChem CID ${item.cid}`,
      })
      expect(createHash('sha256').update(content).digest('hex')).toBe(item.contentHash)
      expect(item.canonicalSmiles).toBeTruthy()
      expect(item.structureHash).toMatch(/^[a-f0-9]{64}$/)
    }
  })
})

describe('frozen Osmo demonstration artifacts', () => {
  it('preserves checkpoint, dataset, split, and target identities', async () => {
    const checkpoint = await readFile('services/scientific/model-runtime/artifacts/osmo-dravnieks-transformer-cnn/candidate.weights.h5')
    expect(createHash('sha256').update(checkpoint).digest('hex')).toBe('a23cb99eaa603678ca15f9a83e814a9a6c8691c692582f4aae5f18c65ae0813d')
    const manifest = JSON.parse(await read('services/scientific/model-runtime/artifacts/osmo-dravnieks-transformer-cnn/checkpoint_manifest.json'))
    expect(manifest.datasetSha256).toBe('8b68d9a83d1ba94fbf60fa3c13a8d302c6a74a4aa35e658ff614493cbcb7afe1')
    expect(manifest.splitManifestSha256).toBe('0779783ac133f4ee2cf3d5a52dc14b854929e3fd96771eb294060ae3a654045e')
    expect(manifest.targetManifestSha256).toBe('86b5abb287fa80615155883ccd72dfdcd0d6c73bbbfeaea029cb28a3da9ea39e')
  })
})
