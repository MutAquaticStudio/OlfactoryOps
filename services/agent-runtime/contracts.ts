import { z } from 'zod'

export const toolModeSchema = z.enum(['READ_ONLY', 'MUTATING'])
export type ToolMode = z.infer<typeof toolModeSchema>

export const toolVersionSchema = z.object({ name: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/), version: z.string().regex(/^\d+\.\d+\.\d+$/) })
export type ToolVersion = z.infer<typeof toolVersionSchema>

// Permission registry keys are generally lower-case. A small number of
// established V2 keys retain camelCase (for example production.finishedGoods.view),
// so the runtime must validate against the registry's real key surface rather than
// silently making those controls unusable.
export const toolPermissionSchema = z.object({ permissionKey: z.string().regex(/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/), required: z.boolean() })
export type ToolPermission = z.infer<typeof toolPermissionSchema>

export const toolInputSchemaSchema = z.object({ schemaVersion: z.string().min(1).max(40), jsonSchema: z.record(z.string(), z.unknown()) })
export type ToolInputSchema = z.infer<typeof toolInputSchemaSchema>
export const toolOutputSchemaSchema = toolInputSchemaSchema
export type ToolOutputSchema = z.infer<typeof toolOutputSchemaSchema>

export const toolTimeoutSchema = z.object({ timeoutMs: z.number().int().min(100).max(120000) })
export type ToolTimeout = z.infer<typeof toolTimeoutSchema>

export const toolRetryPolicySchema = z.object({ maxAttempts: z.number().int().min(1).max(3), backoffMs: z.number().int().min(0).max(30000), retryableErrors: z.array(z.string().min(1).max(80)) })
export type ToolRetryPolicy = z.infer<typeof toolRetryPolicySchema>

export const toolConfirmationPolicySchema = z.object({ required: z.boolean(), expiresInSeconds: z.number().int().min(60).max(86400).optional() })
export type ToolConfirmationPolicy = z.infer<typeof toolConfirmationPolicySchema>

export const toolDefinitionSchema = z.object({
  tool: toolVersionSchema,
  description: z.string().trim().min(1).max(500),
  mode: toolModeSchema,
  permissions: z.array(toolPermissionSchema),
  input: toolInputSchemaSchema,
  output: toolOutputSchemaSchema,
  timeout: toolTimeoutSchema,
  retry: toolRetryPolicySchema,
  confirmation: toolConfirmationPolicySchema,
  auditEventType: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/),
})
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>

export function validateToolDefinition(input: unknown): ToolDefinition {
  const tool = toolDefinitionSchema.parse(input)
  if (tool.mode === 'MUTATING' && tool.permissions.length === 0) throw new Error('MUTATING tools require a permission')
  if (tool.mode === 'MUTATING' && !tool.confirmation.required) throw new Error('MUTATING tools require an explicit confirmation policy')
  if (tool.mode === 'MUTATING' && tool.tool.name !== 'formula.candidate_save_draft') {
    throw new Error('Only the registered candidate-save-draft tool may mutate a domain record')
  }
  return tool
}

/**
 * Phase 9 runtime contracts stay deliberately small and composable. Package
 * contracts own HTTP payloads; these definitions are the server-only compiled
 * workflow and adapter boundary. They never carry provider reasoning or raw
 * tenant records.
 */
export const AGENT_RUNTIME_LIMITS = Object.freeze({
  maxNodesPerRun: 8,
  maxToolCallsPerRun: 12,
  maxRetryAttempts: 2,
  maxEventPayloadBytes: 64 * 1024,
  maxContextBytes: 48 * 1024,
  maxContextItems: 32,
  maxReplayEvents: 200,
  maxArtifactBytes: 64 * 1024,
})

export const agentDefinitionKeySchema = z.string().trim().regex(/^[a-z][a-z0-9-]{1,79}$/)
export const agentDefinitionStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'])
export const agentVersionStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'RETIRED'])
export const agentRunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION', 'SUCCEEDED', 'FAILED', 'CANCELLED'])
export const agentJobStatusSchema = z.enum(['QUEUED', 'LEASED', 'SUCCEEDED', 'FAILED', 'CANCELLED'])
export const agentStepStatusSchema = z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED', 'WAITING_FOR_CONFIRMATION'])
export const agentWorkflowNodeKindSchema = z.enum(['TOOL', 'PROVIDER', 'ARTIFACT', 'CONFIRMATION'])
export const agentEventKindSchema = z.enum([
  'run.created', 'run.started', 'run.completed', 'run.failed', 'run.cancelled', 'run.resumed',
  'job.queued', 'job.leased', 'job.retrying', 'job.cancelled',
  'step.started', 'step.completed', 'step.failed', 'tool.requested', 'tool.completed', 'tool.denied',
  'artifact.created', 'confirmation.requested', 'confirmation.decided', 'confirmation.expired',
])
export const agentConfirmationIntentSchema = z.enum(['CANDIDATE_SAVE_DRAFT'])
export const agentConfirmationStatusSchema = z.enum(['PENDING', 'PROCESSING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'])
export const agentProviderStatusSchema = z.enum(['NOT_CONFIGURED', 'COMPLETED', 'FAILED'])

