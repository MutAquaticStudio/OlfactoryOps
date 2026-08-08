import { describe, expect, it, vi } from 'vitest'
import { FetchCloudflareSaasAdapter, NotConfiguredCloudflareSaasAdapter } from './cloudflare-adapter.js'

describe('Cloudflare SaaS provider boundary', () => {
  it('reports not configured without pretending a domain is active', async () => {
    await expect(new NotConfiguredCloudflareSaasAdapter().request('customer.example')).resolves.toMatchObject({ validationStatus: 'NOT_CONFIGURED', sslStatus: 'NOT_CONFIGURED' })
  })
  it('normalizes provider failures without exposing provider payloads', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'secret provider detail' }] }), { status: 400 }))
    const result = await new FetchCloudflareSaasAdapter({ apiToken: 'secret', zoneId: 'zone', origin: 'origin', fetcher }).request('customer.example')
    expect(result).toEqual({ validationStatus: 'FAILED', sslStatus: 'FAILED', safeMessage: 'The domain provider did not accept this request.' })
    expect(JSON.stringify(result)).not.toContain('secret provider detail')
  })
})
