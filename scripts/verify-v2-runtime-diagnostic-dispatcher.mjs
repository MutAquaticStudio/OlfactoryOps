import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflowPath = resolve(
  ".github/workflows/v2-production-candidate-runtime-path-diagnostic.yml",
);
const workflow = readFileSync(workflowPath, "utf8");
const workerMatch = workflow.match(
  /^\s*DIAGNOSTIC_WORKER_NAME:\s*([^\s#]+)\s*$/m,
);

if (!workerMatch) throw new Error("DIAGNOSTIC_WORKER_NAME is required");

const workerName = workerMatch[1];
const validWorkerName = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
  workerName,
);
if (!validWorkerName || workerName.length > 63) {
  throw new Error(
    `DIAGNOSTIC_WORKER_NAME must be a valid workers.dev DNS label of at most 63 characters: ${workerName}`,
  );
}

const requiredFragments = [
  "TARGET_RELEASE_SHA: 5985834a0e14728c81c8c028a72122ded544bd6b",
  "DIAGNOSTIC_SOURCE_SHA: 4f5b9e9b92a9f1880a06dbcf622fbcaa57fc2cbe",
  "environment: production",
  "confirm_diagnostic",
  "node scripts/render-v2-tenant-router-runtime-diagnostic-config.mjs",
  "grep -Eq '(^routes\\s*=|^\\[\\[routes\\]\\]|custom_domain\\s*=)'",
  "rm -f .qa/candidate-runtime-diagnostic-token",
  "curl --silent --show-error --output /dev/null --write-out '%{http_code}'",
  "--request DELETE",
  "--data '{}'",
  'test "$worker_status" = "404"',
  "echo 'DIAGNOSTIC_WORKER_CLEANUP=PASS'",
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment))
    throw new Error(
      `diagnostic dispatcher missing required contract: ${fragment}`,
    );
}

if (workflow.includes("wrangler delete")) {
  throw new Error(
    "diagnostic cleanup must use the direct Workers Scripts DELETE API, never wrangler delete",
  );
}

const deletePath = "workers/scripts/$DIAGNOSTIC_WORKER_NAME";
const cleanupBlock =
  workflow.match(
    /- name: Delete the isolated diagnostic Worker and temporary token[\s\S]*$/,
  )?.[0] ?? "";
if (
  !cleanupBlock.includes(deletePath) ||
  !cleanupBlock.includes("--request DELETE")
) {
  throw new Error(
    "diagnostic cleanup must target only the exact configured Worker script",
  );
}

console.log(
  `DIAGNOSTIC_WORKER_NAME_LENGTH_GATE=PASS name=${workerName} length=${workerName.length}`,
);
console.log("DIAGNOSTIC_WORKER_CLEANUP_CONTRACT=PASS");
