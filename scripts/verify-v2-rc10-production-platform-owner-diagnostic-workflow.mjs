import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/v2-rc10-production-platform-owner-diagnostic.yml",
  "utf8",
);
const diagnostic = readFileSync(
  "scripts/diagnose-v2-production-platform-owner-bootstrap.mjs",
  "utf8",
);

const requiredWorkflow = [
  "name: V2 RC10 Production Platform Owner Diagnostic",
  "workflow_dispatch:",
  "github.ref == 'refs/heads/main'",
  "RC10_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd",
  "DIAGNOSE_RC10_PLATFORM_OWNER_BOOTSTRAP",
  "environment: production",
  "working-directory: release",
  "run: npm ci",
  "RELEASE_WORKTREE: ${{ github.workspace }}/release",
  "PLATFORM_OWNER_BOOTSTRAP_EMAIL: ${{ secrets.PLATFORM_OWNER_BOOTSTRAP_EMAIL }}",
  "PLATFORM_BOOTSTRAP_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}",
  "Remove runner-local diagnostic evidence",
];

const requiredDiagnostic = [
  "BEGIN READ ONLY",
  "SET TRANSACTION READ ONLY",
  'client.query("ROLLBACK")',
  "NODE_PRISMA_CLIENT_READY",
  "PRISMA_READ_ONLY_TRANSACTION",
  "BOOTSTRAP_USER_MATCH_COUNT",
  "ACTIVE_PLATFORM_OWNER_COUNT",
  "BOOTSTRAP_RLS_WRITE_PATH",
  "PLATFORM_OWNER_BOOTSTRAP_ROOT_CAUSE",
];

const forbidden =
  /\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+(?:TABLE|INDEX|POLICY)|DROP\s+(?:TABLE|INDEX|POLICY)|GRANT\s|REVOKE\s|pg_advisory_xact_lock)\b|assignPlatformOwner|prisma:generate|wrangler\s+(deploy|delete)|gh\s+(api|workflow|secret|variable)/i;

if (!requiredWorkflow.every((value) => workflow.includes(value))) {
  throw new Error("PLATFORM_OWNER_DIAGNOSTIC_WORKFLOW_CONTRACT=FAIL");
}
if (
  !workflow.includes("run: npm ci") ||
  /npm ci\s+--ignore-scripts/i.test(workflow)
) {
  throw new Error("PLATFORM_OWNER_DIAGNOSTIC_INSTALL_CONTRACT=FAIL");
}
if (!requiredDiagnostic.every((value) => diagnostic.includes(value))) {
  throw new Error("PLATFORM_OWNER_DIAGNOSTIC_SCRIPT_CONTRACT=FAIL");
}
if (forbidden.test(workflow) || forbidden.test(diagnostic)) {
  throw new Error("PLATFORM_OWNER_DIAGNOSTIC_READ_ONLY_CONTRACT=FAIL");
}

console.log("PLATFORM_OWNER_DIAGNOSTIC_WORKFLOW=PASS");
console.log("PLATFORM_OWNER_DIAGNOSTIC_READ_ONLY=PASS");
