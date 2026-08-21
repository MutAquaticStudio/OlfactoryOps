import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

export type DeliveryChannel = 'IN_APP' | 'EMAIL' | 'WEB_PUSH'
export type DeliveryJob = {
  id: string
  organizationId: string
  recipientUserId?: string
  eventType: string
  channel: DeliveryChannel
  payload: Record<string, unknown>
  attempts: number
  maxAttempts: number
  leaseToken: string
}

export type DeliveryResult =
  | { outcome: 'SENT' }
  | { outcome: 'RETRY'; code?: string }
  | { outcome: 'FAILED'; code?: string }
  | { outcome: 'INVALID_ENDPOINT'; code?: string }

export interface NotificationChannelAdapter {
  send(job: DeliveryJob): Promise<DeliveryResult>
}

export interface NotificationDeliveryStore {
  claimDue(organizationId: string, leaseToken: string, now: Date, leaseMs: number, limit: number): Promise<DeliveryJob[]>
  isEnabled(organizationId: string, userId: string | undefined, eventType: string, channel: DeliveryChannel): Promise<boolean>
  markSent(job: DeliveryJob, leaseToken: string): Promise<void>
  markRetry(job: DeliveryJob, leaseToken: string, code: string, nextAttemptAt: Date): Promise<void>
  markFailed(job: DeliveryJob, leaseToken: string, code: string): Promise<void>
  markDisabled(job: DeliveryJob, leaseToken: string): Promise<void>
  revokePushEndpoint(organizationId: string, endpointHash: string): Promise<void>
}

export type NotificationWorkerOptions = {
  leaseMs?: number
  batchSize?: number
  now?: () => Date
  adapters: Record<DeliveryChannel, NotificationChannelAdapter>
}

function normalizedCode(code: string | undefined) { return (code || 'DELIVERY_FAILED').replace(/[^A-Z0-9_]/gi, '_').slice(0, 80).toUpperCase() }
function retryDelayMs(attempt: number) { return Math.min(60 * 60_000, 1000 * 2 ** Math.max(0, attempt - 1)) }

export class NotificationDeliveryWorker {
  private readonly leaseMs: number
  private readonly batchSize: number
  private readonly now: () => Date

  constructor(private readonly store: NotificationDeliveryStore, private readonly options: NotificationWorkerOptions) {
    this.leaseMs = options.leaseMs ?? 30_000
    this.batchSize = options.batchSize ?? 25
    this.now = options.now ?? (() => new Date())
  }

  async processOrganization(organizationId: string) {
    const leaseToken = randomUUID()
    const jobs = await this.store.claimDue(organizationId, leaseToken, this.now(), this.leaseMs, this.batchSize)
    const results: Array<{ id: string; status: 'SENT' | 'RETRYING' | 'FAILED' | 'DISABLED' }> = []
    for (const job of jobs) {
      const enabled = await this.store.isEnabled(job.organizationId, job.recipientUserId, job.eventType, job.channel)
      if (!enabled) {
        await this.store.markDisabled(job, leaseToken)
        results.push({ id: job.id, status: 'DISABLED' })
        continue
      }
      let result: DeliveryResult
      try {
        result = await this.options.adapters[job.channel].send(job)
      } catch {
        result = { outcome: 'RETRY', code: 'PROVIDER_UNAVAILABLE' }
      }
      if (result.outcome === 'SENT') {
        await this.store.markSent(job, leaseToken)
        results.push({ id: job.id, status: 'SENT' })
        continue
      }
      if (result.outcome === 'INVALID_ENDPOINT') {
        const endpointHash = typeof job.payload.endpointHash === 'string' ? job.payload.endpointHash : undefined
        if (endpointHash) await this.store.revokePushEndpoint(job.organizationId, endpointHash)
      }
      const code = normalizedCode(result.code)
      if (result.outcome === 'RETRY' && job.attempts < job.maxAttempts) {
        await this.store.markRetry(job, leaseToken, code, new Date(this.now().getTime() + retryDelayMs(job.attempts)))
        results.push({ id: job.id, status: 'RETRYING' })
      } else {
        await this.store.markFailed(job, leaseToken, code)
        results.push({ id: job.id, status: 'FAILED' })
      }
    }
    return { claimed: jobs.length, results }
  }
}

