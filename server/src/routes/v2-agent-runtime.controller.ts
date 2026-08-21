import { ArgumentsHost, Body, Catch, Controller, Delete, ExceptionFilter, Get, Headers, Param, Post, Put, Query, Req, Res, UseFilters } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { DurableAgentService } from '../../../services/agent-runtime/src/durable-agent-service.js'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformContext } from '../../../services/platform/src/types.js'
import type {
  AgentConfirmationPreview,
  AgentPersistedEvent,
  AgentReplayProjection,
  AgentRunDetail,
  Phase9AgentRuntimePort,
} from './v2-agent-runtime.port.js'

const SSE_HEARTBEAT_MS = 15_000
const SSE_POLL_MS = 2_500
const SSE_MAX_LIFETIME_MS = 55_000
const REPLAY_LIMIT = 200

function cookieValue(request: FastifyRequest, name: string) {
  const part = (request.headers.cookie ?? '').split(';').map((item) => item.trim()).find((item) => item.startsWith(name + '='))
  return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined
}

function requestHost(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-host']
  return (typeof forwarded === 'string' ? forwarded : request.headers.host ?? 'localhost').split(',')[0]!.split(':')[0]!.toLowerCase()
}

function originAllowed(request: FastifyRequest) {
  const origin = request.headers.origin
  return !origin || new Set(['https://' + requestHost(request), 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']).has(origin)
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number, field: string) {
  if (value === undefined || value === '') return fallback
  if (!/^\d+$/.test(value)) throw new PlatformError('INVALID_INPUT', field + ' must be a whole number.', 422)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) throw new PlatformError('INVALID_INPUT', field + ' is outside the allowed range.', 422)
  return parsed
}

function boundedLimit(value: string | undefined) {
  const limit = positiveInteger(value, 50, REPLAY_LIMIT, 'limit')
  if (limit < 1) throw new PlatformError('INVALID_INPUT', 'limit must be at least one.', 422)
  return limit
}

function responseNoStore(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store, no-transform')
  reply.header('Pragma', 'no-cache')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function boundedText(value: unknown, maximum: number) {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, maximum) : undefined
}

function sha256(value: unknown) {
  const text = boundedText(value, 64)
  return text && /^[a-f0-9]{64}$/i.test(text) ? text.toLowerCase() : undefined
}

function iso(value: Date | string | undefined) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.length > 0) return value
  return undefined
}

function eventProjection(value: AgentPersistedEvent, runId: string) {
  const occurredAt = iso(value.occurredAt) ?? iso(value.createdAt)
  if (!occurredAt || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || !value.id || !value.type) {
    throw new PlatformError('AGENT_EVENT_INVALID', 'The persisted agent event could not be replayed safely.', 503)
  }
  return {
    id: value.id,
    sequence: value.sequence,
    type: value.type,
    runId,
    occurredAt,
    payload: asRecord(value.payload),
  }
}

function confirmationPreviewProjection(value: unknown): AgentConfirmationPreview {
  const source = asRecord(value)
  const runId = boundedText(source.runId, 160)
  const confirmationId = boundedText(source.confirmationId, 160)
  const actionKey = boundedText(source.actionKey, 120)
  const status = boundedText(source.status, 80)
  if (!runId || !confirmationId || !actionKey || !status) {
    throw new PlatformError('AGENT_CONFIRMATION_PREVIEW_INVALID', 'The confirmation preview could not be projected safely.', 503)
  }
  const evidenceHashes = Array.isArray(source.evidenceHashes)
    ? source.evidenceHashes.flatMap((candidate) => {
      const entry = asRecord(candidate)
      const kind = boundedText(entry.kind, 80)
      const hash = sha256(entry.hash)
      return kind && hash ? [{ kind, hash }] : []
    }).slice(0, 20)
    : []
  return {
    runId,
    confirmationId,
    actionKey,
    status,
    expiresAt: iso(source.expiresAt as Date | string | undefined),
    candidateId: boundedText(source.candidateId, 160),
    formulaProjectId: boundedText(source.formulaProjectId, 160),
    actionHash: sha256(source.actionHash),
    initiatorUserId: boundedText(source.initiatorUserId, 160),
    evidenceHashes,
  }
}

