import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { responseCookie } from './verify-v2-production-public-smoke.mjs'

const source = readFileSync(new URL('./verify-v2-production-public-smoke.mjs', import.meta.url), 'utf8')

describe('V2 public smoke contract', () => {
  it('uses the V2 health, auth, and session contracts', () => {
    expect(source).toContain("requiredTenantUrl('PRODUCTION_SMOKE_TENANT_URL')")
    expect(source).toContain("url.hostname === 'next.labofscents.org'")
    expect(source).toContain("body?.status !== 'ok'")
    expect(source).toContain("body?.database !== 'hyperdrive'")
    expect(source).toContain("'/v2/platform/auth/login'")
    expect(source).toContain("'/v2/platform/me'")
    expect(source).toContain("oo_v2_session=")
    expect(source).not.toContain("'/auth/login'")
    expect(source).not.toContain("'/me'")
    expect(source).not.toContain('oo_session=')
  })

  it('requires secure HttpOnly SameSite V2 cookies without exposing values', () => {
    const headers = new Headers({ 'set-cookie': 'oo_v2_session=opaque; Path=/; Secure; HttpOnly; SameSite=Lax' })
    const cookie = responseCookie({ headers })
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'samesite=lax' })
    expect(cookie.pair).toBe('oo_v2_session=opaque')
  })
})