type MemoryJob = DeliveryJob & { status: 'QUEUED' | 'SENDING' | 'SENT' | 'RETRYING' | 'FAILED' | 'DISABLED'; nextAttemptAt: Date; leaseExpiresAt?: Date; errorCode?: string; deliveryAttempts: number[] }

export class MemoryNotificationDeliveryStore implements NotificationDeliveryStore {
  readonly jobs: MemoryJob[] = []
  readonly preferences = new Map<string, boolean>()
  readonly revokedPushHashes = new Set<string>()

  enqueue(job: Omit<DeliveryJob, 'leaseToken' | 'attempts'> & { maxAttempts?: number }) {
    const record: MemoryJob = { ...job, attempts: 0, maxAttempts: job.maxAttempts ?? 3, leaseToken: '', status: 'QUEUED', nextAttemptAt: new Date(0), deliveryAttempts: [] }
    this.jobs.push(record)
    return record
  }

  async claimDue(organizationId: string, leaseToken: string, now: Date, leaseMs: number, limit: number) {
    return this.jobs.filter((job) => job.organizationId === organizationId && ['QUEUED', 'RETRYING'].includes(job.status) && job.nextAttemptAt <= now && (!job.leaseExpiresAt || job.leaseExpiresAt <= now)).slice(0, limit).map((job) => { job.status = 'SENDING'; job.leaseToken = leaseToken; job.leaseExpiresAt = new Date(now.getTime() + leaseMs); job.attempts += 1; job.deliveryAttempts.push(job.attempts); return structuredClone({ ...job, leaseToken }) })
  }
  async isEnabled(organizationId: string, userId: string | undefined, eventType: string, channel: DeliveryChannel) { return this.preferences.get(`${organizationId}:${userId ?? '*'}:${eventType}:${channel}`) ?? true }
  private assertLease(job: DeliveryJob, token: string) { const current = this.jobs.find((item) => item.id === job.id); if (!current || current.status !== 'SENDING' || current.leaseToken !== token) throw new Error('NOTIFICATION_LEASE_FENCED'); return current }
  async markSent(job: DeliveryJob, leaseToken: string) { const current = this.assertLease(job, leaseToken); current.status = 'SENT'; current.leaseToken = ''; current.leaseExpiresAt = undefined }
  async markRetry(job: DeliveryJob, leaseToken: string, code: string, nextAttemptAt: Date) { const current = this.assertLease(job, leaseToken); current.status = 'RETRYING'; current.errorCode = code; current.nextAttemptAt = nextAttemptAt; current.leaseToken = ''; current.leaseExpiresAt = undefined }
  async markFailed(job: DeliveryJob, leaseToken: string, code: string) { const current = this.assertLease(job, leaseToken); current.status = 'FAILED'; current.errorCode = code; current.leaseToken = ''; current.leaseExpiresAt = undefined }
  async markDisabled(job: DeliveryJob, leaseToken: string) { const current = this.assertLease(job, leaseToken); current.status = 'DISABLED'; current.leaseToken = ''; current.leaseExpiresAt = undefined }
  async revokePushEndpoint(_organizationId: string, endpointHash: string) { this.revokedPushHashes.add(endpointHash) }
}

type RawOutbox = { id: string; organization_id: string; recipient_user_id: string | null; event_type: string; channel: string; payload: unknown; attempts: number; max_attempts: number; lease_token: string }

