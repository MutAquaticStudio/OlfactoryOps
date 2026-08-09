import { describe, expect, it } from 'vitest'
import { reconcileAgentEventReplay, serializeAgentSseEvent } from './event-replay.js'

const event = (sequence: number, id = `event_${sequence}`) => ({
  id, runId: 'run_1', sequence, type: 'step.completed' as const, payload: { step: sequence }, createdAt: '2026-08-10T00:00:00.000Z',
})

describe('agent event replay', () => {
  it('orders and deduplicates a persisted replay page', () => {
    const result = reconcileAgentEventReplay([event(2), event(1), event(2)], { afterSequence: 0, latestSequence: 2 })
    expect(result.events.map((item) => item.sequence)).toEqual([1, 2])
    expect(result).toMatchObject({ nextSequence: 2, hasMore: false, resyncRequired: false })
    expect(serializeAgentSseEvent(result.events[0]!)).toContain('id: 1')
  })

  it('requires a snapshot when a replay page has a sequence gap', () => {
    const result = reconcileAgentEventReplay([event(2)], { afterSequence: 0, latestSequence: 2 })
    expect(result).toMatchObject({ resyncRequired: true, nextSequence: 0 })
  })

  it('fails closed for conflicting event identities at one sequence', () => {
    expect(() => reconcileAgentEventReplay([event(1, 'a'), event(1, 'b')], { afterSequence: 0, latestSequence: 1 })).toThrow('sequence conflict')
  })
})
