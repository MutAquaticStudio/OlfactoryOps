import { describe, expect, it, vi } from 'vitest'
import { sealSecret } from '../../services/platform/src/crypto.js'
import { MemoryNotificationDeliveryStore, NotificationDeliveryWorker } from '../../services/platform/src/notification-worker.js'
import { passwordResetEmailAdapter } from './password-reset-delivery.js'

const key = 'test-password-reset-encryption-key'
const resetToken = `reset_${'a'.repeat(43)}`
const payload = {
  payloadCiphertext: sealSecret(JSON.stringify({ email: 'person@example.test', token: resetToken, resetPath: '/v2/reset-password' }), key),
  payloadVersion: 'v2-password-reset',
}

const resetJob = {
  id: 'out_reset_1',
  organizationId: 'org_1',
  recipientUserId: 'user_1',
  eventType: 'PASSWORD_RESET',
  channel: 'EMAIL' as const,
  payload,
  attempts: 1,
  maxAttempts: 5,
  leaseToken: 'lease_1',
}

describe('password reset notification delivery', () => {
  it('sends only an encrypted reset payload through the configured V2 origin', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }))
    const result = await passwordResetEmailAdapter({
      V2_PASSWORD_RESET_ENCRYPTION_KEY: key,
      V2_PUBLIC_PAGES_HOSTNAME: 'labofscents.org',
      RESEND_API_KEY: 'resend-test-key',
      EMAIL_FROM: 'OlfactoryOps <noreply@labofscents.org>',
    }, fetcher).send(resetJob)

    expect(result).toEqual({ outcome: 'SENT' })
    const request = fetcher.mock.calls[0]?.[1] as RequestInit
    expect(String(request.body)).toContain('/v2/reset-password?token=')
    expect(JSON.stringify(result)).not.toContain(resetToken)
    expect(JSON.stringify(result)).not.toContain('person@example.test')
  })

  it('returns a stable retry class for provider errors without exposing payload data', async () => {
    const result = await passwordResetEmailAdapter({
      V2_PASSWORD_RESET_ENCRYPTION_KEY: key,
      V2_PUBLIC_PAGES_HOSTNAME: 'labofscents.org',
      RESEND_API_KEY: 'resend-test-key',
      EMAIL_FROM: 'OlfactoryOps <noreply@labofscents.org>',
    }, async () => new Response('opaque provider response', { status: 503 })).send(resetJob)

    expect(result).toEqual({ outcome: 'RETRY', code: 'PASSWORD_RESET_EMAIL_PROVIDER_UNAVAILABLE' })
    expect(JSON.stringify(result)).not.toContain(resetToken)
    expect(JSON.stringify(result)).not.toContain('person@example.test')
  })

  it('claims only password reset events and bypasses product notification preferences for recovery mail', async () => {
    const store = new MemoryNotificationDeliveryStore()
    store.enqueue({ id: 'reset', organizationId: 'org_1', recipientUserId: 'user_1', eventType: 'PASSWORD_RESET', channel: 'EMAIL', payload, maxAttempts: 5 })
    store.enqueue({ id: 'verification', organizationId: 'org_1', recipientUserId: 'user_1', eventType: 'EMAIL_VERIFICATION', channel: 'EMAIL', payload: { verificationRequired: true }, maxAttempts: 5 })
    store.preferences.set('org_1:user_1:PASSWORD_RESET:EMAIL', false)
    const adapter = passwordResetEmailAdapter({
      V2_PASSWORD_RESET_ENCRYPTION_KEY: key,
      V2_PUBLIC_PAGES_HOSTNAME: 'labofscents.org',
      RESEND_API_KEY: 'resend-test-key',
      EMAIL_FROM: 'OlfactoryOps <noreply@labofscents.org>',
    }, async () => new Response('{}', { status: 200 }))
    const worker = new NotificationDeliveryWorker(store, {
      adapters: { IN_APP: adapter, EMAIL: adapter, WEB_PUSH: adapter },
      eventTypes: ['PASSWORD_RESET'],
      respectPreferences: false,
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    })

    await expect(worker.processOrganization('org_1')).resolves.toEqual({ claimed: 1, results: [{ id: 'reset', status: 'SENT' }] })
    expect(store.jobs.find((job) => job.id === 'verification')?.status).toBe('QUEUED')
  })
})