function sseFrame(eventName: string, payload: unknown, id?: number) {
  return (id === undefined ? '' : 'id: ' + id + '\n') + 'event: ' + eventName + '\n' + 'data: ' + JSON.stringify(payload) + '\n\n'
}

function hasMethod(agent: DurableAgentService, method: keyof Phase9AgentRuntimePort) {
  return typeof (agent as unknown as Record<string, unknown>)[method] === 'function'
}

async function invoke<T>(agent: DurableAgentService, method: keyof Phase9AgentRuntimePort, args: unknown[]): Promise<T> {
  const candidate = (agent as unknown as Record<string, unknown>)[method]
  if (typeof candidate !== 'function') {
    throw new PlatformError(
      'AGENT_RUNTIME_NOT_CONFIGURED',
      'The Phase 9 agent runtime is not available in this environment.',
      503,
    )
  }
  return (candidate as (...values: unknown[]) => Promise<T>).apply(agent, args)
}

async function requestContext(platform: PlatformService, request: FastifyRequest) {
  if (!request.headers.cookie) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401)
  return platform.contextFromToken(cookieValue(request, platform.cookieName) ?? '', requestHost(request))
}

async function mutationGuard(platform: PlatformService, request: FastifyRequest, context: PlatformContext, csrf?: string) {
  if (!originAllowed(request)) throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403)
  await platform.assertCsrf(context, cookieValue(request, platform.cookieName) ?? '', csrf)
}

@Catch()
class AgentRuntimeErrorFilter implements ExceptionFilter {
  catch(error: unknown, args: ArgumentsHost) {
    const reply = args.switchToHttp().getResponse<FastifyReply>()
    responseNoStore(reply)
    if (error instanceof PlatformError) {
      reply.status(error.status).send({ error: { code: error.code, message: error.message } })
      return
    }
    reply.status(500).send({ error: { code: 'AGENT_RUNTIME_UNAVAILABLE', message: 'The agent runtime request could not be completed.' } })
  }
}

@Controller('v2/agent-runs')
@UseFilters(AgentRuntimeErrorFilter)
export class V2AgentRuntimeController {
  constructor(private readonly platform: PlatformService, private readonly agent: DurableAgentService) {}

  @Get()
  async list(
    @Req() request: FastifyRequest,
    @Query('after') after: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('definitionKey') definitionKey: string | undefined,
    @Query('status') status: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.view')
    return {
      runs: await invoke<unknown>(this.agent, 'listRuns', [context, {
        after: after?.trim() || undefined,
        limit: boundedLimit(limit),
        definitionKey: definitionKey?.trim() || undefined,
        status: status?.trim() || undefined,
      }]),
    }
  }

  @Post()
  async start(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.execute')
    await mutationGuard(this.platform, request, context, csrf)
    return { run: await invoke<unknown>(this.agent, 'start', [context, body, key]) }
  }

  @Post(':id/execute')
  async execute(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.execute')
    await mutationGuard(this.platform, request, context, csrf)
    return { run: await invoke<unknown>(this.agent, 'execute', [context, id, key]) }
  }

  @Get(':id/events')
  async events(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Query('afterSequence') afterSequence: string | undefined,
    @Query('limit') limit: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.view')
    const replay = await this.replay(context, id, positiveInteger(afterSequence, 0, Number.MAX_SAFE_INTEGER, 'afterSequence'), boundedLimit(limit))
    return {
      run: replay.run,
      events: replay.events.map((event) => eventProjection(event, id)),
      cursor: replay.cursor ?? null,
      resyncRequired: replay.resyncRequired === true,
    }
  }

