import { describe, expect, it, vi } from 'vitest'
import router, {
  activeSystemWorkspaceForHostname,
  isTenantWorkspaceHostname,
  proxiedPagesRequest,
  tenantRouterReleaseHeaders,
  tenantRouterHostname,
  tenantRouterNotFound,
} from './tenant-app-router'

describe('tenant app router', () => {
  it('accepts configured V2 workspace hostnames while preserving the legacy domain', () => {
    const env = { SYSTEM_WORKSPACE_DOMAIN: 'labofscents.org', V2_WORKSPACE_DOMAIN: 'olfactoryops.com' }
    expect(isTenantWorkspaceHostname('atelier.olfactoryops.com', env)).toBe(true)
    expect(isTenantWorkspaceHostname('atelier.labofscents.org', env)).toBe(true)
    expect(isTenantWorkspaceHostname('api.olfactoryops.com', env)).toBe(false)
  })
  it('uses the request hostname and returns a non-cacheable 404 for unknown addresses', async () => {
    expect(tenantRouterHostname(new Request('https://atelier.labofscents.org/ai/formula-design-studio'))).toBe('atelier.labofscents.org')
    const notFound = tenantRouterNotFound()
    expect(notFound.status).toBe(404)
    expect(notFound.headers.get('Cache-Control')).toContain('no-store')

    const first = vi.fn().mockResolvedValue(null)
    const db = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first }) }) } as unknown as D1Database
    await expect(activeSystemWorkspaceForHostname(db, 'missing.labofscents.org')).resolves.toBeNull()
    await expect(router.fetch(new Request('https://missing.labofscents.org/'), { DB: db })).resolves.toMatchObject({ status: 404 })
  })

  it('proxies only after the active system-host lookup and preserves the request path', () => {
    const request = new Request('https://atelier.labofscents.org/workspace/materials?view=list', {
      headers: { Cookie: 'session=opaque' },
    })
    const proxied = proxiedPagesRequest(request, new URL('https://labofscents.pages.dev'), 'atelier.labofscents.org')
    expect(proxied.url).toBe('https://labofscents.pages.dev/workspace/materials?view=list')
    expect(proxied.headers.get('X-OlfactoryOps-Workspace-Host')).toBe('atelier.labofscents.org')
    expect(proxied.headers.get('Host')).toBeNull()
  })

  it('adds only non-sensitive release provenance to proxied responses', () => {
    expect(tenantRouterReleaseHeaders({
      RELEASE_GIT_SHA: '356b4e078247dcb6bed6a8a7a9b6e64de6afa141',
      RELEASE_BUILD_TIMESTAMP_UTC: '2026-08-05T00:00:00Z',
      RELEASE_ENVIRONMENT: 'test',
    })).toEqual({
      'X-OlfactoryOps-Version': '0.1.0-rc.1',
      'X-OlfactoryOps-Git-SHA': '356b4e078247dcb6bed6a8a7a9b6e64de6afa141',
      'X-OlfactoryOps-Environment': 'test',
    })
  })
})
