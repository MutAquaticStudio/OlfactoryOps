import { describe, expect, it } from 'vitest'
import {
  isExactHttpsOriginForHostname,
  isReservedWorkspaceSlug,
  isSystemWorkspaceHostname,
  isWorkspaceSlugEligibleForHostname,
  publicAuthUrlForWorkspaceOrigin,
  systemWorkspaceHostname,
  trustedWorkspaceRedirectUrl,
  workspaceBaseDomainFromRuntime,
  workspaceUrlForHostname,
  workspaceRedirectOriginsFromRuntime,
} from './workspaceHostnames'

describe('workspace hostname allocation', () => {
  it('creates a deterministic system hostname only for eligible workspace slugs', () => {
    expect(systemWorkspaceHostname('atelier-nox')).toBe('atelier-nox.labofscents.org')
    expect(workspaceUrlForHostname('atelier-nox.labofscents.org')).toBe('https://atelier-nox.labofscents.org')
    expect(isSystemWorkspaceHostname('atelier-nox.labofscents.org')).toBe(true)
    expect(isWorkspaceSlugEligibleForHostname('atelier-nox')).toBe(true)
  })

  it('keeps first-party hostnames out of the signup namespace', () => {
    for (const slug of ['api', 'beta', 'customers', 'saas-origin', 'www']) {
      expect(isReservedWorkspaceSlug(slug)).toBe(true)
      expect(isWorkspaceSlugEligibleForHostname(slug)).toBe(false)
      expect(systemWorkspaceHostname(slug)).toBeUndefined()
    }
    expect(isWorkspaceSlugEligibleForHostname('-bad')).toBe(false)
    expect(isWorkspaceSlugEligibleForHostname('bad-')).toBe(false)
  })

  it('requires an exact HTTPS origin before granting credentialed CORS', () => {
    expect(isExactHttpsOriginForHostname('https://atelier-nox.labofscents.org', 'atelier-nox.labofscents.org')).toBe(true)
    expect(isExactHttpsOriginForHostname('https://other.labofscents.org', 'atelier-nox.labofscents.org')).toBe(false)
    expect(isExactHttpsOriginForHostname('http://atelier-nox.labofscents.org', 'atelier-nox.labofscents.org')).toBe(false)
    expect(isExactHttpsOriginForHostname('https://atelier-nox.labofscents.org:8443', 'atelier-nox.labofscents.org')).toBe(false)
  })

  it('uses the public sign-in entry from a system workspace hostname', () => {
    expect(publicAuthUrlForWorkspaceOrigin('/login', 'https://atelier-nox.labofscents.org')).toBe('https://labofscents.org/login')
    expect(publicAuthUrlForWorkspaceOrigin('/signup', 'https://atelier-nox.labofscents.org')).toBe('https://labofscents.org/signup')
    expect(publicAuthUrlForWorkspaceOrigin('/login', 'https://labofscents.org')).toBeUndefined()
    expect(publicAuthUrlForWorkspaceOrigin('/login', 'http://atelier-nox.localhost:5173')).toBeUndefined()
  })

  it('uses the configured candidate base domain while retaining the production fallback', () => {
    expect(workspaceBaseDomainFromRuntime('next.labofscents.org')).toBe('next.labofscents.org')
    expect(publicAuthUrlForWorkspaceOrigin('/login', 'https://atelier-nox.next.labofscents.org', 'next.labofscents.org')).toBe('https://next.labofscents.org/login')
    expect(workspaceBaseDomainFromRuntime('not a domain')).toBe('labofscents.org')
  })

  it('accepts only a trusted HTTPS workspace redirect from an auth response', () => {
    expect(trustedWorkspaceRedirectUrl('https://atelier-nox.labofscents.org/v2/workspace')).toBe('https://atelier-nox.labofscents.org/v2/workspace')
    expect(trustedWorkspaceRedirectUrl('https://custom.example.test/v2/workspace', 'labofscents.org', ['https://custom.example.test'])).toBe('https://custom.example.test/v2/workspace')
    expect(trustedWorkspaceRedirectUrl('https://example.test/v2/workspace')).toBeUndefined()
    expect(trustedWorkspaceRedirectUrl('https://atelier-nox.labofscents.org:8443/v2/workspace')).toBeUndefined()
    expect(trustedWorkspaceRedirectUrl('https://user@atelier-nox.labofscents.org/v2/workspace')).toBeUndefined()
    expect(trustedWorkspaceRedirectUrl('javascript:alert(1)')).toBeUndefined()
  })

  it('allows only explicit HTTPS custom workspace origins from browser runtime configuration', () => {
    expect(workspaceRedirectOriginsFromRuntime('https://custom.example.test, https://user@unsafe.example.test, http://unsafe.example.test')).toEqual(['https://custom.example.test'])
    expect(workspaceRedirectOriginsFromRuntime(undefined)).toEqual([])
  })
})
