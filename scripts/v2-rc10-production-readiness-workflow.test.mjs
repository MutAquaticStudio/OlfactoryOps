import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/v2-rc10-production-readiness.yml', 'utf8')

describe('RC10 readiness workflow', () => {
  it('is dispatch-only, main-only, exact-RC10, and read-mostly', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain('RC10_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd')
    expect(workflow).toContain('RC9_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7')
    expect(workflow).toContain('backup_run_id:')
    expect(workflow).toContain('PRODUCTION_BACKUP_READY=PASS')
    expect(workflow).toContain('V2 RC10 Production Backup Snapshot')
    expect(workflow).toContain('PRODUCTION_ROLLBACK_READY=PASS')
    expect(workflow).toContain('PRODUCTION_RUNTIME_PRIVILEGES=PASS')
    expect(workflow).toContain('ACTIVE_PLATFORM_OWNER_COUNT=ONE')
    expect(workflow).toContain('PLATFORM_OWNER_ROLE=PASS')
    expect(workflow).toContain('PLATFORM_OWNER_STATUS_ACTIVE=PASS')
    expect(workflow).toContain('PLATFORM_OWNER_MFA_REQUIRED=PASS')
    expect(workflow).toContain('PLATFORM_OWNER_AUDIT_EVENT=PASS')
    expect(workflow).toContain('PLATFORM_OWNER_READY=PASS')
    expect(workflow).toContain('CANDIDATE_ACCEPTANCE_MODE=POST_BOOTSTRAP')
    expect(workflow).toContain('CANDIDATE_ACCEPTANCE_MODE=LEGACY_PRE_BOOTSTRAP')
    expect(workflow).toContain('REAL_PLATFORM_OWNER_PRESERVED=PASS')
    expect(workflow).toContain('PRODUCTION_READY=YES')
    expect(workflow).toContain('v2-production-ready')
  })

  it('supplies the approved first-release baseline only to the read-only rollback verifier', () => {
    const rollbackStart = workflow.indexOf(
      '- name: Verify rollback identifiers and read-only recovery surfaces',
    )
    const nextStep = workflow.indexOf(
      '- name: Verify immutable scientific image identity',
      rollbackStart,
    )

    expect(rollbackStart).toBeGreaterThanOrEqual(0)
    expect(nextStep).toBeGreaterThan(rollbackStart)
    expect(workflow.slice(rollbackStart, nextStep)).toContain(
      'PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE: ${{ vars.PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE }}',
    )
  })

  it('takes its smoke tenant target from the production Environment rather than the base domain', () => {
    const smokeTargetStart = workflow.indexOf(
      '- name: Verify the configured production smoke tenant target',
    )
    const nextStep = workflow.indexOf(
      '- name: Verify production runtime role, privileges, and RLS read-only',
      smokeTargetStart,
    )

    expect(smokeTargetStart).toBeGreaterThanOrEqual(0)
    expect(nextStep).toBeGreaterThan(smokeTargetStart)
    const smokeTarget = workflow.slice(smokeTargetStart, nextStep)
    expect(smokeTarget).toContain(
      'PRODUCTION_SMOKE_TENANT_HOSTNAME: ${{ vars.PRODUCTION_SMOKE_TENANT_HOSTNAME }}',
    )
    expect(smokeTarget).not.toContain('PRODUCTION_SMOKE_TENANT_HOSTNAME: next.labofscents.org')
  })

  it('does not contain public deployment commands', () => {
    expect(workflow).not.toMatch(/wrangler\s+(deploy|pages)/i)
    expect(workflow).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/)
    expect(workflow).not.toContain('PRODUCTION_DATABASE_URL >>')
    expect(workflow).toContain('git -C release diff --quiet "$RC9_SHA" "$RELEASE_SHA"')
  })

  it('retains repository credentials only for immutable validation and readiness-tag publication', () => {
    const validation = workflow.slice(
      workflow.indexOf('  validate-input:'),
      workflow.indexOf('  assess:'),
    )
    const readinessTag = workflow.slice(workflow.indexOf('  publish-readiness-tag:'))

    expect(validation).toContain('persist-credentials: true')
    expect(validation).toContain('git fetch --force --tags origin')
    expect(validation).not.toContain('RELEASE_BRANCH')
    expect(readinessTag).toContain('persist-credentials: true')
    expect(readinessTag).toContain('git push origin refs/tags/v2-production-ready')
    expect(workflow.match(/persist-credentials: true/g)).toHaveLength(2)
  })

  it('accepts post-bootstrap evidence only when the authoritative owner proof is complete', () => {
    const postBootstrapStart = workflow.indexOf(
      "if grep -Fq 'CANDIDATE_ACCEPTANCE_MODE=POST_BOOTSTRAP' \"$log\"; then",
    )
    const commonAcceptanceStart = workflow.indexOf(
      "grep -Fq 'CANDIDATE_BROWSER_ACCEPTANCE=PASS' \"$log\"",
      postBootstrapStart,
    )
    expect(postBootstrapStart).toBeGreaterThanOrEqual(0)
    expect(commonAcceptanceStart).toBeGreaterThan(postBootstrapStart)
    const postBootstrap = workflow.slice(postBootstrapStart, commonAcceptanceStart)

    for (const marker of [
      'REAL_PLATFORM_OWNER_PRESERVED=PASS',
      'ACTIVE_PLATFORM_OWNER_COUNT=ONE',
      'PLATFORM_OWNER_ROLE=PASS',
      'PLATFORM_OWNER_STATUS_ACTIVE=PASS',
      'PLATFORM_OWNER_MFA_REQUIRED=PASS',
      'PLATFORM_OWNER_AUDIT_EVENT=PASS',
      'PLATFORM_OWNER_READY=PASS',
    ]) {
      expect(postBootstrap).toContain(marker)
    }
  })
})
