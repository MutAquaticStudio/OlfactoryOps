import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API_BASE = "https://api.cloudflare.com/client/v4";
const EXPECTED_PROJECT = "olfactoryops-v2-production";
const EXPECTED_LIVE_DOMAIN = "labofscents.org";
const FIRST_RELEASE_POLICY = "FIRST_RELEASE_UNROUTED";
const LIVE_UPGRADE_POLICY = "EXISTING_LIVE_UPGRADE";

export class PagesProjectError extends Error {
  constructor(
    classification,
    {
      operation = "LIST_PROJECTS",
      httpStatus = "0",
      cfErrorCode = "NONE",
      listAccessEstablished = false,
      listHttpStatus = "0",
      listCfErrorCode = "NONE",
    } = {},
  ) {
    super();
    this.classification = classification;
    this.operation = operation;
    this.httpStatus = httpStatus;
    this.cfErrorCode = cfErrorCode;
    this.listAccessEstablished = listAccessEstablished;
    this.listHttpStatus = listHttpStatus;
    this.listCfErrorCode = listCfErrorCode;
  }
}

export async function resolveProductionPagesProject({
  environment = process.env,
  fetchImpl = fetch,
  emit = (line) => console.log(line),
  appendOutput = appendGitHubOutput,
} = {}) {
  const account = requiredAccount(environment);
  const credential = pagesCredential(environment);
  const baselinePolicy = requiredBaselinePolicy(environment);
  if (!credential.token) {
    throw new PagesProjectError(
      credential.dedicated
        ? "PAGES_READ_TOKEN_MISSING"
        : "PRODUCTION_PAGES_PROJECT_API_UNAVAILABLE",
    );
  }

  const request = createRequester({
    account,
    token: credential.token,
    fetchImpl,
  });
  const projectsResult = await collectPages({
    request,
    path: "/pages/projects",
    operation: "LIST_PROJECTS",
    failureClassification: "PRODUCTION_PAGES_PROJECT_API_UNAVAILABLE",
  });
  const listEvidence = {
    listAccessEstablished: true,
    listHttpStatus: projectsResult.httpStatus,
    listCfErrorCode: projectsResult.cfErrorCode,
  };

  const exactProjects = projectsResult.rows.filter(
    (project) => project?.name === EXPECTED_PROJECT,
  );
  if (exactProjects.length === 0) {
    throw new PagesProjectError(
      "PRODUCTION_PAGES_PROJECT_NOT_FOUND",
      listEvidence,
    );
  }
  if (exactProjects.length !== 1) {
    throw new PagesProjectError(
      "PRODUCTION_PAGES_PROJECT_AMBIGUOUS",
      listEvidence,
    );
  }

  const detail = await request(
    `/pages/projects/${encodeURIComponent(EXPECTED_PROJECT)}`,
    "GET_PROJECT",
    "PRODUCTION_PAGES_PROJECT_INVALID",
    listEvidence,
  );
  const projectDetail = detail.body?.result;
  const productionBranch = projectDetail?.production_branch;
  if (
    projectDetail?.name !== EXPECTED_PROJECT ||
    !validProductionBranch(productionBranch)
  ) {
    throw new PagesProjectError(
      "PRODUCTION_PAGES_PROJECT_INVALID",
      listEvidence,
    );
  }

  const domains = await collectPages({
    request,
    path: `/pages/projects/${encodeURIComponent(EXPECTED_PROJECT)}/domains`,
    operation: "LIST_PROJECT_DOMAINS",
    failureClassification: "PRODUCTION_PAGES_BASELINE_UNPROVEN",
    listEvidence,
  });
  const deployments = await collectPages({
    request,
    path: `/pages/projects/${encodeURIComponent(EXPECTED_PROJECT)}/deployments`,
    operation: "LIST_PRODUCTION_DEPLOYMENTS",
    query: { env: "production" },
    failureClassification: "PRODUCTION_PAGES_BASELINE_UNPROVEN",
    listEvidence,
  });
  const publicDomainState = verifyPagesDomainBaseline(
    domains.rows,
    baselinePolicy,
    listEvidence,
  );

  const baseline = await verifyCanonicalDeploymentBaseline({
    request,
    canonicalDeployment: projectDetail.canonical_deployment,
    deployments: deployments.rows,
    productionBranch,
    listEvidence,
  });
  emitCredentialAccess(emit, credential, {
    httpStatus: projectsResult.httpStatus,
    cfErrorCode: projectsResult.cfErrorCode,
    access: "PASS",
  });
  emit(`PRODUCTION_PAGES_PROJECT=${EXPECTED_PROJECT}`);
  emit("PRODUCTION_PAGES_PROJECT_MATCH_COUNT=ONE");
  emit("PRODUCTION_PAGES_PROJECT_PRODUCTION_BRANCH=CONFIGURED");
  emit("PRODUCTION_PAGES_PROJECT_READY=PASS");
  emit(`PRODUCTION_PAGES_BASELINE_POLICY=${baselinePolicy}`);
  emit(`PRODUCTION_PAGES_PUBLIC_DOMAIN_BASELINE=${publicDomainState}`);
  emit("PRODUCTION_PAGES_BASELINE=PASS");
  emit(`PRODUCTION_PAGES_BASELINE_TYPE=${baseline.type}`);
  emit(`PRODUCTION_PAGES_CANONICAL_DEPLOYMENT=${baseline.canonical}`);
  await appendOutput({
    project: EXPECTED_PROJECT,
    baselineType: baseline.type,
    environment,
  });
  return { project: EXPECTED_PROJECT, baselineType: baseline.type };
}

