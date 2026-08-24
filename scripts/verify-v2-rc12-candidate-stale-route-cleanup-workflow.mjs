import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/v2-rc12-candidate-stale-route-cleanup.yml",
  "utf8",
);
const helper = readFileSync(
  "scripts/cleanup-v2-rc12-candidate-stale-route.mjs",
  "utf8",
);
const candidateWorkflow = readFileSync(
  ".github/workflows/v2-rc12-isolated-production-candidate.yml",
  "utf8",
);

function requireFragments(source, label, fragments) {
  for (const fragment of fragments)
    if (!source.includes(fragment))
      throw new Error(`${label} missing required fragment`);
}

function requireAbsent(source, label, pattern) {
  if (pattern.test(source)) throw new Error(`${label} contains forbidden scope`);
}

requireFragments(workflow, "RC12 stale-route cleanup workflow", [
  "name: V2 RC12 Candidate Stale Route Cleanup",
  "workflow_dispatch:",
  "contents: read",
  "group: v2-isolated-production-candidate-tenant-router",
  "cancel-in-progress: false",
  "environment: production",
  "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && github.ref_type == 'branch'",
  "DELETE_RC12_STALE_CANDIDATE_ROUTE",
  "TARGET_RELEASE_SHA: 331c1a6054fe1420b063a2e1fe9e5cef4f043ff8",
  "TARGET_RELEASE_TAG: v2-production-rc12",
  "TARGET_STALE_ROUTE_PATTERN: https://rc9-release-31736285494-469ca8942a.next.labofscents.org/*",
  "TARGET_CANDIDATE_ROUTER_SERVICE: olfactoryops-v2-tenant-router-production-candidate",
  "TARGET_LIVE_ROUTER_SERVICE: olfactoryops-v2-tenant-router-production",
  "node scripts/cleanup-v2-rc12-candidate-stale-route.mjs preflight",
  "node scripts/cleanup-v2-rc12-candidate-stale-route.mjs delete",
  "node scripts/cleanup-v2-rc12-candidate-stale-route.mjs verify",
  "ROUTE_DELETION_COUNT=(0|1)",
  "RC12_STALE_ROUTE_CLEANUP_RUNNER_LOCAL_CLEANUP=PASS",
]);

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
  throw new Error("RC12 stale-route cleanup must be workflow_dispatch-only");

const protectedJob = workflow.slice(
  workflow.indexOf("  delete-exact-stale-candidate-route:"),
);
if (
  /CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)/.test(
    protectedJob.slice(0, protectedJob.indexOf("    steps:")),
  )
)
  throw new Error("Cloudflare credentials must not be job-scoped");
const credentialReferences = protectedJob.match(
  /CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID):/g,
) ?? [];
if (credentialReferences.length !== 6)
  throw new Error("Cloudflare credentials must be scoped to exactly three steps");

const order = [
  "Prove exact candidate-only stale route and capture live preservation baseline",
  "Delete at most one freshly proven candidate-only stale route by exact ID",
  "Verify stale route absence, exact Custom Domain, RC12 fixture, and unchanged live routing",
  "Remove only runner-local stale-route cleanup state",
];
let previous = -1;
for (const step of order) {
  const index = workflow.indexOf(step);
  if (index <= previous) throw new Error("RC12 stale-route cleanup order is unsafe");
  previous = index;
}

requireAbsent(
  workflow,
  "RC12 stale-route cleanup workflow",
  /(?:wrangler\s+(?:deploy|delete|secret|pages)\b|\[\[routes\]\]|--keep-vars|\b(?:psql|prisma)\b|PRODUCTION_DATABASE_URL|DATABASE_URL|\bgh\s+(?:api|workflow|secret|variable)\b)/i,
);
if (/^\s*(?:routes|custom_domain)\s*=/im.test(workflow))
  throw new Error("RC12 stale-route cleanup must not declare Worker routes");
requireAbsent(
  helper,
  "RC12 stale-route cleanup helper",
  /(?:method:\s*"(?:POST|PUT|PATCH)"|wrangler|PRODUCTION_DATABASE_URL|DATABASE_URL|console\.(?:error|dir)|error\.message|response\.(?:text|arrayBuffer))/i,
);
requireFragments(helper, "RC12 stale-route cleanup helper", [
  'method: "DELETE"',
  "STALE_ROUTE_OWNERSHIP_UNPROVEN",
  "CUSTOM_DOMAIN_CHANGED_BEFORE_DELETE",
  "STALE_ROUTE_ID_CHANGED_BEFORE_DELETE",
  "STALE_ROUTE_DELETE_CONFIRMATION_FAILED",
  "LIVE_ROUTE_SET_UNCHANGED",
  "LIVE_TENANT_ROUTER_UNCHANGED",
  "PUBLIC_PRODUCTION_MUTATION",
]);
requireFragments(candidateWorkflow, "current RC12 candidate Router contract", [
  '`[[routes]]\\npattern = "${process.env.CANDIDATE_FIXTURE_HOSTNAME}"\\ncustom_domain = true`',
  "candidate router config could capture a public route or omit the exact fixture Custom Domain",
]);
if (
  candidateWorkflow.includes(
    "https://rc9-release-31736285494-469ca8942a.next.labofscents.org/*",
  )
)
  throw new Error("current RC12 contract must not declare the stale Zone Route");
if (
  /console\.log\([^\n]*(?:apiToken|accountId|zoneId|domainId|staleRouteId|route\.id)/.test(
    helper,
  )
)
  throw new Error("RC12 stale-route cleanup must not log credentials or opaque identifiers");

console.log("RC12_STALE_ROUTE_CLEANUP_WORKFLOW=PASS");
console.log("RC12_STALE_ROUTE_CANDIDATE_ONLY=PASS");
console.log("RC12_STALE_ROUTE_MAX_DELETION_ONE=PASS");
console.log("RC12_STALE_ROUTE_LIVE_PRESERVATION=PASS");
