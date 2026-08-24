import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import {
  inspectStaleRouteInventory,
  staleRouteCleanupExpectation as expectation,
} from "./cleanup-v2-rc12-candidate-stale-route.mjs";

const versionPattern =
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

function opaque(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
      );
    })
  );
}

function statePath(environment) {
  const directory = required(environment, "RC12_ROUTE_RECOVERY_DIR");
  const runnerTemp = required(environment, "RUNNER_TEMP");
  const relativeDirectory = relative(runnerTemp, directory);
  if (
    relativeDirectory.startsWith("..") ||
    relativeDirectory.includes("/") ||
    relativeDirectory.includes("\\") ||
    !basename(directory).startsWith("oo-v2-rc12-route-recovery-")
  )
    throw failure("INVALID_EVIDENCE_DIRECTORY");
  return join(directory, "recovery-state.json");
}

function writeState(state, environment) {
  writeFileSync(statePath(environment), JSON.stringify(state), { mode: 0o600 });
}

function readState(environment) {
  let state;
  try {
    state = JSON.parse(readFileSync(statePath(environment), "utf8"));
  } catch {
    throw failure("RECOVERY_STATE_UNAVAILABLE");
  }
  if (
    !opaque(state?.zoneId) ||
    !opaque(state?.domainId) ||
    !versionPattern.test(state?.candidateVersion ?? "") ||
    !versionPattern.test(state?.liveVersion ?? "") ||
    !Array.isArray(state?.preservedRoutes) ||
    (state?.createdRouteId !== null && !opaque(state?.createdRouteId))
  )
    throw failure("RECOVERY_STATE_INVALID");
  return state;
}

export function recoveryConfig(environment = process.env) {
  const releaseSha = required(environment, "RC12_ROUTE_RECOVERY_RELEASE_SHA");
  const fixtureHostname = required(
    environment,
    "RC12_ROUTE_RECOVERY_FIXTURE_HOSTNAME",
  );
  if (
    releaseSha !== expectation.releaseSha ||
    fixtureHostname !== expectation.fixtureHostname
  )
    throw failure("INVALID_IMMUTABLE_INPUT");
  return {
    accountId: required(environment, "CLOUDFLARE_ACCOUNT_ID"),
    apiToken: required(environment, "CLOUDFLARE_API_TOKEN"),
    releaseSha,
    fixtureHostname,
  };
}

function accountUrl(config, suffix) {
  return new URL(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}${suffix}`,
  );
}

function zoneUrl(config, zoneId, suffix) {
  return new URL(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}${suffix}`,
  );
}

async function request({ config, url, method = "GET", body, fetchFn = fetch }) {
  try {
    const response = await fetchFn(url, {
      method,
      redirect: "manual",
      credentials: "omit",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
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
      status:
        Number.isInteger(response?.status) &&
        response.status >= 100 &&
        response.status <= 599
          ? response.status
          : 0,
      success: response?.ok === true && envelope?.success === true,
      parsed,
      envelope,
    };
  } catch {
    return { status: 0, success: false, parsed: false, envelope: undefined };
  }
}

async function readDomain(config, fetchFn) {
  const url = accountUrl(config, "/workers/domains");
  url.searchParams.set("hostname", config.fixtureHostname);
  const response = await request({ config, url, fetchFn });
  const domains = response.envelope?.result;
  const matches = Array.isArray(domains)
    ? domains.filter((domain) => domain?.hostname === config.fixtureHostname)
    : [];
  if (
    !response.success ||
    matches.length !== 1 ||
    matches[0]?.service !== expectation.candidateRouterService ||
    matches[0]?.zone_name !== expectation.zoneName ||
    !opaque(matches[0]?.id) ||
    !opaque(matches[0]?.zone_id)
  )
    throw failure("CUSTOM_DOMAIN_OWNERSHIP_UNPROVEN");
  return { id: matches[0].id, zoneId: matches[0].zone_id };
}

async function readRoutes(config, zoneId, fetchFn) {
  const response = await request({
    config,
    url: zoneUrl(config, zoneId, "/workers/routes"),
    fetchFn,
  });
  if (!response.success) throw failure("ROUTE_INVENTORY_UNAVAILABLE");
  return inspectStaleRouteInventory(response.envelope?.result);
}

async function readRoutesAfterMutation(
  config,
  zoneId,
  fetchFn,
  waitFn,
  attempts = 3,
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await readRoutes(config, zoneId, fetchFn);
    } catch (error) {
      if (attempt === attempts) throw error;
      await waitFn(2_000);
    }
  }
  throw failure("ROUTE_INVENTORY_UNAVAILABLE");
}

