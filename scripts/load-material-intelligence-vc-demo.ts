import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import type { Client as PgClient } from "pg";
import { loadPinnedOsmoTaxonomy, PINNED_OSMO_TAXONOMY } from "./osmo-scent-taxonomy.js";

const { Client } = pg;

const FIXTURE_PATH = "services/scientific/testdata/material-intelligence-vc-demo30.json";
const RELEASE_ID = "global-mi-vc-demo-20260826";
const TAXONOMY_RELEASE_ID = "osmo-taxonomy-v1.2-fcd538b578e0";
const SHA256 = /^[a-f0-9]{64}$/;

type SourceObservation = {
  rowNumber: number;
  recordKey: string;
  originalName: string;
  disposition: "GLOBAL_CANONICAL_NEAT" | "DILUTION_MERGED_TO_NEAT";
  contentHash: string;
  observedData: Record<string, unknown>;
};

type PhysicalProperty = {
  propertyKey: string;
  valueKind: "EXACT_NUMERIC" | "RANGE_NUMERIC" | "TEXT";
  numericValue?: number | null;
  numericMin?: number | null;
  numericMax?: number | null;
  textValue?: string | null;
  unit?: string | null;
  conditions?: Record<string, unknown>;
  sourceRef: string;
  sourceVersion: string;
  evidenceStatus: "VERIFIED" | "UNVERIFIED";
  contentHash: string;
  retrievedAt: string;
};

type TaxonomyAssignment = {
  nodeLabel: string;
  assignmentKind: "SOURCE_VERIFIED" | "NORMALIZED" | "MODEL_PREDICTED" | "SENSORY_PANEL";
  confidence?: number | null;
  evidenceStatus: "VERIFIED" | "UNVERIFIED";
  sourceRef: string;
  sourceVersion: string;
  contentHash: string;
};

type DemoMaterial = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  rawDescriptors?: string[];
  sourceObservations: SourceObservation[];
  chemicalEntity: {
    id: string;
    preferredName: string;
    normalizedName: string;
    cas?: string | null;
    pubchemCid: string | number;
    evidence: {
      sourceRef: string;
      sourceVersion: string;
      retrievedAt: string;
      contentHash: string;
      assertions?: Record<string, unknown>;
    };
  };
  molecularIdentity: {
    id: string;
    canonicalSmiles: string;
    isomericSmiles: string;
    inchi: string;
    inchiKey: string;
    molecularFormula: string;
    molecularWeight: number;
    exactMass: number;
    structureHash: string;
    standardizationVersion: string;
    rdkitVersion: string;
  };
  physicalProperties: PhysicalProperty[];
  taxonomyAssignments: TaxonomyAssignment[];
};

export type DemoFixture = {
  contractVersion: string;
  source: {
    workbookSha256: string;
    workbookName: string;
    sheet: string;
    sourceRowCount: number;
  };
  materials: DemoMaterial[];
};

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const normalized = (value: string) => value.trim().toLowerCase();

