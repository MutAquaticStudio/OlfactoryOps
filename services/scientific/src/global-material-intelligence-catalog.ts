import type { Prisma, PrismaClient } from "@prisma/client";
import { materialIntelligenceListQuerySchema } from "../../../packages/contracts/src/material-intelligence.js";
import { PlatformError, PlatformService } from "../../platform/src/service.js";
import type { PlatformContext } from "../../platform/src/types.js";
import { isMaterialIntelligenceSchemaMissing } from "./material-intelligence-persistence.js";

type Transaction = Prisma.TransactionClient;
type Row = Record<string, unknown>;

type GlobalMaterialDetailRow = Row & {
  id: string;
  canonicalName: string;
  lifecycleStatus: string;
  evidenceStatus: string;
  chemicalEntityId: string | null;
  chemicalEntityName: string | null;
  entityType: string | null;
  resolutionStatus: string | null;
  entityEvidenceStatus: string | null;
  molecularIdentityId: string | null;
  canonicalSmiles: string | null;
  isomericSmiles: string | null;
  inchi: string | null;
  inchiKey: string | null;
  molecularFormula: string | null;
  molecularWeight: number | null;
  exactMass: number | null;
  structureHash: string | null;
  normalizationVersion: string | null;
  releaseKey: string;
  sourceKind: string;
  sourceVersion: string;
  sourceSha256: string;
  schemaVersion: string;
  releaseActivatedAt: Date | string | null;
};

export type GlobalMaterialReference = {
  id: string;
  canonicalName: string;
  scope: "GLOBAL";
  readOnly: true;
};

function validId(value: string) {
  return value.length > 0 && value.length <= 160;
}

function eligibilityFor(material: Row) {
  const resolved =
    material.lifecycleStatus === "ACTIVE" &&
    material.resolutionStatus === "RESOLVED" &&
    material.entityEvidenceStatus === "VERIFIED" &&
    Boolean(material.structureHash);
  return {
    material: {
      subjectType: "MATERIAL_PRODUCT",
      subjectId: material.id,
      result: resolved ? "ELIGIBLE" : "REVIEW_REQUIRED",
      reasonCodes: [
        resolved
          ? "RESOLVED_SINGLE_SUBSTANCE"
          : material.resolutionStatus === "CONFLICTED"
            ? "IDENTITY_CONFLICT"
            : material.structureHash
              ? "UNVERIFIED_STRUCTURE"
              : "NO_STRUCTURE",
      ],
      chemicalEntityId: material.chemicalEntityId ?? null,
      structureHash: material.structureHash ?? null,
      normalizationVersion: material.normalizationVersion ?? null,
      policyVersion: "material-intelligence-global/1.0.0",
    },
    chemicalEntity: material.chemicalEntityId
      ? {
          subjectType: "CHEMICAL_ENTITY",
          subjectId: material.chemicalEntityId,
          result: resolved ? "ELIGIBLE" : "REVIEW_REQUIRED",
          reasonCodes: [
            resolved
              ? "RESOLVED_SINGLE_SUBSTANCE"
              : material.resolutionStatus === "CONFLICTED"
                ? "IDENTITY_CONFLICT"
                : material.structureHash
                  ? "UNVERIFIED_STRUCTURE"
                  : "NO_STRUCTURE",
          ],
          chemicalEntityId: material.chemicalEntityId,
          structureHash: material.structureHash ?? null,
          normalizationVersion: material.normalizationVersion ?? null,
          policyVersion: "material-intelligence-global/1.0.0",
        }
      : null,
  };
}

/**
 * Authenticated, platform-global, SELECT-only Material Intelligence catalog.
 * Tenant operational materials remain owned by Lab Operations and are never
 * joined or rewritten here.
 */
export class GlobalMaterialIntelligenceCatalog {
  constructor(
    private readonly client: PrismaClient,
    private readonly platform: PlatformService,
  ) {}

