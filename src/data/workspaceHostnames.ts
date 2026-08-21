export const defaultWorkspaceBaseDomain = 'labofscents.org'

/** These names have first-party routing or Cloudflare-for-SaaS responsibilities. */
export const reservedWorkspaceSlugs = new Set([
  'api',
  'app',
  'auth',
  'beta',
  'customers',
  'login',
  'signup',
  'saas-origin',
  'saas-origin-beta',
  'status',
  'test',
  'www',
])

const workspaceSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export type WorkspaceHostnameKind = 'SYSTEM' | 'CUSTOM'
export type WorkspaceHostnameStatus = 'ACTIVE' | 'PENDING_VALIDATION' | 'FAILED' | 'ARCHIVED'

export function workspaceBaseDomainFromRuntime(value: string | undefined) {
  const domain = value?.trim().toLowerCase().replace(/\.$/, '') || defaultWorkspaceBaseDomain
  return hostnamePattern.test(domain) ? domain : defaultWorkspaceBaseDomain
}


export function normalizeWorkspaceBaseDomain(value: string | undefined) {
  const domain = value?.trim().toLowerCase().replace(/\.$/, '') || defaultWorkspaceBaseDomain
  return hostnamePattern.test(domain) ? domain : defaultWorkspaceBaseDomain
}

export function normalizeWorkspaceHostname(value: string | undefined) {
  const hostname = value?.trim().toLowerCase().replace(/\.$/, '') || ''
  return hostnamePattern.test(hostname) ? hostname : undefined
}

export function isReservedWorkspaceSlug(slug: string) {
  return reservedWorkspaceSlugs.has(slug.trim().toLowerCase())
}

export function isWorkspaceSlugEligibleForHostname(slug: string) {
  const normalized = slug.trim().toLowerCase()
  return workspaceSlugPattern.test(normalized) && !isReservedWorkspaceSlug(normalized)
}

export function systemWorkspaceHostname(slug: string, baseDomain = defaultWorkspaceBaseDomain) {
  const normalizedSlug = slug.trim().toLowerCase()
  if (!isWorkspaceSlugEligibleForHostname(normalizedSlug)) {
    return undefined
  }
  return `${normalizedSlug}.${normalizeWorkspaceBaseDomain(baseDomain)}`
}

export function workspaceUrlForHostname(hostname: string | undefined) {
  const normalized = normalizeWorkspaceHostname(hostname)
  return normalized ? `https://${normalized}` : undefined
}

export function workspaceRedirectOriginsFromRuntime(value: string | undefined) {
  return (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => {
      try {
        const parsed = new URL(origin)
        return parsed.protocol === 'https:' && parsed.origin === origin && !parsed.username && !parsed.password && parsed.port === ''
      } catch {
        return false
      }
    })
}


/**
 * The API decides which workspace a user may enter. The browser accepts that
 * URL only when it is the expected system hostname or an explicit custom-origin
 * allowlist entry compiled into the public surface.
 */
export function trustedWorkspaceRedirectUrl(
  value: string | undefined,
  baseDomain = defaultWorkspaceBaseDomain,
  allowedCustomOrigins: readonly string[] = [],
) {
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    const isSystemWorkspace = isSystemWorkspaceHostname(parsed.hostname, baseDomain)
    const isAllowedCustomWorkspace = allowedCustomOrigins.includes(parsed.origin)
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin !== `https://${parsed.hostname}` ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== '/v2/workspace' ||
      parsed.search ||
      parsed.hash ||
      (!isSystemWorkspace && !isAllowedCustomWorkspace)
    ) {
      return undefined
    }
    return parsed.toString()
  } catch {
    return undefined
  }
}

/**
 * Keeps account discovery on the public site. The authenticated API response
 * remains the authority for the workspace hostname after a successful login.
 */
export function publicAuthUrlForWorkspaceOrigin(
  path: '/login' | '/signup',
  currentOrigin: string,
  baseDomain = defaultWorkspaceBaseDomain,
) {
  try {
    const current = new URL(currentOrigin)
    const normalizedBaseDomain = normalizeWorkspaceBaseDomain(baseDomain)
    if (current.protocol !== 'https:' || !isSystemWorkspaceHostname(current.hostname, normalizedBaseDomain)) {
      return undefined
    }
    return new URL(path, `https://${normalizedBaseDomain}`).toString()
  } catch {
    return undefined
  }
}

export function isSystemWorkspaceHostname(hostname: string | undefined, baseDomain = defaultWorkspaceBaseDomain) {
  const normalizedHostname = normalizeWorkspaceHostname(hostname)
  const normalizedBaseDomain = normalizeWorkspaceBaseDomain(baseDomain)
  if (!normalizedHostname || !normalizedHostname.endsWith(`.${normalizedBaseDomain}`)) {
    return false
  }
  const slug = normalizedHostname.slice(0, -(normalizedBaseDomain.length + 1))
  return !slug.includes('.') && isWorkspaceSlugEligibleForHostname(slug)
}

export function isExactHttpsOriginForHostname(origin: string | null, hostname: string) {
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    return (
      parsed.protocol === 'https:' &&
      parsed.origin === origin &&
      !parsed.username &&
      !parsed.password &&
      parsed.port === '' &&
      parsed.hostname === hostname
    )
  } catch {
    return false
  }
}