export function validateDemoFixture(fixture: DemoFixture) {
  if (fixture.contractVersion !== "material-intelligence-vc-demo/1.0.0")
    throw new Error("VC_DEMO_FIXTURE_CONTRACT_INVALID");
  if (fixture.source.workbookSha256 !== "a49bede2801da2e0edb25a305fc3df8b751837e3d0aba6779bf0750e1e456ef4")
    throw new Error("VC_DEMO_WORKBOOK_SHA_MISMATCH");
  if (fixture.source.sheet !== "Material Intelligence" || fixture.source.sourceRowCount !== 1986)
    throw new Error("VC_DEMO_WORKBOOK_SCOPE_INVALID");
  if (fixture.materials.length !== 30) throw new Error("VC_DEMO_VERIFIED_ENTITY_TARGET_INVALID");

  const materialIds = new Set<string>();
  const entityIds = new Set<string>();
  const identityIds = new Set<string>();
  const structures = new Set<string>();
  const sourceRows = new Set<number>();
  let dilutionCount = 0;
  let canonicalRowCount = 0;
  let taxonomyPopulated = 0;

  for (const material of fixture.materials) {
    if (!material.id || materialIds.has(material.id)) throw new Error("VC_DEMO_MATERIAL_ID_INVALID");
    if (!material.chemicalEntity.id || entityIds.has(material.chemicalEntity.id)) throw new Error("VC_DEMO_ENTITY_ID_INVALID");
    if (!material.molecularIdentity.id || identityIds.has(material.molecularIdentity.id)) throw new Error("VC_DEMO_IDENTITY_ID_INVALID");
    materialIds.add(material.id);
    entityIds.add(material.chemicalEntity.id);
    identityIds.add(material.molecularIdentity.id);
    const identity = material.molecularIdentity;
    if (!identity.canonicalSmiles || !identity.isomericSmiles || !identity.inchi || !identity.inchiKey || !identity.molecularFormula || !(identity.molecularWeight > 0) || !(identity.exactMass > 0) || !SHA256.test(identity.structureHash))
      throw new Error(`VC_DEMO_VERIFIED_IDENTITY_INVALID:${material.id}`);
    if (structures.has(identity.structureHash)) throw new Error("VC_DEMO_DUPLICATE_STRUCTURE");
    structures.add(identity.structureHash);
    const evidence = material.chemicalEntity.evidence;
    if (!evidence.sourceRef.startsWith("https://pubchem.ncbi.nlm.nih.gov/compound/") || !SHA256.test(evidence.contentHash))
      throw new Error(`VC_DEMO_IDENTITY_EVIDENCE_INVALID:${material.id}`);
    if (!material.sourceObservations.some((item) => item.disposition === "GLOBAL_CANONICAL_NEAT"))
      throw new Error(`VC_DEMO_NEAT_PROVENANCE_MISSING:${material.id}`);
    for (const observation of material.sourceObservations) {
      if (sourceRows.has(observation.rowNumber) || !SHA256.test(observation.contentHash)) throw new Error("VC_DEMO_SOURCE_OBSERVATION_INVALID");
      sourceRows.add(observation.rowNumber);
      if (observation.disposition === "DILUTION_MERGED_TO_NEAT") dilutionCount += 1;
      if (observation.disposition === "GLOBAL_CANONICAL_NEAT") canonicalRowCount += 1;
    }
    if (material.physicalProperties.length === 0 || material.physicalProperties.some((property) => !SHA256.test(property.contentHash)))
      throw new Error(`VC_DEMO_PHYSICAL_PROPERTY_MISSING:${material.id}`);
    if (material.taxonomyAssignments.length > 0) taxonomyPopulated += 1;
  }
  if (dilutionCount < 1) throw new Error("VC_DEMO_DILUTION_PROVENANCE_MISSING");
  if (taxonomyPopulated < 10) throw new Error("VC_DEMO_TAXONOMY_COVERAGE_INSUFFICIENT");
  return { verifiedEntities: entityIds.size, verifiedIdentities: identityIds.size, sourceRows: sourceRows.size, canonicalRowCount, dilutionCount, taxonomyPopulated };
}

