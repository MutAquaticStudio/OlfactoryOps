import { z } from 'zod'

/**
 * Generic runtime primitives retained at the pre-V2 boundary. Product-specific
 * workflows and provider adapters live only in the historical archive until a
 * V2 contract is approved.
 */
export const AGENT_PROTOCOL_VERSION = '1.0' as const
export const AGENT_MAX_EVENT_BYTES = 64 * 1024
export const AGENT_MAX_RETRIES = 2

export const agentRunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION', 'SUCCEEDED', 'FAILED', 'CANCELLED'])
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>

export const agentEventTypeSchema = z.enum([
  'run.created', 'run.started', 'run.paused', 'run.resumed', 'run.cancelled',
  'run.completed', 'run.failed', 'node.started', 'node.completed',
  'node.failed', 'node.retrying', 'artifact.created', 'artifact.updated',
  'job.queued', 'job.leased', 'job.retrying', 'job.completed', 'job.cancelled',
  'confirmation.requested', 'confirmation.decided', 'confirmation.expired',
  'connection.snapshot', 'connection.resync_required', 'heartbeat',
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
  sequence: z.number().int().nonnegative(),
  type: agentEventTypeSchema,
  runId: z.string().min(1).max(160),
  organizationId: z.string().min(1).max(160),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict()
export type AgentRuntimeEvent = z.infer<typeof agentRuntimeEventSchema>

export type AgentRuntimeState = {
  status: AgentRunStatus
  lastSequence: number
  eventIds: Set<string>
  events: AgentRuntimeEvent[]
  pendingEvents: Map<number, AgentRuntimeEvent>
}

export function createAgentRuntimeState(): AgentRuntimeState {
  return { status: 'QUEUED', lastSequence: 0, eventIds: new Set(), events: [], pendingEvents: new Map() }
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
  return { ...state, status, lastSequence, eventIds, events, pendingEvents }
}
