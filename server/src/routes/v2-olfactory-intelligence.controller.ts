import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Headers, Param, Post, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { OlfactoryIntelligenceService } from '../../../services/scientific/src/olfactory-intelligence-service.js'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformContext } from '../../../services/platform/src/types.js'

function cookieValue(request: FastifyRequest, name: string) { const item = (request.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`)); return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined }
function requestHost(request: FastifyRequest) { const forwarded = request.headers['x-forwarded-host']; return (typeof forwarded === 'string' ? forwarded : request.headers.host ?? 'localhost').split(',')[0]?.split(':')[0]?.toLowerCase() ?? 'localhost' }
function requestOriginAllowed(request: FastifyRequest) { const origin = request.headers.origin; return !origin || new Set([`https://${requestHost(request)}`, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']).has(origin) }

@Catch(PlatformError)
class OlfactoryIntelligenceErrorFilter implements ExceptionFilter { catch(error: PlatformError, host: ArgumentsHost) { host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } }) } }

@Controller('v2/olfactory-intelligence')
@UseFilters(OlfactoryIntelligenceErrorFilter)
export class V2OlfactoryIntelligenceController {
  constructor(private readonly platform: PlatformService, private readonly intelligence: OlfactoryIntelligenceService) {}

  @Post('materials/:id/molecular-embeddings')
  async embedding(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { embedding: await this.intelligence.createMolecularEmbedding(context, id, body, key) } }

  @Post('materials/:id/similarity')
  async similarity(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { similarity: await this.intelligence.compareMolecularSimilarity(context, id, body, key) } }

  @Post('materials/:id/odor-predictions')
  async prediction(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { prediction: await this.intelligence.recordOdorPredictionNotEvaluated(context, id, body, key) } }

  @Post('materials/:id/explainability')
  async explain(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { explanation: await this.intelligence.explain(context, id, body, key) } }

  private async context(request: FastifyRequest) { if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401); return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request)) }
  private async mutation(request: FastifyRequest, context: PlatformContext, csrf?: string) { if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403); await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf) }
}
