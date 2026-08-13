import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const diagnosticTokenHeader = "x-olfactoryops-candidate-runtime-diagnostic";
const candidateBaseDomain = "next.labofscents.org";
const rolePattern = /^[a-z_][a-z0-9_]{0,62}$/;
const sha256Pattern = /^[a-f0-9]{64}$/i;

export type V2TenantRouterRuntimeDiagnosticEnv = {
  HYPERDRIVE: Hyperdrive;
  CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN: string;
  DIAGNOSTIC_FIXTURE_HOSTNAME: string;
  TARGET_RELEASE_SHA: string;
  V2_EXPECTED_DATABASE_NAME_SHA: string;
  V2_RUNTIME_DB_ROLE: string;
};

type DatabaseIdentityRow = {
  databaseName: string;
  currentUserMatchesExpected: boolean;
  sessionUserMatchesExpected: boolean;
};

type SessionContextRow = {
  requestHostnameContextPresent: boolean;
  organizationContextPresent: boolean;
  userContextPresent: boolean;
};

type RlsMetadataRow = {
  workspaceHostnamesRlsEnabled: boolean;
  workspaceHostnamesForceRls: boolean;
  organizationsRlsEnabled: boolean;
  organizationsForceRls: boolean;
};

type ResolverMetadataRow = {
  resolverExists: boolean;
  resolverSecurityDefiner: boolean;
  functionOwnerOwnsWorkspaceHostnames: boolean;
  functionOwnerOwnsOrganizations: boolean;
  functionOwnerIsSuperuser: boolean;
  functionOwnerBypassRls: boolean;
  functionOwnerForceRlsConstrained: boolean;
};

export type CandidateRuntimeDiagnostic = {
  targetReleaseSha: string;
  databaseProbeCompleted: boolean;
  hyperdriveConnectionReachable: boolean;
  hyperdriveProductionDatabaseMatch: boolean;
  runtimeCurrentUserMatchesExpected: boolean;
  runtimeSessionUserMatchesExpected: boolean;
  sessionContextProbeCompleted: boolean;
  runtimeRequestHostnameContextPresent: boolean;
  runtimeOrganizationContextPresent: boolean;
  runtimeUserContextPresent: boolean;
  rlsMetadataProbeCompleted: boolean;
  workspaceHostnamesRls: boolean;
  workspaceHostnamesForceRls: boolean;
  organizationsRls: boolean;
  organizationsForceRls: boolean;
  resolverMetadataProbeCompleted: boolean;
  resolverExists: boolean;
  resolverSecurityDefiner: boolean;
  functionOwnerOwnsWorkspaceHostnames: boolean;
  functionOwnerOwnsOrganizations: boolean;
  functionOwnerIsSuperuser: boolean;
  functionOwnerBypassRls: boolean;
  functionOwnerForceRlsConstrained: boolean;
  resolverPrivilegeProbeCompleted: boolean;
  runtimeExecuteGranted: boolean;
  directHostnameProbeCompleted: boolean;
  runtimeDirectHostnameVisible: boolean;
  directOrganizationProbeCompleted: boolean;
  runtimeDirectOrganizationVisible: boolean;
  resolverInvocationProbeCompleted: boolean;
  runtimeResolverResult: boolean;
};

export type RuntimeDiagnosticProbeExecutor = {
  databaseIdentity: () => Promise<DatabaseIdentityRow>;
  sessionContext: () => Promise<SessionContextRow>;
  rlsMetadata: () => Promise<RlsMetadataRow>;
  resolverMetadata: () => Promise<ResolverMetadataRow>;
  resolverPrivilege: () => Promise<boolean>;
  directHostnameVisibility: () => Promise<boolean>;
  directOrganizationVisibility: () => Promise<boolean>;
  resolverInvocation: () => Promise<boolean>;
  disconnect: () => Promise<void>;
};

export type RuntimeDiagnosticProbeExecutorFactory = (
  env: V2TenantRouterRuntimeDiagnosticEnv,
  hostname: string,
) => RuntimeDiagnosticProbeExecutor;

