import { expect, test } from 'vitest'
import { candidateBrowserApiProbeUrl, candidateBrowserPaths, candidateBrowserProbeIsExpected, safeBrowserFailure, verifyProductionCandidateBrowser } from './verify-v2-production-candidate-browser.mjs'

test('candidate browser probe uses only the exact isolated tenant routes and API origin', () => {
  expect(candidateBrowserPaths).toEqual(['/', '/login', '/signup', '/v2/login', '/v2/signup'])
  expect(candidateBrowserPaths).not.toContain('https://next.labofscents.org')
  expect(candidateBrowserApiProbeUrl('https://api-next.labofscents.org')).toBe('https://api-next.labofscents.org/api/v1/v2/platform/me')
  expect(candidateBrowserProbeIsExpected({ url: 'https://api-next.labofscents.org/api/v1/v2/platform/me', status: 401 }, 'https://api-next.labofscents.org/api/v1/v2/platform/me')).toBe(true)
  expect(candidateBrowserProbeIsExpected({ url: 'https://api.labofscents.org/api/v1/v2/platform/me', status: 401 }, 'https://api-next.labofscents.org/api/v1/v2/platform/me')).toBe(false)
})

test('candidate browser rejects the wrong profile before importing or launching Playwright', async () => {
  await expect(verifyProductionCandidateBrowser({
    V2_PRODUCTION_CANDIDATE_ACCEPTANCE_APPROVED: 'RUN_V2_PRODUCTION_CANDIDATE_ACCEPTANCE',
    V2_PRODUCTION_CANDIDATE_PROFILE: 'staging',
  })).rejects.toThrow('PRODUCTION_CANDIDATE_ACCEPTANCE=BLOCKED CANDIDATE_PROFILE_INVALID')
  expect(safeBrowserFailure(new Error('websocket transport failed for release-fixture.next.labofscents.org')).message).toBe('PRODUCTION_CANDIDATE_BROWSER=FAIL BROWSER')
})
