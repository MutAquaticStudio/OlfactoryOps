import { describe, expect, it, vi } from 'vitest'
import { v2ControllerRoutes, type ControllerRoute } from './controller-registry.js'
import { generatedRouteSpecs } from './generated-route-specs.js'
import type { V2ApiServices } from './service-container.js'
import { invokeControllerRoute, matchControllerRoute } from './transport.js'

const config = { publicHostname: 'api-beta.labofscents.org', publicPageHostname: 'beta.labofscents.org', tenantBaseDomain: 'api-beta.labofscents.org' }

describe('V2 Worker transport', () => {
  it('uses the generated Phase 1-6 route matrix and excludes later public modules', () => {
    expect(generatedRouteSpecs.length).toBeGreaterThan(100)
    expect(generatedRouteSpecs).toContainEqual(expect.objectContaining({ method: 'POST', path: '/v2/platform/auth/login' }))
    expect(generatedRouteSpecs).toContainEqual(expect.objectContaining({ method: 'POST', path: '/v2/lab/materials' }))
    expect(generatedRouteSpecs.some((route) => /\/v2\/(trials|production|commerce|advanced)(\/|$)/.test(route.path))).toBe(false)
  })

  it('binds every generated route to a decorator-free shared controller delegate', () => {
    const shared = {} as V2ApiServices
    const routes = v2ControllerRoutes({ ...shared, databaseHealth: async () => 'PASS', platform: {}, lab: {}, scientific: {}, modelDataset: {}, olfactory: {}, consumer: {}, formula: {}, evidence: {}, agent: {} } as V2ApiServices)
    expect(routes).toHaveLength(generatedRouteSpecs.length)
    for (const route of routes) expect(typeof (route.controller as Record<string, unknown>)[route.handler]).toBe('function')
    expect(routes).toContainEqual(expect.objectContaining({ method: 'GET', path: '/v2/agent-runs/:id/stream' }))
  })

  it('reports the injected Hyperdrive probe rather than a Node-only environment variable', async () => {
    const shared = {} as V2ApiServices
    const routes = v2ControllerRoutes({ ...shared, databaseHealth: async () => 'PASS', platform: {}, lab: {}, scientific: {}, modelDataset: {}, olfactory: {}, consumer: {}, formula: {}, evidence: {}, agent: {} } as V2ApiServices)
    const health = routes.find((route) => route.path === '/v2/platform/health')!
    await expect((health.controller as { health: () => Promise<unknown> }).health()).resolves.toEqual({ status: 'PASS', scope: 'v2-platform', database: 'PASS' })
  })

  it('matches path parameters and invokes a decorator-free controller with the trusted origin host', async () => {
    const observed: unknown[] = []
    const route: ControllerRoute = {
      method: 'POST', path: '/v2/example/:id', handler: 'write', controller: {
        async write(request: { headers: Record<string, string> }, id: string, body: unknown, csrf: string | undefined) {
          observed.push(request.headers['x-forwarded-host'], id, body, csrf)
          return { ok: true }
        },
      },
      parameters: [
        { index: 0, source: 'REQUEST' }, { index: 1, source: 'PARAM', name: 'id' }, { index: 2, source: 'BODY' }, { index: 3, source: 'HEADER', name: 'x-csrf-token' },
      ],
    }
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/example/item-1', {
      method: 'POST', headers: { Origin: 'https://tenant-a.api-beta.labofscents.org', 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf' }, body: JSON.stringify({ value: 1 }),
    })
    const matched = matchControllerRoute([route], request)
    expect(matched?.params).toEqual({ id: 'item-1' })
    const response = await invokeControllerRoute({ request, route, params: matched!.params, config })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tenant-a.api-beta.labofscents.org')
    expect(observed).toEqual(['tenant-a.api-beta.labofscents.org', 'item-1', { value: 1 }, 'csrf'])
  })

  it('accepts the exact public staging Pages origin for cookie-authenticated mutations', async () => {
    const route: ControllerRoute = { method: 'POST', path: '/v2/example', handler: 'write', controller: { async write() { return { ok: true } } }, parameters: [] }
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/example', {
      method: 'POST',
      headers: { Origin: 'https://beta.labofscents.org', 'Content-Type': 'application/json' },
      body: '{}',
    })
    const response = await invokeControllerRoute({ request, route, params: {}, config })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://beta.labofscents.org')
  })

  it('rejects mutations without an exact trusted staging origin', async () => {
    const route: ControllerRoute = { method: 'POST', path: '/v2/example', handler: 'write', controller: { async write() { return { ok: true } } }, parameters: [] }
    const response = await invokeControllerRoute({ request: new Request('https://api-beta.labofscents.org/api/v1/v2/example', { method: 'POST' }), route, params: {}, config })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: expect.objectContaining({ code: 'ORIGIN_REQUIRED' }) })
  })

  it('keeps unexpected runtime failures generic to the browser', async () => {
    const route: ControllerRoute = { method: 'POST', path: '/v2/example', handler: 'write', controller: { async write() { throw Object.assign(new Error('database detail must not leak'), { code: '42501' }) } }, parameters: [] }
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/example', {
      method: 'POST', headers: { Origin: 'https://beta.labofscents.org', 'Content-Type': 'application/json' }, body: '{}',
    })
    const response = await invokeControllerRoute({ request, route, params: {}, config })
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: { code: 'RUNTIME_UNAVAILABLE', message: 'The request could not be completed.' } })
  })

  it('classifies a wrapped PostgreSQL failure without logging the database message', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const route: ControllerRoute = {
        method: 'POST', path: '/v2/example', handler: 'write', controller: {
          async write() {
            throw Object.assign(new Error('sensitive database message'), { code: 'P2010', meta: { code: '42P01', message: 'SELECT sensitive_column FROM secret_table' } })
          },
        }, parameters: [],
      }
      const request = new Request('https://api-beta.labofscents.org/api/v1/v2/example', {
        method: 'POST', headers: { Origin: 'https://beta.labofscents.org', 'Content-Type': 'application/json' }, body: '{}',
      })
      const response = await invokeControllerRoute({ request, route, params: {}, config })
      expect(response.status).toBe(500)
      expect(logger).toHaveBeenCalledWith(JSON.stringify({ event: 'v2_platform_runtime_failure', code: 'PG_42P01' }))
      expect(JSON.stringify(logger.mock.calls)).not.toContain('sensitive_column')
    } finally {
      logger.mockRestore()
    }
  })

  it('serves an exact-origin CORS preflight through the matched unsafe route', async () => {
    const route: ControllerRoute = { method: 'POST', path: '/v2/example', handler: 'write', controller: { async write() { return { ok: true } } }, parameters: [] }
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/example', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://tenant-a.api-beta.labofscents.org',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, x-csrf-token, idempotency-key',
      },
    })
    const matched = matchControllerRoute([route], new Request(request, { method: 'POST' }))
    const response = await invokeControllerRoute({ request, route: matched!.route, params: matched!.params, config })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tenant-a.api-beta.labofscents.org')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })
})
