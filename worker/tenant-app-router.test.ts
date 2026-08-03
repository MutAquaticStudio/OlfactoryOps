import { describe, expect, it, vi } from 'vitest'
import router, {
  activeSystemWorkspaceForHostname,
  proxiedPagesRequest,
  tenantRouterHostname,
  tenantRouterNotFound,
} from './tenant-app-router'

describe('tenant app router', () => {
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
})
