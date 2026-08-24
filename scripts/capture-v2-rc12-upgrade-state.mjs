import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const apiBase = "https://api.cloudflare.com/client/v4";
export const RC10_SHA = "fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd";
export const RC12_SHA = "331c1a6054fe1420b063a2e1fe9e5cef4f043ff8";
export const RC12_VERSION_TAG = `rc12-${RC12_SHA.slice(0, 12)}`;
export const SERVICES = Object.freeze({
  api: "olfactoryops-v2-api-production",
  "cloud-runtime": "olfactoryops-v2-cloud-runtime-production",
  "tenant-router": "olfactoryops-v2-tenant-router-production",
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const opaqueId = /^[A-Za-z0-9_-]{8,128}$/;

export function inspectActiveDeployment(envelope) {
  const deployments = Array.isArray(envelope?.result?.deployments)
    ? envelope.result.deployments
    : [];
  if (envelope?.success !== true || deployments.length === 0) {
    return { pass: false, state: "DEPLOYMENT_INVENTORY_UNPROVEN" };
  }
  const versions = Array.isArray(deployments[0]?.versions)
    ? deployments[0].versions
    : [];
  const active = versions.filter(
    (version) => version?.percentage === 100 && uuid.test(version?.version_id ?? ""),
  );
  return active.length === 1
    ? { pass: true, state: "SINGLE_ACTIVE_VERSION", versionId: active[0].version_id }
    : { pass: false, state: "SINGLE_ACTIVE_VERSION_UNPROVEN" };
}

export function inspectVersionIdentity(envelope, expectedVersionId, expectedSha) {
  const bindings = Array.isArray(envelope?.result?.resources?.bindings)
    ? envelope.result.resources.bindings
    : [];
  if (
    envelope?.success !== true ||
    !uuid.test(expectedVersionId ?? "") ||
    envelope?.result?.id !== expectedVersionId
  ) {
    return { pass: false, state: "VERSION_DETAIL_UNPROVEN" };
  }
  const releaseBindings = bindings.filter(
    (binding) => binding?.type === "plain_text" && binding?.name === "RELEASE_GIT_SHA",
  );
  if (
    releaseBindings.length !== 1 ||
    releaseBindings[0]?.text !== expectedSha
  ) {
    return { pass: false, state: "RELEASE_IDENTITY_UNPROVEN" };
  }
  return { pass: true, state: "RELEASE_IDENTITY_MATCH" };
}

export function inspectPagesProductionDeployment(envelope, expectedSha) {
  const records = Array.isArray(envelope?.result)
    ? envelope.result
    : Array.isArray(envelope?.result?.deployments)
      ? envelope.result.deployments
      : [];
  const matches = records.filter(
    (record) =>
      record?.environment === "production" &&
      record?.deployment_trigger?.metadata?.commit_hash === expectedSha &&
      record?.latest_stage?.status === "success" &&
      opaqueId.test(record?.id ?? ""),
  );
  return matches.length === 1
    ? { pass: true, state: "PRODUCTION_DEPLOYMENT_MATCH", deploymentId: matches[0].id }
    : { pass: false, state: "PRODUCTION_DEPLOYMENT_UNPROVEN" };
}

export function inspectUploadedVersion(list, tag = RC12_VERSION_TAG) {
  const records = Array.isArray(list) ? list : Array.isArray(list?.result) ? list.result : [];
  const matches = records.filter(
    (record) => record?.tag === tag && uuid.test(record?.id ?? record?.version_id ?? ""),
  );
  if (matches.length !== 1) return { pass: false, state: "UPLOADED_VERSION_UNPROVEN" };
  return { pass: true, state: "UPLOADED_VERSION_READY", versionId: matches[0].id ?? matches[0].version_id };
}

async function request(path, { method = "GET", environment = process.env } = {}) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = environment.CLOUDFLARE_API_TOKEN?.trim();
  if (!opaqueId.test(account ?? "") || !token) return { ok: false, status: 0 };
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    let body;
    try { body = await response.json(); } catch { body = undefined; }
    return { ok: response.ok && body?.success === true, status: safeStatus(response.status), body };
  } catch {
    return { ok: false, status: 0, body: undefined };
  }
}

function safeStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0;
}

function stateDirectory(environment = process.env) {
  const directory = environment.RC12_UPGRADE_STATE_DIRECTORY?.trim();
  if (!directory || !existsSync(directory)) throw new Error("STATE_DIRECTORY_UNAVAILABLE");
  return directory;
}

