import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const hash = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
const boundedText = (max: number) => z.string().trim().min(1).max(max)
const percentage = z.number().finite().positive().max(100)

export const optimizerRunStatusSchema = z.enum(['QUEUED', 'SOLVING', 'COMPLETED', 'FAILED', 'CANCELLED', 'ARCHIVED'])
export const optimizerCandidateStatusSchema = z.enum(['ADVISORY', 'SAVED_AS_DRAFT', 'REJECTED', 'ARCHIVED'])
export const optimizerComplianceModeSchema = z.enum(['REPORT_ONLY', 'APPROVED_EVIDENCE_ONLY'])

export const optimizerConstraintSchema = z.object({
  requiredMaterialIds: z.array(id).max(100).default([]),
  prohibitedMaterialIds: z.array(id).max(100).default([]),
  replaceMaterialIds: z.array(id).max(100).default([]),
  allowedMaterialIds: z.array(id).max(2_000).optional(),
  minComponentCount: z.number().int().min(1).max(250).default(1),
  maxComponentCount: z.number().int().min(1).max(250).default(32),
  requiredComplianceCategory: z.string().trim().min(1).max(120).optional(),
  complianceMode: optimizerComplianceModeSchema.default('REPORT_ONLY'),
  requireAvailableInventory: z.boolean().default(false),
  targetCostPerKg: z.number().finite().positive().max(10_000_000).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
}).strict().superRefine((value, context) => {
  if (value.minComponentCount > value.maxComponentCount) context.addIssue({ code: z.ZodIssueCode.custom, path: ['minComponentCount'], message: 'Minimum component count cannot exceed maximum component count.' })
  const prohibited = new Set(value.prohibitedMaterialIds)
  const replacements = new Set(value.replaceMaterialIds)
  for (const materialId of value.requiredMaterialIds) {
    if (prohibited.has(materialId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredMaterialIds'], message: 'A material cannot be both required and prohibited.' })
    if (replacements.has(materialId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredMaterialIds'], message: 'A material cannot be both required and marked for replacement.' })
  }
  if (value.targetCostPerKg !== undefined && !value.currency) context.addIssue({ code: z.ZodIssueCode.custom, path: ['currency'], message: 'A currency is required when a target cost is supplied.' })
})
export type OptimizerConstraint = z.infer<typeof optimizerConstraintSchema>

export const optimizerObjectiveWeightsSchema = z.object({
  odorSimilarity: z.number().finite().min(0).max(1).default(0.45),
  briefAlignment: z.number().finite().min(0).max(1).default(0.15),
  availability: z.number().finite().min(0).max(1).default(0.15),
  cost: z.number().finite().min(0).max(1).default(0),
  sensoryEvidence: z.number().finite().min(0).max(1).default(0.05),
  consumerEvidence: z.number().finite().min(0).max(1).default(0.05),
}).strict().refine((value) => Object.values(value).some((weight) => weight > 0), 'At least one optimizer objective must be weighted.')
export type OptimizerObjectiveWeights = z.infer<typeof optimizerObjectiveWeightsSchema>

export const optimizerSolverConfigSchema = z.object({
  algorithmVersion: z.literal('reformulation/1').default('reformulation/1'),
  candidateLimit: z.number().int().min(1).max(12).default(3),
  randomSeed: z.number().int().min(0).max(2_147_483_647).default(0),
}).strict()
export type OptimizerSolverConfig = z.infer<typeof optimizerSolverConfigSchema>

export const optimizerRunCreateSchema = z.object({
  parentFormulaVersionId: id,
  constraints: optimizerConstraintSchema,
  objectives: optimizerObjectiveWeightsSchema.default({ odorSimilarity: 0.45, briefAlignment: 0.15, availability: 0.15, cost: 0, sensoryEvidence: 0.05, consumerEvidence: 0.05 }),
  solverConfig: optimizerSolverConfigSchema.default({ algorithmVersion: 'reformulation/1', candidateLimit: 3, randomSeed: 0 }),
}).strict()
export type OptimizerRunCreateInput = z.infer<typeof optimizerRunCreateSchema>

export const optimizerCandidateDecisionSchema = z.object({
  decision: z.enum(['SAVE_AS_DRAFT', 'REJECT', 'ARCHIVE']),
  formulaProjectId: id.optional(),
  rationale: boundedText(2_000),
}).strict().superRefine((value, context) => {
  if (value.decision === 'SAVE_AS_DRAFT' && !value.formulaProjectId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['formulaProjectId'], message: 'Select the target Formula Project before saving an advisory candidate as a draft.' })
  if (value.decision !== 'SAVE_AS_DRAFT' && value.formulaProjectId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['formulaProjectId'], message: 'A Formula Project is only accepted when saving a candidate as a draft.' })
})
export type OptimizerCandidateDecision = z.infer<typeof optimizerCandidateDecisionSchema>

export const importKindSchema = z.enum(['MATERIALS', 'SUPPLIERS', 'SUPPLIER_OFFERS', 'OPENING_INVENTORY'])
export const importFormatSchema = z.enum(['CSV', 'XLSX'])
export const importStatusSchema = z.enum(['RECEIVED', 'PARSED', 'VALIDATED', 'COMMITTED', 'FAILED', 'CANCELLED'])
export const importRowStatusSchema = z.enum(['VALID', 'INVALID', 'DUPLICATE', 'SKIPPED', 'COMMITTED'])
export const importMappingSchema = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/), z.string().trim().min(1).max(160)).default({})

