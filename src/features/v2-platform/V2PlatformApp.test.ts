import { describe, expect, it } from 'vitest'
import { platformApiBaseFromRuntime, platformPathMode, platformRequestHeaders, safeV2ReturnPath, v2LoginPathForLocation, workspaceErrorMessage, workspaceNavigation, workspaceRedirectTarget } from './V2PlatformApp.js'

describe('V2 scientific creative workspace shell', () => {
  it('keeps the production navigation focused on supported workspace areas', () => {
    expect(workspaceNavigation.map((group) => group.label)).toEqual(['Home', 'R&D', 'Operations', 'Intelligence', 'System'])
    expect(workspaceNavigation.flatMap((group) => group.items.map((item) => item.key))).toEqual([
      'workspace', 'materials', 'formulas', 'design-studio', 'inventory', 'suppliers', 'procurement', 'agents', 'domains', 'members', 'security', 'observability',
    ])
    expect(workspaceNavigation.flatMap((group) => group.items.map((item) => item.key))).not.toContain('trials')
    expect(workspaceNavigation.flatMap((group) => group.items.map((item) => item.key))).not.toContain('advanced')
  })

  it('maps transport errors to product language instead of exposing a raw browser failure', () => {
    const message = workspaceErrorMessage(new Error('TypeError: Failed to fetch'), 'load materials')
    expect(message).toBe('Unable to load materials right now. Check your connection and try again.')
    expect(message).not.toContain('Failed to fetch')
  })

  it('keeps authorization and unavailable-environment guidance bounded', () => {
    expect(workspaceErrorMessage(new Error('Forbidden'), 'save this draft')).toContain('workspace role')
    expect(workspaceErrorMessage(new Error('runtime not configured'), 'open this workspace')).toContain('not available')
  })

  it('accepts only trusted workspace locations returned by public auth', () => {
    expect(workspaceRedirectTarget('https://atelier-nox.labofscents.org/v2/workspace')).toBe('https://atelier-nox.labofscents.org/v2/workspace')
    expect(workspaceRedirectTarget('https://untrusted.example.test/v2/workspace')).toBeUndefined()
    expect(workspaceRedirectTarget('javascript:alert(1)')).toBeUndefined()
  })

  it('keeps CSRF on every mutation but avoids a needless session-read preflight', () => {
    expect(platformRequestHeaders(undefined, 'fresh-token')).toEqual({})
    expect(platformRequestHeaders('GET', 'fresh-token')).toEqual({})
    expect(platformRequestHeaders('HEAD', 'fresh-token')).toEqual({})
    expect(platformRequestHeaders('POST', 'fresh-token')).toEqual({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'fresh-token' })
    expect(platformRequestHeaders('PATCH', undefined)).toEqual({ 'Content-Type': 'application/json' })
  })

  it('keeps the complete V2 public-auth route family refreshable', () => {
    expect(platformPathMode('/login')).toBe('login')
    expect(platformPathMode('/signup')).toBe('signup')
    expect(platformPathMode('/v2/login')).toBe('login')
    expect(platformPathMode('/v2/signup')).toBe('signup')
    expect(platformPathMode('/forgot-password')).toBe('reset-request')
    expect(platformPathMode('/v2/forgot-password')).toBe('reset-request')
    expect(platformPathMode('/v2/reset-password')).toBe('reset-confirm')
    expect(platformPathMode('/v2/verify-email')).toBe('verify-confirm')
    expect(platformPathMode('/reset-password')).toBe('legacy-recovery')
    expect(platformPathMode('/verify-email')).toBe('legacy-recovery')
    expect(platformPathMode('/login', '?reset=legacy-token')).toBe('legacy-recovery')
  })

  it('keeps only safe V2 return paths when protected workspace bootstrap redirects to login', () => {

    expect(safeV2ReturnPath('/v2/workspace?tab=billing#usage')).toBe('/v2/workspace?tab=billing#usage')
    expect(safeV2ReturnPath('/v2/login')).toBeUndefined()
    expect(safeV2ReturnPath('/v2/reset-password')).toBeUndefined()
    expect(safeV2ReturnPath('https://untrusted.example.test/v2/workspace')).toBeUndefined()
    expect(safeV2ReturnPath('javascript:alert(1)')).toBeUndefined()
    expect(v2LoginPathForLocation('/v2/workspace', '?tab=billing', '#usage')).toBe('/login?next=%2Fv2%2Fworkspace%3Ftab%3Dbilling%23usage')
  })

  it('resolves public auth only against the configured production or candidate API runtime', () => {
    expect(platformApiBaseFromRuntime('https://api.labofscents.org/api/v1')).toBe('https://api.labofscents.org/api/v1/v2/platform')
    expect(platformApiBaseFromRuntime('https://api-next.labofscents.org/api/v1')).toBe('https://api-next.labofscents.org/api/v1/v2/platform')
    expect(platformApiBaseFromRuntime(undefined)).toBe('/api/v1/v2/platform')
    expect(platformApiBaseFromRuntime('https://api.labofscents.org/api/v1')).not.toBe(platformApiBaseFromRuntime('https://api-next.labofscents.org/api/v1'))
  })

  it('keeps a rejected workspace redirect out of product-facing error text', () => {
    const message = workspaceErrorMessage(new Error('WORKSPACE_REDIRECT_REJECTED'), 'sign in')
    expect(message).toBe('Unable to sign in. Please try again.')
    expect(message).not.toContain('WORKSPACE_REDIRECT_REJECTED')
  })
})
