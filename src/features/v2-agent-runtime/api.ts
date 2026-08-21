import { agentRuntimeEventSchema, agentStreamControlSchema } from '../../data/agentRuntime.js'
import type { AgentRuntimeEvent } from '../../data/agentRuntime.js'
import type {
  AgentArtifact,
  AgentConfirmation,
  AgentConfirmationPreview,
  AgentDefinition,
  AgentDefinitionDetail,
  AgentEvaluation,
  AgentLineageEvidence,
  AgentObservability,
  AgentProviderUsageEvidence,
  AgentRun,
  AgentRunDetail,
  AgentRunEvidence,
  AgentRunError,
  AgentRunReplay,
  AgentToolCall,
} from './types.js'

const configuredApiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1'

function runtimeApiBase() {
  const trimmed = configuredApiBase.replace(/\/$/, '')
  if (/\/api\/v1$/.test(trimmed)) return `${trimmed}/v2/agent-runtime`
  return `${trimmed}/api/v1/v2/agent-runtime`
}

export const defaultAgentRuntimeApiBase = runtimeApiBase()

export function agentRunsApiBase(apiBase: string) {
  const trimmed = apiBase.replace(/\/$/, '')
  return /\/agent-runtime$/.test(trimmed) ? trimmed.replace(/\/agent-runtime$/, '/agent-runs') : `${trimmed}/agent-runs`
}

function joinUrl(apiBase: string, path = '') {
  const base = apiBase.replace(/\/$/, '')
  if (!path) return base
  if (path.startsWith('?')) return `${base}${path}`
  return `${base}/${path.replace(/^\//, '')}`
}

function csrfToken() {
  if (typeof document === 'undefined') return undefined
  return document.cookie.match(/(?:^|;\s*)oo_v2_csrf=([^;]+)/)?.[1]
    || window.localStorage.getItem('oo_v2_csrf')
    || undefined
}

let fallbackRequestSequence = 0

export function agentIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  fallbackRequestSequence += 1
  return `agent-runtime-ui-${Date.now()}-${fallbackRequestSequence}`
}

export type AgentOperationKeyCache = {
  acquire: (operationId: string, fingerprint: string) => string
  settle: (operationId: string, fingerprint: string) => void
}

/** Retain a mutation key during ambiguous delivery; changed payloads receive a new operation. */
export function createAgentOperationKeyCache(): AgentOperationKeyCache {
  const pending = new Map<string, { fingerprint: string; key: string }>()
  return {
    acquire(operationId, fingerprint) {
      const existing = pending.get(operationId)
      if (existing?.fingerprint === fingerprint) return existing.key
      const key = agentIdempotencyKey()
      pending.set(operationId, { fingerprint, key })
      return key
    },
    settle(operationId, fingerprint) {
      if (pending.get(operationId)?.fingerprint === fingerprint) pending.delete(operationId)
    },
  }
}

export class AgentRuntimeRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'AgentRuntimeRequestError'
    this.status = status
    this.code = code
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function nonEmptyString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function boundedOptionalString(value: unknown, maximum: number) {
  const text = optionalString(value)
  return text ? text.slice(0, maximum) : undefined
}

function contentHash(value: unknown) {
  const text = optionalString(value)
  return text && /^[a-f0-9]{64}$/i.test(text) ? text.toLowerCase() : undefined
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined
}

function responseMessage(payload: unknown) {
  const body = asRecord(payload)
  const error = asRecord(body.error)
  return nonEmptyString(error.message, nonEmptyString(body.message, 'Unable to complete this agent runtime request.'))
}

function responseCode(payload: unknown) {
  const error = asRecord(asRecord(payload).error)
  return optionalString(error.code)
}

async function responsePayload(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}))
}

function isMutation(method?: string) {
  return method !== undefined && !['GET', 'HEAD'].includes(method.toUpperCase())
}