export function normalizedDiagnosticFixtureHostname(value: string) {
  const hostname = value.trim().toLowerCase().replace(/\.$/, "");
  const suffix = `.${candidateBaseDomain}`;
  const label = hostname.endsWith(suffix)
    ? hostname.slice(0, -suffix.length)
    : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ? hostname : null;
}

function equalSecret(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function sha256(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function firstRow<T>(rows: T[]) {
  if (!rows[0]) throw new Error("diagnostic probe returned no row");
  return rows[0];
}

function createPrismaRuntimeProbeExecutor(
  env: V2TenantRouterRuntimeDiagnosticEnv,
  hostname: string,
): RuntimeDiagnosticProbeExecutor {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.HYPERDRIVE.connectionString,
    }),
  });

  return {
    async databaseIdentity() {
      return firstRow(
        await prisma.$queryRaw<DatabaseIdentityRow[]>`
        SELECT
          current_database() AS "databaseName",
          current_user = ${env.V2_RUNTIME_DB_ROLE} AS "currentUserMatchesExpected",
          session_user = ${env.V2_RUNTIME_DB_ROLE} AS "sessionUserMatchesExpected"
      `,
      );
    },
    async sessionContext() {
      return firstRow(
        await prisma.$queryRaw<SessionContextRow[]>`
        SELECT
          COALESCE(NULLIF(current_setting('app.request_hostname', true), ''), '') <> '' AS "requestHostnameContextPresent",
          COALESCE(NULLIF(current_setting('app.organization_id', true), ''), '') <> '' AS "organizationContextPresent",
          COALESCE(NULLIF(current_setting('app.user_id', true), ''), '') <> '' AS "userContextPresent"
      `,
      );
    },
    async rlsMetadata() {
      return firstRow(
        await prisma.$queryRaw<RlsMetadataRow[]>`
        SELECT
          COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.v2_workspace_hostnames'::regclass), false) AS "workspaceHostnamesRlsEnabled",
          COALESCE((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.v2_workspace_hostnames'::regclass), false) AS "workspaceHostnamesForceRls",
          COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.v2_organizations'::regclass), false) AS "organizationsRlsEnabled",
          COALESCE((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.v2_organizations'::regclass), false) AS "organizationsForceRls"
      `,
      );
    },
    async resolverMetadata() {
      return firstRow(
        await prisma.$queryRaw<ResolverMetadataRow[]>`
        SELECT
          EXISTS (
            SELECT 1
            FROM pg_proc function_definition
            INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
            WHERE namespace.nspname = 'public'
              AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
              AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
          ) AS "resolverExists",
          EXISTS (
            SELECT 1
            FROM pg_proc function_definition
            INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
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
            INNER JOIN pg_roles function_owner ON function_owner.oid = function_definition.proowner
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
              AND NOT function_owner.rolsuper
              AND NOT function_owner.rolbypassrls
          ) AS "functionOwnerForceRlsConstrained"
      `,
      );
    },
    async resolverPrivilege() {
      return firstRow(
        await prisma.$queryRaw<{ runtimeExecuteGranted: boolean }[]>`
        SELECT has_function_privilege(
          current_user,
          'public.v2_resolve_active_workspace_hostname(text)',
          'EXECUTE'
        ) AS "runtimeExecuteGranted"
      `,
      ).runtimeExecuteGranted;
    },
    async directHostnameVisibility() {
      return firstRow(
        await prisma.$queryRaw<{ visible: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM public.v2_workspace_hostnames hostname
          WHERE hostname.hostname = ${hostname}
            AND hostname.status = 'ACTIVE'
        ) AS "visible"
      `,
      ).visible;
    },
    async directOrganizationVisibility() {
      return firstRow(
        await prisma.$queryRaw<{ visible: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM public.v2_workspace_hostnames hostname
          INNER JOIN public.v2_organizations organization ON organization.id = hostname.organization_id
          WHERE hostname.hostname = ${hostname}
            AND hostname.status = 'ACTIVE'
            AND organization.status = 'ACTIVE'
        ) AS "visible"
      `,
      ).visible;
    },
    async resolverInvocation() {
      return firstRow(
        await prisma.$queryRaw<{ visible: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM public.v2_resolve_active_workspace_hostname(${hostname})
        ) AS "visible"
      `,
      ).visible;
    },
    disconnect: () => prisma.$disconnect(),
  };
}

function emptyDiagnostic(targetReleaseSha: string): CandidateRuntimeDiagnostic {
  return {
    targetReleaseSha,
    databaseProbeCompleted: false,
    hyperdriveConnectionReachable: false,
    hyperdriveProductionDatabaseMatch: false,
    runtimeCurrentUserMatchesExpected: false,
    runtimeSessionUserMatchesExpected: false,
    sessionContextProbeCompleted: false,
    runtimeRequestHostnameContextPresent: false,
    runtimeOrganizationContextPresent: false,
    runtimeUserContextPresent: false,
    rlsMetadataProbeCompleted: false,
    workspaceHostnamesRls: false,
    workspaceHostnamesForceRls: false,
    organizationsRls: false,
    organizationsForceRls: false,
    resolverMetadataProbeCompleted: false,
    resolverExists: false,
    resolverSecurityDefiner: false,
    functionOwnerOwnsWorkspaceHostnames: false,
    functionOwnerOwnsOrganizations: false,
    functionOwnerIsSuperuser: false,
    functionOwnerBypassRls: false,
    functionOwnerForceRlsConstrained: false,
    resolverPrivilegeProbeCompleted: false,
    runtimeExecuteGranted: false,
    directHostnameProbeCompleted: false,
    runtimeDirectHostnameVisible: false,
    directOrganizationProbeCompleted: false,
    runtimeDirectOrganizationVisible: false,
    resolverInvocationProbeCompleted: false,
    runtimeResolverResult: false,
  };
}

async function applyProbe<T>(run: () => Promise<T>, apply: (value: T) => void) {
  try {
    apply(await run());
  } catch {
    // Expected privilege and RLS failures are represented by a false completion flag.
  }
}

export async function inspectCandidateRuntime(
  env: V2TenantRouterRuntimeDiagnosticEnv,
  createExecutor: RuntimeDiagnosticProbeExecutorFactory = createPrismaRuntimeProbeExecutor,
): Promise<CandidateRuntimeDiagnostic> {
  const hostname = normalizedDiagnosticFixtureHostname(
    env.DIAGNOSTIC_FIXTURE_HOSTNAME,
  );
  if (
    !hostname ||
    !rolePattern.test(env.V2_RUNTIME_DB_ROLE) ||
    !sha256Pattern.test(env.V2_EXPECTED_DATABASE_NAME_SHA) ||
    !/^[a-f0-9]{40}$/i.test(env.TARGET_RELEASE_SHA)
  ) {
    throw new Error("candidate runtime diagnostic configuration is invalid");
  }

  const diagnostic = emptyDiagnostic(env.TARGET_RELEASE_SHA);
  const executor = createExecutor(env, hostname);
  try {
    try {
      const identity = await executor.databaseIdentity();
      diagnostic.databaseProbeCompleted = true;
      diagnostic.hyperdriveConnectionReachable = true;
      diagnostic.hyperdriveProductionDatabaseMatch = equalSecret(
        await sha256(identity.databaseName),
        env.V2_EXPECTED_DATABASE_NAME_SHA.toLowerCase(),
      );
      diagnostic.runtimeCurrentUserMatchesExpected =
        identity.currentUserMatchesExpected;
      diagnostic.runtimeSessionUserMatchesExpected =
        identity.sessionUserMatchesExpected;
    } catch {
      return diagnostic;
    }

    await applyProbe(
      () => executor.sessionContext(),
      (context) => {
        diagnostic.sessionContextProbeCompleted = true;
        diagnostic.runtimeRequestHostnameContextPresent =
          context.requestHostnameContextPresent;
        diagnostic.runtimeOrganizationContextPresent =
          context.organizationContextPresent;
        diagnostic.runtimeUserContextPresent = context.userContextPresent;
      },
    );
    await applyProbe(
      () => executor.rlsMetadata(),
      (metadata) => {
        diagnostic.rlsMetadataProbeCompleted = true;
        diagnostic.workspaceHostnamesRls =
          metadata.workspaceHostnamesRlsEnabled;
        diagnostic.workspaceHostnamesForceRls =
          metadata.workspaceHostnamesForceRls;
        diagnostic.organizationsRls = metadata.organizationsRlsEnabled;
        diagnostic.organizationsForceRls = metadata.organizationsForceRls;
      },
    );
    await applyProbe(
      () => executor.resolverMetadata(),
      (metadata) => {
        diagnostic.resolverMetadataProbeCompleted = true;
        diagnostic.resolverExists = metadata.resolverExists;
        diagnostic.resolverSecurityDefiner = metadata.resolverSecurityDefiner;
        diagnostic.functionOwnerOwnsWorkspaceHostnames =
          metadata.functionOwnerOwnsWorkspaceHostnames;
        diagnostic.functionOwnerOwnsOrganizations =
          metadata.functionOwnerOwnsOrganizations;
        diagnostic.functionOwnerIsSuperuser = metadata.functionOwnerIsSuperuser;
        diagnostic.functionOwnerBypassRls = metadata.functionOwnerBypassRls;
        diagnostic.functionOwnerForceRlsConstrained =
          metadata.functionOwnerForceRlsConstrained;
      },
    );
    await applyProbe(
      () => executor.resolverPrivilege(),
      (granted) => {
        diagnostic.resolverPrivilegeProbeCompleted = true;
        diagnostic.runtimeExecuteGranted = granted;
      },
    );
    await applyProbe(
      () => executor.directHostnameVisibility(),
      (visible) => {
        diagnostic.directHostnameProbeCompleted = true;
        diagnostic.runtimeDirectHostnameVisible = visible;
      },
    );
    await applyProbe(
      () => executor.directOrganizationVisibility(),
      (visible) => {
        diagnostic.directOrganizationProbeCompleted = true;
        diagnostic.runtimeDirectOrganizationVisible = visible;
      },
    );
    await applyProbe(
      () => executor.resolverInvocation(),
      (visible) => {
        diagnostic.resolverInvocationProbeCompleted = true;
        diagnostic.runtimeResolverResult = visible;
      },
    );
    return diagnostic;
  } finally {
    try {
      await executor.disconnect();
    } catch {
      // Connection teardown cannot expose diagnostic internals or erase probe evidence.
    }
  }
}

export function runtimeDiagnosticExecutionPass(
  diagnostic: CandidateRuntimeDiagnostic,
) {
  return (
    diagnostic.databaseProbeCompleted &&
    diagnostic.hyperdriveConnectionReachable &&
    diagnostic.hyperdriveProductionDatabaseMatch &&
    diagnostic.runtimeCurrentUserMatchesExpected &&
    diagnostic.runtimeSessionUserMatchesExpected
  );
}

export function resolverHealth(diagnostic: CandidateRuntimeDiagnostic) {
  if (!diagnostic.resolverInvocationProbeCompleted) return "UNPROVEN";
  return diagnostic.runtimeResolverResult ? "PASS" : "FAIL";
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

function unavailable() {
  return Response.json(
    { candidateRuntimeDiagnostic: "UNAVAILABLE" },
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export function createCandidateRuntimeDiagnostic(
  inspector = inspectCandidateRuntime,
) {
  return {
    async fetch(
      request: Request,
      env: V2TenantRouterRuntimeDiagnosticEnv,
    ): Promise<Response> {
      if (
        request.method !== "GET" ||
        !env.CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN ||
        !equalSecret(
          request.headers.get(diagnosticTokenHeader) ?? "",
          env.CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN,
        )
      ) {
        return notFound();
      }
      try {
        return Response.json(
          { candidateRuntimeDiagnostic: "COMPLETE", ...(await inspector(env)) },
          {
            headers: {
              "cache-control": "no-store",
              "x-content-type-options": "nosniff",
            },
          },
        );
      } catch {
        return unavailable();
      }
    },
  } satisfies ExportedHandler<V2TenantRouterRuntimeDiagnosticEnv>;
}

export default createCandidateRuntimeDiagnostic();
