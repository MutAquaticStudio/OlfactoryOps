import { z } from 'zod'

export const AGENT_PROTOCOL_VERSION = '1.0' as const
export const AGENT_MAX_NODES_PER_RUN = 8
export const AGENT_MAX_TOOL_CALLS_PER_RUN = 12
export const AGENT_MAX_RETRIES = 2
export const AGENT_MAX_EVENT_BYTES = 64 * 1024

export const agentRunStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'WAITING_FOR_CONFIRMATION',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
])
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>

export const agentNodeStatusSchema = z.enum([
  'PENDING',
  'QUEUED',
  'RUNNING',
  'WAITING_FOR_CONFIRMATION',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'RETRYING',
])
export type AgentNodeStatus = z.infer<typeof agentNodeStatusSchema>

export const agentEventTypeSchema = z.enum([
  'run.created',
  'run.queued',
  'run.started',
  'run.paused',
  'run.resumed',
  'run.cancelled',
  'run.completed',
  'run.failed',
  'message.started',
  'message.delta',
  'message.completed',
  'node.queued',
  'node.started',
  'node.progress',
  'node.completed',
  'node.failed',
  'node.retrying',
  'tool.requested',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'confirmation.requested',
  'confirmation.accepted',
  'confirmation.rejected',
  'artifact.created',
  'artifact.updated',
  'job.queued',
  'job.leased',
  'job.retrying',
  'job.completed',
  'job.cancelled',
  'connection.snapshot',
  'connection.resync_required',
  'heartbeat',
])
export type AgentEventType = z.infer<typeof agentEventTypeSchema>

const opaqueRecordSchema = z.record(z.string(), z.unknown())

export const agentRuntimeErrorSchema = z.object({
  code: z.string().min(1).max(96),
  message: z.string().min(1).max(500),
  retryable: z.boolean().default(false),
  correlationId: z.string().min(1).max(160).optional(),
}).strict()
export type AgentRuntimeError = z.infer<typeof agentRuntimeErrorSchema>

export function toSafeAgentRuntimeError(error: unknown, fallback = 'Formula Intelligence execution failed'): AgentRuntimeError {
  const raw = error instanceof Error ? error.message : ''
  if (raw.includes('FORMULA_INTELLIGENCE_RUN_QUOTA_EXHAUSTED')) {
    return { code: 'FORMULA_INTELLIGENCE_RUN_QUOTA_EXHAUSTED', message: 'Formula Intelligence run quota has been reached.', retryable: false }
  }
  if (raw.includes('FORMULA_INTELLIGENCE_CONFIRMATION_EXPIRED')) {
    return { code: 'FORMULA_INTELLIGENCE_CONFIRMATION_EXPIRED', message: 'This formula draft confirmation has expired.', retryable: false }
  }
  return { code: 'FORMULA_INTELLIGENCE_EXECUTION_FAILED', message: fallback, retryable: false }
}

export const formulaIntelligenceWorkflowKindSchema = z.enum([
  'RESEARCH',
  'DESIGN_STUDIO',
  'REFORMULATION_OPTIMIZER',
])
export type FormulaIntelligenceWorkflowKind = z.infer<typeof formulaIntelligenceWorkflowKindSchema>

export const agentFormulaProposalSchema = z.object({
  name: z.string().min(1).max(240),
  formulaType: z.enum(['ACCORD', 'FINE_FRAGRANCE']).default('FINE_FRAGRANCE'),
  targetGrams: z.number().finite().positive().max(100_000),
  concentrationType: z.enum(['PARFUM', 'EDP', 'EDT', 'EDC', 'COLOGNE', 'OTHER']).default('EDP'),
  finalProductConcentrationPercent: z.number().finite().min(0.01).max(100),
  ifraCategory: z.string().min(1).max(32).default('4'),
  brief: z.string().max(6000).default(''),
  ingredients: z.array(z.object({
    materialId: z.string().min(1).max(160),
    percentage: z.number().finite().min(0).max(100),
    pyramidNote: z.enum(['Top', 'Middle', 'Base', 'Solvent']).optional(),
    dilution: z.number().finite().min(0).max(100).optional(),
  })).min(1).max(80),
}).strict()
export type AgentFormulaProposal = z.infer<typeof agentFormulaProposalSchema>

export const formulaDesignBriefSchema = z.object({
  name: z.string().min(2).max(240),
  formulaType: z.enum(['ACCORD', 'FINE_FRAGRANCE']).default('FINE_FRAGRANCE'),
  concentrationType: z.enum(['PARFUM', 'EDP', 'EDT', 'EDC', 'COLOGNE', 'OTHER']).default('EDP'),
  finalProductConcentrationPercent: z.number().finite().min(0.01).max(100).default(20),
  ifraCategory: z.string().min(1).max(32).default('4'),
  targetMarkets: z.array(z.string().min(1).max(64)).max(12).default(['EU', 'US']),
  creativeBrief: z.string().min(8).max(6000),
  desiredNotes: z.array(z.string().min(1).max(80)).max(24).default([]),
  avoidedNotes: z.array(z.string().min(1).max(80)).max(24).default([]),
  lockedMaterialIds: z.array(z.string().min(1).max(160)).max(24).default([]),
  availabilityFirst: z.boolean().default(true),
  targetGrams: z.number().finite().positive().max(100_000).default(100),
}).strict()
export type FormulaDesignBrief = z.infer<typeof formulaDesignBriefSchema>

