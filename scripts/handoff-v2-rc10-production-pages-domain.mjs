import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API_BASE = "https://api.cloudflare.com/client/v4";
const RC10_SHA = "fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd";
const PROJECT = "olfactoryops-v2-production";
const HOSTNAME = "labofscents.org";
const EXPECTED_CNAME = `${PROJECT}.pages.dev`;
const ROUTES = ["/", "/login", "/signup", "/v2/login", "/v2/signup"];

export class PagesDomainHandoffError extends Error {
  constructor(classification) {
    super();
    this.classification = classification;
  }
}

export async function preflightProductionPagesDomainHandoff({
  environment = process.env,
  fetchImpl = fetch,
  writeBaseline = writePrivateBaseline,
  emit = (line) => console.log(line),
} = {}) {
  const context = requiredContext(environment);
  const request = createRequester(context, fetchImpl);
  const state = await inspectPreflight({
    request,
    releaseSha: context.releaseSha,
  });
  await writeBaseline(context.baselineFile, state);
  emit("PRODUCTION_PAGES_DOMAIN_PREFLIGHT=PASS");
  emit("PRODUCTION_PAGES_RC10_DEPLOYMENT=PASS");
  emit("PRODUCTION_PAGES_DOMAIN_PREDECESSOR_TARGET=PROVEN");
  return state;
}

export async function handoffProductionPagesDomain({
  environment = process.env,
  fetchImpl = fetch,
  readBaseline = readPrivateBaseline,
  writeBaseline = writePrivateBaseline,
  emit = (line) => console.log(line),
  sleep = defaultSleep,
} = {}) {
  const context = requiredContext(environment);
  const request = createRequester(context, fetchImpl);
  const baseline = await readBaseline(context.baselineFile);
  validateBaseline(baseline, context.releaseSha);

  await revalidatePredecessor({ request, baseline });
  await addExpectedPagesDomain({ request });
  baseline.pagesDomainAdded = true;
  await writeBaseline(context.baselineFile, baseline);
  await requireExpectedPagesDomain({ request });
  await updateApexCname({ request, baseline });
  baseline.apexCnameUpdated = true;
  await writeBaseline(context.baselineFile, baseline);
  await waitForPublicPagesIdentity({
    releaseSha: context.releaseSha,
    fetchImpl,
    sleep,
  });

  emit("PRODUCTION_PAGES_DOMAIN_HANDOFF=PASS");
  emit("PRODUCTION_PAGES_PUBLIC_DOMAIN=PASS");
  emit("PRODUCTION_PAGES_PUBLIC_RC10_IDENTITY=PASS");
  return { pass: true };
}

