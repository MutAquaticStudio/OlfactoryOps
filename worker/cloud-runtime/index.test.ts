import { describe, expect, it, vi } from 'vitest'
import { handleCloudQueueMessage, type CloudQueueConsumerEnv } from './queue-consumer.js'

const { processPasswordResetDeliveries } = vi.hoisted(() => ({ processPasswordResetDeliveries: vi.fn() }))
vi.mock('./password-reset-delivery.js', () => ({ processPasswordResetDeliveries }))

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

describe('password reset queue consumer', () => {
  it('acks a completed password reset delivery without entering a Workflow path', async () => {
    processPasswordResetDeliveries.mockResolvedValueOnce({ retry: false })
    const queued = {
      body: { ...probe, jobType: 'NOTIFICATION_DELIVERY' as const, jobId: 'job_password_reset_1', idempotencyKey: 'password-reset-idempotency-key-0001' },
      ack: vi.fn(),
      retry: vi.fn(),
    }
    const ledger = { claim: vi.fn().mockResolvedValue(true), complete: vi.fn(), fail: vi.fn(), reserveWorkflow: vi.fn(), attachWorkflow: vi.fn() }

    await handleCloudQueueMessage({ PASSWORD_RESET_DELIVERY_ENABLED: 'true' } as CloudQueueConsumerEnv, queued as never, () => ledger as never)
    expect(ledger.claim).toHaveBeenCalledTimes(1)
    expect(ledger.reserveWorkflow).not.toHaveBeenCalled()
    expect(ledger.complete).toHaveBeenCalledTimes(1)
    expect(queued.ack).toHaveBeenCalledTimes(1)
    expect(queued.retry).not.toHaveBeenCalled()
  })
})
