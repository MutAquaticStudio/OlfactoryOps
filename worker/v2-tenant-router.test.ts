import { describe, expect, it, vi } from 'vitest'
import {
  activeWorkspaceForHostname,
  createV2TenantRouter,
  isStagingSystemHostname,
  normalizedHost,
  type TenantRouterPgClient,
  type V2TenantRouterEnv,
} from './v2-tenant-router.js'

const baseDomain = 'api-beta.labofscents.org'
const workspaceHost = `studio.${baseDomain}`

function env(overrides: Partial<V2TenantRouterEnv> = {}): V2TenantRouterEnv {
  return {
    HYPERDRIVE: { connectionString: 'postgres://hyperdrive.example/v2' } as Hyperdrive,
    PAGES_ORIGIN: 'https://olfactoryops-beta.pages.dev',
    V2_WORKSPACE_BASE_DOMAIN: baseDomain,
    RELEASE_ENVIRONMENT: 'staging',
    RELEASE_GIT_SHA: 'd13355c',
    ...overrides,
  }
}

function clientWith(rows: Array<{ organizationId: string }> = []) {
  const connect = vi.fn().mockResolvedValue(undefined)
  const query = vi.fn().mockResolvedValue({ rows })
  const end = vi.fn().mockResolvedValue(undefined)
  const client: TenantRouterPgClient = {
    connect,
    query,
    end,
  }
  return { client, clientFactory: vi.fn().mockReturnValue(client), connect, query, end }
}