export async function recoverProductionPagesDomainHandoff({
  environment = process.env,
  fetchImpl = fetch,
  readBaseline = readPrivateBaseline,
  emit = (line) => console.log(line),
} = {}) {
  const context = requiredContext(environment);
  const request = createRequester(context, fetchImpl);
  let baseline;
  try {
    baseline = await readBaseline(context.baselineFile);
    validateBaseline(baseline, context.releaseSha);
  } catch {
    emit("PRODUCTION_PAGES_DOMAIN_RECOVERY=UNPROVEN");
    throw new PagesDomainHandoffError(
      "PAGES_DOMAIN_RECOVERY_BASELINE_UNAVAILABLE",
    );
  }

  const current = await readCurrentState({ request, zoneId: baseline.zoneId });
  const record = exactApexRecord(current.records);
  const pageDomain = exactExpectedDomain(current.domains);
  if (
    !pageDomain &&
    record &&
    record.id === baseline.dnsRecordId &&
    record.content === baseline.previousCname &&
    record.proxied === baseline.previousProxied
  ) {
    emit("PRODUCTION_PAGES_DOMAIN_RECOVERY=NOT_REQUIRED");
    return { pass: true, state: "NOT_REQUIRED" };
  }
  if (!record || record.id !== baseline.dnsRecordId || !pageDomain) {
    emit("PRODUCTION_PAGES_DOMAIN_RECOVERY=UNPROVEN");
    throw new PagesDomainHandoffError("PAGES_DOMAIN_RECOVERY_STATE_UNPROVEN");
  }

  if (record.content === EXPECTED_CNAME) {
    await request(
      `/zones/${encodeURIComponent(baseline.zoneId)}/dns_records/${encodeURIComponent(baseline.dnsRecordId)}`,
      "PATCH",
      {
        type: "CNAME",
        name: HOSTNAME,
        content: baseline.previousCname,
        proxied: baseline.previousProxied,
      },
    );
  } else if (
    record.content !== baseline.previousCname ||
    record.proxied !== baseline.previousProxied
  ) {
    emit("PRODUCTION_PAGES_DOMAIN_RECOVERY=UNPROVEN");
    throw new PagesDomainHandoffError("PAGES_DOMAIN_RECOVERY_DNS_DRIFT");
  }

  await request(
    `/pages/projects/${encodeURIComponent(PROJECT)}/domains/${encodeURIComponent(HOSTNAME)}`,
    "DELETE",
  );
  const verified = await readCurrentState({ request, zoneId: baseline.zoneId });
  const restored = exactApexRecord(verified.records);
  if (
    !restored ||
    restored.id !== baseline.dnsRecordId ||
    restored.content !== baseline.previousCname ||
    restored.proxied !== baseline.previousProxied ||
    exactExpectedDomain(verified.domains)
  ) {
    emit("PRODUCTION_PAGES_DOMAIN_RECOVERY=UNPROVEN");
    throw new PagesDomainHandoffError(
      "PAGES_DOMAIN_RECOVERY_VERIFICATION_FAILED",
    );
  }
  emit("PRODUCTION_PAGES_DOMAIN_RECOVERY=PASS");
  return { pass: true, state: "RESTORED" };
}

async function inspectPreflight({ request, releaseSha }) {
  const project = await request(
    `/pages/projects/${encodeURIComponent(PROJECT)}`,
    "GET",
  );
  if (
    project?.name !== PROJECT ||
    project?.production_branch !== "production"
  ) {
    throw new PagesDomainHandoffError("PAGES_PROJECT_UNPROVEN");
  }
  const deployments = await collectPagesDeployments({ request });
  if (!hasExactRc10Deployment(deployments, releaseSha)) {
    throw new PagesDomainHandoffError("PAGES_RC10_DEPLOYMENT_UNPROVEN");
  }
  const zone = await exactZone(request);
  const current = await readCurrentState({ request, zoneId: zone.id });
  if (exactExpectedDomain(current.domains)) {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_ALREADY_ATTACHED");
  }
  if (current.domains.some((domain) => domain?.name === HOSTNAME)) {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_AMBIGUOUS");
  }
  const record = exactApexRecord(current.records);
  if (
    !record ||
    record.type !== "CNAME" ||
    record.proxied !== true ||
    typeof record.id !== "string" ||
    !record.id ||
    !validPagesCname(record.content) ||
    record.content === EXPECTED_CNAME
  ) {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_PREDECESSOR_UNPROVEN");
  }
  const projects = await request("/pages/projects", "GET");
  if (
    !Array.isArray(projects) ||
    !projects.some(
      (project) =>
        project?.name === projectNameForCname(record.content) &&
        project?.name !== PROJECT,
    )
  ) {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_PREDECESSOR_UNPROVEN");
  }
  return {
    schema: 1,
    releaseSha,
    zoneId: zone.id,
    dnsRecordId: record.id,
    previousCname: record.content,
    previousProxied: record.proxied,
    pagesDomainAdded: false,
    apexCnameUpdated: false,
  };
}

async function revalidatePredecessor({ request, baseline }) {
  const zone = await exactZone(request);
  if (zone.id !== baseline.zoneId) {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_ZONE_DRIFT");
  }
  const current = await readCurrentState({ request, zoneId: baseline.zoneId });
  const record = exactApexRecord(current.records);
  if (
    !record ||
    record.id !== baseline.dnsRecordId ||
    record.content !== baseline.previousCname ||
    record.proxied !== baseline.previousProxied ||
    exactExpectedDomain(current.domains)
  ) {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_PREHANDOFF_DRIFT");
  }
}

