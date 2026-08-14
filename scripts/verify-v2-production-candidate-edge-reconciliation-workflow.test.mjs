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
});
