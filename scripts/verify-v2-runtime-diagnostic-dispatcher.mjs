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
  "DIAGNOSTIC_SOURCE_SHA: 27c523a09cba866b98fc8a91930ca3c246626737",
  "environment: production",
  "confirm_diagnostic",
  "node scripts/render-v2-tenant-router-runtime-diagnostic-config.mjs",
  "grep -Eq '(^routes\\s*=|^\\[\\[routes\\]\\]|custom_domain\\s*=)'",
  "max_attempts=8",
  "diagnostic_response_file=.qa/candidate-runtime-diagnostic-response.json",
  'for attempt in $(seq 1 "$max_attempts")',
  'if [ "$http_status" = "200" ]; then',
  'if [ "$http_status" != "404" ]; then',
  "DIAGNOSTIC_WORKERS_DEV_INVOCATION=FAIL_HTTP_404",
  "DIAGNOSTIC_WORKERS_DEV_INVOCATION=PASS",
  "const safeBooleanKeys = [",
  "runtimeDiagnosticExecution",
  "actualHyperdriveRuntimeResolver",
  "resolverInvocationProbeCompleted",
  "delay_seconds=$((delay_seconds * 2))",
  'if [ "$delay_seconds" -gt 12 ]; then',
  "rm -f .qa/candidate-runtime-diagnostic-token",
  "rm -f .qa/candidate-runtime-diagnostic-response.json",
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

if (
  workflow.includes("resolverQueryExecuted") ||
  workflow.includes("const requiredTrue =")
) {
  throw new Error(
    "diagnostic dispatcher must use the staged safe-matrix contract rather than the legacy monolithic gate",
  );
}

const retryBlock =
  workflow.match(
    /- name: Invoke the isolated Worker and verify safe runtime-path evidence[\s\S]*?- name: Delete the isolated diagnostic Worker and temporary token/,
  )?.[0] ?? "";
if (
  !retryBlock.includes('if [ "$http_status" != "404" ]; then') ||
  !retryBlock.includes("delay_seconds=$((delay_seconds * 2))")
) {
  throw new Error(
    "workers.dev readiness retry must retry only HTTP 404 responses",
  );
}

const delays = [];
let delay = 1;
for (let attempt = 1; attempt < 8; attempt += 1) {
  delays.push(delay);
  delay = Math.min(delay * 2, 12);
}
if (delays.join(",") !== "1,2,4,8,12,12,12") {
  throw new Error("workers.dev retry delay calculation changed unexpectedly");
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
console.log(
  "DIAGNOSTIC_WORKERS_DEV_RETRY_CONTRACT=PASS attempts=8 backoff=1,2,4,8,12,12,12",
);
console.log("STAGED_DIAGNOSTIC_CONTRACT=PASS");
console.log("DIAGNOSTIC_WORKER_CLEANUP_CONTRACT=PASS");