export async function agentRuntimeRequest<T>(apiBase: string, path = '', init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const csrf = csrfToken()
  if (csrf) headers.set('X-CSRF-Token', decodeURIComponent(csrf))
  if (isMutation(init.method) && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', agentIdempotencyKey())

  const response = await fetch(joinUrl(apiBase, path), {
    ...init,
    cache: 'no-store',
    credentials: 'include',
    headers,
  })
  const payload = await responsePayload(response)
  if (!response.ok) throw new AgentRuntimeRequestError(responseMessage(payload), response.status, responseCode(payload))
  return payload as T
}

function normalizeDefinition(value: unknown): AgentDefinition {
  const record = asRecord(value)
  const key = nonEmptyString(record.key, nonEmptyString(record.id))
  if (!key) throw new Error('The runtime returned a definition without a stable key.')
  return {
    ...record,
    key,
    name: nonEmptyString(record.name, nonEmptyString(record.displayName, key)),
    description: optionalString(record.description),
    status: optionalString(record.status),
    activeVersion: optionalString(record.activeVersion),
    updatedAt: optionalString(record.updatedAt),
  }
}

function normalizeRun(value: unknown): AgentRun {
  const record = asRecord(value)
  const id = nonEmptyString(record.id)
  if (!id) throw new Error('The runtime returned a run without an id.')
  return {
    ...record,
    id,
    status: nonEmptyString(record.status, 'QUEUED'),
    definitionKey: optionalString(record.definitionKey),
    workflowKey: optionalString(record.workflowKey),
    correlationId: optionalString(record.correlationId),
    createdAt: optionalString(record.createdAt),
    updatedAt: optionalString(record.updatedAt),
    nextSequence: typeof record.nextSequence === 'number' ? record.nextSequence : undefined,
  }
}

function normalizeEvent(value: unknown): AgentRuntimeEvent {
  const parsed = agentRuntimeEventSchema.safeParse(value)
  if (!parsed.success) throw new Error('The runtime returned an event outside the replay protocol.')
  return parsed.data
}

function normalizeList<T>(value: unknown, normalize: (item: unknown) => T) {
  return asArray(value).map(normalize)
}

function normalizeToolCall(value: unknown): AgentToolCall {
  const record = asRecord(value)
  return {
    ...record,
    id: nonEmptyString(record.id, nonEmptyString(record.toolCallId, 'unknown-tool-call')),
    toolKey: optionalString(record.toolKey),
    tool: optionalString(record.tool),
    status: optionalString(record.status),
    requestedAt: optionalString(record.requestedAt),
    completedAt: optionalString(record.completedAt),
    error: optionalString(record.error),
    inputHash: optionalString(record.inputHash),
    outputHash: optionalString(record.outputHash),
  }
}

function normalizeArtifact(value: unknown): AgentArtifact {
  const record = asRecord(value)
  return {
    ...record,
    id: nonEmptyString(record.id, 'unknown-artifact'),
    type: optionalString(record.type),
    artifactType: optionalString(record.artifactType),
    name: optionalString(record.name),
    status: optionalString(record.status),
    createdAt: optionalString(record.createdAt),
  }
}

function normalizeConfirmation(value: unknown): AgentConfirmation {
  const record = asRecord(value)
  return {
    ...record,
    id: nonEmptyString(record.id, 'unknown-confirmation'),
    actionKey: optionalString(record.actionKey),
    action: optionalString(record.action),
    summary: optionalString(record.summary),
    status: optionalString(record.status),
    expiresAt: optionalString(record.expiresAt),
    requestedAt: optionalString(record.requestedAt),
  }
}

function normalizeConfirmationPreview(value: unknown): AgentConfirmationPreview {
  const record = asRecord(value)
  const runId = boundedOptionalString(record.runId, 160)
  const confirmationId = boundedOptionalString(record.confirmationId, 160)
  const actionKey = boundedOptionalString(record.actionKey, 120)
  const status = boundedOptionalString(record.status, 80)
  if (!runId || !confirmationId || !actionKey || !status) {
    throw new Error('The runtime returned an invalid bounded confirmation preview.')
  }
  return {
    runId,
    confirmationId,
    actionKey,
    status,
    expiresAt: boundedOptionalString(record.expiresAt, 80),
    candidateId: boundedOptionalString(record.candidateId, 160),
    formulaProjectId: boundedOptionalString(record.formulaProjectId, 160),
    actionHash: contentHash(record.actionHash),
    initiatorUserId: boundedOptionalString(record.initiatorUserId, 160),
    evidenceHashes: asArray(record.evidenceHashes).flatMap((entry) => {
      const item = asRecord(entry)
      const kind = boundedOptionalString(item.kind, 80)
      const hash = contentHash(item.hash)
      return kind && hash ? [{ kind, hash }] : []
    }).slice(0, 20),
  }
}

function normalizeLineageEvidence(value: unknown): AgentLineageEvidence {
  const record = asRecord(value)
  return {
    id: nonEmptyString(record.id, 'unknown-lineage'),
    sourceKind: boundedOptionalString(record.sourceKind, 80),
    sourceRef: boundedOptionalString(record.sourceRef, 240),
    targetKind: boundedOptionalString(record.targetKind, 80),
    targetRef: boundedOptionalString(record.targetRef, 240),
    relationType: boundedOptionalString(record.relationType, 80),
    sourceContentHash: boundedOptionalString(record.sourceContentHash, 160),
    targetContentHash: boundedOptionalString(record.targetContentHash, 160),
    createdAt: boundedOptionalString(record.createdAt, 80),
  }
}

function normalizeProviderUsageEvidence(value: unknown): AgentProviderUsageEvidence {
  const record = asRecord(value)
  return {
    id: nonEmptyString(record.id, 'unknown-provider-usage'),
    providerKey: boundedOptionalString(record.providerKey, 120),
    modelIdentifier: boundedOptionalString(record.modelIdentifier, 160),
    usageStatus: boundedOptionalString(record.usageStatus, 80),
    requestHash: boundedOptionalString(record.requestHash, 160),
    responseHash: boundedOptionalString(record.responseHash, 160),
    inputTokens: nonNegativeInteger(record.inputTokens),
    outputTokens: nonNegativeInteger(record.outputTokens),
    totalCostMicros: boundedOptionalString(record.totalCostMicros, 64),
    createdAt: boundedOptionalString(record.createdAt, 80),
  }
}

function normalizeRunEvidence(value: unknown): AgentRunEvidence {
  const record = asRecord(value)
  return {
    runId: boundedOptionalString(record.runId, 160),
    lineage: normalizeList(record.lineage, normalizeLineageEvidence),
    providerUsage: normalizeList(record.providerUsage, normalizeProviderUsageEvidence),
  }
}

function normalizeError(value: unknown): AgentRunError {
  const record = asRecord(value)
  return {
    ...record,
    id: optionalString(record.id),
    code: optionalString(record.code),
    message: optionalString(record.message),
    retryable: typeof record.retryable === 'boolean' ? record.retryable : undefined,
    createdAt: optionalString(record.createdAt),
  }
}

function normalizeRunDetail(value: unknown): AgentRunDetail {
  const record = asRecord(value)
  return {
    run: normalizeRun(record.run),
    events: normalizeList(record.events, normalizeEvent),
    artifacts: normalizeList(record.artifacts, normalizeArtifact),
    confirmations: normalizeList(record.confirmations, normalizeConfirmation),
    toolCalls: normalizeList(record.toolCalls, normalizeToolCall),
    errors: normalizeList(record.errors, normalizeError),
    evidence: normalizeRunEvidence(record.evidence),
  }
}

export async function listAgentDefinitions(apiBase: string) {
  const payload = await agentRuntimeRequest<{ definitions?: unknown }>(apiBase, 'definitions')
  return normalizeList(payload.definitions, normalizeDefinition)
}

export async function loadAgentDefinition(apiBase: string, definitionKey: string) {
  const payload = await agentRuntimeRequest<{ definition?: unknown }>(apiBase, `definitions/${encodeURIComponent(definitionKey)}`)
  return { ...asRecord(payload.definition), ...normalizeDefinition(payload.definition) } as AgentDefinitionDetail
}

export async function listAgentDefinitionVersions(apiBase: string, definitionKey: string) {
  const payload = await agentRuntimeRequest<{ versions?: unknown }>(apiBase, `definitions/${encodeURIComponent(definitionKey)}/versions`)
  return asArray(payload.versions).map(asRecord)
}

export async function loadAgentDefinitionPolicy(apiBase: string, definitionKey: string) {
  const payload = await agentRuntimeRequest<{ policy?: unknown }>(apiBase, `definitions/${encodeURIComponent(definitionKey)}/policy`)
  return asRecord(payload.policy)
}

export async function saveAgentDefinitionPolicy(apiBase: string, definitionKey: string, policy: unknown, key?: string) {
  return agentRuntimeRequest<{ policy?: unknown }>(apiBase, `definitions/${encodeURIComponent(definitionKey)}/policy`, {
    method: 'PUT',
    body: JSON.stringify(policy),
    headers: key ? { 'Idempotency-Key': key } : undefined,
  })
}

export async function createAgentDefinition(apiBase: string, input: unknown, key?: string) {
  return agentRuntimeRequest<{ definition?: unknown }>(apiBase, 'definitions', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: key ? { 'Idempotency-Key': key } : undefined,
  })
}

