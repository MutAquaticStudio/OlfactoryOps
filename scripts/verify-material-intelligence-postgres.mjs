import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import {
  MATERIAL_INTELLIGENCE_APPEND_ONLY_TABLES,
  MATERIAL_INTELLIGENCE_MUTABLE_TABLES,
  MATERIAL_INTELLIGENCE_TABLES,
  assertMaterialIntelligenceRlsContract,
  assertMaterialIntelligenceRuntimeGrants,
} from './material-intelligence-rls-contract.mjs'

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
  identifierA: `identifier_mi_a_${suffix}`, identifierB: `identifier_mi_b_${suffix}`,
  componentA: `component_mi_a_${suffix}`, componentB: `component_mi_b_${suffix}`,
  evidenceB: `evidence_mi_b_${suffix}`,
  roleEntityA: `entity_role_mi_a_${suffix}`, roleIdentifierA: `identifier_role_mi_a_${suffix}`,
  roleComponentA: `component_role_mi_a_${suffix}`, roleEvidenceA: `evidence_role_mi_a_${suffix}`,
  roleDecisionA: `decision_role_mi_a_${suffix}`, decisionB: `decision_product_mi_b_${suffix}`,
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
async function verifyRlsGovernance() {
  const { rows: rlsRows } = await client.query(`
    SELECT c.relname AS "tableName", c.relrowsecurity AS "rlsEnabled", c.relforcerowsecurity AS "rlsForced"
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
  `, [MATERIAL_INTELLIGENCE_TABLES])
  const { rows: policyRows } = await client.query(`
    SELECT tablename AS "tableName", policyname AS "policyName", permissive, roles, cmd AS command,
      qual AS "usingExpression", with_check AS "checkExpression"
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY($1::text[])
  `, [MATERIAL_INTELLIGENCE_TABLES])
  assertMaterialIntelligenceRlsContract({ rlsRows, policyRows })
}

async function verifyRuntimeGrants() {
  const { rows } = await client.query(`
    SELECT table_name AS "tableName",
      has_table_privilege($1, format('public.%I', table_name), 'SELECT') AS "canSelect",
      has_table_privilege($1, format('public.%I', table_name), 'INSERT') AS "canInsert",
      has_table_privilege($1, format('public.%I', table_name), 'UPDATE') AS "canUpdate",
      has_table_privilege($1, format('public.%I', table_name), 'DELETE') AS "canDelete"
    FROM unnest($2::text[]) AS table_name
  `, [role, MATERIAL_INTELLIGENCE_TABLES])
  assertMaterialIntelligenceRuntimeGrants(rows)
}

