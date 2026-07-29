import { describe, expect, it } from 'vitest'
import { isProtectedApplicationPath, loginPathForProtectedPath, publicRouteForPath, safeInternalNext } from './appRoutes'

describe('public and protected application routes', () => {
  it('maps public entry points explicitly', () => {
    expect(publicRouteForPath('/')).toBe('landing')
    expect(publicRouteForPath('/login')).toBe('login')
    expect(publicRouteForPath('/signup')).toBe('signup')
    expect(publicRouteForPath('/ai/formula-design-studio')).toBeNull()
  })

  it('only preserves allow-listed internal return locations', () => {
    expect(safeInternalNext('/ai/formula-design-studio?project=project-1')).toBe('/ai/formula-design-studio?project=project-1')
    expect(safeInternalNext('https://example.com/ai/formula-design-studio')).toBeNull()
    expect(safeInternalNext('//example.com')).toBeNull()
    expect(safeInternalNext('/workspace/inventory')).toBe('/workspace/inventory')
    expect(safeInternalNext('/settings')).toBeNull()
  })

  it('builds a login return route only for protected application paths', () => {
    expect(loginPathForProtectedPath('/ai/reformulation-optimizer')).toBe('/login?next=%2Fai%2Freformulation-optimizer')
    expect(loginPathForProtectedPath('/')).toBe('/login')
    expect(isProtectedApplicationPath('/ai/formula-agent')).toBe(true)
  })
})
