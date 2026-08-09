import { z } from 'zod'

export const AGENT_PROTOCOL_VERSION = '2.0' as const
export const AGENT_SUPPORTED_PROTOCOL_VERSIONS = ['1.0', AGENT_PROTOCOL_VERSION] as const
export const AGENT_MAX_EVENT_BYTES = 64 * 1024
export const AGENT_MAX_RETRIES = 2

export const agentProtocolVersionSchema = z.enum(AGENT_SUPPORTED_PROTOCOL_VERSIONS)
export type AgentProtocolVersion = z.infer<typeof agentProtocolVersionSchema>

export const agentRunStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'WAITING_FOR_CONFIRMATION',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'DEGRADED',
])
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>

export const agentEventTypeSchema = z.enum([
  'run.created',
  'run.started',
  'run.paused',
  'run.resumed',
  'run.cancelled',
  'run.completed',
  'run.failed',
  'node.started',
  'node.completed',
  'node.failed',
  'node.retrying',
  'step.started',
  'step.completed',
  'step.failed',
  'assistant.message.delta',
  'assistant.message.completed',
  'tool.requested',
  'tool.completed',
  'tool.denied',
  'artifact.created',
  'artifact.updated',
  'evidence.linked',
  'provider.degraded',
  'provider.usage.recorded',
  'job.queued',
  'job.leased',
  'job.retrying',
  'job.completed',
  'job.cancelled',
  'confirmation.requested',
  'confirmation.decided',
  'confirmation.expired',
  'evaluation.queued',
  'evaluation.completed',
  'evaluation.failed',
  'connection.snapshot',
  'connection.resync_required',
  'heartbeat',
])
export type AgentEventType = z.infer<typeof agentEventTypeSchema>

export const agentRuntimeErrorSchema = z.object({
  code: z.string().min(1).max(96),
  message: z.string().min(1).max(500),
  retryable: z.boolean().default(false),
  correlationId: z.string().min(1).max(160).optional(),
}).strict()
export type AgentRuntimeError = z.infer<typeof agentRuntimeErrorSchema>

export function toSafeAgentRuntimeError(error: unknown, fallback = 'Workflow execution failed'): AgentRuntimeError {
  const code = error instanceof Error && error.message.startsWith('AGENT_')
    ? error.message.split(':', 1)[0]!.slice(0, 96)
    : 'AGENT_EXECUTION_FAILED'
  return { code, message: fallback, retryable: false }
}

export const agentRuntimeEventSchema = z.object({
  id: z.string().min(1).max(160),
  sequence: z.number().int().positive(),
  type: agentEventTypeSchema,
  runId: z.string().min(1).max(160),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).default({}),
  protocolVersion: agentProtocolVersionSchema.default('1.0'),
}).strict()
export type AgentRuntimeEvent = z.infer<typeof agentRuntimeEventSchema>

export const agentReplaySchema = z.object({
  events: z.array(agentRuntimeEventSchema),
  cursor: z.string().min(1).max(160).nullable().optional(),
  resyncRequired: z.boolean().default(false),
}).strict()
export type AgentReplay = z.infer<typeof agentReplaySchema>

export const agentStreamControlSchema = z.object({
  protocolVersion: agentProtocolVersionSchema.default(AGENT_PROTOCOL_VERSION),
  source: z.enum(['persisted_events', 'transport']).default('transport'),
  afterSequence: z.number().int().nonnegative().default(0),
  reason: z.string().min(1).max(120).optional(),
}).passthrough()
export type AgentStreamControl = z.infer<typeof agentStreamControlSchema>

export type AgentRuntimeState = {
  status: AgentRunStatus
  lastSequence: number
  eventIds: Set<string>
  events: AgentRuntimeEvent[]
  pendingEvents: Map<number, AgentRuntimeEvent>
  cursor: string | null
  resyncRequired: boolean
  resyncAfterSequence: number | null
}

export function createAgentRuntimeState(): AgentRuntimeState {
  return {
    status: 'QUEUED',
    lastSequence: 0,
    eventIds: new Set(),
    events: [],
    pendingEvents: new Map(),
    cursor: null,
    resyncRequired: false,
    resyncAfterSequence: null,
  }
}

export function reduceAgentRuntimeEvent(state: AgentRuntimeState, candidate: unknown): AgentRuntimeState {
  const parsed = agentRuntimeEventSchema.safeParse(candidate)
  if (!parsed.success || state.eventIds.has(parsed.data.id)) return state
  const eventIds = new Set(state.eventIds)
  const pendingEvents = new Map(state.pendingEvents)
  eventIds.add(parsed.data.id)
  if (parsed.data.sequence <= state.lastSequence) return { ...state, eventIds }
  pendingEvents.set(parsed.data.sequence, parsed.data)
  let lastSequence = state.lastSequence
  let status = state.status
  const events = [...state.events]
  while (pendingEvents.has(lastSequence + 1)) {
    const event = pendingEvents.get(lastSequence + 1)!
    pendingEvents.delete(lastSequence + 1)
    const parsedStatus = agentRunStatusSchema.safeParse(event.payload.status)
    if (parsedStatus.success) status = parsedStatus.data
    events.push(event)
    lastSequence += 1
  }
  return {
    ...state,
    status,
    lastSequence,
    eventIds,
    events,
    pendingEvents,
    resyncRequired: false,
    resyncAfterSequence: null,
  }
}

export function reduceAgentReplay(state: AgentRuntimeState, candidate: unknown): AgentRuntimeState {
  const replay = agentReplaySchema.safeParse(candidate)
  if (!replay.success) return state
  const next = replay.data.events.reduce(reduceAgentRuntimeEvent, state)
  return {
    ...next,
    cursor: replay.data.cursor ?? next.cursor,
    resyncRequired: replay.data.resyncRequired,
    resyncAfterSequence: replay.data.resyncRequired ? next.lastSequence : null,
  }
}

export function reduceAgentStreamControl(state: AgentRuntimeState, eventType: 'connection.snapshot' | 'connection.resync_required', candidate: unknown): AgentRuntimeState {
  const control = agentStreamControlSchema.safeParse(candidate)
  if (!control.success) return state
  if (eventType === 'connection.snapshot') {
    return {
      ...state,
      cursor: String(control.data.afterSequence),
      resyncRequired: false,
      resyncAfterSequence: null,
    }
  }
  return {
    ...state,
    resyncRequired: true,
    resyncAfterSequence: control.data.afterSequence,
  }
}
