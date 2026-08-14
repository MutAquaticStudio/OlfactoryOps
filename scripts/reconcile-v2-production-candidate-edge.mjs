import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";

export const edgeReleaseSha = "de0734df2d2b5b2dd3a2a67ee542131235e75eb7";
export const edgeFixtureHostname =
  "rc9-release-31736285494-469ca8942a.next.labofscents.org";
export const edgePagesProject = "olfactoryops-v2-production-candidate";
export const edgePagesBranch = "production-candidate";
export const edgeRouterService =
  "olfactoryops-v2-tenant-router-production-candidate";
export const edgeWorkspaceBaseDomain = "next.labofscents.org";
export const edgeHyperdriveId = "b415b7572d9f45058ebb4ec4166b8739";
export const edgeBrowserPaths = [
  "/",
  "/login",
  "/signup",
  "/v2/login",
  "/v2/signup",
];

const expectedTenantOrigin = `https://${edgeFixtureHostname}`;

function safeFailure(classification) {
  return new Error(classification);
}

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0)
    throw safeFailure("MISSING_REQUIRED_INPUT");
  return value;
}

function exact(value, expected) {
  if (value !== expected) throw safeFailure("INVALID_IMMUTABLE_INPUT");
  return value;
}

export function edgeReconciliationConfig(environment = process.env) {
  const releaseSha = exact(
    required(environment, "CANDIDATE_EDGE_RECONCILE_RELEASE_SHA"),
    edgeReleaseSha,
  );
  const fixtureHostname = exact(
    required(environment, "CANDIDATE_EDGE_RECONCILE_FIXTURE_HOSTNAME"),
    edgeFixtureHostname,
  );
  const pagesProject = exact(
    required(environment, "CANDIDATE_EDGE_RECONCILE_PAGES_PROJECT"),
    edgePagesProject,
  );
  const hyperdriveId = required(
    environment,
    "CANDIDATE_EDGE_RECONCILE_HYPERDRIVE_ID",
  );
  if (hyperdriveId !== edgeHyperdriveId)
    throw safeFailure("INVALID_HYPERDRIVE_ID");
  return {
    accountId: required(environment, "CLOUDFLARE_ACCOUNT_ID"),
    apiToken: required(environment, "CLOUDFLARE_API_TOKEN"),
    releaseSha,
    fixtureHostname,
    pagesProject,
    hyperdriveId,
  };
}

function authorizationHeaders(config) {
  return { authorization: `Bearer ${config.apiToken}` };
}

function noCacheOptions(headers = {}) {
  return {
    method: "GET",
    redirect: "manual",
    credentials: "omit",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      ...headers,
    },
    signal: AbortSignal.timeout(20_000),
  };
}

async function readJson(response) {
  if (!response.ok) throw safeFailure("CONTROL_PLANE_HTTP_FAILURE");
  const body = await response.json().catch(() => null);
  if (!body || body.success !== true)
    throw safeFailure("CONTROL_PLANE_API_FAILURE");
  return body.result;
}

function immutablePagesOrigin(url, project) {
  try {
    const parsed = new URL(url);
    const label = parsed.hostname.split(".")[0];
    if (
      parsed.protocol === "https:" &&
      /^[a-z0-9]{8}$/.test(label) &&
      parsed.hostname === `${label}.${project}.pages.dev` &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.username &&
      !parsed.password
    )
      return parsed.origin;
  } catch {
    // The deployment response is untrusted until this exact origin shape passes.
  }
  throw safeFailure("INVALID_IMMUTABLE_PAGES_ORIGIN");
}

function expectedBranchAlias(project) {
  return `https://${edgePagesBranch}.${project}.pages.dev`;
}

function isHtml(response) {
  return /^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "");
}

