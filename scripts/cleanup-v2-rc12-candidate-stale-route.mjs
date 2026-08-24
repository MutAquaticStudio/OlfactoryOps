import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

export const staleRouteCleanupExpectation = Object.freeze({
  releaseSha: "331c1a6054fe1420b063a2e1fe9e5cef4f043ff8",
  releaseTag: "v2-production-rc12",
  fixtureHostname:
    "rc9-release-31736285494-469ca8942a.next.labofscents.org",
  zoneName: "labofscents.org",
  staleRoutePattern:
    "https://rc9-release-31736285494-469ca8942a.next.labofscents.org/*",
  candidateRouterService:
    "olfactoryops-v2-tenant-router-production-candidate",
  liveRouterService: "olfactoryops-v2-tenant-router-production",
  candidatePagesOrigin:
    "https://olfactoryops-v2-production-candidate.pages.dev",
  workspaceBaseDomain: "next.labofscents.org",
  hyperdriveId: "b415b7572d9f45058ebb4ec4166b8739",
});

const maxIdentifierLength = 512;
const versionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0)
    throw failure("MISSING_REQUIRED_INPUT");
  return value;
}

function exact(value, expected) {
  if (value !== expected) throw failure("INVALID_IMMUTABLE_INPUT");
  return value;
}

function opaqueIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxIdentifierLength &&
    !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
      );
    })
  );
}

function safeHttpStatus(response) {
  return Number.isInteger(response?.status) &&
    response.status >= 100 &&
    response.status <= 599
    ? response.status
    : 0;
}

function safeCloudflareErrorCode(envelope) {
  const errors = Array.isArray(envelope?.errors) ? envelope.errors : [];
  const match = errors.find(
    (error) => Number.isSafeInteger(error?.code) && error.code >= 1000,
  );
  return match ? String(match.code) : "NONE";
}

function statePath(environment = process.env) {
  const directory = required(environment, "RC12_STALE_ROUTE_CLEANUP_DIR");
  const runnerTemp = required(environment, "RUNNER_TEMP");
  const relativeDirectory = relative(runnerTemp, directory);
  if (
    relativeDirectory.startsWith("..") ||
    relativeDirectory.includes("/") ||
    relativeDirectory.includes("\\") ||
    !basename(directory).startsWith("oo-v2-rc12-stale-route-cleanup-")
  )
    throw failure("INVALID_EVIDENCE_DIRECTORY");
  return join(directory, "route-state.json");
}

function writeState(state, environment) {
  writeFileSync(statePath(environment), JSON.stringify(state), { mode: 0o600 });
}

function readState(environment) {
  let state;
  try {
    state = JSON.parse(readFileSync(statePath(environment), "utf8"));
  } catch {
    throw failure("STALE_ROUTE_STATE_UNAVAILABLE");
  }
  if (
    !opaqueIdentifier(state?.zoneId) ||
    !opaqueIdentifier(state?.domainId) ||
    !versionIdPattern.test(state?.candidateVersion ?? "") ||
    !versionIdPattern.test(state?.liveVersion ?? "") ||
    !Array.isArray(state?.preservedRoutes) ||
    (![null, undefined].includes(state?.staleRouteId) &&
      !opaqueIdentifier(state?.staleRouteId))
  )
    throw failure("STALE_ROUTE_STATE_INVALID");
  return state;
}

export function staleRouteCleanupConfig(environment = process.env) {
  return {
    accountId: required(environment, "CLOUDFLARE_ACCOUNT_ID"),
    apiToken: required(environment, "CLOUDFLARE_API_TOKEN"),
    releaseSha: exact(
      required(environment, "RC12_STALE_ROUTE_RELEASE_SHA"),
      staleRouteCleanupExpectation.releaseSha,
    ),
    fixtureHostname: exact(
      required(environment, "RC12_STALE_ROUTE_FIXTURE_HOSTNAME"),
      staleRouteCleanupExpectation.fixtureHostname,
    ),
  };
}

function accountEndpoint(config, suffix) {
  return new URL(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}${suffix}`,
  );
}

function zoneEndpoint(config, zoneId, suffix) {
  return new URL(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}${suffix}`,
  );
}