function sameRoutes(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function activeVersion(envelope) {
  const deployment = envelope?.result?.deployments?.[0];
  if (
    envelope?.success !== true ||
    deployment?.strategy !== "percentage" ||
    !Array.isArray(deployment?.versions) ||
    deployment.versions.length !== 1 ||
    deployment.versions[0]?.percentage !== 100 ||
    !versionPattern.test(deployment.versions[0]?.version_id ?? "")
  )
    throw failure("ACTIVE_ROUTER_VERSION_UNPROVEN");
  return deployment.versions[0].version_id.toLowerCase();
}

async function readActiveVersion(config, service, fetchFn) {
  const response = await request({
    config,
    url: accountUrl(
      config,
      `/workers/scripts/${encodeURIComponent(service)}/deployments`,
    ),
    fetchFn,
  });
  if (!response.success) throw failure("ROUTER_DEPLOYMENT_READ_FAILED");
  return activeVersion(response.envelope);
}

function exactBinding(bindings, name, type, value) {
  const matches = bindings.filter(
    (binding) => binding?.name === name && binding?.type === type,
  );
  return (
    matches.length === 1 &&
    (type === "hyperdrive"
      ? matches[0]?.id === value
      : matches[0]?.text === value)
  );
}

async function requireCandidateConfig(config, versionId, fetchFn) {
  const response = await request({
    config,
    url: accountUrl(
      config,
      `/workers/scripts/${encodeURIComponent(expectation.candidateRouterService)}/versions/${encodeURIComponent(versionId)}`,
    ),
    fetchFn,
  });
  const result = response.envelope?.result;
  const bindings = result?.resources?.bindings;
  if (
    !response.success ||
    result?.id?.toLowerCase() !== versionId ||
    !Array.isArray(bindings) ||
    !exactBinding(bindings, "RELEASE_GIT_SHA", "plain_text", expectation.releaseSha) ||
    !exactBinding(bindings, "PAGES_ORIGIN", "plain_text", expectation.candidatePagesOrigin) ||
    !exactBinding(bindings, "V2_WORKSPACE_BASE_DOMAIN", "plain_text", expectation.workspaceBaseDomain) ||
    !exactBinding(bindings, "RELEASE_ENVIRONMENT", "plain_text", "production") ||
    !exactBinding(bindings, "HYPERDRIVE", "hyperdrive", expectation.hyperdriveId)
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

async function fixtureState(fetchFn) {
  try {
    const response = await fetchFn(
      `https://${expectation.fixtureHostname}/`,
      {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: { "cache-control": "no-cache", pragma: "no-cache" },
        signal: AbortSignal.timeout(20_000),
      },
    );
    const exact =
      response?.status === 200 &&
      response.headers?.get?.("x-olfactoryops-workspace-router") === "active" &&
      response.headers?.get?.("x-olfactoryops-release-sha") === expectation.releaseSha;
    return { status: response?.status ?? 0, exact };
  } catch {
    return { status: 0, exact: false };
  }
}

export async function preflightRouteRecovery({
  config,
  environment = process.env,
  fetchFn = fetch,
  publicFetchFn = fetch,
}) {
  const domain = await readDomain(config, fetchFn);
  const inventory = await readRoutes(config, domain.zoneId, fetchFn);
  if (
    inventory.liveRoutes.length === 0 ||
    inventory.staleRoutes.length !== 0 ||
    inventory.candidateRoutes.length !== 0 ||
    inventory.conflictingExactRoutes.length !== 0
  )
    throw failure("RECOVERY_ROUTE_PRECONDITION_FAILED");
  const candidateVersion = await readActiveVersion(
    config,
    expectation.candidateRouterService,
    fetchFn,
  );
  await requireCandidateConfig(config, candidateVersion, fetchFn);
  const liveVersion = await readActiveVersion(
    config,
    expectation.liveRouterService,
    fetchFn,
  );
  const publicState = await fixtureState(publicFetchFn);
  if (publicState.exact || publicState.status !== 404)
    throw failure("RECOVERY_PUBLIC_PRECONDITION_UNPROVEN");
  writeState(
    {
      zoneId: domain.zoneId,
      domainId: domain.id,
      preservedRoutes: inventory.preservedRoutes,
      candidateVersion,
      liveVersion,
      createdRouteId: null,
    },
    environment,
  );
  emit("RC12_ROUTE_RECOVERY_REQUIRED", "YES");
  emit("EXACT_CANDIDATE_ZONE_ROUTE_ABSENT", "PASS");
  emit("EXACT_CUSTOM_DOMAIN_PRESERVED", "PASS");
  emit("CANDIDATE_ROUTER_CONFIGURATION", "PASS");
  emit("LIVE_ROUTE_BASELINE_CAPTURED", "PASS");
  emit("FIXTURE_PRE_RECOVERY_HTTP", 404);
}

export async function createRecoveredRoute({
  config,
  environment = process.env,
  fetchFn = fetch,
  waitFn = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const state = readState(environment);
  const domain = await readDomain(config, fetchFn);
  const before = await readRoutes(config, state.zoneId, fetchFn);
  if (
    domain.id !== state.domainId ||
    domain.zoneId !== state.zoneId ||
    before.staleRoutes.length !== 0 ||
    before.candidateRoutes.length !== 0 ||
    before.conflictingExactRoutes.length !== 0 ||
    !sameRoutes(before.preservedRoutes, state.preservedRoutes)
  )
    throw failure("RECOVERY_STATE_CHANGED_BEFORE_CREATE");
  const response = await request({
    config,
    url: zoneUrl(config, state.zoneId, "/workers/routes"),
    method: "POST",
    body: {
      pattern: expectation.staleRoutePattern,
      script: expectation.candidateRouterService,
    },
    fetchFn,
  });
  const acknowledgedCreatedRouteId =
    response.success && opaque(response.envelope?.result?.id)
      ? response.envelope.result.id
      : null;
  if (acknowledgedCreatedRouteId !== null) {
    writeState(
      { ...state, createdRouteId: acknowledgedCreatedRouteId },
      environment,
    );
  }
  const after = await readRoutesAfterMutation(
    config,
    state.zoneId,
    fetchFn,
    waitFn,
  );
  const routeCreated =
    after.staleRoutes.length === 1 &&
    after.candidateRoutes.length === 1 &&
    after.conflictingExactRoutes.length === 0 &&
    sameRoutes(after.preservedRoutes, state.preservedRoutes) &&
    (acknowledgedCreatedRouteId === null ||
      after.staleRoutes[0].id === acknowledgedCreatedRouteId);
  if (routeCreated) {
    writeState(
      { ...state, createdRouteId: after.staleRoutes[0].id },
      environment,
    );
  }
  if (!routeCreated)
    throw failure("RECOVERY_ROUTE_CREATE_CONFIRMATION_FAILED");
  if (
    !response.success &&
    !(
      response.status >= 200 &&
      response.status < 300 &&
      (!response.parsed || response.envelope?.success === undefined)
    )
  )
    throw failure("RECOVERY_ROUTE_CREATE_REJECTED");
  emit("RC12_EXACT_CANDIDATE_ROUTE_CREATED", "PASS");
  emit("ROUTE_CREATION_COUNT", 1);
}

async function requirePublicFixture(fetchFn, waitFn) {
  const paths = ["/", "/login", "/signup", "/v2/login", "/v2/signup"];
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    let allPass = true;
    for (const path of paths) {
      try {
        const response = await fetchFn(
          `https://${expectation.fixtureHostname}${path}`,
          {
            method: "GET",
            redirect: "manual",
            credentials: "omit",
            headers: { "cache-control": "no-cache", pragma: "no-cache" },
            signal: AbortSignal.timeout(20_000),
          },
        );
        allPass =
          allPass &&
          response?.status === 200 &&
          /^text\/html\b/i.test(response.headers?.get?.("content-type") ?? "") &&
          response.headers?.get?.("x-olfactoryops-workspace-router") === "active" &&
          response.headers?.get?.("x-olfactoryops-release-environment") === "production" &&
          response.headers?.get?.("x-olfactoryops-release-sha") === expectation.releaseSha;
      } catch {
        allPass = false;
      }
    }
    try {
      const releaseResponse = await fetchFn(
        `https://${expectation.fixtureHostname}/release.json`,
        {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          headers: { "cache-control": "no-cache", pragma: "no-cache" },
          signal: AbortSignal.timeout(20_000),
        },
      );
      const release = await releaseResponse.json();
      allPass =
        allPass &&
        releaseResponse?.status === 200 &&
        release?.fullGitSha === expectation.releaseSha &&
        release?.artifact === "pages";
    } catch {
      allPass = false;
    }
    if (allPass) return;
    if (attempt < 12) await waitFn(5_000);
  }
  throw failure("RECOVERED_FIXTURE_NOT_READY");
}

export async function verifyRecoveredRoute({
  config,
  environment = process.env,
  fetchFn = fetch,
  publicFetchFn = fetch,
  waitFn = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const state = readState(environment);
  if (!opaque(state.createdRouteId)) throw failure("RECOVERED_ROUTE_ID_UNAVAILABLE");
  const domain = await readDomain(config, fetchFn);
  const inventory = await readRoutes(config, state.zoneId, fetchFn);
  if (
    domain.id !== state.domainId ||
    domain.zoneId !== state.zoneId ||
    inventory.staleRoutes.length !== 1 ||
    inventory.staleRoutes[0].id !== state.createdRouteId ||
    inventory.candidateRoutes.length !== 1 ||
    !sameRoutes(inventory.preservedRoutes, state.preservedRoutes)
  )
    throw failure("RECOVERED_ROUTE_INVENTORY_INVALID");
  const candidateVersion = await readActiveVersion(
    config,
    expectation.candidateRouterService,
    fetchFn,
  );
  await requireCandidateConfig(config, candidateVersion, fetchFn);
  const liveVersion = await readActiveVersion(
    config,
    expectation.liveRouterService,
    fetchFn,
  );
  if (
    candidateVersion !== state.candidateVersion ||
    liveVersion !== state.liveVersion
  )
    throw failure("ROUTER_VERSION_CHANGED_DURING_RECOVERY");
  await requirePublicFixture(publicFetchFn, waitFn);
  emit("RC12_EXACT_CANDIDATE_ROUTE_RECOVERY", "PASS");
  emit("EXACT_FIXTURE_FIVE_ROUTES", "PASS");
  emit("EXACT_FIXTURE_RELEASE_IDENTITY", "PASS");
  emit("CANDIDATE_ROUTER_RELEASE_SHA", "PASS");
  emit("LIVE_ROUTE_SET_UNCHANGED", "PASS");
  emit("LIVE_TENANT_ROUTER_UNCHANGED", "PASS");
  emit("PUBLIC_PRODUCTION_MUTATION", "NONE");
}

export async function rollbackRecoveredRoute({
  config,
  environment = process.env,
  fetchFn = fetch,
  waitFn = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const state = readState(environment);
  if (!opaque(state.createdRouteId)) {
    emit("RC12_ROUTE_RECOVERY_ROLLBACK", "NOT_REQUIRED");
    return;
  }
  const before = await readRoutes(config, state.zoneId, fetchFn);
  if (
    before.staleRoutes.length !== 1 ||
    before.staleRoutes[0].id !== state.createdRouteId ||
    before.candidateRoutes.length !== 1 ||
    !sameRoutes(before.preservedRoutes, state.preservedRoutes)
  )
    throw failure("RECOVERY_ROLLBACK_OWNERSHIP_UNPROVEN");
  const response = await request({
    config,
    url: zoneUrl(
      config,
      state.zoneId,
      `/workers/routes/${encodeURIComponent(state.createdRouteId)}`,
    ),
    method: "DELETE",
    fetchFn,
  });
  if (!response.success) throw failure("RECOVERY_ROLLBACK_DELETE_FAILED");
  const after = await readRoutesAfterMutation(
    config,
    state.zoneId,
    fetchFn,
    waitFn,
  );
  if (
    after.staleRoutes.length !== 0 ||
    after.candidateRoutes.length !== 0 ||
    !sameRoutes(after.preservedRoutes, state.preservedRoutes)
  )
    throw failure("RECOVERY_ROLLBACK_CONFIRMATION_FAILED");
  emit("RC12_ROUTE_RECOVERY_ROLLBACK", "PASS");
}

async function main() {
  const mode = process.argv[2];
  const config = recoveryConfig();
  if (mode === "preflight") return preflightRouteRecovery({ config });
  if (mode === "create") return createRecoveredRoute({ config });
  if (mode === "verify") return verifyRecoveredRoute({ config });
  if (mode === "rollback") return rollbackRecoveredRoute({ config });
  throw failure("INVALID_MODE");
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    emit("RC12_ROUTE_RECOVERY_FAILURE", "FAIL");
    process.exitCode = 1;
  }
}
