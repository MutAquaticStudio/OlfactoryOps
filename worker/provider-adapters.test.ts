import { describe, expect, it, vi } from 'vitest'
import {
  cloudflareValidation,
  cloudflareVerificationErrors,
  probeHttpsOrigin,
  requestCloudflareSaas,
  requestStripeForm,
  sendResendEmail,
} from './provider-adapters'

describe('provider adapters', () => {
  it('sends transactional email through Resend without exposing provider response details', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'email-1' }), { status: 201 }))
    const result = await sendResendEmail(fetcher, {
      apiKey: 'resend-secret',
      from: 'OlfactoryOps <notifications@example.test>',
      to: 'owner@example.test',
      subject: 'Security notice',
      text: 'A new device signed in.',
    })

    expect(result).toEqual({ delivered: true })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('returns a bounded email failure suitable for retry persistence', async () => {
    const result = await sendResendEmail(
      async () => new Response(JSON.stringify({ message: 'credential=never-return-this' }), { status: 429 }),
      { apiKey: 'resend-secret', from: 'sender@example.test', to: 'owner@example.test', subject: 'Notice', text: 'Body' },
    )

    expect(result).toEqual({ delivered: false, error: 'Resend returned 429' })
    expect(JSON.stringify(result)).not.toContain('credential=')
  })

  it('uses server-owned Stripe form data and surfaces only provider-safe errors', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.test/session' }), { status: 200 }))
    const payload = await requestStripeForm(
      fetcher,
      'stripe-secret',
      'https://api.stripe.com/v1/checkout/sessions',
      new URLSearchParams({ mode: 'subscription', 'line_items[0][price]': 'price_server_owned' }),
    )

    expect(payload.url).toBe('https://checkout.stripe.test/session')
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/checkout/sessions',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('normalizes Cloudflare validation and provider failure data', async () => {
    const payload = await requestCloudflareSaas(
      async () => new Response(JSON.stringify({ result: { id: 'cf-hostname-1' } }), { status: 200 }),
      'cloudflare-secret',
      'https://api.cloudflare.test/client/v4/zones/zone/custom_hostnames',
      { method: 'POST', body: '{}' },
    )
    expect(payload.result).toEqual({ id: 'cf-hostname-1' })

    const providerResult = {
      ownership_verification: { type: 'txt', name: '_cf.example.test', value: 'verify-me' },
      ssl: { validation_errors: [{ message: 'DNS record pending' }] },
    }
    expect(cloudflareValidation(providerResult)).toMatchObject({ type: 'TXT', name: '_cf.example.test', value: 'verify-me' })
    expect(cloudflareVerificationErrors(providerResult)).toEqual(['DNS record pending'])
  })

  it('probes only HTTPS beta origins', async () => {
    expect(await probeHttpsOrigin(async () => new Response(null, { status: 200 }), 'https://beta.labofscents.org')).toBe(true)
    expect(await probeHttpsOrigin(async () => new Response(null, { status: 200 }), 'http://beta.labofscents.org')).toBe(false)
  })
})