const compactTextSchema = z.string().trim().min(1).max(160)
const optionalCompactTextSchema = compactTextSchema.optional()
const optionalShortListSchema = z.array(compactTextSchema).max(24).default([])

export const formulaDesignProjectCreateSchema = z.object({
  name: z.string().trim().min(2).max(240),
  rawBrief: z.string().trim().min(8).max(6000).optional(),
  // creativeBrief is accepted during the migration window for the previous
  // client contract. It is preserved as raw text, never treated as reviewed
  // structure.
  creativeBrief: z.string().trim().min(8).max(6000).optional(),
  formulaType: z.enum(['ACCORD', 'FINE_FRAGRANCE']).optional(),
  concentrationType: z.enum(['PARFUM', 'EDP', 'EDT', 'EDC', 'COLOGNE', 'OTHER']).optional(),
  finalProductConcentrationPercent: z.number().finite().min(0.01).max(100).optional(),
  ifraCategory: z.string().trim().min(1).max(32).optional(),
  targetMarkets: z.array(compactTextSchema).max(12).optional(),
  desiredNotes: optionalShortListSchema,
  avoidedNotes: optionalShortListSchema,
  lockedMaterialIds: z.array(z.string().min(1).max(160)).max(24).default([]),
  availabilityFirst: z.boolean().optional(),
  targetGrams: z.number().finite().positive().max(100_000).optional(),
}).strict().superRefine((value, context) => {
  if (!value.rawBrief && !value.creativeBrief) {
    context.addIssue({ code: 'custom', message: 'Provide a raw fragrance brief' })
  }
})
export type FormulaDesignProjectCreate = z.infer<typeof formulaDesignProjectCreateSchema>

export const formulaDesignBriefVersionStateSchema = z.enum([
  'RAW',
  'REVIEW_REQUIRED',
  'REVIEWED',
  'LEGACY_UNSTRUCTURED',
])
export type FormulaDesignBriefVersionState = z.infer<typeof formulaDesignBriefVersionStateSchema>

export const formulaDesignBriefProductTypeSchema = z.enum([
  'FINE_FRAGRANCE',
  'HOME_FRAGRANCE',
  'PERSONAL_CARE',
  'FUNCTIONAL',
  'OTHER',
])
export const formulaDesignInventoryPreferenceSchema = z.enum([
  'IGNORE',
  'PREFER_AVAILABLE',
  'AVAILABLE_ONLY',
])
export const formulaDesignQuestionImportanceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH'])
export const formulaDesignUnresolvedQuestionSchema = z.object({
  field: z.string().min(1).max(160),
  reason: z.string().min(1).max(320),
  importance: formulaDesignQuestionImportanceSchema,
}).strict()
export type FormulaDesignUnresolvedQuestion = z.infer<typeof formulaDesignUnresolvedQuestionSchema>

export const structuredFormulaDesignBriefSchema = z.object({
  schemaVersion: z.literal(1),
  product: z.object({
    productType: formulaDesignBriefProductTypeSchema.optional(),
    formulaType: z.enum(['ACCORD', 'FINE_FRAGRANCE']).optional(),
    format: optionalCompactTextSchema,
    concentrationLabel: z.enum(['PARFUM', 'EDP', 'EDT', 'EDC', 'COLOGNE', 'OTHER']).optional(),
    targetConcentrationPercent: z.number().finite().min(0.01).max(100).optional(),
    targetGrams: z.number().finite().positive().max(100_000).optional(),
  }).strict(),
  creative: z.object({
    families: optionalShortListSchema,
    descriptors: optionalShortListSchema,
    emotionalIntent: z.string().trim().max(600).optional(),
    references: optionalShortListSchema,
    desiredNotes: optionalShortListSchema,
    avoidedNotes: optionalShortListSchema,
    specialEffects: optionalShortListSchema,
  }).strict(),
  performance: z.object({
    diffusion: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    targetLongevityHours: z.number().finite().min(0).max(240).optional(),
    opening: z.string().trim().max(320).optional(),
    drydown: z.string().trim().max(320).optional(),
  }).strict(),
  audience: z.object({
    target: z.string().trim().max(320).optional(),
    positioning: z.string().trim().max(320).optional(),
    occasion: z.string().trim().max(320).optional(),
    markets: z.array(compactTextSchema).max(12).default([]),
  }).strict(),
  constraints: z.object({
    workspaceMaterialsOnly: z.boolean(),
    reviewedMaterialsOnly: z.boolean(),
    ifraCategory: z.string().trim().min(1).max(32).optional(),
    targetMarkets: z.array(compactTextSchema).max(12).default([]),
    maxCost: z.object({
      amount: z.number().finite().positive().max(1_000_000),
      currency: z.string().trim().min(3).max(12),
    }).strict().optional(),
    inventoryPreference: formulaDesignInventoryPreferenceSchema,
    prohibitedMaterialIds: z.array(z.string().min(1).max(160)).max(80).default([]),
    requiredMaterialIds: z.array(z.string().min(1).max(160)).max(80).default([]),
    prohibitedDescriptors: optionalShortListSchema,
  }).strict(),
  unresolvedQuestions: z.array(formulaDesignUnresolvedQuestionSchema).max(32).default([]),
}).strict()
export type StructuredFormulaDesignBrief = z.infer<typeof structuredFormulaDesignBriefSchema>

