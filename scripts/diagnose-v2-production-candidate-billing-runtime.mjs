import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const RC9_SHA = "de0734df2d2b5b2dd3a2a67ee542131235e75eb7";
export const API_ORIGIN = "https://api-next.labofscents.org";
export const API_SERVICE = "olfactoryops-v2-api-production-candidate";
const SAFE_ERROR = /^[A-Z][A-Z0-9_]{1,79}$/;
const SAFE_CLASS = new Set([
  "NONE",
  "PRISMA_Pxxxx",
  "POSTGRES_RLS_DENIED",
  "POSTGRES_PERMISSION_DENIED",
  "POSTGRES_CONNECTION_FAILED",
  "POSTGRES_TRANSACTION_FAILED",
  "PRISMA_RELATION_INCLUDE_FAILURE",
  "PRISMA_SERIALIZATION_FAILURE",
  "ADAPTER_RUNTIME_FAILURE",
  "UNCLASSIFIED",
]);

function fail(code) {
  throw new Error(`BILLING_RUNTIME_DIAGNOSTIC_FAIL:${code}`);
}
function emit(emitRecord, record) {
  emitRecord(record);
}
function persistCleanupState(value, environment) {
  if (environment.GITHUB_ENV)
    appendFileSync(
      environment.GITHUB_ENV,
      `BILLING_RUNTIME_DIAGNOSTIC_FIXTURE_CLEANUP=${value}\n`,
    );
}
function safeStatus(value) {
  return Number.isInteger(value) && value >= 0 && value <= 599
    ? String(value)
    : "0";
}
function safeCode(value) {
  return typeof value === "string" && SAFE_ERROR.test(value)
    ? value
    : "NO_STABLE_ERROR_CODE";
}
function probePass(value) {
  return value?.status === "PASS";
}
function safeClass(value) {
  return SAFE_CLASS.has(value) ? value : "UNCLASSIFIED";
}

export function validateBillingDiagnosticEnvironment(
  environment = process.env,
) {
  const expected = {
    RELEASE_SHA: RC9_SHA,
    CONFIRM_DIAGNOSTIC: "DIAGNOSE_RC9_BILLING_RUNTIME",
    V2_PRODUCTION_CANDIDATE_API_ORIGIN: API_ORIGIN,
    V2_PRODUCTION_CANDIDATE_TENANT_URL:
      "https://rc9-release-31736285494-469ca8942a.next.labofscents.org",
  };
  for (const [name, value] of Object.entries(expected))
    if (environment[name] !== value) fail(`INVALID_${name}`);
  if (!environment.PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL)
    fail("DATABASE_CREDENTIAL_MISSING");
  if (!environment.BILLING_RUNTIME_DIAGNOSTIC_URL?.startsWith("https://"))
    fail("DIAGNOSTIC_WORKER_URL_INVALID");
  if ((environment.BILLING_RUNTIME_DIAGNOSTIC_TOKEN ?? "").length < 32)
    fail("DIAGNOSTIC_TOKEN_INVALID");
  if (
    environment.INITIAL_CANDIDATE_API_VERSION &&
    !/^[0-9a-f-]{36}$/i.test(environment.INITIAL_CANDIDATE_API_VERSION)
  )
    fail("INITIAL_CANDIDATE_API_VERSION_INVALID");
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
  const versionId =
    versions.length === 1 && versions[0]?.percentage === 100
      ? versions[0]?.version_id
      : undefined;
  return {
    pass: typeof versionId === "string" && /^[0-9a-f-]{36}$/i.test(versionId),
    versionId,
  };
}

export function readBillingRuntimeMatrix(body) {
  const fields = [
    "subscriptionWithPlanInclude",
    "subscriptionPlain",
    "planDirect",
    "entitlements",
    "usageLimits",
    "manualProjection",
    "serialization",
    "sequentialTransaction",
  ];
  if (body?.billingRuntimeDiagnostic !== "MATRIX") return undefined;
  const matrix = {};
  for (const field of fields) {
    const value = body?.[field];
    if (
      !value ||
      !["PASS", "FAIL"].includes(value.status) ||
      !SAFE_CLASS.has(value.errorClass)
    )
      return undefined;
    matrix[field] = { status: value.status, errorClass: value.errorClass };
  }
  return {
    ...matrix,
    failureSafeClass: safeClass(body.failureSafeClass),
  };
}

