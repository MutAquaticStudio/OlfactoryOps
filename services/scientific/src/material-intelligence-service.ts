import type { Prisma, PrismaClient } from '@prisma/client'
import {
  getScientificEligibilityRequestSchema,
  materialIntelligenceListQuerySchema,
  hasMatchingVerifiedStructureEvidence,
  materialIntelligenceAssessmentBaseSchema,
  materialIntelligenceAssessmentSchema,
  scientificEligibilitySchema,
  scientificFeatureCacheIdentitySchema,
  type IdentityMergeDecision,
  type MaterialIntelligenceAssessment,
  type ScientificEligibility,
  type ScientificEligibilityReason,
  type ScientificFeatureCacheIdentity,
  type VerifiedMolecularIdentity,
} from '../../../packages/contracts/src/material-intelligence.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'
import { isMaterialIntelligenceSchemaMissing } from './material-intelligence-persistence.js'

export const MATERIAL_INTELLIGENCE_POLICY_VERSION = 'material-intelligence/1.0.0'

type Transaction = Prisma.TransactionClient
type EligibilityRow = {
  subjectType: ScientificEligibility['subjectType']
  materialId: string | null
  chemicalEntityId: string | null
  result: ScientificEligibility['result']
  reasonCodes: ScientificEligibilityReason[]
  structureHash: string | null
  normalizationVersion: string | null
  policyVersion: string
}

const productReason = {
  DILUTION: 'DILUTION_PRODUCT',
  DEFINED_MIXTURE: 'DEFINED_MIXTURE',
  UNDEFINED_MIXTURE: 'UNDEFINED_MIXTURE',
  NATURAL: 'NATURAL_COMPLEX',
  BASE: 'PROPRIETARY_BASE',
  FORMULATION: 'FORMULATION',
} as const

function eligibility(
  assessment: MaterialIntelligenceAssessment,
  result: ScientificEligibility['result'],
  ...reasonCodes: ScientificEligibilityReason[]
): ScientificEligibility {
  const identity = assessment.chemicalEntity?.molecularIdentity
  return scientificEligibilitySchema.parse({
    subjectType: 'MATERIAL_PRODUCT',
    subjectId: assessment.materialId,
    result,
    reasonCodes,
    chemicalEntityId: assessment.chemicalEntity?.id ?? null,
    structureHash: identity?.structureHash ?? null,
    normalizationVersion: identity?.normalizationVersion ?? null,
    policyVersion: MATERIAL_INTELLIGENCE_POLICY_VERSION,
  })
}

/**
 * Fail-closed scientific eligibility policy. Product identity is evaluated
 * before molecular evidence so a valid active component never makes a
 * dilution, natural, base, or formulation eligible as a neat substance.
 */
