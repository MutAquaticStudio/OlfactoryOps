import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { RC12_SHA, candidateAcceptanceConfig, candidateBrowserConfig, generatedWorkspaceRedirectMatches, safeExecutionFailure, verifyProductionCandidateAcceptance } from './verify-v2-rc12-production-candidate-acceptance.mjs'

const validEnvironment = {
  V2_PRODUCTION_CANDIDATE_ACCEPTANCE_APPROVED: 'RUN_V2_PRODUCTION_CANDIDATE_ACCEPTANCE',
  V2_PRODUCTION_CANDIDATE_PROFILE: 'production-candidate',
  PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL: 'postgresql://candidate:fixture@db.example.invalid:6543/candidate',
  V2_PRODUCTION_CANDIDATE_API_ORIGIN: 'https://api-next.labofscents.org',
  V2_PRODUCTION_CANDIDATE_WORKSPACE_BASE_DOMAIN: 'next.labofscents.org',
  V2_PRODUCTION_CANDIDATE_TENANT_URL: 'https://release-fixture.next.labofscents.org',
  V2_PRODUCTION_CANDIDATE_EXPECTED_SHA: RC12_SHA,
  V2_PRODUCTION_CANDIDATE_FIXTURE_MODE: 'GENERATED_ISOLATED',
}

test('candidate acceptance config permits only the fixed isolated origins', () => {
  const config = candidateAcceptanceConfig(validEnvironment)

  expect(config.api.origin).toBe('https://api-next.labofscents.org')
  expect(config.tenant.origin).toBe('https://release-fixture.next.labofscents.org')
  expect(config.profile).toBe('production-candidate')
  expect(config.expectedSha).toBe(RC12_SHA)
})

test('candidate acceptance refuses incomplete approval and fixture configuration before network access', () => {
  for (const [name, value] of [
    ['V2_PRODUCTION_CANDIDATE_ACCEPTANCE_APPROVED', ''],
    ['V2_PRODUCTION_CANDIDATE_PROFILE', ''],
    ['PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL', ''],
    ['V2_PRODUCTION_CANDIDATE_WORKSPACE_BASE_DOMAIN', ''],
    ['V2_PRODUCTION_CANDIDATE_TENANT_URL', ''],
    ['V2_PRODUCTION_CANDIDATE_EXPECTED_SHA', ''],
    ['V2_PRODUCTION_CANDIDATE_FIXTURE_MODE', ''],
  ]) {
    expect(() => candidateAcceptanceConfig({ ...validEnvironment, [name]: value })).toThrow('PRODUCTION_CANDIDATE_ACCEPTANCE=BLOCKED')
  }
})

test('candidate browser profile uses the same fixed targets without accepting a database credential', () => {
  const { PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL: _databaseUrl, ...browserEnvironment } = validEnvironment
  const config = candidateBrowserConfig(browserEnvironment)

  expect(config.databaseUrl).toBeUndefined()
  expect(config.api.hostname).toBe('api-next.labofscents.org')
  expect(config.tenant.hostname).toBe('release-fixture.next.labofscents.org')
})

test('candidate acceptance rejects arbitrary API, tenant, database, and revision targets', () => {
  for (const changes of [
    { V2_PRODUCTION_CANDIDATE_PROFILE: 'production' },
    { V2_PRODUCTION_CANDIDATE_FIXTURE_MODE: 'REUSED' },
    { V2_PRODUCTION_CANDIDATE_API_ORIGIN: 'https://api.labofscents.org' },
    { V2_PRODUCTION_CANDIDATE_API_ORIGIN: 'https://api-next.labofscents.org/api/v1' },
    { V2_PRODUCTION_CANDIDATE_API_ORIGIN: 'https://api-next.labofscents.org:443' },
    { V2_PRODUCTION_CANDIDATE_WORKSPACE_BASE_DOMAIN: 'labofscents.org' },
    { V2_PRODUCTION_CANDIDATE_WORKSPACE_BASE_DOMAIN: 'NEXT.LABOFSCENTS.ORG' },
    { V2_PRODUCTION_CANDIDATE_TENANT_URL: 'https://next.labofscents.org' },
    { V2_PRODUCTION_CANDIDATE_TENANT_URL: 'https://fixture.other.labofscents.org' },
    { V2_PRODUCTION_CANDIDATE_TENANT_URL: 'https://release-fixture.next.labofscents.org/not-an-origin' },
    { PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL: 'postgresql://candidate:fixture@127.0.0.1/candidate' },
    { V2_PRODUCTION_CANDIDATE_EXPECTED_SHA: 'not-a-release-sha' },
    { V2_PRODUCTION_CANDIDATE_EXPECTED_SHA: '98cfac77853ffb0b6b69235bb3483117dc3b6961' },
  ]) {
    expect(() => candidateAcceptanceConfig({ ...validEnvironment, ...changes })).toThrow('PRODUCTION_CANDIDATE_ACCEPTANCE=BLOCKED')
  }
})

