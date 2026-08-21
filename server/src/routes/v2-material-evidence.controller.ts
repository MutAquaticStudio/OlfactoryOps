import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Get, Headers, Param, Post, Query, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { MaterialEvidenceService } from '../../../services/rag/src/material-evidence-service.js'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformContext } from '../../../services/platform/src/types.js'

function cookieValue(request: FastifyRequest, name: string) { const part = (request.headers.cookie ?? '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`)); return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined }
function requestHost(request: FastifyRequest) { const forwarded = request.headers['x-forwarded-host']; return (typeof forwarded === 'string' ? forwarded : request.headers.host ?? 'localhost').split(',')[0]!.split(':')[0]!.toLowerCase() }
function originAllowed(request: FastifyRequest) { const origin = request.headers.origin; return !origin || new Set([`https://${requestHost(request)}`, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']).has(origin) }

@Catch(PlatformError)
class MaterialEvidenceErrorFilter implements ExceptionFilter { catch(error: PlatformError, host: ArgumentsHost) { host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } }) } }

@Controller('v2/material-evidence')
@UseFilters(MaterialEvidenceErrorFilter)
export class V2MaterialEvidenceController {
  constructor(private readonly platform: PlatformService, private readonly evidence: MaterialEvidenceService) {}
  @Post('sources')
  async index(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { source: await this.evidence.index(context, body, key) } }
  @Get('materials/:id')
  async retrieve(@Req() request: FastifyRequest, @Param('id') materialId: string, @Query('q') query?: string, @Query('limit') limit?: string) { const { context } = await this.context(request); return this.evidence.retrieve(context, { materialId, query: query ?? '', limit: limit ? Number(limit) : undefined }) }
  private async context(request: FastifyRequest) { if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401); return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', requestHost(request)) }
  private async mutation(request: FastifyRequest, context: PlatformContext, csrf?: string) { if (!originAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403); await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf) }
}
