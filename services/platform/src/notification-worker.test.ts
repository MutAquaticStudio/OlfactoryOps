import { describe, expect, it } from 'vitest'
import { MemoryNotificationDeliveryStore, NotificationDeliveryWorker, type DeliveryChannelAdapter } from './notification-worker.js'

const adapter = (result: Awaited<ReturnType<DeliveryChannelAdapter['send']>>): DeliveryChannelAdapter => ({ send: async () => result })
function worker(store: MemoryNotificationDeliveryStore, result: Awaited<ReturnType<DeliveryChannelAdapter['send']>>) { return new NotificationDeliveryWorker(store, { adapters: { IN_APP: adapter(result), EMAIL: adapter(result), WEB_PUSH: adapter(result) }, now: () => new Date('2026-08-08T00:00:00.000Z') }) }

describe('V2 notification delivery worker', () => {
  it('claims and completes each channel idempotently', async () => {
    const store = new MemoryNotificationDeliveryStore()
    store.enqueue({ id: 'out-1', organizationId: 'org-a', eventType: 'SECURITY', channel: 'IN_APP', payload: {}, maxAttempts: 3 })
    const result = await worker(store, { outcome: 'SENT' }).processOrganization('org-a')
    expect(result.results).toEqual([{ id: 'out-1', status: 'SENT' }])
    expect(store.jobs[0]?.status).toBe('SENT')
    expect((await worker(store, { outcome: 'SENT' }).processOrganization('org-a')).claimed).toBe(0)
  })

  it('retries with bounded attempts and then fails terminally', async () => {
    const store = new MemoryNotificationDeliveryStore()
    store.enqueue({ id: 'out-2', organizationId: 'org-a', eventType: 'EMAIL', channel: 'EMAIL', payload: {}, maxAttempts: 2 })
    const first = await worker(store, { outcome: 'RETRY', code: 'provider-temporary' }).processOrganization('org-a')
    expect(first.results[0]?.status).toBe('RETRYING')
    store.jobs[0]!.nextAttemptAt = new Date(0)
    const second = await worker(store, { outcome: 'RETRY', code: 'provider-temporary' }).processOrganization('org-a')
    expect(second.results[0]?.status).toBe('FAILED')
    expect(store.jobs[0]?.attempts).toBe(2)
  })

  it('honors disabled preferences and cleans invalid push endpoints', async () => {
    const store = new MemoryNotificationDeliveryStore()
    store.enqueue({ id: 'out-3', organizationId: 'org-a', recipientUserId: 'user-a', eventType: 'PUSH', channel: 'WEB_PUSH', payload: { endpointHash: 'hash-a' }, maxAttempts: 3 })
    store.preferences.set('org-a:user-a:PUSH:WEB_PUSH', false)
    expect((await worker(store, { outcome: 'SENT' }).processOrganization('org-a')).results[0]?.status).toBe('DISABLED')
    store.enqueue({ id: 'out-4', organizationId: 'org-a', eventType: 'PUSH', channel: 'WEB_PUSH', payload: { endpointHash: 'hash-b' }, maxAttempts: 3 })
    expect((await worker(store, { outcome: 'INVALID_ENDPOINT' }).processOrganization('org-a')).results[0]?.status).toBe('FAILED')
    expect(store.revokedPushHashes.has('hash-b')).toBe(true)
  })

  it('fences a stale lease token', async () => {
    const store = new MemoryNotificationDeliveryStore()
    const job = store.enqueue({ id: 'out-5', organizationId: 'org-a', eventType: 'SECURITY', channel: 'IN_APP', payload: {}, maxAttempts: 3 })
    const claimed = await store.claimDue('org-a', 'lease-a', new Date(), 30_000, 1)
    expect(claimed).toHaveLength(1)
    await expect(store.markSent(job, 'lease-b')).rejects.toThrow('NOTIFICATION_LEASE_FENCED')
    await store.markSent(job, 'lease-a')
  })
})
