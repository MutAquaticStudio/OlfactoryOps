import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const hash = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
const boundedText = (max: number) => z.string().trim().min(1).max(max)

export const formulaOriginSchema = z.enum(['MANUAL', 'DESIGN_STUDIO', 'PARENT_VERSION', 'REFORMULATION_OPTIMIZER'])
export const formulaDraftStatusSchema = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'])
export const formulaComponentSchema = z.object({
  materialId: id,
  percentage: z.number().finite().positive().max(100),
  position: z.number().int().min(0).max(9_999),
  note: z.string().trim().max(1_000).optional(),
}).strict()

export const createFormulaProjectRequestSchema = z.object({
  name: boundedText(200),
  formulaType: z.enum(['ACCORD', 'FINE_FRAGRANCE']).default('FINE_FRAGRANCE'),
  finalProductContext: z.string().trim().max(500).optional(),
  concentrationPercent: z.number().finite().positive().max(100).optional(),
}).strict()

export const createFormulaDraftRequestSchema = z.object({
  origin: formulaOriginSchema.default('MANUAL'),
  originRef: z.string().trim().max(160).optional(),
  components: z.array(formulaComponentSchema).min(1).max(250),
  targetMassGrams: z.number().finite().positive().max(1_000_000).default(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.components.map((component) => component.materialId)).size !== value.components.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Each material may appear only once in a formula draft.' })
  }
  if (new Set(value.components.map((component) => component.position)).size !== value.components.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Each component position must be unique.' })
  }
})

export const replaceFormulaDraftComponentsRequestSchema = z.object({
  components: z.array(formulaComponentSchema).min(1).max(250),
  targetMassGrams: z.number().finite().positive().max(1_000_000).default(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.components.map((component) => component.materialId)).size !== value.components.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Each material may appear only once in a formula draft.' })
  if (new Set(value.components.map((component) => component.position)).size !== value.components.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Each component position must be unique.' })
})

export const formulaReviewDecisionRequestSchema = z.object({
  rationale: z.string().trim().min(1).max(2_000),
}).strict()

export const structuredBriefSchema = z.object({
  product: z.object({ type: z.enum(['ACCORD', 'FINE_FRAGRANCE']), concentrationPercent: z.number().finite().positive().max(100).optional() }).strict(),
  creativeDirection: boundedText(2_000),
  performance: z.array(boundedText(120)).max(20).default([]),
  audience: z.array(boundedText(120)).max(20).default([]),
  markets: z.array(boundedText(120)).max(20).default([]),
  ifraCategory: z.string().trim().max(120).optional(),
  availabilityFirst: z.boolean().default(false),
  budget: z.object({ currency: z.string().trim().min(3).max(8), maxPerKg: z.number().finite().positive().max(1_000_000) }).optional(),
  requiredMaterialIds: z.array(id).max(100).default([]),
  prohibitedMaterialIds: z.array(id).max(100).default([]),
  unresolvedQuestions: z.array(boundedText(500)).max(30).default([]),
}).strict().superRefine((value, context) => {
  const both = value.requiredMaterialIds.filter((materialId) => value.prohibitedMaterialIds.includes(materialId))
  if (both.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredMaterialIds'], message: 'A material cannot be both required and prohibited.' })
})

export const createDesignProjectRequestSchema = z.object({ name: boundedText(200), rawBrief: boundedText(5_000), formulaProjectId: id.optional() }).strict()
export const reviewDesignBriefRequestSchema = z.object({ structuredBrief: structuredBriefSchema }).strict()
export const candidateEvidenceReferencesSchema = z.object({
  materialEvidenceSourceIds: z.array(id).max(64).default([]),
  scientificArtifactIds: z.array(id).max(64).default([]),
  consumerPreferenceVectorId: id.optional(),
}).strict()
export type CandidateEvidenceReferences = z.infer<typeof candidateEvidenceReferencesSchema>
export const createCandidateRequestSchema = z.object({
  narrative: boundedText(4_000),
  components: z.array(formulaComponentSchema).min(1).max(100),
  evidenceReferences: candidateEvidenceReferencesSchema.optional(),
}).strict()
export const shareCandidateRequestSchema = z.object({ recipientUserIds: z.array(id).min(1).max(50).transform((value) => [...new Set(value)]), allowMaterialNames: z.boolean().default(false) }).strict()
export const feedbackRequestSchema = z.object({ rating: z.number().int().min(1).max(5).optional(), comment: z.string().trim().min(1).max(2_000).optional() }).strict().refine((value) => value.rating !== undefined || value.comment !== undefined, 'Provide a rating or comment.')

export const materialEvidenceQuerySchema = z.object({ materialId: id, query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(10).default(5) }).strict()

export const agentRunRequestSchema = z.object({ designProjectId: id, workflowKey: z.literal('design-studio/1'), inputHash: hash }).strict()
export const agentConfirmationDecisionSchema = z.object({ accept: z.boolean() }).strict()

export type FormulaComponent = z.infer<typeof formulaComponentSchema>
export type StructuredBrief = z.infer<typeof structuredBriefSchema>
