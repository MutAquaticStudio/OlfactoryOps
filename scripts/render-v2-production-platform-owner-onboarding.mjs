import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rc10Sha = "fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd";
const productionHyperdriveId = "b415b7572d9f45058ebb4ec4166b8739";

export function renderPlatformOwnerOnboardingConfig({
  workerName,
  releaseSha,
  hyperdriveId,
}) {
  if (!/^oo-v2-platform-owner-onboarding-[0-9]+-[0-9]+$/.test(workerName ?? ""))
    throw new Error("OWNER_ONBOARDING_CONFIG_INVALID_WORKER_NAME");
  if (releaseSha !== rc10Sha)
    throw new Error("OWNER_ONBOARDING_CONFIG_INVALID_RELEASE");
  if (hyperdriveId !== productionHyperdriveId)
    throw new Error("OWNER_ONBOARDING_CONFIG_INVALID_HYPERDRIVE");
  return `name = "${workerName}"
main = "../../worker/v2-platform-owner-onboarding.ts"
compatibility_date = "2026-08-11"
compatibility_flags = ["nodejs_compat"]
workers_dev = true

[vars]
RELEASE_ENVIRONMENT = "production"
RELEASE_GIT_SHA = "${releaseSha}"
V2_WORKSPACE_BASE_DOMAIN = "labofscents.org"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "${hyperdriveId}"
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = process.env.OWNER_ONBOARDING_WRANGLER_CONFIG;
  const rendered = renderPlatformOwnerOnboardingConfig({
    workerName: process.env.TEMP_OWNER_ONBOARDING_WORKER_NAME,
    releaseSha: process.env.RELEASE_SHA,
    hyperdriveId: process.env.PRODUCTION_HYPERDRIVE_ID,
  });
  if (
    !output ||
    /(?:^|\n)(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/.test(rendered) ||
    !/^workers_dev\s*=\s*true$/m.test(rendered)
  )
    throw new Error("OWNER_ONBOARDING_CONFIG_ROUTE_BOUNDARY");
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, rendered, "utf8");
  console.log("OWNER_ONBOARDING_CONFIG=PASS");
}
