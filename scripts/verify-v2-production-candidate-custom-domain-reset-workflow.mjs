import { readFileSync } from "node:fs";

const workflowPath =
  ".github/workflows/v2-production-candidate-custom-domain-reset.yml";
const workflow = readFileSync(workflowPath, "utf8");
const resetScript = readFileSync(
  "scripts/reset-v2-production-candidate-custom-domain.mjs",
  "utf8",
);

function requireFragments(source, label, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment))
      throw new Error(`${label} missing required fragment`);
  }
}

function requireAbsent(source, label, pattern) {
  if (pattern.test(source))
    throw new Error(`${label} contains forbidden scope`);
}

requireFragments(workflow, "candidate Custom Domain reset workflow", [
  "name: V2 Production Candidate Custom Domain Reset",
  "workflow_dispatch:",
  "contents: read",
  "group: v2-isolated-production-candidate-tenant-router",
  "cancel-in-progress: false",
  "environment: production",
  "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && github.ref_type == 'branch'",
  "timeout-minutes: 5",
  "timeout-minutes: 25",
  "TARGET_RELEASE_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "TARGET_FIXTURE_HOSTNAME: rc9-release-31736285494-469ca8942a.next.labofscents.org",
  "TARGET_ROUTER_SERVICE: olfactoryops-v2-tenant-router-production-candidate",
  "TARGET_PAGES_ORIGIN: https://57b7300b.olfactoryops-v2-production-candidate.pages.dev",
  "RELEASE_BRANCH: codex/v2-production-go-live",
  "RELEASE_TAG: v2-production-rc9",
  "RESET_RC9_CANDIDATE_CUSTOM_DOMAIN",
  "node scripts/reset-v2-production-candidate-custom-domain.mjs preflight",
  "node scripts/reset-v2-production-candidate-custom-domain.mjs detach",
  "node scripts/reset-v2-production-candidate-custom-domain.mjs wait-detached",
  "node scripts/reset-v2-production-candidate-custom-domain.mjs reattach",
  "node scripts/reset-v2-production-candidate-custom-domain.mjs wait-attached",
  "node scripts/reset-v2-production-candidate-custom-domain.mjs restore",
  "node scripts/reset-v2-production-candidate-custom-domain.mjs postflight",
  "./node_modules/.bin/wrangler tail",
  '--format json --version-id "$ACTIVE_ROUTER_VERSION"',
  "setsid timeout --signal=TERM 45s",
  "TAIL_EVENT_CAPTURED YES",
  "TAIL_EVENT_HTTP_STATUS 200",
  "CANDIDATE_CUSTOM_DOMAIN_EDGE_READINESS=PASS",
  "node scripts/reconcile-v2-production-candidate-edge.mjs tenant-verify",
  "CANDIDATE_CUSTOM_DOMAIN_RESET_RUNNER_LOCAL_CLEANUP=PASS",
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
  throw new Error(
    "candidate Custom Domain reset must be workflow_dispatch-only",
  );

const protectedJob = workflow.slice(
  workflow.indexOf("  reset-candidate-custom-domain:"),
  workflow.indexOf(
    "    steps:",
    workflow.indexOf("  reset-candidate-custom-domain:"),
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
if (tokenRefs?.length !== 10 || accountRefs?.length !== 10)
  throw new Error(
    "Cloudflare credentials must be scoped only to the reset, verification, and tail steps",
  );

const orderedSteps = [
  "Create protected runner-local Custom Domain reset evidence directory",
  "Preflight exact candidate Custom Domain ownership",
  "Read only and require the active RC9 candidate Router configuration before reset",
  "Detach only the verified exact candidate Custom Domain",
  "Confirm exact candidate Custom Domain detach within the bounded window",
  "Reattach only the exact candidate hostname to the exact Router",
  "Confirm exact candidate Custom Domain attachment within the bounded window",
  "Wait only within the bounded candidate edge readiness window",
  "Tail the verified active Router version and require one candidate event",
  "Re-read the active Router deployment after the reset tail probe",
  "Verify all exact tenant routes, trusted header handling, and unknown-host failure",
];
let previousIndex = -1;
for (const name of orderedSteps) {
  const index = workflow.indexOf(name);
  if (index <= previousIndex)
    throw new Error("candidate Custom Domain reset order is unsafe");
  previousIndex = index;
}

requireFragments(workflow, "candidate Custom Domain reset recovery", [
  "if: always() && steps.preflight.outcome == 'success' && steps.wait-attached.outcome != 'success'",
  "Restore the exact candidate Custom Domain only if attachment recovery failed",
  "Capture only candidate Custom Domain state after reset or recovery",
  "Remove only runner-local candidate Custom Domain reset evidence",
]);
if (
  /CANDIDATE_DOMAIN_RESET_(?:DOMAIN_ID|ZONE_ID):\s*\$\{\{\s*steps\.preflight\.outputs\./.test(
    workflow,
  )
)
  throw new Error(
    "opaque Custom Domain identifiers must not pass through GitHub step outputs",
  );

requireAbsent(
  workflow,
  "candidate Custom Domain reset workflow",
  /(?:\bwrangler\s+(?:deploy|delete|secret|pages)\b|workers\/(?:routes)|\[\[routes\]\]|custom_domain\s*=|routes\s*=|--keep-vars|\b(?:psql|prisma)\b|\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_]|ALTER\s+(?:TABLE|ROLE)|CREATE\s+(?:TABLE|ROLE|SCHEMA)|DROP\s+(?:TABLE|ROLE|SCHEMA))\b|git\s+worktree\s+(?:add|remove)|\bgh\s+(?:api|workflow|secret|variable)\b|PRODUCTION_DATABASE_URL|DATABASE_URL|V2_[A-Z_]*PEPPER|SCIENTIFIC_)/i,
);
requireAbsent(
  workflow,
  "candidate Custom Domain reset workflow",
  /(?:\*\.labofscents\.org|\*\.next\.labofscents\.org|api\.labofscents\.org|labofscents\.org\/\*)/i,
);
requireAbsent(
  workflow,
  "candidate Custom Domain reset workflow",
  /(?:\bcat\s+[^\n]*(?:tail|deployments|version)|\btee\b|console\.error|error\.message|response\.(?:text|json))/i,
);

requireFragments(resetScript, "candidate Custom Domain reset helper", [
  "candidateDomainResetExpectation",
  "fixtureHostname:",
  "routerService:",
  'method: "DELETE"',
  'method: "PUT"',
  "CUSTOM_DOMAIN_OWNERSHIP_MISMATCH",
  "CUSTOM_DOMAIN_DETACHMENT_UNCONFIRMED",
  "CUSTOM_DOMAIN_ATTACH_FAILED",
  "restoreCandidateDomain",
  "maxWaitAttempts = 8",
  "waitMilliseconds = 5_000",
  "writePreflightIdentifiers",
  "readPreflightIdentifiers",
  "CANDIDATE_CUSTOM_DOMAIN_PREFLIGHT_CLASS",
  "CANDIDATE_CUSTOM_DOMAIN_RESET_FAILURE_CLASS",
  "CANDIDATE_CUSTOM_DOMAIN_DETACH_HTTP_STATUS",
  "CANDIDATE_CUSTOM_DOMAIN_DETACH_CF_ERROR_CODE",
  "safeCloudflareErrorCode",
  "candidateDomainDetachEvidence",
  "validControlPlaneId",
  "hostname: candidateDomainResetExpectation.fixtureHostname",
  "service: candidateDomainResetExpectation.routerService",
  "zone_id: zoneId",
  "zone_name: candidateDomainResetExpectation.zoneName",
]);
requireAbsent(
  resetScript,
  "candidate Custom Domain reset helper",
  /(?:wrangler|workers\/routes|\[\[routes\]\]|custom_domain\s*=|PRODUCTION_DATABASE_URL|DATABASE_URL|\b(?:psql|prisma)\b|console\.(?:error|dir)|error\.message|\*\.labofscents\.org|\*\.next\.labofscents\.org)/i,
);
if (/GITHUB_OUTPUT|appendFileSync/.test(resetScript))
  throw new Error(
    "opaque Custom Domain identifiers must remain in protected runner-local files",
  );
if (/console\.log\([^\n]*(?:domainId|apiToken|accountId)/.test(resetScript))
  throw new Error(
    "candidate Custom Domain reset helper must not log identifiers or credentials",
  );

console.log("CANDIDATE_CUSTOM_DOMAIN_RESET_WORKFLOW=PASS");
console.log("CANDIDATE_CUSTOM_DOMAIN_RESET_CANDIDATE_ONLY=PASS");
console.log("CANDIDATE_CUSTOM_DOMAIN_RESET_SECRET_SCOPE=PASS");