try {
  await client.connect()
  await client.query(readFileSync('infra/postgres/migrations/0027_material_intelligence_foundation.sql', 'utf8'))
  await verifyRlsGovernance()
  await client.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN DROP OWNED BY ${role}; DROP ROLE ${role}; END IF; END $$`)
  await client.query(`CREATE ROLE ${role}`)
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`)
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${MATERIAL_INTELLIGENCE_MUTABLE_TABLES.join(', ')} TO ${role}`)
  await client.query(`GRANT SELECT, INSERT ON ${MATERIAL_INTELLIGENCE_APPEND_ONLY_TABLES.join(', ')} TO ${role}`)
  await verifyRuntimeGrants()
  await client.query('BEGIN')
  await client.query('INSERT INTO v2_organizations (id, slug, name) VALUES ($1,$2,$3),($4,$5,$6)', [ids.orgA, `mi-a-${suffix}`, 'MI Tenant A', ids.orgB, `mi-b-${suffix}`, 'MI Tenant B'])
  await client.query('INSERT INTO v2_users (id, email, display_name, password_hash) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)', [ids.userA, `mi-a-${suffix}@example.test`, 'MI A', 'test-only', ids.userB, `mi-b-${suffix}@example.test`, 'MI B', 'test-only'])
  await client.query('INSERT INTO v2_materials (id, organization_id, name, created_by) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)', [ids.materialA, ids.orgA, 'MI Material A', ids.userA, ids.materialB, ids.orgB, 'MI Material B', ids.userB])
  await client.query("INSERT INTO v2_chemical_entities (id, organization_id, preferred_name, entity_type, resolution_status, evidence_status, created_by) VALUES ($1,$2,$3,'UNKNOWN','UNRESOLVED','UNVERIFIED',$4),($5,$6,$7,'UNKNOWN','UNRESOLVED','UNVERIFIED',$8)", [ids.entityA, ids.orgA, 'MI Entity A', ids.userA, ids.entityB, ids.orgB, 'MI Entity B', ids.userB])
  await client.query("INSERT INTO v2_molecular_identities (id, organization_id, resolution_status, canonical_smiles, inchikey, structure_hash, canonicalization_version, rdkit_version, created_by) VALUES ($1,$2,'RESOLVED','CCO',$3,$4,'test/1','test-rdkit',$5),($6,$7,'RESOLVED','CCO',$3,$4,'test/1','test-rdkit',$8)", [ids.identityA, ids.orgA, 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N', 'b'.repeat(64), ids.userA, ids.identityB, ids.orgB, ids.userB])
  await client.query("INSERT INTO v2_chemical_entities (id, organization_id, preferred_name, entity_type, resolution_status, evidence_status, molecular_identity_id, verified_structure_hash, verified_inchikey, created_by) VALUES ($1,$2,'Verified A','SINGLE_SUBSTANCE','RESOLVED','VERIFIED',$3,$4,$5,$6),($7,$8,'Verified B','SINGLE_SUBSTANCE','RESOLVED','VERIFIED',$9,$4,$5,$10)", [ids.verifiedEntityA, ids.orgA, ids.identityA, 'b'.repeat(64), 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N', ids.userA, ids.verifiedEntityB, ids.orgB, ids.identityB, ids.userB])

  await client.query("INSERT INTO v2_chemical_identifiers (id, organization_id, chemical_entity_id, identifier_type, identifier_value, normalized_value, source_ref, source_version, content_hash) VALUES ($1,$2,$3,'CUSTOM','A','a','fixture-a','1',$4),($5,$6,$7,'CUSTOM','B','b','fixture-b','1',$8)", [ids.identifierA, ids.orgA, ids.entityA, '1'.repeat(64), ids.identifierB, ids.orgB, ids.entityB, '2'.repeat(64)])
  await client.query("INSERT INTO v2_material_components (id, organization_id, material_id, chemical_entity_id, component_name, component_role, concentration_kind, concentration_unit, concentration_basis, evidence_status, created_by) VALUES ($1,$2,$3,$4,'Component A','UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','UNVERIFIED',$5),($6,$7,$8,$9,'Component B','UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','UNVERIFIED',$10)", [ids.componentA, ids.orgA, ids.materialA, ids.entityA, ids.userA, ids.componentB, ids.orgB, ids.materialB, ids.entityB, ids.userB])
  await client.query("INSERT INTO v2_material_intelligence_evidence (id, organization_id, chemical_entity_id, assertion_key, source_kind, source_ref, source_version, retrieved_at, content_hash, evidence_status, created_by) VALUES ($1,$2,$3,'identity','PILOT_FIXTURE','local-test-a','1',now(),$4,'UNVERIFIED',$5),($6,$7,$8,'identity','PILOT_FIXTURE','local-test-b','1',now(),$9,'UNVERIFIED',$10)", [ids.evidenceA, ids.orgA, ids.entityA, '3'.repeat(64), ids.userA, ids.evidenceB, ids.orgB, ids.entityB, '4'.repeat(64), ids.userB])
  await client.query("INSERT INTO v2_scientific_eligibility_decisions (id, organization_id, subject_type, material_id, result, reason_codes, policy_version, evidence_hash, evaluated_by) VALUES ($1,$2,'MATERIAL_PRODUCT',$3,'NOT_ELIGIBLE','[\"DILUTION_PRODUCT\"]','test/1',$4,$5),($6,$7,'MATERIAL_PRODUCT',$8,'NOT_ELIGIBLE','[\"DILUTION_PRODUCT\"]','test/1',$9,$10)", [ids.productDecision, ids.orgA, ids.materialA, '5'.repeat(64), ids.userA, ids.decisionB, ids.orgB, ids.materialB, '6'.repeat(64), ids.userB])
  await client.query(`SET LOCAL ROLE ${role}`)
  await client.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [ids.orgA, ids.userA])
  const expectedVisible = new Map([
    ['v2_chemical_entities', [ids.entityA, ids.verifiedEntityA].sort()],
    ['v2_chemical_identifiers', [ids.identifierA]],
    ['v2_material_components', [ids.componentA]],
    ['v2_material_intelligence_evidence', [ids.evidenceA]],
    ['v2_scientific_eligibility_decisions', [ids.productDecision]],
  ])
  for (const [tableName, expectedIds] of expectedVisible) {
    const visible = await client.query(`SELECT id FROM ${tableName} ORDER BY id`)
    if (visible.rows.length !== expectedIds.length || visible.rows.some((row, index) => row.id !== expectedIds[index])) throw new Error(`MATERIAL_INTELLIGENCE_RLS_ISOLATION_${tableName.toUpperCase()}_FAILED`)
  }

  await client.query("INSERT INTO v2_chemical_entities (id, organization_id, preferred_name, entity_type, resolution_status, evidence_status, created_by) VALUES ($1,$2,'Role Entity A','UNKNOWN','UNRESOLVED','UNVERIFIED',$3)", [ids.roleEntityA, ids.orgA, ids.userA])
  await client.query("INSERT INTO v2_chemical_identifiers (id, organization_id, chemical_entity_id, identifier_type, identifier_value, normalized_value, source_ref, source_version, content_hash) VALUES ($1,$2,$3,'CUSTOM','Role A','role-a','role-fixture','1',$4)", [ids.roleIdentifierA, ids.orgA, ids.roleEntityA, '7'.repeat(64)])
  await client.query("INSERT INTO v2_material_components (id, organization_id, material_id, chemical_entity_id, component_name, component_role, concentration_kind, concentration_unit, concentration_basis, evidence_status, created_by) VALUES ($1,$2,$3,$4,'Role Component A','UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','UNVERIFIED',$5)", [ids.roleComponentA, ids.orgA, ids.materialA, ids.roleEntityA, ids.userA])
  await client.query("INSERT INTO v2_material_intelligence_evidence (id, organization_id, component_id, assertion_key, source_kind, source_ref, source_version, retrieved_at, content_hash, evidence_status, created_by) VALUES ($1,$2,$3,'composition','PILOT_FIXTURE','role-fixture','1',now(),$4,'UNVERIFIED',$5)", [ids.roleEvidenceA, ids.orgA, ids.roleComponentA, '8'.repeat(64), ids.userA])
  await client.query("INSERT INTO v2_scientific_eligibility_decisions (id, organization_id, subject_type, chemical_entity_id, result, reason_codes, policy_version, evidence_hash, evaluated_by) VALUES ($1,$2,'CHEMICAL_ENTITY',$3,'REVIEW_REQUIRED','[\"STRUCTURE_UNVERIFIED\"]','test/1',$4,$5)", [ids.roleDecisionA, ids.orgA, ids.roleEntityA, '9'.repeat(64), ids.userA])

  await expectRejected(() => client.query("INSERT INTO v2_chemical_entities (id, organization_id, preferred_name, entity_type, resolution_status, evidence_status, created_by) VALUES ($1,$2,'Wrong tenant','UNKNOWN','UNRESOLVED','UNVERIFIED',$3)", [`entity_wrong_tenant_${suffix}`, ids.orgB, ids.userB]), 'MATERIAL_INTELLIGENCE_RLS_WITH_CHECK')
  await expectRejected(() => client.query("INSERT INTO v2_material_components (id, organization_id, material_id, component_name, component_role, concentration_kind, concentration_unit, concentration_basis, evidence_status, created_by) VALUES ($1,$2,$3,'Cross tenant','UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','UNVERIFIED',$4)", [`component_cross_${suffix}`, ids.orgA, ids.materialB, ids.userA]), 'MATERIAL_INTELLIGENCE_CROSS_TENANT_REFERENCE')

  await client.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [ids.orgB, ids.userB])
  for (const [tableName, tenantAId] of [
    ['v2_chemical_entities', ids.entityA],
    ['v2_chemical_identifiers', ids.identifierA],
    ['v2_material_components', ids.componentA],
    ['v2_material_intelligence_evidence', ids.evidenceA],
    ['v2_scientific_eligibility_decisions', ids.productDecision],
  ]) {
    const hidden = await client.query(`SELECT id FROM ${tableName} WHERE id = $1`, [tenantAId])
    if (hidden.rowCount !== 0) throw new Error(`MATERIAL_INTELLIGENCE_CROSS_TENANT_READ_${tableName.toUpperCase()}_FAILED`)
  }
  for (const [sql, id] of [
    ['UPDATE v2_chemical_entities SET preferred_name = preferred_name WHERE id = $1', ids.entityA],
    ['DELETE FROM v2_chemical_identifiers WHERE id = $1', ids.identifierA],
    ['UPDATE v2_material_components SET component_name = component_name WHERE id = $1', ids.componentA],
  ]) {
    const mutation = await client.query(sql, [id])
    if (mutation.rowCount !== 0) throw new Error('MATERIAL_INTELLIGENCE_CROSS_TENANT_MUTATION_FAILED')
  }

  await client.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [ids.orgA, ids.userA])
  const entityUpdate = await client.query("UPDATE v2_chemical_entities SET preferred_name = 'Role Entity A Updated' WHERE id = $1", [ids.roleEntityA])
  const componentUpdate = await client.query("UPDATE v2_material_components SET component_name = 'Role Component A Updated' WHERE id = $1", [ids.roleComponentA])
  if (entityUpdate.rowCount !== 1 || componentUpdate.rowCount !== 1) throw new Error('MATERIAL_INTELLIGENCE_TENANT_POSITIVE_UPDATE_FAILED')
  await client.query('RESET ROLE')

  await expectRejected(
    () => client.query('DELETE FROM v2_molecular_identities WHERE id = $1', [ids.identityA]),
    'MATERIAL_INTELLIGENCE_REFERENCED_IDENTITY_DELETE',
  )
  const retainedIdentity = await client.query('SELECT organization_id, molecular_identity_id FROM v2_chemical_entities WHERE id = $1', [ids.verifiedEntityA])
  if (retainedIdentity.rows[0]?.organization_id !== ids.orgA || retainedIdentity.rows[0]?.molecular_identity_id !== ids.identityA) throw new Error('MATERIAL_INTELLIGENCE_IDENTITY_DELETE_INTEGRITY_FAILED')

  await client.query("INSERT INTO v2_scientific_eligibility_decisions (id, organization_id, subject_type, chemical_entity_id, result, reason_codes, structure_hash, normalization_version, policy_version, evidence_hash, evaluated_by) VALUES ($1,$2,'CHEMICAL_ENTITY',$3,'ELIGIBLE','[\"RESOLVED_SINGLE_SUBSTANCE\"]',$4,'test-normalization','test/1',$5,$6)", [ids.entityDecision, ids.orgA, ids.verifiedEntityA, 'b'.repeat(64), 'c'.repeat(64), ids.userA])
  const productDecision = await client.query("SELECT result FROM v2_scientific_eligibility_decisions WHERE organization_id = $1 AND subject_type = 'MATERIAL_PRODUCT' AND material_id = $2 ORDER BY evaluated_at DESC, id DESC LIMIT 1", [ids.orgA, ids.materialA])
  const entityDecision = await client.query("SELECT result FROM v2_scientific_eligibility_decisions WHERE organization_id = $1 AND subject_type = 'CHEMICAL_ENTITY' AND material_id IS NULL AND chemical_entity_id = $2 ORDER BY evaluated_at DESC, id DESC LIMIT 1", [ids.orgA, ids.verifiedEntityA])
  if (productDecision.rows[0]?.result !== 'NOT_ELIGIBLE' || entityDecision.rows[0]?.result !== 'ELIGIBLE') throw new Error('MATERIAL_INTELLIGENCE_ELIGIBILITY_SUBJECT_CROSSOVER')
  await expectRejected(
    () => client.query("INSERT INTO v2_scientific_eligibility_decisions (id, organization_id, subject_type, material_id, chemical_entity_id, result, reason_codes, structure_hash, normalization_version, policy_version, evidence_hash, evaluated_by) VALUES ($1,$2,'CHEMICAL_ENTITY',$3,$4,'ELIGIBLE','[\"RESOLVED_SINGLE_SUBSTANCE\"]',$5,'test-normalization','test/1',$6,$7)", [`invalid_subject_${suffix}`, ids.orgA, ids.materialA, ids.verifiedEntityA, 'b'.repeat(64), 'd'.repeat(64), ids.userA]),
    'MATERIAL_INTELLIGENCE_ENTITY_SUBJECT_WITH_MATERIAL',
  )

  await expectRejected(() => client.query('UPDATE v2_material_intelligence_evidence SET source_version = source_version WHERE id = $1', [ids.evidenceA]), 'MATERIAL_INTELLIGENCE_EVIDENCE_UPDATE')
  await expectRejected(() => client.query('DELETE FROM v2_material_intelligence_evidence WHERE id = $1', [ids.evidenceA]), 'MATERIAL_INTELLIGENCE_EVIDENCE_DELETE')
  await expectRejected(() => client.query('UPDATE v2_scientific_eligibility_decisions SET policy_version = policy_version WHERE id = $1', [ids.productDecision]), 'MATERIAL_INTELLIGENCE_ELIGIBILITY_UPDATE')
  await expectRejected(() => client.query('DELETE FROM v2_scientific_eligibility_decisions WHERE id = $1', [ids.productDecision]), 'MATERIAL_INTELLIGENCE_ELIGIBILITY_DELETE')
  console.log('MATERIAL_INTELLIGENCE_POSTGRES=PASS migration_reapply=PASS rls_governance=PASS tenant_rls_positive=PASS tenant_rls_negative=PASS cross_tenant_fk=PASS append_only=PASS runtime_grants=PASS identity_delete_fk=PASS eligibility_subjects=PASS')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  console.error('MATERIAL_INTELLIGENCE_POSTGRES=FAIL')
  process.exitCode = 1
} finally {
  try {
    await client.query('RESET ROLE')
    await client.query('ROLLBACK')
    const roleExists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])
    if (roleExists.rowCount === 1) {
      await client.query(`DROP OWNED BY ${role}`)
      await client.query(`DROP ROLE ${role}`)
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}
