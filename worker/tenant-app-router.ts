import {
  defaultWorkspaceBaseDomain,
  isSystemWorkspaceHostname,
  normalizeWorkspaceBaseDomain,
  normalizeWorkspaceHostname,
} from '../src/data/workspaceHostnames.js'
import { releaseHeaders, releaseMetadata } from '../src/data/release.js'

type Env = {
  DB: D1Database
  PAGES_ORIGIN?: string
  SYSTEM_WORKSPACE_DOMAIN?: string
  V2_WORKSPACE_DOMAIN?: string
  RELEASE_GIT_SHA?: string
  RELEASE_BUILD_TIMESTAMP_UTC?: string
  RELEASE_ENVIRONMENT?: string
}

type WorkspaceHostnameRow = {
  organization_id: string
}

const defaultPagesOrigin = 'https://labofscents.pages.dev'

export function tenantRouterHostname(request: Request) {
  return normalizeWorkspaceHostname(new URL(request.url).hostname)
}

export function tenantRouterBaseDomains(env: Pick<Env, 'SYSTEM_WORKSPACE_DOMAIN' | 'V2_WORKSPACE_DOMAIN'>) {
  return [env.SYSTEM_WORKSPACE_DOMAIN, env.V2_WORKSPACE_DOMAIN].filter((value): value is string => Boolean(value)).map(normalizeWorkspaceBaseDomain)
}

export function isTenantWorkspaceHostname(hostname: string, env: Pick<Env, 'SYSTEM_WORKSPACE_DOMAIN' | 'V2_WORKSPACE_DOMAIN'>) {
  return tenantRouterBaseDomains(env).some((baseDomain) => isSystemWorkspaceHostname(hostname, baseDomain))
}

export function tenantRouterOrigin(value: string | undefined) {
  try {
    const origin = new URL(value?.trim() || defaultPagesOrigin)
    return origin.protocol === 'https:' ? origin : new URL(defaultPagesOrigin)
  } catch {
    return new URL(defaultPagesOrigin)
  }
}

export function tenantRouterNotFound() {
  return new Response('Not found', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function tenantRouterReleaseHeaders(env: Pick<Env, 'RELEASE_GIT_SHA' | 'RELEASE_BUILD_TIMESTAMP_UTC' | 'RELEASE_ENVIRONMENT'>) {
  return releaseHeaders(releaseMetadata({
    fullGitSha: env.RELEASE_GIT_SHA,
    buildTimestampUtc: env.RELEASE_BUILD_TIMESTAMP_UTC,
    environment: env.RELEASE_ENVIRONMENT,
  }))
}

export async function activeSystemWorkspaceForHostname(db: D1Database, hostname: string) {
  return db
    .prepare(
      `SELECT h.organization_id
       FROM workspace_hostnames h
       INNER JOIN tenant_organizations o ON o.id = h.organization_id
       WHERE h.hostname = ?1
         AND h.kind = 'SYSTEM'
         AND h.status = 'ACTIVE'
         AND o.status = 'ACTIVE'
       LIMIT 1`,
    )
    .bind(hostname)
    .first<WorkspaceHostnameRow>()
}

export function proxiedPagesRequest(request: Request, pagesOrigin: URL, hostname: string) {
  const destination = new URL(request.url)
  destination.protocol = pagesOrigin.protocol
  destination.host = pagesOrigin.host
  const headers = new Headers(request.headers)
  headers.delete('Host')
  headers.set('X-OlfactoryOps-Workspace-Host', hostname)
  return new Request(destination, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const hostname = tenantRouterHostname(request)
    const baseDomains = tenantRouterBaseDomains({ SYSTEM_WORKSPACE_DOMAIN: env.SYSTEM_WORKSPACE_DOMAIN ?? defaultWorkspaceBaseDomain, V2_WORKSPACE_DOMAIN: env.V2_WORKSPACE_DOMAIN })
    if (!hostname || !baseDomains.some((baseDomain) => isSystemWorkspaceHostname(hostname, baseDomain))) {
      return tenantRouterNotFound()
    }

    const workspace = await activeSystemWorkspaceForHostname(env.DB, hostname)
    if (!workspace) {
      return tenantRouterNotFound()
    }

    const upstream = await fetch(proxiedPagesRequest(request, tenantRouterOrigin(env.PAGES_ORIGIN), hostname))
    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.set('X-OlfactoryOps-Workspace-Router', 'active')
    for (const [name, value] of Object.entries(tenantRouterReleaseHeaders(env))) responseHeaders.set(name, value)
    responseHeaders.set('Cache-Control', responseHeaders.get('Cache-Control') || 'public, max-age=0, must-revalidate')
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders })
  },
}
