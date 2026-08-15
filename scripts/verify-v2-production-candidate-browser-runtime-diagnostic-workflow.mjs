import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/v2-production-candidate-browser-runtime-diagnostic.yml",
  "utf8",
);
const diagnostic = readFileSync(
  "scripts/diagnose-v2-production-candidate-browser-runtime.mjs",
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

requireFragments(workflow, "candidate browser runtime workflow", [
  "name: V2 Production Candidate Browser Runtime Diagnostic",
  "workflow_dispatch:",
  "contents: read",
  "environment: production",
  "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && github.ref_type == 'branch'",
  "DIAGNOSE_RC9_CANDIDATE_BROWSER_RUNTIME",
  "TARGET_RELEASE_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "TARGET_TENANT_URL: https://rc9-release-31736285494-469ca8942a.next.labofscents.org",
  "npm ci --ignore-scripts",
  "npx playwright install --with-deps chromium",
  "node scripts/diagnose-v2-production-candidate-browser-runtime.mjs",
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
    "candidate browser runtime diagnostic must be workflow_dispatch-only",
  );
requireAbsent(
  workflow,
  "candidate browser runtime workflow",
  /(?:CLOUDFLARE_|PRODUCTION_DATABASE_URL|DATABASE_URL|wrangler|\bgh\s+(?:api|workflow|secret|variable)\b|\b(?:psql|prisma)\b|workers\/(?:routes|domains)|\[\[routes\]\]|custom_domain\s*=|routes\s*=)/i,
);
requireAbsent(
  diagnostic,
  "candidate browser runtime diagnostic",
  /(?:response\.(?:text|json)|cookie|authorization|console\.log\([^\n]*(?:message|url)|console\.(?:error|dir)|error\.message)/i,
);
requireFragments(diagnostic, "candidate browser runtime diagnostic", [
  'credentials: "omit"',
  'redirect: "manual"',
  "CANDIDATE_BROWSER_RUNTIME_HTTP_GATE",
  "CANDIDATE_BROWSER_RUNTIME_ERRORS_OBSERVED",
  "CANDIDATE_BROWSER_RUNTIME_HEALTHY",
  "CANDIDATE_BROWSER_SMOKE_PARITY_HEALTHY",
  "SMOKE_PARITY_API_SESSION_BOUNDARY",
  "BROWSER_CONSOLE_ERROR",
  "BROWSER_PAGE_ERROR",
]);
console.log("CANDIDATE_BROWSER_RUNTIME_DIAGNOSTIC_WORKFLOW=PASS");
console.log("CANDIDATE_BROWSER_RUNTIME_DIAGNOSTIC_READ_ONLY=PASS");