export type FormulaDesignStructuredBriefValidation = {
  brief: StructuredFormulaDesignBrief
  unresolvedQuestions: FormulaDesignUnresolvedQuestion[]
  state: Extract<FormulaDesignBriefVersionState, 'REVIEW_REQUIRED' | 'REVIEWED'>
}

const marketAliases: Record<string, string> = {
  EU: 'EU', EUROPE: 'EU', EUROPEAN_UNION: 'EU',
  UK: 'UK', UNITED_KINGDOM: 'UK',
  US: 'US', USA: 'US', UNITED_STATES: 'US',
  GCC: 'GCC', JP: 'JP', JAPAN: 'JP', CN: 'CN', CHINA: 'CN', ASEAN: 'ASEAN',
}
const supportedIfraCategories = new Set(['1', '2', '3', '4', '5A', '5B', '6', '7A', '7B', '8', '9', '10A', '10B', '11A', '11B', '12'])

function normalizeVocabulary(value: string) {
  return value.trim().replaceAll(/[^a-zA-Z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '').toUpperCase()
}

function unresolved(field: string, reason: string, importance: FormulaDesignUnresolvedQuestion['importance']): FormulaDesignUnresolvedQuestion {
  return { field, reason, importance }
}

export function validateStructuredFormulaDesignBrief(input: unknown): FormulaDesignStructuredBriefValidation {
  const parsed = structuredFormulaDesignBriefSchema.parse(input)
  const questions = [...parsed.unresolvedQuestions]
  const normalizeMarkets = (values: string[], field: string) => values.flatMap((value) => {
    const normalized = marketAliases[normalizeVocabulary(value)]
    if (normalized) return [normalized]
    questions.push(unresolved(field, `Unsupported market code: ${value.trim()}`, 'HIGH'))
    return []
  })
  const targetMarkets = [...new Set(normalizeMarkets(parsed.constraints.targetMarkets, 'constraints.targetMarkets'))]
  const audienceMarkets = [...new Set(normalizeMarkets(parsed.audience.markets, 'audience.markets'))]
  const ifraCategory = parsed.constraints.ifraCategory?.trim().replace(/^category\s+/i, '').toUpperCase()
  if (!parsed.product.productType) questions.push(unresolved('product.productType', 'Select the product type.', 'HIGH'))
  if (!parsed.product.formulaType) questions.push(unresolved('product.formulaType', 'Select Accord or Fine fragrance.', 'HIGH'))
  if (!parsed.product.concentrationLabel) questions.push(unresolved('product.concentrationLabel', 'Select the concentration label.', 'HIGH'))
  if (parsed.product.targetConcentrationPercent === undefined) questions.push(unresolved('product.targetConcentrationPercent', 'Set the final-product concentration.', 'HIGH'))
  if (parsed.product.targetGrams === undefined) questions.push(unresolved('product.targetGrams', 'Set the target trial quantity.', 'MEDIUM'))
  if (!ifraCategory || !supportedIfraCategories.has(ifraCategory)) questions.push(unresolved('constraints.ifraCategory', 'Select a supported IFRA category.', 'HIGH'))
  if (targetMarkets.length === 0) questions.push(unresolved('constraints.targetMarkets', 'Select at least one target market.', 'HIGH'))
  if (!parsed.creative.descriptors.length && !parsed.creative.desiredNotes.length) {
    questions.push(unresolved('creative', 'Describe at least one desired note or creative descriptor.', 'HIGH'))
  }
  const deduplicated = [...new Map(questions.map((question) => [`${question.field}:${question.reason}`, question])).values()]
  const brief: StructuredFormulaDesignBrief = {
    ...parsed,
    audience: { ...parsed.audience, markets: audienceMarkets },
    constraints: { ...parsed.constraints, ifraCategory: ifraCategory && supportedIfraCategories.has(ifraCategory) ? ifraCategory : undefined, targetMarkets },
    unresolvedQuestions: deduplicated,
  }
  return {
    brief,
    unresolvedQuestions: deduplicated,
    state: deduplicated.some((question) => question.importance === 'HIGH') ? 'REVIEW_REQUIRED' : 'REVIEWED',
  }
}

export function rawBriefFromProjectCreate(input: FormulaDesignProjectCreate) {
  return (input.rawBrief ?? input.creativeBrief ?? '').trim()
}

export function formulaDesignBriefFromStructuredBrief(name: string, structured: StructuredFormulaDesignBrief): FormulaDesignBrief {
  if (!structured.product.formulaType || !structured.product.concentrationLabel || structured.product.targetConcentrationPercent === undefined || structured.product.targetGrams === undefined || !structured.constraints.ifraCategory || structured.constraints.targetMarkets.length === 0) {
    throw new Error('A reviewed structured brief is required before generation')
  }
  return formulaDesignBriefSchema.parse({
    name,
    formulaType: structured.product.formulaType,
    concentrationType: structured.product.concentrationLabel,
    finalProductConcentrationPercent: structured.product.targetConcentrationPercent,
    ifraCategory: structured.constraints.ifraCategory,
    targetMarkets: structured.constraints.targetMarkets,
    creativeBrief: [structured.creative.emotionalIntent, ...structured.creative.descriptors, ...structured.creative.desiredNotes].filter(Boolean).join('. '),
    desiredNotes: structured.creative.desiredNotes,
    avoidedNotes: structured.creative.avoidedNotes,
    lockedMaterialIds: structured.constraints.requiredMaterialIds,
    availabilityFirst: structured.constraints.inventoryPreference !== 'IGNORE',
    targetGrams: structured.product.targetGrams,
  })
}

export const formulaOptimizerIntentSchema = z.enum(['COST', 'COMPLIANCE', 'INVENTORY', 'COMBINED'])
export type FormulaOptimizerIntent = z.infer<typeof formulaOptimizerIntentSchema>

export const formulaOptimizationObjectivesSchema = z.object({
  targetCostReductionPercent: z.number().finite().min(0).max(90).optional(),
  maxTotalCost: z.number().finite().positive().optional(),
  maximizeInventoryCoverage: z.boolean().default(false),
  minimizeNewPurchases: z.boolean().default(false),
  maximizeEvidenceCoverage: z.boolean().default(false),
  preserveMaterialIds: z.array(z.string().min(1).max(160)).max(24).default([]),
  prohibitedMaterialIds: z.array(z.string().min(1).max(160)).max(24).default([]),
  complianceRequired: z.boolean().default(true),
  historicalSimilarityWeight: z.number().finite().min(0).max(1).default(0),
  requireApprovedSubstitutions: z.boolean().default(true),
}).strict().superRefine((value, context) => {
  const prohibited = new Set(value.prohibitedMaterialIds)
  const conflicting = value.preserveMaterialIds.find((materialId) => prohibited.has(materialId))
  if (conflicting) context.addIssue({ code: 'custom', path: ['prohibitedMaterialIds'], message: `Material ${conflicting} cannot be both preserved and prohibited` })
})
export type FormulaOptimizationObjectives = z.infer<typeof formulaOptimizationObjectivesSchema>

export const formulaOptimizerRequestSchema = z.object({
  baselineFormulaId: z.string().min(1).max(160),
  baselineVersion: z.string().min(1).max(80),
  intent: formulaOptimizerIntentSchema.default('COMBINED'),
  lockedMaterialIds: z.array(z.string().min(1).max(160)).max(24).default([]),
  requireEligibleInventory: z.boolean().default(false),
  objectives: formulaOptimizationObjectivesSchema.optional(),
}).strict()
export type FormulaOptimizerRequest = z.infer<typeof formulaOptimizerRequestSchema>

export const formulaDirectionShareSchema = z.object({
  recipientUserIds: z.array(z.string().min(1).max(160)).min(1).max(24),
  allowMaterialNames: z.boolean().default(false),
}).strict()
export type FormulaDirectionShare = z.infer<typeof formulaDirectionShareSchema>

export const formulaDirectionFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().min(1).max(1200).optional(),
  selected: z.boolean().default(false),
}).strict().refine((value) => value.rating !== undefined || Boolean(value.comment) || value.selected, {
  message: 'Add a rating, comment, or direction selection',
})
export type FormulaDirectionFeedback = z.infer<typeof formulaDirectionFeedbackSchema>

