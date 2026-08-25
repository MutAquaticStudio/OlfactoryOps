import type { Prisma, PrismaClient } from '@prisma/client'
import {
  getScientificEligibilityRequestSchema,
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

export const MATERIAL_INTELLIGENCE_POLICY_VERSION = 'material-intelligence/1.0.0'

type Transaction = Prisma.TransactionClient
type EligibilityRow = {
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
  const assessment = materialIntelligenceAssessmentSchema.parse(rawAssessment)
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

  async getScientificEligibility(context: PlatformContext, rawInput: unknown): Promise<ScientificEligibility> {
    await this.platform.requirePermission(context, 'materials.view')
    await this.platform.requirePermission(context, 'scientific_ai.use')
    const input = getScientificEligibilityRequestSchema.safeParse(rawInput)
    if (!input.success) throw new PlatformError('INVALID_INPUT', 'Provide exactly one material or chemical entity eligibility subject.', 422)
    return this.scoped(context, async (tx) => {
      const rows = input.data.materialId
        ? await tx.$queryRaw<EligibilityRow[]>`
            SELECT material_id AS "materialId", chemical_entity_id AS "chemicalEntityId", result,
              reason_codes AS "reasonCodes", structure_hash AS "structureHash",
              normalization_version AS "normalizationVersion", policy_version AS "policyVersion"
            FROM v2_scientific_eligibility_decisions
            WHERE organization_id = ${context.organizationId} AND material_id = ${input.data.materialId}
            ORDER BY evaluated_at DESC, id DESC LIMIT 1
          `
        : await tx.$queryRaw<EligibilityRow[]>`
            SELECT material_id AS "materialId", chemical_entity_id AS "chemicalEntityId", result,
              reason_codes AS "reasonCodes", structure_hash AS "structureHash",
              normalization_version AS "normalizationVersion", policy_version AS "policyVersion"
            FROM v2_scientific_eligibility_decisions
            WHERE organization_id = ${context.organizationId} AND chemical_entity_id = ${input.data.chemicalEntityId}
            ORDER BY evaluated_at DESC, id DESC LIMIT 1
          `
      const row = rows[0]
      if (!row) throw new PlatformError('SCIENTIFIC_ELIGIBILITY_NOT_EVALUATED', 'Scientific eligibility has not been evaluated for this subject.', 404)
      const subjectType = input.data.materialId ? 'MATERIAL_PRODUCT' : 'CHEMICAL_ENTITY'
      return scientificEligibilitySchema.parse({
        subjectType,
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
