import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const hash = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
const boundedText = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).optional()
const grams = z.number().finite().positive().max(1_000_000_000)
const nonNegativeGrams = z.number().finite().nonnegative().max(1_000_000_000)
const boundedObject = z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= 64_000, 'Structured production payload is too large.')

export const productionOrderStatusSchema = z.enum([
  'DRAFT', 'PLANNED', 'READY_FOR_WEIGHING', 'WEIGHING', 'COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING', 'QC',
  'HOLD', 'REWORK', 'RELEASED', 'REJECTED', 'CANCELLED', 'CLOSED',
])
export const productionProcessStageSchema = z.enum(['COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING'])
export const productionProcessStepStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'FAILED'])
export const productionRequirementStatusSchema = z.enum(['PENDING', 'ALLOCATED', 'WEIGHED', 'CONSUMED', 'SHORT', 'CANCELLED'])
export const productionAllocationStatusSchema = z.enum(['PROPOSED', 'ALLOCATED', 'CONSUMED', 'RELEASED', 'CANCELLED', 'EXPIRED'])
export const productionWeighingStatusSchema = z.enum(['PLANNED', 'IN_PROGRESS', 'CONFIRMED', 'ABORTED', 'CORRECTED'])
export const productionQcSpecificationStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'])
export const productionQcCheckKindSchema = z.enum(['NUMERIC', 'TEXT', 'BOOLEAN', 'ENUM'])
export const productionQcResultStatusSchema = z.enum(['PENDING', 'PASSED', 'FAILED', 'NOT_APPLICABLE', 'INVALIDATED'])
export const productionDeviationCategorySchema = z.enum(['MATERIAL', 'WEIGHING', 'PROCESS', 'QC', 'DOCUMENTATION', 'EQUIPMENT', 'OTHER'])
export const productionDeviationSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export const productionDeviationStatusSchema = z.enum(['OPEN', 'UNDER_INVESTIGATION', 'CAPA_REQUIRED', 'CLOSED', 'VOIDED'])
export const productionDeviationDispositionSchema = z.enum(['CONTINUE', 'HOLD', 'REWORK', 'REJECT'])
export const productionCapaActionTypeSchema = z.enum(['CORRECTIVE', 'PREVENTIVE'])
export const productionCapaActionStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'EFFECTIVENESS_PENDING', 'EFFECTIVE', 'INEFFECTIVE', 'CANCELLED'])
export const productionYieldStatusSchema = z.enum(['RECORDED', 'RECONCILED', 'REVIEW_REQUIRED', 'VOIDED'])
export const productionReworkStatusSchema = z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
export const productionReleaseStatusSchema = z.enum(['PENDING', 'RELEASED', 'REJECTED', 'CANCELLED'])
export const finishedGoodLotStatusSchema = z.enum(['QUARANTINE', 'RELEASED', 'HOLD', 'REWORK', 'REJECTED', 'EXHAUSTED', 'EXPIRED', 'ARCHIVED'])
export const finishedGoodBucketSchema = z.enum(['QUARANTINE', 'AVAILABLE', 'HOLD', 'REWORK', 'RESERVED'])
export const finishedGoodLedgerMovementTypeSchema = z.enum([
  'PRODUCTION_OUTPUT', 'QUALITY_HOLD', 'QUALITY_RELEASE', 'REWORK_CONSUMPTION', 'WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
  'RETURN', 'RESERVATION', 'RELEASE_RESERVATION', 'FULFILLMENT',
])
export const productionDocumentKindSchema = z.enum(['FORMULA', 'MATERIAL_SDS', 'MATERIAL_COA', 'PROCESS_RECORD', 'QC_EVIDENCE', 'RELEASE_EVIDENCE', 'OTHER'])
export const productionDocumentSnapshotStatusSchema = z.enum(['ACTIVE', 'SUPERSEDED', 'ARCHIVED'])

export const productionOrderCreateRequestSchema = z.object({
  formulaVersionId: id,
  targetBulkGrams: grams,
  targetOutputGrams: grams.optional(),
  orderNumber: z.string().trim().regex(/^[A-Z0-9][A-Z0-9._/-]{1,79}$/).optional(),
  qcSpecificationId: id.optional(),
  plannedStartAt: z.string().datetime({ offset: true }).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  notes: optionalText(2_000),
}).strict().superRefine((value, context) => {
  if (value.plannedStartAt && value.dueAt && value.dueAt < value.plannedStartAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueAt'], message: 'The due time must not precede the planned start.' })
  }
})
export type ProductionOrderCreateRequest = z.infer<typeof productionOrderCreateRequestSchema>

