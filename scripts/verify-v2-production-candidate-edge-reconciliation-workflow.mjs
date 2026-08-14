import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflowPath = resolve(
  ".github/workflows/v2-production-candidate-edge-reconciliation.yml",
);
const workflow = readFileSync(workflowPath, "utf8");
const reconciliation = readFileSync(
  resolve("scripts/reconcile-v2-production-candidate-edge.mjs"),
  "utf8",
);

const requiredWorkflow = [
  "name: V2 Production Candidate Edge Reconciliation",
  "workflow_dispatch:",
  "permissions:\n  contents: read",
  "environment: production",
  "concurrency:\n  group: v2-isolated-production-candidate-tenant-router",
  "TARGET_RELEASE_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "TARGET_FIXTURE_HOSTNAME: rc9-release-31736285494-469ca8942a.next.labofscents.org",
  "TARGET_PAGES_PROJECT: olfactoryops-v2-production-candidate",
  "TARGET_ROUTER_SERVICE: olfactoryops-v2-tenant-router-production-candidate",
  "TARGET_HYPERDRIVE_ID: b415b7572d9f45058ebb4ec4166b8739",
  'test "$CONFIRM_RECONCILIATION" = "RECONCILE_RC9_CANDIDATE_EDGE"',
  'test "$(git rev-parse "$RELEASE_TAG^{}")" = "$TARGET_RELEASE_SHA"',
  'release_branch_sha="$(git rev-parse FETCH_HEAD)"',
  'test "$release_branch_sha" = "$TARGET_RELEASE_SHA"',
  "npm ci --ignore-scripts",
  "node scripts/reconcile-v2-production-candidate-edge.mjs pages-inventory",
  "node scripts/reconcile-v2-production-candidate-edge.mjs domain-preflight",
  "ref: ${{ needs.validate-edge-reconciliation-input.outputs.release_sha }}",
  "path: rc9",
  "npm ci --prefix rc9 --ignore-scripts",
  "node scripts/render-v2-production-candidate-edge-router-config.mjs",
  "npm --prefix rc9 run prisma:generate:v2",
  "./node_modules/.bin/wrangler deploy --strict --config wrangler.v2-tenant-router-production-candidate.toml",
  "node scripts/reconcile-v2-production-candidate-edge.mjs domain-verify",
  "node scripts/reconcile-v2-production-candidate-edge.mjs tenant-verify",
  "node scripts/reconcile-v2-production-candidate-edge.mjs postflight-inventory",
  "if: always()",
  "PRODUCTION_CANDIDATE_SMOKE_TENANT_URL",
  'test "$CANDIDATE_EDGE_RECONCILE_HYPERDRIVE_ID" = "$TARGET_HYPERDRIVE_ID"',
];

const forbiddenWorkflow = [
  "pull_request:",
  "pull_request_target:",
  "wrangler pages deploy",
  "PRODUCTION_DATABASE_URL",
  "gh variable",
  "gh secret",
  "api.labofscents.org/*",
  "labofscents.org/*",
  "*.labofscents.org/*",
  "*.next.labofscents.org/*",
  "workers/domains/",
  "DELETE",
  "BYPASSRLS",
  "SUPERUSER",
  "ALTER TABLE",
  "UPDATE v2_",
  "INSERT INTO",
  "DELETE FROM",
  "--keep-vars",
  "continue-on-error: true",
];

for (const value of requiredWorkflow)
  if (!workflow.includes(value))
    throw new Error(
      `candidate edge reconciliation workflow is missing ${value}`,
    );

for (const value of forbiddenWorkflow)
  if (workflow.includes(value))
    throw new Error(
      `candidate edge reconciliation workflow contains forbidden ${value}`,
    );

function stepSource(name) {
  const start = workflow.indexOf(`- name: ${name}`);
  const end = workflow.indexOf("\n      - name:", start + 1);
  if (start < 0) throw new Error(`candidate edge workflow is missing ${name}`);
  return workflow.slice(start, end < 0 ? undefined : end);
}

const inventoryStep = stepSource(
  "Inventory and select a healthy immutable RC9 Pages deployment",
);
if (
  inventoryStep.includes("if: always()") ||
  inventoryStep.includes("continue-on-error")
)
  throw new Error(
    "candidate Pages inventory must fail closed before Router work",
  );

const preflightIndex = workflow.indexOf("domain-preflight");
const deployIndex = workflow.indexOf("./node_modules/.bin/wrangler deploy");
const verifyIndex = workflow.indexOf("domain-verify");
const postflightIndex = workflow.indexOf("postflight-inventory");
const inventoryIndex = workflow.indexOf("pages-inventory");
const mainInstallIndex = workflow.indexOf("npm ci --ignore-scripts");
if (
  !(
    mainInstallIndex >= 0 &&
    inventoryIndex > mainInstallIndex &&
    preflightIndex > inventoryIndex &&
    deployIndex > preflightIndex &&
    verifyIndex > deployIndex &&
    postflightIndex > verifyIndex
  )
)
  throw new Error(
    "candidate Pages inventory, domain preflight, deploy, and verification ordering is unsafe",
  );

