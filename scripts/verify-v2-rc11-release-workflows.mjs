import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflows = join(root, ".github", "workflows");
const rc11Sha = "98cfac77853ffb0b6b69235bb3483117dc3b6961";
const rc10Sha = "fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd";

function source(name) {
  return readFileSync(join(workflows, name), "utf8").replaceAll("\r\n", "\n");
}

function requireText(value, text, label) {
  assert.ok(value.includes(text), label);
}

function forbid(value, pattern, label) {
  assert.doesNotMatch(value, pattern, label);
}

function assertMainOnly(value, label) {
  requireText(value, "github.event_name == 'workflow_dispatch'", `${label}: workflow dispatch only`);
  requireText(value, "github.ref == 'refs/heads/main'", `${label}: main ref guard`);
  requireText(value, "github.ref_type == 'branch'", `${label}: branch guard`);
}

export function verifyRc11ReleaseWorkflows() {
  const candidate = source("v2-rc11-isolated-production-candidate.yml");
  const revalidation = source("v2-rc11-production-environment-revalidation.yml");
  const backup = source("v2-rc11-production-backup-snapshot.yml");
  const readiness = source("v2-rc11-production-readiness.yml");
  const upgrade = source("v2-rc11-production-upgrade-dispatcher.yml");
  const rollback = source("v2-rc11-production-upgrade-rollback.yml");
  const acceptance = source("v2-rc11-production-public-acceptance.yml");
  const finalizer = source("v2-rc11-production-live-finalization.yml");
  const candidateRenderer = readFileSync(join(root, "scripts", "render-v2-rc11-cloud-runtime-candidate-config.mjs"), "utf8");
  const all = [candidate, revalidation, backup, readiness, upgrade, rollback, acceptance, finalizer].join("\n");

  for (const [name, value] of Object.entries({ candidate, revalidation, backup, readiness, upgrade, rollback, acceptance, finalizer })) {
    requireText(value, "on:\n  workflow_dispatch:", `${name}: dispatch trigger`);
    assertMainOnly(value, name);
    requireText(value, rc11Sha, `${name}: exact RC11 SHA`);
  }
  for (const [name, value] of Object.entries({ candidate, revalidation, backup, readiness, upgrade, rollback, acceptance, finalizer })) {
    requireText(value, "environment: production", `${name}: protected environment`);
  }
  requireText(candidate, "RC10_RUNTIME_BASE_SHA", "candidate: legacy runtime base evidence");
  requireText(candidate, "path: release-tooling", "candidate: trusted main-owned renderer checkout");
  requireText(candidate, "path: release", "candidate: immutable RC11 source checkout");
  requireText(candidate, "render-v2-rc11-cloud-runtime-candidate-config.mjs render", "candidate: Cloud Runtime isolation renderer");
  requireText(candidate, "render-v2-rc11-cloud-runtime-candidate-config.mjs verify", "candidate: Cloud Runtime isolation verifier");
  forbid(candidate, /node scripts\/validate-cloud-runtime-config\.mjs wrangler\.v2-cloud-runtime\.production-candidate\.toml/, "candidate: legacy validation cannot permit production queue ownership");
  requireText(candidateRenderer, "CANDIDATE_WORKER_NAME_ISOLATED=PASS", "candidate renderer: isolated Worker evidence");
  requireText(candidateRenderer, "CANDIDATE_WORKFLOW_NAME_ISOLATED=PASS", "candidate renderer: isolated Workflow evidence");
  requireText(candidateRenderer, "PRODUCTION_WORKFLOW_NAME_ABSENT_FROM_CANDIDATE_OWNERSHIP=PASS", "candidate renderer: production Workflow absence");
  requireText(candidateRenderer, "PRODUCTION_QUEUE_CONSUMERS_ABSENT=PASS", "candidate renderer: production queue consumer absence");
  requireText(candidateRenderer, "PUBLIC_ROUTES_ABSENT=PASS", "candidate renderer: public route absence");
  requireText(candidateRenderer, "PUBLIC_CUSTOM_DOMAINS_ABSENT=PASS", "candidate renderer: public custom-domain absence");
  requireText(readiness, "contents: read", "readiness: no tag permission");
  requireText(readiness, "v2-production-live)\" = \"$RC10_RUNTIME_BASE_SHA", "readiness: preserves legacy live tag");
  forbid(readiness, /git tag\b|git push\b/, "readiness: no readiness tag mutation");
  requireText(acceptance, "RC10_READY_TAG", "acceptance: preserves legacy readiness tag");
  requireText(acceptance, rc10Sha, "acceptance: verifies RC10 readiness target");
  requireText(upgrade, "wrangler versions upload", "upgrade: inactive version upload");
  requireText(upgrade, "wrangler versions deploy", "upgrade: version promotion");
  requireText(upgrade, "Restore captured RC10 versions", "upgrade: automatic rollback");
  requireText(upgrade, "wrangler pages deploy", "upgrade: Pages last promotion");
  requireText(upgrade, "rollback-pages", "upgrade: exact Pages rollback helper");
  requireText(rollback, "wrangler rollback", "rollback: Worker version rollback");
  requireText(rollback, "rollback-pages", "rollback: Pages rollback");
  requireText(finalizer, "v2-production-live-rc11", "finalizer: RC11 live tag");
  requireText(finalizer, "V2 RC11 Production Public Acceptance", "finalizer: fresh acceptance gate");
  requireText(finalizer, "verify-live", "finalizer: active RC11 component recheck");
  requireText(finalizer, "verify-rollback-capability", "finalizer: exact RC10 rollback recheck");
  forbid(finalizer, /git tag -f|git push --force/, "finalizer: never force tags");
  forbid(all, /wrangler triggers deploy|workers\/routes|workers\/domains|route-handoff/, "RC11: no route handoff or trigger mutation");
  forbid(all, /git tag -f|git push --force/, "RC11: no force tag or push");
  console.log("RC11_RELEASE_WORKFLOW_CONTRACT=PASS");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  verifyRc11ReleaseWorkflows();
}
