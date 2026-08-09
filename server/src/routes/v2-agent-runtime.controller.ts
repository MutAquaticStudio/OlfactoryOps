import { ArgumentsHost, Body, Catch, Controller, Delete, ExceptionFilter, Get, Headers, Param, Post, Query, Req, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { DurableAgentService } from '../../../services/agent-runtime/src/durable-agent-service.js'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformContext } from '../../../services/platform/src/types.js'

function cookieValue(request: FastifyRequest, name: string) { const part = (request.headers.cookie ?? '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`)); return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined }
function host(request: FastifyRequest) { const forwarded = request.headers['x-forwarded-host']; return (typeof forwarded === 'string' ? forwarded : request.headers.host ?? 'localhost').split(',')[0]!.split(':')[0]!.toLowerCase() }
function originAllowed(request: FastifyRequest) { const origin = request.headers.origin; return !origin || new Set([`https://${host(request)}`, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']).has(origin) }
@Catch(PlatformError)
class AgentRuntimeErrorFilter implements ExceptionFilter { catch(error: PlatformError, args: ArgumentsHost) { args.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ error: { code: error.code, message: error.message } }) } }

@Controller('v2/agent-runs')
@UseFilters(AgentRuntimeErrorFilter)
export class V2AgentRuntimeController {
  constructor(private readonly platform: PlatformService, private readonly agent: DurableAgentService) {}
  @Post() async start(@Req() request: FastifyRequest, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { run: await this.agent.start(context, body, key) } }
  @Post(':id/execute') async execute(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { run: await this.agent.execute(context, id, key) } }
  @Post(':id/confirmations/:confirmationId') async confirm(@Req() request: FastifyRequest, @Param('id') id: string, @Param('confirmationId') confirmationId: string, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { confirmation: await this.agent.confirm(context, id, confirmationId, body, key) } }
  @Post(':id/retry') async retry(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { run: await this.agent.retry(context, id, key) } }
  @Delete(':id') async cancel(@Req() request: FastifyRequest, @Param('id') id: string, @Headers('idempotency-key') key?: string, @Headers('x-csrf-token') csrf?: string) { const { context } = await this.context(request); await this.mutation(request, context, csrf); return { run: await this.agent.cancel(context, id, key) } }
  @Get(':id') async detail(@Req() request: FastifyRequest, @Param('id') id: string, @Query('afterSequence') afterSequence?: string) { const { context } = await this.context(request); return this.agent.detail(context, id, Number(afterSequence ?? 0)) }
  private async context(request: FastifyRequest) { if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401); return this.platform.contextFromToken(cookieValue(request, this.platform.cookieName) ?? '', host(request)) }
  private async mutation(request: FastifyRequest, context: PlatformContext, csrf?: string) { if (!originAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403); await this.platform.assertCsrf(context, cookieValue(request, this.platform.cookieName) ?? '', csrf) }
}
