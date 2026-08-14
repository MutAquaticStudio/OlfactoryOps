import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

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
const pagesDeploymentsPerPage = 100;
const maximumPagesDeploymentsPages = 100;
const pagesFallbackPerPage = 20;
const wranglerTimeoutMilliseconds = 20_000;
const executeFile = promisify(execFile);

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

async function readControlPlaneEnvelope(response) {
  if (!response.ok) throw safeFailure("CONTROL_PLANE_HTTP_FAILURE");
  const body = await response.json().catch(() => null);
  if (!body || body.success !== true)
    throw safeFailure("CONTROL_PLANE_API_FAILURE");
  return body;
}

async function readJson(response) {
  return (await readControlPlaneEnvelope(response)).result;
}

class PagesInventoryFailure extends Error {
  constructor(failureClass, evidence) {
    super(failureClass);
    this.failureClass = failureClass;
    this.evidence = evidence;
  }
}

function pagesDeploymentsHttpClass(response) {
  if (!response || !Number.isInteger(response.status)) return "NETWORK";
  if (response.status >= 200 && response.status < 300) return "2XX";
  if (response.status >= 400 && response.status < 500) return "4XX";
  if (response.status >= 500 && response.status < 600) return "5XX";
  return "NETWORK";
}

function pagesInventoryEvidence({
  httpClass = "NETWORK",
  httpStatus = 0,
  cfErrorCode = "NONE",
  successFlag = "unavailable",
  resultArray = false,
  resultInfoPresent = false,
} = {}) {
  return {
    httpClass,
    httpStatus,
    cfErrorCode,
    successFlag,
    resultArray,
    resultInfoPresent,
  };
}

function pagesInventoryFailure(failureClass, evidence) {
  return new PagesInventoryFailure(failureClass, evidence);
}

function emitPagesInventoryEvidence(emitLine, evidence, failureClass) {
  emit(emitLine, "PAGES_DEPLOYMENTS_HTTP_CLASS", evidence.httpClass);
  emit(emitLine, "PAGES_DEPLOYMENTS_HTTP_STATUS", evidence.httpStatus);
  emit(emitLine, "PAGES_DEPLOYMENTS_CF_ERROR_CODE", evidence.cfErrorCode);
  emit(emitLine, "PAGES_DEPLOYMENTS_SUCCESS_FLAG", evidence.successFlag);
  emit(emitLine, "PAGES_DEPLOYMENTS_RESULT_ARRAY", evidence.resultArray);
  emit(
    emitLine,
    "PAGES_DEPLOYMENTS_RESULT_INFO_PRESENT",
    evidence.resultInfoPresent,
  );
  emit(emitLine, "PAGES_DEPLOYMENTS_FAILURE_CLASS", failureClass);
}

