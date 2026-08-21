import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classifyPublicLogin, responseCookie } from './verify-v2-production-public-smoke.mjs'

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

  it('classifies a failed login using only bounded transport and session markers', () => {
    const secret = 'must-not-appear'
    const result = classifyPublicLogin({
      response: { status: 503 },
      parsedJson: true,
      cookie: undefined,
      body: { csrfToken: secret },
    })

    expect(result).toEqual({
      pass: false,
      evidence: [
        'PUBLIC_LOGIN_HTTP_STATUS=503',
        'PUBLIC_LOGIN_RESPONSE=JSON',
        'PUBLIC_LOGIN_SESSION_COOKIE=FAIL',
        'PUBLIC_LOGIN_CSRF=FAIL',
      ],
    })
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('preserves the successful secure-cookie and CSRF login contract', () => {
    expect(classifyPublicLogin({
      response: { status: 200 },
      parsedJson: true,
      cookie: { name: 'oo_v2_session=opaque', secure: true, httpOnly: true, sameSite: 'samesite=lax' },
      body: { csrfToken: '1234567890abcdef' },
    })).toMatchObject({ pass: true })
  })

  it('marks a transport failure as unproven without exposing request data', () => {
    expect(classifyPublicLogin({
      response: undefined,
      parsedJson: false,
      cookie: undefined,
      body: undefined,
    })).toEqual({
      pass: false,
      evidence: [
        'PUBLIC_LOGIN_HTTP_STATUS=UNAVAILABLE',
        'PUBLIC_LOGIN_RESPONSE=TRANSPORT',
        'PUBLIC_LOGIN_SESSION_COOKIE=UNPROVEN',
        'PUBLIC_LOGIN_CSRF=UNPROVEN',
      ],
    })
  })

  it('keeps raw response errors out of the smoke evidence contract', () => {
    expect(source).toContain('PUBLIC_LOGIN_HTTP_STATUS=')
    expect(source).toContain('PUBLIC_LOGIN_SESSION_COOKIE=')
    expect(source).not.toContain('body?.error?.message')
    expect(source).not.toContain('console.error')
  })
})
