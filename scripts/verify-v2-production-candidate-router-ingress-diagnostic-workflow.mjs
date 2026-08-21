import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(
    ".github/workflows/v2-production-candidate-router-ingress-diagnostic.yml",
  ),
  "utf8",
);
const inspector = readFileSync(
  resolve("scripts/inspect-v2-production-candidate-router-ingress.mjs"),
  "utf8",
);
const tail = readFileSync(
  resolve("scripts/verify-v2-production-candidate-router-ingress-tail.mjs"),
  "utf8",
);
const classifier = readFileSync(
  resolve("scripts/classify-v2-production-candidate-router-ingress.mjs"),
  "utf8",
);

function requireFragments(source, name, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment))
      throw new Error(`${name} missing required contract: ${fragment}`);
  }
}

function requireAbsent(source, name, expression) {
  if (expression.test(source))
    throw new Error(`${name} contains a forbidden mutation or disclosure path`);
}

requireFragments(workflow, "router ingress workflow", [
  "name: V2 Production Candidate Router Ingress Diagnostic",
  "workflow_dispatch:",
  "contents: read",
  "group: v2-isolated-production-candidate-tenant-router",
  "cancel-in-progress: false",
  "environment: production",
  "timeout-minutes: 5",
  "timeout-minutes: 12",
  "TARGET_RELEASE_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "TARGET_FIXTURE_HOSTNAME: rc9-release-31736285494-469ca8942a.next.labofscents.org",
  "TARGET_ROUTER_SERVICE: olfactoryops-v2-tenant-router-production-candidate",
  "TARGET_PAGES_ORIGIN: https://57b7300b.olfactoryops-v2-production-candidate.pages.dev",
  "TARGET_WORKSPACE_BASE_DOMAIN: next.labofscents.org",
  "TARGET_HYPERDRIVE_ID: b415b7572d9f45058ebb4ec4166b8739",
  "RELEASE_TAG: v2-production-rc9",
  "DIAGNOSE_RC9_ROUTER_INGRESS",
  "$RELEASE_TAG^{}",
  "npm ci --ignore-scripts",
  "./node_modules/.bin/wrangler tail",
  '--format json --version-id "$ACTIVE_ROUTER_VERSION"',
  "setsid timeout --signal=TERM 120s",
  "filter_sampling_window_elapsed=NO",
  "sleep 60",
  "--request GET --output /dev/null --write-out '%{http_code}'",
  "--max-time 20 --max-redirs 0",
  "Cache-Control: no-cache",
  "Pragma: no-cache",
  "oo_router_ingress_diag=$nonce",
  "ROUTER_INGRESS_RUNNER_LOCAL_CLEANUP=PASS",
  "inspect-v2-production-candidate-router-ingress.mjs deployment",
  "inspect-v2-production-candidate-router-ingress.mjs version",
  "verify-v2-production-candidate-router-ingress-tail.mjs",
  "classify-v2-production-candidate-router-ingress.mjs",
  "ROUTER_INGRESS_TAIL_CAPTURE_WINDOW_COMPLETED: ${{ steps.tail.outputs.capture_window_completed }}",
  "ROUTER_INGRESS_TAIL_FILTER_SAMPLING_WINDOW_ELAPSED: ${{ steps.tail.outputs.filter_sampling_window_elapsed }}",
  "copy_tail_output TAIL_FILTER_SAMPLING_WINDOW_ELAPSED filter_sampling_window_elapsed",
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
  throw new Error("router ingress workflow must be workflow_dispatch-only");

requireAbsent(
  workflow,
  "router ingress workflow",
  /(?:\bwrangler\s+(?:deploy|delete|secret|pages)\b|workers\/(?:domains|routes)|\[\[routes\]\]|custom_domain\s*=|routes\s*=|--keep-vars|\b(?:psql|prisma)\b|\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_]|ALTER\s+(?:TABLE|ROLE)|CREATE\s+(?:TABLE|ROLE|SCHEMA)|DROP\s+(?:TABLE|ROLE|SCHEMA))\b|git\s+worktree\s+(?:add|remove)|\bgh\s+(?:api|workflow|secret|variable)\b|PRODUCTION_DATABASE_URL|DATABASE_URL|V2_[A-Z_]*PEPPER|SCIENTIFIC_)/i,
);
requireAbsent(
  workflow,
  "router ingress workflow",
  /codex\/v2-production-go-live/,
);
requireAbsent(
  workflow,
  "router ingress workflow",
  /curl[^\n]*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b/i,
);
requireAbsent(
  workflow,
  "router ingress workflow",
  /(?:\bcat\s+[^\n]*(?:tail|deployments|version)|\btee\b|console\.error|error\.message|response\.(?:text|json))/i,
);

