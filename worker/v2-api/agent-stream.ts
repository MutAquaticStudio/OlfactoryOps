import { PlatformError } from '../../services/platform/src/service.js'
import type { AgentPersistedEvent } from '../../server/src/routes/v2-agent-runtime.port.js'
import type { V2ApiServices } from './service-container.js'
import { stagingCors, type V2TransportConfig } from './transport.js'

const HEARTBEAT_MS = 15_000
const POLL_MS = 2_500
const MAX_LIFETIME_MS = 55_000
const REPLAY_LIMIT = 200

function json(status: number, body: Record<string, unknown>, headers = new Headers()) {
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers })
}

function cookieValue(request: Request, name: string) {
  const encoded = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1)
  return encoded ? decodeURIComponent(encoded) : undefined
}

function nonNegativeInteger(value: string | null, field: string) {
  if (!value) return 0
  if (!/^\d+$/.test(value)) throw new PlatformError('INVALID_INPUT', `${field} must be a whole number.`, 422)
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0 || number > Number.MAX_SAFE_INTEGER) throw new PlatformError('INVALID_INPUT', `${field} is outside the allowed range.`, 422)
  return number
}

function projection(event: AgentPersistedEvent, runId: string) {
  const occurredAt = event.occurredAt instanceof Date ? event.occurredAt.toISOString() : event.occurredAt ?? (event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt)
  if (!event.id || !event.type || !occurredAt || !Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    throw new PlatformError('AGENT_EVENT_INVALID', 'The persisted agent event could not be replayed safely.', 503)
  }
  return { id: event.id, sequence: event.sequence, type: event.type, runId, occurredAt, payload: event.payload }
}

function frame(name: string, payload: unknown, sequence?: number) {
  return `${sequence === undefined ? '' : `id: ${sequence}\n`}event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`
}

function streamPath(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/^\/api\/v1\/?/, '/').replace(/\/$/, '')
  const match = /^\/v2\/agent-runs\/([^/]+)\/stream$/.exec(pathname)
  return match ? decodeURIComponent(match[1]!) : undefined
}

function error(error: unknown, headers: Headers) {
  if (error instanceof PlatformError) return json(error.status, { error: { code: error.code, message: error.message } }, headers)
  return json(500, { error: { code: 'AGENT_STREAM_UNAVAILABLE', message: 'The agent event stream is unavailable.' } }, headers)
}

/**
 * Cloudflare Web Streams transport for the durable Agent event log. Events are
 * always fetched through the existing permission-aware runtime replay method;
 * the stream is neither an authority nor a separate event store.
 */
export async function agentEventStreamResponse(input: {
  request: Request
  services: V2ApiServices
  config: V2TransportConfig
  onClose: () => Promise<void>
}): Promise<Response | undefined> {
  if (input.request.method !== 'GET') return undefined
  const runId = streamPath(input.request)
  if (!runId) return undefined
  let cors: ReturnType<typeof stagingCors> | undefined
  try {
    cors = stagingCors(input.request, input.config)
    if (!cors.trustedHost) return json(403, { error: { code: 'ORIGIN_REQUIRED', message: 'A trusted staging origin is required.' } }, cors.headers)
    const token = cookieValue(input.request, input.services.platform.cookieName)
    if (!token) throw new PlatformError('SESSION_EXPIRED', 'Sign in is required.', 401)
    const { context } = await input.services.platform.contextFromToken(token, cors.trustedHost)
    await input.services.platform.requirePermission(context, 'agent.view')
    const url = new URL(input.request.url)
    const afterSequence = Math.max(
      nonNegativeInteger(url.searchParams.get('afterSequence'), 'afterSequence'),
      nonNegativeInteger(input.request.headers.get('last-event-id'), 'last-event-id'),
    )
    const initial = await input.services.agent.replay(context, runId, { afterSequence, limit: REPLAY_LIMIT })
    const encoder = new TextEncoder()
    let closed = false
    let cursor = afterSequence
    let poller: ReturnType<typeof setInterval> | undefined
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let lifetime: ReturnType<typeof setTimeout> | undefined
    const cleanup = async () => {
      if (closed) return
      closed = true
      if (poller) clearInterval(poller)
      if (heartbeat) clearInterval(heartbeat)
      if (lifetime) clearTimeout(lifetime)
      await input.onClose()
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const publish = (replay: { run: { status: string }; events: ReadonlyArray<AgentPersistedEvent>; cursor?: string | null; resyncRequired?: boolean }) => {
          for (const event of replay.events) {
            const safe = projection(event, runId)
            cursor = Math.max(cursor, safe.sequence)
            controller.enqueue(encoder.encode(frame('agent.event', safe, safe.sequence)))
          }
          if (replay.resyncRequired === true) {
            controller.enqueue(encoder.encode(frame('connection.resync_required', { protocolVersion: '2.0', source: 'persisted_events', afterSequence: cursor, reason: 'REPLAY_WINDOW_EXHAUSTED' })))
            controller.close()
            void cleanup()
          }
        }
        controller.enqueue(encoder.encode(frame('connection.snapshot', { protocolVersion: '2.0', source: 'persisted_events', runId, status: initial.run.status, afterSequence, cursor: initial.cursor ?? null })))
        publish(initial)
        if (closed) return
        let polling = false
        const poll = async () => {
          if (closed || polling) return
          polling = true
          try {
            publish(await input.services.agent.replay(context, runId, { afterSequence: cursor, limit: REPLAY_LIMIT }))
          } catch (reason) {
            const code = reason instanceof PlatformError ? reason.code : 'AGENT_STREAM_UNAVAILABLE'
            controller.enqueue(encoder.encode(frame('connection.resync_required', { protocolVersion: '2.0', source: 'persisted_events', afterSequence: cursor, reason: code })))
            controller.close()
            await cleanup()
          } finally {
            polling = false
          }
        }
        heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(frame('heartbeat', { protocolVersion: '2.0', source: 'transport', afterSequence: cursor, occurredAt: new Date().toISOString() })))
        }, HEARTBEAT_MS)
        poller = setInterval(() => { void poll() }, POLL_MS)
        lifetime = setTimeout(() => {
          if (closed) return
          controller.enqueue(encoder.encode(frame('connection.resync_required', { protocolVersion: '2.0', source: 'persisted_events', afterSequence: cursor, reason: 'STREAM_RECONNECT_REQUIRED' })))
          controller.close()
          void cleanup()
        }, MAX_LIFETIME_MS)
      },
      async cancel() { await cleanup() },
    })
    const headers = cors.headers
    headers.set('content-type', 'text/event-stream; charset=utf-8')
    headers.set('cache-control', 'no-store, no-transform')
    headers.set('pragma', 'no-cache')
    headers.set('x-accel-buffering', 'no')
    return new Response(stream, { status: 200, headers })
  } catch (reason) {
    return error(reason, cors?.headers ?? new Headers({ 'cache-control': 'no-store' }))
  }
}