async function addExpectedPagesDomain({ request }) {
  await request(
    `/pages/projects/${encodeURIComponent(PROJECT)}/domains`,
    "POST",
    { name: HOSTNAME },
  );
}

async function requireExpectedPagesDomain({ request }) {
  const domains = await request(
    `/pages/projects/${encodeURIComponent(PROJECT)}/domains`,
    "GET",
  );
  if (!exactExpectedDomain(domains)) {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_ATTACHMENT_UNPROVEN");
  }
}

async function updateApexCname({ request, baseline }) {
  const current = await readCurrentState({ request, zoneId: baseline.zoneId });
  const record = exactApexRecord(current.records);
  if (
    !record ||
    record.id !== baseline.dnsRecordId ||
    record.content !== baseline.previousCname ||
    record.proxied !== baseline.previousProxied ||
    !exactExpectedDomain(current.domains)
  ) {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_PREHANDOFF_DRIFT");
  }
  await request(
    `/zones/${encodeURIComponent(baseline.zoneId)}/dns_records/${encodeURIComponent(baseline.dnsRecordId)}`,
    "PATCH",
    { type: "CNAME", name: HOSTNAME, content: EXPECTED_CNAME, proxied: true },
  );
}

async function waitForPublicPagesIdentity({ releaseSha, fetchImpl, sleep }) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await publicPagesIdentity({ releaseSha, fetchImpl })) return;
    if (attempt < 11) await sleep(5_000);
  }
  throw new PagesDomainHandoffError("PAGES_DOMAIN_PUBLIC_IDENTITY_UNPROVEN");
}

async function publicPagesIdentity({ releaseSha, fetchImpl }) {
  const origin = `https://${HOSTNAME}`;
  let manifestResponse;
  let manifest;
  try {
    manifestResponse = await fetchImpl(new URL("/release.json", origin), {
      redirect: "manual",
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      signal: AbortSignal.timeout(20_000),
    });
    manifest = await manifestResponse.json();
  } catch {
    return false;
  }
  if (
    manifestResponse.status !== 200 ||
    manifest?.fullGitSha?.toLowerCase() !== releaseSha ||
    manifest?.artifact !== "pages"
  ) {
    return false;
  }
  for (const path of ROUTES) {
    try {
      const response = await fetchImpl(new URL(path, origin), {
        redirect: "manual",
        headers: { "cache-control": "no-cache", pragma: "no-cache" },
        signal: AbortSignal.timeout(20_000),
      });
      if (
        response.status !== 200 ||
        !/^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "")
      )
        return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function collectPagesDeployments({ request }) {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await request(
      `/pages/projects/${encodeURIComponent(PROJECT)}/deployments?env=production&page=${page}&per_page=20`,
      "GET",
      undefined,
      true,
    );
    all.push(...response.rows);
    if (response.done) return all;
  }
  throw new PagesDomainHandoffError("PAGES_DEPLOYMENT_INVENTORY_UNPROVEN");
}

function hasExactRc10Deployment(deployments, releaseSha) {
  return deployments.some(
    (deployment) =>
      deployment?.project_name === PROJECT &&
      deployment?.environment === "production" &&
      deployment?.is_skipped !== true &&
      deployment?.latest_stage?.status === "success" &&
      deployment?.deployment_trigger?.metadata?.branch === "production" &&
      deployment?.deployment_trigger?.metadata?.commit_hash?.toLowerCase() ===
        releaseSha,
  );
}

async function exactZone(request) {
  const zones = await request(
    `/zones?name=${encodeURIComponent(HOSTNAME)}&per_page=20`,
    "GET",
  );
  const exact = Array.isArray(zones)
    ? zones.filter(
        (zone) =>
          zone?.name === HOSTNAME && typeof zone?.id === "string" && zone.id,
      )
    : [];
  if (exact.length !== 1)
    throw new PagesDomainHandoffError("PAGES_DOMAIN_ZONE_UNPROVEN");
  return exact[0];
}

async function readCurrentState({ request, zoneId }) {
  const [domains, records] = await Promise.all([
    request(`/pages/projects/${encodeURIComponent(PROJECT)}/domains`, "GET"),
    request(
      `/zones/${encodeURIComponent(zoneId)}/dns_records?name.exact=${encodeURIComponent(HOSTNAME)}&per_page=20`,
      "GET",
    ),
  ]);
  return {
    domains: Array.isArray(domains) ? domains : [],
    records: Array.isArray(records) ? records : [],
  };
}

function exactApexRecord(records) {
  const exact = records.filter((record) => record?.name === HOSTNAME);
  return exact.length === 1 ? exact[0] : undefined;
}

function exactExpectedDomain(domains) {
  const exact = domains.filter((domain) => domain?.name === HOSTNAME);
  return exact.length === 1 ? exact[0] : undefined;
}

function validPagesCname(value) {
  return typeof value === "string" && /^[a-z0-9-]+\.pages\.dev$/.test(value);
}

function projectNameForCname(value) {
  return value.slice(0, -".pages.dev".length);
}

function requiredContext(environment) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = environment.CLOUDFLARE_API_TOKEN?.trim();
  const releaseSha = environment.RELEASE_SHA?.trim().toLowerCase();
  const baselineFile = environment.PAGES_DOMAIN_BASELINE_FILE?.trim();
  if (!account || !token || !baselineFile || releaseSha !== RC10_SHA) {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_CONTEXT_INVALID");
  }
  return { account, token, releaseSha, baselineFile };
}

