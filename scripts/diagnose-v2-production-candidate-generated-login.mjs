import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import {
  closeSync,
  chmodSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const RC9_SHA = "de0734df2d2b5b2dd3a2a67ee542131235e75eb7";
export const API_ORIGIN = "https://api-next.labofscents.org";
export const API_SERVICE = "olfactoryops-v2-api-production-candidate";
export const REQUIRED_SECRET_NAMES = [
  "V2_SESSION_PEPPER",
  "V2_PASSWORD_PEPPER",
  "V2_INVITATION_ENCRYPTION_KEY",
];
export const REQUIRED_VARS = {
  V2_WORKSPACE_BASE_DOMAIN: "next.labofscents.org",
  V2_API_PUBLIC_HOSTNAME: "api-next.labofscents.org",
  V2_PLATFORM_ADMIN_HOSTNAME: "admin-next.labofscents.org",
  RELEASE_ENVIRONMENT: "production",
  RELEASE_GIT_SHA: RC9_SHA,
};
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,79}$/;
const SAFE_RUNTIME_CODE =
  /^(?:[A-Z][A-Z0-9_]{1,79}|PG_[0-9A-Z]{5}|PRISMA_P[0-9]{4})$/;

function fail(code) {
  throw new Error(`GENERATED_LOGIN_DIAGNOSTIC_FAIL:${code}`);
}
function bool(value) {
  return value === true ? "PASS" : "FAIL";
}
function safeStatus(value) {
  return Number.isInteger(value) && value >= 0 && value <= 599
    ? String(value)
    : "0";
}
function safeCode(value) {
  return typeof value === "string" && SAFE_ERROR_CODE.test(value)
    ? value
    : "NO_STABLE_ERROR_CODE";
}
function emit(emitRecord, record) {
  emitRecord(record);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeRuntimeCode(value) {
  return typeof value === "string" && SAFE_RUNTIME_CODE.test(value)
    ? value
    : "UNCLASSIFIED";
}

export function inspectLoginRuntimeTail(capture) {
  const codes = new Set();
  const inspect = (value) => {
    if (!value || typeof value !== "object") {
      if (typeof value === "string") {
        try {
          inspect(JSON.parse(value));
        } catch {
          // Raw log content is intentionally never returned or emitted.
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    if (value.event === "v2_platform_runtime_failure") {
      codes.add(safeRuntimeCode(value.code));
    }
    for (const nested of Object.values(value)) inspect(nested);
  };
  for (const line of String(capture ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      inspect(JSON.parse(line));
    } catch {
      // Raw Tail records are parsed only in memory.
    }
  }
  return {
    eventCaptured: codes.size > 0 ? "YES" : "NO",
    safeCode: codes.size === 1 ? [...codes][0] : "UNCLASSIFIED",
  };
}

function terminateProcess(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

export function validateDiagnosticEnvironment(environment = process.env) {
  const expected = {
    RELEASE_SHA: RC9_SHA,
    CONFIRM_DIAGNOSTIC: "DIAGNOSE_RC9_GENERATED_LOGIN",
    V2_PRODUCTION_CANDIDATE_API_ORIGIN: API_ORIGIN,
    V2_PRODUCTION_CANDIDATE_WORKSPACE_BASE_DOMAIN: "next.labofscents.org",
  };
  for (const [name, value] of Object.entries(expected))
    if (environment[name] !== value) fail(`INVALID_${name}`);
  const tenant = environment.V2_PRODUCTION_CANDIDATE_TENANT_URL;
  if (
    typeof tenant !== "string" ||
    !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/.test(
      tenant,
    )
  )
    fail("INVALID_CANDIDATE_TENANT_URL");
  if (!environment.PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL)
    fail("DATABASE_CREDENTIAL_MISSING");
  return expected;
}

export function inspectActiveApiVersion(envelope) {
  const deployments =
    envelope?.success === true && Array.isArray(envelope?.result?.deployments)
      ? envelope.result.deployments
      : [];
  const active = deployments[0];
  const versions =
    active?.strategy === "percentage" && Array.isArray(active.versions)
      ? active.versions
      : [];
  const selected =
    versions.length === 1 && versions[0]?.percentage === 100
      ? versions[0]?.version_id
      : undefined;
  return {
    pass: typeof selected === "string" && /^[0-9a-f-]{36}$/i.test(selected),
    versionId: selected,
  };
}

export function inspectBindings(envelope, expectedVersionId) {
  const bindings = Array.isArray(envelope?.result?.resources?.bindings)
    ? envelope.result.resources.bindings
    : [];
  const named = (name, type) =>
    bindings.filter(
      (binding) => binding?.name === name && binding?.type === type,
    );
  const hyperdrive = named("HYPERDRIVE", "hyperdrive").length === 1;
  const secrets = Object.fromEntries(
    REQUIRED_SECRET_NAMES.map((name) => [
      name,
      named(name, "secret_text").length === 1,
    ]),
  );
  const variables = Object.fromEntries(
    Object.entries(REQUIRED_VARS).map(([name, value]) => {
      const matches = named(name, "plain_text");
      return [name, matches.length === 1 && matches[0]?.text === value];
    }),
  );
  // This hostname is candidate-specific but not security-sensitive; its exact value is intentionally not emitted.
  const publicPages =
    named("V2_PUBLIC_PAGES_HOSTNAME", "plain_text").length === 1;
  return {
    versionIdMatch:
      typeof expectedVersionId === "string" &&
      envelope?.result?.id === expectedVersionId,
    hyperdrive,
    secrets,
    variables: { ...variables, V2_PUBLIC_PAGES_HOSTNAME: publicPages },
    pass:
      envelope?.result?.id === expectedVersionId &&
      hyperdrive &&
      Object.values(secrets).every(Boolean) &&
      Object.values(variables).every(Boolean) &&
      publicPages,
  };
}

export function verifyPbkdf2V2(email, password, encoded, pepper) {
  const parts = typeof encoded === "string" ? encoded.split(":") : [];
  if (
    parts.length !== 6 ||
    parts[0] !== "pbkdf2" ||
    parts[1] !== "v2" ||
    parts[2] !== "sha256"
  )
    return false;
  const iterations = Number(parts[3]);
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    !parts[4] ||
    !parts[5]
  )
    return false;
  try {
    const candidate = pbkdf2Sync(
      `${pepper}:${email.toLowerCase()}:${password}`,
      parts[4],
      iterations,
      32,
      "sha256",
    );
    const expected = Buffer.from(parts[5], "base64url");
    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  } catch {
    return false;
  }
}

export function classifyLoginDiagnostic({
  preflightPass,
  passwordVerify,
  generatedLogin,
  publicLogin,
  versionStable,
}) {
  if (!preflightPass) return "CANDIDATE_API_RUNTIME_BINDING_DRIFT";
  if (!versionStable) return "CANDIDATE_API_VERSION_CHANGED_DURING_DIAGNOSTIC";
  if (passwordVerify === "FAIL") return "PASSWORD_HASH_OR_PEPPER_COHERENCE";
  if (generatedLogin?.status !== 200 && publicLogin?.status === 200)
    return "GENERATED_HOST_LOGIN_RESOLUTION_PATH";
  if (generatedLogin?.status !== 200 && publicLogin?.status !== 200)
    return "LOGIN_SPECIFIC_RUNTIME_OR_TRANSACTION_PATH";
  return "UNPROVEN";
}

export function classifyLoginPhase(state) {
  if (!state.userExists)
    return { phase: "LOGIN_FIND_USER", category: "DATABASE_RLS" };
  if (state.passwordVerify === "FAIL")
    return {
      phase: "LOGIN_VERIFY_PASSWORD",
      category: "PASSWORD_VERIFICATION",
    };
  if (!state.membershipExists || !state.membershipActive)
    return { phase: "LOGIN_LIST_MEMBERSHIPS", category: "DATABASE_RLS" };
  if (
    !state.hostnameExists ||
    !state.hostnameActive ||
    !state.hostnameOrganizationMatch
  )
    return { phase: "LOGIN_RESOLVE_HOSTNAME", category: "HOSTNAME_RESOLUTION" };
  if (!state.defaultHostname)
    return {
      phase: "LOGIN_FIND_DEFAULT_HOSTNAME",
      category: "HOSTNAME_RESOLUTION",
    };
  return { phase: "UNCLASSIFIED", category: "UNCLASSIFIED" };
}

export function classifySecondStageLogin({
  sessionContext,
  branding,
  billing,
  generatedLogin,
  publicLogin,
  runtimeCode,
  catalog,
  versionStable,
}) {
  if (versionStable !== "YES")
    return {
      phase: "UNPROVEN",
      category: "UNCLASSIFIED",
      rootCause: "CANDIDATE_API_VERSION_CHANGED_DURING_DIAGNOSTIC",
    };
  if (sessionContext?.status !== 200)
    return {
      phase: "LOGIN_SESSION_CONTEXT_PATH",
      category: "PLATFORM_ERROR",
      rootCause: "LOGIN_SPECIFIC_RUNTIME_OR_TRANSACTION_PATH",
    };
  if (branding?.status !== 200)
    return {
      phase: "LOGIN_TENANT_SCOPED_REPOSITORY_PATH",
      category: "PLATFORM_ERROR",
      rootCause: "LOGIN_SPECIFIC_RUNTIME_OR_TRANSACTION_PATH",
    };
  if (billing?.status !== 200)
    return {
      phase: "LOGIN_GET_BILLING",
      category: "BILLING_READ",
      rootCause: "LOGIN_BILLING_READ_PATH",
    };
  if (generatedLogin?.status !== 200 && publicLogin?.status !== 200) {
    const privilegeFailure = Object.values(catalog ?? {}).some(
      (value) => value === false,
    );
    if (
      (runtimeCode === "POSTGRES_PERMISSION_DENIED" ||
        runtimeCode === "PG_42501") &&
      privilegeFailure
    )
      return {
        phase: "UNPROVEN",
        category: "DATABASE_PERMISSION",
        rootCause: "LOGIN_RUNTIME_DATABASE_PRIVILEGE_DRIFT",
      };
    if (runtimeCode === "POSTGRES_RLS_DENIED")
      return {
        phase: "UNPROVEN",
        category: "DATABASE_RLS",
        rootCause: "LOGIN_RUNTIME_RLS_POLICY_PATH",
      };
    return {
      phase: "UNCLASSIFIED",
      category: "UNCLASSIFIED",
      rootCause: "LOGIN_SPECIFIC_RUNTIME_OR_TRANSACTION_PATH",
    };
  }
  return {
    phase: "NOT_APPLICABLE",
    category: "NOT_APPLICABLE",
    rootCause: "UNPROVEN",
  };
}

function credentials() {
  const suffix = randomBytes(12).toString("hex");
  return {
    email: `generated-login-${suffix}@candidate.invalid`,
    password: `Generated-${suffix}-Password!47`,
    displayName: "Generated login diagnostic",
    slug: `generated-login-${suffix}`,
  };
}

export async function runGeneratedLoginDiagnostic({
  adapters,
  environment = process.env,
  emitRecord = (record) => console.log(JSON.stringify(record)),
}) {
  validateDiagnosticEnvironment(environment);
  let fixtureCreated = false;
  let fixture;
  let cleanupError;
  let executionError;
  let rootCauseEmitted = false;
  let beforeVersion;
  let versionStability = "UNPROVEN";
  let cleanupRequired = false;
  let runtimeCapture;
  const state = {};

  try {
    const health = await adapters.health();
    const healthPass =
      health.status === 200 &&
      health.runtime === "v2-api-worker/1" &&
      health.environment === "production" &&
      health.database === "hyperdrive" &&
      health.releaseGitSha === RC9_SHA;
    emit(emitRecord, { CANDIDATE_API_RELEASE_IDENTITY: bool(healthPass) });
    if (!healthPass) fail("CANDIDATE_API_RELEASE_IDENTITY");

    beforeVersion = await adapters.activeVersion();
    emit(emitRecord, {
      CANDIDATE_API_ACTIVE_VERSION_CAPTURED: bool(beforeVersion?.pass),
      ...(beforeVersion?.pass
        ? { CANDIDATE_API_ACTIVE_VERSION_ID: beforeVersion.versionId }
        : {}),
    });
    if (!beforeVersion?.pass) fail("CANDIDATE_API_ACTIVE_VERSION");

    const binding = await adapters.bindings(beforeVersion.versionId);
    emit(emitRecord, {
      CANDIDATE_API_HYPERDRIVE_BINDING: bool(binding.hyperdrive),
      CANDIDATE_API_SECRET_BINDING_NAMES: bool(
        Object.values(binding.secrets).every(Boolean),
      ),
      CANDIDATE_API_RUNTIME_VARS: bool(
        Object.values(binding.variables).every(Boolean),
      ),
    });
    if (!binding.pass) fail("CANDIDATE_API_RUNTIME_BINDING_DRIFT");
    if (!adapters.databaseCredentialPresent())
      fail("DATABASE_CREDENTIAL_MISSING");
    emit(emitRecord, { FIXTURE_CREATION_GUARDS: "PASS" });
    runtimeCapture = await adapters.startRuntimeLogCapture?.(
      beforeVersion.versionId,
    );

    // The sole fixture creation entrypoint remains behind all same-run guards above.
    if (fixtureCreated) fail("SECOND_FIXTURE_REJECTED");
    const identity = credentials();
    const signup = await adapters.signup(identity);
    if (signup.status !== 200 || !signup.fixture)
      fail("DIAGNOSTIC_SIGNUP_FAILED");
    fixture = { ...signup.fixture, identity };
    fixtureCreated = true;
    cleanupRequired = true;
    emit(emitRecord, { DIAGNOSTIC_SIGNUP: "PASS" });
    await adapters.afterSignup?.(fixture);

    state.db = await adapters.inspectFixture(fixture);
    emit(emitRecord, {
      USER_EXISTS: bool(state.db.userExists),
      USER_STATUS_ACTIVE: bool(state.db.userActive),
      PASSWORD_HASH_PRESENT: bool(state.db.passwordHashPresent),
      PASSWORD_HASH_FORMAT_PBKDF2_V2: bool(state.db.passwordHashPbkdf2V2),
      MEMBERSHIP_EXISTS: bool(state.db.membershipExists),
      MEMBERSHIP_ACTIVE: bool(state.db.membershipActive),
      ORGANIZATION_ACTIVE: bool(state.db.organizationActive),
      GENERATED_HOSTNAME_EXISTS: bool(state.db.hostnameExists),
      GENERATED_HOSTNAME_ACTIVE: bool(state.db.hostnameActive),
      GENERATED_HOSTNAME_ORGANIZATION_MATCH: bool(
        state.db.hostnameOrganizationMatch,
      ),
    });
    await adapters.afterDbRead?.(fixture);

    await adapters.markVerified(fixture.userId);
    const verified = await adapters.userVerified(fixture.userId);
    emit(emitRecord, { USER_VERIFIED: verified ? "YES" : "NO" });
    if (!verified) fail("USER_VERIFICATION_FAILED");
    await adapters.afterVerification?.(fixture);

    const passwordVerify = adapters.passwordPepperAvailable()
      ? verifyPbkdf2V2(
          fixture.identity.email,
          fixture.identity.password,
          state.db.passwordHash,
          adapters.passwordPepper(),
        )
        ? "PASS"
        : "FAIL"
      : "UNPROVEN";
    emit(emitRecord, { GENERATED_PASSWORD_VERIFY: passwordVerify });

    const resolved = await adapters.resolveHostname(fixture.hostname);
    const hostnamePass =
      state.db.hostnameExists &&
      state.db.hostnameActive &&
      state.db.hostnameOrganizationMatch;
    const resolutionPass = resolved === fixture.organizationId;
    emit(emitRecord, {
      GENERATED_HOSTNAME_DB_STATE: bool(hostnamePass),
      GENERATED_HOSTNAME_RESOLUTION: bool(resolutionPass),
    });

    const sessionContext = await adapters.control({
      path: "/v2/platform/auth/email-verification/status",
      hostname: fixture.hostname,
      cookie: fixture.signupCookie,
    });
    emit(emitRecord, {
      SIGNUP_SESSION_CONTEXT_STATUS: safeStatus(sessionContext.status),
      SIGNUP_SESSION_CONTEXT_ERROR_CODE: safeCode(sessionContext.errorCode),
      SIGNUP_SESSION_CONTEXT: sessionContext.status === 200 ? "PASS" : "FAIL",
    });

    const branding = await adapters.control({
      path: "/v2/platform/workspace/branding",
      hostname: fixture.hostname,
      cookie: fixture.signupCookie,
    });
    emit(emitRecord, {
      BRANDING_CONTROL_STATUS: safeStatus(branding.status),
      BRANDING_CONTROL_ERROR_CODE: safeCode(branding.errorCode),
      GENERIC_TENANT_SCOPED_READ: branding.status === 200 ? "PASS" : "FAIL",
    });

    const billing = await adapters.control({
      path: "/v2/platform/workspace/billing",
      hostname: fixture.hostname,
      cookie: fixture.signupCookie,
    });
    emit(emitRecord, {
      BILLING_CONTROL_STATUS: safeStatus(billing.status),
      BILLING_CONTROL_ERROR_CODE: safeCode(billing.errorCode),
    });

    const catalog = await adapters.inspectLoginCatalog();
    emit(emitRecord, {
      LOGIN_TABLE_USERS_SELECT: bool(catalog.usersSelect),
      LOGIN_TABLE_MEMBERSHIPS_SELECT: bool(catalog.membershipsSelect),
      LOGIN_TABLE_HOSTNAMES_SELECT: bool(catalog.hostnamesSelect),
      LOGIN_TABLE_SESSIONS_INSERT: bool(catalog.sessionsInsert),
      LOGIN_TABLE_AUDIT_INSERT: bool(catalog.auditInsert),
      BILLING_SUBSCRIPTIONS_SELECT: bool(catalog.subscriptionsSelect),
      BILLING_PLANS_SELECT: bool(catalog.plansSelect),
      BILLING_ENTITLEMENTS_SELECT: bool(catalog.entitlementsSelect),
      BILLING_USAGE_LIMITS_SELECT: bool(catalog.usageLimitsSelect),
      LOGIN_CATALOG_RLS_METADATA: bool(catalog.rlsMetadata),
    });
    const billingState = await adapters.inspectBillingFixture(fixture);
    emit(emitRecord, {
      GENERATED_SUBSCRIPTION_EXISTS: billingState.subscriptionExists
        ? "YES"
        : "NO",
      GENERATED_SUBSCRIPTION_PLAN_ID_EXPECTED:
        billingState.subscriptionPlanExpected ? "YES" : "NO",
      GENERATED_PLAN_EXISTS: billingState.planExists ? "YES" : "NO",
      GENERATED_ENTITLEMENT_COUNT_NONZERO: billingState.entitlementCountNonzero
        ? "YES"
        : "NO",
      GENERATED_USAGE_LIMIT_QUERYABLE: billingState.usageLimitQueryable
        ? "YES"
        : "NO",
    });

    const generatedLogin = await adapters.login({
      hostname: fixture.hostname,
      identity: fixture.identity,
    });
    emit(emitRecord, {
      GENERATED_HOST_LOGIN_STATUS: safeStatus(generatedLogin.status),
      GENERATED_HOST_LOGIN_ERROR_CODE: safeCode(generatedLogin.errorCode),
      GENERATED_HOST_LOGIN_COOKIE_PRESENT:
        generatedLogin.cookiePresent === true ? "YES" : "NO",
      GENERATED_HOST_LOGIN_CSRF_PRESENT:
        generatedLogin.csrfPresent === true ? "YES" : "NO",
    });
    let publicLogin = { status: 0, errorCode: "NOT_ATTEMPTED" };
    if (generatedLogin.status !== 200) {
      publicLogin = await adapters.login({
        hostname: "api-next.labofscents.org",
        identity: fixture.identity,
      });
      emit(emitRecord, {
        PUBLIC_HOST_LOGIN_STATUS: safeStatus(publicLogin.status),
        PUBLIC_HOST_LOGIN_ERROR_CODE: safeCode(publicLogin.errorCode),
      });
    } else
      emit(emitRecord, {
        PUBLIC_HOST_LOGIN_STATUS: "NOT_ATTEMPTED",
        PUBLIC_HOST_LOGIN_ERROR_CODE: "NOT_ATTEMPTED",
      });

    const afterVersion = await adapters.activeVersion();
    const versionStable = Boolean(
      afterVersion?.pass && afterVersion.versionId === beforeVersion.versionId,
    );
    versionStability = afterVersion?.pass
      ? versionStable
        ? "YES"
        : "NO"
      : "UNPROVEN";
    emit(emitRecord, { CANDIDATE_API_VERSION_STABLE: versionStability });

    const runtimeLog = await runtimeCapture?.finish?.();
    runtimeCapture = undefined;
    emit(emitRecord, {
      LOGIN_RUNTIME_LOG_EVENT_CAPTURED: runtimeLog?.eventCaptured ?? "NO",
      LOGIN_RUNTIME_SAFE_CODE: runtimeLog?.safeCode ?? "UNCLASSIFIED",
    });
    const classification = classifySecondStageLogin({
      sessionContext,
      branding,
      billing,
      generatedLogin,
      publicLogin,
      runtimeCode: runtimeLog?.safeCode ?? "UNCLASSIFIED",
      catalog,
      versionStable: versionStability,
    });
    emit(emitRecord, {
      LOGIN_FAILURE_PHASE: classification.phase,
      LOGIN_FAILURE_CATEGORY: classification.category,
      LOGIN_ROOT_CAUSE: classification.rootCause,
    });
    rootCauseEmitted = true;
  } catch (error) {
    executionError = error;
    emit(emitRecord, { LOGIN_DIAGNOSTIC_EXECUTION: "FAIL" });
  } finally {
    if (runtimeCapture) {
      try {
        const runtimeLog = await runtimeCapture.finish();
        emit(emitRecord, {
          LOGIN_RUNTIME_LOG_EVENT_CAPTURED: runtimeLog?.eventCaptured ?? "NO",
          LOGIN_RUNTIME_SAFE_CODE: runtimeLog?.safeCode ?? "UNCLASSIFIED",
        });
      } catch {
        emit(emitRecord, {
          LOGIN_RUNTIME_LOG_EVENT_CAPTURED: "NO",
          LOGIN_RUNTIME_SAFE_CODE: "UNCLASSIFIED",
        });
      }
    }
    if (beforeVersion && versionStability === "UNPROVEN") {
      try {
        const afterVersion = await adapters.activeVersion();
        versionStability = afterVersion?.pass
          ? afterVersion.versionId === beforeVersion.versionId
            ? "YES"
            : "NO"
          : "UNPROVEN";
      } catch {
        versionStability = "UNPROVEN";
      }
      emit(emitRecord, { CANDIDATE_API_VERSION_STABLE: versionStability });
    }
    if (cleanupRequired) {
      try {
        await adapters.cleanupFixture(fixture);
        emit(emitRecord, {
          LOGIN_DIAGNOSTIC_FIXTURE_CLEANUP: "PASS",
          SECOND_STAGE_LOGIN_DIAGNOSTIC_CLEANUP: "PASS",
        });
      } catch {
        cleanupError = new Error(
          "GENERATED_LOGIN_DIAGNOSTIC_FAIL:CLEANUP_UNPROVEN",
        );
        emit(emitRecord, {
          LOGIN_DIAGNOSTIC_FIXTURE_CLEANUP: "FAIL",
          SECOND_STAGE_LOGIN_DIAGNOSTIC_CLEANUP: "FAIL",
        });
      }
    } else
      emit(emitRecord, {
        LOGIN_DIAGNOSTIC_FIXTURE_CLEANUP: "NOT_REQUIRED",
        SECOND_STAGE_LOGIN_DIAGNOSTIC_CLEANUP: "NOT_REQUIRED",
      });
    if (!rootCauseEmitted && executionError) {
      const runtimeBindingDrift =
        executionError instanceof Error &&
        executionError.message.includes("CANDIDATE_API_RUNTIME_BINDING_DRIFT");
      emit(emitRecord, {
        LOGIN_ROOT_CAUSE:
          versionStability === "NO"
            ? "CANDIDATE_API_VERSION_CHANGED_DURING_DIAGNOSTIC"
            : runtimeBindingDrift
              ? "CANDIDATE_API_RUNTIME_BINDING_DRIFT"
              : "UNPROVEN",
      });
    }
  }
  if (cleanupError) throw cleanupError;
  if (executionError) throw executionError;
}

async function jsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function safeHttpError(body) {
  return safeCode(body?.error?.code);
}

function sessionCookie(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")];
  return values
    .filter((value) => typeof value === "string" && value.length > 0)
    .map((value) => value.split(";", 1)[0])
    .filter((value) => value.includes("="))
    .join("; ");
}

async function createRuntimeAdapters(environment) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: environment.PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL,
  });
  await client.connect();
  const cf = async (path) => {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4${path}`,
      {
        headers: {
          Authorization: `Bearer ${environment.CLOUDFLARE_API_TOKEN}`,
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
    return jsonResponse(response);
  };
  const activeVersion = async () =>
    inspectActiveApiVersion(
      await cf(
        `/accounts/${environment.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${API_SERVICE}/deployments`,
      ),
    );
  return {
    health: async () => {
      const response = await fetch(`${API_ORIGIN}/health`, {
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      const body = await jsonResponse(response);
      return {
        status: response.status,
        runtime: body?.runtime,
        environment: body?.environment,
        database: body?.database,
        releaseGitSha: body?.releaseGitSha,
      };
    },
    activeVersion,
    bindings: async (versionId) =>
      inspectBindings(
        await cf(
          `/accounts/${environment.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${API_SERVICE}/versions/${versionId}`,
        ),
        versionId,
      ),
    databaseCredentialPresent: () =>
      Boolean(environment.PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL),
    passwordPepperAvailable: () =>
      typeof environment.V2_PASSWORD_PEPPER === "string" &&
      environment.V2_PASSWORD_PEPPER.length > 0,
    passwordPepper: () => environment.V2_PASSWORD_PEPPER,
    signup: async (identity) => {
      const response = await fetch(
        `${API_ORIGIN}/api/v1/v2/platform/auth/signup`,
        {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Origin: environment.V2_PRODUCTION_CANDIDATE_TENANT_URL,
          },
          body: JSON.stringify({
            organizationName: `Generated login diagnostic ${identity.slug}`,
            workspaceSlug: identity.slug,
            email: identity.email,
            password: identity.password,
            displayName: identity.displayName,
          }),
        },
      );
      const body = await jsonResponse(response);
      const fixture =
        typeof body?.user?.id === "string" &&
        typeof body?.membership?.organizationId === "string" &&
        typeof body?.hostname?.hostname === "string"
          ? {
              userId: body.user.id,
              organizationId: body.membership.organizationId,
              hostname: body.hostname.hostname,
            }
          : undefined;
      return {
        status: response.status,
        fixture: fixture
          ? {
              ...fixture,
              signupCookie: sessionCookie(response),
            }
          : undefined,
      };
    },
    control: async ({ path, hostname, cookie }) => {
      const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: "application/json",
          Origin: `https://${hostname}`,
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
      return {
        status: response.status,
        errorCode: safeHttpError(await jsonResponse(response)),
      };
    },
    inspectFixture: async (fixture) => {
      const result = await client.query(
        `SELECT
        EXISTS(SELECT 1 FROM v2_users WHERE id = $1) AS "userExists",
        EXISTS(SELECT 1 FROM v2_users WHERE id = $1 AND status = 'ACTIVE') AS "userActive",
        COALESCE((SELECT password_hash FROM v2_users WHERE id = $1), '') AS "passwordHash",
        EXISTS(SELECT 1 FROM v2_memberships WHERE user_id = $1 AND organization_id = $2) AS "membershipExists",
        EXISTS(SELECT 1 FROM v2_memberships WHERE user_id = $1 AND organization_id = $2 AND status = 'ACTIVE') AS "membershipActive",
        EXISTS(SELECT 1 FROM v2_organizations WHERE id = $2 AND status = 'ACTIVE') AS "organizationActive",
        EXISTS(SELECT 1 FROM v2_workspace_hostnames WHERE hostname = $3) AS "hostnameExists",
        EXISTS(SELECT 1 FROM v2_workspace_hostnames WHERE hostname = $3 AND status = 'ACTIVE') AS "hostnameActive",
        EXISTS(SELECT 1 FROM v2_workspace_hostnames WHERE hostname = $3 AND organization_id = $2) AS "hostnameOrganizationMatch",
        EXISTS(SELECT 1 FROM v2_workspace_hostnames WHERE organization_id = $2 AND kind = 'DEFAULT' AND status = 'ACTIVE') AS "defaultHostname"`,
        [fixture.userId, fixture.organizationId, fixture.hostname],
      );
      const row = result.rows[0] ?? {};
      return {
        ...row,
        passwordHashPresent:
          typeof row.passwordHash === "string" && row.passwordHash.length > 0,
        passwordHashPbkdf2V2:
          typeof row.passwordHash === "string" &&
          /^pbkdf2:v2:sha256:[0-9]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(
            row.passwordHash,
          ),
      };
    },
    markVerified: (userId) =>
      client.query("UPDATE v2_users SET verified_at = now() WHERE id = $1", [
        userId,
      ]),
    userVerified: async (userId) =>
      Boolean(
        (
          await client.query(
            "SELECT verified_at IS NOT NULL AS verified FROM v2_users WHERE id = $1",
            [userId],
          )
        ).rows[0]?.verified,
      ),
    inspectLoginCatalog: async () => {
      const runtimeRole = environment.V2_RUNTIME_DB_ROLE ?? "hyperdrive_user";
      if (!/^[a-z_][a-z0-9_]{0,62}$/.test(runtimeRole))
        fail("INVALID_RUNTIME_DB_ROLE");
      const tables = [
        "v2_users",
        "v2_memberships",
        "v2_workspace_hostnames",
        "v2_sessions",
        "v2_audit_events",
        "v2_subscriptions",
        "v2_plans",
        "v2_entitlements",
        "v2_usage_limits",
        "v2_role_policies",
      ];
      const result = await client.query(
        `SELECT c.relname AS table_name,
          has_table_privilege($1, 'public.' || c.relname, 'SELECT') AS can_select,
          has_table_privilege($1, 'public.' || c.relname, 'INSERT') AS can_insert,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS force_rls_enabled,
          (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = ANY($2::text[])`,
        [runtimeRole, tables],
      );
      const entries = new Map(result.rows.map((row) => [row.table_name, row]));
      const access = (name, privilege) =>
        entries.has(name) && entries.get(name)?.[privilege] === true;
      const rlsMetadata = tables.every((name) => {
        const row = entries.get(name);
        return (
          row?.rls_enabled === true &&
          row?.force_rls_enabled === true &&
          Number(row?.policy_count) > 0
        );
      });
      return {
        usersSelect: access("v2_users", "can_select"),
        membershipsSelect: access("v2_memberships", "can_select"),
        hostnamesSelect: access("v2_workspace_hostnames", "can_select"),
        sessionsInsert: access("v2_sessions", "can_insert"),
        auditInsert: access("v2_audit_events", "can_insert"),
        subscriptionsSelect: access("v2_subscriptions", "can_select"),
        plansSelect: access("v2_plans", "can_select"),
        entitlementsSelect: access("v2_entitlements", "can_select"),
        usageLimitsSelect: access("v2_usage_limits", "can_select"),
        rlsMetadata,
      };
    },
    inspectBillingFixture: async (fixture) => {
      const result = await client.query(
        `SELECT
          EXISTS(SELECT 1 FROM v2_subscriptions WHERE organization_id = $1) AS "subscriptionExists",
          EXISTS(SELECT 1 FROM v2_subscriptions s JOIN v2_plans p ON p.id = s.plan_id WHERE s.organization_id = $1 AND p.active AND p.billing_mode = 'MANAGED_BETA') AS "subscriptionPlanExpected",
          EXISTS(SELECT 1 FROM v2_plans p JOIN v2_subscriptions s ON s.plan_id = p.id WHERE s.organization_id = $1) AS "planExists",
          EXISTS(SELECT 1 FROM v2_entitlements WHERE organization_id = $1) AS "entitlementCountNonzero",
          (SELECT count(*) >= 0 FROM v2_usage_limits WHERE organization_id = $1) AS "usageLimitQueryable"`,
        [fixture.organizationId],
      );
      return result.rows[0] ?? {};
    },
    resolveHostname: async (hostname) =>
      (
        await client.query(
          "SELECT organization_id FROM public.v2_resolve_active_workspace_hostname($1)",
          [hostname],
        )
      ).rows[0]?.organization_id,
    login: async ({ hostname, identity }) => {
      const response = await fetch(
        `${API_ORIGIN}/api/v1/v2/platform/auth/login`,
        {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Origin: `https://${hostname}`,
          },
          body: JSON.stringify({
            email: identity.email,
            password: identity.password,
          }),
        },
      );
      const body = await jsonResponse(response);
      const setCookie = response.headers.get("set-cookie");
      return {
        status: response.status,
        errorCode: safeHttpError(body),
        cookiePresent: Boolean(setCookie?.includes("oo_v2_session=")),
        csrfPresent:
          typeof body?.csrfToken === "string" && body.csrfToken.length >= 16,
      };
    },
    startRuntimeLogCapture: async (versionId) => {
      const bin = environment.WRANGLER_BIN;
      if (
        typeof bin !== "string" ||
        !bin ||
        !/^[0-9a-f-]{36}$/i.test(versionId)
      )
        return undefined;
      const directory = mkdtempSync(
        join(
          environment.RUNNER_TEMP ?? tmpdir(),
          "oo-v2-generated-login-tail-",
        ),
      );
      chmodSync(directory, 0o700);
      const capturePath = join(directory, "capture.jsonl");
      const errorPath = join(directory, "tail.stderr");
      const stdout = openSync(capturePath, "w", 0o600);
      const stderr = openSync(errorPath, "w", 0o600);
      let child;
      try {
        child = spawn(
          bin,
          ["tail", API_SERVICE, "--format", "json", "--version-id", versionId],
          {
            detached: true,
            stdio: ["ignore", stdout, stderr],
            env: {
              ...process.env,
              WRANGLER_WRITE_LOGS: "false",
              WRANGLER_LOG: "log",
              WRANGLER_SEND_METRICS: "false",
              WRANGLER_SEND_ERROR_REPORTS: "false",
              NO_COLOR: "1",
            },
          },
        );
      } finally {
        closeSync(stdout);
        closeSync(stderr);
      }
      await sleep(5_000);
      const observed = child?.exitCode === null;
      if (observed) await sleep(60_000);
      return {
        finish: async () => {
          try {
            if (child?.exitCode === null) await sleep(10_000);
            terminateProcess(child);
            const capture = readFileSync(capturePath, "utf8");
            return inspectLoginRuntimeTail(capture);
          } catch {
            return { eventCaptured: "NO", safeCode: "UNCLASSIFIED" };
          } finally {
            terminateProcess(child);
            rmSync(directory, { recursive: true, force: true });
          }
        },
      };
    },
    cleanupFixture: async (fixture) => {
      await client.query("BEGIN");
      try {
        await client.query(
          "SELECT set_config('app.organization_id', $1, true)",
          [fixture.organizationId],
        );
        await client.query(
          "UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'GENERATED_LOGIN_DIAGNOSTIC_ARCHIVED') WHERE organization_id = $1",
          [fixture.organizationId],
        );
        await client.query(
          "UPDATE v2_workspace_hostnames SET status = 'ARCHIVED', updated_at = now() WHERE organization_id = $1",
          [fixture.organizationId],
        );
        await client.query(
          "UPDATE v2_organizations SET status = 'ARCHIVED', updated_at = now() WHERE id = $1",
          [fixture.organizationId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    },
    close: () => client.end(),
  };
}

const invoked = process.argv[1] === fileURLToPath(import.meta.url);
if (invoked) {
  let adapters;
  try {
    adapters = await createRuntimeAdapters(process.env);
    await runGeneratedLoginDiagnostic({ adapters });
  } catch (error) {
    const code =
      error instanceof Error &&
      /^GENERATED_LOGIN_DIAGNOSTIC_FAIL:[A-Z0-9_:-]+$/.test(error.message)
        ? error.message.split(":").at(-1)
        : "UNCLASSIFIED";
    console.log(
      JSON.stringify({
        LOGIN_DIAGNOSTIC_FINAL_STATE: "FAIL",
        LOGIN_FAILURE_CATEGORY: code,
      }),
    );
    process.exitCode = 1;
  } finally {
    await adapters?.close?.().catch(() => undefined);
  }
}