function pagesProjectEndpoint(config, deploymentId) {
  const project = encodeURIComponent(config.pagesProject);
  const deployment =
    typeof deploymentId === "string"
      ? `/deployments/${encodeURIComponent(deploymentId)}`
      : "";
  return new URL(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/pages/projects/${project}${deployment}`,
  );
}

function pagesDeploymentsEndpoint(config) {
  return new URL(`${pagesProjectEndpoint(config)}/deployments`);
}

function safeHttpStatus(response) {
  return response && Number.isInteger(response.status) ? response.status : 0;
}

function safeCloudflareErrorCode(envelope) {
  if (!Array.isArray(envelope?.errors)) return "NONE";
  const code = envelope.errors.find((entry) =>
    Number.isInteger(entry?.code),
  )?.code;
  return Number.isInteger(code) ? code : "NONE";
}

async function readPagesEndpoint({ config, endpoint, fetchFn }) {
  let response;
  try {
    response = await fetchFn(
      endpoint,
      noCacheOptions(authorizationHeaders(config)),
    );
  } catch {
    return {
      httpStatus: 0,
      httpClass: "NETWORK",
      cfErrorCode: "NONE",
      successFlag: "unavailable",
      resultArray: false,
      resultInfoPresent: false,
      envelope: undefined,
    };
  }

  const httpStatus = safeHttpStatus(response);
  const httpClass = pagesDeploymentsHttpClass(response);
  let envelope;
  try {
    envelope = await response.json();
  } catch {
    envelope = undefined;
  }
  const successFlag =
    typeof envelope?.success === "boolean" ? envelope.success : "unavailable";
  const resultArray = Array.isArray(envelope?.result);
  const resultInfoPresent =
    typeof envelope === "object" &&
    envelope !== null &&
    Object.hasOwn(envelope, "result_info") &&
    envelope.result_info !== undefined;
  return {
    httpStatus,
    httpClass,
    cfErrorCode: safeCloudflareErrorCode(envelope),
    successFlag,
    resultArray,
    resultInfoPresent,
    envelope,
  };
}

function endpointSucceeded(result, expectedResult = "object") {
  if (result.httpStatus !== 200 || result.successFlag !== true) return false;
  if (expectedResult === "array") return result.resultArray;
  return Boolean(
    result.envelope?.result &&
      typeof result.envelope.result === "object" &&
      !Array.isArray(result.envelope.result),
  );
}

function evidenceFromPagesResult(result) {
  return pagesInventoryEvidence({
    httpClass: result.httpClass,
    httpStatus: result.httpStatus,
    cfErrorCode: result.cfErrorCode,
    successFlag: result.successFlag,
    resultArray: result.resultArray,
    resultInfoPresent: result.resultInfoPresent,
  });
}

function emitPagesLadderStatus(emitLine, name, result) {
  emit(emitLine, name, result.httpStatus);
}

function isAuthorizationStatus(status) {
  return status === 401 || status === 403;
}

export async function inspectPagesRequestLadder({
  config,
  fetchFn = fetch,
  emitLine = console.log,
}) {
  const project = await readPagesEndpoint({
    config,
    endpoint: pagesProjectEndpoint(config),
    fetchFn,
  });
  emitPagesLadderStatus(emitLine, "PAGES_PROJECT_HTTP_STATUS", project);
  emit(
    emitLine,
    "PAGES_PROJECT_ACCESS",
    endpointSucceeded(project) ? "PASS" : "FAIL",
  );
  if (!endpointSucceeded(project)) {
    const rootCause = isAuthorizationStatus(project.httpStatus)
      ? "CLOUDFLARE_PAGES_CREDENTIAL_SCOPE_FAILURE"
      : project.httpStatus === 404
        ? "CLOUDFLARE_PAGES_PROJECT_RESOURCE_MISMATCH"
        : undefined;
    if (rootCause) emit(emitLine, "ROOT_CAUSE", rootCause);
    return {
      project,
      restUsable: false,
      stop: Boolean(rootCause),
      rootCause,
      evidence: evidenceFromPagesResult(project),
    };
  }

  const bare = await readPagesEndpoint({
    config,
    endpoint: pagesDeploymentsEndpoint(config),
    fetchFn,
  });
  emitPagesLadderStatus(emitLine, "PAGES_DEPLOYMENTS_BARE_HTTP_STATUS", bare);
  if (!endpointSucceeded(bare, "array")) {
    const rootCause = isAuthorizationStatus(bare.httpStatus)
      ? "CLOUDFLARE_PAGES_DEPLOYMENT_LIST_PERMISSION_FAILURE"
      : undefined;
    if (rootCause) emit(emitLine, "ROOT_CAUSE", rootCause);
    return {
      project,
      bare,
      restUsable: false,
      stop: Boolean(rootCause),
      rootCause,
      evidence: evidenceFromPagesResult(bare),
    };
  }

  const environmentEndpoint = pagesDeploymentsEndpoint(config);
  environmentEndpoint.searchParams.set("env", "preview");
  const preview = await readPagesEndpoint({
    config,
    endpoint: environmentEndpoint,
    fetchFn,
  });
  emitPagesLadderStatus(emitLine, "PAGES_DEPLOYMENTS_ENV_HTTP_STATUS", preview);
  if (!endpointSucceeded(preview, "array"))
    return {
      project,
      bare,
      preview,
      restUsable: false,
      stop: false,
      evidence: evidenceFromPagesResult(preview),
    };

  const page20Endpoint = pagesDeploymentsEndpoint(config);
  page20Endpoint.searchParams.set("env", "preview");
  page20Endpoint.searchParams.set("page", "1");
  page20Endpoint.searchParams.set("per_page", String(pagesFallbackPerPage));
  const page20 = await readPagesEndpoint({
    config,
    endpoint: page20Endpoint,
    fetchFn,
  });
  emitPagesLadderStatus(
    emitLine,
    "PAGES_DEPLOYMENTS_PAGE20_HTTP_STATUS",
    page20,
  );
  if (!endpointSucceeded(page20, "array"))
    return {
      project,
      bare,
      preview,
      page20,
      restUsable: false,
      stop: false,
      evidence: evidenceFromPagesResult(page20),
    };

  const page100Endpoint = pagesDeploymentsEndpoint(config);
  page100Endpoint.searchParams.set("env", "preview");
  page100Endpoint.searchParams.set("page", "1");
  page100Endpoint.searchParams.set("per_page", String(pagesDeploymentsPerPage));
  const page100 = await readPagesEndpoint({
    config,
    endpoint: page100Endpoint,
    fetchFn,
  });
  emitPagesLadderStatus(
    emitLine,
    "PAGES_DEPLOYMENTS_PAGE100_HTTP_STATUS",
    page100,
  );

  const perPage100Rejected =
    page100.httpStatus >= 400 && page100.httpStatus < 500;
  const perPage = perPage100Rejected
    ? pagesFallbackPerPage
    : endpointSucceeded(page100, "array")
      ? pagesDeploymentsPerPage
      : undefined;
  const rootCause = perPage100Rejected
    ? "PAGES_DEPLOYMENTS_PER_PAGE_100_REJECTED"
    : undefined;
  if (rootCause) {
    emit(emitLine, "ROOT_CAUSE", rootCause);
    emit(emitLine, "PAGES_DEPLOYMENTS_PER_PAGE", pagesFallbackPerPage);
  }
  return {
    project,
    bare,
    preview,
    page20,
    page100,
    restUsable: perPage !== undefined,
    stop: false,
    perPage,
    rootCause,
    evidence: evidenceFromPagesResult(page100),
  };
}

function classifyWranglerFailure(...values) {
  const text = values.filter((value) => typeof value === "string").join("\n");
  if (/\b(?:401|403)\b|authori[sz]|permission|authentication/i.test(text))
    return "AUTHORIZATION";
  if (/project[^\n]*not[ -]?found|not[ -]?found[^\n]*project/i.test(text))
    return "PROJECT_NOT_FOUND";
  if (
    /invalid argument|unknown option|missing required|requires an argument/i.test(
      text,
    )
  )
    return "INVALID_ARGUMENT";
  return "OTHER";
}

function localWranglerBinary() {
  return join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
}

async function runLocalWranglerJson({ args, config, environment }) {
  const scratchDirectory = mkdtempSync(join(tmpdir(), "oo-pages-inventory-"));
  try {
    const result = await executeFile(
      process.execPath,
      [localWranglerBinary(), ...args],
      {
        cwd: scratchDirectory,
        env: {
          ...environment,
          CLOUDFLARE_ACCOUNT_ID: config.accountId,
          CLOUDFLARE_API_TOKEN: config.apiToken,
          CI: "true",
          HOME: scratchDirectory,
          XDG_CONFIG_HOME: scratchDirectory,
          USERPROFILE: scratchDirectory,
          NO_COLOR: "1",
          WRANGLER_LOG: "log",
          WRANGLER_WRITE_LOGS: "false",
          WRANGLER_SEND_METRICS: "false",
          WRANGLER_SEND_ERROR_REPORTS: "false",
        },
        timeout: wranglerTimeoutMilliseconds,
        maxBuffer: 64 * 1024,
        windowsHide: true,
        shell: false,
      },
    );
    try {
      const value = JSON.parse(result.stdout);
      return Array.isArray(value)
        ? { ok: true, value }
        : { ok: false, failureClass: "OTHER" };
    } catch {
      return { ok: false, failureClass: "OTHER" };
    }
  } catch (error) {
    return {
      ok: false,
      failureClass: classifyWranglerFailure(error?.stdout, error?.stderr),
    };
  } finally {
    rmSync(scratchDirectory, { recursive: true, force: true });
  }
}

function wranglerProjectVisible(projects, project) {
  return projects.some((candidate) => candidate?.["Project Name"] === project);
}

function wranglerCandidateDeployment(record, releaseSha) {
  return (
    record?.Environment === "Preview" &&
    record?.Branch === edgePagesBranch &&
    record?.Source === releaseSha.slice(0, 7) &&
    typeof record?.Id === "string" &&
    record.Id.length > 0
  );
}

export async function runWranglerPagesInventory({
  config,
  environment = process.env,
  emitLine = console.log,
  runCommand = runLocalWranglerJson,
}) {
  const project = await runCommand({
    args: ["pages", "project", "list", "--json"],
    config,
    environment,
  });
  if (!project.ok) {
    emit(emitLine, "WRANGLER_PAGES_PROJECT_VISIBLE", "FAIL");
    emit(emitLine, "WRANGLER_PAGES_DEPLOYMENT_LIST", "FAIL");
    emit(emitLine, "WRANGLER_PAGES_DEPLOYMENT_COUNT", "UNAVAILABLE");
    emit(emitLine, "WRANGLER_PAGES_FAILURE_CLASS", project.failureClass);
    return { available: false, failureClass: project.failureClass };
  }
  if (!wranglerProjectVisible(project.value, config.pagesProject)) {
    emit(emitLine, "WRANGLER_PAGES_PROJECT_VISIBLE", "FAIL");
    emit(emitLine, "WRANGLER_PAGES_DEPLOYMENT_LIST", "FAIL");
    emit(emitLine, "WRANGLER_PAGES_DEPLOYMENT_COUNT", "UNAVAILABLE");
    emit(emitLine, "WRANGLER_PAGES_FAILURE_CLASS", "PROJECT_NOT_FOUND");
    return { available: false, failureClass: "PROJECT_NOT_FOUND" };
  }

  const deployment = await runCommand({
    args: [
      "pages",
      "deployment",
      "list",
      "--project-name",
      config.pagesProject,
      "--environment",
      "preview",
      "--json",
    ],
    config,
    environment,
  });
  if (!deployment.ok) {
    emit(emitLine, "WRANGLER_PAGES_PROJECT_VISIBLE", "PASS");
    emit(emitLine, "WRANGLER_PAGES_DEPLOYMENT_LIST", "FAIL");
    emit(emitLine, "WRANGLER_PAGES_DEPLOYMENT_COUNT", "UNAVAILABLE");
    emit(emitLine, "WRANGLER_PAGES_FAILURE_CLASS", deployment.failureClass);
    return { available: false, failureClass: deployment.failureClass };
  }

  emit(emitLine, "WRANGLER_PAGES_PROJECT_VISIBLE", "PASS");
  emit(emitLine, "WRANGLER_PAGES_DEPLOYMENT_LIST", "PASS");
  emit(emitLine, "WRANGLER_PAGES_DEPLOYMENT_COUNT", deployment.value.length);
  emit(emitLine, "WRANGLER_PAGES_FAILURE_CLASS", "NONE");
  return {
    available: true,
    deployments: deployment.value,
    candidates: deployment.value.filter((record) =>
      wranglerCandidateDeployment(record, config.releaseSha),
    ),
  };
}

async function detailsForWranglerCandidates({ config, candidates, fetchFn }) {
  const uniqueIds = new Set();
  const deployments = [];
  for (const candidate of candidates) {
    if (uniqueIds.has(candidate.Id))
      throw safeFailure("WRANGLER_PAGES_DEPLOYMENT_DUPLICATE");
    uniqueIds.add(candidate.Id);
    const detail = await readPagesEndpoint({
      config,
      endpoint: pagesProjectEndpoint(config, candidate.Id),
      fetchFn,
    });
    if (!endpointSucceeded(detail))
      throw safeFailure("WRANGLER_PAGES_DEPLOYMENT_DETAIL_FAILURE");
    if (detail.envelope.result.id !== candidate.Id)
      throw safeFailure("WRANGLER_PAGES_DEPLOYMENT_DETAIL_MISMATCH");
    deployments.push(detail.envelope.result);
  }
  return deployments;
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

function exactRc9PagesDeployment(deployment, releaseSha) {
  return (
    deployment?.environment === "preview" &&
    deployment?.latest_stage?.status === "success" &&
    deployment?.is_skipped !== true &&
    deployment?.deployment_trigger?.metadata?.branch === edgePagesBranch &&
    deployment?.deployment_trigger?.metadata?.commit_hash === releaseSha
  );
}

function createdOn(deployment) {
  const value = deployment?.created_on;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  )
    return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? { value, timestamp } : undefined;
}

function candidateImmutableOrigin(deployment, project) {
  try {
    return immutablePagesOrigin(deployment?.url, project);
  } catch {
    return undefined;
  }
}

function optionalPaginationInteger(resultInfo, name, minimum) {
  if (!Object.hasOwn(resultInfo, name) || resultInfo[name] === undefined)
    return undefined;
  const value = resultInfo[name];
  if (!Number.isInteger(value) || value < minimum)
    throw safeFailure("PAGES_PAGINATION_INVALID");
  return value;
}

function validatedPaginationInfo(resultInfo, requestedPage, requestedPerPage) {
  if (resultInfo === undefined) return {};
  if (
    typeof resultInfo !== "object" ||
    resultInfo === null ||
    Array.isArray(resultInfo)
  )
    throw safeFailure("PAGES_PAGINATION_INVALID");

  const page = optionalPaginationInteger(resultInfo, "page", 1);
  const perPage = optionalPaginationInteger(resultInfo, "per_page", 1);
  const totalPages = optionalPaginationInteger(resultInfo, "total_pages", 0);
  optionalPaginationInteger(resultInfo, "count", 0);
  optionalPaginationInteger(resultInfo, "total_count", 0);
  if (page !== undefined && page !== requestedPage)
    throw safeFailure("PAGES_PAGINATION_PAGE_MISMATCH");
  if (perPage !== undefined && perPage !== requestedPerPage)
    throw safeFailure("PAGES_PAGINATION_PER_PAGE_MISMATCH");
  return { page, perPage, totalPages };
}

async function pagesDeploymentPage(config, page, perPage, fetchFn) {
  const endpoint = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/pages/projects/${config.pagesProject}/deployments`,
  );
  endpoint.searchParams.set("env", "preview");
  endpoint.searchParams.set("page", String(page));
  endpoint.searchParams.set("per_page", String(perPage));
  let response;
  try {
    response = await fetchFn(
      endpoint,
      noCacheOptions(authorizationHeaders(config)),
    );
  } catch {
    throw pagesInventoryFailure("NETWORK", pagesInventoryEvidence());
  }

  const httpStatus = safeHttpStatus(response);
  const httpClass = pagesDeploymentsHttpClass(response);
  let envelope;
  try {
    envelope = await response.json();
  } catch {
    throw pagesInventoryFailure(
      "API_ENVELOPE",
      pagesInventoryEvidence({ httpClass, httpStatus }),
    );
  }

  const successFlag =
    typeof envelope?.success === "boolean" ? envelope.success : "unavailable";
  const resultArray = Array.isArray(envelope?.result);
  const resultInfoPresent =
    typeof envelope === "object" &&
    envelope !== null &&
    Object.hasOwn(envelope, "result_info") &&
    envelope.result_info !== undefined;
  const evidence = pagesInventoryEvidence({
    httpClass,
    httpStatus,
    cfErrorCode: safeCloudflareErrorCode(envelope),
    successFlag,
    resultArray,
    resultInfoPresent,
  });
  if (httpClass !== "2XX") throw pagesInventoryFailure("HTTP", evidence);
  if (!envelope || typeof envelope !== "object" || envelope.success !== true)
    throw pagesInventoryFailure("API_ENVELOPE", evidence);
  if (!resultArray) throw pagesInventoryFailure("RESULT_SHAPE", evidence);

  let pagination;
  try {
    pagination = validatedPaginationInfo(
      resultInfoPresent ? envelope.result_info : undefined,
      page,
      perPage,
    );
  } catch {
    throw pagesInventoryFailure("PAGINATION_METADATA", evidence);
  }
  return { deployments: envelope.result, ...pagination, evidence };
}

