import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflowPath = resolve(
  ".github/workflows/v2-production-candidate-runtime-path-diagnostic.yml",
);
const workflow = readFileSync(workflowPath, "utf8");
const worker = readFileSync(
  resolve("worker/v2-tenant-router-runtime-diagnostic.ts"),
  "utf8",
);
const template = readFileSync(
  resolve("wrangler.v2-tenant-router-runtime-diagnostic.example.toml"),
  "utf8",
);
const responseVerifier = readFileSync(
  resolve("scripts/verify-v2-runtime-diagnostic-response.mjs"),
  "utf8",
);
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
  "workflow_dispatch:",
  "contents: read",
  "TARGET_RELEASE_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "EXPECTED_FIXTURE_HOSTNAME: rc9-release-31736285494-469ca8942a.next.labofscents.org",
  "EXPECTED_PRODUCTION_HYPERDRIVE_ID: b415b7572d9f45058ebb4ec4166b8739",
  "v2-production-rc9^{}",
  "release_sha:",
  "environment: production",
  "confirm_diagnostic",
  "node scripts/render-v2-tenant-router-runtime-diagnostic-config.mjs",
  "node scripts/verify-v2-runtime-diagnostic-response.mjs ready",
  "node scripts/verify-v2-runtime-diagnostic-response.mjs matrix",
  "node scripts/verify-v2-runtime-diagnostic-response.mjs unavailable",
  "grep -Eq '(^routes\\s*=|^\\[\\[routes\\]\\]|custom_domain\\s*=)'",
  "readiness_window_seconds=90",
  "max_attempts=10",
  "max_request_timeout_seconds=15",
  "max_delay_seconds=12",
  "DIAGNOSTIC_READY_ATTEMPT=$attempt",
  "DIAGNOSTIC_READY_HTTP_STATUS=$http_status",
  "DIAGNOSTIC_WORKER_READINESS=PASS",
  "DIAGNOSTIC_WORKER_READINESS=FAIL",
  "ROOT_CAUSE=PERSISTENT_WORKER_STARTUP_OR_PLATFORM_FAILURE",
  'case "$http_status" in',
  "404|500|503)",
  'ready_url="${DIAGNOSTIC_WORKERS_DEV_URL}/ready"',
  'diagnose_url="${DIAGNOSTIC_WORKERS_DEV_URL}/diagnose"',
  "DIAGNOSTIC_EXECUTION_ESCAPED_SAFE_HANDLER=YES",
  "DIAGNOSTIC_SAFE_BOOLEAN_MATRIX=NOT_RECEIVED",
  "diagnostic_response_file=.qa/candidate-runtime-diagnostic-response.json",
  "delay_seconds=$((delay_seconds * 2))",
  "rm -f .qa/candidate-runtime-diagnostic-token",
  "rm -f .qa/candidate-runtime-diagnostic-ready-response.json",
  "rm -f .qa/candidate-runtime-diagnostic-response.json",
  "curl --silent --show-error --output /dev/null --write-out '%{http_code}'",
  "--request DELETE",
  "--data '{}'",
  'test "$worker_status" = "404"',
  "echo 'TEMPORARY_DIAGNOSTIC_WORKER_CLEANUP=PASS'",
  "echo 'ORPHAN_DIAGNOSTIC_WORKER_EXISTS=NO'",
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

if (workflow.includes("RELEASE_BRANCH")) {
  throw new Error("diagnostic dispatcher must use immutable RC9 tag validation");
}

if (
  workflow.includes("5985834a0e14728c81c8c028a72122ded544bd6b") ||
  workflow.includes("DIAGNOSTIC_SOURCE_SHA") ||
  workflow.includes("DIAGNOSTIC_SOURCE_BRANCH")
) {
  throw new Error(
    "diagnostic dispatcher must not retain RC2 or external-source pins",
  );
}