export const formulaIntelligenceRunConfigSchema = z.discriminatedUnion('workflowKind', [
  z.object({
    workflowKind: z.literal('DESIGN_STUDIO'),
    projectId: z.string().min(1).max(160),
    briefVersionId: z.string().min(1).max(160).optional(),
    constraintSnapshotId: z.string().min(1).max(160).optional(),
    brief: formulaDesignBriefSchema,
  }),
  z.object({
    workflowKind: z.literal('REFORMULATION_OPTIMIZER'),
    request: formulaOptimizerRequestSchema,
  }),
])
export type FormulaIntelligenceRunConfig = z.infer<typeof formulaIntelligenceRunConfigSchema>

export const formulaIngredientSchema = z.object({
  materialId: z.string().min(1).max(160),
  materialName: z.string().min(1).max(240),
  percentage: z.number().finite().min(0).max(100),
  weightGrams: z.number().finite().min(0),
  dilution: z.string().max(120).optional(),
  availableGrams: z.number().finite().min(0).optional(),
  estimatedUnitCost: z.number().finite().min(0).optional(),
  estimatedCost: z.number().finite().min(0).optional(),
  currency: z.string().min(1).max(12).optional(),
  warnings: z.array(z.string().max(500)).max(12),
})

export const formulaTableArtifactSchema = z.object({
  type: z.literal('formula_table'),
  version: z.literal(1),
  data: z.object({
    formulaName: z.string().min(1).max(240),
    formulaType: z.enum(['ACCORD', 'FINE_FRAGRANCE']),
    targetGrams: z.number().finite().positive(),
    finalProductConcentrationPercent: z.number().finite().min(0).max(100),
    ingredients: z.array(formulaIngredientSchema).min(1).max(80),
    totalPercentage: z.number().finite().min(0).max(200),
    totalWeightGrams: z.number().finite().min(0),
    totalEstimatedCost: z.number().finite().min(0).optional(),
    currency: z.string().min(1).max(12).optional(),
  }),
})

