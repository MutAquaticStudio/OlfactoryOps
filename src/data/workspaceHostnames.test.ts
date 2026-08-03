import { describe, expect, it } from 'vitest'
import {
  isExactHttpsOriginForHostname,
  isReservedWorkspaceSlug,
  isSystemWorkspaceHostname,
  isWorkspaceSlugEligibleForHostname,
  systemWorkspaceHostname,
  workspaceUrlForHostname,
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
})