export async function createAgentDefinitionVersion(apiBase: string, definitionKey: string, input: unknown, key?: string) {
  return agentRuntimeRequest<{ version?: unknown }>(apiBase, `definitions/${encodeURIComponent(definitionKey)}/versions`, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: key ? { 'Idempotency-Key': key } : undefined,
  })
}

export async function listAgentRuns(apiBase: string, query: { after?: string; limit?: number; definitionKey?: string; status?: string } = {}) {
  const search = new URLSearchParams()
  if (query.after) search.set('after', query.after)
  if (query.limit) search.set('limit', String(query.limit))
  if (query.definitionKey) search.set('definitionKey', query.definitionKey)
  if (query.status) search.set('status', query.status)
  const payload = await agentRuntimeRequest<{ runs?: unknown }>(agentRunsApiBase(apiBase), search.size ? `?${search}` : '')
  return normalizeList(payload.runs, normalizeRun)
}

export async function startAgentRun(apiBase: string, input: unknown, key?: string) {
  const payload = await agentRuntimeRequest<{ run?: unknown }>(agentRunsApiBase(apiBase), '', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: key ? { 'Idempotency-Key': key } : undefined,
  })
  return normalizeRun(payload.run)
}

export async function executeAgentRun(apiBase: string, runId: string, key?: string) {
  const payload = await agentRuntimeRequest<{ run?: unknown }>(agentRunsApiBase(apiBase), `${encodeURIComponent(runId)}/execute`, {
    method: 'POST',
    headers: key ? { 'Idempotency-Key': key } : undefined,
  })
  return normalizeRun(payload.run)
}

