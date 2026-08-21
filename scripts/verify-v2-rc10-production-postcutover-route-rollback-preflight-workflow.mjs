import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL(
    "../.github/workflows/v2-rc10-production-postcutover-route-rollback-preflight.yml",
    import.meta.url,
  ),
  "utf8",
);

const required = [
  "name: V2 RC10 Production Post-Cutover Route Rollback Preflight",
  "workflow_dispatch:",
  "contents: read",
  "environment: production",
  "group: v2-production-release-dispatch",
  "cancel-in-progress: false",
  "github.ref == 'refs/heads/main'",
  "github.ref_type == 'branch'",
  "fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd",
  "v2-production-rc10",
  "v2-production-ready",
  "v2-production-rc9",
  "v2-production-rc11",
  "VERIFY_RC10_POSTCUTOVER_ROUTE_ROLLBACK",
  "verify-v2-production-postcutover-route-rollback.mjs",
  "rollback_status=${PIPESTATUS[0]}",
  "POSTCUTOVER_ROUTE_HANDOFF_STATE=PASS",
  "PREVIOUS_API_ROUTE_TARGET_PROVEN=PASS",
  "PREVIOUS_TENANT_ROUTER_ROUTE_TARGET_PROVEN=PASS",
  "FIRST_RELEASE_ROUTE_ROLLBACK_POLICY=PASS",
  "ROLLBACK_TO_EXISTING_ROUTE_TARGET_READY=PASS",
  "ROLLBACK_TO_ABSENCE_READY=PASS",
  "PRODUCTION_ROUTE_ROLLBACK_READY=PASS",
  "CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
  "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
  "PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE: ${{ vars.PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE }}",
  "rm -rf -- \"$ROLLBACK_DIRECTORY\"",
];

for (const fragment of required) {
  if (!workflow.includes(fragment)) {
    throw new Error("POSTCUTOVER_ROLLBACK_PREFLIGHT_WORKFLOW_CONTRACT_FAIL");
  }
}

const triggerBlock = workflow.match(
  /^on:\s*\r?\n((?: {2,}[^\r\n]*\r?\n)*)/m,
);
if (
  !triggerBlock ||
  !/^  workflow_dispatch:\s*$/m.test(triggerBlock[1]) ||
  /^  (?!workflow_dispatch:)[A-Za-z0-9_-]+:\s*$/m.test(triggerBlock[1])
) {
  throw new Error("POSTCUTOVER_ROLLBACK_PREFLIGHT_TRIGGER_CONTRACT_FAIL");
}

const protectedStep = workflow.match(
  /- name: Verify post-cutover first-release route rollback capability read-only([\s\S]*?)(?=\n      - name:|\n      - uses:|$)/,
);
if (
  !protectedStep ||
  !protectedStep[1].includes("CLOUDFLARE_ACCOUNT_ID") ||
  !protectedStep[1].includes("CLOUDFLARE_API_TOKEN") ||
  !protectedStep[1].includes("PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE")
) {
  throw new Error("POSTCUTOVER_ROLLBACK_PREFLIGHT_CREDENTIAL_SCOPE_FAIL");
}

const beforeProtectedStep = workflow.slice(0, protectedStep.index);
if (
  /CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE/.test(
    beforeProtectedStep,
  )
) {
  throw new Error("POSTCUTOVER_ROLLBACK_PREFLIGHT_CREDENTIAL_LEAK_FAIL");
}

if (
  /contents:\s*write|gh\s+api|wrangler\b|curl\s+[^\r\n]*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)|workers\/(?:routes|domains)|git\s+(?:tag|push)/i.test(
    workflow,
  )
) {
  throw new Error("POSTCUTOVER_ROLLBACK_PREFLIGHT_NO_MUTATION_CONTRACT_FAIL");
}

console.log("RC10_POSTCUTOVER_ROUTE_ROLLBACK_PREFLIGHT_WORKFLOW=PASS");