export const productionOrderPlanRequestSchema = z.object({
  plannedStartAt: z.string().datetime({ offset: true }).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  equipmentRef: z.string().trim().min(1).max(240).optional(),
  notes: optionalText(2_000),
}).strict().superRefine((value, context) => {
  if (!value.plannedStartAt && !value.dueAt && !value.equipmentRef && !value.notes) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide a production planning change.' })
  }
  if (value.plannedStartAt && value.dueAt && value.dueAt < value.plannedStartAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueAt'], message: 'The due time must not precede the planned start.' })
  }
})
export type ProductionOrderPlanRequest = z.infer<typeof productionOrderPlanRequestSchema>

export const productionOrderCancellationRequestSchema = z.object({
  rationale: boundedText(2_000),
}).strict()
export type ProductionOrderCancellationRequest = z.infer<typeof productionOrderCancellationRequestSchema>

export const productionOrderCloseRequestSchema = z.object({
  rationale: boundedText(2_000),
}).strict()
export type ProductionOrderCloseRequest = z.infer<typeof productionOrderCloseRequestSchema>

export const productionAllocationSuggestionRequestSchema = z.object({
  requirementIds: z.array(id).min(1).max(250).transform((value) => [...new Set(value)]).optional(),
  allowPartial: z.boolean().default(false),
}).strict()
export type ProductionAllocationSuggestionRequest = z.infer<typeof productionAllocationSuggestionRequestSchema>

export const productionAllocationLineSchema = z.object({
  requirementId: id,
  lotId: id,
  allocatedGrams: grams,
}).strict()
export const productionAllocationCommitRequestSchema = z.object({
  allocations: z.array(productionAllocationLineSchema).min(1).max(500),
}).strict().superRefine((value, context) => {
  const duplicate = new Set<string>()
  for (const allocation of value.allocations) {
    const key = `${allocation.requirementId}:${allocation.lotId}`
    if (duplicate.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['allocations'], message: 'A requirement and lot may be allocated only once per request.' })
    duplicate.add(key)
  }
})
export type ProductionAllocationCommitRequest = z.infer<typeof productionAllocationCommitRequestSchema>

export const productionWeighingPlanLineSchema = z.object({
  allocationId: id,
  requestedGrams: grams,
  toleranceGrams: nonNegativeGrams.default(0),
}).strict()
export const productionWeighingStartRequestSchema = z.object({
  lines: z.array(productionWeighingPlanLineSchema).min(1).max(500),
}).strict().superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.allocationId)).size !== value.lines.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'An allocation may appear only once in a weighing plan.' })
  }
})
export type ProductionWeighingStartRequest = z.infer<typeof productionWeighingStartRequestSchema>

export const productionWeighingConfirmLineSchema = z.object({
  lineId: id,
  lotId: id,
  actualGrams: grams,
}).strict()
export const productionWeighingConfirmRequestSchema = z.object({
  lines: z.array(productionWeighingConfirmLineSchema).min(1).max(500),
}).strict().superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.lineId)).size !== value.lines.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'Each weighing line may be confirmed once.' })
  }
})
export type ProductionWeighingConfirmRequest = z.infer<typeof productionWeighingConfirmRequestSchema>

/**
 * The production usage is named by the route. This reason is required so a
 * compensating inventory movement remains traceable to a controlled batch
 * correction rather than appearing as a generic stock reversal.
 */
export const productionUsageReversalRequestSchema = z.object({
  reason: boundedText(2_000),
}).strict()
export type ProductionUsageReversalRequest = z.infer<typeof productionUsageReversalRequestSchema>

export const productionProcessStageCompleteRequestSchema = z.object({
  startedAt: z.string().datetime({ offset: true }).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
  actualParameters: boundedObject.default({}),
  documentSnapshotIds: z.array(id).max(100).transform((value) => [...new Set(value)]).default([]),
  notes: optionalText(2_000),
}).strict().superRefine((value, context) => {
  if (value.startedAt && value.completedAt && value.completedAt < value.startedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'A process stage cannot complete before it starts.' })
  }
})
export type ProductionProcessStageCompleteRequest = z.infer<typeof productionProcessStageCompleteRequestSchema>

export const productionQcSpecificationCheckSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,63}$/),
  label: boundedText(160),
  kind: productionQcCheckKindSchema,
  required: z.boolean().default(true),
  minimum: z.number().finite().optional(),
  maximum: z.number().finite().optional(),
  expectedText: z.string().trim().min(1).max(500).optional(),
  allowedValues: z.array(boundedText(160)).min(1).max(100).optional(),
  unit: z.string().trim().min(1).max(40).optional(),
}).strict().superRefine((value, context) => {
  if (value.minimum !== undefined && value.maximum !== undefined && value.minimum > value.maximum) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['maximum'], message: 'The maximum cannot be below the minimum.' })
  }
  if (value.kind === 'NUMERIC' && value.expectedText) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expectedText'], message: 'Numeric checks cannot use expected text.' })
  }
  if (value.kind === 'ENUM' && !value.allowedValues?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedValues'], message: 'Enum checks require allowed values.' })
  }
  if (value.kind !== 'ENUM' && value.allowedValues?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedValues'], message: 'Only enum checks may define allowed values.' })
  }
})
export const productionQcSpecificationCreateRequestSchema = z.object({
  name: boundedText(200),
  versionLabel: boundedText(120),
  formulaVersionId: id.optional(),
  checks: z.array(productionQcSpecificationCheckSchema).min(1).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.checks.map((check) => check.key)).size !== value.checks.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['checks'], message: 'QC check keys must be unique.' })
  }
})
export type ProductionQcSpecificationCreateRequest = z.infer<typeof productionQcSpecificationCreateRequestSchema>

export const productionQcResultRecordRequestSchema = z.object({
  qcSpecificationId: id,
  checkKey: z.string().trim().regex(/^[a-z][a-z0-9_]{1,63}$/),
  observedValue: z.union([z.number().finite(), z.boolean(), z.string().trim().min(1).max(1_000)]).optional(),
  notApplicableReason: optionalText(1_000),
  notes: optionalText(2_000),
  evidenceDocumentSnapshotIds: z.array(id).max(100).transform((value) => [...new Set(value)]).default([]),
}).strict().superRefine((value, context) => {
  if (value.observedValue === undefined && !value.notApplicableReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Record an observed value or document why the check is not applicable.' })
  }
  if (value.observedValue !== undefined && value.notApplicableReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['notApplicableReason'], message: 'A recorded observation cannot also be not applicable.' })
  }
})
export type ProductionQcResultRecordRequest = z.infer<typeof productionQcResultRecordRequestSchema>

export const productionQcApprovalRequestSchema = z.object({
  decision: z.enum(['APPROVE', 'HOLD', 'REJECT']),
  rationale: boundedText(2_000),
}).strict()
export type ProductionQcApprovalRequest = z.infer<typeof productionQcApprovalRequestSchema>

export const productionDocumentSnapshotCreateRequestSchema = z.object({
  documentKind: productionDocumentKindSchema,
  objectRef: z.string().trim().min(1).max(2_048),
  contentHash: hash,
  versionLabel: z.string().trim().min(1).max(160).optional(),
  metadata: boundedObject.default({}),
}).strict()
export type ProductionDocumentSnapshotCreateRequest = z.infer<typeof productionDocumentSnapshotCreateRequestSchema>

export const productionDeviationCreateRequestSchema = z.object({
  category: productionDeviationCategorySchema,
  severity: productionDeviationSeveritySchema,
  description: boundedText(4_000),
  detectedAt: z.string().datetime({ offset: true }).optional(),
  immediateAction: optionalText(2_000),
  requirementId: id.optional(),
  processStepId: id.optional(),
  qcResultId: id.optional(),
  weighingSessionId: id.optional(),
}).strict()
export type ProductionDeviationCreateRequest = z.infer<typeof productionDeviationCreateRequestSchema>

export const productionCapaActionCreateRequestSchema = z.object({
  actionType: productionCapaActionTypeSchema,
  action: boundedText(2_000),
  ownerUserId: id.optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  verificationPlan: optionalText(2_000),
}).strict()
export type ProductionCapaActionCreateRequest = z.infer<typeof productionCapaActionCreateRequestSchema>