async function probe(origin, path, fetchFn = fetch, extraHeaders = {}) {
  const nonce = randomBytes(16).toString("hex");
  try {
    const response = await fetchFn(
      `${origin}${path}?oo_candidate_edge_reconcile=${nonce}`,
      noCacheOptions(extraHeaders),
    );
    return {
      path,
      status: String(response.status),
      html: isHtml(response),
      routerActive:
        response.headers.get("x-olfactoryops-workspace-router") === "active",
      releaseEnvironmentProduction:
        response.headers.get("x-olfactoryops-release-environment") ===
        "production",
      releaseShaMatch:
        response.headers.get("x-olfactoryops-release-sha") === edgeReleaseSha,
    };
  } catch {
    return {
      path,
      status: "000",
      html: false,
      routerActive: false,
      releaseEnvironmentProduction: false,
      releaseShaMatch: false,
    };
  }
}

function emit(emitLine, name, value) {
  emitLine(`${name}=${value}`);
}

function sameTenantSurface(left, right) {
  return (
    left.status === right.status &&
    left.html === right.html &&
    left.routerActive === right.routerActive &&
    left.releaseEnvironmentProduction === right.releaseEnvironmentProduction &&
    left.releaseShaMatch === right.releaseShaMatch
  );
}

function persistPagesOrigin(origin, environment) {
  const githubEnvironment = environment.GITHUB_ENV;
  if (typeof githubEnvironment !== "string" || githubEnvironment.length === 0)
    throw safeFailure("MISSING_GITHUB_ENV");
  appendFileSync(githubEnvironment, `CANDIDATE_PAGES_ORIGIN=${origin}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function inventoryImmutablePages({
  config,
  environment = process.env,
  fetchFn = fetch,
  emitLine = console.log,
  persistOrigin = persistPagesOrigin,
}) {
  const endpoint = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/pages/projects/${config.pagesProject}/deployments`,
  );
  endpoint.searchParams.set("env", "preview");
  endpoint.searchParams.set("per_page", "100");
  const deployments = await readJson(
    await fetchFn(endpoint, noCacheOptions(authorizationHeaders(config))),
  );
  if (!Array.isArray(deployments))
    throw safeFailure("PAGES_DEPLOYMENTS_INVALID");
  const matching = deployments.filter(
    (deployment) =>
      deployment?.environment === "preview" &&
      deployment?.latest_stage?.status === "success" &&
      deployment?.is_skipped !== true &&
      deployment?.deployment_trigger?.metadata?.branch === edgePagesBranch &&
      deployment?.deployment_trigger?.metadata?.commit_hash ===
        config.releaseSha,
  );
  if (matching.length !== 1) throw safeFailure("PAGES_DEPLOYMENT_NOT_UNIQUE");
  const deployment = matching[0];
  const origin = immutablePagesOrigin(deployment.url, config.pagesProject);
  const branchAliasPresent = Array.isArray(deployment.aliases)
    ? deployment.aliases.includes(expectedBranchAlias(config.pagesProject))
    : false;

  emit(emitLine, "PAGES_RC9_DEPLOYMENT_EXISTS", "PASS");
  emit(emitLine, "PAGES_RC9_DEPLOYMENT_ENVIRONMENT", "preview");
  emit(emitLine, "PAGES_RC9_BRANCH_MATCH", "PASS");
  emit(emitLine, "PAGES_RC9_COMMIT_MATCH", "PASS");
  emit(emitLine, "PAGES_RC9_DEPLOYMENT_URL_PRESENT", "PASS");
  emit(
    emitLine,
    "PAGES_RC9_BRANCH_ALIAS_PRESENT",
    branchAliasPresent ? "YES" : "NO",
  );

  const results = await Promise.all(
    edgeBrowserPaths.map((path) => probe(origin, path, fetchFn)),
  );
  for (const result of results) {
    emit(emitLine, "PAGES_RC9_IMMUTABLE_PATH", result.path);
    emit(emitLine, "PAGES_RC9_IMMUTABLE_HTTP_STATUS", result.status);
  }
  if (!results.every((result) => result.status === "200" && result.html))
    throw safeFailure("PAGES_IMMUTABLE_ROUTE_HEALTH_FAILURE");

  const branchAlias = expectedBranchAlias(config.pagesProject);
  const branchAliasResults = await Promise.all(
    edgeBrowserPaths.map((path) => probe(branchAlias, path, fetchFn)),
  );
  for (const result of branchAliasResults) {
    emit(emitLine, "PAGES_RC9_BRANCH_ALIAS_PATH", result.path);
    emit(emitLine, "PAGES_RC9_BRANCH_ALIAS_HTTP_STATUS", result.status);
  }
  const branchAliasHealthy = branchAliasResults.every(
    (result) => result.status === "200" && result.html,
  );
  const branchAliasDrifted = branchAliasResults.every(
    (result) => result.status === "404",
  );
  if (!branchAliasHealthy && !branchAliasDrifted)
    throw safeFailure("PAGES_BRANCH_ALIAS_ROUTE_STATE_UNEXPECTED");
  emit(
    emitLine,
    "PAGES_RC9_BRANCH_ALIAS_ROUTING",
    branchAliasHealthy ? "HEALTHY" : "DRIFTED",
  );
  if (branchAliasDrifted)
    emit(
      emitLine,
      "ROOT_CAUSE_PAGES",
      "PAGES_BRANCH_ALIAS_CONTROL_PLANE_DRIFT",
    );

  persistOrigin(origin, environment);
  emit(emitLine, "PAGES_RC9_IMMUTABLE_DEPLOYMENT", "PASS");
  return { origin, branchAliasPresent, results, branchAliasResults };
}