export function emitPagesProjectFailure(
  error,
  emit = (line) => console.log(line),
  environment = process.env,
) {
  const credential = pagesCredential(environment);
  const safeError =
    error instanceof PagesProjectError
      ? error
      : new PagesProjectError("PRODUCTION_PAGES_PROJECT_API_UNAVAILABLE");
  const accessDenied =
    safeError.classification === "PAGES_READ_TOKEN_ACCESS_DENIED";
  const access =
    accessDenied || safeError.classification === "PAGES_READ_TOKEN_MISSING"
      ? "FAIL"
      : safeError.listAccessEstablished
        ? "PASS"
        : "UNPROVEN";
  const evidence = accessDenied
    ? {
        operation: safeError.operation,
        httpStatus: safeError.httpStatus,
        cfErrorCode: safeError.cfErrorCode,
      }
    : {
        operation: "LIST_PROJECTS",
        httpStatus: safeError.listAccessEstablished
          ? safeError.listHttpStatus
          : safeError.httpStatus,
        cfErrorCode: safeError.listAccessEstablished
          ? safeError.listCfErrorCode
          : safeError.cfErrorCode,
      };
  emitCredentialAccess(emit, credential, { ...evidence, access });
  emit(
    `PRODUCTION_PAGES_PROJECT_RESOLUTION_FAILURE=${safeError.classification}`,
  );
}

function pagesCredential(environment) {
  const dedicated = Object.hasOwn(environment, "CLOUDFLARE_PAGES_READ_TOKEN");
  const token = dedicated
    ? environment.CLOUDFLARE_PAGES_READ_TOKEN?.trim()
    : environment.CLOUDFLARE_API_TOKEN?.trim();
  return { dedicated, token: token || "" };
}

function requiredAccount(environment) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!account) {
    throw new PagesProjectError("PRODUCTION_PAGES_PROJECT_API_UNAVAILABLE");
  }
  return account;
}

function requiredBaselinePolicy(environment) {
  const value =
    environment.PRODUCTION_PAGES_BASELINE_POLICY?.trim() ||
    FIRST_RELEASE_POLICY;
  if (value !== FIRST_RELEASE_POLICY && value !== LIVE_UPGRADE_POLICY) {
    throw new PagesProjectError("PRODUCTION_PAGES_BASELINE_UNPROVEN");
  }
  return value;
}

function verifyPagesDomainBaseline(domains, policy, listEvidence) {
  const valid =
    policy === FIRST_RELEASE_POLICY
      ? domains.length === 0
      : domains.length === 1 &&
        domains[0]?.name === EXPECTED_LIVE_DOMAIN &&
        domains[0]?.status === "active";
  if (!valid) {
    throw new PagesProjectError(
      "PRODUCTION_PAGES_BASELINE_UNPROVEN",
      listEvidence,
    );
  }
  return policy === FIRST_RELEASE_POLICY ? "NONE" : "EXACT_APEX_ACTIVE";
}

function createRequester({ account, token, fetchImpl }) {
  return async (path, operation, failureClassification, listEvidence = {}) => {
    let response;
    try {
      response = await fetchImpl(
        `${API_BASE}/accounts/${encodeURIComponent(account)}${path}`,
        {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
        },
      );
    } catch {
      throw new PagesProjectError(failureClassification, {
        operation,
        ...listEvidence,
      });
    }

    const httpStatus = safeHttpStatus(response?.status);
    let body;
    try {
      body = await response.json();
    } catch {
      throw new PagesProjectError(failureClassification, {
        operation,
        httpStatus,
        ...listEvidence,
      });
    }
    const cfErrorCode = safeCloudflareErrorCode(body);
    if (httpStatus === "401" || httpStatus === "403") {
      throw new PagesProjectError("PAGES_READ_TOKEN_ACCESS_DENIED", {
        operation,
        httpStatus,
        cfErrorCode,
        ...listEvidence,
      });
    }
    if (!response.ok || body?.success !== true) {
      throw new PagesProjectError(failureClassification, {
        operation,
        httpStatus,
        cfErrorCode,
        ...listEvidence,
      });
    }
    return { body, httpStatus, cfErrorCode };
  };
}