async function allPagesDeployments(
  config,
  fetchFn,
  perPage = pagesDeploymentsPerPage,
) {
  const deployments = [];
  const deploymentIds = new Set();
  let knownTotalPages;
  let lastEvidence = pagesInventoryEvidence();
  for (let page = 1; page <= maximumPagesDeploymentsPages; page += 1) {
    const result = await pagesDeploymentPage(config, page, perPage, fetchFn);
    lastEvidence = result.evidence;
    if (result.totalPages !== undefined) {
      if (
        knownTotalPages !== undefined &&
        result.totalPages !== knownTotalPages
      )
        throw pagesInventoryFailure("PAGINATION_METADATA", lastEvidence);
      knownTotalPages = result.totalPages;
    }
    for (const deployment of result.deployments) {
      if (typeof deployment?.id !== "string" || deployment.id.length === 0)
        throw pagesInventoryFailure("RESULT_SHAPE", lastEvidence);
      if (deploymentIds.has(deployment.id))
        throw pagesInventoryFailure("DUPLICATE_DEPLOYMENT", lastEvidence);
      deploymentIds.add(deployment.id);
      deployments.push(deployment);
    }
    if (result.deployments.length === 0) return { deployments, lastEvidence };
    if (result.totalPages !== undefined && page >= result.totalPages)
      return { deployments, lastEvidence };
    if (result.deployments.length < perPage)
      return { deployments, lastEvidence };
  }
  throw pagesInventoryFailure("PAGINATION_LIMIT", lastEvidence);
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

async function probeReleaseManifest(origin, fetchFn = fetch) {
  const nonce = randomBytes(16).toString("hex");
  let response;
  try {
    response = await fetchFn(
      `${origin}/release.json?oo_candidate_edge_manifest=${nonce}`,
      noCacheOptions(),
    );
  } catch {
    return false;
  }
  if (response.status !== 200) return false;
  if (
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") ?? "",
    )
  )
    return false;
  let manifest;
  try {
    manifest = await response.json();
  } catch {
    return false;
  }
  return (
    manifest?.fullGitSha === edgeReleaseSha && manifest?.artifact === "pages"
  );
}

