import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const diagnosticTokenHeader = 'x-olfactoryops-candidate-runtime-diagnostic'
const candidateBaseDomain = 'next.labofscents.org'
const rolePattern = /^[a-z_][a-z0-9_]{0,62}$/
const sha256Pattern = /^[a-f0-9]{64}$/i

export type V2TenantRouterRuntimeDiagnosticEnv = {
  HYPERDRIVE: Hyperdrive
  CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN: string
  DIAGNOSTIC_FIXTURE_HOSTNAME: string
  TARGET_RELEASE_SHA: string
  V2_EXPECTED_DATABASE_NAME_SHA: string
  V2_RUNTIME_DB_ROLE: string
}

type RuntimeDiagnosticRow = {
  databaseName: string
  currentUserMatchesExpected: boolean
  sessionUserMatchesExpected: boolean
  directHostnameVisible: boolean
  directOrganizationVisible: boolean
  resolverResult: boolean
  workspaceHostnamesRlsEnabled: boolean
  workspaceHostnamesForceRls: boolean
  organizationsRlsEnabled: boolean
  organizationsForceRls: boolean
  resolverSecurityDefiner: boolean
  functionOwnerOwnsWorkspaceHostnames: boolean
  functionOwnerOwnsOrganizations: boolean
  functionOwnerIsSuperuser: boolean
  functionOwnerBypassRls: boolean
  functionOwnerForceRlsConstrained: boolean
  runtimeExecuteGranted: boolean
  requestHostnameContextPresent: boolean
  organizationContextPresent: boolean
  userContextPresent: boolean
}

export type CandidateRuntimeDiagnostic = {
  targetReleaseSha: string
  hyperdriveConnectionReachable: true
  hyperdriveProductionDatabaseMatch: boolean
  runtimeCurrentUserMatchesExpected: boolean
  runtimeSessionUserMatchesExpected: boolean
  runtimeDirectHostnameVisible: boolean
  runtimeDirectOrganizationVisible: boolean
  resolverQueryExecuted: true
  runtimeResolverResult: boolean
  workspaceHostnamesRls: boolean
  workspaceHostnamesForceRls: boolean
  organizationsRls: boolean
  organizationsForceRls: boolean
  resolverSecurityDefiner: boolean
  functionOwnerOwnsWorkspaceHostnames: boolean
  functionOwnerOwnsOrganizations: boolean
  functionOwnerIsSuperuser: boolean
  functionOwnerBypassRls: boolean
  functionOwnerForceRlsConstrained: boolean
  runtimeExecuteGranted: boolean
  runtimeRequestHostnameContextPresent: boolean
  runtimeOrganizationContextPresent: boolean
  runtimeUserContextPresent: boolean
}

export function normalizedDiagnosticFixtureHostname(value: string) {
  const hostname = value.trim().toLowerCase().replace(/\.$/, '')
  const suffix = `.${candidateBaseDomain}`
  const label = hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : ''
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ? hostname : null
}

function equalSecret(left: string, right: string) {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}

async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function runtimeDiagnosticFromRow(row: RuntimeDiagnosticRow, expectedDatabaseNameSha: string, databaseNameSha: string, targetReleaseSha: string): CandidateRuntimeDiagnostic {
  return {
    targetReleaseSha,
    hyperdriveConnectionReachable: true,
    hyperdriveProductionDatabaseMatch: equalSecret(databaseNameSha, expectedDatabaseNameSha.toLowerCase()),
    runtimeCurrentUserMatchesExpected: row.currentUserMatchesExpected,
    runtimeSessionUserMatchesExpected: row.sessionUserMatchesExpected,
    runtimeDirectHostnameVisible: row.directHostnameVisible,
    runtimeDirectOrganizationVisible: row.directOrganizationVisible,
    resolverQueryExecuted: true,
    runtimeResolverResult: row.resolverResult,
    workspaceHostnamesRls: row.workspaceHostnamesRlsEnabled,
    workspaceHostnamesForceRls: row.workspaceHostnamesForceRls,
    organizationsRls: row.organizationsRlsEnabled,
    organizationsForceRls: row.organizationsForceRls,
    resolverSecurityDefiner: row.resolverSecurityDefiner,
    functionOwnerOwnsWorkspaceHostnames: row.functionOwnerOwnsWorkspaceHostnames,
    functionOwnerOwnsOrganizations: row.functionOwnerOwnsOrganizations,
    functionOwnerIsSuperuser: row.functionOwnerIsSuperuser,
    functionOwnerBypassRls: row.functionOwnerBypassRls,
    functionOwnerForceRlsConstrained: row.functionOwnerForceRlsConstrained,
    runtimeExecuteGranted: row.runtimeExecuteGranted,
    runtimeRequestHostnameContextPresent: row.requestHostnameContextPresent,
    runtimeOrganizationContextPresent: row.organizationContextPresent,
    runtimeUserContextPresent: row.userContextPresent,
  }
}

export function runtimeDiagnosticExecutionPass(diagnostic: CandidateRuntimeDiagnostic) {
  return [
    diagnostic.hyperdriveConnectionReachable,
    diagnostic.hyperdriveProductionDatabaseMatch,
    diagnostic.runtimeCurrentUserMatchesExpected,
    diagnostic.runtimeSessionUserMatchesExpected,
    diagnostic.workspaceHostnamesRls,
    diagnostic.workspaceHostnamesForceRls,
    diagnostic.organizationsRls,
    diagnostic.organizationsForceRls,
    diagnostic.runtimeExecuteGranted,
    diagnostic.resolverQueryExecuted,
  ].every(Boolean)
    && !diagnostic.runtimeDirectHostnameVisible
    && !diagnostic.runtimeDirectOrganizationVisible
    && !diagnostic.runtimeRequestHostnameContextPresent
    && !diagnostic.runtimeOrganizationContextPresent
    && !diagnostic.runtimeUserContextPresent
}