export function classifyBillingRuntime({ matrix, versionStable }) {
  if (versionStable !== "YES")
    return {
      rootCause: "UNPROVEN",
      sourceDefect: "UNPROVEN",
      rc10Required: "UNPROVEN",
    };
  if (!matrix)
    return {
      rootCause: "UNPROVEN",
      sourceDefect: "UNPROVEN",
      rc10Required: "UNPROVEN",
    };
  const includeOnlyFailure =
    !probePass(matrix.subscriptionWithPlanInclude) &&
    [
      matrix.subscriptionPlain,
      matrix.planDirect,
      matrix.entitlements,
      matrix.usageLimits,
      matrix.manualProjection,
      matrix.serialization,
      matrix.sequentialTransaction,
    ].every(probePass);
  if (includeOnlyFailure)
    return {
      rootCause: "PRISMA_RELATION_INCLUDE_RUNTIME_INCOMPATIBILITY",
      sourceDefect: "YES",
      rc10Required: "YES",
    };
  if (!probePass(matrix.subscriptionPlain))
    return {
      rootCause: "SUBSCRIPTION_PRISMA_RUNTIME_PATH",
      sourceDefect: "UNPROVEN",
      rc10Required: "NO",
    };
  if (!probePass(matrix.entitlements))
    return {
      rootCause: "ENTITLEMENT_PRISMA_RUNTIME_PATH",
      sourceDefect: "UNPROVEN",
      rc10Required: "NO",
    };
  if (!probePass(matrix.usageLimits))
    return {
      rootCause: "USAGE_LIMIT_PRISMA_RUNTIME_PATH",
      sourceDefect: "UNPROVEN",
      rc10Required: "NO",
    };
  if (!probePass(matrix.manualProjection) || !probePass(matrix.serialization))
    return {
      rootCause: "BILLING_PROJECTION_OR_SERIALIZATION_PATH",
      sourceDefect: "UNPROVEN",
      rc10Required: "NO",
    };
  if (
    [
      matrix.subscriptionWithPlanInclude,
      matrix.subscriptionPlain,
      matrix.planDirect,
      matrix.entitlements,
      matrix.usageLimits,
      matrix.manualProjection,
      matrix.serialization,
      matrix.sequentialTransaction,
    ].every(probePass)
  )
    return {
      rootCause: "CANDIDATE_API_SPECIFIC_RUNTIME_DISCREPANCY",
      sourceDefect: "NO",
      rc10Required: "NO",
    };
  return {
    rootCause: "UNPROVEN",
    sourceDefect: "UNPROVEN",
    rc10Required: "UNPROVEN",
  };
}

function credentials() {
  const suffix = randomBytes(12).toString("hex");
  return {
    email: `billing-runtime-${suffix}@candidate.invalid`,
    password: `Billing-${suffix}-Password!47`,
    displayName: "Generated billing runtime diagnostic",
    slug: `billing-runtime-${suffix}`,
  };
}

