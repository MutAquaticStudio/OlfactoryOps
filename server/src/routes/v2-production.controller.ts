import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Get, Headers, Param, Post, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import { ProductionService } from '../../../services/production/src/production-service.js'
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
  return typeof origin === 'string' && new Set([
    `https://${requestHost(request)}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ]).has(origin)
}

@Catch(PlatformError)
class ProductionErrorFilter implements ExceptionFilter {
  catch(error: PlatformError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } })
  }
}

/**
 * The controller is deliberately thin. The Production service owns state
 * transitions, release gates, audit evidence, and all cross-tenant checks.
 */
@Controller('v2/production')
@UseFilters(ProductionErrorFilter)
export class V2ProductionController {
  constructor(private readonly platform: PlatformService, private readonly production: ProductionService) {}

  @Get()
  async list(@Req() request: FastifyRequest) { return { orders: await this.production.listOrders((await this.context(request)).context) } }

  @Get('formula-versions')
  async formulaVersions(@Req() request: FastifyRequest) { return { versions: await this.production.approvedFormulaVersions((await this.context(request)).context) } }

  @Post()
  async create(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { order: await this.production.createOrder(context, body, key) }
  }

  @Get('finished-goods/:finishedGoodLotId/genealogy')
  async genealogy(@Req() request: FastifyRequest, @Param('finishedGoodLotId') finishedGoodLotId: string) {
    return { genealogy: await this.production.finishedGoodGenealogy((await this.context(request)).context, finishedGoodLotId) }
  }

  @Get('finished-goods')
  async finishedGoods(@Req() request: FastifyRequest) {
    return { finishedGoodLots: await this.production.listFinishedGoodLots((await this.context(request)).context) }
  }

  @Post('finished-goods/:finishedGoodLotId/quality-hold')
  async holdFinishedGood(
    @Req() request: FastifyRequest,
    @Param('finishedGoodLotId') finishedGoodLotId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
    @Headers('x-csrf-token') csrf?: string,
  ) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { hold: await this.production.holdFinishedGoodLot(context, finishedGoodLotId, body, key) }
  }

  @Get(':id')
  async detail(@Req() request: FastifyRequest, @Param('id') id: string) { return this.production.detail((await this.context(request)).context, id) }

  @Post(':id/plan')
  async plan(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { order: await this.production.planOrder(context, id, body, key) }
  }

  @Post(':id/cancel')
  async cancel(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { order: await this.production.cancelOrder(context, id, body, key) }
  }

  @Post(':id/close')
  async close(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { order: await this.production.closeOrder(context, id, body, key) }
  }

  @Get(':id/allocations/suggestions')
  async suggestions(@Req() request: FastifyRequest, @Param('id') id: string) {
    return { suggestions: await this.production.allocationSuggestions((await this.context(request)).context, id) }
  }

  @Post(':id/allocations')
  async allocate(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { allocations: await this.production.allocateMaterials(context, id, body, key) }
  }

  @Post(':id/weighing')
  async startWeighing(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { weighing: await this.production.startWeighing(context, id, body, key) }
  }

  @Post(':id/weighing/:sessionId/confirm')
  async confirmWeighing(@Req() request: FastifyRequest, @Param('id') id: string, @Param('sessionId') sessionId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { weighing: await this.production.confirmWeighing(context, id, sessionId, body, key) }
  }

  @Post(':id/usages/:usageId/reverse')
  async reverseUsage(@Req() request: FastifyRequest, @Param('id') id: string, @Param('usageId') usageId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { correction: await this.production.reverseMaterialUsage(context, id, usageId, body, key) }
  }

  @Post(':id/stages/:stage/start')
  async startStage(@Req() request: FastifyRequest, @Param('id') id: string, @Param('stage') stage: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { stage: await this.production.startStage(context, id, stage, body, key) }
  }

  @Post(':id/stages/:stage/complete')
  async completeStage(@Req() request: FastifyRequest, @Param('id') id: string, @Param('stage') stage: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { stage: await this.production.completeStage(context, id, stage, body, key) }
  }

  @Post(':id/yield')
  async yield(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { yield: await this.production.recordYield(context, id, body, key) }
  }

  @Post(':id/qc/specifications')
  async qcSpecification(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { specification: await this.production.createQcSpecification(context, id, body, key) }
  }

  @Post(':id/qc/results')
  async qcResult(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { result: await this.production.recordQcResult(context, id, body, key) }
  }

  @Post(':id/qc/results/:resultId/approve')
  async approveQcResult(@Req() request: FastifyRequest, @Param('id') id: string, @Param('resultId') resultId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { result: await this.production.approveQcResult(context, id, resultId, body, key) }
  }

  @Post(':id/deviations')
  async deviation(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { deviation: await this.production.recordDeviation(context, id, body, key) }
  }

  @Post(':id/deviations/:deviationId/resolve')
  async resolveDeviation(@Req() request: FastifyRequest, @Param('id') id: string, @Param('deviationId') deviationId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { deviation: await this.production.resolveDeviation(context, id, deviationId, body, key) }
  }

  @Post(':id/deviations/:deviationId/capa')
  async capa(@Req() request: FastifyRequest, @Param('id') id: string, @Param('deviationId') deviationId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { capa: await this.production.createCapaAction(context, id, deviationId, body, key) }
  }

  @Post(':id/deviations/:deviationId/capa/:capaId/complete')
  async completeCapa(@Req() request: FastifyRequest, @Param('id') id: string, @Param('deviationId') deviationId: string, @Param('capaId') capaId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { capa: await this.production.completeCapaAction(context, id, deviationId, capaId, body, key) }
  }

  @Post(':id/deviations/:deviationId/capa/:capaId/verify')
  async verifyCapa(@Req() request: FastifyRequest, @Param('id') id: string, @Param('deviationId') deviationId: string, @Param('capaId') capaId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { capa: await this.production.verifyCapaAction(context, id, deviationId, capaId, body, key) }
  }

  @Post(':id/rework')
  async rework(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { rework: await this.production.startRework(context, id, body, key) }
  }

  @Post(':id/rework/:reworkId/complete')
  async completeRework(@Req() request: FastifyRequest, @Param('id') id: string, @Param('reworkId') reworkId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { rework: await this.production.completeRework(context, id, reworkId, body, key) }
  }

  @Post(':id/hold')
  async hold(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { order: await this.production.placeOnHold(context, id, body, key) }
  }

  @Post(':id/resume')
  async resume(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { order: await this.production.resumeFromHold(context, id, body, key) }
  }

  @Post(':id/release')
  async release(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { release: await this.production.releaseOrder(context, id, body, key) }
  }

  @Get(':id/documents')
  async documents(@Req() request: FastifyRequest, @Param('id') id: string) {
    return { documents: await this.production.documents((await this.context(request)).context, id) }
  }

  @Post(':id/documents')
  async snapshotDocument(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) {
    const { context } = await this.context(request); await this.mutation(request, context, csrf)
    return { document: await this.production.createDocumentSnapshot(context, id, body, key) }
  }

  private async context(request: FastifyRequest) {
    if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401)
    return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request))
  }

  private async mutation(request: FastifyRequest, context: PlatformContext, csrf?: string) {
    if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403)
    await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf)
  }
}