export function evaluateScientificEligibility(rawAssessment: unknown): ScientificEligibility {
  const assessment = materialIntelligenceAssessmentBaseSchema.parse(rawAssessment)
  if (!hasMatchingVerifiedStructureEvidence(assessment)) return eligibility(assessment, 'REVIEW_REQUIRED', 'UNVERIFIED_STRUCTURE')
  materialIntelligenceAssessmentSchema.parse(assessment)
  if (assessment.productClassification === 'UNKNOWN') return eligibility(assessment, 'REVIEW_REQUIRED', 'UNKNOWN_COMPOSITION')
  if (assessment.productClassification in productReason) {
    return eligibility(assessment, 'NOT_ELIGIBLE', productReason[assessment.productClassification as keyof typeof productReason])
  }

  const entity = assessment.chemicalEntity
  if (!entity) return eligibility(assessment, 'REVIEW_REQUIRED', 'UNRESOLVED_IDENTITY')
  if (entity.entityType === 'DEFINED_MIXTURE') return eligibility(assessment, 'NOT_ELIGIBLE', 'DEFINED_MIXTURE')
  if (entity.entityType === 'UNDEFINED_OR_VARIABLE_COMPOSITION') return eligibility(assessment, 'NOT_ELIGIBLE', 'UNDEFINED_MIXTURE')
  if (entity.entityType === 'NATURAL_COMPLEX') return eligibility(assessment, 'NOT_ELIGIBLE', 'NATURAL_COMPLEX')
  if (entity.entityType === 'UNKNOWN') return eligibility(assessment, 'REVIEW_REQUIRED', 'UNKNOWN_COMPOSITION')
  if (entity.resolutionStatus === 'CONFLICTED' || entity.evidenceStatus === 'CONFLICTED') return eligibility(assessment, 'REVIEW_REQUIRED', 'IDENTITY_CONFLICT')
  if (entity.resolutionStatus !== 'RESOLVED') return eligibility(assessment, 'REVIEW_REQUIRED', 'UNRESOLVED_IDENTITY')
  if (entity.evidenceStatus !== 'VERIFIED') return eligibility(assessment, 'REVIEW_REQUIRED', 'UNVERIFIED_STRUCTURE')
  if (!entity.molecularIdentity) return eligibility(assessment, 'REVIEW_REQUIRED', 'NO_STRUCTURE')
  if (entity.molecularIdentity.structureSupport !== 'SUPPORTED') return eligibility(assessment, 'REVIEW_REQUIRED', 'UNSUPPORTED_STRUCTURE')
  if (entity.molecularIdentity.stereochemistry === 'UNRESOLVED') return eligibility(assessment, 'REVIEW_REQUIRED', 'STEREOCHEMISTRY_UNRESOLVED')
  return eligibility(assessment, 'ELIGIBLE', 'RESOLVED_SINGLE_SUBSTANCE')
}

/** Only verified structure hashes or compatible verified InChIKeys can merge. */
export function compareVerifiedIdentities(left: VerifiedMolecularIdentity | undefined, right: VerifiedMolecularIdentity | undefined): IdentityMergeDecision {
  if (!left || !right) return { decision: 'REVIEW_REQUIRED', reason: 'STRONG_IDENTIFIER_REQUIRED' }
  if (left.structureHash === right.structureHash && left.inchiKey === right.inchiKey) {
    return { decision: 'SAME_VERIFIED_ENTITY', strongKey: `structure:${left.structureHash}` }
  }
  if (left.structureHash !== right.structureHash) return { decision: 'DISTINCT_VERIFIED_ENTITIES', reason: 'STRUCTURE_HASH_CONFLICT' }
  return { decision: 'DISTINCT_VERIFIED_ENTITIES', reason: 'INCHIKEY_CONFLICT' }
}

export function buildScientificFeatureCacheIdentity(
  eligibilityResult: ScientificEligibility,
  method: string,
  version: string,
): ScientificFeatureCacheIdentity {
  if (eligibilityResult.result !== 'ELIGIBLE' || !eligibilityResult.chemicalEntityId || !eligibilityResult.structureHash || !eligibilityResult.normalizationVersion) {
    throw new PlatformError('SCIENTIFIC_ENTITY_NOT_ELIGIBLE', 'A verified eligible chemical entity is required before feature generation.', 409)
  }
  return scientificFeatureCacheIdentitySchema.parse({
    chemicalEntityId: eligibilityResult.chemicalEntityId,
    structureHash: eligibilityResult.structureHash,
    normalizationVersion: eligibilityResult.normalizationVersion,
    method,
    version,
  })
}

