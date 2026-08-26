import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path) => readFile(path, "utf8");

describe("Material Intelligence VC UI contract", () => {
  it("routes the global catalog independently from tenant Materials", async () => {
    const app = await read("src/features/v2-platform/V2PlatformApp.tsx");
    expect(app).toContain("import('./GlobalMaterialIntelligenceWorkspace')");
    expect(app).toContain("if (active === 'material-intelligence') return <Suspense");
    expect(app).toContain("if (active === 'materials' || active === 'suppliers'");
    expect(app).toContain("'/material-intelligence'");
    expect(app).toContain("materialIntelligenceApiBase");
  });

  it("uses authenticated global list and dedicated detail endpoints", async () => {
    const source = await read(
      "src/features/v2-platform/GlobalMaterialIntelligenceWorkspace.tsx",
    );
    expect(source).toContain("`/materials?${query}`");
    expect(source).toContain("`/materials/${encodeURIComponent(materialId)}`");
    expect(source).toContain("/material-intelligence/materials/${encodeURIComponent(materialId)}");
    expect(source).toMatch(/credentials:\s*["']include["']/);
    expect(source).not.toContain("/api/v1/auth/");
  });

  it("renders the required immutable global catalog and detail evidence", async () => {
    const source = await read(
      "src/features/v2-platform/GlobalMaterialIntelligenceWorkspace.tsx",
    );
    for (const label of [
      "Global Material Intelligence",
      "GLOBAL · READ ONLY",
      "Chemical entity",
      "InChI",
      "Physical properties",
      "Osmo taxonomy",
      "Scientific eligibility",
      "AI research prediction eligibility",
      "Source accounting",
      "Catalog release",
    ])
      expect(source).toContain(label);
    for (const filter of [
      "lifecycleStatus",
      "evidenceStatus",
      "resolutionStatus",
      "taxonomyNode",
    ])
      expect(source).toContain(filter);
    expect(source).toContain("pageSize = 25");
    expect(source).not.toContain("items[0]");
  });

  it("keeps the global surface read-only and prediction eligibility fail-closed", async () => {
    const source = await read(
      "src/features/v2-platform/GlobalMaterialIntelligenceWorkspace.tsx",
    );
    expect(source).toContain('payload.scope !== "GLOBAL"');
    expect(source).toContain("payload.readOnly !== true");
    expect(source).toContain('predictionEligibility?.result ?? "REVIEW_REQUIRED"');
    expect(source).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(source).not.toMatch(/>\s*(?:Edit|Delete|Save Changes)\s*</i);
  });

  it("provides scoped desktop and mobile layout rules", async () => {
    const css = await read("src/styles/features.css");
    expect(css).toContain(".v2-mi-layout");
    expect(css).toContain("@media (max-width: 880px)");
    expect(css).toContain("@media (max-width: 620px)");
  });
});