const protectedJob = workflow.slice(
  workflow.indexOf("  diagnose-candidate-router-ingress:"),
  workflow.indexOf(
    "    steps:",
    workflow.indexOf("  diagnose-candidate-router-ingress:"),
  ),
);
if (/CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)/.test(protectedJob))
  throw new Error("Cloudflare credentials must not be job-scoped");

const tokenRefs = workflow.match(
  /CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/g,
);
const accountRefs = workflow.match(
  /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/g,
);
if (tokenRefs?.length !== 3 || accountRefs?.length !== 3)
  throw new Error(
    "Cloudflare credentials must be scoped only to the three read-only API or tail steps",
  );

const installIndex = workflow.indexOf(
  "Install pinned main operations tooling without provider credentials",
);
const discoveryIndex = workflow.indexOf(
  "Read only the active candidate Router deployment and version bindings",
);
const tailIndex = workflow.indexOf(
  "Tail the discovered Router version and issue one exact public probe",
);
const recheckIndex = workflow.indexOf(
  "Re-read only the active Router deployment after the tail probe",
);
if (
  !(
    installIndex < discoveryIndex &&
    discoveryIndex < tailIndex &&
    tailIndex < recheckIndex
  )
)
  throw new Error(
    "router ingress workflow must inventory, tail, then re-check",
  );

const fixtureProbe =
  '"https://$TARGET_FIXTURE_HOSTNAME/?oo_router_ingress_diag=$nonce"';
if (workflow.split(fixtureProbe).length - 1 !== 1)
  throw new Error(
    "router ingress workflow must issue exactly one public fixture probe",
  );

const samplingWindowIndex = workflow.indexOf("sleep 60");
const fixtureProbeIndex = workflow.indexOf(fixtureProbe);
if (!(samplingWindowIndex >= 0 && samplingWindowIndex < fixtureProbeIndex))
  throw new Error(
    "router ingress workflow must complete the version-filter sampling window before probing",
  );

requireFragments(inspector, "router deployment inspector", [
  'strategy === "percentage"',
  "versions.length === 1",
  "Number(version?.percentage) === 100",
  "RELEASE_GIT_SHA",
  "PAGES_ORIGIN",
  "V2_WORKSPACE_BASE_DOMAIN",
  "RELEASE_ENVIRONMENT",
  "HYPERDRIVE",
  "ROUTER_VERSION_BINDINGS_COMPLETE",
]);
requireAbsent(
  inspector,
  "router deployment inspector",
  /console\.(?:error|dir)|error\.message|response\.(?:text|json)/i,
);

requireFragments(tail, "router ingress tail verifier", [
  "TAIL_VERSION_FILTER_APPLIED",
  "TAIL_FILTER_SAMPLING_WINDOW_ELAPSED",
  "TAIL_CAPTURE_WINDOW_COMPLETED",
  "oo_router_ingress_diag",
  "requestSchemeHttps",
  "requestMethodGet",
]);
requireAbsent(
  tail,
  "router ingress tail verifier",
  /console\.(?:error|dir)|error\.message|response\.(?:text|json)/i,
);

requireFragments(classifier, "router ingress classifier", [
  "CANDIDATE_ROUTER_RUNTIME_TENANT_RESOLUTION_PATH",
  "CANDIDATE_CUSTOM_DOMAIN_CONTROL_PLANE_ROUTING_DRIFT",
  "CANDIDATE_ROUTER_TAIL_CAPTURE_UNPROVEN",
  "CANDIDATE_ROUTER_TAIL_FILTER_UNPROVEN",
  "CANDIDATE_ROUTER_TAIL_FILTER_SAMPLING_UNPROVEN",
]);

console.log("ROUTER_INGRESS_DIAGNOSTIC_WORKFLOW=PASS");
console.log(
  "ROUTER_INGRESS_DIAGNOSTIC_NO_CANDIDATE_OR_PUBLIC_RESOURCE_MUTATION=PASS",
);
console.log("ROUTER_INGRESS_DIAGNOSTIC_SECRET_SCOPE=PASS");
