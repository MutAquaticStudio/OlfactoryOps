import { describe, expect, it, vi } from 'vitest'
import { PlatformError } from '../../services/platform/src/service.js'
import { workspaceFeatureRouteContract } from '../../src/features/v2-platform/feature-route-contract.js'
import { v2ControllerRoutes, type ControllerRoute } from './controller-registry.js'
import { generatedRouteSpecs } from './generated-route-specs.js'
import type { V2ApiServices } from './service-container.js'
import { invokeControllerRoute, matchControllerRoute, runtimeInitializationFailureResponse, unmatchedRouteResponse } from './transport.js'

const config = { publicHostname: 'api-beta.labofscents.org', publicPageHostname: 'beta.labofscents.org', tenantBaseDomain: 'api-beta.labofscents.org' }

describe('V2 Worker transport', () => {
  it('uses the generated Phase 1-6 route matrix and excludes later public modules', () => {
    expect(generatedRouteSpecs.length).toBeGreaterThan(100)
    expect(generatedRouteSpecs).toContainEqual(expect.objectContaining({ method: 'POST', path: '/v2/platform/auth/login' }))
    expect(generatedRouteSpecs).toContainEqual(expect.objectContaining({ method: 'POST', path: '/v2/platform/auth/password-reset/request' }))
    expect(generatedRouteSpecs).toContainEqual(expect.objectContaining({ method: 'POST', path: '/v2/platform/auth/password-reset/confirm' }))
    expect(generatedRouteSpecs).toContainEqual(expect.objectContaining({ method: 'POST', path: '/v2/lab/materials' }))
    expect(generatedRouteSpecs.some((route) => /\/v2\/(trials|production|commerce|advanced)(\/|$)/.test(route.path))).toBe(false)
  })

  it('keeps every public API-backed workspace feature aligned with the generated Worker matrix', () => {
    const publicApiFeatures = workspaceFeatureRouteContract.filter((feature) => feature.publicAvailability === 'ENABLED' && feature.apiClient !== 'client-only')
    for (const feature of publicApiFeatures) {
      const prefix = feature.apiBase.replace('/api/v1', '')
      expect(generatedRouteSpecs.some((route) => route.path.startsWith(prefix))).toBe(true)
    }
    for (const feature of workspaceFeatureRouteContract.filter((feature) => feature.publicAvailability === 'DISABLED')) {
      const prefix = feature.apiBase.replace('/api/v1', '')
      expect(generatedRouteSpecs.some((route) => route.path.startsWith(prefix))).toBe(false)
    }
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

  it('keeps a trusted tenant-origin PlatformError readable to the browser', async () => {
    const route: ControllerRoute = {
      method: 'GET', path: '/v2/example', handler: 'read', controller: {
        async read() { throw new PlatformError('CAPABILITY_DENIED', 'Permission is required.', 403) },
      }, parameters: [],
    }
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/example', {
      headers: { Origin: 'https://tenant-a.api-beta.labofscents.org' },
    })
    const response = await invokeControllerRoute({ request, route, params: {}, config })
    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tenant-a.api-beta.labofscents.org')
    await expect(response.json()).resolves.toEqual({ error: expect.objectContaining({ code: 'CAPABILITY_DENIED' }) })
  })

  it('returns a JSON CORS 404 for a trusted tenant origin before route dispatch', async () => {
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/not-exposed', {
      headers: { Origin: 'https://tenant-a.api-beta.labofscents.org' },
    })
    const response = unmatchedRouteResponse(request, config)
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tenant-a.api-beta.labofscents.org')
    await expect(response.json()).resolves.toEqual({ error: expect.objectContaining({ code: 'NOT_FOUND' }) })
  })

  it('keeps CORS on a trusted-origin unmatched OPTIONS response', async () => {
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/not-exposed', {
      method: 'OPTIONS',
      headers: { Origin: 'https://tenant-a.api-beta.labofscents.org', 'Access-Control-Request-Method': 'GET' },
    })
    const response = unmatchedRouteResponse(request, config)
    expect(response.status).toBe(404)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tenant-a.api-beta.labofscents.org')
    expect(response.headers.get('access-control-allow-methods')).toContain('GET')
  })

  it('returns a JSON CORS 404 for the exact trusted public apex origin', async () => {
    const productionConfig = { publicHostname: 'api.labofscents.org', publicPageHostname: 'labofscents.org', tenantBaseDomain: 'labofscents.org' }
    const request = new Request('https://api.labofscents.org/api/v1/v2/not-exposed', { headers: { Origin: 'https://labofscents.org' } })
    const response = unmatchedRouteResponse(request, productionConfig)
    expect(response.status).toBe(404)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://labofscents.org')
  })

  it('does not broaden CORS for an untrusted unmatched origin', async () => {
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/not-exposed', { headers: { Origin: 'https://untrusted.example' } })
    const response = unmatchedRouteResponse(request, config)
    expect(response.status).toBe(404)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('continues to deny a matched request from an untrusted origin', async () => {
    const route: ControllerRoute = { method: 'GET', path: '/v2/example', handler: 'read', controller: { async read() { return { ok: true } } }, parameters: [] }
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/example', { headers: { Origin: 'https://untrusted.example' } })
    const response = await invokeControllerRoute({ request, route, params: {}, config })
    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    await expect(response.json()).resolves.toEqual({ error: expect.objectContaining({ code: 'ORIGIN_DENIED' }) })
  })

  it('preserves trusted-origin CORS when Worker initialization is unavailable', async () => {
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/platform/health', {
      headers: { Origin: 'https://tenant-a.api-beta.labofscents.org' },
    })
    const response = runtimeInitializationFailureResponse(request, config, 503)
    expect(response.status).toBe(503)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tenant-a.api-beta.labofscents.org')
    await expect(response.json()).resolves.toEqual({ error: expect.objectContaining({ code: 'RUNTIME_NOT_CONFIGURED' }) })
  })

  it('preserves trusted-origin CORS for a generic Worker initialization failure', async () => {
    const request = new Request('https://api-beta.labofscents.org/api/v1/v2/platform/health', {
      headers: { Origin: 'https://tenant-a.api-beta.labofscents.org' },
    })
    const response = runtimeInitializationFailureResponse(request, config, 500)
    expect(response.status).toBe(500)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tenant-a.api-beta.labofscents.org')
    await expect(response.json()).resolves.toEqual({ error: expect.objectContaining({ code: 'RUNTIME_UNAVAILABLE' }) })
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