export const inventoryReportArtifactSchema = z.object({
  type: z.literal('inventory_report'),
  version: z.literal(1),
  data: z.object({
    eligible: z.array(z.object({
      materialId: z.string().min(1),
      materialName: z.string().min(1),
      requiredGrams: z.number().finite().min(0),
      availableGrams: z.number().finite().min(0),
      lotCount: z.number().int().min(0),
      status: z.enum(['AVAILABLE', 'SHORTFALL', 'UNAVAILABLE']),
    })).max(80),
  }),
})

export const costSummaryArtifactSchema = z.object({
  type: z.literal('cost_summary'),
  version: z.literal(1),
  data: z.object({
    totalCost: z.number().finite().min(0),
    costPerGram: z.number().finite().min(0),
    currency: z.string().min(1).max(12),
    mostExpensiveMaterial: z.string().max(240),
    withinTarget: z.boolean().optional(),
    targetCost: z.number().finite().min(0).optional(),
  }),
})

export const complianceReportArtifactSchema = z.object({
  type: z.literal('compliance_report'),
  version: z.literal(1),
  data: z.object({
    ifraCategory: z.string().min(1).max(32),
    status: z.enum(['PASS', 'NEAR_LIMIT', 'BLOCKED', 'INSUFFICIENT_DATA']),
    sourceLabel: z.string().min(1).max(500),
    warnings: z.array(z.string().max(500)).max(80),
  }),
})

export const materialSubstitutionsArtifactSchema = z.object({
  type: z.literal('material_substitutions'),
  version: z.literal(1),
  data: z.object({
    suggestions: z.array(z.object({
      sourceMaterialId: z.string().min(1),
      sourceMaterialName: z.string().min(1),
      alternatives: z.array(z.object({
        materialId: z.string().min(1),
        materialName: z.string().min(1),
        rationale: z.string().min(1).max(500),
      })).max(8),
    })).max(40),
  }),
})

export const assumptionsArtifactSchema = z.object({
  type: z.literal('assumptions'),
  version: z.literal(1),
  data: z.object({
    assumptions: z.array(z.string().max(500)).max(80),
    warnings: z.array(z.string().max(500)).max(80),
  }),
})

export const formulaRevisionComparisonArtifactSchema = z.object({
  type: z.literal('formula_revision_comparison'),
  version: z.literal(1),
  data: z.object({
    baselineFormulaId: z.string().min(1).optional(),
    summary: z.array(z.string().max(500)).max(60),
  }),
})

export const designDirectionArtifactSchema = z.object({
  directionId: z.string().min(1).max(160),
  title: z.string().min(1).max(240),
  narrative: z.string().min(1).max(800),
  pyramidSummary: z.string().min(1).max(500),
  availability: z.enum(['AVAILABLE', 'MIXED', 'UNKNOWN']),
  complianceStatus: z.enum(['PASS', 'REVIEW_REQUIRED', 'BLOCKED', 'INSUFFICIENT_DATA']),
  proposal: agentFormulaProposalSchema,
  warnings: z.array(z.string().max(500)).max(40),
  historicalEvidence: z.object({
    state: z.enum(['READY', 'NOT_ENOUGH_EVIDENCE', 'DISABLED', 'NOT_EVALUATED']),
    profileVersion: z.number().int().positive().optional(),
    evidenceCount: z.number().int().min(0),
    adjustment: z.number().finite().min(-12).max(12),
    explanation: z.string().min(1).max(500),
  }).optional(),
})
export type DesignDirectionArtifact = z.infer<typeof designDirectionArtifactSchema>

export const designCandidateEvaluationSchema = z.object({
  directionId: z.string().min(1).max(160),
  rank: z.number().int().min(1).max(3),
  proposalChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  composition: z.object({
    state: z.literal('VALID'),
    totalPercentage: z.number().finite().min(99.95).max(100.05),
  }).strict(),
  constraints: z.object({
    state: z.enum(['PASS', 'REVIEW_REQUIRED', 'BLOCKED']),
    requiredMaterialsSatisfied: z.boolean(),
  }).strict(),
  complianceStatus: z.enum(['PASS', 'REVIEW_REQUIRED', 'BLOCKED', 'INSUFFICIENT_DATA']),
  availability: z.enum(['AVAILABLE', 'MIXED', 'UNKNOWN']),
  cost: z.object({
    state: z.enum(['EVALUATED', 'NOT_EVALUATED']),
    totalCost: z.number().finite().nonnegative().optional(),
  }).strict(),
  materialUniverse: z.object({
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    materialCount: z.number().int().min(1).max(10_000),
  }).strict(),
  warnings: z.array(z.string().min(1).max(500)).max(40),
}).strict()
export type DesignCandidateEvaluation = z.infer<typeof designCandidateEvaluationSchema>

