import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(
    ".github/workflows/v2-production-candidate-router-request-path-diagnostic.yml",
  ),
  "utf8",
);
const caller = readFileSync(
  resolve("worker/v2-tenant-router-request-path-diagnostic.ts"),
  "utf8",
);
const callerTemplate = readFileSync(
  resolve("wrangler.v2-tenant-router-request-path-diagnostic.example.toml"),
  "utf8",
);
const callerRenderer = readFileSync(
  resolve("scripts/render-v2-tenant-router-request-path-diagnostic-config.mjs"),
  "utf8",
);
const shadowRenderer = readFileSync(
  resolve("scripts/render-v2-tenant-router-request-path-shadow-config.mjs"),
  "utf8",
);
const tailVerifier = readFileSync(
  resolve("scripts/verify-v2-router-request-path-tail.mjs"),
  "utf8",
);
const responseVerifier = readFileSync(
  resolve("scripts/verify-v2-router-request-path-diagnostic-response.mjs"),
  "utf8",
);
const classifier = readFileSync(
  resolve("scripts/classify-v2-router-request-path-diagnostic.mjs"),
  "utf8",
);

const requiredWorkflowFragments = [
  "workflow_dispatch:",
  "contents: read",
  "environment: production",
  "TARGET_RELEASE_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "EXPECTED_FIXTURE_HOSTNAME: rc9-release-31736285494-469ca8942a.next.labofscents.org",
  "EXPECTED_ROUTER_VERSION: 7640f2d6-0a0e-4fb8-81ed-22f6eb9a56bc",
  "EXPECTED_PRODUCTION_HYPERDRIVE_ID: b415b7572d9f45058ebb4ec4166b8739",
  "v2-production-rc9^{}",
  "TEMPORARY_DIAGNOSTIC_NAME_PREFLIGHT=PASS",
  "DIAGNOSTIC_CALLER_WORKER_PREFIX: oo-v2-router-service-diag",
  "DIAGNOSTIC_SHADOW_WORKER_PREFIX: oo-v2-router-rc9-shadow",
  "CREATED_SERVICE_DIAGNOSTIC_CALLER=false",
  "CREATED_SERVICE_DIAGNOSTIC_SHADOW=false",
  "git worktree add --detach",
  "npm ci --ignore-scripts",
  "require('./node_modules/pg/package.json').version",
  "= 8.13.0",
  "wrangler --version",
  "= 4.118.0",
  'npx wrangler tail "$CANDIDATE_ROUTER_SERVICE"',
  '--format json --version-id "$ACTIVE_ROUTER_VERSION"',
  "oo_router_path_diag",
  "id: phase_a",
  "TAIL_PUBLIC_PROBE_CONFIRMED=NO",
  "tail_evidence=PUBLIC_UNCONFIRMED",
  "tail_evidence=TAIL_STARTUP_FAILURE",
  "continue_to_service_probe=true",
  "tail_evidence=HOST_MISMATCH",
  "TARGET_ROUTER",
  'secret list --config "$V2_REQUEST_PATH_DIAGNOSTIC_CONFIG"',
  '"ROUTER_REQUEST_PATH_DIAGNOSTIC_TOKEN"',
  "id: phase_b",
  "actual_probe=$",
  "id: phase_b_version",
  "ROUTER_ACTIVE_DEPLOYMENT_ALLOW_MISMATCH=true",
  "ACTIVE_ROUTER_VERSION_CHANGED_DURING_SERVICE_PROBE",
  "classify-v2-router-request-path-diagnostic.mjs",
  "ROUTER_REQUEST_PATH_TAIL_EVIDENCE",
  "ROUTER_REQUEST_PATH_ACTUAL_PROBE",
  "ROUTER_REQUEST_PATH_ACTIVE_VERSION_STABLE",
  "ROUTER_REQUEST_PATH_SHADOW_PROBE",
  "SHADOW_ROUTER",
  "workers_dev=false",
  "if: ${{ always() }}",
  "git worktree remove --force",
  "^oo-v2-router-(service-diag|rc9-shadow)-[0-9]+$",
  "delete_created_temporary_worker",
  "TEMP_SERVICE_DIAGNOSTIC_CLEANUP",
  "TEMP_SHADOW_ROUTER_CLEANUP",
  "TEMP_RC9_WORKTREE_CLEANUP",
];
for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment))
    throw new Error(
      `router request-path workflow missing required contract: ${fragment}`,
    );
}

if (
  /(?:workers\/domains|workers\/routes|gh\s+(?:secret|variable)|PRODUCTION_DATABASE_URL|BEGIN\s+READ\s+ONLY|\b(?:INSERT|UPDATE|DELETE\s+FROM|ALTER)\s+(?:TABLE|ROLE|public\.v2_))/i.test(
    workflow,
  )
)
  throw new Error(
    "router request-path workflow must not mutate public routing, Environment values, or PostgreSQL",
  );
