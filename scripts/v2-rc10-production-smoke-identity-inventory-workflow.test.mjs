import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/v2-rc10-production-smoke-identity-inventory.yml', 'utf8')

describe('RC10 production smoke identity inventory workflow', () => {
  it('is dispatch-only, main-only, exact RC10, and protected by production', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain('RC10_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd')
    expect(workflow).toContain('RC10_TAG: v2-production-rc10')
    expect(workflow).toContain('environment: production')
    expect(workflow).toContain('INSPECT_RC10_PRODUCTION_SMOKE_IDENTITY')
    expect(workflow).toContain('ref: ${{ needs.validate.outputs.release_sha }}')
  })

  it('uses only the protected database secret for one read-only inventory script', () => {
    const inventoryStart = workflow.indexOf(
      '- name: Inspect aggregate smoke-tenant availability with a read-only database session',
    )
    const cleanupStart = workflow.indexOf('- name: Remove runner-local inventory evidence', inventoryStart)

    expect(inventoryStart).toBeGreaterThanOrEqual(0)
    expect(cleanupStart).toBeGreaterThan(inventoryStart)
    const inventory = workflow.slice(inventoryStart, cleanupStart)
    expect(inventory).toContain('PRODUCTION_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}')
    expect(inventory).toContain('node ops/scripts/inspect-v2-rc10-production-smoke-identity.mjs')
    expect(inventory).not.toMatch(/(PASSWORD|EMAIL|PLATFORM_OWNER_BOOTSTRAP_EMAIL|CLOUDFLARE)/)
  })

  it('does not contain deployment, route, user, or database mutation commands', () => {
    expect(workflow).not.toMatch(/wrangler\s+(deploy|pages|delete|secret)/i)
    expect(workflow).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/)
    expect(workflow).not.toMatch(/(INSERT|UPDATE|ALTER|CREATE|DROP)\b/i)
    expect(workflow).not.toContain('PRODUCTION_SMOKE_LOGIN_')
  })
})
