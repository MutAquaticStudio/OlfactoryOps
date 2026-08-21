import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('remote staging scientific verifier contract', () => {
  it('requires explicit approval and exercises three isolated jobs across two tenants', () => {
    const source = readFileSync('scripts/verify-v2-staging-scientific.mjs', 'utf8')
    expect(source).toContain("V2_STAGING_SCIENTIFIC_APPROVED")
    expect(source).toContain("RUN_REMOTE_SCIENTIFIC_E2E")
    expect(source).toContain("Promise.all([queueFeatures(first, 'lane-1'), queueFeatures(first, 'lane-2'), queueFeatures(second, 'lane-3')])")
    expect(source).toContain('scientific_parallel_result_reference_tenant_scope_invalid')
    expect(source).toContain('scientific_parallel_result_reference_dedupe_invalid')
    expect(source).toContain('scientific_parallel_result_reference_cross_tenant_collision')
    expect(source).toContain("tenantCount: new Set(jobs.map((job) => job.organizationId)).size")
    expect(source).toContain("remoteScientificFixtureCleanup: 'ARCHIVED', organizations: organizationIds.length")
  })

  it('keeps the remote verifier pinned to the exact staging host boundary', () => {
    const source = readFileSync('scripts/verify-v2-staging-scientific.mjs', 'utf8')
    expect(source).toContain("api.hostname !== 'api-beta.labofscents.org'")
    expect(source).toContain("publicPagesHost !== 'beta.labofscents.org'")
    expect(source).toContain("workspaceBaseDomain !== 'api-beta.labofscents.org'")
  })
})