if (
  workflow.includes("env.TAIL_CONTINUE_TO_SERVICE_PROBE") ||
  workflow.includes("env.ACTUAL_ROUTER_SERVICE_BINDING_PROBE")
)
  throw new Error(
    "router request-path phase gates must use explicit step outputs, not dynamically written environment values",
  );
if (
  /^\s*chmod\s+600\s+\.qa\s*$/m.test(workflow) ||
  !/^\s*chmod\s+700\s+\.qa\s*$/m.test(workflow)
)
  throw new Error(
    "router request-path workflow must retain directory traversal for its protected runner-local evidence directory",
  );
if (
  workflow.includes("public_response") ||
  !workflow.includes("--output /dev/null") ||
  !workflow.includes("CREATED_SERVICE_DIAGNOSTIC_CALLER=true") ||
  !workflow.includes("CREATED_SERVICE_DIAGNOSTIC_SHADOW=true") ||
  !workflow.includes("steps.phase_b_version.outputs.active_version_stable")
)
  throw new Error(
    "router request-path workflow must prove the public probe, retain only run-created Workers, and recheck the active version after service binding",
  );
if (/^\s*(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/m.test(callerTemplate))
  throw new Error(
    "temporary caller config must be route-free without a Custom Domain",
  );
if (!/^workers_dev\s*=\s*true$/m.test(callerTemplate))
  throw new Error("temporary caller config must use workers.dev only");
if (
  !callerTemplate.includes('binding = "TARGET_ROUTER"') ||
  !callerTemplate.includes(
    'service = "olfactoryops-v2-tenant-router-production-candidate"',
  )
)
  throw new Error(
    "temporary caller must bind only the exact candidate Router service",
  );
if (
  !caller.includes('if (path === "/ready")') ||
  !caller.includes('if (path !== "/probe") return notFound()') ||
  caller.includes("new Headers(request.headers)") ||
  caller.includes("targetResponse.text()") ||
  !caller.includes("new Request(targetUrl") ||
  !caller.includes('redirect: "manual"')
)
  throw new Error(
    "caller must have only authenticated ready/probe paths and no caller header forwarding",
  );
if (
  !caller.includes('candidateRouterRequestPathDiagnostic: "READY"') ||
  !caller.includes('candidateRouterRequestPathDiagnostic: "UNAVAILABLE"') ||
  !caller.includes("targetBodyClass") ||
  !responseVerifier.includes("exactKeys") ||
  !tailVerifier.includes("TAIL_EVENT_CAPTURED") ||
  !tailVerifier.includes("TAIL_READINESS") ||
  !tailVerifier.includes("TAIL_VERSION_FILTER_APPLIED") ||
  !tailVerifier.includes("oo_router_path_diag")
)
  throw new Error(
    "diagnostic response and tail contracts must be safe and bounded",
  );
if (
  !callerRenderer.includes("includeShadow") ||
  !callerRenderer.includes('binding = "SHADOW_ROUTER"') ||
  !shadowRenderer.includes("shadowWorkerName") ||
  !shadowRenderer.includes("workers_dev = false") ||
  !workflow.includes("$RC9_SHADOW_WORKTREE/node_modules/.bin/wrangler")
)
  throw new Error(
    "exact RC9 shadow must be service-bound only and lockfile-validated",
  );
if (
  workflow.includes("olfactoryops-v2-tenant-router-production-candidate") &&
  !workflow.includes(
    "CANDIDATE_ROUTER_SERVICE: olfactoryops-v2-tenant-router-production-candidate",
  )
)
  throw new Error(
    "candidate Router reference must remain a read-only service binding target",
  );
if (
  !callerRenderer.includes("callerWorkerName") ||
  !callerRenderer.includes("shadowWorkerName") ||
  !callerTemplate.includes("REPLACE_WITH_DIAGNOSTIC_CALLER_WORKER_NAME")
)
  throw new Error(
    "temporary Workers must use run-scoped names before any deployment attempt",
  );

for (const classification of [
  "CUSTOM_DOMAIN_CONTROL_PLANE_ROUTING_DRIFT",
  "CUSTOM_DOMAIN_REQUEST_HOST_TRANSFORMATION",
  "CUSTOM_DOMAIN_EDGE_ONLY_DISCREPANCY",
  "CANDIDATE_ROUTER_WORKER_RESOURCE_STATE_DRIFT",
  "RC9_RUNTIME_BEHAVIOR_REPRODUCIBLE",
  "RC9_HYPERDRIVE_ROUTER_RUNTIME_FAILURE_REPRODUCIBLE",
  "RC10_REQUIRED",
]) {
  if (!classifier.includes(classification))
    throw new Error(
      `router request-path classifier missing safe evidence branch: ${classification}`,
    );
}

console.log("ROUTER_REQUEST_PATH_DIAGNOSTIC_CONTRACT=PASS");
console.log("ROUTER_REQUEST_PATH_DIAGNOSTIC_ROUTE_FREE=PASS");
console.log("ROUTER_REQUEST_PATH_DIAGNOSTIC_CLEANUP=PASS");
