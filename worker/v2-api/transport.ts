import { PlatformError } from '../../services/platform/src/service.js'
import type { ControllerParameter, ControllerRoute } from './controller-registry.js'

export type V2TransportConfig = {
  publicHostname: string
  publicPageHostname?: string
  platformAdminHostname?: string
  tenantBaseDomain: string
}

export type V2TransportRequest = {
  request: Request
  route: ControllerRoute
  params: Record<string, string>
  config: V2TransportConfig
}

type Reply = {
  headers: Headers
  statusCode: number
  sent: unknown
  header: (name: string, value: string | string[]) => Reply
  status: (status: number) => Reply
  send: (body: unknown) => Reply
}

function json(status: number, body: unknown, headers = new Headers()) {
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', headers.get('cache-control') ?? 'no-store')
  return new Response(JSON.stringify(body), { status, headers })
}

function runtimeFailureCode(error: unknown) {
  if (error instanceof PlatformError) return error.code
  const record = error && typeof error === 'object' ? error as { code?: unknown; meta?: { code?: unknown } } : undefined
  const code = typeof record?.code === 'string' ? record.code : 'UNKNOWN'
  // Prisma P2010 wraps the PostgreSQL SQLSTATE in meta.code. It is safe to
  // classify that fixed-length code, but never log meta.message or the query.
  const nestedCode = typeof record?.meta?.code === 'string' ? record.meta.code : ''
  if (code === 'P2010' && /^[0-9A-Z]{5}$/.test(nestedCode)) return `PG_${nestedCode}`
  return /^[0-9A-Z]{5}$/.test(code) ? `PG_${code}` : 'UNCLASSIFIED'
}

function errorResponse(error: unknown, headers: Headers) {
  if (error instanceof PlatformError) return json(error.status, { error: { code: error.code, message: error.message } }, headers)
  if (error instanceof SyntaxError) return json(422, { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } }, headers)
  const message = error instanceof Error ? error.message : ''
  if (/NOT_CONFIGURED|HYPERDRIVE/i.test(message)) return json(503, { error: { code: 'RUNTIME_NOT_CONFIGURED', message: 'The staging runtime is not configured.' } }, headers)
  // Emit only a stable category. SQL, credentials, request bodies, and tenant
  // identifiers never leave the server error boundary or enter Worker logs.
  console.error(JSON.stringify({ event: 'v2_platform_runtime_failure', code: runtimeFailureCode(error) }))
  return json(500, { error: { code: 'RUNTIME_UNAVAILABLE', message: 'The request could not be completed.' } }, headers)
}

function hostname(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/\.$/, '').split(':', 1)[0] ?? ''
}

function tenantOriginHost(origin: string | null, config: V2TransportConfig) {
  if (!origin) return undefined
  let parsed: URL
  try { parsed = new URL(origin) } catch { throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403) }
  const host = hostname(parsed.hostname)
  const base = hostname(config.tenantBaseDomain)
  const publicPageHost = hostname(config.publicPageHostname)
  const adminHost = hostname(config.platformAdminHostname)
  if (parsed.protocol !== 'https:' || !host || (host !== hostname(config.publicHostname) && host !== publicPageHost && host !== adminHost && host !== base && !new RegExp(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(host))) {
    throw new PlatformError('ORIGIN_DENIED', 'Request origin is not allowed.', 403)
  }
  return host
}

async function bodyFor(request: Request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) return undefined
  const text = await request.text()
  return text ? JSON.parse(text) : {}
}

function createReply(): Reply {
  const headers = new Headers()
  const reply: Reply = {
    headers,
    statusCode: 200,
    sent: undefined,
    header(name, value) {
      if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry))
      else headers.append(name, value)
      return reply
    },
    status(status) { reply.statusCode = status; return reply },
    send(body) { reply.sent = body; return reply },
  }
  return reply
}

function paramValue(parameter: ControllerParameter, request: Request, body: unknown, params: Record<string, string>, trustedHost: string, reply: Reply) {
  if (parameter.source === 'REQUEST') {
    const headers = Object.fromEntries(request.headers.entries()) as Record<string, string>
    headers.host = trustedHost
    headers['x-forwarded-host'] = trustedHost
    return { headers, ip: request.headers.get('cf-connecting-ip') ?? undefined, raw: undefined }
  }
  if (parameter.source === 'RESPONSE') return reply
  if (parameter.source === 'BODY') return parameter.name ? (body && typeof body === 'object' ? (body as Record<string, unknown>)[parameter.name] : undefined) : body
  if (parameter.source === 'QUERY') return new URL(request.url).searchParams.get(parameter.name ?? '') ?? undefined
  if (parameter.source === 'PARAM') return parameter.name ? params[parameter.name] : params
  return request.headers.get(parameter.name ?? '') ?? undefined
}

export function stagingCors(request: Request, config: V2TransportConfig) {
  const headers = new Headers({ 'cache-control': 'no-store', vary: 'Origin' })
  const origin = request.headers.get('origin')
  const allowed = tenantOriginHost(origin, config)
  if (allowed && origin) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-credentials', 'true')
    headers.set('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    headers.set('access-control-allow-headers', 'Content-Type,Idempotency-Key,X-CSRF-Token')
    headers.set('access-control-max-age', '600')
  }
  return { headers, trustedHost: allowed }
}

export async function invokeControllerRoute(input: V2TransportRequest): Promise<Response> {
  let cors: { headers: Headers; trustedHost?: string } = { headers: new Headers({ 'cache-control': 'no-store' }) }
  try {
    cors = stagingCors(input.request, input.config)
    if (input.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers })
    if (!cors.trustedHost && !['GET', 'HEAD'].includes(input.request.method)) {
      return json(403, { error: { code: 'ORIGIN_REQUIRED', message: 'A trusted staging origin is required.' } }, cors.headers)
    }
    const body = await bodyFor(input.request)
    const reply = createReply()
    const trustedHost = cors.trustedHost ?? hostname(input.request.headers.get('host') ?? undefined)
    const args: unknown[] = []
    for (const parameter of input.route.parameters) {
      args[parameter.index] = paramValue(parameter, input.request, body, input.params, trustedHost, reply)
    }
    const result = await (input.route.controller as Record<string, (...values: unknown[]) => unknown>)[input.route.handler](...args)
    for (const [key, value] of reply.headers) cors.headers.append(key, value)
    return json(reply.statusCode, reply.sent === undefined ? result : reply.sent, cors.headers)
  } catch (error) {
    return errorResponse(error, cors?.headers ?? new Headers({ 'cache-control': 'no-store' }))
  }
}

export function matchControllerRoute(routes: ControllerRoute[], request: Request) {
  const pathname = new URL(request.url).pathname.replace(/^\/api\/v1\/?/, '/').replace(/\/$/, '') || '/'
  const method = request.method.toUpperCase()
  for (const route of routes) {
    if (route.method !== method) continue
    const names: string[] = []
    const expression = '^' + route.path.replace(/:[A-Za-z0-9_]+/g, (token) => {
      names.push(token.slice(1))
      return '([^/]+)'
    }).replace(/\//g, '\\/') + '$'
    const match = new RegExp(expression).exec(pathname)
    if (!match) continue
    return { route, params: Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1] ?? '')])) }
  }
  return undefined
}