function exactRc9Candidates(deployments, config) {
  return deployments
    .filter((deployment) =>
      exactRc9PagesDeployment(deployment, config.releaseSha),
    )
    .map((deployment) => {
      const created = createdOn(deployment);
      return {
        deployment,
        createdAt: created?.value,
        createdAtTimestamp: created?.timestamp,
        id: deployment.id,
        origin: candidateImmutableOrigin(deployment, config.pagesProject),
      };
    })
    .sort(
      (left, right) =>
        (right.createdAtTimestamp ?? -Infinity) -
          (left.createdAtTimestamp ?? -Infinity) ||
        left.id.localeCompare(right.id),
    );
}

export async function selectHealthyImmutablePages({
  deployments,
  config,
  environment = process.env,
  fetchFn = fetch,
  emitLine = console.log,
  persistOrigin = persistPagesOrigin,
  inventoryComplete = true,
}) {
  const matching = exactRc9Candidates(deployments, config);

  emit(emitLine, "PAGES_RC9_MATCH_COUNT", matching.length);
  if (matching.length === 0) {
    if (!inventoryComplete) {
      emit(emitLine, "PAGES_INVENTORY_COMPLETENESS", "UNPROVEN");
      emit(emitLine, "PAGES_REDEPLOY_REQUIRED", "NO");
      throw safeFailure("WRANGLER_PAGES_INVENTORY_INCOMPLETE");
    }
    emit(emitLine, "PAGES_RC9_DEPLOYMENT_EXISTS", "MISSING");
    emit(emitLine, "PAGES_RC9_IMMUTABLE_DEPLOYMENT", "MISSING_OR_UNHEALTHY");
    emit(emitLine, "PAGES_REDEPLOY_REQUIRED", "YES");
    throw safeFailure("PAGES_RC9_MATCHES_MISSING");
  }

  emit(emitLine, "PAGES_RC9_DEPLOYMENT_EXISTS", "PASS");
  emit(emitLine, "PAGES_RC9_DEPLOYMENT_ENVIRONMENT", "preview");
  emit(emitLine, "PAGES_RC9_BRANCH_MATCH", "PASS");
  emit(emitLine, "PAGES_RC9_COMMIT_MATCH", "PASS");

  const healthy = [];
  for (const [index, candidate] of matching.entries()) {
    emit(emitLine, "PAGES_RC9_CANDIDATE_INDEX", index + 1);
    emit(
      emitLine,
      "PAGES_RC9_CANDIDATE_CREATED_AT",
      candidate.createdAt ?? "INVALID",
    );
    emit(
      emitLine,
      "PAGES_RC9_CANDIDATE_URL_SHAPE_VALID",
      Boolean(candidate.origin),
    );
    if (!candidate.createdAt || !candidate.origin) continue;
    const [manifestMatches, results] = await Promise.all([
      probeReleaseManifest(candidate.origin, fetchFn),
      Promise.all(
        edgeBrowserPaths.map((path) => probe(candidate.origin, path, fetchFn)),
      ),
    ]);
    if (
      manifestMatches &&
      results.every((result) => result.status === "200" && result.html)
    )
      healthy.push({ ...candidate, results });
  }

  if (healthy.length === 0) {
    if (!inventoryComplete) {
      emit(emitLine, "PAGES_INVENTORY_COMPLETENESS", "UNPROVEN");
      emit(emitLine, "PAGES_REDEPLOY_REQUIRED", "NO");
      throw safeFailure("WRANGLER_PAGES_INVENTORY_INCOMPLETE");
    }
    emit(emitLine, "PAGES_RC9_IMMUTABLE_DEPLOYMENT", "MISSING_OR_UNHEALTHY");
    emit(emitLine, "PAGES_REDEPLOY_REQUIRED", "YES");
    throw safeFailure("PAGES_RC9_MATCHES_UNHEALTHY");
  }

  const selected = healthy[0];
  const origin = selected.origin;
  const results = selected.results;
  emit(emitLine, "PAGES_RC9_DEPLOYMENT_URL_PRESENT", "PASS");
  emit(emitLine, "PAGES_RC9_ARTIFACT_RELEASE_IDENTITY", "PASS");
  for (const result of results) {
    emit(emitLine, "PAGES_RC9_IMMUTABLE_PATH", result.path);
    emit(emitLine, "PAGES_RC9_IMMUTABLE_HTTP_STATUS", result.status);
  }
  emit(emitLine, "PAGES_RC9_SELECTED_IMMUTABLE_DEPLOYMENT", "PASS");
  emit(
    emitLine,
    "PAGES_RC9_MULTIPLE_HEALTHY_DEPLOYMENTS",
    healthy.length > 1 ? "YES" : "NO",
  );
  emit(emitLine, "PAGES_REDEPLOY_REQUIRED", "NO");

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
  return { origin, results, branchAliasResults, matching, healthy };
}

