import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/v2-rc10-production-platform-owner-onboarding.yml",
  "utf8",
);
const worker = readFileSync(
  "worker/v2-platform-owner-onboarding.ts.template",
  "utf8",
);
const renderer = readFileSync(
  "scripts/render-v2-production-platform-owner-onboarding.mjs",
  "utf8",
);

const requiredWorkflow = [
  "name: V2 RC10 Production Platform Owner User Onboarding",
  "workflow_dispatch:",
  "github.ref == 'refs/heads/main'",
  "RC10_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd",
  "PREPARE_RC10_PLATFORM_OWNER_USER_ONBOARDING",
  "environment: production",
  "ref: ${{ needs.validate.outputs.release_sha }}",
  "npm ci --ignore-scripts --prefix release",
  "release/node_modules/.bin/prisma generate --schema release/infra/postgres/prisma/schema.prisma",
  "cp ops/worker/v2-platform-owner-onboarding.ts.template release/worker/v2-platform-owner-onboarding.ts",
  "PLATFORM_OWNER_BOOTSTRAP_EMAIL: ${{ secrets.PLATFORM_OWNER_BOOTSTRAP_EMAIL }}",
  "PRODUCTION_OWNER_ONBOARDING_RESEND_API_KEY",
  "PRODUCTION_OWNER_ONBOARDING_EMAIL_FROM",
  "PLATFORM_OWNER_USER_ONBOARDING=PASS",
  "if: ${{ always() }}",
  "PLATFORM_OWNER_USER_ONBOARDING_CLEANUP=PASS",
];

const requiredWorker = [
  "../services/platform/src/service.js",
  "../services/platform/src/prisma-repository.js",
  "./provider-adapters.js",
  "services.platform.signup",
  "services.platform.verifyEmail(result.verificationToken)",
  "PLATFORM_OWNER_BOOTSTRAP_EMAIL",
  "ONBOARDING_LINK_TOKEN",
  "ONBOARDING_DISPATCH_TOKEN",
];

const forbiddenWorkflow =
  /(?:wrangler\s+pages|v2-production-release-dispatch|bootstrap:platform-owner|ASSIGN_PLATFORM_OWNER|gh\s+(?:api|workflow|secret|variable))/im;
const forbiddenWorker =
  /(?:markUserVerified|markVerificationComplete|user\.update|emailVerification\.update|INSERT\s+INTO|UPDATE\s+v2_|console\.(?:log|error)|stack|error\.message)/i;

const prerequisiteIndex = workflow.indexOf(
  "Require the protected identity and email-delivery prerequisites before deployment",
);
const deployIndex = workflow.indexOf(
  "Deploy the temporary exact RC10 Workers.dev onboarding Worker",
);
const cleanupIndex = workflow.indexOf(
  "Delete only the temporary onboarding Worker and runner-local evidence",
);

if (!requiredWorkflow.every((value) => workflow.includes(value)))
  throw new Error("PLATFORM_OWNER_ONBOARDING_WORKFLOW_CONTRACT=FAIL");
if (!requiredWorker.every((value) => worker.includes(value)))
  throw new Error("PLATFORM_OWNER_ONBOARDING_RC10_PATH_CONTRACT=FAIL");
if (forbiddenWorkflow.test(workflow) || forbiddenWorker.test(worker))
  throw new Error("PLATFORM_OWNER_ONBOARDING_SAFETY_CONTRACT=FAIL");
if (worker.includes("ONBOARDING_LINK_TOKEN.slice"))
  throw new Error("PLATFORM_OWNER_ONBOARDING_TOKEN_PERSISTENCE=FAIL");
if (!worker.includes("crypto.randomUUID()"))
  throw new Error("PLATFORM_OWNER_ONBOARDING_WORKSPACE_ENTROPY=FAIL");
if (
  prerequisiteIndex < 0 ||
  deployIndex < 0 ||
  cleanupIndex < 0 ||
  prerequisiteIndex > deployIndex ||
  deployIndex > cleanupIndex ||
  !workflow.includes("OWNER_ONBOARDING_TEMP_WORKER_DEPLOY_ATTEMPTED=YES")
)
  throw new Error("PLATFORM_OWNER_ONBOARDING_DEPLOYMENT_CLEANUP_ORDER=FAIL");
if (
  /(?:^|\n)\s*(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/m.test(workflow)
)
  throw new Error("PLATFORM_OWNER_ONBOARDING_WORKFLOW_ROUTE_BOUNDARY=FAIL");
if (
  !renderer.includes("workers_dev = true") ||
  /(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/.test(renderer)
)
  throw new Error("PLATFORM_OWNER_ONBOARDING_ROUTE_BOUNDARY=FAIL");
if (
  !workflow.includes(
    'test "$PRODUCTION_HYPERDRIVE_ID" = "$EXPECTED_HYPERDRIVE_ID"',
  )
)
  throw new Error("PLATFORM_OWNER_ONBOARDING_HYPERDRIVE_PIN=FAIL");

console.log("PLATFORM_OWNER_ONBOARDING_WORKFLOW=PASS");
console.log("PLATFORM_OWNER_ONBOARDING_RC10_PATH=PASS");
console.log("PLATFORM_OWNER_ONBOARDING_NO_PUBLIC_ROUTE=PASS");
