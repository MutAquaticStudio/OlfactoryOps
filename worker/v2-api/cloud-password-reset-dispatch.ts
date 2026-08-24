import { cloudJobEnvelopeSchema, type CloudJobEnvelope } from '../cloud-runtime/contracts.js'
import { sha256 } from '../cloud-runtime/scientific-input.js'
import type { PasswordResetDispatcher } from '../../services/platform/src/service.js'

type CloudRuntimeFetcher = Pick<Fetcher, 'fetch'>

export type CloudPasswordResetDispatchEnv = {
  CLOUD_RUNTIME: CloudRuntimeFetcher
}

type DispatchInput = {
  organizationId: string
  userId: string
  outboxRef: string
  idempotencyKey: string
}

function dispatchFailure(response: Response): Error {
  if (response.status === 409) return new Error('PASSWORD_RESET_DISPATCH_CONFLICT')
  if (response.status === 503) return new Error('PASSWORD_RESET_DELIVERY_NOT_CONFIGURED')
  return new Error('PASSWORD_RESET_DISPATCH_FAILED')
}

/**
 * This is an account-internal service binding. The browser receives only the
 * generic reset acknowledgement; no reset token or email is carried here.
 */
export class CloudflarePasswordResetDispatcher implements PasswordResetDispatcher {
  constructor(private readonly env: CloudPasswordResetDispatchEnv) {}

  async dispatchPasswordReset(input: DispatchInput): Promise<void> {
    const inputHash = await sha256(input.idempotencyKey)
    const job = cloudJobEnvelopeSchema.parse({
      protocolVersion: 'cloud-runtime/v1',
      jobId: `notify_${crypto.randomUUID()}`,
      organizationId: input.organizationId,
      actorUserId: input.userId,
      correlationId: `v2_${crypto.randomUUID()}`,
      idempotencyKey: input.idempotencyKey,
      jobType: 'NOTIFICATION_DELIVERY',
      artifactRef: `notification-password-reset/${input.outboxRef}`,
      inputHash,
      createdAt: new Date().toISOString(),
    })
    const response = await this.env.CLOUD_RUNTIME.fetch(new Request('https://cloud-runtime.internal/internal/notification-dispatch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-olfactoryops-internal-dispatch': 'cloud-runtime/v1',
      },
      body: JSON.stringify(job),
    }))
    if (!response.ok) throw dispatchFailure(response)
    const body = await response.json().catch(() => undefined) as { jobId?: unknown; queued?: unknown } | undefined
    if (body?.jobId !== job.jobId || typeof body.queued !== 'boolean') throw new Error('PASSWORD_RESET_DISPATCH_INVALID_RESPONSE')
  }
}

export function passwordResetEnvelopeForTest(input: DispatchInput, jobId = 'notify_test_job'): CloudJobEnvelope {
  return cloudJobEnvelopeSchema.parse({
    protocolVersion: 'cloud-runtime/v1',
    jobId,
    organizationId: input.organizationId,
    actorUserId: input.userId,
    correlationId: 'v2_test_correlation',
    idempotencyKey: input.idempotencyKey,
    jobType: 'NOTIFICATION_DELIVERY',
    artifactRef: `notification-password-reset/${input.outboxRef}`,
    inputHash: 'a'.repeat(64),
    createdAt: '2026-08-24T00:00:00.000Z',
  })
}