export const designDirectionsArtifactSchema = z.object({
  type: z.literal('design_directions'),
  version: z.literal(1),
  data: z.object({
    projectId: z.string().min(1).max(160),
    directions: z.array(designDirectionArtifactSchema).min(1).max(3),
  }),
})

export const designCandidateComparisonArtifactSchema = z.object({
  type: z.literal('design_candidate_comparison'),
  version: z.literal(1),
  data: z.object({
    projectId: z.string().min(1).max(160),
    briefVersionId: z.string().min(1).max(160),
    constraintSnapshotId: z.string().min(1).max(160),
    materialUniverseHash: z.string().regex(/^[a-f0-9]{64}$/),
    candidates: z.array(designCandidateEvaluationSchema).min(1).max(3),
  }).strict(),
})

export const optimizerCandidateArtifactSchema = z.object({
  candidateId: z.string().min(1).max(160),
  title: z.string().min(1).max(240),
  proposal: agentFormulaProposalSchema,
  complianceStatus: z.enum(['PASS', 'REVIEW_REQUIRED', 'BLOCKED', 'INSUFFICIENT_DATA']),
  availability: z.enum(['AVAILABLE', 'MIXED', 'UNKNOWN']),
  costDelta: z.number().finite().optional(),
  compositionChangePercent: z.number().finite().min(0).max(100),
  score: z.number().finite().min(0).max(100),
  pareto: z.object({
    state: z.enum(['PARETO', 'DOMINATED', 'NOT_EVALUATED']),
    tradeoff: z.string().min(1).max(500),
  }).optional(),
  summary: z.array(z.string().min(1).max(500)).max(12),
})
export type OptimizerCandidateArtifact = z.infer<typeof optimizerCandidateArtifactSchema>

export const optimizerCandidatesArtifactSchema = z.object({
  type: z.literal('optimizer_candidates'),
  version: z.literal(1),
  data: z.object({
    baselineFormulaId: z.string().min(1).max(160),
    baselineVersion: z.string().min(1).max(80),
    intent: formulaOptimizerIntentSchema,
    candidates: z.array(optimizerCandidateArtifactSchema).min(1).max(3),
  }),
})

export const evidenceCitationsArtifactSchema = z.object({
  type: z.literal('evidence_citations'),
  version: z.literal(1),
  data: z.object({
    state: z.enum(['READY', 'NOT_INDEXED', 'NOT_CONFIGURED', 'NOT_EVALUATED']),
    citations: z.array(z.object({
      citationId: z.string().min(1).max(160),
      sourceKind: z.enum(['material', 'document']),
      materialId: z.string().min(1).max(160).optional(),
      title: z.string().min(1).max(240),
      version: z.string().min(1).max(80),
      page: z.number().int().positive().optional(),
      section: z.string().min(1).max(160).optional(),
      excerpt: z.string().min(1).max(700),
      score: z.number().finite().min(0).max(1),
    })).max(8),
  }),
})

export const agentArtifactSchema = z.discriminatedUnion('type', [
  formulaTableArtifactSchema,
  inventoryReportArtifactSchema,
  costSummaryArtifactSchema,
  complianceReportArtifactSchema,
  materialSubstitutionsArtifactSchema,
  assumptionsArtifactSchema,
  formulaRevisionComparisonArtifactSchema,
  designDirectionsArtifactSchema,
  designCandidateComparisonArtifactSchema,
  optimizerCandidatesArtifactSchema,
  evidenceCitationsArtifactSchema,
])
export type AgentArtifact = z.infer<typeof agentArtifactSchema>

export const agentRuntimeEventEnvelopeSchema = z.object({
  protocolVersion: z.literal(AGENT_PROTOCOL_VERSION),
  eventId: z.string().uuid(),
  tenantId: z.string().min(1).max(160),
  runId: z.string().min(1).max(160),
  sequence: z.number().int().nonnegative(),
  type: z.string().min(1).max(96),
  timestamp: z.string().datetime(),
  payload: opaqueRecordSchema,
})
export type AgentRuntimeEventEnvelope = z.infer<typeof agentRuntimeEventEnvelopeSchema>

export const agentRuntimeEventSchema = agentRuntimeEventEnvelopeSchema.extend({
  type: agentEventTypeSchema,
})
export type AgentRuntimeEvent = z.infer<typeof agentRuntimeEventSchema>

export const agentToolNameSchema = z.enum([
  'search_materials',
  'get_material_details',
  'check_inventory',
  'get_available_lots',
  'calculate_formula_cost',
  'validate_formula_math',
  'validate_compliance',
  'find_material_substitutions',
  'retrieve_material_evidence',
  'save_formula_draft',
])
export type AgentToolName = z.infer<typeof agentToolNameSchema>

export const agentNodeTypeSchema = z.enum([
  'analyze_brief',
  'search_materials',
  'check_inventory',
  'generate_formula',
  'calculate_cost',
  'validate_compliance',
  'prepare_result',
  'save_formula_draft',
])
export type AgentNodeType = z.infer<typeof agentNodeTypeSchema>

