import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path) => readFile(path, "utf8");

describe("V2 staging Material Intelligence bulk workflow", () => {
  it("pins main, staging, private source identity, batches, and accounting", async () => {
    const workflow = await read(
      ".github/workflows/v2-staging-material-intelligence-bulk.yml",
    );
    expect(workflow).toContain("STAGING_BRANCH: main");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("olfactoryops-v2-artifacts-staging");
    expect(workflow).toContain(
      "a49bede2801da2e0edb25a305fc3df8b751837e3d0aba6779bf0750e1e456ef4.xlsx",
    );
    expect(workflow).toContain('SOURCE_ROW_COUNT: "1986"');
    expect(workflow).toContain("--batch-size 50");
    expect(workflow).toContain("RERUN_NEW_DUPLICATE_MATERIALS=0");
    expect(workflow).toContain("BULK_PERSISTENCE_IDEMPOTENT=PASS");
  });

  it("has no production, route, public-source, or artifact-upload path", async () => {
    const workflow = await read(
      ".github/workflows/v2-staging-material-intelligence-bulk.yml",
    );
    expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("olfactoryops-v2-artifacts-production");
    expect(workflow).not.toMatch(/wrangler (deploy|routes|pages deploy)/);
    expect(workflow).not.toMatch(/upload-artifact|release upload|git add/);
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("Remove workbook and reports from runner");
  });

  it("requires protected credentials and exact V2 staging identity", async () => {
    const workflow = await read(
      ".github/workflows/v2-staging-material-intelligence-bulk.yml",
    );
    const preparation = await read(
      "scripts/prepare-material-intelligence-staging-demo.mjs",
    );
    expect(workflow).toContain(
      "MATERIAL_DEMO_LOGIN_EMAIL: ${{ secrets.MATERIAL_DEMO_LOGIN_EMAIL }}",
    );
    expect(workflow).toContain(
      "MATERIAL_DEMO_LOGIN_PASSWORD: ${{ secrets.MATERIAL_DEMO_LOGIN_PASSWORD }}",
    );
    expect(preparation).toMatch(
      /const API = ["']https:\/\/api-beta\.labofscents\.org\/api\/v1["']/,
    );
    expect(preparation).toMatch(
      /body\?\.membership\?\.status !== ["']ACTIVE["']/,
    );
    expect(preparation).toMatch(/body\?\.membership\?\.role !== ["']Owner["']/);
    expect(preparation).not.toMatch(/console\.(log|error)\((email|password)/);
  });
});
