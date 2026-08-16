import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  API_ORIGIN,
  inspectActiveApiVersion,
  inspectBindings,
} from "./diagnose-v2-production-candidate-generated-login.mjs";

export const RC9_SHA = "de0734df2d2b5b2dd3a2a67ee542131235e75eb7";
export const API_SERVICE = "olfactoryops-v2-api-production-candidate";
export const TENANT_URL = "https://rc9-release-31736285494-469ca8942a.next.labofscents.org";
export const CONFIRMATION = "DIAGNOSE_RC9_EXACT_BILLING_PATH";
export const SAFE_CLASSES = new Set([
  "NONE",
  "PRISMA_KNOWN_REQUEST_ERROR",
  "PRISMA_UNKNOWN_REQUEST_ERROR",
  "PRISMA_CLIENT_VALIDATION_ERROR",
  "PRISMA_INITIALIZATION_ERROR",
  "POSTGRES_RLS_DENIED",
  "POSTGRES_PERMISSION_DENIED",
  "POSTGRES_CONNECTION_ERROR",
  "POSTGRES_TRANSACTION_ERROR",
  "TYPE_ERROR",
  "RANGE_ERROR",
  "REPOSITORY_TRANSACTION_ERROR",
  "ROLE_PERMISSION_PATH_ERROR",
  "BILLING_PROJECTION_ERROR",
  "JSON_SERIALIZATION_ERROR",
  "WORKER_ADAPTER_ERROR",
  "UNCLASSIFIED",
]);

const safeErrorCode = /^[A-Z][A-Z0-9_]{1,79}$/;

function fail(code) {
  throw new Error(`EXACT_BILLING_PATH_DIAGNOSTIC_FAIL:${code}`);
}

function emit(emitRecord, record) {
  emitRecord(record);
}

function bool(value) {
  return value === true ? "PASS" : "FAIL";
}

function status(value) {
  return Number.isInteger(value) && value >= 0 && value <= 599 ? String(value) : "0";
}

function code(value) {
  return typeof value === "string" && safeErrorCode.test(value) ? value : "NO_STABLE_ERROR_CODE";
}

function probePass(probe) {
  return probe?.status === "PASS";
}

export function validateExactBillingDiagnosticEnvironment(environment = process.env) {
  const expected = {
    RELEASE_SHA: RC9_SHA,
    CONFIRM_DIAGNOSTIC: CONFIRMATION,
    V2_PRODUCTION_CANDIDATE_API_ORIGIN: API_ORIGIN,
    V2_PRODUCTION_CANDIDATE_TENANT_URL: TENANT_URL,
  };
  for (const [name, value] of Object.entries(expected)) if (environment[name] !== value) fail(`INVALID_${name}`);
  if (!environment.PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL) fail("DATABASE_CREDENTIAL_MISSING");
  if (!/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(environment.EXACT_BILLING_DIAGNOSTIC_URL ?? "")) fail("DIAGNOSTIC_WORKER_URL_INVALID");
  if (!/^[a-f0-9]{64}$/.test(environment.EXACT_BILLING_DIAGNOSTIC_TOKEN ?? "")) fail("DIAGNOSTIC_TOKEN_INVALID");
}

export function readExactBillingMatrix(body) {
  if (body?.exactBillingPathDiagnostic !== "MATRIX") return undefined;
  const names = [
    "exactGetBillingUnscoped",
    "exactGetBillingUnscopedSerialization",
    "exactGetBillingScoped",
    "exactGetBillingScopedSerialization",
    "scopedSubscriptionInclude",
    "scopedEntitlements",
    "scopedUsageLimits",
    "scopedBillingProjection",
    "scopedBillingSerialization",
    "exactPlatformServiceBilling",
    "platformBillingJsonSerialization",
    "platformBillingResponseConstruction",
  ];
  const matrix = {};
  for (const name of names) {
    const value = body[name];
    if (!value || !["PASS", "FAIL", "NOT_RUN"].includes(value.status) || !SAFE_CLASSES.has(value.safeClass)) return undefined;
    matrix[name] = { status: value.status, safeClass: value.safeClass };
  }
  const rolePermissionQuery = body.rolePermissionQuery;
  if (!["PASS", "FAIL"].includes(rolePermissionQuery)) return undefined;
  if (!["YES", "NO", "UNPROVEN"].includes(body.ownerRolePolicyExists) || !["YES", "NO", "UNPROVEN"].includes(body.ownerHasBillingCapabilities)) return undefined;
  if (!["NONE", "DENIED", "UNPROVEN"].includes(body.billingRlsRuntimeEffect)) return undefined;
  return { ...matrix, rolePermissionQuery, ownerRolePolicyExists: body.ownerRolePolicyExists, ownerHasBillingCapabilities: body.ownerHasBillingCapabilities, billingRlsRuntimeEffect: body.billingRlsRuntimeEffect };
}

