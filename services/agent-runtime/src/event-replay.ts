import { AGENT_RUNTIME_LIMITS, agentEventEnvelopeSchema, type AgentEventEnvelope } from '../contracts.js'
import { PlatformError } from '../../platform/src/service.js'

export type AgentReplayResult = Readonly<{
  events: readonly AgentEventEnvelope[]
  afterSequence: number
  nextSequence: number
  latestSequence: number
  hasMore: boolean
  resyncRequired: boolean
}>

export function normalizeAfterSequence(value: unknown) {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value
  if (!Number.isInteger(parsed) || Number(parsed) < 0 || Number(parsed) > Number.MAX_SAFE_INTEGER) {
    throw new PlatformError('AGENT_REPLAY_CURSOR_INVALID', 'The agent replay cursor is invalid.', 422)
  }
  return Number(parsed)
}

/**
 * Dedupe and order persisted events before handing them to an SSE transport or
 * a client reducer. A sequence gap means the caller must obtain a fresh run
 * snapshot instead of inventing missing workflow state.
 */
export function reconcileAgentEventReplay(rawEvents: readonly unknown[], input: Readonly<{ afterSequence: unknown; latestSequence: number; maxEvents?: number }>): AgentReplayResult {
  const afterSequence = normalizeAfterSequence(input.afterSequence)
  if (!Number.isInteger(input.latestSequence) || input.latestSequence < afterSequence) {
    throw new PlatformError('AGENT_REPLAY_CURSOR_INVALID', 'The agent replay sequence is invalid.', 422)
  }
  const maxEvents = input.maxEvents ?? AGENT_RUNTIME_LIMITS.maxReplayEvents
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > AGENT_RUNTIME_LIMITS.maxReplayEvents) {
    throw new PlatformError('AGENT_REPLAY_LIMIT_INVALID', 'The agent replay limit is invalid.', 422)
  }
  const bySequence = new Map<number, AgentEventEnvelope>()
  const ids = new Set<string>()
  for (const raw of rawEvents) {
    const parsed = agentEventEnvelopeSchema.safeParse(raw)
    if (!parsed.success) throw new PlatformError('AGENT_EVENT_INVALID', 'A persisted agent event is invalid.', 500)
    const event = parsed.data
    if (event.sequence <= afterSequence) continue
    if (ids.has(event.id)) continue
    const previous = bySequence.get(event.sequence)
    if (previous && previous.id !== event.id) throw new PlatformError('AGENT_EVENT_SEQUENCE_CONFLICT', 'The agent event stream contains a sequence conflict.', 500)
    if (Buffer.byteLength(JSON.stringify(event.payload), 'utf8') > AGENT_RUNTIME_LIMITS.maxEventPayloadBytes) {
      throw new PlatformError('AGENT_EVENT_TOO_LARGE', 'A persisted agent event exceeds the replay payload limit.', 500)
    }
    ids.add(event.id)
    bySequence.set(event.sequence, event)
  }
  const sorted = [...bySequence.values()].sort((left, right) => left.sequence - right.sequence).slice(0, maxEvents)
  let expected = afterSequence + 1
  let resyncRequired = false
  for (const event of sorted) {
    if (event.sequence !== expected) {
      resyncRequired = true
      break
    }
    expected += 1
  }
  if (!sorted.length && input.latestSequence > afterSequence) resyncRequired = true
  const nextSequence = resyncRequired ? afterSequence : sorted.at(-1)?.sequence ?? afterSequence
  return Object.freeze({
    events: Object.freeze(sorted),
    afterSequence,
    nextSequence,
    latestSequence: input.latestSequence,
    hasMore: !resyncRequired && nextSequence < input.latestSequence,
    resyncRequired,
  })
}

export function serializeAgentSseEvent(event: AgentEventEnvelope) {
  const parsed = agentEventEnvelopeSchema.parse(event)
  return `id: ${parsed.sequence}\nevent: ${parsed.type}\ndata: ${JSON.stringify(parsed)}\n\n`
}