async function insertIdentifier(client: PgClient, material: DemoMaterial, type: string, value: string, sourceKind: string, sourceRef: string, sourceVersion: string, evidenceStatus: string) {
  await client.query(
    `INSERT INTO v2_global_chemical_identifiers
      (id, release_id, chemical_entity_id, identifier_type, identifier_value, normalized_value, source_kind, source_ref, source_version, evidence_status, content_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [`identifier:${material.id}:${type.toLowerCase()}`, RELEASE_ID, material.chemicalEntity.id, type, value, normalized(value), sourceKind, sourceRef, sourceVersion, evidenceStatus, digest(`${material.id}\0${type}\0${value}\0${sourceRef}\0${sourceVersion}`)],
  );
}

export async function loadVcDemo(databaseUrl: string, fixtureText: string) {
  if (process.env.V2_VC_DEMO_ENVIRONMENT !== "staging" || process.env.V2_VC_DEMO_APPLY_APPROVED !== "APPLY_VC_DEMO_STAGING")
    throw new Error("VC_DEMO_STAGING_CONFIRMATION_REQUIRED");
  const fixture = JSON.parse(fixtureText) as DemoFixture;
  const validated = validateDemoFixture(fixture);
  const taxonomy = await loadPinnedOsmoTaxonomy();
  const taxonomyByLabel = new Map(taxonomy.nodes.map((node) => [node.label, node]));
  const assignmentCount = fixture.materials.reduce((sum, material) => sum + material.taxonomyAssignments.length, 0);
  const sourceVersion = `${fixture.source.workbookName} sha256:${fixture.source.workbookSha256}; curated demo30`;
  const fixtureHash = digest(fixtureText);
  const client = new Client({ connectionString: databaseUrl, statement_timeout: 120_000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(`SELECT
      (SELECT count(*)::int FROM v2_global_material_intelligence_releases) AS releases,
      (SELECT count(*)::int FROM v2_global_canonical_materials) AS materials,
      (SELECT count(*)::int FROM v2_global_chemical_entities) AS entities,
      (SELECT count(*)::int FROM v2_global_material_source_observations) AS observations`);
    console.log(`STAGING_BEFORE_RELEASES=${before.rows[0].releases}`);
    console.log(`STAGING_BEFORE_GLOBAL_MATERIALS=${before.rows[0].materials}`);
    console.log(`STAGING_BEFORE_CHEMICAL_ENTITIES=${before.rows[0].entities}`);
    console.log(`STAGING_BEFORE_SOURCE_OBSERVATIONS=${before.rows[0].observations}`);

    const existing = await client.query("SELECT status, source_sha256 FROM v2_global_material_intelligence_releases WHERE id = $1", [RELEASE_ID]);
    if (existing.rows[0]?.status === "ACTIVE") {
      const counts = await verifyCounts(client);
      await client.query("COMMIT");
      return { ...counts, disposition: "REUSED_ACTIVE" as const };
    }
    if (existing.rowCount) throw new Error("VC_DEMO_PARTIAL_RELEASE_REQUIRES_REVIEW");

    await client.query("UPDATE v2_global_material_intelligence_releases SET status = 'SUPERSEDED' WHERE status = 'ACTIVE'");
    await client.query(
      `INSERT INTO v2_global_material_intelligence_releases
       (id, release_key, source_kind, source_ref, source_version, source_sha256, schema_version, importer_version,
        source_row_count, accounted_row_count, global_canonical_neat_count, global_canonical_neat_row_count,
        dilution_merged_to_neat_count, excluded_natural_count, deferred_mixture_count, deferred_base_count, review_required_count)
       VALUES ($1,$2,'CURATED_IMPORT',$3,$4,$5,'global-material-intelligence/1.0.0','vc-demo-loader/1.0.0',$6,$6,30,$7,$8,0,0,0,0)`,
      [RELEASE_ID, "vc-demo-30-20260826", "private-r2://material-intelligence/source-workbook#Material Intelligence", sourceVersion, fixtureHash, validated.sourceRows, validated.canonicalRowCount, validated.dilutionCount],
    );

    for (const material of fixture.materials) {
      const identity = material.molecularIdentity;
      const entity = material.chemicalEntity;
      await client.query(
        `INSERT INTO v2_global_molecular_identities
         (id,release_id,resolution_status,evidence_status,canonical_smiles,isomeric_smiles,inchi,inchikey,molecular_formula,molecular_weight,exact_mass,structure_hash,standardization_version,rdkit_version)
         VALUES ($1,$2,'RESOLVED','VERIFIED',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [identity.id, RELEASE_ID, identity.canonicalSmiles, identity.isomericSmiles, identity.inchi, identity.inchiKey, identity.molecularFormula, identity.molecularWeight, identity.exactMass, identity.structureHash, identity.standardizationVersion, identity.rdkitVersion],
      );
      await client.query(
        `INSERT INTO v2_global_chemical_entities
         (id,release_id,preferred_name,normalized_name,entity_type,resolution_status,evidence_status,molecular_identity_id)
         VALUES ($1,$2,$3,$4,'SINGLE_SUBSTANCE','RESOLVED','VERIFIED',$5)`,
        [entity.id, RELEASE_ID, entity.preferredName, entity.normalizedName, identity.id],
      );
      await client.query(
        `INSERT INTO v2_global_identity_evidence
         (id,release_id,chemical_entity_id,molecular_identity_id,source_kind,source_ref,source_version,retrieved_at,content_hash,evidence_status,assertions)
         VALUES ($1,$2,$3,$4,'AUTHORITATIVE_PUBLIC_DATABASE',$5,$6,$7,$8,'VERIFIED',$9::jsonb)`,
        [`evidence:${material.id}:pubchem`, RELEASE_ID, entity.id, identity.id, entity.evidence.sourceRef, entity.evidence.sourceVersion, entity.evidence.retrievedAt, entity.evidence.contentHash, JSON.stringify(entity.evidence.assertions ?? {})],
      );
      await insertIdentifier(client, material, "PUBCHEM_CID", String(entity.pubchemCid), "AUTHORITATIVE_PUBLIC_DATABASE", entity.evidence.sourceRef, entity.evidence.sourceVersion, "VERIFIED");
      await insertIdentifier(client, material, "INCHIKEY", identity.inchiKey, "AUTHORITATIVE_PUBLIC_DATABASE", entity.evidence.sourceRef, entity.evidence.sourceVersion, "VERIFIED");
      await insertIdentifier(client, material, "INCHI", identity.inchi, "AUTHORITATIVE_PUBLIC_DATABASE", entity.evidence.sourceRef, entity.evidence.sourceVersion, "VERIFIED");
      await insertIdentifier(client, material, "CANONICAL_SMILES", identity.canonicalSmiles, "AUTHORITATIVE_PUBLIC_DATABASE", entity.evidence.sourceRef, entity.evidence.sourceVersion, "VERIFIED");
      await insertIdentifier(client, material, "ISOMERIC_SMILES", identity.isomericSmiles, "AUTHORITATIVE_PUBLIC_DATABASE", entity.evidence.sourceRef, entity.evidence.sourceVersion, "VERIFIED");
      if (entity.cas) await insertIdentifier(client, material, "CAS", entity.cas, "SUPPLIER_WORKBOOK", `private-r2://material-intelligence/source-workbook#${material.sourceObservations[0].recordKey}`, sourceVersion, "UNVERIFIED");
      await client.query(
        `INSERT INTO v2_global_canonical_materials
         (id,release_id,chemical_entity_id,canonical_name,normalized_name,lifecycle_status,evidence_status,sensory_summary)
         VALUES ($1,$2,$3,$4,$5,'ACTIVE','VERIFIED',$6::jsonb)`,
        [material.id, RELEASE_ID, entity.id, material.canonicalName, material.normalizedName, JSON.stringify({ rawDescriptors: material.rawDescriptors ?? [] })],
      );
      for (const observation of material.sourceObservations) {
        await client.query(
          `INSERT INTO v2_global_material_source_observations
           (id,release_id,source_row_number,source_record_key,source_name,normalized_source_name,disposition,canonical_material_id,disposition_reason,content_hash,observed_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
          [`observation:${observation.rowNumber}`, RELEASE_ID, observation.rowNumber, observation.recordKey, observation.originalName, normalized(observation.originalName), observation.disposition, material.id, observation.disposition === "DILUTION_MERGED_TO_NEAT" ? "Authoritative active CAS and explicit concentration/carrier link this source preparation to the verified neat ChemicalEntity." : "Verified authoritative structure links this workbook source row to the canonical neat material.", observation.contentHash, JSON.stringify({ ...observation.observedData, workbookSha256: fixture.source.workbookSha256, sheet: fixture.source.sheet })],
        );
      }
      for (const [index, property] of material.physicalProperties.entries()) {
        await client.query(
          `INSERT INTO v2_global_physical_property_assertions
           (id,release_id,chemical_entity_id,property_key,value_kind,numeric_value,numeric_min,numeric_max,text_value,unit,conditions,source_kind,source_ref,source_version,evidence_status,content_hash,retrieved_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'AUTHORITATIVE_PUBLIC_DATABASE',$12,$13,$14,$15,$16)`,
          [`property:${material.id}:${index}`, RELEASE_ID, entity.id, property.propertyKey, property.valueKind, property.numericValue ?? null, property.numericMin ?? null, property.numericMax ?? null, property.textValue ?? null, property.unit ?? null, JSON.stringify(property.conditions ?? {}), property.sourceRef, property.sourceVersion, property.evidenceStatus, property.contentHash, property.retrievedAt],
        );
      }
    }

    const activeTaxonomy = await client.query("SELECT id, upstream_commit FROM v2_osmo_taxonomy_releases WHERE status = 'ACTIVE'");
    if (activeTaxonomy.rows[0]?.id !== TAXONOMY_RELEASE_ID) {
      await client.query("UPDATE v2_osmo_taxonomy_releases SET status = 'SUPERSEDED' WHERE status = 'ACTIVE'");
      await client.query(
        `INSERT INTO v2_osmo_taxonomy_releases
         (id,upstream_repository,upstream_commit,license_spdx,license_url,source_url,content_hash,node_count,assignment_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [TAXONOMY_RELEASE_ID, PINNED_OSMO_TAXONOMY.repository, PINNED_OSMO_TAXONOMY.commitSha, PINNED_OSMO_TAXONOMY.license, "https://opendatacommons.org/licenses/odbl/1-0/", `https://raw.githubusercontent.com/osmoai/taxonomy/${PINNED_OSMO_TAXONOMY.commitSha}/data/taxonomy.json`, PINNED_OSMO_TAXONOMY.sourceSha256, taxonomy.nodes.length, assignmentCount],
      );
      for (const node of taxonomy.nodes) {
        await client.query(
          `INSERT INTO v2_osmo_taxonomy_nodes
           (id,taxonomy_release_id,upstream_node_key,node_kind,parent_node_id,label,normalized_label,metadata,sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
          [node.key, TAXONOMY_RELEASE_ID, node.key, node.kind, node.parentKey, node.label, normalized(node.label), JSON.stringify(node.metadata), node.ordinal],
        );
      }
    } else {
      const existingAssignments = await client.query("SELECT count(*)::int AS count FROM v2_osmo_taxonomy_assignments WHERE taxonomy_release_id = $1", [TAXONOMY_RELEASE_ID]);
      if (existingAssignments.rows[0].count !== assignmentCount) throw new Error("VC_DEMO_ACTIVE_TAXONOMY_ASSIGNMENT_COUNT_CONFLICT");
    }

    if (!activeTaxonomy.rows[0] || activeTaxonomy.rows[0].id !== TAXONOMY_RELEASE_ID) {
      for (const material of fixture.materials) {
        for (const [index, assignment] of material.taxonomyAssignments.entries()) {
          const node = taxonomyByLabel.get(assignment.nodeLabel);
          if (!node) throw new Error(`VC_DEMO_TAXONOMY_NODE_UNKNOWN:${assignment.nodeLabel}`);
          await client.query(
            `INSERT INTO v2_osmo_taxonomy_assignments
             (id,taxonomy_release_id,taxonomy_node_id,material_intelligence_release_id,canonical_material_id,assignment_kind,confidence,evidence_status,source_ref,source_version,content_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [`assignment:${material.id}:${index}`, TAXONOMY_RELEASE_ID, node.key, RELEASE_ID, material.id, assignment.assignmentKind, assignment.confidence ?? null, assignment.evidenceStatus, assignment.sourceRef, assignment.sourceVersion, assignment.contentHash],
          );
        }
      }
      await client.query("UPDATE v2_osmo_taxonomy_releases SET status = 'ACTIVE', activated_at = now() WHERE id = $1", [TAXONOMY_RELEASE_ID]);
    }
    await client.query("UPDATE v2_global_material_intelligence_releases SET status = 'ACTIVE', activated_at = now() WHERE id = $1", [RELEASE_ID]);
    const counts = await verifyCounts(client);
    await client.query("COMMIT");
    return { ...counts, disposition: "CREATED_ACTIVE" as const };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function verifyCounts(client: PgClient) {
  const result = await client.query(`SELECT
    (SELECT count(*)::int FROM v2_global_chemical_entities entity JOIN v2_global_material_intelligence_releases release ON release.id=entity.release_id WHERE release.status='ACTIVE' AND entity.resolution_status='RESOLVED' AND entity.evidence_status='VERIFIED') AS "verifiedChemicalEntities",
    (SELECT count(*)::int FROM v2_global_molecular_identities identity JOIN v2_global_material_intelligence_releases release ON release.id=identity.release_id WHERE release.status='ACTIVE' AND identity.resolution_status='RESOLVED' AND identity.evidence_status='VERIFIED') AS "verifiedMolecularIdentities",
    (SELECT count(DISTINCT assertion.chemical_entity_id)::int FROM v2_global_physical_property_assertions assertion JOIN v2_global_material_intelligence_releases release ON release.id=assertion.release_id WHERE release.status='ACTIVE' AND assertion.evidence_status='VERIFIED') AS "physicalPropertyEntities",
    (SELECT count(*)::int FROM v2_osmo_taxonomy_assignments assignment JOIN v2_osmo_taxonomy_releases release ON release.id=assignment.taxonomy_release_id WHERE release.status='ACTIVE') AS "osmoAssignments",
    (SELECT count(DISTINCT canonical_material_id)::int FROM v2_osmo_taxonomy_assignments assignment JOIN v2_osmo_taxonomy_releases release ON release.id=assignment.taxonomy_release_id WHERE release.status='ACTIVE') AS "osmoMaterials",
    (SELECT dilution_merged_to_neat_count::int FROM v2_global_material_intelligence_releases WHERE status='ACTIVE') AS "dilutionMergedToNeat",
    has_table_privilege('hyperdrive_user','v2_global_canonical_materials','SELECT') AS "runtimeCanRead",
    (has_table_privilege('hyperdrive_user','v2_global_canonical_materials','INSERT')
      OR has_table_privilege('hyperdrive_user','v2_global_canonical_materials','UPDATE')
      OR has_table_privilege('hyperdrive_user','v2_global_canonical_materials','DELETE')) AS "runtimeCanWrite"`);
  const counts = result.rows[0];
  if (counts.verifiedChemicalEntities !== 30 || counts.verifiedMolecularIdentities !== 30 || counts.physicalPropertyEntities !== 30 || counts.osmoMaterials < 10 || counts.dilutionMergedToNeat < 1 || counts.runtimeCanRead !== true || counts.runtimeCanWrite !== false)
    throw new Error(`VC_DEMO_STAGING_COUNTS_INVALID:${JSON.stringify(counts)}`);
  return counts;
}

async function main() {
  const databaseUrl = process.env.STAGING_DATABASE_URL;
  if (!databaseUrl) throw new Error("STAGING_DATABASE_URL_REQUIRED");
  const fixtureText = await readFile(FIXTURE_PATH, "utf8");
  const result = await loadVcDemo(databaseUrl, fixtureText);
  console.log(`DEMO_DATA_DISPOSITION=${result.disposition}`);
  console.log(`VERIFIED_CHEMICAL_ENTITY_COUNT=${result.verifiedChemicalEntities}`);
  console.log(`VERIFIED_MOLECULAR_IDENTITY_COUNT=${result.verifiedMolecularIdentities}`);
  console.log(`PHYSICAL_PROPERTY_ENTITY_COUNT=${result.physicalPropertyEntities}`);
  console.log(`OSMO_ASSIGNMENT_COUNT=${result.osmoAssignments}`);
  console.log(`OSMO_MATERIAL_COUNT=${result.osmoMaterials}`);
  console.log(`DILUTION_MERGED_TO_NEAT_COUNT=${result.dilutionMergedToNeat}`);
  console.log("GLOBAL_RUNTIME_READ_ONLY=PASS");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "VC_DEMO_LOAD_FAILED");
    process.exitCode = 1;
  });
}
