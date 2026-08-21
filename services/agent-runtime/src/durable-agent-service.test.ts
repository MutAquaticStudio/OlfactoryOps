import { describe, expect, it, vi } from 'vitest'
import { PlatformError } from '../../platform/src/service.js'
import { assertSafeAgentRuntimePayload } from './durable-agent-service.js'

describe('durable agent persisted payload safety', () => {
  it('accepts bounded structured references and explicit states', () => {
    expect(assertSafeAgentRuntimePayload({ state: 'NOT_CONFIGURED', references: ['artifact_1'], metrics: { count: 0 } })).toContain('NOT_CONFIGURED')
  })

  it.each(['prompt', 'messages', 'reasoning', 'raw_response', 'raw_provider_error', 'api_key', 'authorization', 'token'])(
    'rejects the forbidden persisted field %s at any depth',
    (field) => {
      expect(() => assertSafeAgentRuntimePayload({ metadata: { [field]: 'must-not-persist' } })).toThrowError(PlatformError)
    },
  )

  it('enforces the 64 KiB persistence boundary', () => {
    expect(() => assertSafeAgentRuntimePayload({ summary: 'x'.repeat(65_537) })).toThrowError('exceeds 64 KiB')
  })
})

const sqlText = (query: { strings?: readonly string[]; sql?: string } | readonly string[]) => Array.isArray(query) ? query.join(' ') : query.strings?.join(' ') ?? query.sql ?? ''

class RetryRuntimeClient {
  runStatus = 'QUEUED'
  jobStatus = 'QUEUED'
  nodeStatus = 'READY'
  nodeAttempt = 1
  jobAttempts = 0
  sequence = 1
  readonly nodeId = 'agent_node_retry_target'
  failureTarget: string | undefined

  async $transaction<T>(action: (tx: this) => Promise<T>) { return action(this) }

  async $queryRaw(query: { strings?: readonly string[]; sql?: string; values?: unknown[] } | readonly string[], ...rawValues: unknown[]) {
    const sql = sqlText(query)
    const values = Array.isArray(query) ? rawValues : query.values ?? rawValues
    if (sql.includes('SELECT protocol_version AS')) return [{ protocolVersion: 'agent-runtime/v1' }]
    if (sql.includes('SELECT request_hash AS')) return []
    if (sql.includes('INSERT INTO v2_operation_idempotency')) return [{ id: 'idem_retry' }]
    if (sql.includes('SELECT id, status, workflow_key AS')) return [{ id: 'agent_run_retry', status: this.runStatus, workflowKey: 'commerce-assistant/1', correlationId: 'corr_retry', policyVersionId: 'policy_retry', requestHash: 'a'.repeat(64) }]
    if (sql.includes('WITH claim AS')) { if (this.jobStatus !== 'QUEUED') return []; this.jobStatus = 'LEASED'; return [{ id: 'agent_job_retry' }] }
    if (sql.includes("status = 'READY'") && sql.includes('FROM v2_agent_run_nodes')) return this.nodeStatus === 'READY' ? [{ id: this.nodeId, workflowNodeKey: 'review_commerce', nodeKind: 'TOOL', attempt: this.nodeAttempt }] : []
    if (sql.includes('lease_token_hash =') && sql.includes('SELECT id FROM v2_agent_runs')) return [{ id: 'agent_run_retry' }]
    if (sql.includes('UPDATE v2_agent_runs SET next_sequence')) return [{ sequence: this.sequence++, protocolVersion: 'agent-runtime/v1', correlationId: 'corr_retry' }]
    if (sql.includes("artifact_type = 'run_input'")) return [{ payload: {} }]
    if (sql.includes('FROM v2_agent_workflow_tool_bindings')) return [{ toolVersionId: 'tool_version_retry' }]
    if (sql.includes('UPDATE v2_agent_run_nodes n SET status')) {
      this.failureTarget = values.find((value): value is string => value === this.nodeId)
      if (this.failureTarget && ['READY', 'RUNNING'].includes(this.nodeStatus)) { this.nodeStatus = 'FAILED'; return [{ id: this.nodeId }] }
      return []
    }
    if (sql.includes('SELECT id, protocol_version AS')) return this.runStatus === 'FAILED' ? [{ id: 'agent_run_retry', protocolVersion: 'agent-runtime/v1', workflowKey: 'commerce-assistant/1' }] : []
    if (sql.includes('SELECT count(*)::bigint AS count FROM v2_agent_runs')) return [{ count: 0n }]
    if (sql.includes("UPDATE v2_agent_jobs SET status = 'QUEUED', attempts")) {
      if (this.jobAttempts >= 2) return []
      this.jobAttempts += 1; this.jobStatus = 'QUEUED'; return [{ id: 'agent_job_retry' }]
    }
    if (sql.includes('SELECT workflow_node_key AS') && sql.includes('FROM v2_agent_run_nodes')) return [{ workflowNodeKey: 'review_commerce', status: this.nodeStatus }]
    if (sql.includes('SELECT count(*)::bigint AS count FROM v2_agent_run_nodes')) return [{ count: this.nodeStatus === 'SUCCEEDED' ? 0n : 1n }]
    throw new Error(`Unhandled query: ${sql}`)
  }