export function classifyExactBillingPath({ matrix, candidateEndpoint, versionStable }) {
  if (versionStable !== "YES" || !matrix) return { rootCause: "UNPROVEN", sourceDefect: "UNPROVEN", rc10Required: "UNPROVEN" };
  if (!probePass(matrix.exactGetBillingUnscoped)) return { rootCause: "UNPROVEN", sourceDefect: "UNPROVEN", rc10Required: "NO" };
  if (!probePass(matrix.exactGetBillingScoped)) return { rootCause: "SCOPED_TRANSACTION_OR_TENANT_CONTEXT_PATH", sourceDefect: "UNPROVEN", rc10Required: "NO" };
  if (!probePass(matrix.exactPlatformServiceBilling)) return { rootCause: "PLATFORM_SERVICE_PERMISSION_OR_SERVICE_PATH", sourceDefect: "UNPROVEN", rc10Required: "NO" };
  if (!probePass(matrix.platformBillingJsonSerialization) || !probePass(matrix.platformBillingResponseConstruction)) return { rootCause: "BILLING_RESPONSE_SERIALIZATION_PATH", sourceDefect: "UNPROVEN", rc10Required: "NO" };
  if (candidateEndpoint?.status !== 200) return { rootCause: "CANDIDATE_API_TRANSPORT_OR_BUNDLE_RUNTIME_PATH", sourceDefect: "UNPROVEN", rc10Required: "NO" };
  return { rootCause: "UNPROVEN", sourceDefect: "UNPROVEN", rc10Required: "NO" };
}

export function classifyNonRc9PlanControl() {
  // The former plan.findUnique control is deliberately excluded from every
  // exact RC9 result. It is retained as an explicit non-RC9 boundary only.
  return "NON_RC9_PLAN_DIRECT_CONTROL_NOT_USED";
}

function credentials() {
  const suffix = randomBytes(12).toString("hex");
  return { email: `exact-billing-${suffix}@candidate.invalid`, password: `Exact-${suffix}-Password!47`, displayName: "Generated exact billing diagnostic", slug: `exact-billing-${suffix}` };
}

function cookieHeader(response) {
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")];
  return values.filter((value) => typeof value === "string" && value.length > 0).map((value) => value.split(";", 1)[0]).filter((value) => value.includes("=")).join("; ");
}

async function jsonBody(response) {
  try { return await response.json(); } catch { return undefined; }
}

function persistCleanupState(value, environment) {
  if (environment.GITHUB_ENV) appendFileSync(environment.GITHUB_ENV, `EXACT_BILLING_PATH_DIAGNOSTIC_FIXTURE_CLEANUP=${value}\n`);
}

