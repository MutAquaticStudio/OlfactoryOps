import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import {
  bulkIngestPlanSchema,
  type MaterialIntelligenceImportCounts,
} from "../packages/contracts/src/material-intelligence.js";
import {
  deterministicMaterialIntelligenceId,
  GovernedMaterialIntelligencePersistence,
  materialIntelligenceSourceIdentity,
  MATERIAL_INTELLIGENCE_IMPORT_BATCH_SIZE,
} from "../services/scientific/src/material-intelligence-persistence.js";
import { MaterialIntelligenceService } from "../services/scientific/src/material-intelligence-service.js";

const databaseUrl = process.env.V2_QA_DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1", "::1"].includes(new URL(databaseUrl).hostname)
) {
  throw new Error(
    "MATERIAL_INTELLIGENCE_PERSISTENCE_POSTGRES_LOOPBACK_REQUIRED",
  );
}

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const runtimeRole = "mi_runtime_" + suffix;
const runtimeCredential = "local_test_" + randomUUID();
const admin = new pg.Client({ connectionString: databaseUrl });
const appUrl = new URL(databaseUrl);
appUrl.username = runtimeRole;
appUrl.password = runtimeCredential;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: appUrl.toString() }),
});
const persistence = new GovernedMaterialIntelligencePersistence(prisma);
const fakePlatform = { requirePermission: async () => undefined };
const reads = new MaterialIntelligenceService(prisma, fakePlatform as never);
const ids = {
  orgA: "org_mi_import_a_" + suffix,
  orgB: "org_mi_import_b_" + suffix,
  userA: "usr_mi_import_a_" + suffix,
  userB: "usr_mi_import_b_" + suffix,
  membershipA: "mem_mi_import_a_" + suffix,
  membershipB: "mem_mi_import_b_" + suffix,
  materialB: "mat_mi_import_b_" + suffix,
  entityB: "ent_mi_import_b_" + suffix,
  decisionB: "eli_mi_import_b_" + suffix,
  evidenceB: "ev_mi_import_b_" + suffix,
};

function mergeCounts(
  target: MaterialIntelligenceImportCounts,
  source: MaterialIntelligenceImportCounts,
) {
  target.materialProducts += source.materialProducts;
  target.components += source.components;
  target.evidence += source.evidence;
  for (const [key, value] of Object.entries(source.chemicalEntities))
    target.chemicalEntities[key] = (target.chemicalEntities[key] ?? 0) + value;
  for (const [key, value] of Object.entries(source.eligibilityDecisions))
    target.eligibilityDecisions[key] =
      (target.eligibilityDecisions[key] ?? 0) + value;
}

async function expectNotFound(action: () => Promise<unknown>, code: string) {
  try {
    await action();
  } catch (error) {
    if ((error as { code?: unknown }).code === code) return;
    throw error;
  }
  throw new Error(code + "_NOT_ENFORCED");
}