const runtimeId = z.string().trim().min(1).max(160)
const boundedMetadata = z.record(z.string(), z.unknown())
const schemaVersion = z.string().trim().min(1).max(40)

export const agentWorkflowNodeSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,79}$/),
  kind: agentWorkflowNodeKindSchema,
  dependsOn: z.array(z.string().trim().regex(/^[a-z][a-z0-9_]{1,79}$/)).max(AGENT_RUNTIME_LIMITS.maxNodesPerRun).default([]),
  toolKey: z.string().trim().max(120).optional(),
  providerKey: z.string().trim().max(120).optional(),
  artifactType: z.string().trim().max(120).optional(),
  confirmationIntent: agentConfirmationIntentSchema.optional(),
  conditionKey: z.string().trim().regex(/^[a-z][a-z0-9_]{1,79}$/).optional(),
  inputSchemaVersion: schemaVersion,
  outputSchemaVersion: schemaVersion,
  timeoutMs: z.number().int().min(100).max(120_000),
  maxAttempts: z.number().int().min(1).max(AGENT_RUNTIME_LIMITS.maxRetryAttempts + 1).default(1),
}).strict().superRefine((node, issue) => {
  if (node.kind === 'TOOL' && !node.toolKey) issue.addIssue({ code: z.ZodIssueCode.custom, path: ['toolKey'], message: 'Tool workflow nodes require a registered tool key.' })
  if (node.kind === 'PROVIDER' && !node.providerKey) issue.addIssue({ code: z.ZodIssueCode.custom, path: ['providerKey'], message: 'Provider workflow nodes require a provider key.' })
  if (node.kind === 'ARTIFACT' && !node.artifactType) issue.addIssue({ code: z.ZodIssueCode.custom, path: ['artifactType'], message: 'Artifact workflow nodes require an artifact type.' })
  if (node.kind === 'CONFIRMATION' && !node.confirmationIntent) issue.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmationIntent'], message: 'Confirmation workflow nodes require a registered intent.' })
})
export type AgentWorkflowNode = z.infer<typeof agentWorkflowNodeSchema>

export const agentWorkflowSchema = z.object({
  workflowKey: z.string().trim().regex(/^[a-z][a-z0-9-]{1,79}\/[1-9][0-9]*$/),
  schemaVersion,
  nodes: z.array(agentWorkflowNodeSchema).min(1).max(AGENT_RUNTIME_LIMITS.maxNodesPerRun),
}).strict().superRefine((workflow, issue) => {
  const keys = new Set<string>()
  for (const [index, node] of workflow.nodes.entries()) {
    if (keys.has(node.key)) issue.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'key'], message: 'Workflow node keys must be unique.' })
    keys.add(node.key)
    if (node.dependsOn.includes(node.key)) issue.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'dependsOn'], message: 'A workflow node cannot depend on itself.' })
  }
  for (const [index, node] of workflow.nodes.entries()) {
    for (const dependency of node.dependsOn) {
      if (!keys.has(dependency)) issue.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'dependsOn'], message: `Unknown workflow dependency: ${dependency}.` })
    }
  }
  const dependencies = new Map(workflow.nodes.map((node) => [node.key, node.dependsOn]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (key: string): boolean => {
    if (visited.has(key)) return false
    if (visiting.has(key)) return true
    visiting.add(key)
    for (const dependency of dependencies.get(key) ?? []) {
      if (visit(dependency)) return true
    }
    visiting.delete(key)
    visited.add(key)
    return false
  }
  if (workflow.nodes.some((node) => visit(node.key))) {
    issue.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: 'Workflow dependencies must not contain a cycle.' })
  }
  const possibleToolCalls = workflow.nodes.filter((node) => node.kind === 'TOOL').reduce((total, node) => total + node.maxAttempts, 0)
  if (possibleToolCalls > AGENT_RUNTIME_LIMITS.maxToolCallsPerRun) {
    issue.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: `Workflow can invoke at most ${AGENT_RUNTIME_LIMITS.maxToolCallsPerRun} tools per run.` })
  }
})
export type AgentWorkflow = z.infer<typeof agentWorkflowSchema>