async function exactCandidateDomains(config, fetchFn) {
  const endpoint = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/domains`,
  );
  endpoint.searchParams.set("hostname", config.fixtureHostname);
  const domains = await readJson(
    await fetchFn(endpoint, noCacheOptions(authorizationHeaders(config))),
  );
  if (!Array.isArray(domains)) throw safeFailure("CUSTOM_DOMAIN_LIST_INVALID");
  return domains.filter(
    (domain) => domain?.hostname === config.fixtureHostname,
  );
}

export async function preflightCandidateDomain({
  config,
  fetchFn = fetch,
  emitLine = console.log,
}) {
  const domains = await exactCandidateDomains(config, fetchFn);
  if (domains.length > 1) throw safeFailure("CUSTOM_DOMAIN_AMBIGUOUS");
  if (domains.length === 1 && domains[0]?.service !== edgeRouterService)
    throw safeFailure("CUSTOM_DOMAIN_OWNED_BY_OTHER_SERVICE");
  emit(emitLine, "CANDIDATE_CUSTOM_DOMAIN_PRECHECK", "PASS");
  emit(
    emitLine,
    "CANDIDATE_CUSTOM_DOMAIN_EXISTING_ATTACHMENT",
    domains.length === 1 ? "CANDIDATE_ROUTER" : "ABSENT",
  );
  return domains;
}

export async function verifyCandidateDomain({
  config,
  fetchFn = fetch,
  emitLine = console.log,
}) {
  const domains = await exactCandidateDomains(config, fetchFn);
  if (
    domains.length !== 1 ||
    domains[0]?.service !== edgeRouterService ||
    domains[0]?.zone_name !== "labofscents.org"
  )
    throw safeFailure("CUSTOM_DOMAIN_ATTACHMENT_MISMATCH");
  emit(emitLine, "CANDIDATE_CUSTOM_DOMAIN_ATTACHMENT", "PASS");
  return domains[0];
}

export async function verifyTenantRoutes({
  fetchFn = fetch,
  emitLine = console.log,
}) {
  const results = await Promise.all(
    edgeBrowserPaths.map((path) => probe(expectedTenantOrigin, path, fetchFn)),
  );
  for (const result of results) {
    emit(emitLine, "CANDIDATE_TENANT_PATH", result.path);
    emit(emitLine, "CANDIDATE_TENANT_HTTP_STATUS", result.status);
    emit(emitLine, "CANDIDATE_TENANT_ROUTER_ACTIVE", result.routerActive);
    emit(
      emitLine,
      "CANDIDATE_TENANT_RELEASE_SHA_MATCH",
      result.releaseShaMatch,
    );
  }
  const accepted = results.every(
    (result) =>
      result.status === "200" &&
      result.html &&
      result.routerActive &&
      result.releaseEnvironmentProduction &&
      result.releaseShaMatch,
  );
  if (!accepted) throw safeFailure("CANDIDATE_TENANT_ROUTE_ACCEPTANCE_FAILURE");

  const spoofed = await probe(expectedTenantOrigin, "/", fetchFn, {
    "x-olfactoryops-organization-id": "untrusted",
    "x-olfactoryops-tenant-id": "untrusted",
    "x-organization-id": "untrusted",
    "x-tenant-id": "untrusted",
    "x-forwarded-host": "untrusted.invalid",
  });
  const baseline = results.find((result) => result.path === "/");
  if (!baseline || !sameTenantSurface(spoofed, baseline))
    throw safeFailure("CALLER_TENANT_HEADER_ACCEPTANCE_FAILURE");
  emit(emitLine, "CANDIDATE_CALLER_TENANT_HEADERS_IGNORED", "PASS");

  const unknownHost = `missing-${randomBytes(10).toString("hex")}.${edgeWorkspaceBaseDomain}`;
  const unknown = await probe(`https://${unknownHost}`, "/", fetchFn);
  if (unknown.status !== "000" && unknown.status !== "404")
    throw safeFailure("UNKNOWN_HOST_DID_NOT_FAIL_CLOSED");
  emit(emitLine, "CANDIDATE_UNKNOWN_HOST_FAIL_CLOSED", "PASS");
  emit(emitLine, "CANDIDATE_BROWSER_ROUTES", "PASS");
  return { results, spoofed, unknown };
}

