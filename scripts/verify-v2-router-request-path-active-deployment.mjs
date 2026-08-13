import { readFileSync } from "node:fs";

const deploymentFile = process.env.ROUTER_ACTIVE_DEPLOYMENT_FILE;
const expectedVersion = process.env.ROUTER_EXPECTED_VERSION;
const allowMismatch =
  process.env.ROUTER_ACTIVE_DEPLOYMENT_ALLOW_MISMATCH === "true";
if (!deploymentFile || !/^[0-9a-f-]{36}$/i.test(expectedVersion ?? "")) {
  console.log("ACTIVE_ROUTER_DEPLOYMENT_READ=FAIL");
  console.log("ACTIVE_ROUTER_VERSION_MATCH=FAIL");
  process.exitCode = 1;
  process.exit();
}

let body;
try {
  body = JSON.parse(readFileSync(deploymentFile, "utf8"));
} catch {
  console.log("ACTIVE_ROUTER_DEPLOYMENT_READ=FAIL");
  console.log("ACTIVE_ROUTER_VERSION_MATCH=FAIL");
  process.exitCode = 1;
  process.exit();
}

const active = body?.result?.deployments?.[0];
const versions = Array.isArray(active?.versions) ? active.versions : [];
const match =
  body?.success === true &&
  versions.length === 1 &&
  versions[0]?.version_id === expectedVersion &&
  versions[0]?.percentage === 100;
console.log("ACTIVE_ROUTER_DEPLOYMENT_READ=PASS");
console.log(`ACTIVE_ROUTER_VERSION_MATCH=${match ? "PASS" : "FAIL"}`);
if (!match && !allowMismatch) process.exitCode = 1;
