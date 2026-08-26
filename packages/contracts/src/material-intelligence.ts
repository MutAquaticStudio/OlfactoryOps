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

export const materialIntelligenceListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    text: z.string().trim().min(1).max(160).optional(),
    lifecycleStatus: z
      .enum(["DRAFT", "ACTIVE", "SUPERSEDED", "ARCHIVED"])
      .default("ACTIVE"),
    evidenceStatus: materialIntelligenceEvidenceStatusSchema.optional(),
    taxonomyNode: z.string().trim().min(1).max(160).optional(),
    // Bounded compatibility filters while callers move from the tenant
    // Material Product catalog to the global canonical catalog.
    productClassification: materialProductClassificationSchema.optional(),
    eligibility: scientificEligibilityResultSchema.optional(),
    resolutionStatus: identityResolutionStatusSchema.optional(),
    reviewRequired: z
      .preprocess(
        (value) =>
          value === true || value === "true"
            ? true
            : value === false || value === "false"
              ? false
              : value,
        z.boolean(),
      )
      .optional(),
  })
  .strict();
export type MaterialIntelligenceListQuery = z.infer<
  typeof materialIntelligenceListQuerySchema
>;

export const bulkChemicalEntityActionSchema = z.enum([
  "LINK_VERIFIED_EXISTING",
  "CREATE_VERIFIED_CANDIDATE",
  "CREATE_UNRESOLVED",
  "CREATE_COMPLEX",
  "REVIEW_REQUIRED",
  "NOT_APPLICABLE",
]);

const bulkSourceClaimSchema = z
  .object({
    value: z.string().trim().min(1).max(4_096),
    formatStatus: z.enum(["VALID", "INVALID_CHECKSUM"]),
  })
  .strict();

const bulkComponentPlanSchema = z
  .object({
    componentName: boundedText,
    role: materialComponentRoleSchema,
    concentration: z.number().min(0).max(100).nullable(),
    basis: z.enum(["MASS", "VOLUME", "MASS_PER_VOLUME", "UNKNOWN"]),
    resolutionStatus: identityResolutionStatusSchema,
    candidateChemicalEntity: id.nullable(),
    evidenceRequirement: boundedText,
  })
  .strict();

const bulkVerifiedStructureCandidateSchema = z
  .object({
    canonicalSmiles: z.string().trim().min(1).max(4_096),
    isomericSmiles: z.string().trim().min(1).max(4_096).nullable(),
    inchi: z.string().trim().min(1).max(8_192).nullable(),
    inchiKey: z
      .string()
      .trim()
      .regex(/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/),
    structureHash: sha256,
    normalizationVersion: boundedText,
    rdkitVersion: boundedText,
    molecularFormula: boundedText.nullable(),
    molecularWeight: z.number().positive().finite().nullable(),
    sourceRef: z.string().trim().min(1).max(2_048),
  })
  .strict();

