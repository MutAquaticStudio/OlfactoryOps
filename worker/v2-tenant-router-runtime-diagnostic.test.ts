import { describe, expect, it } from 'vitest'
import {
  createCandidateRuntimeDiagnostic,
  normalizedDiagnosticFixtureHostname,
  resolverHealth,
  runtimeDiagnosticExecutionPass,
  runtimeDiagnosticFromRow,
} from './v2-tenant-router-runtime-diagnostic.js'

const targetReleaseSha = '5985834a0e14728c81c8c028a72122ded544bd6b'
const expectedDatabaseSha = 'a'.repeat(64)
const row = {
  databaseName: 'postgres',
  currentUserMatchesExpected: true,
  sessionUserMatchesExpected: true,
  directHostnameVisible: false,
  directOrganizationVisible: false,
  resolverResult: true,
  workspaceHostnamesRlsEnabled: true,
  workspaceHostnamesForceRls: true,
  organizationsRlsEnabled: true,
  organizationsForceRls: true,
  resolverSecurityDefiner: true,
  functionOwnerOwnsWorkspaceHostnames: true,
  functionOwnerOwnsOrganizations: true,
  functionOwnerIsSuperuser: false,
  functionOwnerBypassRls: false,
  functionOwnerForceRlsConstrained: true,
  runtimeExecuteGranted: true,
  requestHostnameContextPresent: false,
  organizationContextPresent: false,
  userContextPresent: false,
}

describe('candidate tenant-router runtime diagnostic', () => {
  it('accepts one exact fixture hostname only', () => {
    expect(normalizedDiagnosticFixtureHostname('RC2-RELEASE-315960213001.next.labofscents.org.')).toBe('rc2-release-315960213001.next.labofscents.org')
    expect(normalizedDiagnosticFixtureHostname('router.next.labofscents.org')).toBe('router.next.labofscents.org')
    expect(normalizedDiagnosticFixtureHostname('nested.router.next.labofscents.org')).toBeNull()
    expect(normalizedDiagnosticFixtureHostname('router.labofscents.org')).toBeNull()
  })

  it('separates a healthy resolver from the generic diagnostic execution contract', () => {
    const diagnostic = runtimeDiagnosticFromRow(row, expectedDatabaseSha, expectedDatabaseSha, targetReleaseSha)
    expect(diagnostic).toMatchObject({
      hyperdriveConnectionReachable: true,
      hyperdriveProductionDatabaseMatch: true,
      runtimeDirectHostnameVisible: false,
      runtimeDirectOrganizationVisible: false,
      runtimeResolverResult: true,
      functionOwnerForceRlsConstrained: true,
      runtimeRequestHostnameContextPresent: false,
    })
    expect(runtimeDiagnosticExecutionPass(diagnostic)).toBe(true)
    expect(resolverHealth(diagnostic)).toBe('PASS')
  })

  it('retains full evidence when the resolver is the failed diagnostic subject', () => {
    const diagnostic = runtimeDiagnosticFromRow({ ...row, resolverResult: false }, expectedDatabaseSha, expectedDatabaseSha, targetReleaseSha)
    expect(runtimeDiagnosticExecutionPass(diagnostic)).toBe(true)
    expect(resolverHealth(diagnostic)).toBe('FAIL')
    expect(diagnostic.runtimeResolverResult).toBe(false)
    expect(diagnostic.functionOwnerForceRlsConstrained).toBe(true)
  })

  it('does not turn an unconfigured database identity into a pass', () => {
    const diagnostic = runtimeDiagnosticFromRow(row, expectedDatabaseSha, 'b'.repeat(64), targetReleaseSha)
    expect(diagnostic.hyperdriveProductionDatabaseMatch).toBe(false)
    expect(runtimeDiagnosticExecutionPass(diagnostic)).toBe(false)
  })

  it('requires the ephemeral internal diagnostic token and never exposes it', async () => {
    const inspector = async () => runtimeDiagnosticFromRow(row, expectedDatabaseSha, expectedDatabaseSha, targetReleaseSha)
    const worker = createCandidateRuntimeDiagnostic(inspector)
    const env = {
      HYPERDRIVE: {} as Hyperdrive,
      CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN: 'test-only-secret',
      DIAGNOSTIC_FIXTURE_HOSTNAME: 'rc2-release-315960213001.next.labofscents.org',
      TARGET_RELEASE_SHA: targetReleaseSha,
      V2_EXPECTED_DATABASE_NAME_SHA: expectedDatabaseSha,
      V2_RUNTIME_DB_ROLE: 'hyperdrive_user',
    }
    expect((await worker.fetch(new Request('https://diagnostic.example/'), env)).status).toBe(404)
    expect((await worker.fetch(new Request('https://diagnostic.example/', { headers: { 'x-olfactoryops-candidate-runtime-diagnostic': 'wrong' } }), env)).status).toBe(404)

    const response = await worker.fetch(new Request('https://diagnostic.example/', { headers: { 'x-olfactoryops-candidate-runtime-diagnostic': 'test-only-secret' } }), env)
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ candidateRuntimeDiagnostic: 'COMPLETE', targetReleaseSha, hyperdriveProductionDatabaseMatch: true })
    expect(JSON.stringify(body)).not.toContain('test-only-secret')
    expect(JSON.stringify(body)).not.toContain('postgres')
    expect(JSON.stringify(body)).not.toContain('hyperdrive_user')
    expect(JSON.stringify(body)).not.toContain('org_rc2_release')
    expect(JSON.stringify(body)).not.toContain('fixture@example.test')
  })
})
