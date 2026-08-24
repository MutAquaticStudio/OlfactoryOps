import { openSecret } from '../../services/platform/src/crypto.js'
import { NotificationDeliveryWorker, PrismaNotificationDeliveryStore, type DeliveryJob, type DeliveryResult, type NotificationChannelAdapter } from '../../services/platform/src/notification-worker.js'
import { sendResendEmail, type ProviderFetch } from '../provider-adapters.js'
import { createHyperdrivePrisma } from './hyperdrive.js'

export type PasswordResetDeliveryEnv = {
  HYPERDRIVE: Hyperdrive
  PASSWORD_RESET_DELIVERY_ENABLED?: string
  V2_PASSWORD_RESET_ENCRYPTION_KEY?: string
  V2_PUBLIC_PAGES_HOSTNAME?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
}

type PasswordResetDeliveryConfig = Pick<PasswordResetDeliveryEnv, 'V2_PASSWORD_RESET_ENCRYPTION_KEY' | 'V2_PUBLIC_PAGES_HOSTNAME' | 'RESEND_API_KEY' | 'EMAIL_FROM'>

type ResetPayload = { email: string; token: string; resetPath: string }

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validToken(value: unknown): value is string {
  return typeof value === 'string' && /^reset_[A-Za-z0-9_-]{32,128}$/.test(value)
}

function publicPagesOrigin(hostname: string | undefined): string | undefined {
  const host = hostname?.trim().toLowerCase().replace(/\.$/, '')
  if (!host || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)?labofscents\.org$/.test(host)) return undefined
  return `https://${host}`
}

function resetPayload(job: DeliveryJob, key: string): ResetPayload | undefined {
  if (job.eventType !== 'PASSWORD_RESET' || job.channel !== 'EMAIL') return undefined
  const ciphertext = typeof job.payload.payloadCiphertext === 'string' ? job.payload.payloadCiphertext : ''
  const version = job.payload.payloadVersion
  if (!ciphertext || version !== 'v2-password-reset') return undefined
  try {
    const value: unknown = JSON.parse(openSecret(ciphertext, key))
    if (!value || typeof value !== 'object') return undefined
    const payload = value as Record<string, unknown>
    if (!validEmail(payload.email) || !validToken(payload.token) || payload.resetPath !== '/v2/reset-password') return undefined
    return { email: payload.email, token: payload.token, resetPath: payload.resetPath }
  } catch {
    return undefined
  }
}

function passwordResetMessage(origin: string, payload: ResetPayload) {
  const url = new URL(payload.resetPath, origin)
  url.searchParams.set('token', payload.token)
  return `Reset your OlfactoryOps password within 30 minutes:\n${url.toString()}\n\nIf you did not request this, you can ignore this email.`
}

/** Exposed for deterministic unit tests; it never logs or returns payload data. */
export function passwordResetEmailAdapter(env: PasswordResetDeliveryConfig, fetcher: ProviderFetch = fetch): NotificationChannelAdapter {
  return {
    async send(job: DeliveryJob): Promise<DeliveryResult> {
      const key = env.V2_PASSWORD_RESET_ENCRYPTION_KEY
      const origin = publicPagesOrigin(env.V2_PUBLIC_PAGES_HOSTNAME)
      if (!key || !origin || !env.RESEND_API_KEY?.trim() || !env.EMAIL_FROM?.trim()) return { outcome: 'RETRY', code: 'PASSWORD_RESET_EMAIL_NOT_CONFIGURED' }
      const payload = resetPayload(job, key)
      if (!payload) return { outcome: 'FAILED', code: 'PASSWORD_RESET_PAYLOAD_INVALID' }
      const result = await sendResendEmail(fetcher, {
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM,
        to: payload.email,
        subject: 'Reset your OlfactoryOps password',
        text: passwordResetMessage(origin, payload),
      })
      return result.delivered ? { outcome: 'SENT' } : { outcome: 'RETRY', code: 'PASSWORD_RESET_EMAIL_PROVIDER_UNAVAILABLE' }
    },
  }
}

export async function processPasswordResetDeliveries(env: PasswordResetDeliveryEnv, organizationId: string): Promise<{ retry: boolean }> {
  if (env.PASSWORD_RESET_DELIVERY_ENABLED !== 'true') return { retry: false }
  const prisma = createHyperdrivePrisma(env)
  try {
    const adapter = passwordResetEmailAdapter(env)
    const worker = new NotificationDeliveryWorker(new PrismaNotificationDeliveryStore(prisma), {
      adapters: { IN_APP: adapter, EMAIL: adapter, WEB_PUSH: adapter },
      eventTypes: ['PASSWORD_RESET'],
      // Security recovery mail must not be suppressed by product-notification preferences.
      respectPreferences: false,
      batchSize: 10,
    })
    const result = await worker.processOrganization(organizationId)
    return { retry: result.results.some((entry) => entry.status === 'RETRYING') }
  } finally {
    await prisma.$disconnect().catch(() => undefined)
  }
}
