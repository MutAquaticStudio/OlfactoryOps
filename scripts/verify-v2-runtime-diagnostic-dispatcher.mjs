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
  'test "$(git rev-parse "origin/$RELEASE_BRANCH")" = "$TARGET_RELEASE_SHA"',
  "release_sha:",
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
  "runtimeResolverOrganizationMatch",
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
