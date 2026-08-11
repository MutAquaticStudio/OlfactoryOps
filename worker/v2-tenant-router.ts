import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

export type V2TenantRouterEnv = {
  HYPERDRIVE: Hyperdrive
  PAGES_ORIGIN: string
  V2_WORKSPACE_BASE_DOMAIN: string
  RELEASE_ENVIRONMENT?: string
  RELEASE_GIT_SHA?: string
}

type HostRow = { organizationId: string }

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

async function activeWorkspaceForHostname(env: V2TenantRouterEnv, hostname: string) {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.HYPERDRIVE.connectionString }) })
  try {
    const rows = await prisma.$queryRaw<HostRow[]>`
      SELECT organization_id AS "organizationId"
      FROM public.v2_resolve_active_workspace_hostname(${hostname})
      LIMIT 1
    `
    return rows[0] ?? null
  } finally {
    await prisma.$disconnect()
  }
}

function pagesRequest(request: Request, pagesOrigin: URL, hostname: string) {
  const destination = new URL(request.url)
  destination.protocol = pagesOrigin.protocol
  destination.host = pagesOrigin.host
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.set('x-olfactoryops-workspace-host', hostname)
  return new Request(destination, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  })
}

/**
 * Staging-only tenant router. It reads V2 PostgreSQL through Hyperdrive and
 * never consults legacy D1 hostname tables.
 */
export default {
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
      workspace = await activeWorkspaceForHostname(env, hostname)
    } catch {
      return invalidConfig()
    }
    if (!workspace) return notFound()
    const upstream = await fetch(pagesRequest(request, pagesOrigin, hostname))
    const headers = new Headers(upstream.headers)
    headers.set('x-olfactoryops-workspace-router', 'active')
    headers.set('x-olfactoryops-release-environment', env.RELEASE_ENVIRONMENT ?? 'staging')
    if (env.RELEASE_GIT_SHA) headers.set('x-olfactoryops-release-sha', env.RELEASE_GIT_SHA)
    headers.set('cache-control', headers.get('cache-control') ?? 'public, max-age=0, must-revalidate')
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers })
  },
} satisfies ExportedHandler<V2TenantRouterEnv>