describe('V2 staging tenant router hostname guard', () => {
  it('accepts exactly one system workspace label under the staging base domain', () => {
    expect(isStagingSystemHostname('studio.api-beta.labofscents.org', 'api-beta.labofscents.org')).toBe(true)
    expect(isStagingSystemHostname('studio.eu.api-beta.labofscents.org', 'api-beta.labofscents.org')).toBe(false)
    expect(isStagingSystemHostname('api-beta.labofscents.org', 'api-beta.labofscents.org')).toBe(false)
    expect(isStagingSystemHostname('studio.beta.labofscents.org', 'api-beta.labofscents.org')).toBe(false)
  })

  it('normalizes only the request host representation', () => {
    expect(normalizedHost('STUDIO.api-beta.labofscents.org.:443')).toBe('studio.api-beta.labofscents.org')
  })

  it('resolves a valid host through the exact resolver, ignores caller organization ids, and proxies with release headers', async () => {
    const { clientFactory, connect, query, end } = clientWith([{ organizationId: 'org_trusted' }])
    const proxyFetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://olfactoryops-beta.pages.dev/workspace/materials?view=list&organizationId=org_attacker')
      expect(request.headers.get('x-olfactoryops-workspace-host')).toBe(workspaceHost)
      expect(request.headers.get('x-olfactoryops-organization-id')).toBeNull()
      expect(request.headers.get('x-organization-id')).toBeNull()
      expect(request.headers.get('x-tenant-id')).toBeNull()
      expect(request.headers.get('x-forwarded-host')).toBeNull()
      expect(request.headers.get('host')).toBeNull()
      return new Response('workspace', { headers: { 'x-upstream': 'pages' } })
    })
    const router = createV2TenantRouter({ clientFactory, proxyFetch })
    const request = new Request(`https://${workspaceHost}/workspace/materials?view=list&organizationId=org_attacker`, {
      headers: {
        'X-OlfactoryOps-Workspace-Host': 'attacker.invalid',
        'X-OlfactoryOps-Organization-Id': 'org_attacker',
        'X-Organization-Id': 'org_attacker',
        'X-Tenant-Id': 'org_attacker',
        'X-Forwarded-Host': 'attacker.invalid',
      },
    })

    const response = await router.fetch(request, env())

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('workspace')
    expect(response.headers.get('x-olfactoryops-workspace-router')).toBe('active')
    expect(response.headers.get('x-olfactoryops-release-environment')).toBe('staging')
    expect(response.headers.get('x-olfactoryops-release-sha')).toBe('d13355c')
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
    expect(proxyFetch).toHaveBeenCalledOnce()
    expect(clientFactory).toHaveBeenCalledWith('postgres://hyperdrive.example/v2')
    expect(connect).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith(expect.stringContaining('public.v2_resolve_active_workspace_hostname($1)'), [workspaceHost])
    expect(query.mock.calls[0]?.[0]).not.toContain('v2_workspace_hostnames')
    expect(end).toHaveBeenCalledOnce()
  })

  it('fails closed before a database connection for an invalid host', async () => {
    const { clientFactory } = clientWith([{ organizationId: 'org_trusted' }])
    const proxyFetch = vi.fn()
    const router = createV2TenantRouter({ clientFactory, proxyFetch })

    const response = await router.fetch(new Request(`https://studio.eu.${baseDomain}/`), env())

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(clientFactory).not.toHaveBeenCalled()
    expect(proxyFetch).not.toHaveBeenCalled()
  })

  it('returns a non-cacheable 404 for an unknown host without proxying', async () => {
    const { clientFactory, query, end } = clientWith()
    const proxyFetch = vi.fn()
    const router = createV2TenantRouter({ clientFactory, proxyFetch })
    const unknownHost = `unknown.${baseDomain}`

    const response = await router.fetch(new Request(`https://${unknownHost}/`), env())

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('public.v2_resolve_active_workspace_hostname($1)'), [unknownHost])
    expect(end).toHaveBeenCalledOnce()
    expect(proxyFetch).not.toHaveBeenCalled()
  })

  it('returns the same non-cacheable 404 for an inactive host without leaking its state', async () => {
    const { clientFactory, query, end } = clientWith()
    const proxyFetch = vi.fn()
    const router = createV2TenantRouter({ clientFactory, proxyFetch })
    const inactiveHost = `inactive.${baseDomain}`

    const response = await router.fetch(new Request(`https://${inactiveHost}/`), env())

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('public.v2_resolve_active_workspace_hostname($1)'), [inactiveHost])
    expect(end).toHaveBeenCalledOnce()
    expect(proxyFetch).not.toHaveBeenCalled()
  })

  it('redacts resolver failures, does not proxy, and always closes the native pg client', async () => {
    const { clientFactory, query, end } = clientWith()
    query.mockRejectedValue(new Error('password=secret organization_id=org_sensitive database connection failed'))
    const proxyFetch = vi.fn()
    const router = createV2TenantRouter({ clientFactory, proxyFetch })

    const response = await router.fetch(new Request(`https://${workspaceHost}/`), env())

    expect(response.status).toBe(503)
    expect(await response.text()).toBe('Service unavailable')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(end).toHaveBeenCalledOnce()
    expect(proxyFetch).not.toHaveBeenCalled()
  })

  it('redacts Pages proxy failures after the trusted resolver closes its client', async () => {
    const { clientFactory, end } = clientWith([{ organizationId: 'org_trusted' }])
    const proxyFetch = vi.fn().mockRejectedValue(new Error('upstream token=secret host=internal.pages.example'))
    const router = createV2TenantRouter({ clientFactory, proxyFetch })

    const response = await router.fetch(new Request(`https://${workspaceHost}/`), env())

    expect(response.status).toBe(503)
    expect(await response.text()).toBe('Service unavailable')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(end).toHaveBeenCalledOnce()
    expect(proxyFetch).toHaveBeenCalledOnce()
  })

  it('does not call end when native pg connection setup fails', async () => {
    const { clientFactory, connect, query, end } = clientWith()
    connect.mockRejectedValue(new Error('connection failed'))

    await expect(activeWorkspaceForHostname(env(), workspaceHost, clientFactory)).rejects.toThrow('connection failed')
    expect(query).not.toHaveBeenCalled()
    expect(end).not.toHaveBeenCalled()
  })
})