export async function runExactBillingPathDiagnostic({ adapters, environment = process.env, emitRecord = (record) => console.log(JSON.stringify(record)) }) {
  validateExactBillingDiagnosticEnvironment(environment);
  let fixture;
  let beforeVersion;
  let versionStable = "UNPROVEN";
  let executionError;
  let cleanupError;
  try {
    const health = await adapters.health();
    const identityPass = health.status === 200 && health.runtime === "v2-api-worker/1" && health.environment === "production" && health.database === "hyperdrive" && health.releaseGitSha === RC9_SHA;
    emit(emitRecord, { EXACT_RC9_RELEASE_SHA: RC9_SHA, CANDIDATE_API_RELEASE_IDENTITY: bool(identityPass) });
    if (!identityPass) fail("CANDIDATE_API_RELEASE_IDENTITY");
    beforeVersion = await adapters.activeVersion();
    emit(emitRecord, { CANDIDATE_API_ACTIVE_VERSION_CAPTURED: bool(beforeVersion?.pass), ...(beforeVersion?.pass ? { CANDIDATE_API_ACTIVE_VERSION_ID: beforeVersion.versionId } : {}) });
    if (!beforeVersion?.pass) fail("ACTIVE_VERSION_CAPTURE");
    const bindings = await adapters.bindings(beforeVersion.versionId);
    emit(emitRecord, { CANDIDATE_API_HYPERDRIVE_BINDING: bool(bindings.hyperdrive), CANDIDATE_API_SECRET_BINDING_NAMES: bool(Object.values(bindings.secrets).every(Boolean)), CANDIDATE_API_RUNTIME_VARS: bool(Object.values(bindings.variables).every(Boolean)) });
    if (!bindings.pass) fail("CANDIDATE_API_BINDINGS");
    emit(emitRecord, { DIAGNOSTIC_CONFIRMATION: "PASS", FIXTURE_CREATION_GUARDS: "PASS" });
    const identity = credentials();
    const signup = await adapters.signup(identity);
    if (signup.status !== 200 || !signup.fixture) fail("DIAGNOSTIC_SIGNUP");
    fixture = { ...signup.fixture, identity };
    emit(emitRecord, { DIAGNOSTIC_SIGNUP: "PASS" });
    const db = await adapters.fixtureReady(fixture);
    emit(emitRecord, { USER_STATUS_ACTIVE: bool(db.userActive), USER_VERIFIED: db.userVerified ? "YES" : "NO", MEMBERSHIP_ACTIVE: bool(db.membershipActive), ORGANIZATION_ACTIVE: bool(db.organizationActive), GENERATED_HOSTNAME_STATE: bool(db.hostnameActive && db.hostnameOrganizationMatch) });
    if (!db.userActive || !db.userVerified || !db.membershipActive || !db.organizationActive || !db.hostnameActive || !db.hostnameOrganizationMatch) fail("FIXTURE_STATE");
    const matrixResponse = await adapters.probe(fixture);
    const matrix = matrixResponse.status === 200 ? readExactBillingMatrix(matrixResponse.body) : undefined;
    if (!matrix) fail("EXACT_BILLING_MATRIX_NOT_RECEIVED");
    for (const [key, value] of Object.entries({
      EXACT_GET_BILLING_UNSCOPED: matrix.exactGetBillingUnscoped.status,
      EXACT_GET_BILLING_UNSCOPED_SERIALIZATION: matrix.exactGetBillingUnscopedSerialization.status,
      EXACT_GET_BILLING_SCOPED: matrix.exactGetBillingScoped.status,
      EXACT_GET_BILLING_SCOPED_SERIALIZATION: matrix.exactGetBillingScopedSerialization.status,
      SCOPED_SUBSCRIPTION_INCLUDE: matrix.scopedSubscriptionInclude.status,
      SCOPED_ENTITLEMENTS: matrix.scopedEntitlements.status,
      SCOPED_USAGE_LIMITS: matrix.scopedUsageLimits.status,
      SCOPED_BILLING_PROJECTION: matrix.scopedBillingProjection.status,
      SCOPED_BILLING_SERIALIZATION: matrix.scopedBillingSerialization.status,
      EXACT_PLATFORM_SERVICE_BILLING: matrix.exactPlatformServiceBilling.status,
      PLATFORM_BILLING_JSON_SERIALIZATION: matrix.platformBillingJsonSerialization.status,
      PLATFORM_BILLING_RESPONSE_CONSTRUCTION: matrix.platformBillingResponseConstruction.status,
    })) emit(emitRecord, { [key]: value });
    emit(emitRecord, { EXACT_GET_BILLING_UNSCOPED_SAFE_CLASS: matrix.exactGetBillingUnscoped.safeClass, EXACT_GET_BILLING_SCOPED_SAFE_CLASS: matrix.exactGetBillingScoped.safeClass, EXACT_PLATFORM_SERVICE_BILLING_SAFE_CLASS: matrix.exactPlatformServiceBilling.safeClass, SCOPED_SUBSCRIPTION_INCLUDE_SAFE_CLASS: matrix.scopedSubscriptionInclude.safeClass, SCOPED_ENTITLEMENTS_SAFE_CLASS: matrix.scopedEntitlements.safeClass, SCOPED_USAGE_LIMITS_SAFE_CLASS: matrix.scopedUsageLimits.safeClass, BILLING_RLS_RUNTIME_EFFECT: matrix.billingRlsRuntimeEffect, OWNER_ROLE_POLICY_EXISTS: matrix.ownerRolePolicyExists, OWNER_HAS_BILLING_CAPABILITIES: matrix.ownerHasBillingCapabilities, ROLE_PERMISSION_QUERY: matrix.rolePermissionQuery });
    const candidateEndpoint = await adapters.candidateBilling(fixture);
    emit(emitRecord, { CANDIDATE_BILLING_ENDPOINT_STATUS: status(candidateEndpoint.status), CANDIDATE_BILLING_ENDPOINT_ERROR_CODE: code(candidateEndpoint.errorCode) });
    const afterVersion = await adapters.activeVersion();
    versionStable = afterVersion?.pass ? afterVersion.versionId === beforeVersion.versionId ? "YES" : "NO" : "UNPROVEN";
    emit(emitRecord, { CANDIDATE_API_VERSION_STABLE: versionStable });
    const classification = classifyExactBillingPath({ matrix, candidateEndpoint, versionStable });
    emit(emitRecord, { BILLING_FAILURE_SAFE_CLASS: matrix.exactGetBillingScoped.safeClass !== "NONE" ? matrix.exactGetBillingScoped.safeClass : matrix.exactGetBillingUnscoped.safeClass, BILLING_ROOT_CAUSE: classification.rootCause, RC9_SOURCE_DEFECT: classification.sourceDefect, RC10_REQUIRED: classification.rc10Required });
  } catch (error) {
    executionError = error;
    emit(emitRecord, { EXACT_BILLING_PATH_DIAGNOSTIC_EXECUTION: "FAIL" });
  } finally {
    if (beforeVersion && versionStable === "UNPROVEN") {
      try { const afterVersion = await adapters.activeVersion(); versionStable = afterVersion?.pass ? afterVersion.versionId === beforeVersion.versionId ? "YES" : "NO" : "UNPROVEN"; } catch { versionStable = "UNPROVEN"; }
      emit(emitRecord, { CANDIDATE_API_VERSION_STABLE: versionStable });
    }
    if (fixture) {
      try { await adapters.cleanupFixture(fixture); persistCleanupState("PASS", environment); emit(emitRecord, { EXACT_BILLING_PATH_DIAGNOSTIC_CLEANUP: "PASS" }); }
      catch { persistCleanupState("FAIL", environment); cleanupError = new Error("EXACT_BILLING_PATH_DIAGNOSTIC_FAIL:CLEANUP"); emit(emitRecord, { EXACT_BILLING_PATH_DIAGNOSTIC_CLEANUP: "FAIL" }); }
    } else { persistCleanupState("NOT_REQUIRED", environment); emit(emitRecord, { EXACT_BILLING_PATH_DIAGNOSTIC_CLEANUP: "NOT_REQUIRED" }); }
  }
  if (cleanupError) throw cleanupError;
  if (executionError) throw executionError;
}

