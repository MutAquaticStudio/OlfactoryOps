import { createHash, randomBytes } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const API_BASE = "https://api.cloudflare.com/client/v4";
const RC13_SHA = "09e96feacb9db03325683ee329fb269206a21880";
const CANDIDATE_PROJECT = "olfactoryops-v2-production-candidate";
const LIVE_PROJECT = "olfactoryops-v2-production";
const CANDIDATE_BRANCH = "production-candidate";
const CANDIDATE_API_BASE = "https://api-next.labofscents.org/api/v1";
const CANDIDATE_WORKSPACE_BASE_DOMAIN = "next.labofscents.org";
const CHECKPOINTS = new Map([
  ["BEFORE_ROUTER", "PROJECT_ROOT_RELEASE_RECHECK_BEFORE_ROUTER=PASS"],
  ["BEFORE_SMOKE", "PROJECT_ROOT_RELEASE_RECHECK_BEFORE_SMOKE=PASS"],
]);

export class CandidatePagesProjectRootError extends Error {
  constructor(classification) {
    super();
    this.classification = classification;
  }
}

export async function verifyCandidatePagesProjectRoot({
  environment = process.env,
  fetchImpl = fetch,
  distDirectory = resolve("dist"),
  emit = (line) => console.log(line),
  appendOutput = appendGitHubOutput,
} = {}) {
  const accountId = requiredOpaque(environment.CLOUDFLARE_ACCOUNT_ID);
  const apiToken = requiredOpaque(environment.CLOUDFLARE_API_TOKEN);
  const project = environment.PRODUCTION_CANDIDATE_PAGES_PROJECT?.trim();
  const releaseSha = environment.RELEASE_SHA?.trim().toLowerCase();
  const checkpoint = environment.PROJECT_ROOT_RECHECK_CHECKPOINT?.trim();

  if (
    project !== CANDIDATE_PROJECT ||
    releaseSha !== RC13_SHA ||
    !CHECKPOINTS.has(checkpoint)
  ) {
    throw new CandidatePagesProjectRootError("CANDIDATE_PROJECT_ROOT_INPUT_INVALID");
  }

  const cfGet = createCloudflareGetter({ apiToken, fetchImpl });
  const encodedProject = encodeURIComponent(project);
  const encodedLiveProject = encodeURIComponent(LIVE_PROJECT);
  const candidateProject = await cfGet(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodedProject}`,
    "CLOUDFLARE_PROJECT_READ_FAILED",
  );
  if (!validCandidateProject(candidateProject)) {
    throw new CandidatePagesProjectRootError(
      "CANDIDATE_PROJECT_IDENTITY_MISMATCH",
    );
  }

  const liveProject = await cfGet(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodedLiveProject}`,
    "LIVE_PROJECT_IDENTITY_UNPROVEN",
  );
  if (
    !plainObject(liveProject) ||
    liveProject.name !== LIVE_PROJECT ||
    liveProject.name === candidateProject.name
  ) {
    throw new CandidatePagesProjectRootError("CANDIDATE_PROJECT_NOT_ISOLATED");
  }

  const domains = await cfGet(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodedProject}/domains`,
    "CANDIDATE_CUSTOM_DOMAIN_INVENTORY_FAILED",
  );
  if (!Array.isArray(domains)) {
    throw new CandidatePagesProjectRootError(
      "CANDIDATE_CUSTOM_DOMAIN_INVENTORY_INVALID",
    );
  }
  if (domains.length !== 0) {
    throw new CandidatePagesProjectRootError("CANDIDATE_CUSTOM_DOMAIN_PRESENT");
  }

  const canonicalId = candidateProject.canonical_deployment?.id;
  if (!validOpaque(canonicalId)) {
    throw new CandidatePagesProjectRootError(
      "CANDIDATE_CANONICAL_DEPLOYMENT_INVALID",
    );
  }
  const deployments = await cfGet(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodedProject}/deployments?env=production&page=1&per_page=20`,
    "CANDIDATE_DEPLOYMENT_INVENTORY_FAILED",
  );
  if (!Array.isArray(deployments)) {
    throw new CandidatePagesProjectRootError(
      "CANDIDATE_DEPLOYMENT_INVENTORY_INVALID",
    );
  }
  const canonicalMatches = deployments.filter(
    (deployment) => deployment?.id === canonicalId,
  );
  if (
    canonicalMatches.length !== 1 ||
    !validRc12Deployment(canonicalMatches[0], canonicalId)
  ) {
    throw new CandidatePagesProjectRootError(
      "CANDIDATE_CANONICAL_DEPLOYMENT_MISMATCH",
    );
  }

  const deploymentDetail = await cfGet(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodedProject}/deployments/${encodeURIComponent(canonicalId)}`,
    "CANDIDATE_DEPLOYMENT_DETAIL_FAILED",
  );
  if (!validRc12Deployment(deploymentDetail, canonicalId)) {
    throw new CandidatePagesProjectRootError(
      "CANDIDATE_DEPLOYMENT_DETAIL_MISMATCH",
    );
  }

  const origin = `https://${CANDIDATE_PROJECT}.pages.dev`;
  await verifyPublicArtifact({
    origin,
    distDirectory,
    fetchImpl,
  });
  const finalProject = await cfGet(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodedProject}`,
    "CANDIDATE_PROJECT_STABILITY_READ_FAILED",
  );
  const finalDomains = await cfGet(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodedProject}/domains`,
    "CANDIDATE_PROJECT_STABILITY_READ_FAILED",
  );
  const finalDeployment = await cfGet(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodedProject}/deployments/${encodeURIComponent(canonicalId)}`,
    "CANDIDATE_PROJECT_STABILITY_READ_FAILED",
  );
  if (
    !validCandidateProject(finalProject) ||
    finalProject.canonical_deployment?.id !== canonicalId ||
    !Array.isArray(finalDomains) ||
    finalDomains.length !== 0 ||
    !validRc12Deployment(finalDeployment, canonicalId)
  ) {
    throw new CandidatePagesProjectRootError(
      "CANDIDATE_PROJECT_ROOT_DRIFT_DURING_VERIFICATION",
    );
  }

  emit(`CANDIDATE_PAGES_ORIGIN=${origin}`);
  emit("CANDIDATE_PROJECT_ROOT_VERIFIED=PASS");
  emit("CANDIDATE_PROJECT_ROOT_RELEASE_SHA=RC13");
  emit("CANDIDATE_PROJECT_ROOT_HTTP=PASS");
  emit("PAGES_PROJECT_ISOLATION=PASS");
  emit("LIVE_CUSTOM_DOMAIN_OWNERSHIP=NONE");
  emit("PAGES_API_CONFIGURATION=PASS");
  emit("PAGES_WORKSPACE_CONFIGURATION=PASS");
  emit(CHECKPOINTS.get(checkpoint));
  await appendOutput({ origin, githubOutput: environment.GITHUB_OUTPUT });
  return { origin, checkpoint };
}

export function emitCandidatePagesProjectRootFailure(
  error,
  emit = (line) => console.log(line),
) {
  const classification =
    error instanceof CandidatePagesProjectRootError
      ? error.classification
      : "CANDIDATE_PROJECT_ROOT_UNPROVEN";
  emit("CANDIDATE_PROJECT_ROOT_VERIFIED=FAIL");
  emit(`CANDIDATE_PROJECT_ROOT_FAILURE=${classification}`);
}

function createCloudflareGetter({ apiToken, fetchImpl }) {
  return async (path, classification) => {
    let response;
    try {
      response = await fetchImpl(`${API_BASE}${path}`, {
        method: "GET",
        headers: { authorization: `Bearer ${apiToken}` },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new CandidatePagesProjectRootError(classification);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new CandidatePagesProjectRootError(classification);
    }
    if (!response.ok || body?.success !== true) {
      throw new CandidatePagesProjectRootError(classification);
    }
    return body.result;
  };
}

async function verifyPublicArtifact({ origin, distDirectory, fetchImpl }) {
  const localRoot = resolve(distDirectory);
  const localHtml = await safeRead(joinWithin(localRoot, "index.html"));
  const localAssets = extractExecutableAssets(localHtml.toString("utf8"), origin);
  if (localAssets.javascript.length === 0 || localAssets.stylesheets.length === 0) {
    throw new CandidatePagesProjectRootError("LOCAL_CANDIDATE_ARTIFACT_INVALID");
  }

  const localJavascript = [];
  const localAssetDigests = new Map();
  for (const asset of [...localAssets.javascript, ...localAssets.stylesheets]) {
    const bytes = await safeRead(joinWithin(localRoot, asset.slice(1)));
    localAssetDigests.set(asset, digest(bytes));
    if (localAssets.javascript.includes(asset)) {
      localJavascript.push(bytes.toString("utf8"));
    }
  }
  const executable = localJavascript.join("\n");
  if (!executable.includes(CANDIDATE_API_BASE)) {
    throw new CandidatePagesProjectRootError(
      "CANDIDATE_API_CONFIGURATION_MISSING",
    );
  }
  if (!executable.includes(CANDIDATE_WORKSPACE_BASE_DOMAIN)) {
    throw new CandidatePagesProjectRootError(
      "CANDIDATE_WORKSPACE_CONFIGURATION_MISSING",
    );
  }

  await verifyReleaseManifest(fetchImpl, origin);

  const rootResponse = await publicGet(fetchImpl, new URL("/", origin));
  if (
    rootResponse.status !== 200 ||
    !rootResponse.headers.get("content-type")?.toLowerCase().startsWith("text/html")
  ) {
    throw new CandidatePagesProjectRootError("PROJECT_ROOT_HTTP_FAILED");
  }
  const remoteHtml = await rootResponse.text();
  const remoteAssets = extractExecutableAssets(remoteHtml, origin);
  if (
    !sameStrings(localAssets.javascript, remoteAssets.javascript) ||
    !sameStrings(localAssets.stylesheets, remoteAssets.stylesheets)
  ) {
    throw new CandidatePagesProjectRootError("PROJECT_ROOT_HTML_MISMATCH");
  }

  for (const asset of [...localAssets.javascript, ...localAssets.stylesheets]) {
    const response = await publicGet(fetchImpl, new URL(asset, origin));
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const expectedType = localAssets.javascript.includes(asset)
      ? /(?:javascript|ecmascript)/
      : /^text\/css(?:;|$)/;
    if (response.status !== 200 || !expectedType.test(contentType)) {
      throw new CandidatePagesProjectRootError("PROJECT_ROOT_ASSET_LOAD_FAILED");
    }
    const remoteBytes = Buffer.from(await response.arrayBuffer());
    if (digest(remoteBytes) !== localAssetDigests.get(asset)) {
      throw new CandidatePagesProjectRootError("PROJECT_ROOT_ARTIFACT_MISMATCH");
    }
  }
  await verifyReleaseManifest(fetchImpl, origin);
}

async function verifyReleaseManifest(fetchImpl, origin) {
  const manifestUrl = new URL("/release.json", origin);
  manifestUrl.searchParams.set(
    "oo_rc13_project_root_recheck",
    randomBytes(12).toString("hex"),
  );
  const manifestResponse = await publicGet(fetchImpl, manifestUrl);
  let manifest;
  try {
    manifest = await manifestResponse.json();
  } catch {
    throw new CandidatePagesProjectRootError(
      "PROJECT_ROOT_RELEASE_MANIFEST_INVALID",
    );
  }
  if (
    manifestResponse.status !== 200 ||
    manifest?.fullGitSha?.toLowerCase() !== RC13_SHA ||
    manifest?.artifact !== "pages"
  ) {
    throw new CandidatePagesProjectRootError(
      "PROJECT_ROOT_RELEASE_MANIFEST_MISMATCH",
    );
  }
}

async function publicGet(fetchImpl, url) {
  try {
    return await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new CandidatePagesProjectRootError("PROJECT_ROOT_HTTP_FAILED");
  }
}

function extractExecutableAssets(html, origin) {
  const javascript = [];
  const stylesheets = [];
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    const source = attribute(tag, "src");
    const href = attribute(tag, "href");
    const rel = attribute(tag, "rel")?.toLowerCase().split(/\s+/) ?? [];
    if (source && /^<script\b/i.test(tag)) {
      javascript.push(validAssetPath(source, origin, ".js"));
    }
    if (href && /^<link\b/i.test(tag) && rel.includes("stylesheet")) {
      stylesheets.push(validAssetPath(href, origin, ".css"));
    }
  }
  return {
    javascript: [...new Set(javascript)].sort(),
    stylesheets: [...new Set(stylesheets)].sort(),
  };
}

function attribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, "i"),
  );
  return match?.[1] ?? match?.[2];
}

function validAssetPath(value, origin, extension) {
  let url;
  try {
    url = new URL(value, origin);
  } catch {
    throw new CandidatePagesProjectRootError("PROJECT_ROOT_ASSET_URL_INVALID");
  }
  if (
    url.origin !== origin ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith("/assets/") ||
    !url.pathname.endsWith(extension)
  ) {
    throw new CandidatePagesProjectRootError("PROJECT_ROOT_ASSET_URL_INVALID");
  }
  return url.pathname;
}

function validRc12Deployment(deployment, expectedId) {
  return (
    plainObject(deployment) &&
    deployment.id === expectedId &&
    deployment.project_name === CANDIDATE_PROJECT &&
    deployment.environment === "production" &&
    deployment.is_skipped !== true &&
    deployment.latest_stage?.status === "success" &&
    deployment.deployment_trigger?.metadata?.branch === CANDIDATE_BRANCH &&
    deployment.deployment_trigger?.metadata?.commit_hash?.toLowerCase() ===
      RC13_SHA &&
    validDeploymentUrl(deployment.url)
  );
}

function validCandidateProject(project) {
  return (
    plainObject(project) &&
    project.name === CANDIDATE_PROJECT &&
    project.subdomain === `${CANDIDATE_PROJECT}.pages.dev` &&
    project.production_branch === CANDIDATE_BRANCH &&
    validOpaque(project.canonical_deployment?.id)
  );
}

function validDeploymentUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname !== `${CANDIDATE_PROJECT}.pages.dev` &&
      url.hostname.endsWith(`.${CANDIDATE_PROJECT}.pages.dev`) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/"
    );
  } catch {
    return false;
  }
}

function joinWithin(root, relativePath) {
  const path = resolve(root, relativePath);
  if (path !== root && !path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) {
    throw new CandidatePagesProjectRootError("LOCAL_CANDIDATE_ARTIFACT_INVALID");
  }
  return path;
}

async function safeRead(path) {
  try {
    return await readFile(path);
  } catch {
    throw new CandidatePagesProjectRootError("LOCAL_CANDIDATE_ARTIFACT_INVALID");
  }
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validOpaque(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\r\n]/.test(value)
  );
}

function requiredOpaque(value) {
  const normalized = value?.trim();
  if (!validOpaque(normalized)) {
    throw new CandidatePagesProjectRootError("CANDIDATE_PROJECT_ROOT_INPUT_INVALID");
  }
  return normalized;
}

async function appendGitHubOutput({ origin, githubOutput }) {
  if (!githubOutput) return;
  await appendFile(githubOutput, `origin=${origin}\n`);
}

function cliDistDirectory(argv) {
  const index = argv.indexOf("--dist");
  if (index === -1 || index === argv.length - 1 || argv.length !== 2) {
    throw new CandidatePagesProjectRootError("CANDIDATE_PROJECT_ROOT_INPUT_INVALID");
  }
  return resolve(argv[index + 1]);
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    await verifyCandidatePagesProjectRoot({
      distDirectory: cliDistDirectory(process.argv.slice(2)),
    });
  } catch (error) {
    emitCandidatePagesProjectRootFailure(error);
    process.exitCode = 1;
  }
}
