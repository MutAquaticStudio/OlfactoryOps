import { readFileSync } from "node:fs";

const mode = process.argv[2];
const responsePath = process.env.ROUTER_REQUEST_PATH_DIAGNOSTIC_RESPONSE_FILE;
if (!responsePath) throw new Error("response file is required");

let response;
try {
  response = JSON.parse(readFileSync(responsePath, "utf8"));
} catch {
  console.log("ROUTER_REQUEST_PATH_DIAGNOSTIC_RESPONSE=FAIL");
  process.exitCode = 1;
  process.exit();
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

const readyKeys = ["candidateRouterRequestPathDiagnostic"];
const probeKeys = [
  "candidateRouterRequestPathDiagnostic",
  "probeTarget",
  "targetStatusClass",
  "targetRouterHeaderActive",
  "targetReleaseEnvironmentProduction",
  "targetReleaseShaMatch",
  "targetCacheControlPresent",
  "targetBodyClass",
];

if (mode === "ready") {
  if (
    !exactKeys(response, readyKeys) ||
    response.candidateRouterRequestPathDiagnostic !== "READY"
  ) {
    console.log("ROUTER_REQUEST_PATH_DIAGNOSTIC_READY=FAIL");
    process.exitCode = 1;
  }
  process.exit();
}

if (mode === "unavailable") {
  if (
    !exactKeys(response, readyKeys) ||
    response.candidateRouterRequestPathDiagnostic !== "UNAVAILABLE"
  ) {
    console.log("ROUTER_REQUEST_PATH_DIAGNOSTIC_UNAVAILABLE=FAIL");
    process.exitCode = 1;
  }
  process.exit();
}

if (!new Set(["target", "shadow"]).has(mode)) {
  console.log("ROUTER_REQUEST_PATH_DIAGNOSTIC_RESPONSE=FAIL");
  process.exitCode = 1;
  process.exit();
}

const expectedTarget = mode === "target" ? "TARGET_ROUTER" : "SHADOW_ROUTER";
const valid =
  exactKeys(response, probeKeys) &&
  response.candidateRouterRequestPathDiagnostic === "COMPLETE" &&
  response.probeTarget === expectedTarget &&
  ["2XX", "404", "503", "OTHER"].includes(response.targetStatusClass) &&
  typeof response.targetRouterHeaderActive === "boolean" &&
  typeof response.targetReleaseEnvironmentProduction === "boolean" &&
  typeof response.targetReleaseShaMatch === "boolean" &&
  typeof response.targetCacheControlPresent === "boolean" &&
  ["NOT_FOUND", "SERVICE_UNAVAILABLE", "OTHER"].includes(
    response.targetBodyClass,
  );
if (!valid) {
  console.log("ROUTER_REQUEST_PATH_DIAGNOSTIC_RESPONSE=FAIL");
  process.exitCode = 1;
  process.exit();
}

const prefix = mode === "target" ? "TARGET" : "SHADOW";
const statusClass = response.targetStatusClass;
const headerActive = response.targetRouterHeaderActive;
const releaseEnvironment = response.targetReleaseEnvironmentProduction;
const releaseSha = response.targetReleaseShaMatch;
const cacheControl = response.targetCacheControlPresent;
const bodyClass = response.targetBodyClass;
const probe =
  statusClass === "2XX" &&
  headerActive &&
  releaseEnvironment &&
  releaseSha &&
  cacheControl
    ? "PASS"
    : `FAIL_${statusClass}`;

console.log(`${prefix}_STATUS_CLASS=${statusClass}`);
console.log(`${prefix}_ROUTER_HEADER_ACTIVE=${headerActive ? "PASS" : "FAIL"}`);
console.log(
  `${prefix}_RELEASE_ENVIRONMENT_PRODUCTION=${releaseEnvironment ? "PASS" : "FAIL"}`,
);
console.log(`${prefix}_RELEASE_SHA_MATCH=${releaseSha ? "PASS" : "FAIL"}`);
console.log(
  `${prefix}_CACHE_CONTROL_PRESENT=${cacheControl ? "PASS" : "FAIL"}`,
);
console.log(`${prefix}_BODY_CLASS=${bodyClass}`);
console.log(
  `${mode === "target" ? "ACTUAL_ROUTER_SERVICE_BINDING_PROBE" : "EXACT_RC9_SHADOW_PROBE"}=${probe}`,
);
