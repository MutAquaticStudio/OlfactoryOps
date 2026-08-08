export type PublicRoute = 'landing' | 'login' | 'signup' | 'trialFeedback'

const protectedPaths = new Set(['/trials'])

const removedV1Prefixes = [
  '/ai/formula-agent',
  '/ai/formula-design-studio',
  '/ai/reformulation-optimizer',
  '/materials/catalogues/lluch-2026',
  '/formula-intelligence',
  '/imports',
]

/**
 * V1 product routes are intentionally unavailable during the pre-V2 hand-off.
 * This is a runtime boundary, not a CSS feature flag: callers receive a stable
 * removal code and must use the future V2 surface when it is released.
 */
export function isRemovedV1Path(pathname: string) {
  const normalized = pathname.replace(/^\/api\/v1(?=\/|$)/, '') || '/'
  return removedV1Prefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
}

export const removedV1RouteCode = 'V1_SURFACE_REMOVED'

export function publicRouteForPath(pathname: string): PublicRoute | null {
  if (pathname === '/') return 'landing'
  if (pathname === '/login') return 'login'
  if (pathname === '/signup') return 'signup'
  if (/^\/trial-feedback\/[^/]+$/.test(pathname)) return 'trialFeedback'
  return null
}

export function isProtectedApplicationPath(pathname: string) {
  return isRemovedV1Path(pathname) || protectedPaths.has(pathname) || pathname === '/workspace' || pathname.startsWith('/workspace/')
}

export function safeInternalNext(value: string | null | undefined) {
  if (!value) return null

  try {
    const url = new URL(value, 'https://olfactoryops.invalid')
    if (url.origin !== 'https://olfactoryops.invalid') return null
    if (isRemovedV1Path(url.pathname)) return null
    if (!isProtectedApplicationPath(url.pathname)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function resumePathForLocation(pathname: string, search = '', hash = '') {
  const directPath = safeInternalNext(`${pathname}${search}${hash}`)
  if (directPath) return directPath

  try {
    return safeInternalNext(new URLSearchParams(search).get('next'))
  } catch {
    return null
  }
}

export function loginPathForProtectedPath(pathname: string, search = '', hash = '') {
  if (isRemovedV1Path(pathname)) return '/login'
  if (!isProtectedApplicationPath(pathname)) return '/login'
  const next = `${pathname}${search}${hash}`
  return `/login?next=${encodeURIComponent(next)}`
}
