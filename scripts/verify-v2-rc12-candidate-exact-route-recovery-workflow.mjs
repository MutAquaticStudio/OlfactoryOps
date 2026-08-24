import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/v2-rc12-candidate-exact-route-recovery.yml",
  "utf8",
);
const helper = readFileSync(
  "scripts/restore-v2-rc12-candidate-exact-route.mjs",
  "utf8",
);

function requireFragments(source, label, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment))
      throw new Error(`${label} missing required fragment`);
  }
}

function requireAbsent(source, label, pattern) {
  if (pattern.test(source)) throw new Error(`${label} contains forbidden scope`);
}

requireFragments(workflow, "RC12 candidate route recovery workflow", [
  "name: V2 RC12 Candidate Exact Route Recovery",
  "workflow_dispatch:",
  "contents: read",
  "group: v2-isolated-production-candidate-tenant-router",
  "cancel-in-progress: false",
  "environment: production",
  "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && github.ref_type == 'branch'",
  "RESTORE_RC12_EXACT_CANDIDATE_ROUTE",
  "TARGET_RELEASE_SHA: 331c1a6054fe1420b063a2e1fe9e5cef4f043ff8",
  "TARGET_RELEASE_TAG: v2-production-rc12",
  "TARGET_EXACT_ROUTE_PATTERN: https://rc9-release-31736285494-469ca8942a.next.labofscents.org/*",
  "TARGET_CANDIDATE_ROUTER_SERVICE: olfactoryops-v2-tenant-router-production-candidate",
  "TARGET_LIVE_ROUTER_SERVICE: olfactoryops-v2-tenant-router-production",
  "node scripts/restore-v2-rc12-candidate-exact-route.mjs preflight",
  "node scripts/restore-v2-rc12-candidate-exact-route.mjs create",
  "node scripts/restore-v2-rc12-candidate-exact-route.mjs verify",
  "node scripts/restore-v2-rc12-candidate-exact-route.mjs rollback",
  "steps.verify.outcome != 'success'",
  "printf 'RC12_ROUTE_RECOVERY_DIR=%s\\n' \"$evidence_dir\" >> \"$GITHUB_ENV\"",
  "RC12_ROUTE_RECOVERY_RUNNER_LOCAL_CLEANUP=PASS",
]);

if (workflow.includes("${{ runner.temp }}"))
  throw new Error("runner context must not be evaluated at job scope");

const triggerBlock = workflow.slice(
  workflow.indexOf("on:"),
  workflow.indexOf("permissions:"),
);
const triggerKeys = [
  ...triggerBlock.matchAll(/^  ([A-Za-z][A-Za-z0-9_-]*):/gm),
].map((match) => match[1]);
if (
  !/^on:\s*\n\s+workflow_dispatch:\s*\n\s+inputs:/m.test(triggerBlock) ||
  triggerKeys.length !== 1 ||
  triggerKeys[0] !== "workflow_dispatch"
)
  throw new Error("RC12 candidate route recovery must be workflow_dispatch-only");

const protectedJob = workflow.slice(
  workflow.indexOf("  restore-exact-candidate-route:"),
);
if (
  /CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)/.test(
    protectedJob.slice(0, protectedJob.indexOf("    steps:")),
  )
)
  throw new Error("Cloudflare credentials must not be job-scoped");
const credentialReferences =
  protectedJob.match(/CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID):/g) ?? [];
if (credentialReferences.length !== 8)
  throw new Error("Cloudflare credentials must be scoped to exactly four steps");

const order = [
  "Prove the exact route is absent and capture immutable recovery boundaries",
  "Restore exactly one RC12 candidate Route after a fresh ownership recheck",
  "Verify exact RC12 fixture identity and unchanged live routing",
  "Roll back only the exact route created by this run when verification is not successful",
  "Remove only runner-local route recovery state",
];
let previous = -1;
for (const step of order) {
  const index = workflow.indexOf(step);
  if (index <= previous)
    throw new Error("RC12 candidate route recovery order is unsafe");
  previous = index;
}

requireAbsent(
  workflow,
  "RC12 candidate route recovery workflow",
  /(?:wrangler\s+(?:deploy|delete|secret|pages)\b|\[\[routes\]\]|--keep-vars|\b(?:psql|prisma)\b|PRODUCTION_DATABASE_URL|DATABASE_URL|\bgh\s+(?:api|workflow|secret|variable)\b)/i,
);
if (/^\s*(?:routes|custom_domain)\s*=/im.test(workflow))
  throw new Error("RC12 candidate route recovery must not declare Worker routes");

requireFragments(helper, "RC12 candidate route recovery helper", [
  'method: "POST"',
  'method: "DELETE"',
  "RECOVERY_ROUTE_PRECONDITION_FAILED",
  "RECOVERY_STATE_CHANGED_BEFORE_CREATE",
  "RECOVERY_ROUTE_CREATE_CONFIRMATION_FAILED",
  "RECOVERY_ROLLBACK_OWNERSHIP_UNPROVEN",
  "RECOVERY_ROLLBACK_CONFIRMATION_FAILED",
  "EXACT_FIXTURE_RELEASE_IDENTITY",
  "LIVE_ROUTE_SET_UNCHANGED",
  "LIVE_TENANT_ROUTER_UNCHANGED",
  "PUBLIC_PRODUCTION_MUTATION",
]);
requireAbsent(
  helper,
  "RC12 candidate route recovery helper",
  /(?:wrangler|PRODUCTION_DATABASE_URL|DATABASE_URL|console\.(?:error|dir)|error\.message|response\.(?:text|arrayBuffer)|method:\s*"(?:PUT|PATCH)")/i,
);

const postMethods = helper.match(/method:\s*"POST"/g) ?? [];
const deleteMethods = helper.match(/method:\s*"DELETE"/g) ?? [];
if (postMethods.length !== 1 || deleteMethods.length !== 1)
  throw new Error("recovery helper must contain one exact create and one rollback mutation");
if (
  /console\.log\([^\n]*(?:apiToken|accountId|zoneId|domainId|createdRouteId|route\.id)/.test(
    helper,
  )
)
  throw new Error("RC12 candidate route recovery must not log protected identifiers");

console.log("RC12_CANDIDATE_EXACT_ROUTE_RECOVERY_WORKFLOW=PASS");
console.log("RC12_CANDIDATE_EXACT_ROUTE_CREATE_ONCE=PASS");
console.log("RC12_CANDIDATE_EXACT_ROUTE_ROLLBACK=PASS");
console.log("RC12_CANDIDATE_EXACT_ROUTE_LIVE_PRESERVATION=PASS");