export class PrismaNotificationDeliveryStore implements NotificationDeliveryStore {
  constructor(private readonly client: PrismaClient) {}
  private async scoped<T>(organizationId: string, callback: (client: PrismaClient) => Promise<T>) { return this.client.$transaction(async (tx) => { await tx.$executeRawUnsafe(`SELECT set_config('app.organization_id', $1, true)`, organizationId); return callback(tx as unknown as PrismaClient) }) }
  async claimDue(organizationId: string, leaseToken: string, now: Date, leaseMs: number, limit: number) {
    const rows = await this.scoped(organizationId, (client) => client.$queryRawUnsafe<RawOutbox[]>(`WITH candidate AS (SELECT id FROM v2_notification_outbox WHERE organization_id = $1 AND status IN ('QUEUED','RETRYING') AND next_attempt_at <= $2 AND attempts < max_attempts AND (lease_expires_at IS NULL OR lease_expires_at <= $2) ORDER BY next_attempt_at, created_at LIMIT $3 FOR UPDATE SKIP LOCKED) UPDATE v2_notification_outbox AS o SET status = 'SENDING', attempts = o.attempts + 1, lease_token = $4, lease_expires_at = $2 + ($5 * interval '1 millisecond'), updated_at = $2 FROM candidate WHERE o.id = candidate.id RETURNING o.id, o.organization_id, o.recipient_user_id, o.event_type, o.channel, o.payload, o.attempts, o.max_attempts, o.lease_token`, organizationId, now, limit, leaseToken, leaseMs))
    return rows.map((row) => ({ id: row.id, organizationId: row.organization_id, recipientUserId: row.recipient_user_id ?? undefined, eventType: row.event_type, channel: row.channel as DeliveryChannel, payload: (row.payload ?? {}) as Record<string, unknown>, attempts: row.attempts, maxAttempts: row.max_attempts, leaseToken: row.lease_token }))
  }
  async isEnabled(organizationId: string, userId: string | undefined, eventType: string, channel: DeliveryChannel) { return this.scoped(organizationId, async (client) => { if (!userId) return true; const preference = await client.notificationPreference.findUnique({ where: { organizationId_userId_eventType_channel: { organizationId, userId, eventType, channel } } }); return preference?.enabled ?? true }) }
  private async complete(job: DeliveryJob, leaseToken: string, status: 'SENT' | 'RETRYING' | 'FAILED' | 'DISABLED', code: string | undefined, nextAttemptAt?: Date) { await this.scoped(job.organizationId, async (client) => { const existing = await client.notificationOutbox.findFirst({ where: { id: job.id, organizationId: job.organizationId, status: 'SENDING', leaseToken } }); if (!existing) throw new Error('NOTIFICATION_LEASE_FENCED'); await client.notificationDelivery.upsert({ where: { outboxId_attempt: { outboxId: job.id, attempt: job.attempts } }, create: { id: `delivery_${job.id}_${job.attempts}`, outboxId: job.id, organizationId: job.organizationId, channel: job.channel, status, attempt: job.attempts, errorCode: code }, update: { status, errorCode: code } }); await client.notificationOutbox.update({ where: { id: job.id }, data: { status, lastErrorCode: code, nextAttemptAt: nextAttemptAt ?? existing.nextAttemptAt, leaseToken: null, leaseExpiresAt: null } }) }) }
  async markSent(job: DeliveryJob, token: string) { return this.complete(job, token, 'SENT', undefined) }
  async markRetry(job: DeliveryJob, token: string, code: string, nextAttemptAt: Date) { return this.complete(job, token, 'RETRYING', code, nextAttemptAt) }
  async markFailed(job: DeliveryJob, token: string, code: string) { return this.complete(job, token, 'FAILED', code) }
  async markDisabled(job: DeliveryJob, token: string) { return this.complete(job, token, 'DISABLED', 'NOTIFICATION_DISABLED') }
  async revokePushEndpoint(organizationId: string, endpointHash: string) { await this.scoped(organizationId, (client) => client.pushSubscription.updateMany({ where: { organizationId, endpointHash }, data: { revokedAt: new Date() } }).then(() => undefined)) }
}
