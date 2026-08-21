import { Controller, Get } from '@nestjs/common'
import { releaseMetadata } from '../../../src/data/release.js'

function localReleaseMetadata() {
  return releaseMetadata({
    fullGitSha: process.env.RELEASE_GIT_SHA,
    buildTimestampUtc: process.env.RELEASE_BUILD_TIMESTAMP_UTC,
    environment: process.env.RELEASE_ENVIRONMENT ?? 'local',
  })
}

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      ok: true,
      service: 'olfactoryops-api',
      release: localReleaseMetadata(),
      timestamp: new Date().toISOString(),
    }
  }

  @Get('version')
  version() {
    return {
      name: 'OlfactoryOps API',
      stack: ['NestJS', 'Fastify', 'TypeScript'],
      api: '/api/v1',
      release: localReleaseMetadata(),
    }
  }
}
