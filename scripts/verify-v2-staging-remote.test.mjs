import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('remote staging verifier liveness boundary', () => {
  it('bounds fixture database operations and reports only safe phase evidence', () => {
    const source = readFileSync('scripts/verify-v2-staging-remote.mjs', 'utf8')

    expect(source).toContain('connectionTimeoutMillis: 10_000')
    expect(source).toContain('query_timeout: 30_000')
    expect(source).toContain('statement_timeout: 30_000')
    expect(source).toContain('lock_timeout: 10_000')
    expect(source).toContain('function reportPhase(phase)')
    expect(source).toContain("phase = 'SIGNUP_TENANT_A'")
    expect(source).toContain("remoteStagingFailure: { phase, category: postgresFailureCategory(error) }")
  })
})
