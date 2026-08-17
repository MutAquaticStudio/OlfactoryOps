import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const workflow = readFileSync(
  ".github/workflows/v2-production-candidate-rc10-pages-origin-reconciliation.yml",
  "utf8",
);

test("RC10 origin reconciliation is exact, candidate-only, and main-gated", () => {
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain("TARGET_RELEASE_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd");
  expect(workflow).toContain("TARGET_RELEASE_TAG: v2-production-rc10");
  expect(workflow).toContain("TARGET_PAGES_ORIGIN: https://6fceca39.olfactoryops-v2-production-candidate.pages.dev");
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain("v2-isolated-production-candidate-tenant-router");
  expect(workflow).not.toContain("wrangler pages");
  expect(workflow).not.toContain("--keep-vars");
  expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
  expect(workflow).not.toContain("api.labofscents.org");
  expect(workflow).not.toContain("routes = [{ pattern = ");
});

test("Pages verification and exact-domain preflight precede candidate Router deploy", () => {
  const pages = workflow.indexOf("Verify immutable RC10 Pages origin");
  const preflight = workflow.indexOf("Preflight exact candidate Custom Domain ownership");
  const deploy = workflow.indexOf("Deploy only the RC10 candidate Router");
  const verify = workflow.indexOf("Verify candidate Router now proxies immutable RC10 Pages");
  expect(pages).toBeGreaterThanOrEqual(0);
  expect(preflight).toBeGreaterThan(pages);
  expect(deploy).toBeGreaterThan(preflight);
  expect(verify).toBeGreaterThan(deploy);
  expect(workflow).toContain("if: always()");
  expect(workflow).toContain("RC10_ROUTER_RECONCILIATION_CLEANUP=PASS");
});
