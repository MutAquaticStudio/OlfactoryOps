import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('staging scientific canary contract', () => {
  const source = readFileSync('scripts/verify-v2-staging-scientific-canary.mjs', 'utf8')

  it('requires exact staging approval, hosts, a non-loopback database, and deployed SHA', () => {
    expect(source).toContain("RUN_ONE_RC6_SCIENTIFIC_CANARY")
    expect(source).toContain("api.hostname !== 'api-beta.labofscents.org'")
    expect(source).toContain("publicPagesHost !== 'beta.labofscents.org'")
    expect(source).toContain("workspaceBaseDomain !== 'api-beta.labofscents.org'")
    expect(source).toContain("body?.releaseGitSha === expectedSha")
    expect(source).toContain("non_loopback_staging_postgres_required")
  })

  it('dispatches exactly one API scientific job and archives the isolated fixture', () => {
    expect(source).toContain("scientific-canary-features-${suffix}")
    expect(source).toContain("const jobId = queued.body?.job?.id")
    expect(source).not.toContain('Promise.all([queueFeatures')
    expect(source).toContain("STAGING_SCIENTIFIC_CANARY_ARCHIVED")
    expect(source).toContain("jobs: 1")
  })

  it('uses the ordinary API path and validates Queue, Workflow, Container, and R2 evidence', () => {
    expect(source).toContain("/v2/scientific/materials/${encodeURIComponent(fixture.materialId)}/features")
    expect(source).toContain("dispatch_status === 'SUCCEEDED'")
    expect(source).toContain("scientific_status === 'SUCCEEDED'")
    expect(source).toContain("artifact_count) >= 3")
    expect(source).toContain("r2Result: 'PASS'")
  })
})
