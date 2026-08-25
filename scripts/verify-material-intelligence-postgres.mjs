import { randomUUID } from 'node:crypto'
import pg from 'pg'

const databaseUrl = process.env.V2_QA_DATABASE_URL
if (!databaseUrl || !['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)) {
  console.error('MATERIAL_INTELLIGENCE_POSTGRES=BLOCKED loopback V2_QA_DATABASE_URL required')
  process.exit(2)
}

const { Client } = pg
const client = new Client({ connectionString: databaseUrl })
const suffix = randomUUID().replaceAll('-', '')
const role = 'v2_mi_pilot_test'
const ids = {
  orgA: `org_mi_a_${suffix}`, orgB: `org_mi_b_${suffix}`,
  userA: `usr_mi_a_${suffix}`, userB: `usr_mi_b_${suffix}`,
  materialA: `mat_mi_a_${suffix}`, materialB: `mat_mi_b_${suffix}`,
  entityA: `entity_mi_a_${suffix}`, entityB: `entity_mi_b_${suffix}`,
  evidenceA: `evidence_mi_a_${suffix}`,
  identityA: `identity_mi_a_${suffix}`, identityB: `identity_mi_b_${suffix}`,
  verifiedEntityA: `entity_verified_mi_a_${suffix}`, verifiedEntityB: `entity_verified_mi_b_${suffix}`,
  productDecision: `decision_product_mi_a_${suffix}`, entityDecision: `decision_entity_mi_a_${suffix}`,
}

async function expectRejected(action, code) {
  await client.query('SAVEPOINT mi_expected_failure')
  let rejected = false
  try {
    await action()
  } catch {
    rejected = true
  }
  await client.query('ROLLBACK TO SAVEPOINT mi_expected_failure')
  await client.query('RELEASE SAVEPOINT mi_expected_failure')
  if (!rejected) throw new Error(`${code}_NOT_REJECTED`)
}

try {
  await client.connect()
  await client.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN DROP OWNED BY ${role}; DROP ROLE ${role}; END IF; END $$`)
  await client.query(`CREATE ROLE ${role}`)
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`)
  await client.query(`GRANT SELECT ON v2_chemical_entities TO ${role}`)
  await client.query('BEGIN')
  await client.query('INSERT INTO v2_organizations (id, slug, name) VALUES ($1,$2,$3),($4,$5,$6)', [ids.orgA, `mi-a-${suffix}`, 'MI Tenant A', ids.orgB, `mi-b-${suffix}`, 'MI Tenant B'])
  await client.query('INSERT INTO v2_users (id, email, display_name, password_hash) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)', [ids.userA, `mi-a-${suffix}@example.test`, 'MI A', 'test-only', ids.userB, `mi-b-${suffix}@example.test`, 'MI B', 'test-only'])
  await client.query('INSERT INTO v2_materials (id, organization_id, name, created_by) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)', [ids.materialA, ids.orgA, 'MI Material A', ids.userA, ids.materialB, ids.orgB, 'MI Material B', ids.userB])
  await client.query("INSERT INTO v2_chemical_entities (id, organization_id, preferred_name, entity_type, resolution_status, evidence_status, created_by) VALUES ($1,$2,$3,'UNKNOWN','UNRESOLVED','UNVERIFIED',$4),($5,$6,$7,'UNKNOWN','UNRESOLVED','UNVERIFIED',$8)", [ids.entityA, ids.orgA, 'MI Entity A', ids.userA, ids.entityB, ids.orgB, 'MI Entity B', ids.userB])
  await client.query("INSERT INTO v2_molecular_identities (id, organization_id, resolution_status, canonical_smiles, inchikey, structure_hash, canonicalization_version, rdkit_version, created_by) VALUES ($1,$2,'RESOLVED','CCO',$3,$4,'test/1','test-rdkit',$5),($6,$7,'RESOLVED','CCO',$3,$4,'test/1','test-rdkit',$8)", [ids.identityA, ids.orgA, 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N', 'b'.repeat(64), ids.userA, ids.identityB, ids.orgB, ids.userB])
  await client.query("INSERT INTO v2_chemical_entities (id, organization_id, preferred_name, entity_type, resolution_status, evidence_status, molecular_identity_id, verified_structure_hash, verified_inchikey, created_by) VALUES ($1,$2,'Verified A','SINGLE_SUBSTANCE','RESOLVED','VERIFIED',$3,$4,$5,$6),($7,$8,'Verified B','SINGLE_SUBSTANCE','RESOLVED','VERIFIED',$9,$4,$5,$10)", [ids.verifiedEntityA, ids.orgA, ids.identityA, 'b'.repeat(64), 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N', ids.userA, ids.verifiedEntityB, ids.orgB, ids.identityB, ids.userB])

  await client.query(`SET LOCAL ROLE ${role}`)
  await client.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [ids.orgA, ids.userA])
  const visible = await client.query('SELECT id FROM v2_chemical_entities ORDER BY id')
  const expectedVisible = [ids.entityA, ids.verifiedEntityA].sort()
  if (visible.rows.length !== expectedVisible.length || visible.rows.some((row, index) => row.id !== expectedVisible[index])) throw new Error('MATERIAL_INTELLIGENCE_RLS_ISOLATION_FAILED')
  await client.query('RESET ROLE')

  await expectRejected(
    () => client.query("INSERT INTO v2_material_components (id, organization_id, material_id, component_name, component_role, concentration_kind, concentration_unit, concentration_basis, evidence_status, created_by) VALUES ($1,$2,$3,'Cross tenant','UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','UNVERIFIED',$4)", [`component_cross_${suffix}`, ids.orgA, ids.materialB, ids.userA]),
    'MATERIAL_INTELLIGENCE_CROSS_TENANT_REFERENCE',
  )

  await expectRejected(
    () => client.query('DELETE FROM v2_molecular_identities WHERE id = $1', [ids.identityA]),
    'MATERIAL_INTELLIGENCE_REFERENCED_IDENTITY_DELETE',
  )
  const retainedIdentity = await client.query('SELECT organization_id, molecular_identity_id FROM v2_chemical_entities WHERE id = $1', [ids.verifiedEntityA])
  if (retainedIdentity.rows[0]?.organization_id !== ids.orgA || retainedIdentity.rows[0]?.molecular_identity_id !== ids.identityA) throw new Error('MATERIAL_INTELLIGENCE_IDENTITY_DELETE_INTEGRITY_FAILED')

  await client.query("INSERT INTO v2_scientific_eligibility_decisions (id, organization_id, subject_type, material_id, chemical_entity_id, result, reason_codes, structure_hash, normalization_version, policy_version, evidence_hash, evaluated_by) VALUES ($1,$2,'MATERIAL_PRODUCT',$3,$4,'NOT_ELIGIBLE','[\"DILUTION_PRODUCT\"]',NULL,NULL,'test/1',$5,$6),($7,$2,'CHEMICAL_ENTITY',NULL,$4,'ELIGIBLE','[\"RESOLVED_SINGLE_SUBSTANCE\"]',$8,'test-normalization','test/1',$5,$6)", [ids.productDecision, ids.orgA, ids.materialA, ids.verifiedEntityA, 'c'.repeat(64), ids.userA, ids.entityDecision, 'b'.repeat(64)])
  const productDecision = await client.query("SELECT result FROM v2_scientific_eligibility_decisions WHERE organization_id = $1 AND subject_type = 'MATERIAL_PRODUCT' AND material_id = $2 ORDER BY evaluated_at DESC, id DESC LIMIT 1", [ids.orgA, ids.materialA])
  const entityDecision = await client.query("SELECT result FROM v2_scientific_eligibility_decisions WHERE organization_id = $1 AND subject_type = 'CHEMICAL_ENTITY' AND material_id IS NULL AND chemical_entity_id = $2 ORDER BY evaluated_at DESC, id DESC LIMIT 1", [ids.orgA, ids.verifiedEntityA])
  if (productDecision.rows[0]?.result !== 'NOT_ELIGIBLE' || entityDecision.rows[0]?.result !== 'ELIGIBLE') throw new Error('MATERIAL_INTELLIGENCE_ELIGIBILITY_SUBJECT_CROSSOVER')
  await expectRejected(
    () => client.query("INSERT INTO v2_scientific_eligibility_decisions (id, organization_id, subject_type, material_id, chemical_entity_id, result, reason_codes, structure_hash, normalization_version, policy_version, evidence_hash, evaluated_by) VALUES ($1,$2,'CHEMICAL_ENTITY',$3,$4,'ELIGIBLE','[\"RESOLVED_SINGLE_SUBSTANCE\"]',$5,'test-normalization','test/1',$6,$7)", [`invalid_subject_${suffix}`, ids.orgA, ids.materialA, ids.verifiedEntityA, 'b'.repeat(64), 'd'.repeat(64), ids.userA]),
    'MATERIAL_INTELLIGENCE_ENTITY_SUBJECT_WITH_MATERIAL',
  )

  await client.query('DELETE FROM v2_organizations WHERE id = $1', [ids.orgB])
  const tenantRows = await client.query('SELECT count(*)::int AS count FROM v2_chemical_entities WHERE organization_id = $1', [ids.orgB])
  if (tenantRows.rows[0]?.count !== 0) throw new Error('MATERIAL_INTELLIGENCE_TENANT_CLEANUP_FAILED')

  await client.query("INSERT INTO v2_material_intelligence_evidence (id, organization_id, chemical_entity_id, assertion_key, source_kind, source_ref, source_version, retrieved_at, content_hash, evidence_status, created_by) VALUES ($1,$2,$3,'identity','PILOT_FIXTURE','local-test','1',now(),$4,'UNVERIFIED',$5)", [ids.evidenceA, ids.orgA, ids.entityA, 'a'.repeat(64), ids.userA])
  await expectRejected(
    () => client.query('UPDATE v2_material_intelligence_evidence SET source_version = source_version WHERE id = $1', [ids.evidenceA]),
    'MATERIAL_INTELLIGENCE_EVIDENCE_MUTATION',
  )
  console.log('MATERIAL_INTELLIGENCE_POSTGRES=PASS tenant_rls=PASS cross_tenant_fk=PASS append_only=PASS identity_delete_fk=PASS eligibility_subjects=PASS tenant_cleanup=PASS')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  console.error('MATERIAL_INTELLIGENCE_POSTGRES=FAIL')
  process.exitCode = 1
} finally {
  try {
    await client.query('RESET ROLE')
    await client.query('ROLLBACK')
    await client.query(`DROP OWNED BY ${role}`)
    await client.query(`DROP ROLE IF EXISTS ${role}`)
  } finally {
    await client.end().catch(() => undefined)
  }
}