/** Read-only service boundary used by future scientific features. */
export class MaterialIntelligenceService {
  constructor(private readonly client: PrismaClient, private readonly platform: PlatformService) {}

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`
      return action(tx)
    })
  }

  private async read<T>(
    context: PlatformContext,
    action: (tx: Transaction) => Promise<T>,
  ) {
    await this.platform.requirePermission(context, "materials.viewSensitive");
    try {
      return await this.scoped(context, action);
    } catch (error) {
      if (isMaterialIntelligenceSchemaMissing(error)) {
        throw new PlatformError(
          "MATERIAL_INTELLIGENCE_NOT_AVAILABLE",
          "Material Intelligence is not available for this environment.",
          503,
        );
      }
      throw error;
    }
  }

  private async components(
    tx: Transaction,
    context: PlatformContext,
    materialId: string,
  ) {
    return tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'SELECT component.id, component.component_name AS "name", component.component_role AS "role", component.chemical_entity_id AS "chemicalEntityId", component.concentration_kind AS "concentrationKind", component.concentration_min::float8 AS "concentrationMinimum", component.concentration_max::float8 AS "concentrationMaximum", component.concentration_unit AS "concentrationUnit", component.concentration_basis AS "concentrationBasis", component.evidence_status AS "evidenceStatus", entity.preferred_name AS "chemicalEntityName", entity.resolution_status AS "resolutionStatus" FROM v2_material_components component LEFT JOIN v2_chemical_entities entity ON entity.organization_id = component.organization_id AND entity.id = component.chemical_entity_id WHERE component.organization_id = $1 AND component.material_id = $2 ORDER BY component.created_at, component.id LIMIT 128',
      context.organizationId,
      materialId,
    );
  }

  private async evidence(
    tx: Transaction,
    context: PlatformContext,
    materialId: string,
  ) {
    return tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'SELECT evidence.id, evidence.assertion_key AS "assertionKey", evidence.source_kind AS "sourceKind", evidence.source_ref AS "sourceRef", evidence.source_version AS "sourceVersion", evidence.retrieved_at AS "retrievedAt", evidence.evidence_status AS "evidenceStatus", CASE WHEN evidence.material_id IS NOT NULL THEN \'MATERIAL_PRODUCT\' WHEN evidence.chemical_entity_id IS NOT NULL THEN \'CHEMICAL_ENTITY\' ELSE \'MATERIAL_COMPONENT\' END AS "subjectType" FROM v2_material_intelligence_evidence evidence WHERE evidence.organization_id = $1 AND (evidence.material_id = $2 OR evidence.component_id IN (SELECT id FROM v2_material_components WHERE organization_id = $1 AND material_id = $2) OR evidence.chemical_entity_id IN (SELECT chemical_entity_id FROM v2_material_components WHERE organization_id = $1 AND material_id = $2 UNION SELECT chemical_entity_id FROM v2_scientific_eligibility_decisions WHERE organization_id = $1 AND subject_type = \'MATERIAL_PRODUCT\' AND material_id = $2 AND chemical_entity_id IS NOT NULL)) ORDER BY evidence.created_at DESC, evidence.id DESC LIMIT 200',
      context.organizationId,
      materialId,
    );
  }

  private async eligibilitySummary(
    tx: Transaction,
    context: PlatformContext,
    materialId: string,
  ) {
    const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'WITH material_decision AS (SELECT * FROM v2_scientific_eligibility_decisions WHERE organization_id = $1 AND subject_type = \'MATERIAL_PRODUCT\' AND material_id = $2 ORDER BY evaluated_at DESC, id DESC LIMIT 1), entity_decision AS (SELECT decision.* FROM v2_scientific_eligibility_decisions decision JOIN material_decision material ON material.chemical_entity_id = decision.chemical_entity_id WHERE decision.organization_id = $1 AND decision.subject_type = \'CHEMICAL_ENTITY\' AND decision.material_id IS NULL ORDER BY decision.evaluated_at DESC, decision.id DESC LIMIT 1) SELECT subject_type AS "subjectType", CASE WHEN subject_type = \'MATERIAL_PRODUCT\' THEN material_id ELSE chemical_entity_id END AS "subjectId", result, reason_codes AS "reasonCodes", chemical_entity_id AS "chemicalEntityId", structure_hash AS "structureHash", normalization_version AS "normalizationVersion", policy_version AS "policyVersion", evaluated_at AS "evaluatedAt" FROM material_decision UNION ALL SELECT subject_type, chemical_entity_id, result, reason_codes, chemical_entity_id, structure_hash, normalization_version, policy_version, evaluated_at FROM entity_decision',
      context.organizationId,
      materialId,
    );
    return {
      material:
        rows.find((row) => row.subjectType === "MATERIAL_PRODUCT") ?? null,
      chemicalEntity:
        rows.find((row) => row.subjectType === "CHEMICAL_ENTITY") ?? null,
    };
  }

  async listMaterials(context: PlatformContext, rawQuery: unknown) {
    const parsed = materialIntelligenceListQuerySchema.safeParse(rawQuery);
    if (!parsed.success)
      throw new PlatformError(
        "INVALID_INPUT",
        "Provide bounded Material Intelligence filters.",
        422,
      );
    const query = parsed.data;
    return this.read(context, async (tx) => {
      const values: unknown[] = [context.organizationId];
      const clauses = ["material.organization_id = $1"];
      const add = (value: unknown) => {
        values.push(value);
        return "$" + values.length;
      };
      if (query.text) {
        const escaped = query.text.replace(/[\\%_]/g, (match) => "\\" + match);
        const parameter = add("%" + escaped + "%");
        clauses.push(
          "(material.name ILIKE " +
            parameter +
            " ESCAPE '\\\\' OR coalesce(material.trade_name, '') ILIKE " +
            parameter +
            " ESCAPE '\\\\' OR coalesce(material.supplier_name, '') ILIKE " +
            parameter +
            " ESCAPE '\\\\')",
        );
      }
      if (query.productClassification)
        clauses.push(
          "material.product_classification = " +
            add(query.productClassification),
        );
      if (query.eligibility)
        clauses.push("eligibility.result = " + add(query.eligibility));
      if (query.resolutionStatus)
        clauses.push(
          "entity.resolution_status = " + add(query.resolutionStatus),
        );
      if (query.reviewRequired !== undefined)
        clauses.push(
          query.reviewRequired
            ? "material.status = 'REVIEW_REQUIRED'"
            : "material.status <> 'REVIEW_REQUIRED'",
        );
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const limit = "$" + (values.length - 1);
      const offset = "$" + values.length;
      const sql =
        "WITH latest_eligibility AS (SELECT DISTINCT ON (material_id) material_id, chemical_entity_id, result, reason_codes FROM v2_scientific_eligibility_decisions WHERE organization_id = $1 AND subject_type = 'MATERIAL_PRODUCT' ORDER BY material_id, evaluated_at DESC, id DESC) " +
        'SELECT material.id, material.name, material.trade_name AS "tradeName", material.supplier_name AS "supplier", material.product_classification AS "productClassification", entity.resolution_status AS "resolutionStatus", eligibility.result AS "eligibilityResult", eligibility.reason_codes AS "eligibilityReasonCodes", (material.status = \'REVIEW_REQUIRED\') AS "reviewRequired", entity.id AS "primaryChemicalEntityId", entity.preferred_name AS "primaryChemicalEntityName", count(*) OVER()::int AS "totalCount" FROM v2_materials material LEFT JOIN latest_eligibility eligibility ON eligibility.material_id = material.id LEFT JOIN v2_chemical_entities entity ON entity.organization_id = material.organization_id AND entity.id = eligibility.chemical_entity_id WHERE ' +
        clauses.join(" AND ") +
        " ORDER BY material.name, material.id LIMIT " +
        limit +
        " OFFSET " +
        offset;
      const rows = await tx.$queryRawUnsafe<
        Array<Record<string, unknown> & { totalCount: number }>
      >(sql, ...values);
      return {
        items: rows.map(({ totalCount: _totalCount, ...row }) => row),
        page: query.page,
        pageSize: query.pageSize,
        total: rows[0]?.totalCount ?? 0,
      };
    });
  }

  async getMaterial(context: PlatformContext, materialId: string) {
    if (!materialId || materialId.length > 160)
      throw new PlatformError(
        "INVALID_INPUT",
        "Provide a valid material identifier.",
        422,
      );
    return this.read(context, async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
        'WITH latest AS (SELECT * FROM v2_scientific_eligibility_decisions WHERE organization_id = $1 AND subject_type = \'MATERIAL_PRODUCT\' AND material_id = $2 ORDER BY evaluated_at DESC, id DESC LIMIT 1) SELECT material.id, material.name, material.internal_code AS "internalCode", material.status, material.trade_name AS "tradeName", material.supplier_name AS "supplier", material.supplier_product_code AS "supplierProductCode", material.grade, material.physical_form AS "physicalForm", material.product_classification AS "productClassification", (material.status = \'REVIEW_REQUIRED\') AS "reviewRequired", entity.id AS "primaryChemicalEntityId", entity.preferred_name AS "primaryChemicalEntityName", entity.entity_type AS "primaryChemicalEntityType", entity.resolution_status AS "resolutionStatus", entity.evidence_status AS "evidenceStatus" FROM v2_materials material LEFT JOIN latest eligibility ON true LEFT JOIN v2_chemical_entities entity ON entity.organization_id = material.organization_id AND entity.id = eligibility.chemical_entity_id WHERE material.organization_id = $1 AND material.id = $2 LIMIT 1',
        context.organizationId,
        materialId,
      );
      if (!rows[0])
        throw new PlatformError(
          "MATERIAL_NOT_FOUND",
          "The requested material is not available in this workspace.",
          404,
        );
      const [components, evidence, eligibility] = await Promise.all([
        this.components(tx, context, materialId),
        this.evidence(tx, context, materialId),
        this.eligibilitySummary(tx, context, materialId),
      ]);
      return { ...rows[0], components, evidence, eligibility };
    });
  }

  async getMaterialComponents(context: PlatformContext, materialId: string) {
    return this.read(context, async (tx) => {
      const material = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        "SELECT id FROM v2_materials WHERE organization_id = $1 AND id = $2 LIMIT 1",
        context.organizationId,
        materialId,
      );
      if (!material[0])
        throw new PlatformError(
          "MATERIAL_NOT_FOUND",
          "The requested material is not available in this workspace.",
          404,
        );
      return this.components(tx, context, materialId);
    });
  }

  async getMaterialEvidence(context: PlatformContext, materialId: string) {
    return this.read(context, async (tx) => {
      const material = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        "SELECT id FROM v2_materials WHERE organization_id = $1 AND id = $2 LIMIT 1",
        context.organizationId,
        materialId,
      );
      if (!material[0])
        throw new PlatformError(
          "MATERIAL_NOT_FOUND",
          "The requested material is not available in this workspace.",
          404,
        );
      return this.evidence(tx, context, materialId);
    });
  }

  async getMaterialEligibility(context: PlatformContext, materialId: string) {
    return this.read(context, async (tx) => {
      const material = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        "SELECT id FROM v2_materials WHERE organization_id = $1 AND id = $2 LIMIT 1",
        context.organizationId,
        materialId,
      );
      if (!material[0])
        throw new PlatformError(
          "MATERIAL_NOT_FOUND",
          "The requested material is not available in this workspace.",
          404,
        );
      return this.eligibilitySummary(tx, context, materialId);
    });
  }

  async getChemicalEntity(context: PlatformContext, entityId: string) {
    if (!entityId || entityId.length > 160)
      throw new PlatformError(
        "INVALID_INPUT",
        "Provide a valid Chemical Entity identifier.",
        422,
      );
    return this.read(context, async (tx) => {
      const entities = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
        'SELECT entity.id, entity.preferred_name AS "preferredName", entity.entity_type AS "entityType", entity.resolution_status AS "resolutionStatus", entity.evidence_status AS "evidenceStatus", identity.id AS "molecularIdentityId", identity.canonical_smiles AS "canonicalSmiles", NULL::text AS "isomericSmiles", identity.inchi, identity.inchikey AS "inchiKey", identity.structure_hash AS "structureHash", identity.canonicalization_version AS "normalizationVersion", identity.molecular_formula AS "molecularFormula", identity.molecular_weight::float8 AS "molecularWeight" FROM v2_chemical_entities entity LEFT JOIN v2_molecular_identities identity ON identity.organization_id = entity.organization_id AND identity.id = entity.molecular_identity_id WHERE entity.organization_id = $1 AND entity.id = $2 LIMIT 1',
        context.organizationId,
        entityId,
      );
      if (!entities[0])
        throw new PlatformError(
          "CHEMICAL_ENTITY_NOT_FOUND",
          "The requested Chemical Entity is not available in this workspace.",
          404,
        );
      const [identifiers, eligibility] = await Promise.all([
        tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
          'SELECT id, identifier_type AS "type", identifier_value AS "value", normalized_value AS "normalizedValue", evidence_status AS "evidenceStatus", source_ref AS "sourceRef", source_version AS "sourceVersion" FROM v2_chemical_identifiers WHERE organization_id = $1 AND chemical_entity_id = $2 ORDER BY identifier_type, normalized_value, id LIMIT 200',
          context.organizationId,
          entityId,
        ),
        tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
          'SELECT subject_type AS "subjectType", chemical_entity_id AS "subjectId", result, reason_codes AS "reasonCodes", structure_hash AS "structureHash", normalization_version AS "normalizationVersion", policy_version AS "policyVersion", evaluated_at AS "evaluatedAt" FROM v2_scientific_eligibility_decisions WHERE organization_id = $1 AND subject_type = \'CHEMICAL_ENTITY\' AND material_id IS NULL AND chemical_entity_id = $2 ORDER BY evaluated_at DESC, id DESC LIMIT 1',
          context.organizationId,
          entityId,
        ),
      ]);
      return {
        ...entities[0],
        identifiers,
        eligibility: eligibility[0] ?? null,
      };
    });
  }

  async getScientificEligibility(context: PlatformContext, rawInput: unknown): Promise<ScientificEligibility> {
    await this.platform.requirePermission(context, 'materials.view')
    await this.platform.requirePermission(context, 'scientific_ai.use')
    const input = getScientificEligibilityRequestSchema.safeParse(rawInput)
    if (!input.success) throw new PlatformError('INVALID_INPUT', 'Provide exactly one material or chemical entity eligibility subject.', 422)
    return this.scoped(context, async (tx) => {
      const rows = input.data.materialId
        ? await tx.$queryRaw<EligibilityRow[]>`
            SELECT subject_type AS "subjectType", material_id AS "materialId", chemical_entity_id AS "chemicalEntityId", result,
              reason_codes AS "reasonCodes", structure_hash AS "structureHash",
              normalization_version AS "normalizationVersion", policy_version AS "policyVersion"
            FROM v2_scientific_eligibility_decisions
            WHERE organization_id = ${context.organizationId} AND subject_type = 'MATERIAL_PRODUCT' AND material_id = ${input.data.materialId}
            ORDER BY evaluated_at DESC, id DESC LIMIT 1
          `
        : await tx.$queryRaw<EligibilityRow[]>`
            SELECT subject_type AS "subjectType", material_id AS "materialId", chemical_entity_id AS "chemicalEntityId", result,
              reason_codes AS "reasonCodes", structure_hash AS "structureHash",
              normalization_version AS "normalizationVersion", policy_version AS "policyVersion"
            FROM v2_scientific_eligibility_decisions
            WHERE organization_id = ${context.organizationId} AND subject_type = 'CHEMICAL_ENTITY' AND material_id IS NULL AND chemical_entity_id = ${input.data.chemicalEntityId}
            ORDER BY evaluated_at DESC, id DESC LIMIT 1
          `
      const row = rows[0]
      if (!row) throw new PlatformError('SCIENTIFIC_ELIGIBILITY_NOT_EVALUATED', 'Scientific eligibility has not been evaluated for this subject.', 404)
      return scientificEligibilitySchema.parse({
        subjectType: row.subjectType,
        subjectId: input.data.materialId ?? input.data.chemicalEntityId,
        result: row.result,
        reasonCodes: row.reasonCodes,
        chemicalEntityId: row.chemicalEntityId,
        structureHash: row.structureHash,
        normalizationVersion: row.normalizationVersion,
        policyVersion: row.policyVersion,
      })
    })
  }
}