export async function loadAgentRun(apiBase: string, runId: string, afterSequence = 0) {
  const payload = await agentRuntimeRequest<unknown>(agentRunsApiBase(apiBase), `${encodeURIComponent(runId)}?afterSequence=${afterSequence}`)
  return normalizeRunDetail(payload)
}

export async function replayAgentRun(apiBase: string, runId: string, afterSequence = 0, limit = 200): Promise<AgentRunReplay> {
  const payload = await agentRuntimeRequest<{ run?: unknown; events?: unknown; cursor?: unknown; resyncRequired?: unknown }>(
    agentRunsApiBase(apiBase),
    `${encodeURIComponent(runId)}/events?afterSequence=${afterSequence}&limit=${limit}`,
  )
  return {
    run: normalizeRun(payload.run),
    events: normalizeList(payload.events, normalizeEvent),
    cursor: typeof payload.cursor === 'string' ? payload.cursor : null,
    resyncRequired: payload.resyncRequired === true,
  }
}

export async function loadAgentEvidence(apiBase: string, runId: string) {
  const payload = await agentRuntimeRequest<{ evidence?: unknown }>(agentRunsApiBase(apiBase), `${encodeURIComponent(runId)}/evidence`)
  return normalizeRunEvidence(payload.evidence)
}

export async function loadAgentConfirmationPreview(apiBase: string, runId: string, confirmationId: string) {
  const payload = await agentRuntimeRequest<{ preview?: unknown }>(
    agentRunsApiBase(apiBase),
    `${encodeURIComponent(runId)}/confirmations/${encodeURIComponent(confirmationId)}/preview`,
  )
  return normalizeConfirmationPreview(payload.preview)
}

export async function confirmAgentRun(apiBase: string, runId: string, confirmationId: string, decision: 'APPROVE' | 'REJECT', key?: string) {
  return agentRuntimeRequest<{ confirmation?: unknown }>(agentRunsApiBase(apiBase), `${encodeURIComponent(runId)}/confirmations/${encodeURIComponent(confirmationId)}`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
    headers: key ? { 'Idempotency-Key': key } : undefined,
  })
}