export async function runBillingRuntimeDiagnostic({
  adapters,
  environment = process.env,
  emitRecord = (record) => console.log(JSON.stringify(record)),
}) {
  validateBillingDiagnosticEnvironment(environment);
  let fixture;
  let beforeVersion;
  let versionStable = "UNPROVEN";
  let cleanupError;
  let executionError;
  try {
    beforeVersion = await adapters.activeVersion();
    emit(emitRecord, {
      CANDIDATE_API_ACTIVE_VERSION_CAPTURED: beforeVersion?.pass
        ? "PASS"
        : "FAIL",
      ...(beforeVersion?.pass
        ? { CANDIDATE_API_ACTIVE_VERSION_ID: beforeVersion.versionId }
        : {}),
    });
    if (!beforeVersion?.pass) fail("CANDIDATE_API_ACTIVE_VERSION");
    if (
      environment.INITIAL_CANDIDATE_API_VERSION &&
      beforeVersion.versionId !== environment.INITIAL_CANDIDATE_API_VERSION
    )
      fail("CANDIDATE_API_VERSION_DRIFT_BEFORE_FIXTURE");

    const identity = credentials();
    const signup = await adapters.signup(identity);
    if (signup.status !== 200 || !signup.fixture)
      fail("DIAGNOSTIC_SIGNUP_FAILED");
    fixture = { ...signup.fixture, identity };
    emit(emitRecord, { BILLING_DIAGNOSTIC_SIGNUP: "PASS" });
    if (!(await adapters.fixtureReady(fixture)))
      fail("DIAGNOSTIC_FIXTURE_NOT_READY");

    const matrixResponse = await adapters.probe(fixture);
    const matrix =
      matrixResponse.status === 200
        ? readBillingRuntimeMatrix(matrixResponse.body)
        : undefined;
    if (!matrix) fail("BILLING_MATRIX_NOT_RECEIVED");
    emit(emitRecord, {
      BILLING_PROBE_SUBSCRIPTION_WITH_PLAN_INCLUDE:
        matrix.subscriptionWithPlanInclude.status,
      BILLING_PROBE_SUBSCRIPTION_PLAIN: matrix.subscriptionPlain.status,
      BILLING_PROBE_PLAN_DIRECT: matrix.planDirect.status,
      BILLING_PROBE_ENTITLEMENTS: matrix.entitlements.status,
      BILLING_PROBE_USAGE_LIMITS: matrix.usageLimits.status,
      BILLING_PROBE_MANUAL_PROJECTION: matrix.manualProjection.status,
      BILLING_PROBE_SERIALIZATION: matrix.serialization.status,
      BILLING_PROBE_SEQUENTIAL_TRANSACTION: matrix.sequentialTransaction.status,
      BILLING_FAILURE_SAFE_CLASS: matrix.failureSafeClass,
    });
    const afterVersion = await adapters.activeVersion();
    versionStable = afterVersion?.pass
      ? afterVersion.versionId === beforeVersion.versionId
        ? "YES"
        : "NO"
      : "UNPROVEN";
    emit(emitRecord, { CANDIDATE_API_VERSION_STABLE: versionStable });
    const classification = classifyBillingRuntime({ matrix, versionStable });
    emit(emitRecord, {
      BILLING_ROOT_CAUSE: classification.rootCause,
      RC9_SOURCE_DEFECT: classification.sourceDefect,
      RC10_REQUIRED: classification.rc10Required,
    });
  } catch (error) {
    executionError = error;
    emit(emitRecord, { BILLING_RUNTIME_DIAGNOSTIC_EXECUTION: "FAIL" });
  } finally {
    if (beforeVersion && versionStable === "UNPROVEN") {
      try {
        const afterVersion = await adapters.activeVersion();
        versionStable = afterVersion?.pass
          ? afterVersion.versionId === beforeVersion.versionId
            ? "YES"
            : "NO"
          : "UNPROVEN";
      } catch {
        versionStable = "UNPROVEN";
      }
      emit(emitRecord, { CANDIDATE_API_VERSION_STABLE: versionStable });
    }
    if (fixture) {
      try {
        await adapters.cleanupFixture(fixture);
        persistCleanupState("PASS", environment);
        emit(emitRecord, {
          BILLING_RUNTIME_DIAGNOSTIC_FIXTURE_CLEANUP: "PASS",
        });
      } catch {
        persistCleanupState("FAIL", environment);
        cleanupError = new Error(
          "BILLING_RUNTIME_DIAGNOSTIC_FAIL:CLEANUP_UNPROVEN",
        );
        emit(emitRecord, {
          BILLING_RUNTIME_DIAGNOSTIC_FIXTURE_CLEANUP: "FAIL",
        });
      }
    } else {
      persistCleanupState("NOT_REQUIRED", environment);
      emit(emitRecord, {
        BILLING_RUNTIME_DIAGNOSTIC_FIXTURE_CLEANUP: "NOT_REQUIRED",
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

async function createRuntimeAdapters(environment) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: environment.PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL,
  });
  await client.connect();
  const cloudflare = async (path) =>
    jsonResponse(
      await fetch(`https://api.cloudflare.com/client/v4${path}`, {
        headers: {
          Authorization: `Bearer ${environment.CLOUDFLARE_API_TOKEN}`,
        },
        signal: AbortSignal.timeout(20_000),
      }),
    );
  return {
    activeVersion: async () =>
      inspectActiveApiVersion(
        await cloudflare(
          `/accounts/${environment.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${API_SERVICE}/deployments`,
        ),
      ),
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
            organizationName: `Generated billing diagnostic ${identity.slug}`,
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
      return { status: response.status, fixture };
    },
    fixtureReady: async (fixture) => {
      const result = await client.query(
        `SELECT EXISTS(SELECT 1 FROM v2_organizations WHERE id = $1 AND status = 'ACTIVE')
          AND EXISTS(SELECT 1 FROM v2_subscriptions WHERE organization_id = $1) AS "ready"`,
        [fixture.organizationId],
      );
      return result.rows[0]?.ready === true;
    },
    probe: async (fixture) => {
      const response = await fetch(
        `${environment.BILLING_RUNTIME_DIAGNOSTIC_URL}/probe`,
        {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-olfactoryops-billing-runtime-diagnostic":
              environment.BILLING_RUNTIME_DIAGNOSTIC_TOKEN,
          },
          body: JSON.stringify({ organizationId: fixture.organizationId }),
        },
      );
      return { status: response.status, body: await jsonResponse(response) };
    },
    cleanupFixture: async (fixture) => {
      await client.query("BEGIN");
      try {
        await client.query(
          "SELECT set_config('app.organization_id', $1, true)",
          [fixture.organizationId],
        );
        await client.query(
          "UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'BILLING_RUNTIME_DIAGNOSTIC_ARCHIVED') WHERE organization_id = $1",
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let adapters;
  try {
    adapters = await createRuntimeAdapters(process.env);
    await runBillingRuntimeDiagnostic({ adapters });
  } catch (error) {
    const code =
      error instanceof Error &&
      /^BILLING_RUNTIME_DIAGNOSTIC_FAIL:[A-Z0-9_:-]+$/.test(error.message)
        ? error.message.split(":").at(-1)
        : "UNCLASSIFIED";
    console.log(
      JSON.stringify({
        BILLING_RUNTIME_DIAGNOSTIC_FINAL_STATE: "FAIL",
        BILLING_FAILURE_CATEGORY: code,
      }),
    );
    process.exitCode = 1;
  } finally {
    await adapters?.close?.().catch(() => undefined);
  }
}
