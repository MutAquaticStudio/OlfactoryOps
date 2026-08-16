import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/v2-production-candidate-billing-runtime-diagnostic.yml",
  "utf8",
);
const worker = readFileSync("worker/v2-billing-runtime-diagnostic.ts", "utf8");
const runner = readFileSync(
  "scripts/diagnose-v2-production-candidate-billing-runtime.mjs",
  "utf8",
);
const required = [
  "name: V2 Production Candidate Billing Runtime Differential Diagnostic",
  "workflow_dispatch:",
  "DIAGNOSE_RC9_BILLING_RUNTIME",
  "environment: production",
  "workers_dev = true",
  "include: { plan: true }",
  "BILLING_RUNTIME_DIAGNOSTIC_CLEANUP=PASS",
  "npm ci --ignore-scripts --prefix rc9",
  "prisma generate --schema rc9/infra/postgres/prisma/schema.prisma",
  "b415b7572d9f45058ebb4ec4166b8739",
  "CANDIDATE_API_VERSION_STABLE",
];
for (const value of required)
  if (
    !workflow.includes(value) &&
    !worker.includes(value) &&
    !runner.includes(value)
  )
    throw new Error(`missing billing runtime diagnostic contract: ${value}`);
if (!/^on:\s*\n\s*workflow_dispatch:/m.test(workflow))
  throw new Error("billing runtime diagnostic must be workflow_dispatch only");
for (const forbidden of [
  /wrangler pages/i,
  /wrangler deploy[^\n]*--keep-vars/i,
  /workers\/domains/i,
  /workers\/routes/i,
  /custom_domain\s*=/i,
  /^routes\s*=/m,
  /(?:CANDIDATE_API_SERVICE|olfactoryops-v2-api-production-candidate)[^\n]*wrangler\s+(?:deploy|delete)/i,
  /ALTER TABLE|CREATE TABLE|DROP TABLE|GRANT |REVOKE /i,
  /PUBLIC_PRODUCTION/i,
])
  if (forbidden.test(workflow))
    throw new Error(
      "billing runtime diagnostic contains a forbidden mutation surface",
    );
if (!workflow.includes("if: ${{ always() }}"))
  throw new Error("temporary billing Worker cleanup must always run");
if (
  !worker.includes(
    'return response(404, { billingRuntimeDiagnostic: "NOT_FOUND" })',
  )
)
  throw new Error("diagnostic Worker must fail closed");
if (
  /console\.(?:log|error)\([^)]*(?:organizationId|planId|token|connectionString)/.test(
    worker + runner,
  )
)
  throw new Error(
    "billing diagnostic must not log tenant or credential material",
  );
console.log(
  JSON.stringify({
    BILLING_RUNTIME_DIAGNOSTIC_WORKFLOW: "PASS",
    BILLING_RUNTIME_DIAGNOSTIC_NO_CANDIDATE_API_DEPLOYMENT_OR_ROUTE_MUTATION:
      "PASS",
  }),
);