export async function inventoryImmutablePages({
  config,
  environment = process.env,
  fetchFn = fetch,
  emitLine = console.log,
  persistOrigin = persistPagesOrigin,
  perPage = pagesDeploymentsPerPage,
  emitInventoryEvidence = true,
}) {
  let inventory;
  try {
    inventory = await allPagesDeployments(config, fetchFn, perPage);
  } catch (error) {
    const failure =
      error instanceof PagesInventoryFailure
        ? error
        : pagesInventoryFailure("NETWORK", pagesInventoryEvidence());
    if (emitInventoryEvidence) {
      emitPagesInventoryEvidence(
        emitLine,
        failure.evidence,
        failure.failureClass,
      );
      emit(emitLine, "PAGES_DEPLOYMENTS_API", "FAIL");
    }
    throw safeFailure("PAGES_DEPLOYMENTS_API_FAILURE");
  }
  const { deployments } = inventory;
  if (emitInventoryEvidence) {
    emitPagesInventoryEvidence(emitLine, inventory.lastEvidence, "NONE");
    emit(emitLine, "PAGES_DEPLOYMENTS_API", "PASS");
  }
  return selectHealthyImmutablePages({
    deployments,
    config,
    environment,
    fetchFn,
    emitLine,
    persistOrigin,
  });
}