export const importCreateSchema = z.object({
  kind: importKindSchema,
  format: importFormatSchema,
  fileName: z.string().trim().min(1).max(240).regex(/^[^\\/:*?"<>|\x00-\x1f]+$/, 'Use a safe source file name.'),
  contentBase64: z.string().trim().min(4).max(8_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  mapping: importMappingSchema,
  dryRun: z.boolean().default(true),
}).strict()
export type ImportCreateInput = z.infer<typeof importCreateSchema>

export const importCommitSchema = z.object({
  confirmationToken: z.string().trim().min(32).max(200),
  mode: z.literal('CREATE_ONLY').default('CREATE_ONLY'),
}).strict()
export type ImportCommitInput = z.infer<typeof importCommitSchema>

export const dataOpsRunRequestSchema = z.object({
  importJobId: id,
  adapter: z.enum(['LOCAL_QUALITY_GATE', 'VEXO']).default('LOCAL_QUALITY_GATE'),
}).strict()
export type DataOpsRunRequest = z.infer<typeof dataOpsRunRequestSchema>

export const bulkOperationKindSchema = z.enum(['MATERIAL_STATUS', 'SUPPLIER_STATUS', 'SUPPLIER_OFFER_STATUS'])
export const bulkOperationStatusSchema = z.enum(['PREVIEWED', 'CONFIRMED', 'COMPLETED', 'FAILED', 'CANCELLED'])
export const bulkOperationPreviewSchema = z.object({
  kind: bulkOperationKindSchema,
  targetIds: z.array(id).min(1).max(200).transform((values) => [...new Set(values)]),
  payload: z.object({ status: z.enum(['DRAFT', 'REVIEW_REQUIRED', 'ACTIVE', 'BLOCKED', 'ARCHIVED', 'SUSPENDED', 'EXPIRED']) }).strict(),
  rationale: boundedText(1_000),
}).strict()
export type BulkOperationPreview = z.infer<typeof bulkOperationPreviewSchema>

export const bulkOperationCommitSchema = z.object({ confirmationToken: z.string().trim().min(32).max(200) }).strict()
export type BulkOperationCommit = z.infer<typeof bulkOperationCommitSchema>

export const advancedProvenanceSchema = z.object({
  parentFormulaContentHash: hash,
  materialUniverseHash: hash,
  constraintHash: hash,
  objectiveHash: hash,
  solverConfigHash: hash,
  evidenceHash: hash,
}).strict()
export type AdvancedProvenance = z.infer<typeof advancedProvenanceSchema>

export const safeSpreadsheetCellSchema = z.string().max(4_000).refine((value) => !/^[=@+\-]/.test(value.trim()), 'Spreadsheet formula-like cells are not accepted.')
export const spreadsheetRowSchema = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/), safeSpreadsheetCellSchema)
export type SpreadsheetRow = z.infer<typeof spreadsheetRowSchema>

export const candidateComponentProposalSchema = z.object({
  materialId: id,
  percentage,
  position: z.number().int().min(0).max(9_999),
  note: z.string().trim().max(1_000).optional(),
}).strict()
export type CandidateComponentProposal = z.infer<typeof candidateComponentProposalSchema>