  @Get(':id/stream')
  async stream(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Query('afterSequence') afterSequence: string | undefined,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.view')
    const requestedAfter = Math.max(
      positiveInteger(afterSequence, 0, Number.MAX_SAFE_INTEGER, 'afterSequence'),
      positiveInteger(lastEventId, 0, Number.MAX_SAFE_INTEGER, 'lastEventId'),
    )
    const initial = await this.replay(context, id, requestedAfter, REPLAY_LIMIT)
    const raw = reply.raw
    let closed = false
    let polling = false
    let cursor = requestedAfter
    let heartbeat: NodeJS.Timeout | undefined
    let poller: NodeJS.Timeout | undefined
    let expiry: NodeJS.Timeout | undefined

    const close = () => {
      if (closed) return
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      if (poller) clearInterval(poller)
      if (expiry) clearTimeout(expiry)
      if (!raw.writableEnded) raw.end()
    }

    const write = (eventName: string, payload: unknown, sequence?: number) => {
      if (!closed && !raw.destroyed && !raw.writableEnded) raw.write(sseFrame(eventName, payload, sequence))
    }

    const publish = (replay: AgentReplayProjection) => {
      for (const event of replay.events) {
        const projected = eventProjection(event, id)
        cursor = Math.max(cursor, projected.sequence)
        write('agent.event', projected, projected.sequence)
      }
      if (replay.resyncRequired === true) {
        write('connection.resync_required', {
          protocolVersion: '2.0',
          source: 'persisted_events',
          afterSequence: cursor,
          reason: 'REPLAY_WINDOW_EXHAUSTED',
        })
        close()
      }
    }

    reply.hijack()
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Pragma': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    write('connection.snapshot', {
      protocolVersion: '2.0',
      source: 'persisted_events',
      runId: id,
      status: initial.run.status,
      afterSequence: requestedAfter,
      cursor: initial.cursor ?? null,
    })
    publish(initial)
    // An exhausted initial replay closes the connection in publish(). Do not
    // allocate transport timers after that close or they will outlive it.
    if (closed) return

    const poll = async () => {
      if (closed || polling) return
      polling = true
      try {
        publish(await this.replay(context, id, cursor, REPLAY_LIMIT))
      } catch (error) {
        const code = error instanceof PlatformError ? error.code : 'AGENT_STREAM_UNAVAILABLE'
        write('connection.resync_required', {
          protocolVersion: '2.0',
          source: 'persisted_events',
          afterSequence: cursor,
          reason: code,
        })
        close()
      } finally {
        polling = false
      }
    }

    heartbeat = setInterval(() => {
      write('heartbeat', { protocolVersion: '2.0', source: 'transport', afterSequence: cursor, occurredAt: new Date().toISOString() })
    }, SSE_HEARTBEAT_MS)
    poller = setInterval(() => { void poll() }, SSE_POLL_MS)
    expiry = setTimeout(() => {
      write('connection.resync_required', {
        protocolVersion: '2.0',
        source: 'persisted_events',
        afterSequence: cursor,
        reason: 'STREAM_RECONNECT_REQUIRED',
      })
      close()
    }, SSE_MAX_LIFETIME_MS)
    request.raw.on('close', close)
  }

  @Get(':id/evidence')
  async evidence(@Req() request: FastifyRequest, @Param('id') id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.view')
    return { evidence: await invoke<unknown>(this.agent, 'evidence', [context, id]) }
  }

  @Get(':id/confirmations/:confirmationId/preview')
  async confirmationPreview(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Param('confirmationId') confirmationId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    // Confirmation is a Formula Draft handoff. Viewing its bounded candidate
    // context therefore needs both the write-confirmation and sensitive
    // Formula-read capability; agent.view alone is intentionally insufficient.
    await this.platform.requirePermission(context, 'agent.confirmWrite')
    await this.platform.requirePermission(context, 'formula.viewSensitive')
    return { preview: confirmationPreviewProjection(await invoke<unknown>(this.agent, 'confirmationPreview', [context, id, confirmationId])) }
  }

  @Post(':id/confirmations/:confirmationId')
  async confirm(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Param('confirmationId') confirmationId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.confirmWrite')
    await mutationGuard(this.platform, request, context, csrf)
    return { confirmation: await invoke<unknown>(this.agent, 'confirm', [context, id, confirmationId, body, key]) }
  }

  @Post(':id/retry')
  async retry(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.execute')
    await mutationGuard(this.platform, request, context, csrf)
    return { run: await invoke<unknown>(this.agent, 'retry', [context, id, key]) }
  }

  @Delete(':id')
  async cancel(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.execute')
    await mutationGuard(this.platform, request, context, csrf)
    return { run: await invoke<unknown>(this.agent, 'cancel', [context, id, key]) }
  }

  @Get(':id')
  async detail(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Query('afterSequence') afterSequence: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.view')
    const detail = await invoke<AgentRunDetail>(this.agent, 'detail', [context, id, positiveInteger(afterSequence, 0, Number.MAX_SAFE_INTEGER, 'afterSequence')])
    return {
      ...detail,
      events: detail.events.map((event) => eventProjection(event, id)),
    }
  }

  private async replay(context: PlatformContext, runId: string, afterSequence: number, limit: number): Promise<AgentReplayProjection> {
    if (hasMethod(this.agent, 'replay')) {
      return invoke<AgentReplayProjection>(this.agent, 'replay', [context, runId, { afterSequence, limit }])
    }
    const detail = await invoke<AgentRunDetail>(this.agent, 'detail', [context, runId, afterSequence])
    const events = detail.events.slice(0, limit)
    const finalSequence = events.at(-1)?.sequence ?? afterSequence
    const nextSequence = detail.run.nextSequence
    return {
      run: detail.run,
      events,
      cursor: String(finalSequence),
      resyncRequired: events.length >= limit && typeof nextSequence === 'number' && nextSequence - 1 > finalSequence,
    }
  }
}

