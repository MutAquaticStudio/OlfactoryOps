import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/v2-production-release-dispatch.yml",
  "utf8",
);
const resolver = readFileSync(
  "scripts/resolve-v2-production-pages-origin.mjs",
  "utf8",
);
const triggerHandoff = readFileSync(
  "scripts/handoff-v2-production-cloud-runtime-queue-consumers.mjs",
  "utf8",
);
const triggerConfig = readFileSync(
  "scripts/prepare-v2-cloud-runtime-trigger-config.mjs",
  "utf8",
);
const pagesDomainHandoff = readFileSync(
  "scripts/handoff-v2-rc10-production-pages-domain.mjs",
  "utf8",
);

describe("production dispatcher hardening", () => {
  it("is main-only and exact-RC10/readiness-tag gated", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.ref_type == 'branch'");
    expect(workflow).toContain(
      "ACTIVE_RC_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd",
    );
    expect(workflow).toContain("ACTIVE_RC_TAG: v2-production-rc10");
    expect(workflow).toContain("READINESS_TAG: v2-production-ready");
    expect(workflow).toContain(
      'test "$(git rev-list -n 1 "$READINESS_TAG")" = "$ACTIVE_RC_SHA"',
    );
    expect(workflow).not.toContain("git merge-base --is-ancestor");
    expect(workflow).not.toContain("git tag --contains");
  });

  it("uses a main-owned V2 smoke with an exact RC10 checkout", () => {
    const smoke = workflow.slice(workflow.indexOf("  smoke-production:"));
    expect(smoke).toContain("path: ops");
    expect(smoke).toContain("ref: refs/heads/main");
    expect(smoke).toContain("path: release");
    expect(smoke).toContain(
      "node ops/scripts/verify-v2-production-public-smoke.mjs",
    );
    expect(smoke).toContain(
      "PRODUCTION_SMOKE_TENANT_URL: https://${{ vars.PRODUCTION_SMOKE_TENANT_HOSTNAME }}",
    );
    expect(smoke).not.toContain(
      "PRODUCTION_SMOKE_TENANT_URL: https://next.labofscents.org",
    );
    expect(smoke).not.toContain("test:qa:production-smoke");
    expect(smoke).not.toContain("npm ci");
  });

  it("never feeds the candidate Pages origin to production Router deployment", () => {
    const router = workflow.slice(
      workflow.indexOf("  deploy-production-tenant-router:"),
      workflow.indexOf("  deploy-production-pages:"),
    );
    expect(router).toContain("resolve-v2-production-pages-origin.mjs");
    expect(resolver).toContain("PAGES_PRODUCTION_FIVE_ROUTES=PASS");
    expect(router).not.toContain("PRODUCTION_CANDIDATE_PAGES_ORIGIN");
    expect(router).not.toContain("production-candidate.${");
  });

  it("keeps the public Pages apex handoff exact, compensating, and independent from Worker route edits", () => {
    const pagesDomain = workflow.slice(
      workflow.indexOf("  handoff-production-pages-domain:"),
      workflow.indexOf("  handoff-production-first-release-routes:"),
    );
    expect(workflow).toContain("- pages-domain-handoff");
    expect(workflow).toContain("HANDOFF_PRODUCTION_PAGES_DOMAIN");
    expect(pagesDomain).toContain("environment: production");
    expect(pagesDomain).toContain(
      "handoff-v2-rc10-production-pages-domain.mjs preflight",
    );
    expect(pagesDomain).toContain(
      "handoff-v2-rc10-production-pages-domain.mjs handoff",
    );
    expect(pagesDomain).toContain(
      "handoff-v2-rc10-production-pages-domain.mjs recover",
    );
    expect(pagesDomain).toContain(
      "if: ${{ failure() && steps.preflight.outcome == 'success' }}",
    );
    expect(pagesDomain).toContain("if: ${{ always() }}");
    expect(pagesDomain).toContain("PAGES_DOMAIN_BASELINE_FILE");
    expect(pagesDomain).not.toContain("wrangler pages deploy");
    expect(pagesDomain).not.toContain("workers/routes");
    expect(pagesDomain).not.toMatch(/env:\n\s+CLOUDFLARE_API_TOKEN:/);
    expect(pagesDomainHandoff).toContain("PAGES_DOMAIN_PREDECESSOR_UNPROVEN");
    expect(pagesDomainHandoff).toContain("PAGES_DOMAIN_RECOVERY=PASS");
    expect(pagesDomainHandoff).toContain(
      "PRODUCTION_PAGES_DOMAIN_API_OPERATION=",
    );
    expect(pagesDomainHandoff).toContain(
      "PRODUCTION_PAGES_DOMAIN_API_HTTP_STATUS=",
    );
    expect(pagesDomainHandoff).toContain(
      "PRODUCTION_PAGES_DOMAIN_API_CF_ERROR_CODE=",
    );
    expect(pagesDomainHandoff).not.toContain("console.error");
    expect(pagesDomainHandoff).not.toContain("error.message");
  });

  it("runs the Pages-domain token preflight as a production-gated GET-only operation", () => {
    const tokenPreflight = workflow.slice(
      workflow.indexOf("  preflight-production-pages-domain-token:"),
      workflow.indexOf("  handoff-production-pages-domain:"),
    );
    expect(workflow).toContain("- pages-domain-token-preflight");
    expect(workflow).toContain("VERIFY_PRODUCTION_PAGES_DOMAIN_TOKEN");
    expect(tokenPreflight).toContain("environment: production");
    expect(tokenPreflight).toContain(
      "handoff-v2-rc10-production-pages-domain.mjs token-preflight",
    );
    expect(tokenPreflight).not.toContain("PAGES_DOMAIN_BASELINE_FILE");
    expect(tokenPreflight).not.toContain(
      "handoff-v2-rc10-production-pages-domain.mjs handoff",
    );
    expect(tokenPreflight).not.toContain(
      "handoff-v2-rc10-production-pages-domain.mjs recover",
    );
    expect(tokenPreflight).not.toContain("wrangler");
    expect(tokenPreflight).not.toContain("curl");
    expect(pagesDomainHandoff).toContain(
      'emit("CLOUDFLARE_PAGES_PROJECT_READ=PASS")',
    );
  });

  it("selects the exact production Pages deployment from canonical metadata", () => {
    expect(resolver).toContain(
      "deployment_trigger?.metadata?.branch === branch",
    );
    expect(resolver).toMatch(
      /deployment_trigger\?\.metadata\?\.commit_hash\?\.toLowerCase\(\)\s*===\s*sha/,
    );
    expect(resolver).not.toContain("deployment?.branch === branch");
    expect(resolver).not.toContain("deployment?.commit_hash?.toLowerCase()");
  });

  it("stages and verifies the private Cloud Runtime trigger handoff before queue ownership moves", () => {
    const cloudRuntime = workflow.slice(
      workflow.indexOf("  deploy-production-cloud-runtime:"),
      workflow.indexOf("  smoke-production:"),
    );
    expect(cloudRuntime).toContain(
      "handoff-v2-production-cloud-runtime-queue-consumers.mjs preflight",
    );
    expect(cloudRuntime).toContain(
      "prepare-v2-cloud-runtime-trigger-config.mjs",
    );
    expect(cloudRuntime).toContain(
      "wrangler.v2-cloud-runtime.production.bootstrap.toml",
    );
    expect(cloudRuntime).toContain(
      "wrangler.v2-cloud-runtime.production.workflow.toml",
    );
    expect(cloudRuntime).toContain(
      "handoff-v2-production-cloud-runtime-queue-consumers.mjs handoff",
    );
    expect(cloudRuntime).toContain(
      "handoff-v2-production-cloud-runtime-queue-consumers.mjs postflight",
    );
    expect(cloudRuntime.indexOf("queue-consumers.mjs preflight")).toBeLessThan(
      cloudRuntime.indexOf("queue-consumers.mjs handoff"),
    );
    expect(cloudRuntime.indexOf("queue-consumers.mjs handoff")).toBeLessThan(
      cloudRuntime.indexOf("queue-consumers.mjs postflight"),
    );
    expect(cloudRuntime).toContain(
      "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
    );
    expect(cloudRuntime).not.toMatch(/env:\n\s+CLOUDFLARE_API_TOKEN:/);
    expect(cloudRuntime).not.toMatch(
      /env:\n\s+SCIENTIFIC_CONTAINER_SHARED_SECRET:/,
    );
  });

  it("keeps Cloud Runtime trigger changes route-free, exact, and recovery-aware", () => {
    expect(triggerConfig).toContain("workers_dev = false");
    expect(triggerConfig).toContain(
      "CLOUD_RUNTIME_TRIGGER_CONFIG_ROUTE_INVALID",
    );
    expect(triggerConfig).toContain("candidateRecovery");
    expect(triggerHandoff).toContain("CLOUD_RUNTIME_QUEUE_HANDOFF_RECOVERY=");
    expect(triggerHandoff).toContain("restoreCandidateQueues");
    expect(triggerHandoff).toContain("CLOUD_RUNTIME_TRIGGER_POSTFLIGHT=");
    expect(triggerHandoff).not.toContain("console.error");
    expect(triggerHandoff).not.toContain("error.message");
    expect(triggerHandoff).not.toContain("wrangler deploy");
  });
});