  async $executeRaw(query: { strings?: readonly string[]; sql?: string; values?: unknown[] } | readonly string[], ...rawValues: unknown[]) {
    const sql = sqlText(query)
    const values = Array.isArray(query) ? rawValues : query.values ?? rawValues
    if (sql.includes("UPDATE v2_agent_runs SET status = 'RUNNING'")) this.runStatus = 'RUNNING'
    else if (sql.includes("UPDATE v2_agent_run_nodes SET status = 'RUNNING'")) this.nodeStatus = 'RUNNING'
    else if (sql.includes("UPDATE v2_agent_jobs SET status = 'FAILED'")) this.jobStatus = 'FAILED'
    else if (sql.includes("UPDATE v2_agent_runs SET status = 'FAILED'")) this.runStatus = 'FAILED'
    else if (sql.includes("UPDATE v2_agent_run_nodes SET status = 'READY'")) { this.nodeStatus = 'READY'; this.nodeAttempt += 1 }
    else if (sql.includes("UPDATE v2_agent_runs SET status = 'QUEUED'")) this.runStatus = 'QUEUED'
    else if (sql.includes("UPDATE v2_agent_run_nodes SET status = 'SUCCEEDED'")) this.nodeStatus = 'SUCCEEDED'
    else if (sql.includes('UPDATE v2_agent_jobs SET status =') && values[0] === 'SUCCEEDED') this.jobStatus = 'SUCCEEDED'
    else if (sql.includes('UPDATE v2_agent_runs SET status =') && values[0] === 'SUCCEEDED') this.runStatus = 'SUCCEEDED'
    return 1
  }
}

describe('durable agent retry recovery', () => {
  it('fails the claimed node, increments only explicit retries, and executes the next attempt', async () => {
    const client = new RetryRuntimeClient()
    const invoke = vi.fn()
      .mockRejectedValueOnce(new PlatformError('COMMERCE_NOT_CONFIGURED', 'Commerce is not configured.', 409))
      .mockResolvedValueOnce({ toolKey: 'commerce.status', version: '1.0.0', output: { state: 'NOT_CONFIGURED' }, outputHash: 'b'.repeat(64), metadata: { outputBytes: 26 } })
    const platform = { requirePermission: vi.fn().mockResolvedValue(undefined) }
    const service = new (await import('./durable-agent-service.js')).DurableAgentService(
      client as never,
      platform as never,
      undefined,
      undefined,
      {} as never,
      { invoke } as never,
    )
    const context = { organizationId: 'org_retry', userId: 'user_retry', sessionId: 'session_retry', role: 'Owner', hostname: 'retry.olfactoryops.com' } as const

    await expect(service.execute(context, 'agent_run_retry', 'retry-execute-key-0001')).rejects.toMatchObject({ code: 'COMMERCE_NOT_CONFIGURED' })
    expect(client.failureTarget).toBe(client.nodeId)
    expect(client.nodeStatus).toBe('FAILED')
    expect(client.jobAttempts).toBe(0)

    await expect(service.retry(context, 'agent_run_retry', 'retry-command-key-0001')).resolves.toMatchObject({ status: 'QUEUED' })
    expect(client.nodeStatus).toBe('READY')
    expect(client.nodeAttempt).toBe(2)
    expect(client.jobAttempts).toBe(1)

    await expect(service.execute(context, 'agent_run_retry', 'retry-execute-key-0002')).resolves.toMatchObject({ status: 'SUCCEEDED' })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(client.nodeStatus).toBe('SUCCEEDED')
  })

  it('allows exactly two explicit retries and advances node attempts to three', async () => {
    const client = new RetryRuntimeClient()
    client.runStatus = 'FAILED'; client.jobStatus = 'FAILED'; client.nodeStatus = 'FAILED'
    const platform = { requirePermission: vi.fn().mockResolvedValue(undefined) }
    const service = new (await import('./durable-agent-service.js')).DurableAgentService(client as never, platform as never, undefined, undefined, {} as never, { invoke: vi.fn() } as never)
    const context = { organizationId: 'org_retry', userId: 'user_retry', sessionId: 'session_retry', role: 'Owner', hostname: 'retry.olfactoryops.com' } as const

    await service.retry(context, 'agent_run_retry', 'retry-budget-key-0001')
    expect(client.jobAttempts).toBe(1)
    expect(client.nodeAttempt).toBe(2)

    client.runStatus = 'FAILED'; client.jobStatus = 'FAILED'; client.nodeStatus = 'FAILED'
    await service.retry(context, 'agent_run_retry', 'retry-budget-key-0002')
    expect(client.jobAttempts).toBe(2)
    expect(client.nodeAttempt).toBe(3)

    client.runStatus = 'FAILED'; client.jobStatus = 'FAILED'; client.nodeStatus = 'FAILED'
    await expect(service.retry(context, 'agent_run_retry', 'retry-budget-key-0003')).rejects.toMatchObject({ code: 'AGENT_RETRY_LIMIT' })
    expect(client.jobAttempts).toBe(2)
    expect(client.nodeAttempt).toBe(3)
  })
})
