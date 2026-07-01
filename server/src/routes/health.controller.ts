import { Controller, Get } from '@nestjs/common'

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      ok: true,
      service: 'olfactoryops-api',
      version: '0.1.0-north-star',
      timestamp: new Date().toISOString(),
    }
  }

  @Get('version')
  version() {
    return {
      name: 'OlfactoryOps North Star API',
      stack: ['NestJS', 'Fastify', 'TypeScript'],
      api: '/api/v1',
    }
  }
}
