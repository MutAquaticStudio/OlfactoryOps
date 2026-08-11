import { describe, expect, it } from 'vitest'
import { isStagingSystemHostname, normalizedHost } from './v2-tenant-router.js'

describe('V2 staging tenant router hostname guard', () => {
  it('accepts exactly one system workspace label under the staging base domain', () => {
    expect(isStagingSystemHostname('studio.api-beta.labofscents.org', 'api-beta.labofscents.org')).toBe(true)
    expect(isStagingSystemHostname('studio.eu.api-beta.labofscents.org', 'api-beta.labofscents.org')).toBe(false)
    expect(isStagingSystemHostname('api-beta.labofscents.org', 'api-beta.labofscents.org')).toBe(false)
    expect(isStagingSystemHostname('studio.beta.labofscents.org', 'api-beta.labofscents.org')).toBe(false)
  })

  it('normalizes only the request host representation', () => {
    expect(normalizedHost('STUDIO.api-beta.labofscents.org.:443')).toBe('studio.api-beta.labofscents.org')
  })
})
