import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const boundedText = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).optional()
const grams = z.number().finite().positive().max(1_000_000)

export const trialSourceKindSchema = z.enum(['FORMULA_VERSION', 'MANUAL_EXPERIMENT'])
export const trialStatusSchema = z.enum(['DRAFT', 'PLANNED', 'READY', 'IN_PROGRESS', 'PREPARED', 'EVALUATION_READY', 'EVALUATED', 'CLOSED', 'CANCELLED'])
export const trialPreparationStatusSchema = z.enum(['PLANNED', 'WEIGHING', 'CONFIRMED', 'ABORTED'])
export const trialSampleStatusSchema = z.enum(['AVAILABLE', 'ASSIGNED', 'EXPIRED', 'DISPOSED'])
export const sensorySessionStatusSchema = z.enum(['DRAFT', 'SCHEDULED', 'OPEN', 'IN_PROGRESS', 'CLOSED', 'VOIDED'])
export const sensoryDecisionSchema = z.enum(['ACCEPT_DIRECTION', 'REVISE_FORMULA', 'RETEST', 'REJECT_DIRECTION', 'PROMOTE_FOR_PRODUCTION_REVIEW'])
export const sensoryPresentationModeSchema = z.enum(['BLIND', 'BRAND_REVIEW'])
export const sensoryEvidenceStatusSchema = z.enum(['NOT_ENOUGH_EVIDENCE', 'REVIEW_REQUIRED', 'VERIFIED'])

export const trialCreateRequestSchema = z.object({
  title: boundedText(200),
  sourceKind: trialSourceKindSchema.default('FORMULA_VERSION'),
  formulaVersionId: id.optional(),
  manualSource: optionalText(2_000),
  plannedMassGrams: grams.default(100),
  notes: optionalText(2_000),
}).strict().superRefine((value, context) => {
  if (value.sourceKind === 'FORMULA_VERSION' && !value.formulaVersionId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['formulaVersionId'], message: 'An immutable formula version is required for this trial.' })
  if (value.sourceKind === 'MANUAL_EXPERIMENT' && !value.manualSource) context.addIssue({ code: z.ZodIssueCode.custom, path: ['manualSource'], message: 'Document the experimental source.' })
  if (value.sourceKind === 'MANUAL_EXPERIMENT' && value.formulaVersionId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['formulaVersionId'], message: 'A manual experiment cannot silently attach a Formula Version.' })
})
export type TrialCreateRequest = z.infer<typeof trialCreateRequestSchema>

export const trialPlanRequestSchema = z.object({
  plannedAt: z.string().datetime({ offset: true }).optional(),
  targetConcentrationPercent: z.number().finite().positive().max(100).optional(),
  carrier: optionalText(160),
  storageLocation: optionalText(160),
  notes: optionalText(2_000),
}).strict()
export type TrialPlanRequest = z.infer<typeof trialPlanRequestSchema>

export const trialReleaseRequestSchema = z.object({ rationale: boundedText(2_000) }).strict()
export type TrialReleaseRequest = z.infer<typeof trialReleaseRequestSchema>

export const trialWeighingLineSchema = z.object({
  materialId: id,
  requestedGrams: grams,
  lotId: id.optional(),
  reservationId: id.optional(),
  toleranceGrams: z.number().finite().min(0).max(10_000).default(0),
}).strict()
export const trialStartPreparationRequestSchema = z.object({ lines: z.array(trialWeighingLineSchema).min(1).max(100) }).strict().superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.materialId)).size !== value.lines.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'A material may appear only once in a trial weighing plan.' })
})
export type TrialStartPreparationRequest = z.infer<typeof trialStartPreparationRequestSchema>

export const trialWeighingConfirmRequestSchema = z.object({
  lines: z.array(z.object({ lineId: id, lotId: id, actualGrams: grams }).strict()).min(1).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.lineId)).size !== value.lines.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'Each weighing line may be confirmed once.' })
})
export type TrialWeighingConfirmRequest = z.infer<typeof trialWeighingConfirmRequestSchema>

export const trialSampleCreateRequestSchema = z.object({
  sampleCode: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{2,63}$/),
  concentrationPercent: z.number().finite().positive().max(100).optional(),
  carrier: optionalText(160),
  storageLocation: optionalText(160),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  notes: optionalText(1_000),
}).strict()
export type TrialSampleCreateRequest = z.infer<typeof trialSampleCreateRequestSchema>

export const trialEvidenceCreateRequestSchema = z.object({
  evidenceKind: z.enum(['PREPARATION', 'STABILITY', 'QC', 'EXTERNAL_LAB', 'PHOTO', 'DOCUMENT', 'OTHER']),
  objectRef: z.string().trim().min(1).max(1_000),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  preparationId: id.optional(),
  sampleId: id.optional(),
}).strict()
export type TrialEvidenceCreateRequest = z.infer<typeof trialEvidenceCreateRequestSchema>

