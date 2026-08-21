import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const hash = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
const boundedText = (max: number) => z.string().trim().min(1).max(max)
const stableKey = z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/)
const workflowKey = z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}(?:\/[a-z0-9][a-z0-9._-]{0,79})?$/)
const toolKey = z.string().trim().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/)
const nodeKey = z.string().trim().regex(/^[a-z][a-z0-9._-]{0,119}$/)
const intentKey = z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,119}$/)
const protocolVersion = z.string().trim().regex(/^(?:phase6|agent-runtime)\/v[1-9][0-9]*$/)
const schemaVersion = z.string().trim().regex(/^\d+\.\d+\.\d+$/)
const capabilityKey = z.string().trim().regex(/^[a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/)

const jsonSchemaDocumentSchema = z.object({
  schemaVersion,
  jsonSchema: z.record(z.string(), z.unknown()),
}).strict().superRefine((value, context) => {
  try {
    if (new TextEncoder().encode(JSON.stringify(value.jsonSchema)).length > 65_536) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['jsonSchema'], message: 'JSON Schema exceeds 64 KiB.' })
    }
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['jsonSchema'], message: 'JSON Schema must be serializable.' })
  }
})

const safeMetadataSchema = (maxBytes: number) => z.record(z.string().trim().min(1).max(80), z.unknown()).superRefine((value, context) => {
  const forbiddenKeys = new Set(['prompt', 'systemprompt', 'system_prompt', 'reasoning', 'chainofthought', 'chain_of_thought', 'apikey', 'api_key', 'authorization', 'secret', 'token'])
  const inspect = (item: unknown, path: Array<string | number>, depth: number): void => {
    if (depth > 8) {
      context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Metadata nesting exceeds eight levels.' })
      return
    }
    if (item === null || typeof item === 'boolean') return
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Metadata numbers must be finite.' })
      return
    }
    if (typeof item === 'string') {
      if (item.length > 1_000) context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Metadata text is limited to 1,000 characters.' })
      return
    }
    if (Array.isArray(item)) {
      if (item.length > 100) context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Metadata arrays are limited to 100 values.' })
      item.forEach((child, index) => inspect(child, [...path, index], depth + 1))
      return
    }
    if (typeof item !== 'object') {
      context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Metadata must contain JSON values only.' })
      return
    }
    for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (forbiddenKeys.has(key.replaceAll('-', '').toLowerCase())) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, key], message: 'Raw prompts, reasoning, credentials, and secrets are not persistable metadata.' })
      }
      inspect(child, [...path, key], depth + 1)
    }
  }
  inspect(value, [], 0)
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > maxBytes) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Metadata exceeds ${maxBytes} bytes.` })
    }
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Metadata must be serializable.' })
  }
})

const safeEventPayloadSchema = z.object({
  status: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,79}$/).optional(),
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,119}$/).optional(),
  references: z.array(id).max(64).default([]),
  hashes: z.record(z.string().trim().min(1).max(80), hash).default({}),
  metrics: z.record(z.string().trim().min(1).max(80), z.number().finite()).default({}),
  metadata: safeMetadataSchema(16_384).default({}),
}).strict().refine((value) => Object.keys(value).some((key) => {
  const item = value[key as keyof typeof value]
  return Array.isArray(item) ? item.length > 0 : typeof item === 'object' && item !== null ? Object.keys(item).length > 0 : item !== undefined
}), 'Provide bounded event metadata, a status, or a reference.')

const safeMessagePayloadSchema = z.object({
  summary: z.string().trim().max(1_000).optional(),
  references: z.array(id).max(64).default([]),
  hashes: z.record(z.string().trim().min(1).max(80), hash).default({}),
  metrics: z.record(z.string().trim().min(1).max(80), z.number().finite()).default({}),
  metadata: safeMetadataSchema(16_384).default({}),
}).strict().refine((value) => value.summary !== undefined || value.references.length > 0 || Object.keys(value.hashes).length > 0 || Object.keys(value.metrics).length > 0 || Object.keys(value.metadata).length > 0, 'A persisted message is a bounded summary or reference, never a raw prompt or reasoning trace.')

export const agentRuntimeCapabilityKeys = [
  'agent.execute',
  'agent.view',
  'agent.observe',
  'agent.evaluate',
  'agent.confirmWrite',
  'agent.manageTools',
] as const
export const agentRuntimeCapabilitySchema = z.enum(agentRuntimeCapabilityKeys)
export type AgentRuntimeCapability = z.infer<typeof agentRuntimeCapabilitySchema>

export const agentRuntimeBuiltInKeys = [
  'formula-research',
  'material-intelligence',
  'inventory-assistant',
  'sensory-analysis',
  'production-assistant',
  'commerce-assistant',
  'qa-traceability',
] as const
export const agentRuntimeBuiltInKeySchema = z.enum(agentRuntimeBuiltInKeys)
export type AgentRuntimeBuiltInKey = z.infer<typeof agentRuntimeBuiltInKeySchema>

export const agentDefinitionSourceKindSchema = z.enum(['SYSTEM', 'TENANT'])
export const agentVersionStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'RETIRED'])
export const agentIdentityStatusSchema = z.enum(['ACTIVE', 'ARCHIVED'])
export const agentToolModeSchema = z.enum(['READ_ONLY', 'MUTATING'])
export const agentConfirmedWriteAdapterKeySchema = z.literal('formula.candidate_save_draft')
export const agentRunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION', 'SUCCEEDED', 'FAILED', 'CANCELLED'])
export const agentJobStatusSchema = z.enum(['QUEUED', 'LEASED', 'SUCCEEDED', 'FAILED', 'CANCELLED'])
export const agentRunNodeKindSchema = z.enum(['AGENT', 'TOOL', 'PROVIDER', 'ARTIFACT', 'ROUTER', 'CONFIRMATION', 'TERMINAL'])
export const agentRunNodeStatusSchema = z.enum(['PENDING', 'READY', 'RUNNING', 'WAITING_FOR_TOOL', 'WAITING_FOR_CONFIRMATION', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED'])
export const agentMessageRoleSchema = z.enum(['SYSTEM', 'USER', 'ASSISTANT', 'TOOL', 'EVENT'])
export const agentMessageKindSchema = z.enum(['INPUT', 'OUTPUT', 'SUMMARY', 'ERROR', 'STATUS'])
export const agentRedactionStatusSchema = z.enum(['NONE', 'REDACTED', 'OMITTED'])
export const agentConfirmationIntentTypeSchema = z.enum(['TOOL_INVOCATION', 'DOMAIN_MUTATION', 'EXTERNAL_SIDE_EFFECT'])
export const agentRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH'])
export const agentProviderUsageStatusSchema = z.enum(['RECORDED', 'ESTIMATED', 'NOT_CONFIGURED', 'FAILED'])
export const agentEvaluationSubjectKindSchema = z.enum(['RUN', 'RUN_NODE', 'TOOL_CALL', 'ARTIFACT', 'WORKFLOW_VERSION'])
export const agentEvaluatorKindSchema = z.enum(['RULE', 'HUMAN', 'PROVIDER'])
export const agentEvaluationStatusSchema = z.enum(['PENDING', 'PASSED', 'FAILED', 'INCONCLUSIVE'])
export const agentLineageEndpointKindSchema = z.enum(['RUN_INPUT', 'RUN_OUTPUT', 'ARTIFACT', 'TOOL_INPUT', 'TOOL_OUTPUT', 'PROVIDER_REQUEST', 'PROVIDER_RESPONSE', 'EVALUATION_CASE', 'EVALUATION_RESULT', 'DOMAIN_RECORD'])
export const agentLineageRelationSchema = z.enum(['DERIVED_FROM', 'CONSUMED', 'PRODUCED', 'EVALUATED', 'GROUNDED_BY', 'CONFIRMED_BY'])

const sourceMarkerShape = {
  sourceKind: agentDefinitionSourceKindSchema.default('TENANT'),
  bootstrapKey: stableKey.optional(),
}
const enforceSourceMarker = (value: { sourceKind: 'SYSTEM' | 'TENANT'; bootstrapKey?: string }, context: z.RefinementCtx) => {
  if (value.sourceKind === 'SYSTEM' && !value.bootstrapKey) context.addIssue({ code: z.ZodIssueCode.custom, path: ['bootstrapKey'], message: 'System-owned records require a stable bootstrap key.' })
  if (value.sourceKind === 'TENANT' && value.bootstrapKey) context.addIssue({ code: z.ZodIssueCode.custom, path: ['bootstrapKey'], message: 'Tenant-owned records cannot claim a bootstrap key.' })
}

export const agentDefinitionCreateRequestSchema = z.object({
  ...sourceMarkerShape,
  agentKey: stableKey,
  displayName: boundedText(200),
  description: z.string().trim().max(2_000).optional(),
}).strict().superRefine(enforceSourceMarker)
export type AgentDefinitionCreateRequest = z.infer<typeof agentDefinitionCreateRequestSchema>

export const agentWorkflowCreateRequestSchema = z.object({
  ...sourceMarkerShape,
  workflowKey,
  displayName: boundedText(200),
  description: z.string().trim().max(2_000).optional(),
}).strict().superRefine(enforceSourceMarker)
export type AgentWorkflowCreateRequest = z.infer<typeof agentWorkflowCreateRequestSchema>

export const agentToolCreateRequestSchema = z.object({
  ...sourceMarkerShape,
  toolKey,
  displayName: boundedText(200),
}).strict().superRefine(enforceSourceMarker)
export type AgentToolCreateRequest = z.infer<typeof agentToolCreateRequestSchema>

export const agentPolicyCreateRequestSchema = z.object({
  ...sourceMarkerShape,
  policyKey: stableKey,
  displayName: boundedText(200),
}).strict().superRefine(enforceSourceMarker)
export type AgentPolicyCreateRequest = z.infer<typeof agentPolicyCreateRequestSchema>

export const agentInstructionTemplateReferenceSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9._-]{0,159}$/),
  version: schemaVersion,
  contentHash: hash,
}).strict()
export type AgentInstructionTemplateReference = z.infer<typeof agentInstructionTemplateReferenceSchema>

const modelPolicySchema = z.object({
  providerAllowlist: z.array(z.string().trim().regex(/^[a-z][a-z0-9._-]{0,119}$/)).min(1).max(32).transform((value) => [...new Set(value)]),
  modelAllowlist: z.array(z.string().trim().regex(/^[a-zA-Z0-9._:/-]{1,199}$/)).min(1).max(64).transform((value) => [...new Set(value)]),
  maxInputTokens: z.number().int().min(1).max(2_000_000),
  maxOutputTokens: z.number().int().min(1).max(200_000),
  temperature: z.number().finite().min(0).max(2).optional(),
}).strict()

const publicationSchema = z.object({
  status: agentVersionStatusSchema.default('DRAFT'),
  publishedAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === 'DRAFT' && value.publishedAt) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publishedAt'], message: 'Draft versions cannot carry a publication timestamp.' })
  if (value.status !== 'DRAFT' && !value.publishedAt) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publishedAt'], message: 'Published or retired versions require their publication timestamp.' })
})

export const agentDefinitionVersionCreateRequestSchema = z.object({
  agentDefinitionId: id,
  versionNumber: z.number().int().positive().max(1_000_000),
  protocolVersion,
  instructionTemplate: agentInstructionTemplateReferenceSchema,
  inputSchema: jsonSchemaDocumentSchema,
  outputSchema: jsonSchemaDocumentSchema,
  modelPolicy: modelPolicySchema,
  contentHash: hash,
  publication: publicationSchema,
}).strict()
export type AgentDefinitionVersionCreateRequest = z.infer<typeof agentDefinitionVersionCreateRequestSchema>

const toolRetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  backoffMs: z.number().int().min(0).max(300_000),
  retryableCodes: z.array(z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,119}$/)).max(32).transform((value) => [...new Set(value)]),
}).strict()
const toolConfirmationPolicySchema = z.object({
  required: z.boolean(),
  expiresInSeconds: z.number().int().min(60).max(86_400).optional(),
}).strict().superRefine((value, context) => {
  if (value.required && value.expiresInSeconds === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresInSeconds'], message: 'Confirmation expiry is required for a mutating tool.' })
})

export const agentToolVersionCreateRequestSchema = z.object({
  toolId: id,
  versionNumber: z.number().int().positive().max(1_000_000),
  mode: agentToolModeSchema,
  adapterKey: z.string().trim().regex(/^[a-z][a-z0-9._-]{0,159}$/),
  requiredPermissions: z.array(capabilityKey).max(64).transform((value) => [...new Set(value)]),
  inputSchema: jsonSchemaDocumentSchema,
  outputSchema: jsonSchemaDocumentSchema,
  timeoutMs: z.number().int().min(100).max(120_000),
  retryPolicy: toolRetryPolicySchema,
  confirmationPolicy: toolConfirmationPolicySchema,
  contentHash: hash,
  publication: publicationSchema,
}).strict().superRefine((value, context) => {
  if (value.mode === 'MUTATING' && !value.confirmationPolicy.required) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmationPolicy', 'required'], message: 'Mutating tools require an explicit confirmation policy.' })
  }
  if (value.mode === 'MUTATING' && value.adapterKey !== agentConfirmedWriteAdapterKeySchema.value) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['adapterKey'], message: 'Only formula.candidate_save_draft is an approved mutating adapter.' })
  }
})
export type AgentToolVersionCreateRequest = z.infer<typeof agentToolVersionCreateRequestSchema>

const providerPolicySchema = z.object({
  providers: z.array(z.object({
    providerKey: z.string().trim().regex(/^[a-z][a-z0-9._-]{0,119}$/),
    modelAllowlist: z.array(z.string().trim().regex(/^[a-zA-Z0-9._:/-]{1,199}$/)).min(1).max(64).transform((value) => [...new Set(value)]),
    maxInputTokens: z.number().int().min(1).max(2_000_000),
    maxOutputTokens: z.number().int().min(1).max(200_000),
  }).strict()).max(32).superRefine((value, context) => {
    if (new Set(value.map((entry) => entry.providerKey)).size !== value.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provider keys must be unique.' })
  }),
}).strict()
const dataHandlingPolicySchema = z.object({
  persistRawProviderPayloads: z.literal(false),
  persistReasoning: z.literal(false),
  redactionMode: z.enum(['NONE', 'REDACTED', 'OMITTED']),
  retentionDays: z.number().int().min(1).max(3_650),
}).strict()
const runtimeConfirmationPolicySchema = z.object({
  requireConfirmationForMutations: z.literal(true),
  defaultExpiresInSeconds: z.number().int().min(60).max(86_400),
}).strict()

export const agentPolicyVersionCreateRequestSchema = z.object({
  policyId: id,
  versionNumber: z.number().int().positive().max(1_000_000),
  allowedCapabilities: z.array(capabilityKey).max(128).transform((value) => [...new Set(value)]),
  providerPolicy: providerPolicySchema,
  dataHandlingPolicy: dataHandlingPolicySchema,
  confirmationPolicy: runtimeConfirmationPolicySchema,
  contentHash: hash,
  publication: publicationSchema,
}).strict()
export type AgentPolicyVersionCreateRequest = z.infer<typeof agentPolicyVersionCreateRequestSchema>

const workflowNodeSchema = z.object({
  key: nodeKey,
  kind: agentRunNodeKindSchema,
}).strict()
const workflowEdgeSchema = z.object({
  from: nodeKey,
  to: nodeKey,
  conditionKey: z.string().trim().regex(/^[a-z][a-z0-9._-]{0,119}$/).optional(),
}).strict()
export const agentWorkflowToolBindingSchema = z.object({
  nodeKey,
  toolVersionId: id,
  maxInvocations: z.number().int().min(1).max(100).default(1),
  confirmationRequired: z.boolean().default(false),
}).strict()

export const agentWorkflowVersionCreateRequestSchema = z.object({
  workflowId: id,
  versionNumber: z.number().int().positive().max(1_000_000),
  agentDefinitionVersionId: id,
  policyVersionId: id,
  nodes: z.array(workflowNodeSchema).min(1).max(128),
  edges: z.array(workflowEdgeSchema).max(512).default([]),
  toolBindings: z.array(agentWorkflowToolBindingSchema).max(128).default([]),
  inputSchema: jsonSchemaDocumentSchema,
  outputSchema: jsonSchemaDocumentSchema,
  contentHash: hash,
  publication: publicationSchema,
}).strict().superRefine((value, context) => {
  const nodeKeys = new Set(value.nodes.map((node) => node.key))
  if (nodeKeys.size !== value.nodes.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: 'Workflow node keys must be unique.' })
  for (const [index, edge] of value.edges.entries()) {
    if (!nodeKeys.has(edge.from) || !nodeKeys.has(edge.to) || edge.from === edge.to) context.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index], message: 'Workflow edges must connect distinct declared nodes.' })
  }
  if (new Set(value.toolBindings.map((binding) => binding.nodeKey)).size !== value.toolBindings.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['toolBindings'], message: 'A workflow node may bind at most one tool version.' })
  for (const [index, binding] of value.toolBindings.entries()) {
    const node = value.nodes.find((candidate) => candidate.key === binding.nodeKey)
    if (!node || node.kind !== 'TOOL') context.addIssue({ code: z.ZodIssueCode.custom, path: ['toolBindings', index, 'nodeKey'], message: 'Tool bindings require a declared TOOL node.' })
  }
  for (const node of value.nodes.filter((candidate) => candidate.kind === 'TOOL')) {
    if (!value.toolBindings.some((binding) => binding.nodeKey === node.key)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['toolBindings'], message: `TOOL node ${node.key} requires an immutable tool-version binding.` })
    }
  }
})
export type AgentWorkflowVersionCreateRequest = z.infer<typeof agentWorkflowVersionCreateRequestSchema>

export const agentActiveVersionSetRequestSchema = z.object({ activeVersionId: id }).strict()
export type AgentActiveVersionSetRequest = z.infer<typeof agentActiveVersionSetRequestSchema>

export const agentRunCreateRequestSchema = z.object({
  agentDefinitionVersionId: id,
  workflowVersionId: id,
  policyVersionId: id,
  protocolVersion: protocolVersion.default('agent-runtime/v1'),
  inputHash: hash,
  inputSchemaVersion: schemaVersion,
  correlationId: id,
  traceId: id.optional(),
  parentRunId: id.optional(),
  causationEventId: id.optional(),
}).strict()
export type AgentRunCreateRequest = z.infer<typeof agentRunCreateRequestSchema>

export const agentRunNodeCreateRequestSchema = z.object({
  workflowNodeKey: nodeKey,
  nodeKind: agentRunNodeKindSchema,
  attempt: z.number().int().min(1).max(100).default(1),
  inputHash: hash.optional(),
  correlationId: id,
}).strict()
export type AgentRunNodeCreateRequest = z.infer<typeof agentRunNodeCreateRequestSchema>

export const agentRunMessageCreateRequestSchema = z.object({
  runNodeId: id.optional(),
  sequence: z.number().int().positive(),
  messageRole: agentMessageRoleSchema,
  messageKind: agentMessageKindSchema,
  schemaVersion,
  payload: safeMessagePayloadSchema,
  payloadHash: hash,
  redactionStatus: agentRedactionStatusSchema.default('NONE'),
  correlationId: id,
}).strict()
export type AgentRunMessageCreateRequest = z.infer<typeof agentRunMessageCreateRequestSchema>

export const agentEventEnvelopeSchema = z.object({
  eventId: id,
  runId: id,
  runNodeId: id.optional(),
  sequence: z.number().int().positive(),
  eventType: z.string().trim().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){1,3}$/),
  protocolVersion: protocolVersion.default('agent-runtime/v1'),
  eventSchemaVersion: schemaVersion,
  correlationId: id,
  causationEventId: id.optional(),
  payload: safeEventPayloadSchema,
}).strict()
export type AgentEventEnvelope = z.infer<typeof agentEventEnvelopeSchema>

export const agentToolInvocationCreateRequestSchema = z.object({
  runNodeId: id.optional(),
  toolVersionId: id,
  policyVersionId: id,
  confirmationIntentId: id.optional(),
  invocationKey: z.string().trim().min(8).max(200),
  attempt: z.number().int().min(1).max(100).default(1),
  inputHash: hash,
  inputSchemaVersion: schemaVersion,
  correlationId: id,
}).strict()
export type AgentToolInvocationCreateRequest = z.infer<typeof agentToolInvocationCreateRequestSchema>

export const agentConfirmationIntentCreateRequestSchema = z.object({
  runNodeId: id.optional(),
  toolCallId: id.optional(),
  policyVersionId: id,
  intentKey,
  intentType: agentConfirmationIntentTypeSchema,
  riskLevel: agentRiskLevelSchema,
  actionHash: hash,
  actionSummary: boundedText(1_000),
  expiresAt: z.string().datetime({ offset: true }),
  correlationId: id,
}).strict().superRefine((value, context) => {
  if (value.intentType === 'TOOL_INVOCATION' && !value.toolCallId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['toolCallId'], message: 'Tool confirmation intents require their invocation.' })
})
export type AgentConfirmationIntentCreateRequest = z.infer<typeof agentConfirmationIntentCreateRequestSchema>

export const agentProviderUsageCreateRequestSchema = z.object({
  runNodeId: id.optional(),
  toolCallId: id.optional(),
  providerKey: z.string().trim().regex(/^[a-z][a-z0-9._-]{0,119}$/),
  modelIdentifier: z.string().trim().min(1).max(200),
  providerApiVersion: z.string().trim().min(1).max(120).optional(),
  usageStatus: agentProviderUsageStatusSchema,
  requestHash: hash,
  responseHash: hash.optional(),
  inputTokens: z.number().int().min(0).max(2_000_000).default(0),
  outputTokens: z.number().int().min(0).max(200_000).default(0),
  cachedInputTokens: z.number().int().min(0).max(2_000_000).default(0),
  totalCostMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  currencyCode: z.string().trim().regex(/^[A-Z]{3}$/).default('USD'),
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).optional(),
  correlationId: id,
}).strict().superRefine((value, context) => {
  if (value.completedAt && value.completedAt < value.startedAt) context.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'Provider completion cannot precede its start.' })
  if (value.usageStatus === 'RECORDED' && !value.responseHash) context.addIssue({ code: z.ZodIssueCode.custom, path: ['responseHash'], message: 'Recorded provider usage requires a response hash.' })
})
export type AgentProviderUsageCreateRequest = z.infer<typeof agentProviderUsageCreateRequestSchema>

export const agentEvaluationCreateRequestSchema = z.object({
  runNodeId: id.optional(),
  policyVersionId: id,
  evaluationKey: nodeKey,
  subjectKind: agentEvaluationSubjectKindSchema,
  subjectRef: id,
  evaluatorKind: agentEvaluatorKindSchema,
  status: agentEvaluationStatusSchema,
  score: z.number().finite().min(0).max(1).optional(),
  resultSummary: safeEventPayloadSchema,
  resultHash: hash,
  correlationId: id,
}).strict().superRefine((value, context) => {
  if (value.status === 'PASSED' && value.score === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['score'], message: 'A passing evaluation requires a score.' })
})
export type AgentEvaluationCreateRequest = z.infer<typeof agentEvaluationCreateRequestSchema>

export const agentLineageReferenceCreateRequestSchema = z.object({
  originatingEventId: id.optional(),
  sourceKind: agentLineageEndpointKindSchema,
  sourceRef: id,
  targetKind: agentLineageEndpointKindSchema,
  targetRef: id,
  relationType: agentLineageRelationSchema,
  sourceContentHash: hash.optional(),
  targetContentHash: hash.optional(),
  metadata: safeMetadataSchema(16_384).default({}),
  correlationId: id,
}).strict().superRefine((value, context) => {
  if (value.sourceKind === value.targetKind && value.sourceRef === value.targetRef) context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetRef'], message: 'A lineage reference cannot target itself.' })
})
export type AgentLineageReferenceCreateRequest = z.infer<typeof agentLineageReferenceCreateRequestSchema>