async function createRuntimeAdapters(environment) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: environment.PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL });
  await client.connect();
  const cf = async (path) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { Authorization: `Bearer ${environment.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(20_000) });
    return jsonBody(response);
  };
  const activeVersion = async () => inspectActiveApiVersion(await cf(`/accounts/${environment.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${API_SERVICE}/deployments`));
  return {
    health: async () => { const response = await fetch(`${API_ORIGIN}/health`, { redirect: "manual", signal: AbortSignal.timeout(20_000) }); const body = await jsonBody(response); return { status: response.status, runtime: body?.runtime, environment: body?.environment, database: body?.database, releaseGitSha: body?.releaseGitSha }; },
    activeVersion,
    bindings: async (versionId) => inspectBindings(await cf(`/accounts/${environment.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${API_SERVICE}/versions/${versionId}`), versionId),
    signup: async (identity) => { const response = await fetch(`${API_ORIGIN}/api/v1/v2/platform/auth/signup`, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { Accept: "application/json", "Content-Type": "application/json", Origin: TENANT_URL }, body: JSON.stringify({ organizationName: `Generated exact billing ${identity.slug}`, workspaceSlug: identity.slug, email: identity.email, password: identity.password, displayName: identity.displayName }) }); const body = await jsonBody(response); const fixture = typeof body?.user?.id === "string" && typeof body?.membership?.organizationId === "string" && typeof body?.hostname?.hostname === "string" ? { userId: body.user.id, organizationId: body.membership.organizationId, hostname: body.hostname.hostname, signupCookie: cookieHeader(response) } : undefined; return { status: response.status, fixture }; },
    fixtureReady: async (fixture) => { await client.query("UPDATE v2_users SET verified_at = COALESCE(verified_at, now()) WHERE id = $1", [fixture.userId]); const result = await client.query(`SELECT EXISTS(SELECT 1 FROM v2_users WHERE id = $1 AND status = 'ACTIVE') AS "userActive", EXISTS(SELECT 1 FROM v2_users WHERE id = $1 AND verified_at IS NOT NULL) AS "userVerified", EXISTS(SELECT 1 FROM v2_memberships WHERE user_id = $1 AND organization_id = $2 AND status = 'ACTIVE') AS "membershipActive", EXISTS(SELECT 1 FROM v2_organizations WHERE id = $2 AND status = 'ACTIVE') AS "organizationActive", EXISTS(SELECT 1 FROM v2_workspace_hostnames WHERE hostname = $3 AND status = 'ACTIVE') AS "hostnameActive", EXISTS(SELECT 1 FROM v2_workspace_hostnames WHERE hostname = $3 AND organization_id = $2) AS "hostnameOrganizationMatch"`, [fixture.userId, fixture.organizationId, fixture.hostname]); return result.rows[0] ?? {}; },
    probe: async (fixture) => { const response = await fetch(environment.EXACT_BILLING_DIAGNOSTIC_URL + "/probe", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { Accept: "application/json", "Content-Type": "application/json", "x-olfactoryops-exact-billing-diagnostic": environment.EXACT_BILLING_DIAGNOSTIC_TOKEN }, body: JSON.stringify({ organizationId: fixture.organizationId, userId: fixture.userId, hostname: fixture.hostname }) }); return { status: response.status, body: await jsonBody(response) }; },
    candidateBilling: async (fixture) => { const response = await fetch(`${API_ORIGIN}/api/v1/v2/platform/workspace/billing`, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { Accept: "application/json", Origin: `https://${fixture.hostname}`, ...(fixture.signupCookie ? { Cookie: fixture.signupCookie } : {}) } }); const body = await jsonBody(response); return { status: response.status, errorCode: body?.error?.code }; },
    cleanupFixture: async (fixture) => { await client.query("BEGIN"); try { await client.query("UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'EXACT_BILLING_PATH_DIAGNOSTIC_ARCHIVED') WHERE organization_id = $1", [fixture.organizationId]); await client.query("UPDATE v2_workspace_hostnames SET status = 'ARCHIVED', updated_at = now() WHERE organization_id = $1", [fixture.organizationId]); await client.query("UPDATE v2_organizations SET status = 'ARCHIVED', updated_at = now() WHERE id = $1", [fixture.organizationId]); await client.query("COMMIT"); } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } },
    close: () => client.end(),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let adapters;
  try { adapters = await createRuntimeAdapters(process.env); await runExactBillingPathDiagnostic({ adapters }); }
  catch (error) { const codeValue = error instanceof Error && /^EXACT_BILLING_PATH_DIAGNOSTIC_FAIL:[A-Z0-9_:-]+$/.test(error.message) ? error.message.split(":").at(-1) : "UNCLASSIFIED"; console.log(JSON.stringify({ EXACT_BILLING_PATH_DIAGNOSTIC_FINAL_STATE: "FAIL", BILLING_FAILURE_CATEGORY: codeValue })); process.exitCode = 1; }
  finally { await adapters?.close?.().catch(() => undefined); }
}
