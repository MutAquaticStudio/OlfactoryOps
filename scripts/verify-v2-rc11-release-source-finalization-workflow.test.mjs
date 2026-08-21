import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('RC11 release-source finalization workflow', () => {
  it('keeps source tagging main-owned, production-gated, and deployment-free', () => {
    expect(execFileSync(process.execPath, ['scripts/verify-v2-rc11-release-source-finalization-workflow.mjs'], { encoding: 'utf8' })).toContain('RC11_RELEASE_SOURCE_FINALIZATION_WORKFLOW=PASS')
  })
})
