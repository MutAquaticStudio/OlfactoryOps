import { readFileSync } from "node:fs";

export const routerIngressExpectation = Object.freeze({
  releaseSha: "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  pagesOrigin:
    "https://57b7300b.olfactoryops-v2-production-candidate.pages.dev",
  workspaceBaseDomain: "next.labofscents.org",
  hyperdriveId: "b415b7572d9f45058ebb4ec4166b8739",
});

const versionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validVersionId(value) {
  return typeof value === "string" && versionIdPattern.test(value);
}

function exactBinding(bindings, name, type) {
  const namedBindings = bindings.filter((binding) => binding?.name === name);
  return namedBindings.length === 1 && namedBindings[0]?.type === type
    ? namedBindings[0]
    : undefined;
}

export function inspectActiveRouterDeployment(response) {
  const deployments =
    response?.success === true ? response?.result?.deployments : undefined;
  const active = Array.isArray(deployments) ? deployments[0] : undefined;
  const versions = Array.isArray(active?.versions) ? active.versions : [];
  const version = versions.length === 1 ? versions[0] : undefined;
  const inventoryRead = Array.isArray(deployments) && deployments.length > 0;
  const singleVersion =
    inventoryRead && active?.strategy === "percentage" && versions.length === 1;
  const valid =
    singleVersion &&
    validVersionId(version?.version_id) &&
    Number(version?.percentage) === 100;

  return {
    deploymentRead: inventoryRead,
    singleVersion,
    activeTraffic: valid,
    trafficSplit: inventoryRead
      ? valid
        ? "NOT_DETECTED"
        : "DETECTED"
      : "UNPROVEN",
    versionId: valid ? version.version_id.toLowerCase() : undefined,
  };
}