const protectedJobEnv = workflow.match(
  /reconcile-candidate-pages-and-router:[\s\S]*?environment: production\n    env:\n([\s\S]*?)\n    steps:/,
)?.[1];
if (
  !protectedJobEnv ||
  /CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN)/.test(protectedJobEnv)
)
  throw new Error(
    "Cloudflare credentials must not exist at protected job scope",
  );

for (const stepName of [
  "Inventory and select a healthy immutable RC9 Pages deployment",
  "Preflight only the exact candidate Custom Domain ownership",
  "Deploy only the exact RC9 candidate Router and Custom Domain",
  "Verify the exact Custom Domain now attaches only to the candidate Router",
  "Capture candidate-only edge state after reconciliation or failure",
]) {
  const step = stepSource(stepName);
  if (
    !step.includes("CLOUDFLARE_ACCOUNT_ID") ||
    !step.includes("CLOUDFLARE_API_TOKEN")
  )
    throw new Error(
      `Cloudflare credentials must be scoped only to ${stepName}`,
    );
}

for (const value of [
  'if (mode === "tenant-verify") return verifyTenantRoutes({});',
  'if (mode === "pages-inventory") return reconcilePagesInventory({ config });',
  "inspectPagesRequestLadder",
  "runWranglerPagesInventory",
  "localWranglerBinary",
  '"node_modules", "wrangler", "bin", "wrangler.js"',
  'WRANGLER_WRITE_LOGS: "false"',
  'WRANGLER_SEND_METRICS: "false"',
  'WRANGLER_SEND_ERROR_REPORTS: "false"',
  "PAGES_PROJECT_HTTP_STATUS",
  "PAGES_DEPLOYMENTS_BARE_HTTP_STATUS",
  "PAGES_DEPLOYMENTS_ENV_HTTP_STATUS",
  "PAGES_DEPLOYMENTS_PAGE20_HTTP_STATUS",
  "PAGES_DEPLOYMENTS_PAGE100_HTTP_STATUS",
  "PAGES_DEPLOYMENTS_HTTP_STATUS",
  "PAGES_DEPLOYMENTS_CF_ERROR_CODE",
  "PAGES_DEPLOYMENTS_PER_PAGE_100_REJECTED",
  "CUSTOM_REST_INVENTORY_REQUEST_DEFECT",
  "WRANGLER_PAGES_PROJECT_VISIBLE",
  "WRANGLER_PAGES_DEPLOYMENT_LIST",
  "WRANGLER_PAGES_DEPLOYMENT_COUNT",
  "WRANGLER_PAGES_FAILURE_CLASS",
  "detailsForWranglerCandidates",
  "PAGES_RC9_ARTIFACT_RELEASE_IDENTITY",
  "fullGitSha === edgeReleaseSha",
  'artifact === "pages"',
  "PAGES_RC9_MATCH_COUNT",
  "PAGES_RC9_SELECTED_IMMUTABLE_DEPLOYMENT",
  "PAGES_RC9_MULTIPLE_HEALTHY_DEPLOYMENTS",
  "PAGES_REDEPLOY_REQUIRED",
  "PAGES_INVENTORY_COMPLETENESS",
  "WRANGLER_PAGES_INVENTORY_INCOMPLETE",
  "inventoryComplete: false",
])
  if (!reconciliation.includes(value))
    throw new Error(`candidate Pages selection is missing ${value}`);

for (const value of [
  "npx wrangler",
  "console.log(result.stdout)",
  "console.log(error.message)",
  "console.error(error.message)",
  "PAGES_DEPLOYMENT_NOT_UNIQUE",
  "NODE_PATH",
])
  if (reconciliation.includes(value))
    throw new Error(`candidate Pages inventory has an unsafe ${value} path`);

const selectedOriginIndex = reconciliation.indexOf(
  "PAGES_RC9_SELECTED_IMMUTABLE_DEPLOYMENT",
);
const persistedOriginIndex = reconciliation.indexOf(
  "persistOrigin(origin, environment);",
);
if (
  selectedOriginIndex < 0 ||
  persistedOriginIndex < 0 ||
  persistedOriginIndex < selectedOriginIndex
)
  throw new Error(
    "candidate Pages origin must not be persisted before a healthy immutable deployment is selected",
  );

console.log("CANDIDATE_EDGE_RECONCILIATION_WORKFLOW=PASS");
console.log("CANDIDATE_EDGE_RECONCILIATION_SCOPE=CANDIDATE_ONLY");
