import { describe, expect, it } from 'vitest'
import { isProtectedApplicationPath, loginPathForProtectedPath, publicRouteForPath, resumePathForLocation, safeInternalNext } from './appRoutes'

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

  it('restores a validated return path from the public login query', () => {
    expect(resumePathForLocation('/login', '?next=%2Fworkspace%2Finventory')).toBe('/workspace/inventory')
    expect(resumePathForLocation('/ai/formula-design-studio')).toBe('/ai/formula-design-studio')
    expect(resumePathForLocation('/login', '?next=https%3A%2F%2Fexample.com')).toBeNull()
  })
})