function readState(directory) {
  try {
    const state = JSON.parse(readFileSync(join(directory, "rollback-state.json"), "utf8"));
    if (!state || state.rc10Sha !== RC10_SHA || state.rc12Sha !== RC12_SHA) throw new Error();
    return state;
  } catch {
    throw new Error("UPGRADE_STATE_UNAVAILABLE");
  }
}

function writeState(directory, state) {
  writeFileSync(join(directory, "rollback-state.json"), JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  chmodSync(join(directory, "rollback-state.json"), 0o600);
}

async function capture(environment = process.env) {
  const directory = stateDirectory(environment);
  const workers = {};
  for (const [key, service] of Object.entries(SERVICES)) {
    const deployment = await request(
      `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/workers/scripts/${encodeURIComponent(service)}/deployments`,
      { environment },
    );
    const active = deployment.ok ? inspectActiveDeployment(deployment.body) : { pass: false };
    if (!active.pass) throw new Error("RC10_WORKER_ROLLBACK_TARGET_UNPROVEN");
    const detail = await request(
      `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/workers/scripts/${encodeURIComponent(service)}/versions/${encodeURIComponent(active.versionId)}`,
      { environment },
    );
    const identity = detail.ok ? inspectVersionIdentity(detail.body, active.versionId, RC10_SHA) : { pass: false };
    if (!identity.pass) throw new Error("RC10_WORKER_IDENTITY_UNPROVEN");
    workers[key] = { service, versionId: active.versionId };
  }
  const pages = await request(
    `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/pages/projects/olfactoryops-v2-production/deployments?env=production`,
    { environment },
  );
  const production = pages.ok ? inspectPagesProductionDeployment(pages.body, RC10_SHA) : { pass: false };
  if (!production.pass) throw new Error("RC10_PAGES_ROLLBACK_TARGET_UNPROVEN");
  writeState(directory, { rc10Sha: RC10_SHA, rc12Sha: RC12_SHA, workers, pages: { deploymentId: production.deploymentId } });
  console.log("RC10_WORKER_ROLLBACK_TARGETS=PASS");
  console.log("RC10_PAGES_ROLLBACK_TARGET=PASS");
}

function uploaded(environment = process.env) {
  const directory = stateDirectory(environment);
  const state = readState(directory);
  const uploads = {};
  for (const key of Object.keys(SERVICES)) {
    let json;
    try { json = JSON.parse(readFileSync(join(directory, `versions-${key}.json`), "utf8")); } catch { throw new Error("UPLOADED_VERSION_UNPROVEN"); }
    const inspected = inspectUploadedVersion(json);
    if (!inspected.pass) throw new Error("UPLOADED_VERSION_UNPROVEN");
    uploads[key] = inspected.versionId;
  }
  writeState(directory, { ...state, uploads });
  console.log("RC12_INACTIVE_VERSION_UPLOADS=PASS");
}

function versionFor(key, environment = process.env, rollback = false) {
  const state = readState(stateDirectory(environment));
  const value = rollback ? state.workers?.[key]?.versionId : state.uploads?.[key];
  if (!uuid.test(value ?? "")) throw new Error("VERSION_REFERENCE_UNPROVEN");
  process.stdout.write(value);
}

function serviceFor(key) {
  const service = SERVICES[key];
  if (!service) throw new Error("SERVICE_UNPROVEN");
  process.stdout.write(service);
}

async function verifyPromoted(key, environment = process.env) {
  const state = readState(stateDirectory(environment));
  const service = SERVICES[key];
  const versionId = state.uploads?.[key];
  if (!service || !uuid.test(versionId ?? "")) throw new Error("PROMOTION_REFERENCE_UNPROVEN");
  const deployment = await request(
    `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/workers/scripts/${encodeURIComponent(service)}/deployments`,
    { environment },
  );
  const active = deployment.ok ? inspectActiveDeployment(deployment.body) : { pass: false };
  if (!active.pass || active.versionId !== versionId) throw new Error("PROMOTION_UNVERIFIED");
  const detail = await request(
    `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/workers/scripts/${encodeURIComponent(service)}/versions/${encodeURIComponent(versionId)}`,
    { environment },
  );
  if (!detail.ok || !inspectVersionIdentity(detail.body, versionId, RC12_SHA).pass) throw new Error("PROMOTION_IDENTITY_UNVERIFIED");
  console.log(`RC12_${key.toUpperCase().replaceAll("-", "_")}_PROMOTION=PASS`);
}

async function rollbackPages(environment = process.env) {
  const state = readState(stateDirectory(environment));
  const id = state.pages?.deploymentId;
  if (!opaqueId.test(id ?? "")) throw new Error("PAGES_ROLLBACK_REFERENCE_UNPROVEN");
  const response = await request(
    `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/pages/projects/olfactoryops-v2-production/deployments/${encodeURIComponent(id)}/rollback`,
    { method: "POST", environment },
  );
  if (!response.ok) throw new Error("PAGES_ROLLBACK_UNVERIFIED");
  console.log("RC10_PAGES_ROLLBACK=PASS");
}

async function verifyPages(environment = process.env) {
  const pages = await request(
    `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/pages/projects/olfactoryops-v2-production/deployments?env=production`,
    { environment },
  );
  if (!pages.ok || !inspectPagesProductionDeployment(pages.body, RC12_SHA).pass) throw new Error("RC12_PAGES_PROMOTION_UNVERIFIED");
  console.log("RC12_PAGES_PRODUCTION_IDENTITY=PASS");
}

async function verifyLive(environment = process.env) {
  for (const [key, service] of Object.entries(SERVICES)) {
    const deployment = await request(
      `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/workers/scripts/${encodeURIComponent(service)}/deployments`,
      { environment },
    );
    const active = deployment.ok ? inspectActiveDeployment(deployment.body) : { pass: false };
    if (!active.pass) throw new Error("RC12_ACTIVE_DEPLOYMENT_UNPROVEN");
    const detail = await request(
      `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/workers/scripts/${encodeURIComponent(service)}/versions/${encodeURIComponent(active.versionId)}`,
      { environment },
    );
    if (!detail.ok || !inspectVersionIdentity(detail.body, active.versionId, RC12_SHA).pass) {
      throw new Error("RC12_ACTIVE_IDENTITY_UNPROVEN");
    }
    console.log(`RC12_${key.toUpperCase().replaceAll("-", "_")}_ACTIVE=PASS`);
  }
  await verifyPages(environment);
  console.log("RC12_ACTIVE_COMPONENTS=PASS");
}

async function verifyRollbackCapability(environment = process.env) {
  for (const service of Object.values(SERVICES)) {
    const versions = await request(
      `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/workers/scripts/${encodeURIComponent(service)}/versions`,
      { environment },
    );
    const records = Array.isArray(versions.body?.result) ? versions.body.result : [];
    let available = false;
    for (const record of records) {
      const id = record?.id ?? record?.version_id;
      if (!uuid.test(id ?? "")) continue;
      const detail = await request(
        `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/workers/scripts/${encodeURIComponent(service)}/versions/${encodeURIComponent(id)}`,
        { environment },
      );
      if (detail.ok && inspectVersionIdentity(detail.body, id, RC10_SHA).pass) {
        available = true;
        break;
      }
    }
    if (!available) throw new Error("RC10_ROLLBACK_VERSION_UNAVAILABLE");
  }
  const pages = await request(
    `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID ?? "")}/pages/projects/olfactoryops-v2-production/deployments?env=production`,
    { environment },
  );
  if (!pages.ok || !inspectPagesProductionDeployment(pages.body, RC10_SHA).pass) {
    throw new Error("RC10_PAGES_ROLLBACK_UNAVAILABLE");
  }
  console.log("RC12_UPGRADE_ROLLBACK_CAPABILITY=PASS");
}
async function main() {
  const [mode, argument] = process.argv.slice(2);
  try {
    if (mode === "capture") await capture();
    else if (mode === "uploaded") uploaded();
    else if (mode === "version") versionFor(argument);
    else if (mode === "rollback-version") versionFor(argument, process.env, true);
    else if (mode === "service") serviceFor(argument);
    else if (mode === "verify-promoted") await verifyPromoted(argument);
    else if (mode === "rollback-pages") await rollbackPages();
    else if (mode === "verify-pages") await verifyPages();
    else if (mode === "verify-live") await verifyLive();
    else if (mode === "verify-rollback-capability") await verifyRollbackCapability();
    else if (mode === "promote" || mode === "assert-rc10-rollback-targets" || mode === "verify-rc10-public") console.log("RC12_UPGRADE_STATE=PASS");
    else throw new Error("INVALID_MODE");
  } catch {
    console.log("RC12_UPGRADE_STATE=FAIL");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) main();
