import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
const boundedText = z.string().trim().min(1).max(500)

export const materialProductClassificationSchema = z.enum([
  'NEAT_SUBSTANCE',
  'DILUTION',
  'DEFINED_MIXTURE',
  'UNDEFINED_MIXTURE',
  'NATURAL',
  'BASE',
  'FORMULATION',
  'UNKNOWN',
])
export type MaterialProductClassification = z.infer<typeof materialProductClassificationSchema>

export const chemicalEntityTypeSchema = z.enum([
  'SINGLE_SUBSTANCE',
  'DEFINED_MIXTURE',
  'UNDEFINED_OR_VARIABLE_COMPOSITION',
  'NATURAL_COMPLEX',
  'UNKNOWN',
])
export type ChemicalEntityType = z.infer<typeof chemicalEntityTypeSchema>

export const identityResolutionStatusSchema = z.enum(['UNRESOLVED', 'RESOLVED', 'CONFLICTED', 'NOT_APPLICABLE'])
export type IdentityResolutionStatus = z.infer<typeof identityResolutionStatusSchema>

export const materialIntelligenceEvidenceStatusSchema = z.enum(['UNVERIFIED', 'VERIFIED', 'CONFLICTED', 'REJECTED'])
export type MaterialIntelligenceEvidenceStatus = z.infer<typeof materialIntelligenceEvidenceStatusSchema>

export const materialIntelligenceAssertionKindSchema = z.enum(['STRUCTURE', 'IDENTIFIER', 'COMPOSITION', 'PRODUCT_IDENTITY'])
export const materialIntelligenceEvidenceSubjectTypeSchema = z.enum(['MATERIAL_PRODUCT', 'CHEMICAL_ENTITY', 'MATERIAL_COMPONENT'])

export const materialComponentRoleSchema = z.enum(['ACTIVE', 'CARRIER', 'SOLVENT', 'STABILIZER', 'OTHER', 'UNKNOWN'])
export type MaterialComponentRole = z.infer<typeof materialComponentRoleSchema>

export const concentrationUnitSchema = z.enum(['PERCENT', 'FRACTION', 'PPM', 'UNKNOWN'])
export const concentrationBasisSchema = z.enum(['MASS', 'VOLUME', 'MASS_PER_VOLUME', 'UNKNOWN'])

export const materialComponentSchema = z.object({
  id: id.optional(),
  name: boundedText,
  role: materialComponentRoleSchema,
  chemicalEntityId: id.optional(),
  concentration: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('EXACT'), value: z.number().nonnegative(), unit: concentrationUnitSchema, basis: concentrationBasisSchema }),
    z.object({ kind: z.literal('RANGE'), minimum: z.number().nonnegative(), maximum: z.number().nonnegative(), unit: concentrationUnitSchema, basis: concentrationBasisSchema }).refine((value) => value.maximum >= value.minimum, 'Concentration maximum must be at least the minimum.'),
    z.object({ kind: z.literal('UNKNOWN'), unit: z.literal('UNKNOWN'), basis: z.literal('UNKNOWN') }),
  ]),
  evidenceStatus: materialIntelligenceEvidenceStatusSchema,
  evidenceRefs: z.array(id).max(16).default([]),
}).strict()
export type MaterialComponent = z.infer<typeof materialComponentSchema>

export const materialIntelligenceEvidenceSchema = z.object({
  id,
  sourceKind: z.enum(['PUBLIC_DATABASE_RECORD', 'SUPPLIER_DOCUMENT', 'MATERIAL_DOCUMENT', 'OPERATOR_ASSERTION', 'PILOT_FIXTURE']),
  assertionKind: materialIntelligenceAssertionKindSchema,
  subjectType: materialIntelligenceEvidenceSubjectTypeSchema,
  subjectId: id,
  sourceRef: z.string().trim().min(1).max(2_048),
  sourceVersion: boundedText,
  retrievedAt: z.string().datetime({ offset: true }),
  contentHash: sha256,
  status: materialIntelligenceEvidenceStatusSchema,
}).strict()
export type MaterialIntelligenceEvidence = z.infer<typeof materialIntelligenceEvidenceSchema>

export const verifiedMolecularIdentitySchema = z.object({
  molecularIdentityId: id.optional(),
  canonicalSmiles: z.string().trim().min(1).max(4_096),
  isomericSmiles: z.string().trim().min(1).max(4_096).nullable().optional(),
  inchi: z.string().trim().min(1).max(8_192).nullable().optional(),
  inchiKey: z.string().trim().regex(/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/),
  molecularFormula: boundedText.nullable().optional(),
  molecularWeight: z.number().positive().finite().nullable().optional(),
  structureHash: sha256,
  normalizationVersion: boundedText,
  rdkitVersion: boundedText,
  stereochemistry: z.enum(['RESOLVED', 'UNRESOLVED', 'NOT_APPLICABLE']),
  structureSupport: z.enum(['SUPPORTED', 'UNSUPPORTED', 'UNPROVEN']),
  evidenceRefs: z.array(id).min(1).max(16).refine((refs) => new Set(refs).size === refs.length, 'Molecular identity evidence references must be unique.'),
}).strict()
export type VerifiedMolecularIdentity = z.infer<typeof verifiedMolecularIdentitySchema>