function ladderFailureClass(ladder) {
  if (ladder.evidence.httpClass === "NETWORK") return "NETWORK";
  if (ladder.evidence.httpClass === "2XX" && ladder.evidence.successFlag)
    return "NONE";
  return ladder.evidence.httpClass === "2XX" ? "API_ENVELOPE" : "HTTP";
}

function emitLadderEvidence(emitLine, ladder) {
  emitPagesInventoryEvidence(
    emitLine,
    ladder.evidence,
    ladderFailureClass(ladder),
  );
}

function inventoryUnavailable(rootCause) {
  const classification = rootCause ?? "PAGES_INVENTORY_CAPABILITY_UNAVAILABLE";
  throw safeFailure(classification);
}

export async function reconcilePagesInventory({
  config,
  environment = process.env,
  fetchFn = fetch,
  emitLine = console.log,
  persistOrigin = persistPagesOrigin,
  runWrangler = runWranglerPagesInventory,
}) {
  const ladder = await inspectPagesRequestLadder({
    config,
    fetchFn,
    emitLine,
  });
  emitLadderEvidence(emitLine, ladder);
  if (ladder.stop) {
    emit(emitLine, "PAGES_DEPLOYMENTS_API", "FAIL");
    inventoryUnavailable(ladder.rootCause);
  }

  const nativeInventory = await runWrangler({
    config,
    environment,
    emitLine,
  });

  if (ladder.rootCause === "PAGES_DEPLOYMENTS_PER_PAGE_100_REJECTED") {
    const selected = await inventoryImmutablePages({
      config,
      environment,
      fetchFn,
      emitLine,
      persistOrigin,
      perPage: pagesFallbackPerPage,
      emitInventoryEvidence: false,
    });
    emit(emitLine, "PAGES_DEPLOYMENTS_API", "PASS");
    return selected;
  }

  if (ladder.restUsable) {
    emit(
      emitLine,
      "ROOT_CAUSE",
      nativeInventory.available
        ? "NONE"
        : "WRANGLER_PAGES_NATIVE_INVENTORY_UNAVAILABLE",
    );
    const selected = await inventoryImmutablePages({
      config,
      environment,
      fetchFn,
      emitLine,
      persistOrigin,
      perPage: ladder.perPage,
      emitInventoryEvidence: false,
    });
    emit(emitLine, "PAGES_DEPLOYMENTS_API", "PASS");
    return selected;
  }

  if (nativeInventory.available) {
    emit(emitLine, "ROOT_CAUSE", "CUSTOM_REST_INVENTORY_REQUEST_DEFECT");
    emit(
      emitLine,
      "WRANGLER_PAGES_RC9_SHORT_SHA_CANDIDATE_COUNT",
      nativeInventory.candidates.length,
    );
    if (nativeInventory.candidates.length === 0) {
      emit(emitLine, "PAGES_INVENTORY_COMPLETENESS", "UNPROVEN");
      emit(emitLine, "PAGES_REDEPLOY_REQUIRED", "NO");
      emit(emitLine, "PAGES_DEPLOYMENTS_API", "FAIL");
      inventoryUnavailable("WRANGLER_PAGES_INVENTORY_INCOMPLETE");
    }

    let deployments;
    try {
      deployments = await detailsForWranglerCandidates({
        config,
        candidates: nativeInventory.candidates,
        fetchFn,
      });
    } catch {
      emit(emitLine, "PAGES_INVENTORY_COMPLETENESS", "UNPROVEN");
      emit(emitLine, "PAGES_REDEPLOY_REQUIRED", "NO");
      emit(emitLine, "PAGES_DEPLOYMENTS_API", "FAIL");
      inventoryUnavailable("WRANGLER_PAGES_DEPLOYMENT_DETAIL_FAILURE");
    }
    const selected = await selectHealthyImmutablePages({
      deployments,
      config,
      environment,
      fetchFn,
      emitLine,
      persistOrigin,
      inventoryComplete: false,
    });
    emit(emitLine, "PAGES_DEPLOYMENTS_API", "PASS");
    return selected;
  }

  emit(emitLine, "PAGES_DEPLOYMENTS_API", "FAIL");
  inventoryUnavailable();
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
  if (mode === "pages-inventory") return reconcilePagesInventory({ config });
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