export type AgentNodeDefinition = {
  type: AgentNodeType
  version: number
  title: string
  description: string
  configSchema: z.ZodType<Record<string, unknown>>
  inputSchema: z.ZodType<Record<string, unknown>>
  outputSchema: z.ZodType<Record<string, unknown>>
  executorKey: string
  rendererKey: string
  retryPolicy: { maxAttempts: number; backoffMs: number }
}

const nodeRecordSchema = z.record(z.string(), z.unknown())

export const agentNodeDefinitions: AgentNodeDefinition[] = [
  { type: 'analyze_brief', version: 1, title: 'Analyze brief', description: 'Extract formula constraints and assumptions.', configSchema: nodeRecordSchema, inputSchema: nodeRecordSchema, outputSchema: nodeRecordSchema, executorKey: 'analyzeBrief', rendererKey: 'workflow', retryPolicy: { maxAttempts: 1, backoffMs: 0 } },
  { type: 'search_materials', version: 1, title: 'Search materials', description: 'Find candidate materials inside this workspace.', configSchema: nodeRecordSchema, inputSchema: nodeRecordSchema, outputSchema: nodeRecordSchema, executorKey: 'searchMaterials', rendererKey: 'workflow', retryPolicy: { maxAttempts: AGENT_MAX_RETRIES, backoffMs: 1000 } },
  { type: 'check_inventory', version: 1, title: 'Check inventory', description: 'Check eligible inventory lots and quantities.', configSchema: nodeRecordSchema, inputSchema: nodeRecordSchema, outputSchema: nodeRecordSchema, executorKey: 'checkInventory', rendererKey: 'workflow', retryPolicy: { maxAttempts: AGENT_MAX_RETRIES, backoffMs: 1000 } },
  { type: 'generate_formula', version: 1, title: 'Generate formula', description: 'Propose a formula using approved tool evidence.', configSchema: nodeRecordSchema, inputSchema: nodeRecordSchema, outputSchema: nodeRecordSchema, executorKey: 'generateFormula', rendererKey: 'formula', retryPolicy: { maxAttempts: AGENT_MAX_RETRIES, backoffMs: 1500 } },
  { type: 'calculate_cost', version: 1, title: 'Calculate cost', description: 'Calculate deterministic material costs.', configSchema: nodeRecordSchema, inputSchema: nodeRecordSchema, outputSchema: nodeRecordSchema, executorKey: 'calculateCost', rendererKey: 'cost', retryPolicy: { maxAttempts: AGENT_MAX_RETRIES, backoffMs: 1000 } },
  { type: 'validate_compliance', version: 1, title: 'Validate compliance', description: 'Evaluate available IFRA and material compliance data.', configSchema: nodeRecordSchema, inputSchema: nodeRecordSchema, outputSchema: nodeRecordSchema, executorKey: 'validateCompliance', rendererKey: 'compliance', retryPolicy: { maxAttempts: AGENT_MAX_RETRIES, backoffMs: 1000 } },
  { type: 'prepare_result', version: 1, title: 'Prepare result', description: 'Build safe, structured result artifacts.', configSchema: nodeRecordSchema, inputSchema: nodeRecordSchema, outputSchema: nodeRecordSchema, executorKey: 'prepareResult', rendererKey: 'artifacts', retryPolicy: { maxAttempts: 1, backoffMs: 0 } },
  { type: 'save_formula_draft', version: 1, title: 'Save draft', description: 'Wait for explicit confirmation before creating a formula draft.', configSchema: nodeRecordSchema, inputSchema: nodeRecordSchema, outputSchema: nodeRecordSchema, executorKey: 'saveFormulaDraft', rendererKey: 'confirmation', retryPolicy: { maxAttempts: 1, backoffMs: 0 } },
]

export type AgentRunSnapshot = {
  runId: string
  status: AgentRunStatus
  lastSequence: number
  lastEventId?: string
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string; complete: boolean }>
  nodes: Record<string, { id: string; type: AgentNodeType; status: AgentNodeStatus; progress: number; error?: string }>
  artifacts: AgentArtifact[]
  confirmation?: { id: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; summary: string }
  error?: string
}

export function createAgentRunSnapshot(runId: string): AgentRunSnapshot {
  return { runId, status: 'QUEUED', lastSequence: 0, messages: [], nodes: {}, artifacts: [] }
}

