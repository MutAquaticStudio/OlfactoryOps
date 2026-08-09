import { describe, expect, it } from 'vitest'
import { createAgentRuntimeState, reduceAgentRuntimeEvent } from './agentRuntime.js'

const event = (id: string, sequence: number, status?: string) => ({ id, sequence, type: 'node.completed', runId: 'run_1', organizationId: 'org_1', occurredAt: '2026-08-08T00:00:00.000Z', payload: status ? { status } : {} })

describe('agent runtime reducer', () => {
  it('buffers out-of-order events until a contiguous replay is available', () => {
    const afterSecond = reduceAgentRuntimeEvent(createAgentRuntimeState(), event('event_2', 2))
    expect(afterSecond.events).toHaveLength(0)
    expect(afterSecond.pendingEvents.size).toBe(1)
    const complete = reduceAgentRuntimeEvent(afterSecond, event('event_1', 1, 'RUNNING'))
    expect(complete.events.map((item) => item.sequence)).toEqual([1, 2])
    expect(complete.lastSequence).toBe(2)
    expect(complete.status).toBe('RUNNING')
  })

  it('deduplicates persisted event ids without changing state', () => {
    const once = reduceAgentRuntimeEvent(createAgentRuntimeState(), event('event_1', 1))
    expect(reduceAgentRuntimeEvent(once, event('event_1', 1))).toBe(once)
  })

  it('preserves the persisted confirmation state until the completion event arrives', () => {
    const waiting = reduceAgentRuntimeEvent(createAgentRuntimeState(), event('event_1', 1, 'WAITING_FOR_CONFIRMATION'))
    const completed = reduceAgentRuntimeEvent(waiting, event('event_2', 2, 'SUCCEEDED'))
    expect(waiting.status).toBe('WAITING_FOR_CONFIRMATION')
    expect(completed.status).toBe('SUCCEEDED')
  })
})
