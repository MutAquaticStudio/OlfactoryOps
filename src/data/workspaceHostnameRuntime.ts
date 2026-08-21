import { workspaceBaseDomainFromRuntime, workspaceRedirectOriginsFromRuntime } from './workspaceHostnames'

// Keep Vite-only configuration outside the hostname utility shared with the API and Worker builds.
export const browserWorkspaceBaseDomain = workspaceBaseDomainFromRuntime(import.meta.env.VITE_V2_WORKSPACE_BASE_DOMAIN)
export const browserWorkspaceRedirectOrigins = workspaceRedirectOriginsFromRuntime(import.meta.env.VITE_V2_WORKSPACE_ALLOWED_ORIGINS)