export const sensoryDimensionSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,63}$/),
  label: boundedText(120),
  kind: z.enum(['RATING', 'ORDINAL', 'DESCRIPTOR', 'TEXT']).default('RATING'),
  minimum: z.number().int().min(0).max(10).default(1),
  maximum: z.number().int().min(1).max(10).default(10),
  required: z.boolean().default(true),
  options: z.array(boundedText(80)).max(40).default([]),
}).strict().superRefine((value, context) => {
  if (value.minimum > value.maximum) context.addIssue({ code: z.ZodIssueCode.custom, path: ['minimum'], message: 'The minimum score cannot exceed the maximum score.' })
  if ((value.kind === 'ORDINAL' || value.kind === 'DESCRIPTOR') && value.options.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Controlled selections need bounded options.' })
})

export const sensoryFormCreateRequestSchema = z.object({
  name: boundedText(160),
  versionLabel: boundedText(80),
  timepoints: z.array(z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/)).min(1).max(24),
  dimensions: z.array(sensoryDimensionSchema).min(1).max(40),
  descriptorVocabulary: z.array(boundedText(80)).max(200).default([]),
  minimumEvidenceCount: z.number().int().min(1).max(100).default(3),
}).strict().superRefine((value, context) => {
  if (new Set(value.timepoints.map((item) => item.toLowerCase())).size !== value.timepoints.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['timepoints'], message: 'Timepoints must be unique.' })
  if (new Set(value.dimensions.map((item) => item.key)).size !== value.dimensions.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dimensions'], message: 'Dimension keys must be unique.' })
})
export type SensoryFormCreateRequest = z.infer<typeof sensoryFormCreateRequestSchema>

export const sensorySessionCreateRequestSchema = z.object({
  formVersionId: id,
  title: boundedText(200),
  blindMode: z.boolean().default(true),
  allowPeerResultsAfterClose: z.boolean().default(false),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  instructions: optionalText(2_000),
}).strict()
export type SensorySessionCreateRequest = z.infer<typeof sensorySessionCreateRequestSchema>

export const sensorySessionTransitionRequestSchema = z.object({ rationale: optionalText(2_000) }).strict()
export type SensorySessionTransitionRequest = z.infer<typeof sensorySessionTransitionRequestSchema>

export const sensoryPanelAssignmentRequestSchema = z.object({ userId: id }).strict()
export const sensorySampleAssignmentRequestSchema = z.object({ sampleId: id, blindCode: z.string().trim().regex(/^[A-Z0-9]{4,16}$/) }).strict()
export type SensorySampleAssignmentRequest = z.infer<typeof sensorySampleAssignmentRequestSchema>
export const sensoryUnblindRequestSchema = z.object({ rationale: boundedText(2_000) }).strict()
export type SensoryUnblindRequest = z.infer<typeof sensoryUnblindRequestSchema>

const ratingMapSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/), z.number().finite().min(0).max(10)).refine((value) => Object.keys(value).length <= 40, 'Too many ratings.')
const controlledResponseSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/), z.union([boundedText(80), z.array(boundedText(80)).max(20)])).refine((value) => Object.keys(value).length <= 40, 'Too many controlled responses.')
export const sensoryEvaluationSubmitRequestSchema = z.object({
  sampleAssignmentId: id,
  timepoint: z.string().trim().min(1).max(64),
  ratings: ratingMapSchema.default({}),
  controlledResponses: controlledResponseSchema.default({}),
  descriptors: z.array(boundedText(80)).max(30).default([]),
  observation: optionalText(2_000),
  comparison: optionalText(1_000),
  preferenceRank: z.number().int().min(1).max(100).optional(),
  final: z.boolean().default(false),
}).strict()
export type SensoryEvaluationSubmitRequest = z.infer<typeof sensoryEvaluationSubmitRequestSchema>

export const sensoryPublicLinkCreateRequestSchema = z.object({
  sampleAssignmentId: id,
  presentationMode: sensoryPresentationModeSchema.default('BLIND'),
  expiresAt: z.string().datetime({ offset: true }),
  maxSubmissions: z.number().int().min(1).max(100).default(24),
}).strict()
export type SensoryPublicLinkCreateRequest = z.infer<typeof sensoryPublicLinkCreateRequestSchema>

export const trialDecisionCreateRequestSchema = z.object({ decision: sensoryDecisionSchema, rationale: boundedText(2_000) }).strict()
export type TrialDecisionCreateRequest = z.infer<typeof trialDecisionCreateRequestSchema>

export const sensoryPublicEvaluationRequestSchema = sensoryEvaluationSubmitRequestSchema.omit({ sampleAssignmentId: true }).extend({
  timepoint: z.string().trim().min(1).max(64),
}).strict()
export type SensoryPublicEvaluationRequest = z.infer<typeof sensoryPublicEvaluationRequestSchema>

export const privateSensoryMemoryProjectionSchema = z.object({
  evidenceCount: z.number().int().nonnegative(),
  minimumEvidenceCount: z.number().int().positive(),
  confidence: sensoryEvidenceStatusSchema,
  descriptorProfile: z.record(z.string(), z.number().finite().min(0).max(10)),
  performanceProfile: z.record(z.string(), z.number().finite().min(0).max(10)),
  timepointProfile: z.record(z.string(), z.record(z.string(), z.number().finite().min(0).max(10))),
  conclusion: z.string().trim().max(2_000).optional(),
}).strict()
export type PrivateSensoryMemoryProjection = z.infer<typeof privateSensoryMemoryProjectionSchema>
