import { describe, expect, it, vi } from 'vitest'
import { CloudflareScientificDispatcher } from './cloud-scientific-dispatch.js'

describe('CloudflareScientificDispatcher', () => {
  it('stores only the bounded input in private R2 and sends a reference envelope through the internal service binding', async () => {
    const puts: Array<{ key: string; body: Uint8Array; metadata: Record<string, string> }> = []
    const fetch = vi.fn(async (request: Request) => {
      const body = await request.json() as Record<string, unknown>
      expect(request.url).toBe('https://cloud-runtime.internal/internal/scientific-dispatch')
      expect(request.headers.get('x-olfactoryops-internal-dispatch')).toBe('cloud-runtime/v1')
      expect(body).toMatchObject({ jobId: 'science_job_1', organizationId: 'org_a', jobType: 'SCIENTIFIC_FEATURE' })
      expect(JSON.stringify(body)).not.toContain('CCO')
      return new Response(JSON.stringify({ jobId: 'science_job_1', queued: true }), { status: 202 })
    })
    const dispatcher = new CloudflareScientificDispatcher({
      RELEASE_ENVIRONMENT: 'staging',
      R2_ARTIFACTS: {
        put: async (key: string, body: unknown, options: { customMetadata?: Record<string, string> } | undefined) => {
          puts.push({ key, body: body as Uint8Array, metadata: options?.customMetadata ?? {} })
          return { key, version: 'v1', etag: 'etag1' }
        },
      } as unknown as R2Bucket,
      CLOUD_RUNTIME: { fetch } as unknown as Fetcher,
    })

    await expect(dispatcher.dispatchFeatures({
      jobId: 'science_job_1', organizationId: 'org_a', actorUserId: 'user_a', correlationId: 'corr_a',
      idempotencyKey: 'idempotency-key-long-enough', canonicalSmiles: 'CCO', featureKinds: ['ECFP', 'BCFP'],
    })).resolves.toEqual({ dispatchId: 'science_job_1', queued: true })

    expect(puts).toHaveLength(1)
    expect(puts[0]?.key).toMatch(/^v2\/org_a\/scientific\/[a-f0-9]{64}$/)
    expect(new TextDecoder().decode(puts[0]?.body)).toBe('{"canonicalSmiles":"CCO","featureKinds":["ECFP","BCFP"]}')
    expect(puts[0]?.metadata.organizationId).toBe('org_a')
  })

  it('fails closed outside staging before any artifact or dispatch is created', async () => {
    const put = vi.fn()
    const fetch = vi.fn()
    const dispatcher = new CloudflareScientificDispatcher({
      RELEASE_ENVIRONMENT: 'production', R2_ARTIFACTS: { put } as unknown as R2Bucket, CLOUD_RUNTIME: { fetch } as unknown as Fetcher,
    })
    await expect(dispatcher.dispatchFeatures({
      jobId: 'science_job_1', organizationId: 'org_a', actorUserId: 'user_a', correlationId: 'corr_a',
      idempotencyKey: 'idempotency-key-long-enough', canonicalSmiles: 'CCO', featureKinds: ['ECFP'],
    })).rejects.toThrow('CLOUD_SCIENTIFIC_RUNTIME_NOT_CONFIGURED')
    expect(put).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
