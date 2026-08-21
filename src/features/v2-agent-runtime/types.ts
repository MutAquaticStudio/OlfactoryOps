import type { AgentRuntimeEvent, AgentRuntimeState } from '../../data/agentRuntime.js'

export type AgentCapabilities = Record<string, boolean>

export type AgentDefinition = {
  key: string
  name: string
  description?: string | null
  status?: string | null
  activeVersion?: string | null
  updatedAt?: string | null
}

export type AgentDefinitionDetail = AgentDefinition & Record<string, unknown>

export type AgentRun = {
  id: string
  status: string
  definitionKey?: string | null
  workflowKey?: string | null
  correlationId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  nextSequence?: number | null
  [key: string]: unknown
}

export type AgentToolCall = {
  id: string
  toolKey?: string | null
  tool?: string | null
  status?: string | null
  requestedAt?: string | null
  completedAt?: string | null
  error?: string | null
  inputHash?: string | null
  outputHash?: string | null
  [key: string]: unknown
}

export type AgentArtifact = {
  id: string
  type?: string | null
  artifactType?: string | null
  name?: string | null
  status?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

export type AgentConfirmation = {
  id: string
  actionKey?: string | null
  action?: string | null
  summary?: string | null
  status?: string | null
  expiresAt?: string | null
  requestedAt?: string | null
  [key: string]: unknown
}

/**
 * The confirmation endpoint intentionally returns only a bounded decision
 * context. It must never be widened into a generic Formula or agent payload.
 */
export type AgentConfirmationPreview = {
  runId: string
  confirmationId: string
  actionKey: string
  status: string
  expiresAt?: string | null
  candidateId?: string | null
  formulaProjectId?: string | null
  actionHash?: string | null
  initiatorUserId?: string | null
  evidenceHashes: Array<{ kind: string; hash: string }>
}

export type AgentLineageEvidence = {
  id: string
  sourceKind?: string | null
  sourceRef?: string | null
  targetKind?: string | null
  targetRef?: string | null
  relationType?: string | null
  sourceContentHash?: string | null
  targetContentHash?: string | null
  createdAt?: string | null
}

export type AgentProviderUsageEvidence = {
  id: string
  providerKey?: string | null
  modelIdentifier?: string | null
  usageStatus?: string | null
  requestHash?: string | null
  responseHash?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalCostMicros?: string | null
  createdAt?: string | null
}

/** A bounded projection of the dedicated run-evidence endpoint. */
export type AgentRunEvidence = {
  runId?: string | null
  lineage: AgentLineageEvidence[]
  providerUsage: AgentProviderUsageEvidence[]
}

export type AgentRunError = {
  id?: string
  code?: string | null
  message?: string | null
  retryable?: boolean | null
  createdAt?: string | null
  [key: string]: unknown
}

export type AgentRunDetail = {
  run: AgentRun
  events: AgentRuntimeEvent[]
  artifacts?: AgentArtifact[]
  confirmations?: AgentConfirmation[]
  toolCalls?: AgentToolCall[]
  errors?: AgentRunError[]
  evidence?: AgentRunEvidence
}

export type AgentRunReplay = {
  run: AgentRun
  events: AgentRuntimeEvent[]
  cursor?: string | null
  resyncRequired?: boolean
}

export type AgentConsoleRun = {
  detail: AgentRunDetail
  timeline: AgentRuntimeState
}

export type AgentEvaluation = {
  id: string
  status?: string | null
  definitionKey?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export type AgentObservability = Record<string, unknown>

export type AgentSseControl = {
  event: 'connection.snapshot' | 'connection.resync_required'
  data: unknown
}