function createRequester(context, fetchImpl) {
  return async (path, method, body, paginated = false) => {
    let response;
    try {
      response = await fetchImpl(
        `${API_BASE}/accounts/${encodeURIComponent(context.account)}${path}`,
        {
          method,
          headers: {
            authorization: `Bearer ${context.token}`,
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20_000),
        },
      );
    } catch {
      throw new PagesDomainHandoffError(
        "PAGES_DOMAIN_CONTROL_PLANE_UNAVAILABLE",
      );
    }
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      throw new PagesDomainHandoffError(
        "PAGES_DOMAIN_CONTROL_PLANE_UNAVAILABLE",
      );
    }
    if (!response.ok || envelope?.success !== true) {
      throw new PagesDomainHandoffError("PAGES_DOMAIN_CONTROL_PLANE_REJECTED");
    }
    if (paginated) {
      const rows = Array.isArray(envelope.result) ? envelope.result : undefined;
      if (!rows)
        throw new PagesDomainHandoffError(
          "PAGES_DEPLOYMENT_INVENTORY_UNPROVEN",
        );
      const totalPages = Number(envelope.result_info?.total_pages);
      return {
        rows,
        done:
          (Number.isInteger(totalPages) &&
            totalPages > 0 &&
            Number(envelope.result_info?.page) >= totalPages) ||
          rows.length < 20,
      };
    }
    return envelope.result;
  };
}

function validateBaseline(value, releaseSha) {
  if (
    !value ||
    value.schema !== 1 ||
    value.releaseSha !== releaseSha ||
    typeof value.zoneId !== "string" ||
    !value.zoneId ||
    typeof value.dnsRecordId !== "string" ||
    !value.dnsRecordId ||
    !validPagesCname(value.previousCname) ||
    value.previousCname === EXPECTED_CNAME ||
    value.previousProxied !== true
  ) {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_BASELINE_INVALID");
  }
}

async function writePrivateBaseline(path, value) {
  await writeFile(path, JSON.stringify(value), {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function readPrivateBaseline(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new PagesDomainHandoffError("PAGES_DOMAIN_BASELINE_UNAVAILABLE");
  }
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const command = process.argv[2];
  try {
    if (command === "preflight") await preflightProductionPagesDomainHandoff();
    else if (command === "handoff") await handoffProductionPagesDomain();
    else if (command === "recover") await recoverProductionPagesDomainHandoff();
    else throw new PagesDomainHandoffError("PAGES_DOMAIN_COMMAND_INVALID");
  } catch (error) {
    const classification =
      error instanceof PagesDomainHandoffError
        ? error.classification
        : "PAGES_DOMAIN_UNCLASSIFIED";
    console.log(`PRODUCTION_PAGES_DOMAIN_HANDOFF_FAILURE=${classification}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