export function inspectActiveRouterVersion(
  response,
  { versionId, expectation = routerIngressExpectation } = {},
) {
  const result = response?.success === true ? response?.result : undefined;
  const bindings = Array.isArray(result?.resources?.bindings)
    ? result.resources.bindings
    : undefined;
  const detailRead =
    validVersionId(versionId) &&
    typeof result?.id === "string" &&
    result.id.toLowerCase() === versionId.toLowerCase() &&
    Array.isArray(bindings);

  if (!detailRead)
    return {
      detailRead: false,
      versionIdMatch: false,
      releaseShaMatch: false,
      pagesOriginMatch: false,
      workspaceBaseDomainMatch: false,
      hyperdriveMatch: false,
      bindingsComplete: false,
      configurationMatch: false,
    };

  const release = exactBinding(bindings, "RELEASE_GIT_SHA", "plain_text");
  const pages = exactBinding(bindings, "PAGES_ORIGIN", "plain_text");
  const workspace = exactBinding(
    bindings,
    "V2_WORKSPACE_BASE_DOMAIN",
    "plain_text",
  );
  const environment = exactBinding(
    bindings,
    "RELEASE_ENVIRONMENT",
    "plain_text",
  );
  const hyperdrive = exactBinding(bindings, "HYPERDRIVE", "hyperdrive");
  const releaseShaMatch = release?.text === expectation.releaseSha;
  const pagesOriginMatch = pages?.text === expectation.pagesOrigin;
  const workspaceBaseDomainMatch =
    workspace?.text === expectation.workspaceBaseDomain;
  const releaseEnvironmentMatch = environment?.text === "production";
  const hyperdriveMatch = hyperdrive?.id === expectation.hyperdriveId;
  const configurationMatch =
    releaseShaMatch &&
    pagesOriginMatch &&
    workspaceBaseDomainMatch &&
    releaseEnvironmentMatch &&
    hyperdriveMatch;

  return {
    detailRead: true,
    versionIdMatch: true,
    releaseShaMatch,
    pagesOriginMatch,
    workspaceBaseDomainMatch,
    releaseEnvironmentMatch,
    hyperdriveMatch,
    bindingsComplete: configurationMatch,
    configurationMatch,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function printDeployment(result) {
  console.log(
    `ROUTER_DEPLOYMENT_INVENTORY=${result.deploymentRead ? "PASS" : "FAIL"}`,
  );
  console.log(
    `CURRENT_ROUTER_DEPLOYMENT_READ=${result.deploymentRead ? "PASS" : "FAIL"}`,
  );
  console.log(
    `ROUTER_ACTIVE_DEPLOYMENT_SINGLE_VERSION=${result.singleVersion ? "PASS" : "FAIL"}`,
  );
  console.log(`ROUTER_TRAFFIC_SPLIT=${result.trafficSplit}`);
  console.log(
    `CURRENT_ROUTER_ACTIVE_TRAFFIC=${result.activeTraffic ? "PASS" : "FAIL"}`,
  );
  if (result.versionId)
    console.log(`CURRENT_ROUTER_VERSION_ID=${result.versionId}`);
}

function safeValue(match, expected) {
  return match ? expected : "MISMATCH";
}

function printVersion(result, versionId) {
  console.log(
    `CURRENT_ROUTER_VERSION_DETAIL_READ=${result.detailRead ? "PASS" : "FAIL"}`,
  );
  console.log(
    `CURRENT_ROUTER_VERSION_ID_MATCH=${result.versionIdMatch ? "PASS" : "FAIL"}`,
  );
  if (validVersionId(versionId))
    console.log(`CURRENT_ROUTER_VERSION_ID=${versionId}`);
  console.log(
    `CURRENT_ROUTER_RELEASE_SHA=${safeValue(result.releaseShaMatch, routerIngressExpectation.releaseSha)}`,
  );
  console.log(
    `CURRENT_ROUTER_RELEASE_SHA_MATCH=${result.releaseShaMatch ? "PASS" : "FAIL"}`,
  );
  console.log(
    `CURRENT_ROUTER_PAGES_ORIGIN=${safeValue(result.pagesOriginMatch, routerIngressExpectation.pagesOrigin)}`,
  );
  console.log(
    `CURRENT_ROUTER_PAGES_ORIGIN_MATCH=${result.pagesOriginMatch ? "PASS" : "FAIL"}`,
  );
  console.log(
    `CURRENT_ROUTER_WORKSPACE_BASE_DOMAIN=${safeValue(result.workspaceBaseDomainMatch, routerIngressExpectation.workspaceBaseDomain)}`,
  );
  console.log(
    `CURRENT_ROUTER_WORKSPACE_BASE_DOMAIN_MATCH=${result.workspaceBaseDomainMatch ? "PASS" : "FAIL"}`,
  );
  console.log(
    `CURRENT_ROUTER_HYPERDRIVE_ID=${safeValue(result.hyperdriveMatch, routerIngressExpectation.hyperdriveId)}`,
  );
  console.log(
    `CURRENT_ROUTER_HYPERDRIVE_MATCH=${result.hyperdriveMatch ? "PASS" : "FAIL"}`,
  );
  console.log(
    `ROUTER_VERSION_BINDINGS_COMPLETE=${result.bindingsComplete ? "PASS" : "FAIL"}`,
  );
  console.log(
    `CURRENT_ROUTER_CONFIGURATION=${result.configurationMatch ? "PASS" : "FAIL"}`,
  );
}

function fail(mode) {
  if (mode === "deployment") {
    printDeployment({
      deploymentRead: false,
      singleVersion: false,
      activeTraffic: false,
      trafficSplit: "UNPROVEN",
    });
  } else {
    printVersion(
      {
        detailRead: false,
        versionIdMatch: false,
        releaseShaMatch: false,
        pagesOriginMatch: false,
        workspaceBaseDomainMatch: false,
        hyperdriveMatch: false,
        bindingsComplete: false,
        configurationMatch: false,
      },
      process.env.ROUTER_INGRESS_VERSION_ID,
    );
  }
  process.exitCode = 1;
}

if (import.meta.main) {
  const mode = process.argv[2];
  try {
    if (mode === "deployment") {
      const result = inspectActiveRouterDeployment(
        readJson(process.env.ROUTER_INGRESS_DEPLOYMENT_FILE),
      );
      printDeployment(result);
      if (!result.deploymentRead) process.exitCode = 1;
    } else if (mode === "version") {
      const versionId = process.env.ROUTER_INGRESS_VERSION_ID;
      const result = inspectActiveRouterVersion(
        readJson(process.env.ROUTER_INGRESS_VERSION_FILE),
        { versionId },
      );
      printVersion(result, versionId);
      if (!result.configurationMatch) process.exitCode = 1;
    } else {
      fail(mode);
    }
  } catch {
    fail(mode);
  }
}
