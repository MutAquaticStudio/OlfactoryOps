import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Get, Headers, Param, Post, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ScientificFeatureService } from '../../../services/scientific/src/service.js'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformContext } from '../../../services/platform/src/types.js'

function cookieValue(request: FastifyRequest, name: string) {
  const item = (request.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined
}

function requestHost(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-host']
  return (typeof forwarded === 'string' ? forwarded : request.headers.host ?? 'localhost').split(',')[0]?.split(':')[0]?.toLowerCase() ?? 'localhost'
}

function requestOriginAllowed(request: FastifyRequest) {
  const origin = request.headers.origin
  if (!origin) return true
  return new Set([`https://${requestHost(request)}`, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']).has(origin)
}

@Catch(PlatformError)
class ScientificErrorFilter implements ExceptionFilter {
  catch(error: PlatformError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } })
  }
}

@Controller('v2/scientific')
@UseFilters(ScientificErrorFilter)
export class V2ScientificController {
  constructor(private readonly platform: PlatformService, private readonly scientific: ScientificFeatureService) {}

  @Post('materials/:id/structure')
  async normalize(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { job: await this.scientific.normalizeMaterial(context, id, body, key) }
  }

  @Post('materials/:id/features')
  async features(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { job: await this.scientific.generateFeatures(context, id, body, key) }
  }

  @Get('materials/:id/artifacts')
  async artifacts(@Req() request: FastifyRequest, @Param('id') id: string) {
    return { artifacts: await this.scientific.materialArtifacts((await this.context(request)).context, id) }
  }

  @Get('jobs/:id')
  async job(@Req() request: FastifyRequest, @Param('id') id: string) {
    return { job: await this.scientific.job((await this.context(request)).context, id) }
  }

  private async context(request: FastifyRequest) {
    if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401)
    return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request))
  }

  private async mutateGuard(request: FastifyRequest, context: PlatformContext, csrf?: string) {
    if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403)
    await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf)
  }
}
