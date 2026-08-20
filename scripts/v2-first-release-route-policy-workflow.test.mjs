import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const preparation = readFileSync(
  ".github/workflows/v2-rc10-production-pages-project-preparation.yml",
  "utf8",
);
const dispatcher = readFileSync(
  ".github/workflows/v2-production-release-dispatch.yml",
  "utf8",
);
const rollback = readFileSync(
  ".github/workflows/v2-production-first-release-rollback.yml",
  "utf8",
);
const policy = readFileSync(
  "scripts/v2-first-release-route-policy.mjs",
  "utf8",
);
const baselineVerifier = readFileSync(
  "scripts/persist-v2-first-release-route-baseline.mjs",
  "utf8",
);

describe("first-release route policy workflows", () => {
  it("verifies an externally provisioned baseline before Stage 5 can declare rollback readiness", () => {
    expect(preparation).toContain("contents: read");
    expect(preparation).not.toContain("actions: write");
    expect(preparation).toContain(
      "persist-v2-first-release-route-baseline.mjs",
    );
    expect(preparation).toContain(
      "PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE: ${{ vars.PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE }}",
    );
    expect(preparation).not.toContain("GITHUB_TOKEN");
    expect(preparation).not.toContain("GITHUB_REPOSITORY");
    expect(preparation).not.toContain("github.token");
    expect(preparation).not.toContain("$GITHUB_ENV");
    expect(baselineVerifier).not.toContain("GITHUB_TOKEN");
    expect(baselineVerifier).not.toContain("githubApi");
    expect(baselineVerifier).not.toContain("api.github.com");
    expect(baselineVerifier).not.toContain('method: "POST"');
    expect(
      preparation.indexOf("persist-v2-first-release-route-baseline.mjs"),
    ).toBeLessThan(
      preparation.indexOf("verify-v2-production-rollback-readiness.mjs"),
    );
    expect(preparation).not.toMatch(
      /workers\/routes.*\b(?:PUT|POST|PATCH|DELETE)\b/i,
    );
  });

  it("keeps public route handoff separate from exact RC10 route-free Worker deployment", () => {
    expect(dispatcher).toContain("- route-handoff");
    expect(dispatcher).toContain("HANDOFF_PRODUCTION_FIRST_RELEASE_ROUTES");
    expect(dispatcher).toContain(
      "prepare-v2-first-release-unrouted-config.mjs",
    );
    expect(dispatcher).toContain("execute-v2-first-release-route-handoff.mjs");
    expect(dispatcher).toContain("PRODUCTION_HYPERDRIVE_ID");
    expect(
      dispatcher.indexOf("prepare-v2-first-release-unrouted-config.mjs"),
    ).toBeLessThan(
      dispatcher.indexOf(
        "npx wrangler deploy --config .qa/wrangler.v2-api-production.toml",
      ),
    );
    expect(dispatcher).toContain(
      'test "$(git rev-list -n 1 "$READINESS_TAG")" = "$ACTIVE_RC_SHA"',
    );
  });

  it("makes rollback main-only, exact-RC10, reviewer-gated, and route-restoration-first", () => {
    expect(rollback).toContain("workflow_dispatch:");
    expect(rollback).toContain("github.ref == 'refs/heads/main'");
    expect(rollback).toContain("environment: production");
    expect(rollback).toContain("ROLLBACK_RC10_FIRST_RELEASE");
    expect(rollback).toContain("DELETE_RC10_FIRST_RELEASE_WORKERS");
    expect(rollback).toContain("execute-v2-first-release-route-rollback.mjs");
    expect(rollback).not.toMatch(/wrangler\s+deploy/i);
    expect(policy.indexOf("restoreApprovedRoutes")).toBeLessThan(
      policy.indexOf("deleteFirstReleaseWorkers"),
    );
    expect(policy).toContain('state: "RC10_ROUTE_STILL_ATTACHED"');
    expect(policy).toContain('state: "RC10_CUSTOM_DOMAIN_UNPROVEN"');
    expect(policy).toContain("RELEASE_GIT_SHA");
    expect(policy).toContain("RELEASE_ENVIRONMENT");
    expect(policy).toContain("PAGES_ORIGIN");
  });

  it("keeps route identifiers and target names out of safe emitted evidence", () => {
    expect(policy).not.toContain("console.log");
    expect(policy).not.toContain("process.stdout.write");
    expect(policy).not.toContain("error.message");
  });
});
