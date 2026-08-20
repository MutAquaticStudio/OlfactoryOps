import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/v2-rc10-production-smoke-identity-provisioning.yml",
  "utf8",
);
const provisioner = readFileSync(
  "scripts/provision-v2-rc10-production-smoke-identity.mjs",
  "utf8",
);
const readiness = readFileSync(
  "scripts/verify-v2-production-smoke-tenant-readiness.mjs",
  "utf8",
);

const requiredWorkflow = [
  "name: V2 RC10 Production Dedicated Smoke Identity Provisioning",
  "workflow_dispatch:",
  "github.ref == 'refs/heads/main'",
  "RC10_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd",
  "RC10_TAG: v2-production-rc10",
  "PROVISION_RC10_DEDICATED_SMOKE_IDENTITY",
  "persist-credentials: true",
  "environment: production",
  "ref: ${{ needs.validate.outputs.release_sha }}",
  "npm ci --ignore-scripts",
  "PRODUCTION_SMOKE_LOGIN_EMAIL: ${{ secrets.PRODUCTION_SMOKE_LOGIN_EMAIL }}",
  "PRODUCTION_SMOKE_LOGIN_PASSWORD: ${{ secrets.PRODUCTION_SMOKE_LOGIN_PASSWORD }}",
  "V2_PASSWORD_PEPPER: ${{ secrets.V2_PASSWORD_PEPPER }}",
  "PRODUCTION_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}",
  "provision-v2-rc10-production-smoke-identity.mjs",
  "verify-v2-production-smoke-tenant-readiness.mjs",
  "PRODUCTION_SMOKE_IDENTITY_ROLE=VIEWER",
  "PRODUCTION_SMOKE_PLATFORM_OPERATOR=ABSENT",
  "Remove runner-local provisioning evidence",
];

const requiredProvisioner = [
  "services/platform/src/crypto.ts",
  "hashPassword",
  "'Viewer'",
  "v2_platform_operators",
  "NOT EXISTS",
  "PRODUCTION_SMOKE_IDENTITY_PROVISIONING=PASS",
];

const forbidden =
  /(?:wrangler\s+(?:deploy|pages|delete|secret)|workers\/(?:routes|domains)|git\s+(?:tag|push)|gh\s+(?:api|workflow|secret|variable)|INSERT\s+INTO\s+public\.v2_platform_operators|UPDATE\s+public\.|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+(?:TABLE|INDEX|POLICY)|DROP\s+(?:TABLE|INDEX|POLICY)|console\.(?:error|warn))/i;

const provisionStart = workflow.indexOf(
  "- name: Provision one dedicated normal tenant smoke identity",
);
const credentialStart = workflow.indexOf(
  "- name: Require the protected dedicated smoke credentials before any write",
);
const reverifyStart = workflow.indexOf(
  "- name: Reverify the provisioned smoke identity with a read-only database session",
);
const validationFetchStart = workflow.indexOf(
  'git fetch --no-tags origin "$RELEASE_BRANCH"',
);
const validationCredentialStart = workflow.indexOf("persist-credentials: true");

if (!requiredWorkflow.every((entry) => workflow.includes(entry))) {
  throw new Error(
    "PRODUCTION_SMOKE_IDENTITY_PROVISIONING_WORKFLOW_CONTRACT=FAIL",
  );
}
if (!requiredProvisioner.every((entry) => provisioner.includes(entry))) {
  throw new Error(
    "PRODUCTION_SMOKE_IDENTITY_PROVISIONING_SCRIPT_CONTRACT=FAIL",
  );
}
if (
  forbidden.test(workflow) ||
  forbidden.test(provisioner) ||
  forbidden.test(readiness)
) {
  throw new Error("PRODUCTION_SMOKE_IDENTITY_PROVISIONING_BOUNDARY=FAIL");
}
if (
  credentialStart < 0 ||
  provisionStart <= credentialStart ||
  reverifyStart <= provisionStart ||
  validationCredentialStart < 0 ||
  validationCredentialStart >= validationFetchStart ||
  (workflow.match(/persist-credentials: true/g) ?? []).length !== 1
) {
  throw new Error("PRODUCTION_SMOKE_IDENTITY_PROVISIONING_ORDER=FAIL");
}
if (
  !/on:\s*\n\s+workflow_dispatch:/m.test(workflow) ||
  /^\s+(?:push|pull_request|schedule|workflow_call|workflow_run):/m.test(
    workflow,
  )
) {
  throw new Error("PRODUCTION_SMOKE_IDENTITY_PROVISIONING_TRIGGER=FAIL");
}

console.log("PRODUCTION_SMOKE_IDENTITY_PROVISIONING_WORKFLOW=PASS");
console.log("PRODUCTION_SMOKE_IDENTITY_PROVISIONING_BOUNDARY=PASS");
