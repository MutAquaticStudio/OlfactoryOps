import { describe, expect, it } from 'vitest'
import { summarizeAgentObservability } from './observability.js'

describe('agent observability summary', () => {
  it('reports only bounded operational metadata without raw tool or provider content', () => {
    const summary = summarizeAgentObservability({
      runId: 'run_1', status: 'SUCCEEDED', startedAt: '2026-08-10T00:00:00.000Z', completedAt: '2026-08-10T00:00:01.250Z', retryCount: 1,
      toolCalls: [{ status: 'SUCCEEDED', latencyMs: 20 }, { status: 'DENIED', latencyMs: 5 }],
      providerUsages: [{ status: 'COMPLETED', inputTokens: 20, outputTokens: 5, costMicros: 42, latencyMs: 100 }],
      confirmations: [{ status: 'ACCEPTED' }, { status: 'PENDING' }],
    })
    expect(summary).toEqual({
      runId: 'run_1', status: 'SUCCEEDED', durationMs: 1250, toolCallCount: 2, toolFailureCount: 1, providerCallCount: 1, providerFailureCount: 0,
      inputTokens: 20, outputTokens: 5, costMicros: 42, confirmationWaitCount: 1, retryCount: 1, maxObservedLatencyMs: 100,
    })
    expect(JSON.stringify(summary)).not.toContain('prompt')
  })
})