export const agentDefinitionRecordSchema = z.object({
  id: runtimeId,
  key: agentDefinitionKeySchema,
  displayName: z.string().trim().min(1).max(160),
  status: agentDefinitionStatusSchema,
  policyVersion: schemaVersion,
  defaultVersion: schemaVersion,
  metadata: boundedMetadata.default({}),
}).strict()
export type AgentDefinitionRecord = z.infer<typeof agentDefinitionRecordSchema>

export const agentVersionRecordSchema = z.object({
  id: runtimeId,
  definitionId: runtimeId,
  version: schemaVersion,
  status: agentVersionStatusSchema,
  workflow: agentWorkflowSchema,
  toolManifest: z.array(toolVersionSchema).max(AGENT_RUNTIME_LIMITS.maxToolCallsPerRun),
  providerKey: z.string().trim().max(120).optional(),
  policyVersion: schemaVersion,
  publishedAt: z.string().datetime().optional(),
}).strict()
export type AgentVersionRecord = z.infer<typeof agentVersionRecordSchema>

export const agentPolicyRecordSchema = z.object({
  id: runtimeId,
  definitionId: runtimeId,
  version: schemaVersion,
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  allowedToolKeys: z.array(z.string().trim().max(120)).max(AGENT_RUNTIME_LIMITS.maxToolCallsPerRun),
  allowedProviderKeys: z.array(z.string().trim().max(120)).max(8),
  maxRunsPerActor: z.number().int().positive().max(50),
  maxRunsPerTenant: z.number().int().positive().max(500),
  metadata: boundedMetadata.default({}),
}).strict()
export type AgentPolicyRecord = z.infer<typeof agentPolicyRecordSchema>

export const agentToolInvocationRecordSchema = z.object({
  id: runtimeId,
  runId: runtimeId,
  stepId: runtimeId,
  toolKey: z.string().trim().max(120),
  toolVersion: schemaVersion,
  status: z.enum(['REQUESTED', 'SUCCEEDED', 'FAILED', 'DENIED', 'CANCELLED']),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  metadata: boundedMetadata.default({}),
}).strict()
export type AgentToolInvocationRecord = z.infer<typeof agentToolInvocationRecordSchema>

export const agentEventEnvelopeSchema = z.object({
  id: runtimeId,
  runId: runtimeId,
  sequence: z.number().int().positive(),
  type: agentEventKindSchema,
  payload: boundedMetadata,
  createdAt: z.string().datetime(),
}).strict()
export type AgentEventEnvelope = z.infer<typeof agentEventEnvelopeSchema>

export const agentConfirmationIntentRecordSchema = z.object({
  id: runtimeId,
  runId: runtimeId,
  intent: agentConfirmationIntentSchema,
  status: agentConfirmationStatusSchema,
  actionHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().datetime(),
  resultRef: runtimeId.nullable(),
}).strict()
export type AgentConfirmationIntentRecord = z.infer<typeof agentConfirmationIntentRecordSchema>

export function assertPublishedAgentVersion(definition: AgentDefinitionRecord, version: AgentVersionRecord, policy: AgentPolicyRecord) {
  if (definition.status !== 'ACTIVE') throw new Error('Agent definition is not active.')
  if (version.status !== 'PUBLISHED') throw new Error('Agent version is not published.')
  if (policy.status !== 'ACTIVE') throw new Error('Agent policy is not active.')
  if (version.definitionId !== definition.id || policy.definitionId !== definition.id) throw new Error('Agent configuration records do not belong to the same definition.')
  if (version.policyVersion !== policy.version || definition.policyVersion !== policy.version) throw new Error('Agent policy version is not aligned with the published workflow.')
  if (version.workflow.workflowKey !== `${definition.key}/${version.version.split('.')[0]}` && version.workflow.workflowKey !== definition.key) {
    throw new Error('Agent workflow key does not match its published definition.')
  }
  const manifest = new Set(version.toolManifest.map((tool) => tool.name))
  for (const node of version.workflow.nodes) {
    if (node.kind === 'TOOL' && (!node.toolKey || !manifest.has(node.toolKey) || !policy.allowedToolKeys.includes(node.toolKey))) {
      throw new Error(`Agent workflow tool is not allowed by the published manifest: ${node.toolKey ?? 'unknown'}.`)
    }
    if (node.kind === 'PROVIDER' && (!node.providerKey || !policy.allowedProviderKeys.includes(node.providerKey))) {
      throw new Error(`Agent workflow provider is not allowed by policy: ${node.providerKey ?? 'unknown'}.`)
    }
  }
  return { definition, version, policy }
}
