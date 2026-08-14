import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(
    ".github/workflows/v2-production-candidate-custom-domain-precedence-diagnostic.yml",
  ),
  "utf8",
);
const diagnostic = readFileSync(
  resolve(
    "scripts/diagnose-v2-production-candidate-custom-domain-precedence.mjs",
  ),
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

requireFragments(workflow, "Custom Domain precedence workflow", [
  "name: V2 Production Candidate Custom Domain Precedence Diagnostic",
  "workflow_dispatch:",
  "contents: read",
  "group: v2-isolated-production-candidate-tenant-router",
  "cancel-in-progress: false",
  "timeout-minutes: 5",
  "timeout-minutes: 8",
  "environment: production",
  "github.ref == 'refs/heads/main'",
  "github.ref_type == 'branch'",
  "TARGET_RELEASE_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "TARGET_FIXTURE_HOSTNAME: rc9-release-31736285494-469ca8942a.next.labofscents.org",
  "TARGET_ROUTER_SERVICE: olfactoryops-v2-tenant-router-production-candidate",
  "TARGET_ZONE_NAME: labofscents.org",
  "RELEASE_BRANCH: codex/v2-production-go-live",
  "RELEASE_TAG: v2-production-rc9",
  "DIAGNOSE_RC9_CUSTOM_DOMAIN_PRECEDENCE",
  "$RELEASE_TAG^{}",
  "npm ci --ignore-scripts",
  "diagnose-v2-production-candidate-custom-domain-precedence.mjs",
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
    "Custom Domain precedence workflow must be workflow_dispatch-only",
  );

requireAbsent(
  workflow,
  "Custom Domain precedence workflow",
  /(?:\bwrangler\b|\bcurl\b|\bgh\s+(?:api|workflow|secret|variable)\b|\b(?:psql|prisma)\b|\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_]|ALTER\s+(?:TABLE|ROLE)|CREATE\s+(?:TABLE|ROLE|SCHEMA)|DROP\s+(?:TABLE|ROLE|SCHEMA))\b|git\s+worktree\s+(?:add|remove)|PRODUCTION_DATABASE_URL|DATABASE_URL|V2_[A-Z_]*PEPPER|SCIENTIFIC_)/i,
);
requireAbsent(
  workflow,
  "Custom Domain precedence workflow",
  /(?:CANDIDATE_PAGES_ORIGIN|PRODUCTION_CANDIDATE_SMOKE_TENANT_URL)/,
);

const protectedJob = workflow.slice(
  workflow.indexOf("  diagnose-candidate-custom-domain-precedence:"),
  workflow.indexOf(
    "    steps:",
    workflow.indexOf("  diagnose-candidate-custom-domain-precedence:"),
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
if (tokenRefs?.length !== 1 || accountRefs?.length !== 1)
  throw new Error(
    "Cloudflare credentials must be scoped only to the one read-only diagnostic step",
  );

const installIndex = workflow.indexOf(
  "Install pinned main operations tooling without provider credentials",
);
const diagnosticIndex = workflow.indexOf(
  "Read only candidate Custom Domain, zone Route, and DNS precedence state",
);
if (!(installIndex >= 0 && installIndex < diagnosticIndex))
  throw new Error(
    "Custom Domain precedence diagnostic must install before the read-only probe",
  );

requireFragments(diagnostic, "Custom Domain precedence diagnostic", [
  'method: "GET"',
  "/workers/domains",
  "/workers/routes",
  "/dns_records",
  'dnsUrl.searchParams.set("name.exact", config.fixtureHostname)',
  'dnsUrl.searchParams.set("per_page", "20")',
  'dnsUrl.searchParams.set("include_shadow_metadata", "true")',
  "routePatternMatchesFixture",
  "routePatternHostScope",
  "SCRIPTED_NON_CANDIDATE",
  "ZONE_ROUTE_HOST_SCOPE",
  "CANDIDATE_MANAGED_DNS_RECORD_SHADOWED",
  "CANDIDATE_CUSTOM_DOMAIN_INGRESS_PLATFORM_INCONSISTENCY",
  "candidateCustomDomainPrecedenceEvidence",
  "/^[A-Z0-9_]+$/.test(value)",
]);
requireAbsent(
  diagnostic,
  "Custom Domain precedence diagnostic",
  /method:\s*"(?:POST|PUT|PATCH|DELETE)"|\bwrangler\b|\b(?:psql|prisma)\b|console\.(?:error|dir)|error\.message|process\.env\.(?:PRODUCTION_DATABASE_URL|DATABASE_URL)/i,
);

console.log("CUSTOM_DOMAIN_PRECEDENCE_DIAGNOSTIC_WORKFLOW=PASS");
console.log(
  "CUSTOM_DOMAIN_PRECEDENCE_DIAGNOSTIC_NO_CANDIDATE_OR_PUBLIC_RESOURCE_MUTATION=PASS",
);
console.log("CUSTOM_DOMAIN_PRECEDENCE_DIAGNOSTIC_SECRET_SCOPE=PASS");