export function reduceAgentRuntimeEvent(state: AgentRunSnapshot, candidate: AgentRuntimeEvent): AgentRunSnapshot {
  const event = agentRuntimeEventSchema.parse(candidate)
  if (event.runId !== state.runId || event.sequence !== state.lastSequence + 1) return state

  const next: AgentRunSnapshot = {
    ...state,
    lastSequence: event.sequence,
    lastEventId: event.eventId,
    messages: [...state.messages],
    nodes: { ...state.nodes },
    artifacts: [...state.artifacts],
  }
  const payload = event.payload
  if (event.type.startsWith('run.')) {
    const status = payload.status
    if (typeof status === 'string' && agentRunStatusSchema.safeParse(status).success) next.status = status as AgentRunStatus
    if (typeof payload.error === 'string') next.error = payload.error
  }
  if (event.type.startsWith('node.')) {
    const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId : ''
    const type = agentNodeTypeSchema.safeParse(payload.nodeType).success ? payload.nodeType as AgentNodeType : undefined
    const status = agentNodeStatusSchema.safeParse(payload.status).success ? payload.status as AgentNodeStatus : undefined
    if (nodeId && type && status) {
      next.nodes[nodeId] = {
        id: nodeId,
        type,
        status,
        progress: typeof payload.progress === 'number' ? payload.progress : next.nodes[nodeId]?.progress ?? 0,
        error: typeof payload.error === 'string' ? payload.error : undefined,
      }
    }
  }
  if (event.type === 'message.started' && typeof payload.messageId === 'string') {
    next.messages.push({ id: payload.messageId, role: 'assistant', content: '', createdAt: event.timestamp, complete: false })
  }
  if (event.type === 'message.delta' && typeof payload.messageId === 'string' && typeof payload.delta === 'string') {
    next.messages = next.messages.map((message) => message.id === payload.messageId ? { ...message, content: `${message.content}${payload.delta}` } : message)
  }
  if (event.type === 'message.completed' && typeof payload.messageId === 'string') {
    next.messages = next.messages.map((message) => message.id === payload.messageId ? { ...message, complete: true } : message)
  }
  if ((event.type === 'artifact.created' || event.type === 'artifact.updated') && payload.artifact) {
    const parsed = agentArtifactSchema.safeParse(payload.artifact)
    if (parsed.success) {
      const priorIndex = event.type === 'artifact.updated'
        ? next.artifacts.findIndex((artifact) => artifact.type === parsed.data.type)
        : -1
      if (priorIndex >= 0) next.artifacts[priorIndex] = parsed.data
      else next.artifacts.push(parsed.data)
    }
  }
  if (event.type.startsWith('confirmation.') && typeof payload.confirmationId === 'string') {
    next.confirmation = {
      id: payload.confirmationId,
      status: event.type === 'confirmation.accepted' ? 'ACCEPTED' : event.type === 'confirmation.rejected' ? 'REJECTED' : 'PENDING',
      summary: typeof payload.summary === 'string' ? payload.summary : 'Formula draft save',
    }
  }
  return next
}

export type AgentEventReconciliation = {
  snapshot: AgentRunSnapshot
  buffered: AgentRuntimeEvent[]
  seenEventIds: string[]
}

export type AgentEventReconciliationResult = {
  state: AgentEventReconciliation
  disposition: 'applied' | 'buffered' | 'duplicate' | 'ignored' | 'resync_required'
}

const maxBufferedAgentEvents = 128
const maxSeenAgentEventIds = 512

export function createAgentEventReconciliation(runId: string): AgentEventReconciliation {
  return { snapshot: createAgentRunSnapshot(runId), buffered: [], seenEventIds: [] }
}

/**
 * The server remains authoritative. This reducer only reconciles persisted SSE
 * events until a contiguous sequence can be applied or a fresh replay is needed.
 */
export function reconcileAgentRuntimeEvent(
  current: AgentEventReconciliation,
  candidate: unknown,
): AgentEventReconciliationResult {
  const envelope = agentRuntimeEventEnvelopeSchema.safeParse(candidate)
  if (!envelope.success || envelope.data.runId !== current.snapshot.runId) {
    return { state: current, disposition: 'ignored' }
  }
  const parsed = agentRuntimeEventSchema.safeParse(envelope.data)
  if (!parsed.success) return { state: current, disposition: 'ignored' }
  const event = parsed.data
  if (current.seenEventIds.includes(event.eventId) || event.sequence <= current.snapshot.lastSequence) {
    return { state: current, disposition: 'duplicate' }
  }
  const bufferedBySequence = new Map(current.buffered.map((item) => [item.sequence, item]))
  const conflicting = bufferedBySequence.get(event.sequence)
  if (conflicting && conflicting.eventId !== event.eventId) {
    return { state: current, disposition: 'resync_required' }
  }
  if (event.sequence > current.snapshot.lastSequence + 1) {
    bufferedBySequence.set(event.sequence, event)
    const buffered = [...bufferedBySequence.values()].sort((left, right) => left.sequence - right.sequence)
    if (buffered.length > maxBufferedAgentEvents) return { state: current, disposition: 'resync_required' }
    return {
      state: { ...current, buffered, seenEventIds: rememberAgentEventId(current.seenEventIds, event.eventId) },
      disposition: 'buffered',
    }
  }
  let snapshot = reduceAgentRuntimeEvent(current.snapshot, event)
  const seenEventIds = rememberAgentEventId(current.seenEventIds, event.eventId)
  bufferedBySequence.delete(event.sequence)
  while (bufferedBySequence.has(snapshot.lastSequence + 1)) {
    const next = bufferedBySequence.get(snapshot.lastSequence + 1)!
    bufferedBySequence.delete(next.sequence)
    snapshot = reduceAgentRuntimeEvent(snapshot, next)
  }
  return {
    state: { snapshot, buffered: [...bufferedBySequence.values()].sort((left, right) => left.sequence - right.sequence), seenEventIds },
    disposition: 'applied',
  }
}

function rememberAgentEventId(ids: string[], eventId: string) {
  return [...ids.filter((id) => id !== eventId), eventId].slice(-maxSeenAgentEventIds)
}
