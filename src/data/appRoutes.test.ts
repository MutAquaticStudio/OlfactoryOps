import { describe, expect, it } from 'vitest'
import { isProtectedApplicationPath, isRemovedV1Path, loginPathForProtectedPath, publicRouteForPath, removedV1RouteCode, resumePathForLocation, safeInternalNext } from './appRoutes'

describe('public and protected application routes', () => {
  it('maps public entry points explicitly', () => {
    expect(publicRouteForPath('/')).toBe('landing')
    expect(publicRouteForPath('/login')).toBe('login')
    expect(publicRouteForPath('/signup')).toBe('signup')
    expect(publicRouteForPath('/ai/formula-design-studio')).toBeNull()
  })

  it('only preserves allow-listed internal return locations', () => {
    expect(safeInternalNext('/ai/formula-design-studio?project=project-1')).toBeNull()
    expect(safeInternalNext('https://example.com/ai/formula-design-studio')).toBeNull()
    expect(safeInternalNext('//example.com')).toBeNull()
    expect(safeInternalNext('/workspace/inventory')).toBe('/workspace/inventory')
    expect(safeInternalNext('/settings')).toBeNull()
  })

  it('builds a login return route only for protected application paths', () => {
    expect(loginPathForProtectedPath('/ai/reformulation-optimizer')).toBe('/login')
    expect(loginPathForProtectedPath('/')).toBe('/login')
    expect(isProtectedApplicationPath('/ai/formula-agent')).toBe(true)
  })

  it('restores a validated return path from the public login query', () => {
    expect(resumePathForLocation('/login', '?next=%2Fworkspace%2Finventory')).toBe('/workspace/inventory')
    expect(resumePathForLocation('/ai/formula-design-studio')).toBeNull()
    expect(resumePathForLocation('/login', '?next=https%3A%2F%2Fexample.com')).toBeNull()
  })

  it('marks deprecated V1 product surfaces without treating them as current routes', () => {
    expect(isRemovedV1Path('/api/v1/formula-intelligence/design-projects')).toBe(true)
    expect(isRemovedV1Path('/materials/catalogues/lluch-2026')).toBe(true)
    expect(isRemovedV1Path('/api/v1/imports/preview')).toBe(true)
    expect(isRemovedV1Path('/api/v1/materials')).toBe(false)
    expect(removedV1RouteCode).toBe('V1_SURFACE_REMOVED')
  })
})
