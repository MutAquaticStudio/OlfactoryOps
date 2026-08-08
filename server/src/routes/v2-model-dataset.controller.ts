import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Get, Headers, Param, Post, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ModelDatasetService } from '../../../services/scientific/src/model-dataset-service.js'
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
class ModelDatasetErrorFilter implements ExceptionFilter {
  catch(error: PlatformError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } })
  }
}

@Controller('v2/model-dataset')
@UseFilters(ModelDatasetErrorFilter)
export class V2ModelDatasetController {
  constructor(private readonly platform: PlatformService, private readonly registry: ModelDatasetService) {}

  @Get('datasets')
  async datasets(@Req() request: FastifyRequest) {
    return { datasets: await this.registry.listDatasets((await this.context(request)).context) }
  }

  @Post('datasets')
  async createDataset(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { dataset: await this.registry.createDataset(context, body, key) }
  }

  @Get('datasets/:id')
  async dataset(@Req() request: FastifyRequest, @Param('id') id: string) {
    return { dataset: await this.registry.datasetDetail((await this.context(request)).context, id) }
  }

  @Post('datasets/:id/versions')
  async registerDatasetVersion(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { version: await this.registry.registerDatasetVersion(context, id, body, key) }
  }

  @Post('dataset-versions/:id/approve')
  async approveDatasetVersion(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { version: await this.registry.approveDatasetVersion(context, id, key) }
  }

  @Get('models')
  async models(@Req() request: FastifyRequest) {
    return { models: await this.registry.listModels((await this.context(request)).context) }
  }

  @Post('models')
  async createModel(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { model: await this.registry.createModel(context, body, key) }
  }

  @Post('models/:id/versions')
  async registerModelVersion(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { version: await this.registry.registerModelVersion(context, id, body, key) }
  }

  @Post('model-versions/:id/training-runs')
  async createTrainingRun(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { trainingRun: await this.registry.createTrainingRun(context, id, body, key) }
  }

  @Post('training-runs/:id/evaluations')
  async recordEvaluation(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutateGuard(request, context, csrf)
    return { evaluation: await this.registry.recordEvaluation(context, id, body, key) }
  }

  @Get('model-versions/:id/runtime')
  async runtimeStatus(@Req() request: FastifyRequest, @Param('id') id: string) {
    return { runtime: await this.registry.runtimeStatus((await this.context(request)).context, id) }
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