@Controller('v2/agent-runtime')
@UseFilters(AgentRuntimeErrorFilter)
export class V2AgentRuntimeCatalogController {
  constructor(private readonly platform: PlatformService, private readonly agent: DurableAgentService) {}

  @Get('definitions')
  async definitions(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.view')
    return { definitions: await invoke<unknown>(this.agent, 'listDefinitions', [context]) }
  }

  @Post('definitions')
  async createDefinition(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.manageTools')
    await mutationGuard(this.platform, request, context, csrf)
    return { definition: await invoke<unknown>(this.agent, 'createDefinition', [context, body, key]) }
  }

  @Get('definitions/:definitionKey')
  async definition(@Req() request: FastifyRequest, @Param('definitionKey') definitionKey: string, @Res({ passthrough: true }) reply: FastifyReply) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.view')
    return { definition: await invoke<unknown>(this.agent, 'definitionDetail', [context, definitionKey]) }
  }

  @Get('definitions/:definitionKey/versions')
  async definitionVersions(@Req() request: FastifyRequest, @Param('definitionKey') definitionKey: string, @Res({ passthrough: true }) reply: FastifyReply) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.view')
    return { versions: await invoke<unknown>(this.agent, 'listDefinitionVersions', [context, definitionKey]) }
  }

  @Post('definitions/:definitionKey/versions')
  async createDefinitionVersion(
    @Req() request: FastifyRequest,
    @Param('definitionKey') definitionKey: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.manageTools')
    await mutationGuard(this.platform, request, context, csrf)
    return { version: await invoke<unknown>(this.agent, 'createDefinitionVersion', [context, definitionKey, body, key]) }
  }

  @Get('definitions/:definitionKey/policy')
  async policy(@Req() request: FastifyRequest, @Param('definitionKey') definitionKey: string, @Res({ passthrough: true }) reply: FastifyReply) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.view')
    return { policy: await invoke<unknown>(this.agent, 'definitionPolicy', [context, definitionKey]) }
  }

  @Put('definitions/:definitionKey/policy')
  async updatePolicy(
    @Req() request: FastifyRequest,
    @Param('definitionKey') definitionKey: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.manageTools')
    await mutationGuard(this.platform, request, context, csrf)
    return { policy: await invoke<unknown>(this.agent, 'updateDefinitionPolicy', [context, definitionKey, body, key]) }
  }

  @Get('evaluations')
  async evaluations(
    @Req() request: FastifyRequest,
    @Query('after') after: string | undefined,
    @Query('limit') limit: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.evaluate')
    return { evaluations: await invoke<unknown>(this.agent, 'listEvaluations', [context, { after: after?.trim() || undefined, limit: boundedLimit(limit) }]) }
  }

  @Post('evaluations')
  async createEvaluation(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.evaluate')
    await mutationGuard(this.platform, request, context, csrf)
    return { evaluation: await invoke<unknown>(this.agent, 'createEvaluation', [context, body, key]) }
  }

  @Get('evaluations/:evaluationId')
  async evaluation(@Req() request: FastifyRequest, @Param('evaluationId') evaluationId: string, @Res({ passthrough: true }) reply: FastifyReply) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.evaluate')
    return { evaluation: await invoke<unknown>(this.agent, 'evaluationDetail', [context, evaluationId]) }
  }

  @Get('observability')
  async observability(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    responseNoStore(reply)
    const { context } = await requestContext(this.platform, request)
    await this.platform.requirePermission(context, 'agent.observe')
    return { observability: await invoke<unknown>(this.agent, 'observability', [context]) }
  }
}
