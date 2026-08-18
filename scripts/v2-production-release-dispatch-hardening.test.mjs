import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/v2-production-release-dispatch.yml', 'utf8')
const resolver = readFileSync('scripts/resolve-v2-production-pages-origin.mjs', 'utf8')

describe('production dispatcher hardening', () => {
  it('is main-only and exact-RC10/readiness-tag gated', () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain("github.ref_type == 'branch'")
    expect(workflow).toContain('ACTIVE_RC_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd')
    expect(workflow).toContain('ACTIVE_RC_TAG: v2-production-rc10')
    expect(workflow).toContain('READINESS_TAG: v2-production-ready')
    expect(workflow).toContain('test "$(git rev-list -n 1 "$READINESS_TAG")" = "$ACTIVE_RC_SHA"')
    expect(workflow).not.toContain('git merge-base --is-ancestor')
    expect(workflow).not.toContain('git tag --contains')
  })

  it('uses a main-owned V2 smoke with an exact RC10 checkout', () => {
    const smoke = workflow.slice(workflow.indexOf('  smoke-production:'))
    expect(smoke).toContain('path: ops')
    expect(smoke).toContain('ref: refs/heads/main')
    expect(smoke).toContain('path: release')
    expect(smoke).toContain('node ops/scripts/verify-v2-production-public-smoke.mjs')
    expect(smoke).not.toContain('test:qa:production-smoke')
    expect(smoke).not.toContain('npm ci')
  })

  it('never feeds the candidate Pages origin to production Router deployment', () => {
    const router = workflow.slice(workflow.indexOf('  deploy-production-tenant-router:'), workflow.indexOf('  deploy-production-pages:'))
    expect(router).toContain('resolve-v2-production-pages-origin.mjs')
    expect(resolver).toContain('PAGES_PRODUCTION_FIVE_ROUTES=PASS')
    expect(router).not.toContain('PRODUCTION_CANDIDATE_PAGES_ORIGIN')
    expect(router).not.toContain('production-candidate.${')
  })
})
