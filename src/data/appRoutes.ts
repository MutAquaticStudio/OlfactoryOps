export type PublicRoute = 'landing' | 'login' | 'signup'

const protectedPaths = new Set([
  '/ai/formula-agent',
  '/ai/formula-design-studio',
  '/ai/reformulation-optimizer',
])

export function publicRouteForPath(pathname: string): PublicRoute | null {
  if (pathname === '/') return 'landing'
  if (pathname === '/login') return 'login'
  if (pathname === '/signup') return 'signup'
  return null
}

export function isProtectedApplicationPath(pathname: string) {
  return protectedPaths.has(pathname) || pathname === '/workspace' || pathname.startsWith('/workspace/')
}

export function safeInternalNext(value: string | null | undefined) {
  if (!value) return null

  try {
    const url = new URL(value, 'https://olfactoryops.invalid')
    if (url.origin !== 'https://olfactoryops.invalid') return null
    if (!isProtectedApplicationPath(url.pathname)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function loginPathForProtectedPath(pathname: string, search = '', hash = '') {
  if (!isProtectedApplicationPath(pathname)) return '/login'
  const next = `${pathname}${search}${hash}`
  return `/login?next=${encodeURIComponent(next)}`
}
