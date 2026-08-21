import { describe, expect, it, vi } from 'vitest'
import { handleCloudQueueMessage, type CloudQueueConsumerEnv } from './queue-consumer.js'

const probe = {
  protocolVersion: 'cloud-runtime/v1' as const,
  jobId: 'job_dlq_probe_1',
  organizationId: 'org_dlq_probe_1',
  correlationId: 'corr_dlq_probe_1',
  idempotencyKey: 'staging-dlq-probe-idempotency-key-0001',
  jobType: 'STAGING_DLQ_TERMINAL_FAILURE_PROBE' as const,
  artifactRef: 'staging-fixtures/dlq/job_dlq_probe_1',
  inputHash: 'a'.repeat(64),
  createdAt: '2026-08-11T00:00:00.000Z',
}

function message() {
  return { body: probe, ack: vi.fn(), retry: vi.fn() }
}

describe('staging terminal DLQ probe consumer', () => {
  it('records failure and lets Cloudflare Queue perform every staging retry', async () => {
    const queued = message()
    const ledger = { recordStagingDlqProbeFailure: vi.fn().mockResolvedValue({ attempts: 1, recorded: true }) }
    await handleCloudQueueMessage({ RELEASE_ENVIRONMENT: 'staging' } as CloudQueueConsumerEnv, queued as never, () => ledger as never)
    expect(ledger.recordStagingDlqProbeFailure).toHaveBeenCalledWith(probe)
    expect(queued.retry).toHaveBeenCalledWith({ delaySeconds: 5 })
    expect(queued.ack).not.toHaveBeenCalled()
  })

  it('acknowledges the probe outside staging before touching the ledger', async () => {
    const queued = message()
    const ledger = { recordStagingDlqProbeFailure: vi.fn() }
    await handleCloudQueueMessage({ RELEASE_ENVIRONMENT: 'production' } as CloudQueueConsumerEnv, queued as never, () => ledger as never)
    expect(ledger.recordStagingDlqProbeFailure).not.toHaveBeenCalled()
    expect(queued.ack).toHaveBeenCalledTimes(1)
    expect(queued.retry).not.toHaveBeenCalled()
  })
})
