import { readFileSync, writeFileSync } from "node:fs";

import {
  inspectActiveRouterDeployment,
  inspectActiveRouterVersion,
  routerIngressExpectation,
} from "./inspect-v2-production-candidate-router-ingress.mjs";

export const exactRouteOverrideExpectation = Object.freeze({
  releaseSha: "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  fixtureHostname: "rc9-release-31736285494-469ca8942a.next.labofscents.org",
  routerService: "olfactoryops-v2-tenant-router-production-candidate",
  zoneName: "labofscents.org",
  routePattern:
    "https://rc9-release-31736285494-469ca8942a.next.labofscents.org/*",
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
  const directory = required(environment, "EXACT_ROUTE_OVERRIDE_DIR");
  const prefix = `${required(environment, "RUNNER_TEMP")}/oo-v2-exact-route-override-`;
  if (!directory.startsWith(prefix))
    throw failure("INVALID_EVIDENCE_DIRECTORY");
  return `${directory}/route-state.json`;
}

function writeState(state, environment) {
  writeFileSync(statePath(environment), JSON.stringify(state), { mode: 0o600 });
}

function readState(environment) {
  let state;
  try {
    state = JSON.parse(readFileSync(statePath(environment), "utf8"));
  } catch {
    throw failure("ROUTE_OVERRIDE_STATE_UNAVAILABLE");
  }
  if (!opaqueIdentifier(state?.zoneId) || !Array.isArray(state?.wildcards))
    throw failure("ROUTE_OVERRIDE_STATE_INVALID");
  return state;
}

export function exactRouteOverrideConfig(environment = process.env) {
  return {
    accountId: required(environment, "CLOUDFLARE_ACCOUNT_ID"),
    apiToken: required(environment, "CLOUDFLARE_API_TOKEN"),
    releaseSha: exact(
      required(environment, "EXACT_ROUTE_OVERRIDE_RELEASE_SHA"),
      exactRouteOverrideExpectation.releaseSha,
    ),
    fixtureHostname: exact(
      required(environment, "EXACT_ROUTE_OVERRIDE_FIXTURE_HOSTNAME"),
      exactRouteOverrideExpectation.fixtureHostname,
    ),
  };
}

function endpoint(config, suffix) {
  return new URL(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}${suffix}`,
  );
}

function zoneEndpoint(config, zoneId, suffix) {
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

function routeMatchesUrl(pattern, url) {
  if (
    typeof pattern !== "string" ||
    pattern.length === 0 ||
    pattern.length > 512
  )
    return false;
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .split("*")
    .join(".*");
  try {
    return new RegExp(`^${escaped}$`, "i").test(url);
  } catch {
    return false;
  }
}

function routeScore(pattern) {
  return typeof pattern === "string" ? pattern.replaceAll("*", "").length : -1;
}

function routeSignature(route) {
  return {
    id: opaqueIdentifier(route?.id) ? route.id : undefined,
    pattern: typeof route?.pattern === "string" ? route.pattern : undefined,
    script: typeof route?.script === "string" ? route.script : null,
  };
}

function sameRouteSet(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function inspectRouteInventory(
  routes,
  expectation = exactRouteOverrideExpectation,
) {
  if (!Array.isArray(routes)) throw failure("ZONE_ROUTE_INVENTORY_INVALID");
  const syntheticUrl = `https://${expectation.fixtureHostname}/`;
  const matching = routes.filter((route) =>
    routeMatchesUrl(route?.pattern, syntheticUrl),
  );
  const exact = routes.filter(
    (route) => route?.pattern === expectation.routePattern,
  );
  const wildcards = matching
    .filter((route) => route?.pattern !== expectation.routePattern)
    .filter(
      (route) =>
        typeof route?.pattern === "string" && route.pattern.includes("*"),
    )
    .map(routeSignature)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const exactCorrect = exact.filter(
    (route) =>
      route?.script === expectation.routerService &&
      opaqueIdentifier(route?.id),
  );
  const exactWrong = exact.length !== exactCorrect.length;
  const highestScore = Math.max(
    ...matching.map((route) => routeScore(route?.pattern)),
    -1,
  );
  const winners = matching.filter(
    (route) => routeScore(route?.pattern) === highestScore,
  );
  const candidateWins =
    winners.length === 1 &&
    winners[0]?.pattern === expectation.routePattern &&
    winners[0]?.script === expectation.routerService;
  return {
    matching,
    wildcards,
    exactCount: exact.length,
    exactCorrectCount: exactCorrect.length,
    exactWrong,
    exactRoute:
      exactCorrect.length === 1 ? routeSignature(exactCorrect[0]) : undefined,
    candidateWins,
  };
}

async function readRoutes(config, zoneId, fetchFn) {
  const response = await request({
    config,
    url: zoneEndpoint(config, zoneId, "/workers/routes"),
    fetchFn,
  });
  if (!response.success || !Array.isArray(response?.envelope?.result))
    throw failure("ZONE_ROUTE_INVENTORY_UNAVAILABLE");
  return inspectRouteInventory(response.envelope.result);
}

async function preflightDomainAndZone(config, fetchFn) {
  const domainUrl = endpoint(config, "/workers/domains");
  domainUrl.searchParams.set("hostname", config.fixtureHostname);
  const domainResponse = await request({ config, url: domainUrl, fetchFn });
  const domains = domainResponse?.envelope?.result;
  if (!domainResponse.success || !Array.isArray(domains))
    throw failure("CUSTOM_DOMAIN_PRECHECK_UNAVAILABLE");
  const matching = domains.filter(
    (domain) => domain?.hostname === config.fixtureHostname,
  );
  if (matching.length !== 1) throw failure("CUSTOM_DOMAIN_PRECHECK_AMBIGUOUS");
  const [domain] = matching;
  if (
    domain?.service !== exactRouteOverrideExpectation.routerService ||
    domain?.zone_name !== exactRouteOverrideExpectation.zoneName ||
    !opaqueIdentifier(domain?.zone_id)
  )
    throw failure("CUSTOM_DOMAIN_PRECHECK_MISMATCH");
  const zoneResponse = await request({
    config,
    url: zoneEndpoint(config, domain.zone_id, ""),
    fetchFn,
  });
  if (
    !zoneResponse.success ||
    zoneResponse?.envelope?.result?.status !== "active"
  )
    throw failure("CANDIDATE_ZONE_NOT_ACTIVE");
  return domain.zone_id;
}

async function requireActiveRouter(config, fetchFn) {
  const deployment = await request({
    config,
    url: endpoint(
      config,
      `/workers/scripts/${encodeURIComponent(exactRouteOverrideExpectation.routerService)}/deployments`,
    ),
    fetchFn,
  });
  const active = inspectActiveRouterDeployment(deployment.envelope);
  if (!active.activeTraffic || !active.versionId)
    throw failure("CURRENT_ROUTER_ACTIVE_TRAFFIC_UNPROVEN");
  const version = await request({
    config,
    url: endpoint(
      config,
      `/workers/scripts/${encodeURIComponent(exactRouteOverrideExpectation.routerService)}/versions/${encodeURIComponent(active.versionId)}`,
    ),
    fetchFn,
  });
  const detail = inspectActiveRouterVersion(version.envelope, {
    versionId: active.versionId,
    expectation: routerIngressExpectation,
  });
  if (!detail.configurationMatch)
    throw failure("CURRENT_ROUTER_CONFIGURATION_UNPROVEN");
  return active.versionId;
}

function print(name, value) {
  const safe =
    typeof value === "number"
      ? String(value)
      : typeof value === "string" && /^[A-Z0-9_]+$/.test(value)
        ? value
        : "UNPROVEN";
  console.log(`${name}=${safe}`);
}

function printRouteEvidence(inventory, unchanged) {
  print(
    "EXISTING_WILDCARD_ROUTE_PRESENT",
    inventory.wildcards.length > 0 ? "YES" : "NO",
  );
  print("EXISTING_WILDCARD_ROUTE_UNCHANGED", unchanged ? "YES" : "NO");
  print("EXACT_CANDIDATE_OVERRIDE_ROUTE_COUNT", inventory.exactCount);
  print(
    "EXACT_CANDIDATE_ROUTE_PATTERN",
    inventory.exactWrong ? "FAIL" : "PASS",
  );
  print("EXACT_CANDIDATE_ROUTE_SCRIPT", inventory.exactWrong ? "FAIL" : "PASS");
  print("EXACT_SYNTHETIC_ROUTE_MATCHES", inventory.matching.length);
  print(
    "CANDIDATE_ROUTE_PRECEDENCE_OVERRIDE",
    inventory.candidateWins ? "PASS" : "FAIL",
  );
}

export async function preflightExactRouteOverride({
  config,
  environment = process.env,
  fetchFn = fetch,
}) {
  const zoneId = await preflightDomainAndZone(config, fetchFn);
  const versionId = await requireActiveRouter(config, fetchFn);
  const inventory = await readRoutes(config, zoneId, fetchFn);
  if (
    inventory.wildcards.length === 0 ||
    inventory.exactWrong ||
    inventory.exactCount > 1
  )
    throw failure("EXACT_ROUTE_PREFLIGHT_FAILED");
  writeState(
    { zoneId, versionId, wildcards: inventory.wildcards, created: false },
    environment,
  );
  print("CANDIDATE_ZONE_STATUS", "ACTIVE");
  if (versionIdPattern.test(versionId))
    console.log(`CURRENT_ROUTER_VERSION_ID=${versionId.toLowerCase()}`);
  print("CURRENT_ROUTER_RELEASE_SHA_MATCH", "PASS");
  print("CURRENT_ROUTER_PAGES_ORIGIN_MATCH", "PASS");
  print("CURRENT_ROUTER_WORKSPACE_BASE_DOMAIN_MATCH", "PASS");
  print("CURRENT_ROUTER_HYPERDRIVE_MATCH", "PASS");
  print("CURRENT_ROUTER_CONFIGURATION", "PASS");
  print("EXISTING_WILDCARD_ROUTE_PRESENT", "YES");
  print("EXISTING_WILDCARD_ROUTE_UNCHANGED", "YES");
  print("EXACT_CANDIDATE_OVERRIDE_ROUTE_COUNT", inventory.exactCount);
  print(
    "EXACT_CANDIDATE_ROUTE_CREATE_REQUIRED",
    inventory.exactCount === 0 ? "YES" : "NO",
  );
  return { inventory, versionId };
}

export async function createExactRouteOverride({
  config,
  environment = process.env,
  fetchFn = fetch,
}) {
  const state = readState(environment);
  let inventory = await readRoutes(config, state.zoneId, fetchFn);
  if (!sameRouteSet(inventory.wildcards, state.wildcards))
    throw failure("WILDCARD_ROUTE_CHANGED_BEFORE_CREATE");
  if (inventory.exactWrong || inventory.exactCount > 1)
    throw failure("EXACT_ROUTE_DUPLICATE_OR_MISMATCH");
  if (inventory.exactCount === 1) {
    printRouteEvidence(inventory, true);
    print("EXACT_CANDIDATE_ROUTE_CREATED", "NO");
    return inventory;
  }
  const url = zoneEndpoint(config, state.zoneId, "/workers/routes");
  let create = await request({
    config,
    url,
    method: "POST",
    body: {
      pattern: exactRouteOverrideExpectation.routePattern,
      script: exactRouteOverrideExpectation.routerService,
    },
    fetchFn,
  });
  inventory = await readRoutes(config, state.zoneId, fetchFn);
  if (
    inventory.exactCount === 0 &&
    (create.httpStatus === 0 || create.httpStatus >= 500 || !create.parsed)
  ) {
    create = await request({
      config,
      url,
      method: "POST",
      body: {
        pattern: exactRouteOverrideExpectation.routePattern,
        script: exactRouteOverrideExpectation.routerService,
      },
      fetchFn,
    });
    inventory = await readRoutes(config, state.zoneId, fetchFn);
  }
  if (!create.success && inventory.exactCount !== 1)
    throw failure("EXACT_ROUTE_CREATE_UNACKNOWLEDGED");
  if (
    inventory.exactWrong ||
    inventory.exactCount !== 1 ||
    !inventory.exactRoute
  )
    throw failure("EXACT_ROUTE_CREATE_RECOVERY_FAILED");
  if (!sameRouteSet(inventory.wildcards, state.wildcards))
    throw failure("WILDCARD_ROUTE_CHANGED_DURING_CREATE");
  writeState(
    { ...state, created: true, createdRouteId: inventory.exactRoute.id },
    environment,
  );
  printRouteEvidence(inventory, true);
  print("EXACT_CANDIDATE_ROUTE_CREATED", "YES");
  return inventory;
}

export async function verifyExactRouteOverride({
  config,
  environment = process.env,
  fetchFn = fetch,
}) {
  const state = readState(environment);
  const inventory = await readRoutes(config, state.zoneId, fetchFn);
  const unchanged = sameRouteSet(inventory.wildcards, state.wildcards);
  printRouteEvidence(inventory, unchanged);
  if (
    !unchanged ||
    inventory.wildcards.length === 0 ||
    inventory.exactWrong ||
    inventory.exactCount !== 1 ||
    !inventory.candidateWins ||
    inventory.matching.length < 2
  )
    throw failure("EXACT_ROUTE_POSTCREATE_VERIFICATION_FAILED");
  return inventory;
}

export async function rollbackExactRouteOverride({
  config,
  environment = process.env,
  fetchFn = fetch,
}) {
  const state = readState(environment);
  if (state.created !== true || !opaqueIdentifier(state.createdRouteId)) {
    print("EXACT_CANDIDATE_ROUTE_ROLLBACK", "NOT_REQUIRED");
    return;
  }
  const inventory = await readRoutes(config, state.zoneId, fetchFn);
  if (!sameRouteSet(inventory.wildcards, state.wildcards))
    throw failure("ROLLBACK_WILDCARD_CHANGED");
  if (
    inventory.exactCount !== 1 ||
    !inventory.exactRoute ||
    inventory.exactRoute.id !== state.createdRouteId
  )
    throw failure("ROLLBACK_EXACT_ROUTE_OWNERSHIP_UNPROVEN");
  const response = await request({
    config,
    url: zoneEndpoint(
      config,
      state.zoneId,
      `/workers/routes/${encodeURIComponent(state.createdRouteId)}`,
    ),
    method: "DELETE",
    fetchFn,
  });
  if (!response.success) throw failure("ROLLBACK_EXACT_ROUTE_DELETE_FAILED");
  const after = await readRoutes(config, state.zoneId, fetchFn);
  if (after.exactCount !== 0 || !sameRouteSet(after.wildcards, state.wildcards))
    throw failure("ROLLBACK_EXACT_ROUTE_CONFIRMATION_FAILED");
  print("EXACT_CANDIDATE_ROUTE_ROLLBACK", "PASS");
}

async function main() {
  const mode = process.argv[2];
  const config = exactRouteOverrideConfig();
  if (mode === "preflight") return preflightExactRouteOverride({ config });
  if (mode === "create") return createExactRouteOverride({ config });
  if (mode === "verify") return verifyExactRouteOverride({ config });
  if (mode === "rollback") return rollbackExactRouteOverride({ config });
  throw failure("INVALID_MODE");
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    print("EXACT_CANDIDATE_ROUTE_OVERRIDE_FAILURE", "FAIL");
    process.exitCode = 1;
  }
}