if (
  /(?:workers\/domains|workers\/routes|\.labofscents\.org\/\*)/.test(
    workflow,
  ) ||
  /^\s*(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/m.test(workflow)
) {
  throw new Error(
    "diagnostic dispatcher must remain workers.dev only without routes or custom domains",
  );
}

if (
  /(?:gh\s+variable|gh\s+secret|wrangler\s+secret\s+delete|\b(?:INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|ALTER\s+TABLE|GRANT\s+|REVOKE\s+))/i.test(
    workflow,
  )
) {
  throw new Error(
    "diagnostic dispatcher must not mutate environment metadata or PostgreSQL",
  );
}

const requiredWorkerFragments = [
  'await client.query("BEGIN READ ONLY")',
  'await client.query("ROLLBACK")',
  "V2_EXPECTED_ORGANIZATION_ID_SHA",
  "V2_EXPECTED_RUNTIME_ROLE_SHA",
  "runtimeResolverOrganizationMatch",
  "public.v2_resolve_active_workspace_hostname($1)",
  'candidateRuntimeDiagnostic: "READY"',
  'if (path === "/ready") return ready()',
  'if (path !== "/diagnose") return notFound()',
  'candidateRuntimeDiagnostic: "COMPLETE"',
  "safeBooleanMatrix",
];
for (const fragment of requiredWorkerFragments) {
  if (!worker.includes(fragment)) {
    throw new Error(
      `runtime diagnostic Worker missing required contract: ${fragment}`,
    );
  }
}

if (
  /(?:INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|ALTER\s+TABLE|GRANT\s+|REVOKE\s+)/i.test(
    worker,
  )
) {
  throw new Error("runtime diagnostic Worker must issue only read-only SQL");
}

if (
  !responseVerifier.includes('mode === "ready"') ||
  !responseVerifier.includes('mode === "unavailable"') ||
  !responseVerifier.includes('mode === "matrix"') ||
  !responseVerifier.includes("RUNTIME_DIAGNOSTIC_EXECUTION=") ||
  !responseVerifier.includes("ACTUAL_HYPERDRIVE_RUNTIME_RESOLVER=")
) {
  throw new Error(
    "runtime diagnostic response verifier must validate READY, UNAVAILABLE, and safe matrix contracts",
  );
}

if (
  /(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/.test(template) ||
  !/^workers_dev\s*=\s*true$/m.test(template)
) {
  throw new Error("runtime diagnostic template must be workers.dev only");
}

if (
  workflow.includes("resolverQueryExecuted") ||
  workflow.includes("const requiredTrue =")
) {
  throw new Error(
    "diagnostic dispatcher must use the staged safe-matrix contract rather than the legacy monolithic gate",
  );
}

const readinessBlock =
  workflow.match(
    /- name: Wait for isolated Worker readiness before database diagnosis[\s\S]*?- name: Invoke the ready isolated Worker once and verify safe runtime-path evidence/,
  )?.[0] ?? "";
if (
  !readinessBlock.includes("readiness_window_seconds=90") ||
  !readinessBlock.includes("max_attempts=10") ||
  !readinessBlock.includes("max_request_timeout_seconds=15") ||
  !readinessBlock.includes("404|500|503)") ||
  !readinessBlock.includes("DIAGNOSTIC_READY_ATTEMPT=$attempt") ||
  !readinessBlock.includes("DIAGNOSTIC_READY_HTTP_STATUS=$http_status") ||
  !readinessBlock.includes("delay_seconds=$((delay_seconds * 2))") ||
  readinessBlock.includes('if [ "$http_status" != "404" ]; then')
) {
  throw new Error(
    "workers.dev readiness must retry only 404, 500, and 503 within the bounded contract",
  );
}

const delays = [];
let delay = 1;
for (let attempt = 1; attempt < 10; attempt += 1) {
  delays.push(delay);
  delay = Math.min(delay * 2, 12);
}
if (delays.join(",") !== "1,2,4,8,12,12,12,12,12") {
  throw new Error("workers.dev retry delay calculation changed unexpectedly");
}

const diagnoseBlock =
  workflow.match(
    /- name: Invoke the ready isolated Worker once and verify safe runtime-path evidence[\s\S]*?- name: Delete the isolated diagnostic Worker and temporary token/,
  )?.[0] ?? "";
if (
  !diagnoseBlock.includes('"$diagnose_url"') ||
  diagnoseBlock.split('"$diagnose_url"').length - 1 !== 1 ||
  !diagnoseBlock.includes("DIAGNOSTIC_EXECUTION_ESCAPED_SAFE_HANDLER=YES") ||
  !diagnoseBlock.includes(
    "node scripts/verify-v2-runtime-diagnostic-response.mjs unavailable",
  )
) {
  throw new Error(
    "diagnose must run exactly once after readiness and classify escaped safe-handler failures",
  );
}

if (
  workflow.indexOf(
    "Wait for isolated Worker readiness before database diagnosis",
  ) >=
  workflow.indexOf(
    "Invoke the ready isolated Worker once and verify safe runtime-path evidence",
  )
) {
  throw new Error("diagnose must not be invoked before readiness succeeds");
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
  "DIAGNOSTIC_WORKERS_DEV_RETRY_CONTRACT=PASS attempts=10 window_seconds=90 backoff=1,2,4,8,12,12,12,12,12",
);
console.log("DIAGNOSTIC_TWO_STAGE_CONTRACT=PASS");
console.log("STAGED_DIAGNOSTIC_CONTRACT=PASS");
console.log("DIAGNOSTIC_WORKER_CLEANUP_CONTRACT=PASS");
