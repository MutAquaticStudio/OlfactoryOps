import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = resolve(
  ".github/workflows/v2-production-candidate-edge-reconciliation.yml",
);
const workflow = readFileSync(workflowPath, "utf8");
const renderer = readFileSync(
  resolve("scripts/render-v2-production-candidate-edge-router-config.mjs"),
  "utf8",
);
const reconciliation = readFileSync(
  resolve("scripts/reconcile-v2-production-candidate-edge.mjs"),
  "utf8",
);

describe("RC9 candidate edge reconciliation workflow contract", () => {
  it("passes the static candidate-only boundary verifier", () => {
    const output = execFileSync(
      process.execPath,
      [
        "scripts/verify-v2-production-candidate-edge-reconciliation-workflow.mjs",
      ],
      { encoding: "utf8" },
    );
    expect(output).toContain("CANDIDATE_EDGE_RECONCILIATION_WORKFLOW=PASS");
  });

  it("uses a protected exact-RC9 Router reconciliation without Pages or database mutation", () => {
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("CANDIDATE_PAGES_ORIGIN");
    expect(renderer).toContain("custom_domain = true");
    expect(workflow).not.toContain("wrangler pages deploy");
    expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("*.labofscents.org/*");
    expect(workflow).not.toContain("*.next.labofscents.org/*");
  });

  it("selects immutable Pages before any candidate Router mutation", () => {
    const mainInstall = workflow.indexOf("npm ci --ignore-scripts");
    const inventory = workflow.indexOf("pages-inventory");
    const preflight = workflow.indexOf("domain-preflight");
    const deploy = workflow.indexOf("./node_modules/.bin/wrangler deploy");

    expect(mainInstall).toBeGreaterThanOrEqual(0);
    expect(inventory).toBeGreaterThan(mainInstall);
    expect(preflight).toBeGreaterThan(inventory);
    expect(deploy).toBeGreaterThan(preflight);
  });

  it("keeps safe REST ladder and native Wrangler inventory boundaries", () => {
    expect(reconciliation).toContain(
      "if (resultInfo === undefined) return {};",
    );
    expect(reconciliation).toContain("PAGES_DEPLOYMENTS_FAILURE_CLASS");
    expect(reconciliation).toContain("PAGES_DEPLOYMENTS_HTTP_STATUS");
    expect(reconciliation).toContain("PAGES_DEPLOYMENTS_CF_ERROR_CODE");
    expect(reconciliation).toContain("PAGES_PROJECT_PRODUCTION_BRANCH");
    expect(reconciliation).toContain("EXPECTED_CANDIDATE_PAGES_ENVIRONMENT");
    expect(reconciliation).toContain("PAGES_DEPLOYMENTS_PREVIEW_HTTP_STATUS");
    expect(reconciliation).toContain(
      "PAGES_DEPLOYMENTS_PRODUCTION_HTTP_STATUS",
    );
    expect(reconciliation).toContain("PAGES_DEPLOYMENT_COUNT_ALL");
    expect(reconciliation).toContain("pagesDeploymentsPerPage = 20");
    expect(reconciliation).toContain("edgeKnownImmutablePagesOrigin");
    expect(reconciliation).toContain("runWranglerPagesInventory");
    expect(reconciliation).toContain('WRANGLER_WRITE_LOGS: "false"');
    expect(reconciliation).toContain("PAGES_KNOWN_DEPLOYMENT_RELEASE_JSON");
    expect(reconciliation).toContain("PAGES_KNOWN_DEPLOYMENT_FIVE_ROUTES");
    expect(reconciliation).toContain("PAGES_RC9_ARTIFACT_RELEASE_IDENTITY");
    expect(reconciliation).not.toContain("npx wrangler");
    expect(reconciliation).toContain('"PAGINATION_LIMIT"');
    expect(reconciliation).not.toContain(
      "PAGES_DEPLOYMENTS_PAGE100_HTTP_STATUS",
    );
    expect(reconciliation).not.toContain(
      "PAGES_DEPLOYMENTS_PER_PAGE_100_REJECTED",
    );
    expect(reconciliation).not.toContain(
      "!resultInfo || !Number.isInteger(resultInfo.page)",
    );
  });
});
