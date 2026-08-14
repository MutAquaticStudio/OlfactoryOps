import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/v2-production-candidate-exact-route-override.yml",
  "utf8",
);
const helper = readFileSync(
  "scripts/override-v2-production-candidate-exact-route.mjs",
  "utf8",
);

function requireFragments(source, label, fragments) {
  for (const fragment of fragments)
    if (!source.includes(fragment))
      throw new Error(`${label} missing required fragment`);
}

function requireAbsent(source, label, pattern) {
  if (pattern.test(source))
    throw new Error(`${label} contains forbidden scope`);
}

requireFragments(workflow, "exact candidate route override workflow", [
  "name: V2 Production Candidate Exact Route Override",
  "workflow_dispatch:",
  "contents: read",
  "group: v2-isolated-production-candidate-tenant-router",
  "cancel-in-progress: false",
  "environment: production",
  "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && github.ref_type == 'branch'",
  "CREATE_RC9_EXACT_CANDIDATE_ROUTE",
  "TARGET_ROUTE_PATTERN: https://rc9-release-31736285494-469ca8942a.next.labofscents.org/*",
  "TARGET_ROUTER_SERVICE: olfactoryops-v2-tenant-router-production-candidate",
  "TARGET_RELEASE_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "node scripts/override-v2-production-candidate-exact-route.mjs preflight",
  "node scripts/override-v2-production-candidate-exact-route.mjs create",
  "node scripts/override-v2-production-candidate-exact-route.mjs verify",
  "node scripts/override-v2-production-candidate-exact-route.mjs rollback",
  "./node_modules/.bin/wrangler tail",
  '--format json --version-id "$ACTIVE_ROUTER_VERSION"',
  "sleep 60",
  "node scripts/reconcile-v2-production-candidate-edge.mjs tenant-verify",
  "EXACT_CANDIDATE_ROUTE_OVERRIDE_RUNNER_LOCAL_CLEANUP=PASS",
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
  throw new Error("exact route override must be workflow_dispatch-only");

const protectedJob = workflow.slice(
  workflow.indexOf("  override-exact-candidate-route:"),
);
if (
  /CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)/.test(
    protectedJob.slice(0, protectedJob.indexOf("    steps:")),
  )
)
  throw new Error("Cloudflare credentials must not be job-scoped");

const order = [
  "Prove exact candidate Router configuration and existing wildcard route before mutation",
  "Create only the exact candidate Route with bounded GET recovery",
  "Verify exact candidate route precedence and preserve the wildcard route",
  "Tail the exact active Router version and require one HTTP 200 candidate event",
  "Verify five tenant routes, caller header isolation, and unknown-host failure",
  "Roll back only the exact route created by this operation after an acceptance failure",
];
let previous = -1;
for (const step of order) {
  const index = workflow.indexOf(step);
  if (index <= previous)
    throw new Error("exact route override order is unsafe");
  previous = index;
}

requireAbsent(
  workflow,
  "exact candidate route override workflow",
  /(?:wrangler\s+(?:deploy|delete|secret|pages)\b|\[\[routes\]\]|custom_domain\s*=|routes\s*=|--keep-vars|\b(?:psql|prisma)\b|PRODUCTION_DATABASE_URL|DATABASE_URL|\bgh\s+(?:api|workflow|secret|variable)\b)/i,
);
requireAbsent(
  workflow,
  "exact candidate route override workflow",
  /(?:\*\.next\.labofscents\.org|\*\.labofscents\.org|api\.labofscents\.org)/i,
);
requireAbsent(
  helper,
  "exact candidate route override helper",
  /(?:method:\s*"PUT"|wrangler|workers\/domains\/[^"]+"\s*,\s*\{\s*method|PRODUCTION_DATABASE_URL|DATABASE_URL|console\.(?:error|dir)|error\.message)/i,
);
requireFragments(helper, "exact candidate route override helper", [
  'method: "POST"',
  'method: "DELETE"',
  "WILDCARD_ROUTE_CHANGED_BEFORE_CREATE",
  "EXACT_ROUTE_DUPLICATE_OR_MISMATCH",
  "EXACT_ROUTE_CREATE_UNACKNOWLEDGED",
  "ROLLBACK_EXACT_ROUTE_OWNERSHIP_UNPROVEN",
  "CANDIDATE_ROUTE_PRECEDENCE_OVERRIDE",
]);
if (
  /console\.log\([^\n]*(?:apiToken|accountId|zoneId|createdRouteId)/.test(
    helper,
  )
)
  throw new Error(
    "exact route override helper must not log credentials or opaque identifiers",
  );

console.log("EXACT_CANDIDATE_ROUTE_OVERRIDE_WORKFLOW=PASS");
console.log("EXACT_CANDIDATE_ROUTE_OVERRIDE_CANDIDATE_ONLY=PASS");
console.log("EXACT_CANDIDATE_ROUTE_OVERRIDE_ROLLBACK=PASS");