export async function captureCandidateEdgePostflight({
  config,
  fetchFn = fetch,
  emitLine = console.log,
}) {
  try {
    const domains = await exactCandidateDomains(config, fetchFn);
    const attachment =
      domains.length !== 1
        ? domains.length === 0
          ? "ABSENT"
          : "AMBIGUOUS"
        : domains[0]?.service === edgeRouterService
          ? "CANDIDATE_ROUTER"
          : "OTHER_SERVICE";
    const tenant = await probe(expectedTenantOrigin, "/", fetchFn);
    emit(
      emitLine,
      "CANDIDATE_EDGE_POSTFLIGHT_CUSTOM_DOMAIN_ATTACHMENT",
      attachment,
    );
    emit(
      emitLine,
      "CANDIDATE_EDGE_POSTFLIGHT_TENANT_ROOT_HTTP_STATUS",
      tenant.status,
    );
    emit(
      emitLine,
      "CANDIDATE_EDGE_POSTFLIGHT_TENANT_ROUTER_ACTIVE",
      tenant.routerActive,
    );
    emit(
      emitLine,
      "CANDIDATE_EDGE_POSTFLIGHT_TENANT_RELEASE_SHA_MATCH",
      tenant.releaseShaMatch,
    );
    emit(emitLine, "CANDIDATE_EDGE_POSTFLIGHT", "CAPTURED");
    return { attachment, tenant };
  } catch {
    emit(emitLine, "CANDIDATE_EDGE_POSTFLIGHT", "UNAVAILABLE");
    throw safeFailure("CANDIDATE_EDGE_POSTFLIGHT_UNAVAILABLE");
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === "tenant-verify") return verifyTenantRoutes({});
  const config = edgeReconciliationConfig();
  if (mode === "pages-inventory") return inventoryImmutablePages({ config });
  if (mode === "domain-preflight") return preflightCandidateDomain({ config });
  if (mode === "domain-verify") return verifyCandidateDomain({ config });
  if (mode === "postflight-inventory")
    return captureCandidateEdgePostflight({ config });
  throw safeFailure("INVALID_RECONCILIATION_MODE");
}

if (import.meta.main)
  main().catch(() => {
    console.log("CANDIDATE_EDGE_RECONCILIATION=FAIL");
    process.exitCode = 1;
  });
