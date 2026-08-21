import { isWorkspaceSlugEligibleForHostname } from '../../../src/data/workspaceHostnames.js'

export function workspaceSlugFromLocalOrigin(origin: string | undefined) {
  if (!origin) return undefined
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:' || parsed.port !== '5173' || !parsed.hostname.endsWith('.localhost')) {
      return undefined
    }
    const slug = parsed.hostname.slice(0, -'.localhost'.length)
    return isWorkspaceSlugEligibleForHostname(slug) ? slug : undefined
  } catch {
    return undefined
  }
}

export function isLocalWorkspaceOrigin(origin: string | undefined) {
  return Boolean(workspaceSlugFromLocalOrigin(origin))
}

export function localWorkspaceUrl(slug: string, sourceOrigin: string) {
  const source = new URL(sourceOrigin)
  source.protocol = 'http:'
  source.hostname = `${slug}.localhost`
  source.pathname = '/'
  source.search = ''
  source.hash = ''
  return source.toString().replace(/\/$/, '')
}