export async function retryAgentRun(apiBase: string, runId: string, key?: string) {
  return agentRuntimeRequest<{ run?: unknown }>(agentRunsApiBase(apiBase), `${encodeURIComponent(runId)}/retry`, {
    method: 'POST',
    headers: key ? { 'Idempotency-Key': key } : undefined,
  })
}

export async function cancelAgentRun(apiBase: string, runId: string, key?: string) {
  return agentRuntimeRequest<{ run?: unknown }>(agentRunsApiBase(apiBase), encodeURIComponent(runId), {
    method: 'DELETE',
    headers: key ? { 'Idempotency-Key': key } : undefined,
  })
}

export async function listAgentEvaluations(apiBase: string, query: { after?: string; limit?: number } = {}) {
  const search = new URLSearchParams()
  if (query.after) search.set('after', query.after)
  if (query.limit) search.set('limit', String(query.limit))
  const payload = await agentRuntimeRequest<{ evaluations?: unknown }>(apiBase, `evaluations${search.size ? `?${search}` : ''}`)
  return normalizeList(payload.evaluations, (value): AgentEvaluation => {
    const record = asRecord(value)
    return {
      ...record,
      id: nonEmptyString(record.id, 'unknown-evaluation'),
      status: optionalString(record.status),
      definitionKey: optionalString(record.definitionKey),
      createdAt: optionalString(record.createdAt),
      updatedAt: optionalString(record.updatedAt),
    }
  })
}

export async function createAgentEvaluation(apiBase: string, input: unknown, key?: string) {
  return agentRuntimeRequest<{ evaluation?: unknown }>(apiBase, 'evaluations', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: key ? { 'Idempotency-Key': key } : undefined,
  })
}

export async function loadAgentObservability(apiBase: string) {
  const payload = await agentRuntimeRequest<{ observability?: unknown }>(apiBase, 'observability')
  return asRecord(payload.observability) as AgentObservability
}

export type AgentRunEventStream = { close: () => void }

export function createAgentRunEventStream(options: {
  apiBase: string
  runId: string
  afterSequence: number
  onEvent: (event: AgentRuntimeEvent) => void
  onControl: (event: 'connection.snapshot' | 'connection.resync_required', data: unknown) => void
  onHeartbeat?: () => void
  onError?: (error: Error) => void
}): AgentRunEventStream {
  if (typeof EventSource === 'undefined') {
    options.onError?.(new Error('Live event replay is unavailable in this browser.'))
    return { close() {} }
  }
  const url = new URL(joinUrl(agentRunsApiBase(options.apiBase), `${encodeURIComponent(options.runId)}/stream`), window.location.origin)
  url.searchParams.set('afterSequence', String(Math.max(0, options.afterSequence)))
  const stream = new EventSource(url.toString(), { withCredentials: true })
  const parse = (event: MessageEvent, eventName: 'agent.event' | 'connection.snapshot' | 'connection.resync_required' | 'heartbeat') => {
    try {
      const value: unknown = JSON.parse(event.data)
      if (eventName === 'agent.event') {
        const parsed = agentRuntimeEventSchema.safeParse(value)
        if (!parsed.success) throw new Error('Received an invalid persisted event.')
        options.onEvent(parsed.data)
      } else if (eventName === 'heartbeat') {
        options.onHeartbeat?.()
      } else {
        const parsed = agentStreamControlSchema.safeParse(value)
        if (!parsed.success) throw new Error('Received an invalid stream control event.')
        options.onControl(eventName, parsed.data)
      }
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error('Unable to parse an agent runtime event.'))
    }
  }
  stream.addEventListener('agent.event', (event) => parse(event as MessageEvent, 'agent.event'))
  stream.addEventListener('connection.snapshot', (event) => parse(event as MessageEvent, 'connection.snapshot'))
  stream.addEventListener('connection.resync_required', (event) => parse(event as MessageEvent, 'connection.resync_required'))
  stream.addEventListener('heartbeat', (event) => parse(event as MessageEvent, 'heartbeat'))
  stream.onerror = () => {
    if (stream.readyState === EventSource.CLOSED) options.onError?.(new Error('Live event replay closed. Refreshing persisted state is required.'))
  }
  return { close: () => stream.close() }
}