export const bulkIngestPlanRowSchema = z
  .object({
    sourceRowId: z.string().trim().min(1).max(500),
    sourceRowNumber: z.number().int().min(2),
    sourceCatalogNumber: z.union([z.string(), z.number()]).nullable(),
    inputName: z.string().trim().min(1).max(500),
    normalizedDisplayName: z.string().trim().min(1).max(500),
    supplierName: z.string().trim().min(1).max(500).nullable(),
    supplierProductCode: z.string().trim().min(1).max(500).nullable(),
    tradeName: z.string().trim().min(1).max(500).nullable().optional(),
    grade: z.string().trim().min(1).max(500).nullable().optional(),
    physicalForm: z.string().trim().min(1).max(500).nullable().optional(),
    productClassification: materialProductClassificationSchema,
    chemicalEntityAction: bulkChemicalEntityActionSchema,
    resolutionStatus: identityResolutionStatusSchema,
    reviewRequired: z.boolean(),
    sourceCasClaims: z.array(bulkSourceClaimSchema).max(32),
      sourceCasRaw: z.string().trim().min(1).max(4_096).nullable().optional(),
    sourceFemaClaims: z
      .array(z.string().trim().min(1).max(500))
      .max(16)
      .default([]),
    sourceEinecsClaims: z
      .array(z.string().trim().min(1).max(500))
      .max(16)
      .default([]),
    sourceFormula: z.string().trim().min(1).max(500).nullable().optional(),
    sourceMolecularWeight: z.number().positive().finite().nullable().optional(),
    componentPlan: z.array(bulkComponentPlanSchema).max(128),
    eligibilityReasonCodes: z
      .array(z.string().trim().min(1).max(160))
      .min(1)
      .max(32),
    conflictCodes: z.array(z.string().trim().min(1).max(160)).max(32),
    reasonCodes: z.array(z.string().trim().min(1).max(160)).max(64),
    verifiedStructureCandidate: bulkVerifiedStructureCandidateSchema
      .nullable()
      .optional(),
    verifiedExistingEntityId: id.nullable().optional(),
  })
  .passthrough()
  .superRefine((row, ctx) => {
    if (
      row.chemicalEntityAction === "CREATE_VERIFIED_CANDIDATE" &&
      !row.verifiedStructureCandidate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["verifiedStructureCandidate"],
        message: "Verified candidate evidence is required.",
      });
    }
    if (row.chemicalEntityAction === "LINK_VERIFIED_EXISTING") {
      if (!row.verifiedStructureCandidate) {
        ctx.addIssue({
          code: "custom",
          path: ["verifiedStructureCandidate"],
          message:
            "Verified structure evidence is required for a strong identity link.",
        });
      }
      if (!row.verifiedExistingEntityId) {
        ctx.addIssue({
          code: "custom",
          path: ["verifiedExistingEntityId"],
          message:
            "An explicit tenant entity is required for a verified identity link.",
        });
      }
    } else if (row.verifiedExistingEntityId) {
      ctx.addIssue({
        code: "custom",
        path: ["verifiedExistingEntityId"],
        message:
          "Existing entity links are only valid for LINK_VERIFIED_EXISTING.",
      });
    }
  });
export type BulkIngestPlanRow = z.infer<typeof bulkIngestPlanRowSchema>;

export const bulkIngestPlanSchema = z
  .object({
    contractVersion: boundedText,
    policyVersion: boundedText,
    rdkitContract: boundedText,
    source: z
      .object({
        fileName: z.string().trim().min(1).max(500),
        fileSha256: sha256,
        format: z.literal("XLSX"),
        sheet: z.string().trim().min(1).max(500),
        rowCount: z.number().int().positive().max(100_000),
        columnCount: z.number().int().positive().max(10_000),
        supplierContext: z.string().trim().min(1).max(500).nullable(),
      })
      .strict(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    results: z.array(bulkIngestPlanRowSchema).min(1).max(100_000),
    dataPrecheckReady: z.literal(true),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.source.rowCount !== value.results.length) {
      ctx.addIssue({
        code: "custom",
        path: ["results"],
        message: "Source rows and planned rows must reconcile.",
      });
    }
    if (
      value.counts.ROWS_WITH_ZERO_WAVES !== 0 ||
      value.counts.ROWS_WITH_MULTIPLE_WAVES !== 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["counts"],
        message: "Every source row must have exactly one ingest wave.",
      });
    }
    if (
      new Set(value.results.map((row) => row.sourceRowId)).size !==
      value.results.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["results"],
        message: "Source row identities must be unique.",
      });
    }
  });
export type BulkIngestPlan = z.infer<typeof bulkIngestPlanSchema>;

export type MaterialIntelligenceImportAccounting = {
  inputRows: number;
  plannedRows: number;
  persistedRows: number;
  skippedIdempotentRows: number;
  failedRows: number;
  unaccountedRows: number;
};

export type MaterialIntelligenceImportCounts = {
  materialProducts: number;
  chemicalEntities: Record<string, number>;
  components: number;
  evidence: number;
  eligibilityDecisions: Record<string, number>;
};
