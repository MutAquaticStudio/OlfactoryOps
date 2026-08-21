import type { PlatformContext } from '../../../services/platform/src/types.js'

/**
 * Phase 9 controller/service seam. DurableAgentService should implement these
 * methods as the runtime work lands; HTTP must never synthesize agent state.
 */
export type AgentRunListQuery = Readonly<{
  after?: string
  limit: number
  definitionKey?: string
  status?: string
}>

export type AgentReplayQuery = Readonly<{
  afterSequence: number
  limit: number
}>

export type AgentDefinitionSummary = Readonly<{
  key: string
  name: string
  description?: string
  status: string
  activeVersion?: string | null
  updatedAt?: string
}>

export type AgentPersistedEvent = Readonly<{
  id: string
  sequence: number
  type: string
  payload: Record<string, unknown>
  createdAt?: Date | string
  occurredAt?: Date | string
  organizationId?: string
}>

export type AgentRunProjection = Readonly<{
  id: string
  status: string
  definitionKey?: string
  workflowKey?: string
  nextSequence?: number
  createdAt?: Date | string
  updatedAt?: Date | string
  [key: string]: unknown
}>

export type AgentRunDetail = Readonly<{
  run: AgentRunProjection
  events: AgentPersistedEvent[]
  artifacts?: unknown[]
  confirmations?: unknown[]
  toolCalls?: unknown[]
  errors?: unknown[]
  evidence?: unknown[]
}>

export type AgentReplayProjection = Readonly<{
  run: AgentRunProjection
  events: AgentPersistedEvent[]
  cursor?: string | null
  resyncRequired?: boolean
}>

/**
 * Deliberately narrow confirmation context. It is safe for an authorized
 * confirmer to inspect, but it never carries formula composition, prompts,
 * provider data, credentials, or an arbitrary action payload.
 */
export type AgentConfirmationPreview = Readonly<{
  runId: string
  confirmationId: string
  actionKey: string
  status: string
  expiresAt?: Date | string
  candidateId?: string
  formulaProjectId?: string
  actionHash?: string
  initiatorUserId?: string
  evidenceHashes: ReadonlyArray<Readonly<{ kind: string; hash: string }>>
}>

export type Phase9AgentRuntimePort = {
  listDefinitions(context: PlatformContext): Promise<AgentDefinitionSummary[]>
  definitionDetail(context: PlatformContext, definitionKey: string): Promise<unknown>
  createDefinition(context: PlatformContext, input: unknown, idempotencyKey?: string): Promise<unknown>
  createDefinitionVersion(context: PlatformContext, definitionKey: string, input: unknown, idempotencyKey?: string): Promise<unknown>
  listDefinitionVersions(context: PlatformContext, definitionKey: string): Promise<unknown>
  definitionPolicy(context: PlatformContext, definitionKey: string): Promise<unknown>
  updateDefinitionPolicy(context: PlatformContext, definitionKey: string, input: unknown, idempotencyKey?: string): Promise<unknown>
  listRuns(context: PlatformContext, query: AgentRunListQuery): Promise<unknown>
  start(context: PlatformContext, input: unknown, idempotencyKey?: string): Promise<unknown>
  execute(context: PlatformContext, runId: string, idempotencyKey?: string): Promise<unknown>
  detail(context: PlatformContext, runId: string, afterSequence?: number): Promise<AgentRunDetail>
  replay(context: PlatformContext, runId: string, query: AgentReplayQuery): Promise<AgentReplayProjection>
  evidence(context: PlatformContext, runId: string): Promise<unknown>
  confirmationPreview(context: PlatformContext, runId: string, confirmationId: string): Promise<AgentConfirmationPreview>
  confirm(context: PlatformContext, runId: string, confirmationId: string, input: unknown, idempotencyKey?: string): Promise<unknown>
  retry(context: PlatformContext, runId: string, idempotencyKey?: string): Promise<unknown>
  cancel(context: PlatformContext, runId: string, idempotencyKey?: string): Promise<unknown>
  listEvaluations(context: PlatformContext, query: Readonly<{ after?: string; limit: number }>): Promise<unknown>
  createEvaluation(context: PlatformContext, input: unknown, idempotencyKey?: string): Promise<unknown>
  evaluationDetail(context: PlatformContext, evaluationId: string): Promise<unknown>
  observability(context: PlatformContext): Promise<unknown>
}
