import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Get, Headers, Param, Post, Query, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ConsumerIntelligenceService } from '../../../services/sentiment/src/consumer-intelligence-service.js'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformContext } from '../../../services/platform/src/types.js'

function cookieValue(request: FastifyRequest, name: string) { const item = (request.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`)); return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined }
function requestHost(request: FastifyRequest) { const forwarded = request.headers['x-forwarded-host']; return (typeof forwarded === 'string' ? forwarded : request.headers.host ?? 'localhost').split(',')[0]?.split(':')[0]?.toLowerCase() ?? 'localhost' }
function requestOriginAllowed(request: FastifyRequest) { const origin = request.headers.origin; return !origin || new Set([`https://${requestHost(request)}`, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']).has(origin) }

@Catch(PlatformError)
class ConsumerIntelligenceErrorFilter implements ExceptionFilter { catch(error: PlatformError, host: ArgumentsHost) { host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } }) } }

@Controller('v2/consumer-intelligence')
@UseFilters(ConsumerIntelligenceErrorFilter)
export class V2ConsumerIntelligenceController {
  constructor(private readonly platform: PlatformService, private readonly intelligence: ConsumerIntelligenceService) {}

  @Post('sources')
  async createSource(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { source: await this.intelligence.createSource(context, body, key) } }
  @Post('feedback')
  async ingest(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { feedback: await this.intelligence.ingestFeedback(context, body, key) } }
  @Post('analyses')
  async analysis(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { analysis: await this.intelligence.recordAnalysis(context, body, key) } }
  @Post('analyses/transient')
  async transientAnalysis(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { analysis: await this.intelligence.analyzeTransientFeedback(context, body, key) } }
  @Post('preference-vectors')
  async aggregate(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { preference: await this.intelligence.createPreferenceVector(context, body, key) } }
  @Post('sources/:id/invalidate')
  async invalidate(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { invalidation: await this.intelligence.invalidateSource(context, id, body, key) } }
  @Get('preference-vectors/latest')
  async latest(@Req() request: FastifyRequest, @Query('sourceScope') sourceScope?: string) { const { context } = await this.context(request); if (!sourceScope) throw new PlatformError('INVALID_INPUT', 'Provide a source scope.', 422); return { preference: await this.intelligence.latestPreference(context, sourceScope) } }

  private async context(request: FastifyRequest) { if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401); return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request)) }
  private async mutation(request: FastifyRequest, context: PlatformContext, csrf?: string) { if (!requestOriginAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403); await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf) }
}