async function collectPages({
  request,
  path,
  operation,
  query = {},
  failureClassification,
  listEvidence = {},
}) {
  const params = new URLSearchParams(query);
  const suffix = params.size === 0 ? "" : `?${params}`;
  const result = await request(
    `${path}${suffix}`,
    operation,
    failureClassification,
    listEvidence,
  );
  if (!Array.isArray(result.body?.result)) {
    throw new PagesProjectError(failureClassification, {
      operation,
      httpStatus: result.httpStatus,
      cfErrorCode: result.cfErrorCode,
      ...listEvidence,
    });
  }
  const totalPages = Number(result.body?.result_info?.total_pages);
  if (!Number.isInteger(totalPages) || totalPages < 0 || totalPages > 1) {
    throw new PagesProjectError(failureClassification, {
      operation,
      httpStatus: result.httpStatus,
      cfErrorCode: result.cfErrorCode,
      ...listEvidence,
    });
  }
  return { rows: result.body.result, ...result };
}

async function verifyCanonicalDeploymentBaseline({
  request,
  canonicalDeployment,
  deployments,
  productionBranch,
  listEvidence,
}) {
  if (canonicalDeployment === null) {
    if (deployments.length === 0) {
      return { type: "EMPTY_UNROUTED", canonical: "NONE" };
    }
    throw new PagesProjectError(
      "PRODUCTION_PAGES_BASELINE_UNPROVEN",
      listEvidence,
    );
  }

  const deploymentId = canonicalDeployment?.id;
  if (
    !validProductionDeployment(
      canonicalDeployment,
      productionBranch,
      deploymentId,
    )
  ) {
    throw new PagesProjectError(
      "PRODUCTION_PAGES_BASELINE_UNPROVEN",
      listEvidence,
    );
  }
  const listedMatches = deployments.filter(
    (deployment) => deployment?.id === deploymentId,
  );
  if (
    listedMatches.length !== 1 ||
    !validProductionDeployment(listedMatches[0], productionBranch, deploymentId)
  ) {
    throw new PagesProjectError(
      "PRODUCTION_PAGES_BASELINE_UNPROVEN",
      listEvidence,
    );
  }

  const detail = await request(
    `/pages/projects/${encodeURIComponent(EXPECTED_PROJECT)}/deployments/${encodeURIComponent(deploymentId)}`,
    "GET_CANONICAL_PRODUCTION_DEPLOYMENT",
    "PRODUCTION_PAGES_BASELINE_UNPROVEN",
    listEvidence,
  );
  if (
    !validProductionDeployment(
      detail.body?.result,
      productionBranch,
      deploymentId,
    )
  ) {
    throw new PagesProjectError(
      "PRODUCTION_PAGES_BASELINE_UNPROVEN",
      listEvidence,
    );
  }
  return { type: "EXISTING_DEPLOYMENT", canonical: "VERIFIED" };
}

function validProductionDeployment(deployment, productionBranch, expectedId) {
  return (
    validOpaqueId(deployment?.id) &&
    deployment.id === expectedId &&
    deployment.project_name === EXPECTED_PROJECT &&
    deployment.environment === "production" &&
    deployment.is_skipped !== true &&
    deployment.latest_stage?.status === "success" &&
    deployment.deployment_trigger?.metadata?.branch === productionBranch &&
    validPagesDeploymentOrigin(deployment.url)
  );
}

function validProductionBranch(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    !/[\r\n]/.test(value)
  );
}

function validOpaqueId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\r\n]/.test(value)
  );
}

function validPagesDeploymentOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(`.${EXPECTED_PROJECT}.pages.dev`) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}

function emitCredentialAccess(
  emit,
  credential,
  { operation = "LIST_PROJECTS", httpStatus, cfErrorCode, access },
) {
  if (!credential.dedicated) return;
  const proven = access === "PASS";
  emit(`PAGES_READ_TOKEN_PRESENT=${credential.token ? "PASS" : "FAIL"}`);
  emit(`PAGES_READ_TOKEN_ACTIVE=${proven ? "PASS" : "UNPROVEN"}`);
  emit(`PAGES_READ_TOKEN_ACCOUNT_BINDING=${proven ? "PASS" : "UNPROVEN"}`);
  emit(`PAGES_READ_TOKEN_PERMISSION=${proven ? "PASS" : "UNPROVEN"}`);
  emit(`PAGES_READ_TOKEN_ACCESS=${access}`);
  emit(`PAGES_READ_API_OPERATION=${operation}`);
  emit(`PAGES_READ_API_HTTP_STATUS=${httpStatus}`);
  emit(`PAGES_READ_API_CF_ERROR_CODE=${cfErrorCode}`);
}

function safeHttpStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599
    ? String(value)
    : "0";
}

function safeCloudflareErrorCode(body) {
  if (!Array.isArray(body?.errors)) return "NONE";
  const error = body.errors.find(
    (item) => Number.isSafeInteger(item?.code) && item.code >= 1000,
  );
  return error ? String(error.code) : "NONE";
}

async function appendGitHubOutput({ project, baselineType, environment }) {
  if (!environment.GITHUB_OUTPUT) return;
  await appendFile(
    environment.GITHUB_OUTPUT,
    `project=${project}\nbaseline_type=${baselineType}\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    await resolveProductionPagesProject();
  } catch (error) {
    emitPagesProjectFailure(error);
    process.exitCode = 1;
  }
}