export function resolverHealth(diagnostic: CandidateRuntimeDiagnostic) {
  return diagnostic.runtimeResolverResult ? 'PASS' : 'FAIL'
}

async function inspectCandidateRuntime(env: V2TenantRouterRuntimeDiagnosticEnv): Promise<CandidateRuntimeDiagnostic> {
  const hostname = normalizedDiagnosticFixtureHostname(env.DIAGNOSTIC_FIXTURE_HOSTNAME)
  if (!hostname || !rolePattern.test(env.V2_RUNTIME_DB_ROLE) || !sha256Pattern.test(env.V2_EXPECTED_DATABASE_NAME_SHA) || !/^[a-f0-9]{40}$/i.test(env.TARGET_RELEASE_SHA)) {
    throw new Error('candidate runtime diagnostic configuration is invalid')
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.HYPERDRIVE.connectionString }) })
  try {
    const rows = await prisma.$queryRaw<RuntimeDiagnosticRow[]>`
      SELECT
        current_database() AS "databaseName",
        current_user = ${env.V2_RUNTIME_DB_ROLE} AS "currentUserMatchesExpected",
        session_user = ${env.V2_RUNTIME_DB_ROLE} AS "sessionUserMatchesExpected",
        EXISTS (
          SELECT 1 FROM public.v2_workspace_hostnames hostname
          WHERE hostname.hostname = ${hostname} AND hostname.status = 'ACTIVE'
        ) AS "directHostnameVisible",
        EXISTS (
          SELECT 1
          FROM public.v2_workspace_hostnames hostname
          INNER JOIN public.v2_organizations organization ON organization.id = hostname.organization_id
          WHERE hostname.hostname = ${hostname}
            AND hostname.status = 'ACTIVE'
            AND organization.status = 'ACTIVE'
        ) AS "directOrganizationVisible",
        EXISTS (
          SELECT 1 FROM public.v2_resolve_active_workspace_hostname(${hostname})
        ) AS "resolverResult",
        COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.v2_workspace_hostnames'::regclass), false) AS "workspaceHostnamesRlsEnabled",
        COALESCE((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.v2_workspace_hostnames'::regclass), false) AS "workspaceHostnamesForceRls",
        COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.v2_organizations'::regclass), false) AS "organizationsRlsEnabled",
        COALESCE((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.v2_organizations'::regclass), false) AS "organizationsForceRls",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_roles function_owner ON function_owner.oid = function_definition.proowner
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
        ) AS "resolverSecurityDefiner",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_class workspace_hostnames ON workspace_hostnames.oid = 'public.v2_workspace_hostnames'::regclass
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
            AND function_definition.proowner = workspace_hostnames.relowner
        ) AS "functionOwnerOwnsWorkspaceHostnames",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_class organizations ON organizations.oid = 'public.v2_organizations'::regclass
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
            AND function_definition.proowner = organizations.relowner
        ) AS "functionOwnerOwnsOrganizations",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_roles function_owner ON function_owner.oid = function_definition.proowner
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
            AND function_owner.rolsuper
        ) AS "functionOwnerIsSuperuser",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_roles function_owner ON function_owner.oid = function_definition.proowner
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
            AND function_owner.rolbypassrls
        ) AS "functionOwnerBypassRls",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_class workspace_hostnames ON workspace_hostnames.oid = 'public.v2_workspace_hostnames'::regclass
          INNER JOIN pg_class organizations ON organizations.oid = 'public.v2_organizations'::regclass
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
            AND function_definition.proowner = workspace_hostnames.relowner
            AND function_definition.proowner = organizations.relowner
            AND workspace_hostnames.relforcerowsecurity
            AND organizations.relforcerowsecurity
        ) AS "functionOwnerForceRlsConstrained",
        has_function_privilege(current_user, 'public.v2_resolve_active_workspace_hostname(text)', 'EXECUTE') AS "runtimeExecuteGranted",
        COALESCE(NULLIF(current_setting('app.request_hostname', true), ''), '') <> '' AS "requestHostnameContextPresent",
        COALESCE(NULLIF(current_setting('app.organization_id', true), ''), '') <> '' AS "organizationContextPresent",
        COALESCE(NULLIF(current_setting('app.user_id', true), ''), '') <> '' AS "userContextPresent"
    `
    const row = rows[0]
    if (!row) throw new Error('candidate runtime diagnostic returned no row')
    return runtimeDiagnosticFromRow(row, env.V2_EXPECTED_DATABASE_NAME_SHA, await sha256(row.databaseName), env.TARGET_RELEASE_SHA)
  } finally {
    await prisma.$disconnect()
  }
}

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'cache-control': 'no-store, max-age=0', 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' },
  })
}

function unavailable() {
  return Response.json({ candidateRuntimeDiagnostic: 'UNAVAILABLE' }, {
    status: 503,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}

export function createCandidateRuntimeDiagnostic(inspector = inspectCandidateRuntime) {
  return {
    async fetch(request: Request, env: V2TenantRouterRuntimeDiagnosticEnv): Promise<Response> {
      if (request.method !== 'GET' || !env.CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN || !equalSecret(request.headers.get(diagnosticTokenHeader) ?? '', env.CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN)) {
        return notFound()
      }
      try {
        return Response.json({ candidateRuntimeDiagnostic: 'COMPLETE', ...(await inspector(env)) }, {
          headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
        })
      } catch {
        return unavailable()
      }
    },
  } satisfies ExportedHandler<V2TenantRouterRuntimeDiagnosticEnv>
}

export default createCandidateRuntimeDiagnostic()
