import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/v2-production-candidate-exact-billing-path-diagnostic.yml", "utf8");
const worker = readFileSync("worker/v2-exact-billing-path-diagnostic.ts", "utf8");
const runner = readFileSync("scripts/diagnose-v2-production-candidate-exact-billing-path.mjs", "utf8");

for (const required of [
  "name: V2 Production Candidate Exact Billing Path Diagnostic",
  "workflow_dispatch:",
  "DIAGNOSE_RC9_EXACT_BILLING_PATH",
  "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "npm ci --ignore-scripts --prefix rc9",
  "prisma generate --schema rc9/infra/postgres/prisma/schema.prisma",
  "workers_dev = true",
  "b415b7572d9f45058ebb4ec4166b8739",
  "PrismaPlatformRepository",
  "PlatformService",
  "include: { plan: true }",
  "repository.transaction",
  "BILLING_RLS_RUNTIME_EFFECT",
  "EXACT_BILLING_PATH_DIAGNOSTIC_CLEANUP=PASS",
  "TEMP_EXACT_BILLING_WORKER_NAME: oo-v2-billing-runtime-exact-${{ github.run_id }}",
  "if: ${{ always() }}",
]) {
  if (!(workflow + worker + runner).includes(required)) throw new Error(`missing exact billing path contract: ${required}`);
}
if (!/^on:\s*\n\s*workflow_dispatch:/m.test(workflow)) throw new Error("exact billing diagnostic must be workflow_dispatch only");
for (const forbidden of [
  /wrangler pages/i,
  /custom_domain\s*=/i,
  /^routes\s*=/m,
  /^\[\[routes\]\]/m,
  /workers\/domains|workers\/routes/i,
  /CANDIDATE_API_SERVICE[^\n]*wrangler\s+(?:deploy|delete)/i,
  /ALTER TABLE|CREATE TABLE|DROP TABLE|GRANT |REVOKE /i,
  /RC10|v2-production-live|PUBLIC_PRODUCTION/i,
  /plan\.findUnique\s*\(/,
]) {
  if (forbidden.test(worker)) throw new Error(`forbidden exact billing diagnostic surface: ${forbidden}`);
}
if (!workflow.includes("environment: production")) throw new Error("diagnostic must use protected production environment");
if (!workflow.includes("--request DELETE") || !workflow.includes("TEMP_EXACT_BILLING_WORKER_NAME")) throw new Error("temporary Worker cleanup is missing");
if (workflow.includes("deploy.stderr" ) && !workflow.includes("EXACT_BILLING_WORKER_DEPLOY_FAILURE_CLASS")) throw new Error("temporary Worker deploy failures must emit only a safe class");
console.log(JSON.stringify({ EXACT_BILLING_PATH_DIAGNOSTIC_WORKFLOW: "PASS", EXACT_BILLING_PATH_DIAGNOSTIC_NO_RC9_OR_PUBLIC_MUTATION: "PASS" }));
