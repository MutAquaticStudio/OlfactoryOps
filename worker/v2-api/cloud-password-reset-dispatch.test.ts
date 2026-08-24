import { describe, expect, it, vi } from 'vitest'
import { CloudflarePasswordResetDispatcher } from './cloud-password-reset-dispatch.js'

describe('CloudflarePasswordResetDispatcher', () => {
  it('uses only the internal notification dispatch surface and opaque outbox reference', async () => {
    const fetch = vi.fn(async (request: Request) => {
      const body = await request.json() as { jobId: string; jobType: string; artifactRef: string }
      expect(request.url).toBe('https://cloud-runtime.internal/internal/notification-dispatch')
      expect(request.headers.get('x-olfactoryops-internal-dispatch')).toBe('cloud-runtime/v1')
      expect(body.jobType).toBe('NOTIFICATION_DELIVERY')
      expect(body.artifactRef).toBe('notification-password-reset/reset_opaque')
      return Response.json({ jobId: body.jobId, queued: true })
    })
    const dispatcher = new CloudflarePasswordResetDispatcher({ CLOUD_RUNTIME: { fetch } })

    await expect(dispatcher.dispatchPasswordReset({
      organizationId: 'org_1',
      userId: 'user_1',
      outboxRef: 'reset_opaque',
      idempotencyKey: 'password-reset:reset_opaque',
    })).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