test('candidate acceptance validates the profile before a runner can access the network or database', async () => {
  await expect(verifyProductionCandidateAcceptance({ ...validEnvironment, V2_PRODUCTION_CANDIDATE_PROFILE: 'staging' }))
    .rejects.toThrow('PRODUCTION_CANDIDATE_ACCEPTANCE=BLOCKED CANDIDATE_PROFILE_INVALID')
})

test('candidate acceptance never rethrows database details or generated fixture identifiers', () => {
  const rawDatabaseFailure = Object.assign(new Error('password authentication failed for candidate-abc@candidate.invalid'), { code: '28P01' })
  const safeDatabaseFailure = safeExecutionFailure(rawDatabaseFailure)
  const stableFailure = safeExecutionFailure(new Error('PRODUCTION_CANDIDATE_ACCEPTANCE=FAIL tenant_a_list_leaked'))

  expect(safeDatabaseFailure.message).toBe('PRODUCTION_CANDIDATE_ACCEPTANCE=FAIL PG_28P01')
  expect(safeDatabaseFailure.message).not.toContain('candidate-abc')
  expect(stableFailure.message).toBe('PRODUCTION_CANDIDATE_ACCEPTANCE=FAIL tenant_a_list_leaked')
  expect(safeExecutionFailure(new Error('PRODUCTION_CANDIDATE_ACCEPTANCE=FAIL password=candidate-abc')).message).toBe('PRODUCTION_CANDIDATE_ACCEPTANCE=FAIL DATABASE')
})

test('candidate acceptance preserves an existing Platform Owner and never creates one', () => {
  const verifier = readFileSync('scripts/verify-v2-rc12-production-candidate-acceptance.mjs', 'utf8')

  expect(verifier).toContain("'REAL_PLATFORM_OWNER_PRESERVED=PASS'")
  expect(verifier).toContain("'CANDIDATE_ACCEPTANCE_MODE=POST_BOOTSTRAP'")
  expect(verifier).not.toContain("'PLATFORM_OWNER', 'ACTIVE'")
  expect(verifier).not.toContain('platformMutation(')
})

test('candidate browser configuration pins the candidate API rather than a production API origin', () => {
  const { PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL: _databaseUrl, ...browserEnvironment } = validEnvironment
  expect(candidateBrowserConfig(browserEnvironment).api.origin).toBe('https://api-next.labofscents.org')
  expect(() => candidateBrowserConfig({ ...browserEnvironment, V2_PRODUCTION_CANDIDATE_API_ORIGIN: 'https://api.labofscents.org' })).toThrow('PRODUCTION_CANDIDATE_ACCEPTANCE=BLOCKED')
})

test('generated candidate signup and login must return an exact first-party workspace redirect', () => {
  expect(generatedWorkspaceRedirectMatches('release-fixture.next.labofscents.org', 'https://release-fixture.next.labofscents.org')).toBe(true)
  expect(generatedWorkspaceRedirectMatches('release-fixture.next.labofscents.org', 'https://next.labofscents.org')).toBe(false)
  expect(generatedWorkspaceRedirectMatches('release-fixture.next.labofscents.org', 'https://production-candidate.olfactoryops-v2-production-candidate.pages.dev')).toBe(false)
})
