import packageJson from '../../package.json'
import { describe, expect, it } from 'vitest'
import { releaseHeaders, releaseIdentity, releaseMetadata } from './release'

describe('release identity', () => {
  it('keeps the published package version aligned with the source identity', () => {
    expect(packageJson.version).toBe(releaseIdentity.applicationVersion)
    expect(releaseIdentity.applicationVersion).not.toBe('0.0.0')
  })

  it('normalizes public provenance without exposing configuration', () => {
    const metadata = releaseMetadata({
      fullGitSha: '356b4e078247dcb6bed6a8a7a9b6e64de6afa141',
      buildTimestampUtc: '2026-08-05T00:00:00Z',
      environment: 'TEST',
    })

    expect(metadata).toMatchObject({
      applicationVersion: '0.1.0-rc.1',
      fullGitSha: '356b4e078247dcb6bed6a8a7a9b6e64de6afa141',
      environment: 'test',
    })
    expect(releaseHeaders(metadata)).toMatchObject({
      'X-OlfactoryOps-Version': '0.1.0-rc.1',
      'X-OlfactoryOps-Environment': 'test',
    })
  })

  it('does not present malformed build provenance as verified', () => {
    expect(releaseMetadata({ fullGitSha: 'secret', buildTimestampUtc: 'not-a-date' })).toMatchObject({
      fullGitSha: 'unverified',
      buildTimestampUtc: 'unverified',
      environment: 'unknown',
    })
  })
})