export const productionCapaActionCompleteRequestSchema = z.object({
  completionNotes: boundedText(2_000),
  evidenceDocumentSnapshotIds: z.array(id).max(100).transform((value) => [...new Set(value)]).default([]),
}).strict()
export type ProductionCapaActionCompleteRequest = z.infer<typeof productionCapaActionCompleteRequestSchema>

export const productionDeviationDispositionRequestSchema = z.object({
  disposition: productionDeviationDispositionSchema,
  rationale: boundedText(2_000),
  reworkTargetStage: productionProcessStageSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.disposition === 'REWORK' && !value.reworkTargetStage) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reworkTargetStage'], message: 'A rework disposition requires a target production stage.' })
  }
  if (value.disposition !== 'REWORK' && value.reworkTargetStage) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reworkTargetStage'], message: 'Only a rework disposition may set a target production stage.' })
  }
})
export type ProductionDeviationDispositionRequest = z.infer<typeof productionDeviationDispositionRequestSchema>

export const productionYieldRecordRequestSchema = z.object({
  bulkOutputGrams: nonNegativeGrams,
  filledOutputGrams: nonNegativeGrams.optional(),
  wasteGrams: nonNegativeGrams.default(0),
  reworkGrams: nonNegativeGrams.default(0),
  expectedLossGrams: nonNegativeGrams.default(0),
  rationale: optionalText(2_000),
}).strict().superRefine((value, context) => {
  if (value.filledOutputGrams !== undefined && value.filledOutputGrams > value.bulkOutputGrams) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filledOutputGrams'], message: 'Filled output cannot exceed recorded bulk output.' })
  }
})
export type ProductionYieldRecordRequest = z.infer<typeof productionYieldRecordRequestSchema>

export const productionReworkCreateRequestSchema = z.object({
  deviationId: id,
  sourceKind: z.enum(['IN_PROCESS', 'FINISHED_GOOD_LOT']),
  sourceFinishedGoodLotId: id.optional(),
  quantityGrams: grams,
  targetStage: productionProcessStageSchema,
  reason: boundedText(2_000),
}).strict().superRefine((value, context) => {
  if (value.sourceKind === 'FINISHED_GOOD_LOT' && !value.sourceFinishedGoodLotId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceFinishedGoodLotId'], message: 'Finished-good rework requires its source lot.' })
  }
  if (value.sourceKind === 'IN_PROCESS' && value.sourceFinishedGoodLotId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceFinishedGoodLotId'], message: 'In-process rework cannot attach a finished-good lot.' })
  }
})
export type ProductionReworkCreateRequest = z.infer<typeof productionReworkCreateRequestSchema>

export const productionReleaseRequestSchema = z.object({
  finishedGoodLotNumber: z.string().trim().regex(/^[A-Z0-9][A-Z0-9._/-]{1,79}$/),
  location: boundedText(200),
  manufacturedAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  rationale: boundedText(2_000),
  documentSnapshotIds: z.array(id).max(100).transform((value) => [...new Set(value)]).default([]),
}).strict().superRefine((value, context) => {
  if (value.manufacturedAt && value.expiresAt && value.expiresAt < value.manufacturedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Expiry cannot precede manufacture.' })
  }
})
export type ProductionReleaseRequest = z.infer<typeof productionReleaseRequestSchema>

export const finishedGoodAdjustmentRequestSchema = z.object({
  movementType: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'WASTE']),
  quantityGrams: grams,
  reason: boundedText(2_000),
}).strict()
export type FinishedGoodAdjustmentRequest = z.infer<typeof finishedGoodAdjustmentRequestSchema>

/**
 * A finished-good hold is deliberately lot-specific. It creates a controlled
 * QC deviation and moves the whole currently available lot balance into HOLD;
 * the API never lets a caller choose an arbitrary quantity for this action.
 */
export const productionFinishedGoodQualityHoldRequestSchema = z.object({
  rationale: boundedText(2_000),
  evidenceDocumentSnapshotIds: z.array(id).max(100).transform((value) => [...new Set(value)]).default([]),
}).strict()
export type ProductionFinishedGoodQualityHoldRequest = z.infer<typeof productionFinishedGoodQualityHoldRequestSchema>

export const productionGenealogyQuerySchema = z.object({
  depth: z.number().int().min(1).max(8).default(4),
  includeDocumentSnapshots: z.boolean().default(true),
}).strict()
export type ProductionGenealogyQuery = z.infer<typeof productionGenealogyQuerySchema>
