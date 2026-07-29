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
  'heartbeat',
])
export type AgentEventType = z.infer<typeof agentEventTypeSchema>

const opaqueRecordSchema = z.record(z.string(), z.unknown())

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

export const formulaOptimizerIntentSchema = z.enum(['COST', 'COMPLIANCE', 'INVENTORY', 'COMBINED'])
export type FormulaOptimizerIntent = z.infer<typeof formulaOptimizerIntentSchema>

export const formulaOptimizerRequestSchema = z.object({
  baselineFormulaId: z.string().min(1).max(160),
  baselineVersion: z.string().min(1).max(80),
  intent: formulaOptimizerIntentSchema.default('COMBINED'),
  lockedMaterialIds: z.array(z.string().min(1).max(160)).max(24).default([]),
  requireEligibleInventory: z.boolean().default(false),
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
})
export type DesignDirectionArtifact = z.infer<typeof designDirectionArtifactSchema>

export const designDirectionsArtifactSchema = z.object({
  type: z.literal('design_directions'),
  version: z.literal(1),
  data: z.object({
    projectId: z.string().min(1).max(160),
    directions: z.array(designDirectionArtifactSchema).min(1).max(3),
  }),
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

export const agentArtifactSchema = z.discriminatedUnion('type', [
  formulaTableArtifactSchema,
  inventoryReportArtifactSchema,
  costSummaryArtifactSchema,
  complianceReportArtifactSchema,
  materialSubstitutionsArtifactSchema,
  assumptionsArtifactSchema,
  formulaRevisionComparisonArtifactSchema,
  designDirectionsArtifactSchema,
  optimizerCandidatesArtifactSchema,
])
export type AgentArtifact = z.infer<typeof agentArtifactSchema>

export const agentRuntimeEventSchema = z.object({
  protocolVersion: z.literal(AGENT_PROTOCOL_VERSION),
  eventId: z.string().uuid(),
  tenantId: z.string().min(1).max(160),
  runId: z.string().min(1).max(160),
  sequence: z.number().int().nonnegative(),
  type: agentEventTypeSchema,
  timestamp: z.string().datetime(),
  payload: opaqueRecordSchema,
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
