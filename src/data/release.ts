export const releaseIdentity = Object.freeze({
  applicationVersion: '0.1.0-rc.1',
  releaseChannel: 'release-candidate',
  migrationHead: '0044',
})

export type ReleaseEnvironment = 'local' | 'test' | 'production' | 'unknown'

export type ReleaseMetadata = typeof releaseIdentity & {
  fullGitSha: string
  buildTimestampUtc: string
  environment: ReleaseEnvironment
}

type ReleaseMetadataInput = {
  fullGitSha?: string
  buildTimestampUtc?: string
  environment?: string
}

const shaPattern = /^[a-f0-9]{7,64}$/i

export function releaseMetadata(input: ReleaseMetadataInput = {}): ReleaseMetadata {
  return {
    ...releaseIdentity,
    fullGitSha: shaPattern.test(input.fullGitSha?.trim() ?? '') ? input.fullGitSha!.trim().toLowerCase() : 'unverified',
    buildTimestampUtc: normalizeBuildTimestamp(input.buildTimestampUtc),
    environment: normalizeEnvironment(input.environment),
  }
}

export function releaseHeaders(metadata: ReleaseMetadata): Record<string, string> {
  return {
    'X-OlfactoryOps-Version': metadata.applicationVersion,
    'X-OlfactoryOps-Git-SHA': metadata.fullGitSha,
    'X-OlfactoryOps-Environment': metadata.environment,
  }
}

function normalizeBuildTimestamp(value: string | undefined) {
  if (!value) return 'unverified'
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 'unverified' : new Date(parsed).toISOString()
}

function normalizeEnvironment(value: string | undefined): ReleaseEnvironment {
  switch (value?.trim().toLowerCase()) {
    case 'local':
    case 'test':
    case 'production':
      return value.trim().toLowerCase() as ReleaseEnvironment
    default:
      return 'unknown'
  }
}
