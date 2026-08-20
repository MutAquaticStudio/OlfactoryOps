import { pathToFileURL } from "node:url";

import {
  emitPagesProjectFailure,
  resolveProductionPagesProject,
} from "./resolve-v2-production-pages-project.mjs";

const apiBase = "https://api.cloudflare.com/client/v4";
const services = {
  cloudRuntime: "olfactoryops-v2-cloud-runtime-production",
  api: "olfactoryops-v2-api-production",
  router: "olfactoryops-v2-tenant-router-production",
};

export async function verifyProductionRollbackReadiness({
  environment = process.env,
  fetchImpl = fetch,
  emit = (line) => console.log(line),
} = {}) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  const workerToken = environment.CLOUDFLARE_API_TOKEN?.trim();
  const pagesToken = environment.CLOUDFLARE_PAGES_READ_TOKEN?.trim();
  const project =
    environment.PRODUCTION_PAGES_PROJECT?.trim() ||
    "olfactoryops-v2-production";

  const workerResults = await Promise.all(
    Object.entries(services).map(async ([name, service]) => [
      name,
      account && workerToken
        ? await inspectWorkerRollback({
            account,
            service,
            token: workerToken,
            fetchImpl,
          })
        : unavailableWorkerRollback(),
    ]),
  );
  const pagesResult =
    account && project === "olfactoryops-v2-production"
      ? await pagesRollback({ account, pagesToken, emit })
      : { ready: false, baseline: "UNPROVEN" };

  for (const [name, result] of workerResults) {
    const prefix = `ROLLBACK_${name.toUpperCase()}`;
    emit(`${prefix}_API_HTTP_STATUS=${result.httpStatus}`);
    emit(`${prefix}_API_CF_ERROR_CODE=${result.cfErrorCode}`);
    emit(`${prefix}_DEPLOYMENT_STATE=${result.state}`);
    emit(`${prefix}_READY=${result.ready ? "PASS" : "FAIL"}`);
  }
  emit(`ROLLBACK_PAGES_BASELINE=${pagesResult.baseline}`);
  emit(`ROLLBACK_PAGES_READY=${pagesResult.ready ? "PASS" : "FAIL"}`);
  const pass =
    pagesResult.ready && workerResults.every(([, result]) => result.ready);
  emit(`PRODUCTION_ROLLBACK_READY=${pass ? "PASS" : "UNPROVEN"}`);
  return {
    pass,
    pagesResult,
    workerResults: Object.fromEntries(workerResults),
  };
}

export async function inspectWorkerRollback({
  account,
  service,
  token,
  fetchImpl = fetch,
}) {
  const response = await get(
    `/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(service)}/deployments`,
    token,
    fetchImpl,
  );
  if (!response.body) {
    return {
      ready: false,
      state: "API_FAILURE",
      httpStatus: response.httpStatus,
      cfErrorCode: response.cfErrorCode,
    };
  }
  const deployments = Array.isArray(response.body?.result?.deployments)
    ? response.body.result.deployments
    : [];
  if (deployments.length === 0) {
    return {
      ready: false,
      state: "NO_DEPLOYMENT",
      httpStatus: response.httpStatus,
      cfErrorCode: response.cfErrorCode,
    };
  }
  const versions = Array.isArray(deployments[0]?.versions)
    ? deployments[0].versions
    : [];
  const activeVersions = versions.filter(
    (item) => item?.percentage === 100 && validId(item?.version_id),
  );
  if (activeVersions.length !== 1) {
    return {
      ready: false,
      state: "NO_SINGLE_ACTIVE_VERSION",
      httpStatus: response.httpStatus,
      cfErrorCode: response.cfErrorCode,
    };
  }
  return {
    ready: true,
    state: "READY",
    httpStatus: response.httpStatus,
    cfErrorCode: response.cfErrorCode,
  };
}

function unavailableWorkerRollback() {
  return {
    ready: false,
    state: "CREDENTIAL_UNAVAILABLE",
    httpStatus: "0",
    cfErrorCode: "NONE",
  };
}

async function pagesRollback({ account, pagesToken, emit }) {
  const pagesEnvironment = {
    CLOUDFLARE_ACCOUNT_ID: account,
    CLOUDFLARE_PAGES_READ_TOKEN: pagesToken || "",
  };
  try {
    const resolution = await resolveProductionPagesProject({
      environment: pagesEnvironment,
      appendOutput: async () => {},
      emit,
    });
    return { ready: true, baseline: resolution.baselineType };
  } catch (error) {
    emitPagesProjectFailure(error, emit, pagesEnvironment);
    return { ready: false, baseline: "UNPROVEN" };
  }
}

async function get(path, token, fetchImpl) {
  try {
    const response = await fetchImpl(`${apiBase}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const httpStatus = safeHttpStatus(response?.status);
    let body;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const cfErrorCode = safeCloudflareErrorCode(body);
    return {
      body: response?.ok && body?.success === true ? body : undefined,
      httpStatus,
      cfErrorCode,
    };
  } catch {
    return { body: undefined, httpStatus: "0", cfErrorCode: "NONE" };
  }
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

function validId(value) {
  return (
    typeof value === "string" &&
    value.trim().length >= 8 &&
    value.trim().length <= 128
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const result = await verifyProductionRollbackReadiness();
  if (!result.pass) process.exitCode = 1;
}