export const chemicalEntityAssessmentSchema = z.object({
  id: id.optional(),
  preferredName: boundedText,
  entityType: chemicalEntityTypeSchema,
  resolutionStatus: identityResolutionStatusSchema,
  evidenceStatus: materialIntelligenceEvidenceStatusSchema,
  molecularIdentity: verifiedMolecularIdentitySchema.optional(),
}).strict().superRefine((value, ctx) => {
  const hasVerifiedStructure = value.resolutionStatus === 'RESOLVED' && value.evidenceStatus === 'VERIFIED' && value.entityType === 'SINGLE_SUBSTANCE'
  if (hasVerifiedStructure !== Boolean(value.molecularIdentity)) {
    ctx.addIssue({ code: 'custom', message: 'Only a verified, resolved single substance may carry a verified molecular identity.' })
  }
})
export type ChemicalEntityAssessment = z.infer<typeof chemicalEntityAssessmentSchema>

export const materialIntelligenceAssessmentBaseSchema = z.object({
  materialId: id,
  materialName: boundedText,
  productClassification: materialProductClassificationSchema,
  chemicalEntity: chemicalEntityAssessmentSchema.optional(),
  components: z.array(materialComponentSchema).max(128).default([]),
  evidence: z.array(materialIntelligenceEvidenceSchema).max(128).default([]),
}).strict()

export type MaterialIntelligenceAssessmentBase = z.infer<typeof materialIntelligenceAssessmentBaseSchema>

export function hasMatchingVerifiedStructureEvidence(assessment: MaterialIntelligenceAssessmentBase) {
  const entity = assessment.chemicalEntity
  const identity = entity?.molecularIdentity
  if (!identity) return true
  if (!entity?.id) return false
  return identity.evidenceRefs.every((reference) => assessment.evidence.some((evidence) =>
    evidence.id === reference
    && evidence.status === 'VERIFIED'
    && evidence.assertionKind === 'STRUCTURE'
    && evidence.subjectType === 'CHEMICAL_ENTITY'
    && evidence.subjectId === entity.id,
  ))
}

export const materialIntelligenceAssessmentSchema = materialIntelligenceAssessmentBaseSchema.superRefine((assessment, ctx) => {
  if (!hasMatchingVerifiedStructureEvidence(assessment)) {
    ctx.addIssue({
      code: 'custom',
      path: ['chemicalEntity', 'molecularIdentity', 'evidenceRefs'],
      message: 'Every molecular identity reference must resolve to VERIFIED STRUCTURE evidence for the same Chemical Entity.',
    })
  }
})
export type MaterialIntelligenceAssessment = z.infer<typeof materialIntelligenceAssessmentSchema>

export const scientificEligibilityResultSchema = z.enum(['ELIGIBLE', 'NOT_ELIGIBLE', 'REVIEW_REQUIRED'])
export const scientificEligibilityReasonSchema = z.enum([
  'RESOLVED_SINGLE_SUBSTANCE',
  'UNRESOLVED_IDENTITY',
  'IDENTITY_CONFLICT',
  'NO_STRUCTURE',
  'DILUTION_PRODUCT',
  'DEFINED_MIXTURE',
  'UNDEFINED_MIXTURE',
  'NATURAL_COMPLEX',
  'PROPRIETARY_BASE',
  'FORMULATION',
  'UNKNOWN_COMPOSITION',
  'UNVERIFIED_STRUCTURE',
  'UNSUPPORTED_STRUCTURE',
  'STEREOCHEMISTRY_UNRESOLVED',
])
export type ScientificEligibilityReason = z.infer<typeof scientificEligibilityReasonSchema>

export const scientificFeatureCacheIdentitySchema = z.object({
  chemicalEntityId: id,
  structureHash: sha256,
  normalizationVersion: boundedText,
  method: boundedText,
  version: boundedText,
}).strict()
export type ScientificFeatureCacheIdentity = z.infer<typeof scientificFeatureCacheIdentitySchema>

export const scientificEligibilitySchema = z.object({
  subjectType: z.enum(['MATERIAL_PRODUCT', 'CHEMICAL_ENTITY']),
  subjectId: id,
  result: scientificEligibilityResultSchema,
  reasonCodes: z.array(scientificEligibilityReasonSchema).min(1),
  chemicalEntityId: id.nullable(),
  structureHash: sha256.nullable(),
  normalizationVersion: boundedText.nullable(),
  policyVersion: boundedText,
}).strict()
export type ScientificEligibility = z.infer<typeof scientificEligibilitySchema>

export const getScientificEligibilityRequestSchema = z.object({
  materialId: id.optional(),
  chemicalEntityId: id.optional(),
}).strict().refine((value) => Boolean(value.materialId) !== Boolean(value.chemicalEntityId), 'Provide exactly one eligibility subject.')

export type IdentityMergeDecision =
  | { decision: 'SAME_VERIFIED_ENTITY'; strongKey: string }
  | { decision: 'DISTINCT_VERIFIED_ENTITIES'; reason: 'STRUCTURE_HASH_CONFLICT' | 'INCHIKEY_CONFLICT' }
  | { decision: 'REVIEW_REQUIRED'; reason: 'STRONG_IDENTIFIER_REQUIRED' | 'EVIDENCE_NOT_VERIFIED' }
