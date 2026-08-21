import { Client } from 'pg'

export type V2TenantRouterEnv = {
  HYPERDRIVE: Hyperdrive
  PAGES_ORIGIN: string
  V2_WORKSPACE_BASE_DOMAIN: string
  RELEASE_ENVIRONMENT?: string
  RELEASE_GIT_SHA?: string
}

type HostRow = { organizationId: string }

export type TenantRouterPgClient = {
  connect(): Promise<void>
  query<Row extends HostRow>(text: string, values: unknown[]): Promise<{ rows: Row[] }>
  end(): Promise<void>
}

export type TenantRouterPgClientFactory = (connectionString: string) => TenantRouterPgClient

export type V2TenantRouterDependencies = {
  clientFactory?: TenantRouterPgClientFactory
  proxyFetch?: (request: Request) => Promise<Response>
}

export type V2TenantRouter = {
  fetch(request: Request, env: V2TenantRouterEnv): Promise<Response>
}

const activeWorkspaceHostnameQuery = `
  SELECT organization_id AS "organizationId"
  FROM public.v2_resolve_active_workspace_hostname($1)
  LIMIT 1
`

const untrustedTenantHeaders = [
  'x-olfactoryops-workspace-host',
  'x-olfactoryops-organization-id',
  'x-olfactoryops-tenant-id',
  'x-organization-id',
  'x-organization_id',
  'x-tenant-id',
  'x-tenant_id',
  'x-forwarded-host',
]

const nativePgClientFactory: TenantRouterPgClientFactory = (connectionString) => new Client({ connectionString })

export function normalizedHost(value: string) {
  return (value.trim().toLowerCase().split(':', 1)[0] ?? '').replace(/\.$/, '')
}

export function isStagingSystemHostname(hostname: string, baseDomain: string) {
  const escaped = baseDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${escaped}$`).test(hostname)
}

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'cache-control': 'no-store, max-age=0', 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' },
  })
}

function invalidConfig() {
  return new Response('Service unavailable', {
    status: 503,
    headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' },
  })
}

export async function activeWorkspaceForHostname(
  env: V2TenantRouterEnv,
  hostname: string,
  clientFactory: TenantRouterPgClientFactory = nativePgClientFactory,
) {
  const client = clientFactory(env.HYPERDRIVE.connectionString)
  let connected = false
  try {
    await client.connect()
    connected = true
    const result = await client.query<HostRow>(activeWorkspaceHostnameQuery, [hostname])
    return result.rows[0] ?? null
  } finally {
    if (connected) await client.end()
  }
}

export function pagesRequest(request: Request, pagesOrigin: URL, hostname: string) {
  const destination = new URL(request.url)
  destination.protocol = pagesOrigin.protocol
  destination.host = pagesOrigin.host
  const headers = new Headers(request.headers)
  headers.delete('host')
  for (const header of untrustedTenantHeaders) headers.delete(header)
  headers.set('x-olfactoryops-workspace-host', hostname)
  return new Request(destination, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  })
}

/**
 * The router uses only the Hyperdrive connection string to call the narrowly
 * privileged hostname resolver. It never accepts a caller organization id.
 */
export function createV2TenantRouter(dependencies: V2TenantRouterDependencies = {}): V2TenantRouter {
  const clientFactory = dependencies.clientFactory ?? nativePgClientFactory
  const proxyFetch = dependencies.proxyFetch ?? globalThis.fetch
  return {
    async fetch(request: Request, env: V2TenantRouterEnv): Promise<Response> {
      const hostname = normalizedHost(new URL(request.url).hostname)
      const baseDomain = normalizedHost(env.V2_WORKSPACE_BASE_DOMAIN)
      if (!hostname || !baseDomain || !isStagingSystemHostname(hostname, baseDomain)) return notFound()
      let pagesOrigin: URL
      try {
        pagesOrigin = new URL(env.PAGES_ORIGIN)
        if (pagesOrigin.protocol !== 'https:') return invalidConfig()
      } catch {
        return invalidConfig()
      }
      let workspace: HostRow | null
      try {
        workspace = await activeWorkspaceForHostname(env, hostname, clientFactory)
      } catch {
        return invalidConfig()
      }
      if (!workspace) return notFound()
      let upstream: Response
      try {
        upstream = await proxyFetch(pagesRequest(request, pagesOrigin, hostname))
      } catch {
        return invalidConfig()
      }
      const headers = new Headers(upstream.headers)
      headers.set('x-olfactoryops-workspace-router', 'active')
      headers.set('x-olfactoryops-release-environment', env.RELEASE_ENVIRONMENT ?? 'staging')
      if (env.RELEASE_GIT_SHA) headers.set('x-olfactoryops-release-sha', env.RELEASE_GIT_SHA)
      headers.set('cache-control', headers.get('cache-control') ?? 'public, max-age=0, must-revalidate')
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers })
    },
  }
}

export default createV2TenantRouter() satisfies ExportedHandler<V2TenantRouterEnv>