async function request({ config, url, method = "GET", fetchFn = fetch }) {
  try {
    const response = await fetchFn(url, {
      method,
      redirect: "manual",
      credentials: "omit",
      headers: { authorization: `Bearer ${config.apiToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    let envelope;
    let parsed = true;
    try {
      envelope = await response.json();
    } catch {
      parsed = false;
    }
    return {
      httpStatus: safeHttpStatus(response),
      success: response?.ok === true && envelope?.success === true,
      parsed,
      envelope,
      cfErrorCode: safeCloudflareErrorCode(envelope),
    };
  } catch {
    return {
      httpStatus: 0,
      success: false,
      parsed: false,
      envelope: undefined,
      cfErrorCode: "NONE",
    };
  }
}

function routeSignature(route) {
  if (
    !opaqueIdentifier(route?.id) ||
    typeof route?.pattern !== "string" ||
    route.pattern.length === 0 ||
    route.pattern.length > 512 ||
    !(typeof route?.script === "string" || route?.script === null)
  )
    throw failure("ZONE_ROUTE_INVENTORY_INVALID");
  return { id: route.id, pattern: route.pattern, script: route.script };
}

function sortedRouteSet(routes) {
  return routes
    .map(routeSignature)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function sameRouteSet(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function inspectStaleRouteInventory(
  routes,
  expectation = staleRouteCleanupExpectation,
) {
  if (!Array.isArray(routes)) throw failure("ZONE_ROUTE_INVENTORY_INVALID");
  const normalized = sortedRouteSet(routes);
  const staleRoutes = normalized.filter(
    (route) =>
      route.pattern === expectation.staleRoutePattern &&
      route.script === expectation.candidateRouterService,
  );
  const conflictingExactRoutes = normalized.filter(
    (route) =>
      route.pattern === expectation.staleRoutePattern &&
      route.script !== expectation.candidateRouterService,
  );
  const candidateRoutes = normalized.filter(
    (route) => route.script === expectation.candidateRouterService,
  );
  const liveRoutes = normalized.filter(
    (route) => route.script === expectation.liveRouterService,
  );
  const preservedRoutes = normalized.filter(
    (route) => !staleRoutes.some((stale) => stale.id === route.id),
  );
  return {
    staleRoutes,
    conflictingExactRoutes,
    candidateRoutes,
    liveRoutes,
    preservedRoutes,
  };
}

function inspectExactDomain(domains, expectation = staleRouteCleanupExpectation) {
  if (!Array.isArray(domains)) throw failure("CUSTOM_DOMAIN_INVENTORY_INVALID");
  const matching = domains.filter(
    (domain) => domain?.hostname === expectation.fixtureHostname,
  );
  if (matching.length !== 1) throw failure("CUSTOM_DOMAIN_NOT_EXACTLY_ONE");
  const [domain] = matching;
  if (
    domain?.service !== expectation.candidateRouterService ||
    domain?.zone_name !== expectation.zoneName ||
    !opaqueIdentifier(domain?.id) ||
    !opaqueIdentifier(domain?.zone_id)
  )
    throw failure("CUSTOM_DOMAIN_OWNERSHIP_MISMATCH");
  return { id: domain.id, zoneId: domain.zone_id };
}

async function readDomain(config, fetchFn) {
  const url = accountEndpoint(config, "/workers/domains");
  url.searchParams.set("hostname", config.fixtureHostname);
  const response = await request({ config, url, fetchFn });
  if (!response.success) throw failure("CUSTOM_DOMAIN_INVENTORY_UNAVAILABLE");
  return inspectExactDomain(response.envelope?.result);
}

async function readRoutes(config, zoneId, fetchFn) {
  const response = await request({
    config,
    url: zoneEndpoint(config, zoneId, "/workers/routes"),
    fetchFn,
  });
  if (!response.success)
    throw failure("ZONE_ROUTE_INVENTORY_UNAVAILABLE");
  return inspectStaleRouteInventory(response.envelope?.result);
}

function singleActiveVersion(envelope) {
  if (envelope?.success !== true || !Array.isArray(envelope?.result?.deployments))
    throw failure("ROUTER_DEPLOYMENT_INVENTORY_INVALID");
  const deployment = envelope.result.deployments[0];
  if (
    deployment?.strategy !== "percentage" ||
    !Array.isArray(deployment?.versions) ||
    deployment.versions.length !== 1 ||
    deployment.versions[0]?.percentage !== 100 ||
    !versionIdPattern.test(deployment.versions[0]?.version_id ?? "")
  )
    throw failure("ROUTER_ACTIVE_VERSION_UNPROVEN");
  return deployment.versions[0].version_id.toLowerCase();
}

async function readActiveVersion(config, service, fetchFn) {
  const response = await request({
    config,
    url: accountEndpoint(
      config,
      `/workers/scripts/${encodeURIComponent(service)}/deployments`,
    ),
    fetchFn,
  });
  if (!response.success) throw failure("ROUTER_DEPLOYMENT_INVENTORY_UNAVAILABLE");
  return singleActiveVersion(response.envelope);
}

function exactBinding(bindings, expected) {
  const matches = bindings.filter(
    (binding) =>
      binding?.name === expected.name && binding?.type === expected.type,
  );
  if (matches.length !== 1) return false;
  return expected.type === "hyperdrive"
    ? matches[0]?.id === expected.value
    : matches[0]?.text === expected.value;
}

async function requireCandidateConfiguration(config, versionId, fetchFn) {
  const response = await request({
    config,
    url: accountEndpoint(
      config,
      `/workers/scripts/${encodeURIComponent(staleRouteCleanupExpectation.candidateRouterService)}/versions/${encodeURIComponent(versionId)}`,
    ),
    fetchFn,
  });
  const result = response.envelope?.result;
  const bindings = result?.resources?.bindings;
  if (
    !response.success ||
    result?.id?.toLowerCase() !== versionId ||
    !Array.isArray(bindings) ||
    ![
      { name: "RELEASE_GIT_SHA", type: "plain_text", value: staleRouteCleanupExpectation.releaseSha },
      { name: "PAGES_ORIGIN", type: "plain_text", value: staleRouteCleanupExpectation.candidatePagesOrigin },
      { name: "V2_WORKSPACE_BASE_DOMAIN", type: "plain_text", value: staleRouteCleanupExpectation.workspaceBaseDomain },
      { name: "RELEASE_ENVIRONMENT", type: "plain_text", value: "production" },
      { name: "HYPERDRIVE", type: "hyperdrive", value: staleRouteCleanupExpectation.hyperdriveId },
    ].every((expected) => exactBinding(bindings, expected))
  )
    throw failure("CANDIDATE_ROUTER_CONFIGURATION_UNPROVEN");
}

function emit(name, value) {
  const safe =
    typeof value === "number"
      ? String(value)
      : typeof value === "string" && /^[A-Z0-9_]+$/.test(value)
        ? value
        : "UNPROVEN";
  console.log(`${name}=${safe}`);
}

export async function preflightStaleRouteCleanup({
  config,
  environment = process.env,
  fetchFn = fetch,
}) {
  const domain = await readDomain(config, fetchFn);
  const inventory = await readRoutes(config, domain.zoneId, fetchFn);
  if (
    inventory.liveRoutes.length === 0 ||
    inventory.conflictingExactRoutes.length !== 0 ||
    inventory.staleRoutes.length > 1 ||
    inventory.candidateRoutes.length !== inventory.staleRoutes.length
  )
    throw failure("STALE_ROUTE_OWNERSHIP_UNPROVEN");
  if (
    inventory.staleRoutes[0]?.id === domain.id ||
    inventory.staleRoutes.some(
      (route) => route.script === staleRouteCleanupExpectation.liveRouterService,
    )
  )
    throw failure("STALE_ROUTE_RESOURCE_BOUNDARY_UNPROVEN");
  const candidateVersion = await readActiveVersion(
    config,
    staleRouteCleanupExpectation.candidateRouterService,
    fetchFn,
  );
  await requireCandidateConfiguration(config, candidateVersion, fetchFn);
  const liveVersion = await readActiveVersion(
    config,
    staleRouteCleanupExpectation.liveRouterService,
    fetchFn,
  );
  writeState(
    {
      zoneId: domain.zoneId,
      domainId: domain.id,
      staleRouteId: inventory.staleRoutes[0]?.id ?? null,
      preservedRoutes: inventory.preservedRoutes,
      candidateVersion,
      liveVersion,
      deletionCount: 0,
      staleAlreadyAbsent: inventory.staleRoutes.length === 0,
    },
    environment,
  );
  emit("STALE_ROUTE_IDENTIFIED", "PASS");
  emit("STALE_ROUTE_CANDIDATE_ONLY", "PASS");
  emit("STALE_ROUTE_NOT_LIVE", "PASS");
  emit("STALE_ROUTE_NOT_CURRENT_RC12_CONTRACT", "PASS");
  emit("EXACT_FIXTURE_ROUTE_PRESENT", "PASS");
  emit("EXACT_FIXTURE_ROUTE_TARGET", "PASS");
  emit("WILDCARD_ROUTE_COUNT", inventory.staleRoutes.length);
  emit("LIVE_ROUTE_BASELINE_CAPTURED", "PASS");
  emit("LIVE_TENANT_ROUTER_BASELINE_CAPTURED", "PASS");
  return inventory;
}

function classifyDelete(response) {
  if (response.httpStatus < 200 || response.httpStatus >= 300)
    return "UNACKNOWLEDGED_FAILURE";
  if (response.cfErrorCode !== "NONE") return "UNACKNOWLEDGED_FAILURE";
  if (response.success) return "ACKNOWLEDGED";
  if (!response.parsed || response.envelope?.success === undefined)
    return "ACKNOWLEDGED_UNCONFIRMED";
  return "UNACKNOWLEDGED_FAILURE";
}

export async function deleteStaleRoute({
  config,
  environment = process.env,
  fetchFn = fetch,
}) {
  const state = readState(environment);
  const domain = await readDomain(config, fetchFn);
  if (domain.id !== state.domainId || domain.zoneId !== state.zoneId)
    throw failure("CUSTOM_DOMAIN_CHANGED_BEFORE_DELETE");
  let inventory = await readRoutes(config, state.zoneId, fetchFn);
  const currentStale = inventory.staleRoutes[0];
  if (
    inventory.staleRoutes.length > 1 ||
    inventory.conflictingExactRoutes.length !== 0 ||
    inventory.candidateRoutes.length !== inventory.staleRoutes.length ||
    !sameRouteSet(inventory.preservedRoutes, state.preservedRoutes)
  )
    throw failure("ROUTE_SET_CHANGED_BEFORE_DELETE");
  if (!currentStale) {
    writeState(
      { ...state, deletionCount: 0, staleAlreadyAbsent: true },
      environment,
    );
    emit("ROUTE_DELETION_COUNT", 0);
    emit("STALE_ROUTE_ALREADY_ABSENT", "YES");
    return;
  }
  if (!state.staleRouteId || currentStale.id !== state.staleRouteId)
    throw failure("STALE_ROUTE_ID_CHANGED_BEFORE_DELETE");
  const response = await request({
    config,
    url: zoneEndpoint(
      config,
      state.zoneId,
      `/workers/routes/${encodeURIComponent(state.staleRouteId)}`,
    ),
    method: "DELETE",
    fetchFn,
  });
  const responseClass = classifyDelete(response);
  if (responseClass === "UNACKNOWLEDGED_FAILURE")
    throw failure("STALE_ROUTE_DELETE_REJECTED");
  inventory = await readRoutes(config, state.zoneId, fetchFn);
  if (
    inventory.staleRoutes.length !== 0 ||
    inventory.conflictingExactRoutes.length !== 0 ||
    inventory.candidateRoutes.length !== 0 ||
    !sameRouteSet(inventory.preservedRoutes, state.preservedRoutes)
  )
    throw failure("STALE_ROUTE_DELETE_CONFIRMATION_FAILED");
  writeState(
    { ...state, deletionCount: 1, staleAlreadyAbsent: false },
    environment,
  );
  emit("ROUTE_DELETION_COUNT", 1);
  emit("STALE_ROUTE_ALREADY_ABSENT", "NO");
  emit("STALE_ROUTE_DELETE_RESPONSE", responseClass);
}

async function requirePublicFixture(fetchFn) {
  const base = `https://${staleRouteCleanupExpectation.fixtureHostname}`;
  for (const path of ["/", "/login", "/signup", "/v2/login", "/v2/signup"]) {
    const response = await fetchFn(`${base}${path}`, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      signal: AbortSignal.timeout(20_000),
    });
    if (
      response?.status !== 200 ||
      !/^text\/html\b/i.test(response.headers?.get?.("content-type") ?? "") ||
      response.headers?.get?.("x-olfactoryops-workspace-router") !== "active" ||
      response.headers?.get?.("x-olfactoryops-release-environment") !== "production" ||
      response.headers?.get?.("x-olfactoryops-release-sha") !== staleRouteCleanupExpectation.releaseSha
    )
      throw failure("EXACT_FIXTURE_PUBLIC_VERIFICATION_FAILED");
  }
  const release = await fetchFn(`${base}/release.json`, {
    method: "GET",
    redirect: "manual",
    credentials: "omit",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    signal: AbortSignal.timeout(20_000),
  });
  let manifest;
  try {
    manifest = await release.json();
  } catch {
    throw failure("EXACT_FIXTURE_RELEASE_MANIFEST_INVALID");
  }
  if (
    release.status !== 200 ||
    manifest?.fullGitSha !== staleRouteCleanupExpectation.releaseSha ||
    manifest?.artifact !== "pages"
  )
    throw failure("EXACT_FIXTURE_RELEASE_IDENTITY_FAILED");
}

export async function verifyStaleRouteCleanup({
  config,
  environment = process.env,
  fetchFn = fetch,
  publicFetchFn = fetch,
}) {
  const state = readState(environment);
  const domain = await readDomain(config, fetchFn);
  if (domain.id !== state.domainId || domain.zoneId !== state.zoneId)
    throw failure("EXACT_FIXTURE_CUSTOM_DOMAIN_CHANGED");
  const inventory = await readRoutes(config, state.zoneId, fetchFn);
  if (
    inventory.staleRoutes.length !== 0 ||
    inventory.conflictingExactRoutes.length !== 0 ||
    inventory.candidateRoutes.length !== 0 ||
    !sameRouteSet(inventory.preservedRoutes, state.preservedRoutes)
  )
    throw failure("POSTDELETE_ROUTE_SET_INVALID");
  const candidateVersion = await readActiveVersion(
    config,
    staleRouteCleanupExpectation.candidateRouterService,
    fetchFn,
  );
  await requireCandidateConfiguration(config, candidateVersion, fetchFn);
  const liveVersion = await readActiveVersion(
    config,
    staleRouteCleanupExpectation.liveRouterService,
    fetchFn,
  );
  if (
    candidateVersion !== state.candidateVersion ||
    liveVersion !== state.liveVersion
  )
    throw failure("ROUTER_VERSION_CHANGED_DURING_CLEANUP");
  await requirePublicFixture(publicFetchFn);
  emit("ROUTE_DELETION_COUNT", state.deletionCount);
  emit("WILDCARD_ROUTE_COUNT", 0);
  emit("EXACT_FIXTURE_ROUTE_PRESENT", "PASS");
  emit("EXACT_FIXTURE_ROUTE_TARGET", "PASS");
  emit("TENANT_ROUTER_EXACT_ROUTE", "PASS");
  emit("LIVE_ROUTE_SET_UNCHANGED", "PASS");
  emit("LIVE_TENANT_ROUTER_UNCHANGED", "PASS");
  emit("CANDIDATE_ROUTER_RELEASE_SHA", "PASS");
  emit("FIXTURE_FIVE_ROUTES", "PASS");
  emit("PUBLIC_PRODUCTION_MUTATION", "NONE");
}

async function main() {
  const mode = process.argv[2];
  const config = staleRouteCleanupConfig();
  if (mode === "preflight") return preflightStaleRouteCleanup({ config });
  if (mode === "delete") return deleteStaleRoute({ config });
  if (mode === "verify") return verifyStaleRouteCleanup({ config });
  throw failure("INVALID_MODE");
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    emit("RC12_STALE_ROUTE_CLEANUP_FAILURE", "FAIL");
    process.exitCode = 1;
  }
}
