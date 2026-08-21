import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(
    ".github/workflows/v2-production-candidate-browser-route-diagnostic.yml",
  ),
  "utf8",
);
const diagnostic = readFileSync(
  resolve(
    "scripts/verify-v2-production-candidate-browser-route-diagnostic.mjs",
  ),
  "utf8",
);

for (const fragment of [
  "workflow_dispatch:",
  "contents: read",
  "environment: production",
  "TARGET_RELEASE_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "EXPECTED_TENANT_URL: https://rc9-release-31736285494-469ca8942a.next.labofscents.org",
  "EXPECTED_PAGES_ORIGIN: https://production-candidate.olfactoryops-v2-production-candidate.pages.dev",
  "DIAGNOSE_RC9_CANDIDATE_BROWSER_ROUTES",
  "v2-production-rc9^{}",
  "v2-production-rc9^{}",
  "verify-v2-production-candidate-browser-route-diagnostic.mjs",
  "CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_PAGES_ORIGIN",
]) {
  if (!workflow.includes(fragment))
    throw new Error(`browser route workflow missing contract: ${fragment}`);
}

if (
  /(?:pull_request|wrangler\s+(?:deploy|secret)|cloudflare|PRODUCTION_DATABASE_URL|CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)|\b(?:INSERT|UPDATE|DELETE\s+FROM|ALTER|CREATE|DROP)\b|gh\s+(?:api|workflow|secret|variable))/i.test(
    workflow,
  )
)
  throw new Error(
    "browser route workflow must remain read-only without credentials, deployment, or mutation commands",
  );

if (workflow.includes(["codex", "v2-production-go-live"].join("/")))
  throw new Error("browser route workflow must use immutable tag validation");

for (const fragment of [
  '"/login"',
  '"/signup"',
  '"/v2/login"',
  '"/v2/signup"',
  'method: "GET"',
  'redirect: "manual"',
  'credentials: "omit"',
  '"cache-control": "no-cache"',
  'pragma: "no-cache"',
  "AbortSignal.timeout(20_000)",
  "CANDIDATE_CUSTOM_DOMAIN_OR_ROUTER_INGRESS_REGRESSION",
  "CANDIDATE_ROUTER_REQUEST_PATH_REGRESSION",
  "CANDIDATE_PAGES_DEEP_LINK_ROUTING_FAILURE",
  "BROWSER_ONLY_OR_TRANSIENT_ACCEPTANCE_FAILURE",
  "AUTH_ROUTE_OR_SPA_FALLBACK_DISCREPANCY",
]) {
  if (!diagnostic.includes(fragment))
    throw new Error(
      `browser route diagnostic missing safe behavior: ${fragment}`,
    );
}

if (
  /(?:response\.(?:text|json|arrayBuffer)|authorization|cookie|console\.error|error\.message)/i.test(
    diagnostic,
  )
)
  throw new Error(
    "browser route diagnostic must not expose bodies, credentials, or raw errors",
  );

console.log("CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_WORKFLOW=PASS");
console.log("CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_READ_ONLY=PASS");
