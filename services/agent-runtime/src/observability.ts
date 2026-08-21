export type AgentObservabilityInput = Readonly<{
  runId: string
  status: string
  startedAt?: string | null
  completedAt?: string | null
  toolCalls: readonly Readonly<{ status: string; latencyMs?: number | null }>[]
  providerUsages: readonly Readonly<{ status: string; inputTokens?: number | null; outputTokens?: number | null; costMicros?: number | null; latencyMs?: number | null }>[
  ]
  confirmations: readonly Readonly<{ status: string }>[
  ]
  retryCount: number
}>

export type AgentObservabilitySnapshot = Readonly<{
  runId: string
  status: string
  durationMs: number | null
  toolCallCount: number
  toolFailureCount: number
  providerCallCount: number
  providerFailureCount: number
  inputTokens: number | null
  outputTokens: number | null
  costMicros: number | null
  confirmationWaitCount: number
  retryCount: number
  maxObservedLatencyMs: number | null
}>

const numberOrNull = (values: readonly (number | null | undefined)[]) => {
  const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) : null
}

export function summarizeAgentObservability(input: AgentObservabilityInput): AgentObservabilitySnapshot {
  const startedAt = input.startedAt ? Date.parse(input.startedAt) : Number.NaN
  const completedAt = input.completedAt ? Date.parse(input.completedAt) : Number.NaN
  const durationMs = Number.isFinite(startedAt) && Number.isFinite(completedAt) && completedAt >= startedAt ? completedAt - startedAt : null
  const latencies = [
    ...input.toolCalls.map((call) => call.latencyMs),
    ...input.providerUsages.map((usage) => usage.latencyMs),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return Object.freeze({
    runId: input.runId,
    status: input.status,
    durationMs,
    toolCallCount: input.toolCalls.length,
    toolFailureCount: input.toolCalls.filter((call) => ['FAILED', 'DENIED', 'CANCELLED'].includes(call.status)).length,
    providerCallCount: input.providerUsages.length,
    providerFailureCount: input.providerUsages.filter((usage) => usage.status === 'FAILED').length,
    inputTokens: numberOrNull(input.providerUsages.map((usage) => usage.inputTokens)),
    outputTokens: numberOrNull(input.providerUsages.map((usage) => usage.outputTokens)),
    costMicros: numberOrNull(input.providerUsages.map((usage) => usage.costMicros)),
    confirmationWaitCount: input.confirmations.filter((confirmation) => confirmation.status === 'PENDING').length,
    retryCount: input.retryCount,
    maxObservedLatencyMs: latencies.length ? Math.max(...latencies) : null,
  })
}