  private async read<T>(
    context: PlatformContext,
    action: (tx: Transaction) => Promise<T>,
  ) {
    await this.platform.requirePermission(context, "materials.view");
    try {
      return await this.client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`;
        return action(tx);
      });
    } catch (error) {
      if (isMaterialIntelligenceSchemaMissing(error)) {
        throw new PlatformError(
          "MATERIAL_INTELLIGENCE_NOT_AVAILABLE",
          "The global Material Intelligence catalog is not available for this environment.",
          503,
        );
      }
      throw error;
    }
  }

  async listMaterials(context: PlatformContext, rawQuery: unknown) {
    const parsed = materialIntelligenceListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new PlatformError(
        "INVALID_INPUT",
        "Provide bounded global Material Intelligence filters.",
        422,
      );
    }
    const query = parsed.data;
    return this.read(context, async (tx) => {
      const values: unknown[] = [];
      const add = (value: unknown) => {
        values.push(value);
        return "$" + values.length;
      };
      const clauses = [
        "release.status = 'ACTIVE'",
        "material.lifecycle_status = " + add(query.lifecycleStatus),
      ];
      if (query.text) {
        const escaped = query.text.replace(/[\\%_]/g, (match) => "\\" + match);
        const parameter = add("%" + escaped + "%");
        clauses.push(
          "(material.canonical_name ILIKE " +
            parameter +
            " ESCAPE '\\\\' OR entity.preferred_name ILIKE " +
            parameter +
            " ESCAPE '\\\\' OR EXISTS (SELECT 1 FROM v2_global_chemical_identifiers identifier WHERE identifier.chemical_entity_id = entity.id AND identifier.normalized_value ILIKE " +
            parameter +
            " ESCAPE '\\\\'))",
        );
      }
      if (query.evidenceStatus) {
        clauses.push(
          "material.evidence_status = " + add(query.evidenceStatus),
        );
      }
      if (query.resolutionStatus) {
        clauses.push(
          "entity.resolution_status = " + add(query.resolutionStatus),
        );
      }
      if (query.taxonomyNode) {
        const taxonomy = add(query.taxonomyNode.toLowerCase());
        clauses.push(
          "EXISTS (SELECT 1 FROM v2_osmo_taxonomy_assignments assignment JOIN v2_osmo_taxonomy_nodes node ON node.id = assignment.taxonomy_node_id JOIN v2_osmo_taxonomy_releases taxonomy_release ON taxonomy_release.id = assignment.taxonomy_release_id WHERE taxonomy_release.status = 'ACTIVE' AND assignment.canonical_material_id = material.id AND (lower(node.upstream_node_key) = " +
            taxonomy +
            " OR node.normalized_label = " +
            taxonomy +
            "))",
        );
      }
      if (
        query.productClassification &&
        query.productClassification !== "NEAT_SUBSTANCE"
      ) {
        clauses.push("FALSE");
      }
      if (query.eligibility === "ELIGIBLE") {
        clauses.push(
          "entity.resolution_status = 'RESOLVED' AND entity.evidence_status = 'VERIFIED' AND identity.structure_hash IS NOT NULL",
        );
      } else if (query.eligibility === "NOT_ELIGIBLE") {
        clauses.push("FALSE");
      } else if (
        query.eligibility === "REVIEW_REQUIRED" ||
        query.reviewRequired === true
      ) {
        clauses.push(
          "(entity.resolution_status <> 'RESOLVED' OR entity.evidence_status <> 'VERIFIED' OR identity.structure_hash IS NULL)",
        );
      } else if (query.reviewRequired === false) {
        clauses.push(
          "entity.resolution_status = 'RESOLVED' AND entity.evidence_status = 'VERIFIED' AND identity.structure_hash IS NOT NULL",
        );
      }
      const relationSql =
        " FROM v2_global_canonical_materials material JOIN v2_global_material_intelligence_releases release ON release.id = material.release_id LEFT JOIN v2_global_chemical_entities entity ON entity.id = material.chemical_entity_id LEFT JOIN v2_global_molecular_identities identity ON identity.id = entity.molecular_identity_id WHERE " +
        clauses.join(" AND ");
      const countRows = await tx.$queryRawUnsafe<
        Array<{ totalCount: number }>
      >(
        'SELECT count(*)::int AS "totalCount"' + relationSql,
        ...values,
      );
      const listValues = [...values, query.pageSize, (query.page - 1) * query.pageSize];
      const limit = "$" + (listValues.length - 1);
      const offset = "$" + listValues.length;
      const selectSql = [
        'SELECT material.id, material.canonical_name AS "canonicalName",',
        'material.lifecycle_status AS "lifecycleStatus", material.evidence_status AS "evidenceStatus",',
        'entity.id AS "chemicalEntityId", entity.preferred_name AS "chemicalEntityName",',
        'entity.entity_type AS "entityType", entity.resolution_status AS "resolutionStatus",',
        'entity.evidence_status AS "entityEvidenceStatus", identity.molecular_formula AS "molecularFormula",',
        'identity.molecular_weight::float8 AS "molecularWeight", identity.exact_mass::float8 AS "exactMass",',
        'identity.inchikey AS "inchiKey", identity.structure_hash AS "structureHash",',
        'identity.standardization_version AS "normalizationVersion",',
        'release.release_key AS "releaseKey", release.source_version AS "sourceVersion",',
        '(SELECT count(*)::int FROM v2_global_material_source_observations observation WHERE observation.canonical_material_id = material.id) AS "sourceObservationCount",',
        '(SELECT count(*)::int FROM v2_global_physical_property_assertions assertion WHERE assertion.canonical_material_id = material.id OR assertion.chemical_entity_id = entity.id) AS "physicalPropertyCount",',
        'ARRAY(SELECT DISTINCT node.label FROM v2_osmo_taxonomy_assignments assignment JOIN v2_osmo_taxonomy_nodes node ON node.id = assignment.taxonomy_node_id JOIN v2_osmo_taxonomy_releases taxonomy_release ON taxonomy_release.id = assignment.taxonomy_release_id WHERE taxonomy_release.status = \'ACTIVE\' AND (assignment.canonical_material_id = material.id OR assignment.chemical_entity_id = entity.id) ORDER BY node.label) AS "taxonomyLabels"',
      ].join(" ");
      const rows = await tx.$queryRawUnsafe<Row[]>(
        selectSql + relationSql +
          " ORDER BY material.canonical_name, material.id LIMIT " +
          limit +
          " OFFSET " +
          offset,
        ...listValues,
      );
      return {
        scope: "GLOBAL" as const,
        readOnly: true as const,
        items: rows.map((row) => ({
          ...row,
          name: row.canonicalName,
          scope: "GLOBAL" as const,
          readOnly: true as const,
          productClassification: "NEAT_SUBSTANCE" as const,
          reviewRequired:
            row.resolutionStatus !== "RESOLVED" ||
            row.entityEvidenceStatus !== "VERIFIED" ||
            !row.structureHash,
          eligibilityResult:
            row.lifecycleStatus === "ACTIVE" &&
            row.resolutionStatus === "RESOLVED" &&
            row.entityEvidenceStatus === "VERIFIED" &&
            Boolean(row.structureHash)
              ? "ELIGIBLE"
              : "REVIEW_REQUIRED",
          primaryChemicalEntityId: row.chemicalEntityId,
          primaryChemicalEntityName: row.chemicalEntityName,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total: countRows[0]?.totalCount ?? 0,
      };
    });
  }

  async getMaterial(context: PlatformContext, materialId: string) {
    if (!validId(materialId)) {
      throw new PlatformError(
        "INVALID_INPUT",
        "Provide a valid global material identifier.",
        422,
      );
    }
    return this.read(context, async (tx) => {
      const rows = await tx.$queryRawUnsafe<GlobalMaterialDetailRow[]>(
        'SELECT material.id, material.canonical_name AS "canonicalName", material.lifecycle_status AS "lifecycleStatus", material.evidence_status AS "evidenceStatus", entity.id AS "chemicalEntityId", entity.preferred_name AS "chemicalEntityName", entity.entity_type AS "entityType", entity.resolution_status AS "resolutionStatus", entity.evidence_status AS "entityEvidenceStatus", identity.id AS "molecularIdentityId", identity.canonical_smiles AS "canonicalSmiles", identity.isomeric_smiles AS "isomericSmiles", identity.inchi, identity.inchikey AS "inchiKey", identity.molecular_formula AS "molecularFormula", identity.molecular_weight::float8 AS "molecularWeight", identity.exact_mass::float8 AS "exactMass", identity.structure_hash AS "structureHash", identity.standardization_version AS "normalizationVersion", release.release_key AS "releaseKey", release.source_kind AS "sourceKind", release.source_version AS "sourceVersion", release.source_sha256 AS "sourceSha256", release.schema_version AS "schemaVersion", release.activated_at AS "releaseActivatedAt" FROM v2_global_canonical_materials material JOIN v2_global_material_intelligence_releases release ON release.id = material.release_id LEFT JOIN v2_global_chemical_entities entity ON entity.id = material.chemical_entity_id LEFT JOIN v2_global_molecular_identities identity ON identity.id = entity.molecular_identity_id WHERE release.status = \'ACTIVE\' AND material.id = $1 LIMIT 1',
        materialId,
      );
      if (!rows[0]) {
        throw new PlatformError(
          "MATERIAL_NOT_FOUND",
          "The requested global material is not available.",
          404,
        );
      }
      const material = rows[0];
      const chemicalEntityId = material.chemicalEntityId;
      const [identifiers, physicalProperties, taxonomy, provenanceSources] =
        await Promise.all([
          chemicalEntityId
            ? tx.$queryRawUnsafe<Row[]>(
                'SELECT id, identifier_type AS "type", identifier_value AS "value", normalized_value AS "normalizedValue", source_kind AS "sourceKind", source_ref AS "sourceRef", source_version AS "sourceVersion", evidence_status AS "evidenceStatus", content_hash AS "contentHash" FROM v2_global_chemical_identifiers WHERE chemical_entity_id = $1 ORDER BY identifier_type, normalized_value, id LIMIT 200',
                chemicalEntityId,
              )
            : Promise.resolve([]),
          tx.$queryRawUnsafe<Row[]>(
            'SELECT id, property_key AS "propertyKey", value_kind AS "valueKind", numeric_value::float8 AS "numericValue", numeric_min::float8 AS "numericMin", numeric_max::float8 AS "numericMax", text_value AS "textValue", unit, conditions, source_kind AS "sourceKind", source_ref AS "sourceRef", source_version AS "sourceVersion", evidence_status AS "evidenceStatus", content_hash AS "contentHash", retrieved_at AS "retrievedAt" FROM v2_global_physical_property_assertions WHERE canonical_material_id = $1 OR chemical_entity_id = $2 ORDER BY property_key, retrieved_at DESC, id LIMIT 300',
            materialId,
            chemicalEntityId ?? null,
          ),
          tx.$queryRawUnsafe<Row[]>(
            'SELECT node.id, node.upstream_node_key AS "upstreamNodeKey", node.label, node.description, parent.upstream_node_key AS "parentNodeKey", parent.label AS "parentLabel", assignment.assignment_kind AS "assignmentKind", assignment.confidence::float8 AS confidence, assignment.evidence_status AS "evidenceStatus", assignment.source_ref AS "sourceRef", assignment.source_version AS "sourceVersion", taxonomy_release.upstream_repository AS "upstreamRepository", taxonomy_release.upstream_commit AS "upstreamCommit", taxonomy_release.license_spdx AS "licenseSpdx" FROM v2_osmo_taxonomy_assignments assignment JOIN v2_osmo_taxonomy_nodes node ON node.id = assignment.taxonomy_node_id LEFT JOIN v2_osmo_taxonomy_nodes parent ON parent.id = node.parent_node_id JOIN v2_osmo_taxonomy_releases taxonomy_release ON taxonomy_release.id = assignment.taxonomy_release_id WHERE taxonomy_release.status = \'ACTIVE\' AND (assignment.canonical_material_id = $1 OR assignment.chemical_entity_id = $2) ORDER BY node.sort_order, node.label, node.id LIMIT 300',
            materialId,
            chemicalEntityId ?? null,
          ),
          tx.$queryRawUnsafe<Row[]>(
            'SELECT source_row_number AS "sourceRowNumber", source_record_key AS "sourceRecordKey", source_name AS "sourceName", disposition, disposition_reason AS "dispositionReason", content_hash AS "contentHash" FROM v2_global_material_source_observations WHERE canonical_material_id = $1 ORDER BY source_row_number, id LIMIT 500',
            materialId,
          ),
        ]);
      return {
        ...material,
        name: material.canonicalName,
        scope: "GLOBAL" as const,
        readOnly: true as const,
        productClassification: "NEAT_SUBSTANCE" as const,
        identifiers,
        physicalProperties,
        taxonomy,
        provenanceSources,
        components: [],
        eligibility: eligibilityFor(material),
      };
    });
  }

  async getMaterialComponents(context: PlatformContext, materialId: string) {
    await this.getMaterial(context, materialId);
    return [];
  }

  async getMaterialEvidence(context: PlatformContext, materialId: string) {
    const material = await this.getMaterial(context, materialId);
    return material.provenanceSources;
  }

  async getMaterialEligibility(context: PlatformContext, materialId: string) {
    const material = await this.getMaterial(context, materialId);
    return material.eligibility;
  }

  async getChemicalEntity(context: PlatformContext, entityId: string) {
    if (!validId(entityId)) {
      throw new PlatformError(
        "INVALID_INPUT",
        "Provide a valid global Chemical Entity identifier.",
        422,
      );
    }
    const material = await this.read(context, async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        "SELECT material.id FROM v2_global_canonical_materials material JOIN v2_global_material_intelligence_releases release ON release.id = material.release_id WHERE release.status = 'ACTIVE' AND material.chemical_entity_id = $1 ORDER BY material.canonical_name, material.id LIMIT 1",
        entityId,
      );
      if (!rows[0]) {
        throw new PlatformError(
          "CHEMICAL_ENTITY_NOT_FOUND",
          "The requested global Chemical Entity is not available.",
          404,
        );
      }
      return rows[0].id;
    });
    const detail = await this.getMaterial(context, material);
    return {
      id: detail.chemicalEntityId,
      preferredName: detail.chemicalEntityName,
      entityType: detail.entityType,
      resolutionStatus: detail.resolutionStatus,
      evidenceStatus: detail.entityEvidenceStatus,
      molecularIdentityId: detail.molecularIdentityId,
      canonicalSmiles: detail.canonicalSmiles,
      isomericSmiles: detail.isomericSmiles,
      inchi: detail.inchi,
      inchiKey: detail.inchiKey,
      molecularFormula: detail.molecularFormula,
      molecularWeight: detail.molecularWeight,
      exactMass: detail.exactMass,
      structureHash: detail.structureHash,
      normalizationVersion: detail.normalizationVersion,
      identifiers: detail.identifiers,
      physicalProperties: detail.physicalProperties,
      taxonomy: detail.taxonomy,
      eligibility: detail.eligibility.chemicalEntity,
      scope: "GLOBAL" as const,
      readOnly: true as const,
    };
  }
}
