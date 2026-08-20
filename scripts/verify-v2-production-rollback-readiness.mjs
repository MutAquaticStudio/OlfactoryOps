const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const workerToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const pagesToken = process.env.CLOUDFLARE_PAGES_READ_TOKEN?.trim();
const project =
  process.env.PRODUCTION_PAGES_PROJECT?.trim() || "olfactoryops-v2-production";
const apiBase = "https://api.cloudflare.com/client/v4";
const services = {
  cloudRuntime: "olfactoryops-v2-cloud-runtime-production",
  api: "olfactoryops-v2-api-production",
  router: "olfactoryops-v2-tenant-router-production",
};

let workerResults = Object.keys(services).map((name) => [name, false]);
let pagesResult = { ready: false, baseline: "UNPROVEN" };
if (account && workerToken) {
  workerResults = await Promise.all(
    Object.entries(services).map(async ([name, service]) => [
      name,
      await workerRollback(service),
    ]),
  );
}
if (account && pagesToken && project === "olfactoryops-v2-production") {
  pagesResult = await pagesRollback();
}

for (const [name, result] of workerResults) {
  console.log(
    `ROLLBACK_${name.toUpperCase()}_READY=${result ? "PASS" : "FAIL"}`,
  );
}
console.log(`ROLLBACK_PAGES_BASELINE=${pagesResult.baseline}`);
console.log(`ROLLBACK_PAGES_READY=${pagesResult.ready ? "PASS" : "FAIL"}`);
const pass = pagesResult.ready && workerResults.every(([, result]) => result);
console.log(`PRODUCTION_ROLLBACK_READY=${pass ? "PASS" : "UNPROVEN"}`);
if (!pass) process.exitCode = 1;

async function workerRollback(service) {
  const body = await get(
    `/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(service)}/deployments`,
    workerToken,
  );
  const deployment = body?.result?.deployments?.[0];
  const versions = Array.isArray(deployment?.versions)
    ? deployment.versions
    : [];
  const version = versions.find(
    (item) => item?.percentage === 100 && validId(item?.version_id),
  );
  return Boolean(deployment && version);
}

async function pagesRollback() {
  const detail = await get(
    `/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(project)}`,
    pagesToken,
  );
  if (detail?.result?.name !== project) {
    return { ready: false, baseline: "UNPROVEN" };
  }
  const domains = await get(
    `/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(project)}/domains?per_page=20&page=1`,
    pagesToken,
  );
  const customDomains = Array.isArray(domains?.result)
    ? domains.result
    : undefined;
  if (!customDomains || customDomains.length !== 0) {
    return { ready: false, baseline: "UNPROVEN" };
  }
  const deployments = await get(
    `/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(project)}/deployments?env=production&per_page=20&page=1`,
    pagesToken,
  );
  if (!deployments) return { ready: false, baseline: "UNPROVEN" };
  const successful = Array.isArray(deployments.result)
    ? deployments.result.filter(
        (item) =>
          item?.latest_stage?.status === "success" &&
          item?.is_skipped !== true &&
          validOrigin(item?.url, project),
      )
    : [];
  return successful.length > 0
    ? { ready: true, baseline: "EXISTING_DEPLOYMENT" }
    : { ready: true, baseline: "EMPTY_UNROUTED" };
}

async function get(path, token) {
  try {
    const response = await fetch(`${apiBase}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return undefined;
    const body = await response.json();
    return body?.success === true ? body : undefined;
  } catch {
    return undefined;
  }
}

function validId(value) {
  return (
    typeof value === "string" &&
    value.trim().length >= 8 &&
    value.trim().length <= 128
  );
}

function validOrigin(value, expectedProject) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(`.${expectedProject}.pages.dev`) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}