try {
  await admin.connect();
  await admin.query(
    "CREATE ROLE " +
      runtimeRole +
      " LOGIN PASSWORD " +
      "'" +
      runtimeCredential.replaceAll("'", "''") +
      "'",
  );
  const migrations = (await readdir(resolve("infra/postgres/migrations")))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    await admin.query(
      await readFile(resolve("infra/postgres/migrations", migration), "utf8"),
    );
  }

  await admin.query("GRANT USAGE ON SCHEMA public TO " + runtimeRole);
  await admin.query(
    "GRANT EXECUTE ON FUNCTION v2_platform_has_role(TEXT[]) TO " + runtimeRole,
  );
  await admin.query(
    "GRANT SELECT ON v2_organizations, v2_users, v2_memberships, v2_role_policies TO " +
      runtimeRole,
  );
  await admin.query(
    "GRANT SELECT, INSERT ON v2_materials, v2_molecular_identities, v2_audit_events TO " +
      runtimeRole,
  );
  await admin.query(
    "GRANT SELECT, INSERT, UPDATE, DELETE ON v2_chemical_entities, v2_chemical_identifiers, v2_material_components TO " +
      runtimeRole,
  );
  await admin.query(
    "GRANT SELECT, INSERT ON v2_material_intelligence_evidence, v2_scientific_eligibility_decisions TO " +
      runtimeRole,
  );

  await admin.query(
    "INSERT INTO v2_organizations (id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE'),($4,$5,$6,'ACTIVE')",
    [
      ids.orgA,
      "mi-import-a-" + suffix,
      "MI Import A",
      ids.orgB,
      "mi-import-b-" + suffix,
      "MI Import B",
    ],
  );
  await admin.query(
    "INSERT INTO v2_users (id, email, display_name, password_hash, status) VALUES ($1,$2,$3,'test-only','ACTIVE'),($4,$5,$6,'test-only','ACTIVE')",
    [
      ids.userA,
      "mi-a-" + suffix + "@example.test",
      "MI Import A",
      ids.userB,
      "mi-b-" + suffix + "@example.test",
      "MI Import B",
    ],
  );
  await admin.query(
    "INSERT INTO v2_memberships (id, organization_id, user_id, role_key, status) VALUES ($1,$2,$3,'Owner','ACTIVE'),($4,$5,$6,'Owner','ACTIVE')",
    [
      ids.membershipA,
      ids.orgA,
      ids.userA,
      ids.membershipB,
      ids.orgB,
      ids.userB,
    ],
  );
  const permissions = JSON.stringify([
    "materials.viewSensitive",
    "materials.edit",
    "materials.approve",
    "imports.commit",
  ]);
  await admin.query(
    "INSERT INTO v2_role_policies (id, organization_id, role_key, permissions, updated_by) VALUES ($1,$2,'Owner',$3::jsonb,$4),($5,$6,'Owner',$3::jsonb,$7)",
    [
      "policy_a_" + suffix,
      ids.orgA,
      permissions,
      ids.userA,
      "policy_b_" + suffix,
      ids.orgB,
      ids.userB,
    ],
  );
  await admin.query(
    "INSERT INTO v2_materials (id, organization_id, name, internal_code, status, product_classification, created_by) VALUES ($1,$2,'Tenant B Material','TENANT-B','DRAFT','NEAT_SUBSTANCE',$3)",
    [ids.materialB, ids.orgB, ids.userB],
  );
  await admin.query(
    "INSERT INTO v2_chemical_entities (id, organization_id, preferred_name, entity_type, resolution_status, evidence_status, created_by) VALUES ($1,$2,'Tenant B Entity','SINGLE_SUBSTANCE','UNRESOLVED','UNVERIFIED',$3)",
    [ids.entityB, ids.orgB, ids.userB],
  );
  await admin.query(
    "INSERT INTO v2_material_intelligence_evidence (id, organization_id, material_id, assertion_key, source_kind, source_ref, source_version, retrieved_at, content_hash, evidence_status, created_by) VALUES ($1,$2,$3,'PRODUCT_IDENTITY','PILOT_FIXTURE','local-b','1',now(),$4,'UNVERIFIED',$5)",
    [
      ids.evidenceB,
      ids.orgB,
      ids.materialB,
      createHash("sha256").update("tenant-b").digest("hex"),
      ids.userB,
    ],
  );
  await admin.query(
    "INSERT INTO v2_scientific_eligibility_decisions (id, organization_id, subject_type, material_id, chemical_entity_id, result, reason_codes, policy_version, evidence_hash, evaluated_by) VALUES ($1,$2,'MATERIAL_PRODUCT',$3,$4,'REVIEW_REQUIRED','[\"NO_STRUCTURE\"]','test/1',$5,$6)",
    [
      ids.decisionB,
      ids.orgB,
      ids.materialB,
      ids.entityB,
      createHash("sha256").update("tenant-b-decision").digest("hex"),
      ids.userB,
    ],
  );

  const rawPlan = JSON.parse(
    await readFile(
      resolve("docs/v2/material-intelligence/BULK_INGEST_PRECHECK.json"),
      "utf8",
    ),
  );
  const plan = bulkIngestPlanSchema.parse(rawPlan);
  if (plan.results.length !== 1_986)
    throw new Error("LOCAL_FULL_IMPORT_SOURCE_COUNT_MISMATCH");

  await persistence.attestSchemaAndRls(runtimeRole);
  const contextA = await persistence.resolveOperatorContext(
    runtimeRole,
    ids.orgA,
    ids.userA,
  );
  const contextB = await persistence.resolveOperatorContext(
    runtimeRole,
    ids.orgB,
    ids.userB,
  );
  const source = {
    fileSha256: plan.source.fileSha256,
    sheet: plan.source.sheet,
    contractVersion: plan.contractVersion,
    policyVersion: plan.policyVersion,
    retrievedAt: "2026-08-25T00:00:00.000Z",
  };
  const importRunId = "mi_run_" + plan.source.fileSha256.slice(0, 40);
  const counts: MaterialIntelligenceImportCounts = {
    materialProducts: 0,
    chemicalEntities: {},
    components: 0,
    evidence: 0,
    eligibilityDecisions: {},
  };
  let persistedRows = 0;
  for (
    let offset = 0, batch = 1;
    offset < plan.results.length;
    offset += MATERIAL_INTELLIGENCE_IMPORT_BATCH_SIZE, batch += 1
  ) {
    const result = await persistence.persistBatch({
      context: contextA,
      runtimeRole,
      importRunId,
      batchNumber: batch,
      source,
      rows: plan.results.slice(
        offset,
        offset + MATERIAL_INTELLIGENCE_IMPORT_BATCH_SIZE,
      ),
    });
    persistedRows += result.persistedRows;
    mergeCounts(counts, result.counts);
  }
  if (persistedRows !== 1_986 || counts.materialProducts !== 1_986)
    throw new Error("LOCAL_FULL_IMPORT_ACCOUNTING_FAILED");

  let skippedRows = 0;
  let replayPersistedRows = 0;
  for (
    let offset = 0, batch = 1;
    offset < plan.results.length;
    offset += MATERIAL_INTELLIGENCE_IMPORT_BATCH_SIZE, batch += 1
  ) {
    const result = await persistence.persistBatch({
      context: contextA,
      runtimeRole,
      importRunId,
      batchNumber: batch,
      source,
      rows: plan.results.slice(
        offset,
        offset + MATERIAL_INTELLIGENCE_IMPORT_BATCH_SIZE,
      ),
    });
    skippedRows += result.skippedIdempotentRows;
    replayPersistedRows += result.persistedRows;
  }
  if (skippedRows !== 1_986 || replayPersistedRows !== 0)
    throw new Error("LOCAL_FULL_IMPORT_RERUN_IDEMPOTENCY_FAILED");

  const firstRow = plan.results[0]!;
  const firstIdentity = materialIntelligenceSourceIdentity(
    ids.orgA,
    source,
    firstRow.sourceRowId,
  );
  const firstMaterialId = deterministicMaterialIntelligenceId(
    "mat",
    firstIdentity,
  );
  const listA = await reads.listMaterials(contextA, { page: 1, pageSize: 100 });
  if (
    listA.total !== 1_986 ||
    listA.items.some((item) => item.id === ids.materialB)
  )
    throw new Error("LOCAL_FULL_IMPORT_TENANT_A_LIST_FAILED");
  const detail = await reads.getMaterial(contextA, firstMaterialId);
  const entityId = detail.primaryChemicalEntityId;
  if (typeof entityId !== "string")
    throw new Error("LOCAL_FULL_IMPORT_DETAIL_ENTITY_MISSING");
  await reads.getChemicalEntity(contextA, entityId);
  await reads.getMaterialEvidence(contextA, firstMaterialId);
  await reads.getMaterialEligibility(contextA, firstMaterialId);

  const componentRow = plan.results.find((row) => row.componentPlan.length > 0);
  if (!componentRow)
    throw new Error("LOCAL_FULL_IMPORT_COMPONENT_FIXTURE_MISSING");
  const componentIdentity = materialIntelligenceSourceIdentity(
    ids.orgA,
    source,
    componentRow.sourceRowId,
  );
  const componentMaterialId = deterministicMaterialIntelligenceId(
    "mat",
    componentIdentity,
  );
  const components = await reads.getMaterialComponents(
    contextA,
    componentMaterialId,
  );
  if (components.length !== componentRow.componentPlan.length)
    throw new Error("LOCAL_FULL_IMPORT_COMPONENT_READ_FAILED");

  const listB = await reads.listMaterials(contextB, {});
  if (listB.total !== 1 || listB.items[0]?.id !== ids.materialB)
    throw new Error("LOCAL_FULL_IMPORT_TENANT_B_LIST_FAILED");
  await expectNotFound(
    () => reads.getMaterial(contextA, ids.materialB),
    "MATERIAL_NOT_FOUND",
  );
  await expectNotFound(
    () => reads.getChemicalEntity(contextA, ids.entityB),
    "CHEMICAL_ENTITY_NOT_FOUND",
  );
  await expectNotFound(
    () => reads.getMaterialEvidence(contextA, ids.materialB),
    "MATERIAL_NOT_FOUND",
  );
  await expectNotFound(
    () => reads.getMaterialEligibility(contextA, ids.materialB),
    "MATERIAL_NOT_FOUND",
  );
  await expectNotFound(
    () => reads.getMaterial(contextB, firstMaterialId),
    "MATERIAL_NOT_FOUND",
  );
  await expectNotFound(
    () => reads.getChemicalEntity(contextB, entityId),
    "CHEMICAL_ENTITY_NOT_FOUND",
  );

  console.log("MATERIAL_INTELLIGENCE_PERSISTENCE_POSTGRES=PASS");
  console.log("LOCAL_FULL_IMPORT_INPUT_ROWS=1986");
  console.log("LOCAL_FULL_IMPORT_ACCOUNTED_ROWS=1986");
  console.log("LOCAL_FULL_IMPORT_RERUN_DUPLICATES=0");
  console.log("API_RLS_COMPATIBILITY=PASS");
  console.log("TENANT_ISOLATION=PASS");
} finally {
  await prisma.$disconnect().catch(() => undefined);
  await admin.end().catch(() => undefined);
}
