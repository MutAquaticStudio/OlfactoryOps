import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  edgeFixtureHostname,
  edgeHyperdriveId,
  edgePagesProject,
  edgeReleaseSha,
  edgeWorkspaceBaseDomain,
} from "./reconcile-v2-production-candidate-edge.mjs";

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`missing ${name}`);
  return value;
}

function immutablePagesOrigin(value) {
  const parsed = new URL(value);
  const label = parsed.hostname.split(".")[0];
  if (
    parsed.protocol !== "https:" ||
    !/^[a-z0-9]{8}$/.test(label) ||
    parsed.hostname !== `${label}.${edgePagesProject}.pages.dev` ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  )
    throw new Error(
      "candidate Pages origin is not an immutable isolated deployment",
    );
  return parsed.origin;
}

export function renderCandidateEdgeRouterConfig({
  environment = process.env,
  readFile = readFileSync,
  writeFile = writeFileSync,
  exists = existsSync,
} = {}) {
  const templatePath = required(
    environment,
    "CANDIDATE_EDGE_RECONCILE_TEMPLATE",
  );
  const outputPath = required(environment, "CANDIDATE_EDGE_RECONCILE_OUTPUT");
  const releaseSha = required(
    environment,
    "CANDIDATE_EDGE_RECONCILE_RELEASE_SHA",
  );
  const fixtureHostname = required(
    environment,
    "CANDIDATE_EDGE_RECONCILE_FIXTURE_HOSTNAME",
  );
  const hyperdriveId = required(
    environment,
    "CANDIDATE_EDGE_RECONCILE_HYPERDRIVE_ID",
  );
  const pagesOrigin = immutablePagesOrigin(
    required(environment, "CANDIDATE_PAGES_ORIGIN"),
  );
  if (releaseSha !== edgeReleaseSha) throw new Error("release SHA must be RC9");
  if (fixtureHostname !== edgeFixtureHostname)
    throw new Error("fixture hostname must be the exact RC9 candidate fixture");
  if (hyperdriveId !== edgeHyperdriveId)
    throw new Error("Hyperdrive ID must be the approved production binding");

  let config = readFile(templatePath, "utf8");
  config = config.replace(
    'name = "olfactoryops-v2-tenant-router-production"',
    'name = "olfactoryops-v2-tenant-router-production-candidate"',
  );
  config = config.replace(
    'routes = [{ pattern = "*.labofscents.org/*", zone_name = "labofscents.org" }]',
    `[[routes]]\npattern = "${fixtureHostname}"\ncustom_domain = true`,
  );
  config = config.replaceAll("REPLACE_WITH_VERIFIED_RELEASE_SHA", releaseSha);
  config = config.replaceAll(
    "REPLACE_WITH_PRODUCTION_HYPERDRIVE_ID",
    hyperdriveId,
  );
  config = config.replace(
    "https://REPLACE_WITH_PRODUCTION_PAGES_ORIGIN",
    pagesOrigin,
  );
  config = config.replace(
    'V2_WORKSPACE_BASE_DOMAIN = "labofscents.org"',
    `V2_WORKSPACE_BASE_DOMAIN = "${edgeWorkspaceBaseDomain}"`,
  );
  if (
    config.includes("*.labofscents.org/*") ||
    config.includes("*.next.labofscents.org/*") ||
    config.includes("REPLACE_WITH_") ||
    !config.includes(`pattern = "${fixtureHostname}"`) ||
    !config.includes("custom_domain = true") ||
    !config.includes(`PAGES_ORIGIN = "${pagesOrigin}"`) ||
    !config.includes(`RELEASE_GIT_SHA = "${releaseSha}"`) ||
    !config.includes(`V2_WORKSPACE_BASE_DOMAIN = "${edgeWorkspaceBaseDomain}"`)
  )
    throw new Error(
      "candidate Router config violates the exact RC9 edge boundary",
    );

  writeFile(outputPath, config, "utf8");
  const main = config.match(/^main\s*=\s*"([^"]+)"\s*$/m)?.[1];
  const resolvedMain = main
    ? resolve(dirname(resolve(outputPath)), main)
    : undefined;
  if (!resolvedMain || !exists(resolvedMain))
    throw new Error("candidate Router entrypoint is unavailable");
  const relativeMain = relative(
    dirname(resolve(outputPath)),
    resolvedMain,
  ).replaceAll("\\", "/");
  console.log("CANDIDATE_EDGE_ROUTER_CONFIG=PASS");
  console.log(`CANDIDATE_EDGE_ROUTER_ENTRYPOINT=${relativeMain}`);
  return { config, pagesOrigin, relativeMain };
}

if (import.meta.main)
  try {
    renderCandidateEdgeRouterConfig();
  } catch {
    console.log("CANDIDATE_EDGE_ROUTER_CONFIG=FAIL");
    process.exitCode = 1;
  }
