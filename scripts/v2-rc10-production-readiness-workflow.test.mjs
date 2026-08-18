import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/v2-rc10-production-readiness.yml', 'utf8')

describe('RC10 readiness workflow', () => {
  it('is dispatch-only, main-only, exact-RC10, and read-mostly', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain('RC10_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd')
    expect(workflow).toContain('RC9_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7')
    expect(workflow).toContain('PRODUCTION_BACKUP_READY=NO')
    expect(workflow).toContain('PRODUCTION_ROLLBACK_READY=PASS')
    expect(workflow).toContain('PRODUCTION_RUNTIME_PRIVILEGES=PASS')
    expect(workflow).toContain('PLATFORM_OWNER_READY=PASS')
    expect(workflow).toContain('PRODUCTION_READY=YES')
    expect(workflow).toContain('v2-production-ready')
  })

  it('does not contain public deployment commands', () => {
    expect(workflow).not.toMatch(/wrangler\s+(deploy|pages)/i)
    expect(workflow).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/)
    expect(workflow).not.toContain('PRODUCTION_DATABASE_URL >>')
    expect(workflow).toContain('git -C release diff --quiet "$RC9_SHA" "$RELEASE_SHA"')
  })
})
