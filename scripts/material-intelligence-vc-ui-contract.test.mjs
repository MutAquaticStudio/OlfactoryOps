import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path) => readFile(path, "utf8");

describe("Material Intelligence VC UI contract", () => {
  it("routes V2 Materials to the dedicated intelligence workspace", async () => {
    const app = await read("src/features/v2-platform/V2PlatformApp.tsx");
    expect(app).toContain("import('./MaterialIntelligenceWorkspace')");
    expect(app).toContain("if (active === 'materials') return <Suspense");
    expect(app).toContain("materialIntelligenceApiBase");
  });

  it("uses real tenant-scoped intelligence list, detail and entity endpoints", async () => {
    const source = await read(
      "src/features/v2-platform/MaterialIntelligenceWorkspace.tsx",
    );
    expect(source).toMatch(/["']\/api\/v1\/v2\/material-intelligence["']/);
    expect(source).toContain("`/materials?${query}`");
    expect(source).toContain("`/materials/${encodeURIComponent(selectedId)}`");
    expect(source).toContain(
      "`/chemical-entities/${encodeURIComponent(material.primaryChemicalEntityId)}`",
    );
    expect(source).toMatch(/credentials:\s*["']include["']/);
    expect(source).not.toContain("/api/v1/auth/");
  });

  it("renders every required catalog/detail section and bounded filters", async () => {
    const source = await read(
      "src/features/v2-platform/MaterialIntelligenceWorkspace.tsx",
    );
    for (const label of [
      "Material Catalog",
      "Material Product",
      "Chemical Identity",
      "Composition / Components",
      "Scientific Eligibility",
      "Evidence / Provenance",
      "AI / Molecular Intelligence",
    ])
      expect(source).toContain(label);
    for (const filter of [
      "productClassification",
      "eligibility",
      "resolutionStatus",
      "reviewRequired",
    ])
      expect(source).toContain(filter);
    expect(source).toContain("pageSize = 25");
    expect(source).toContain(
      "Material Products remain separate from verified Chemical Entities",
    );
    expect(source).toMatch(
      /No\s+molecular\s+structure\s+is\s+inferred\s+from\s+name,\s+formula\s+or\s+CAS\s+alone/,
    );
  });

  it("keeps research prediction fail-closed and avoids proprietary Osmo claims", async () => {
    const source = await read(
      "src/features/v2-platform/MaterialIntelligenceWorkspace.tsx",
    );
    const research = await read(
      "src/features/v2-platform/OlfactoryResearchPanel.tsx",
    );
    expect(source).toMatch(/decision\?\.result\s*===\s*["']ELIGIBLE["']/);
    expect(source).toContain("predictionAllowed={predictionAllowed}");
    expect(research).toContain("Run Research Prediction");
    expect(research).toContain(
      "disabled={!material || !modelVersionId || !predictionAllowed",
    );
    expect(`${source}\n${research}`).not.toMatch(
      /powered by osmo|proprietary osmo/i,
    );
  });

  it("provides scoped desktop and mobile layout rules", async () => {
    const css = await read("src/styles/features.css");
    expect(css).toContain(".v2-mi-layout");
    expect(css).toContain("@media (max-width: 880px)");
    expect(css).toContain("@media (max-width: 620px)");
  });
});
