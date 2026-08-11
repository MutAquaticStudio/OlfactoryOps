import { describe, expect, it, vi } from 'vitest'
import { CloudJobLedger } from './job-ledger.js'

const job = {
  protocolVersion: 'cloud-runtime/v1' as const,
  jobId: 'job_1',
  organizationId: 'org_1',
  actorUserId: 'user_1',
  correlationId: 'corr_1',
  idempotencyKey: 'cloud-runtime-idempotency-key-0001',
  jobType: 'SCIENTIFIC_FEATURE' as const,
  artifactRef: 'v2/org_1/scientific/a'.repeat(1),
  inputHash: 'a'.repeat(64),
  createdAt: '2026-08-11T00:00:00.000Z',
}

function createLedger(query: (sql: string) => unknown) {
  const execute = vi.fn(async (_sql: string, ..._params: unknown[]) => 1)
  const transaction = { $executeRawUnsafe: execute, $queryRawUnsafe: vi.fn(async (sql: string, ..._params: unknown[]) => query(sql)) }
  const prisma = { $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction) }
  return { ledger: new CloudJobLedger(prisma as never), execute, query: transaction.$queryRawUnsafe }
}

describe('CloudJobLedger', () => {
  it('persists one QUEUED event and reuses the original dispatch for an idempotent retry', async () => {
    let insertAttempts = 0
    const row = { id: job.jobId, status: 'QUEUED', attempts: 0, workflow_instance_id: null, input_hash: job.inputHash, artifact_ref: job.artifactRef }
    const { ledger, execute } = createLedger((sql) => {
      if (sql.includes('INSERT INTO v2_cloud_job_dispatches')) return insertAttempts++ === 0 ? [row] : []
      if (sql.includes('SELECT id, status, attempts')) return [row]
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(ledger.submit(job)).resolves.toEqual({ jobId: job.jobId, enqueue: true })
    await expect(ledger.submit(job)).resolves.toEqual({ jobId: job.jobId, enqueue: true })
    expect(execute.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO v2_cloud_job_events'))).toHaveLength(1)
  })

  it('rejects an idempotency-key collision with a different dispatch identity or input', async () => {
    const persisted = { id: 'job_original', status: 'QUEUED', attempts: 0, workflow_instance_id: null, input_hash: job.inputHash, artifact_ref: job.artifactRef }
    const { ledger } = createLedger((sql) => {
      if (sql.includes('INSERT INTO v2_cloud_job_dispatches')) return []
      if (sql.includes('SELECT id, status, attempts')) return [persisted]
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(ledger.submit(job)).rejects.toThrow('CLOUD_JOB_IDEMPOTENCY_CONFLICT')
  })

  it('uses one deterministic Workflow id across duplicate queue deliveries', async () => {
    let reservationAttempts = 0
    const processing = { id: job.jobId, status: 'PROCESSING', attempts: 1, workflow_instance_id: `scientific-${job.jobId}`, input_hash: job.inputHash, artifact_ref: job.artifactRef }
    const { ledger, execute } = createLedger((sql) => {
      if (sql.includes("SET status = 'PROCESSING', workflow_instance_id")) return reservationAttempts++ === 0 ? [processing] : []
      if (sql.includes('SELECT id, status, attempts')) return [processing]
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(ledger.reserveWorkflow(job)).resolves.toEqual({ workflowInstanceId: `scientific-${job.jobId}`, shouldCreate: true })
    await expect(ledger.reserveWorkflow(job)).resolves.toEqual({ workflowInstanceId: `scientific-${job.jobId}`, shouldCreate: true })
    expect(execute.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO v2_cloud_job_events'))).toHaveLength(1)
  })

  it('records a terminal Workflow failure instead of leaving a job in processing', async () => {
    const failed = { id: job.jobId, status: 'FAILED', attempts: 1, workflow_instance_id: `scientific-${job.jobId}`, input_hash: job.inputHash, artifact_ref: job.artifactRef }
    const { ledger, execute } = createLedger((sql) => {
      if (sql.includes("SET status = 'FAILED'")) return [failed]
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(ledger.workflowFailed(job, new Error('SCIENTIFIC_CONTAINER_UNAVAILABLE'))).resolves.toBeUndefined()
    expect(execute.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO v2_cloud_job_events'))).toHaveLength(1)
  })
})
