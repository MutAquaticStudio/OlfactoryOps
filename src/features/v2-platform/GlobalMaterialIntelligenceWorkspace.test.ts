import { describe, expect, it } from "vitest";
import {
  globalMaterialDetailPath,
  globalMaterialFiltersFromSearch,
  globalMaterialIdFromPath,
  globalMaterialListPath,
  globalPhysicalPropertyValue,
  type PhysicalProperty,
} from "./GlobalMaterialIntelligenceWorkspace";

const property = (
  overrides: Partial<PhysicalProperty>,
): PhysicalProperty => ({
  id: "property_a",
  propertyKey: "BOILING_POINT",
  valueKind: "TEXT",
  sourceKind: "AUTHORITATIVE_PUBLIC_DATABASE",
  sourceRef: "https://example.test/evidence",
  sourceVersion: "2026-08-26",
  evidenceStatus: "VERIFIED",
  ...overrides,
});

describe("global Material Intelligence workspace contract", () => {
  it("keeps list and detail routes dedicated and preserves bounded filters", () => {
    const filters = globalMaterialFiltersFromSearch(
      "?text=Vanillin&evidenceStatus=VERIFIED&page=2",
    );

    expect(globalMaterialListPath(filters)).toContain("/material-intelligence?");
    expect(globalMaterialDetailPath("global material/a", filters)).toContain(
      "/material-intelligence/materials/global%20material%2Fa?",
    );
    expect(
      globalMaterialIdFromPath(
        "/material-intelligence/materials/global%20material%2Fa",
      ),
    ).toBe("global material/a");
  });

  it("renders exact, range and text physical-property assertions without fabrication", () => {
    expect(
      globalPhysicalPropertyValue(
        property({ valueKind: "EXACT_NUMERIC", numericValue: 285, unit: "degC" }),
      ),
    ).toBe("285 degC");
    expect(
      globalPhysicalPropertyValue(
        property({
          valueKind: "RANGE_NUMERIC",
          numericMin: 284,
          numericMax: 285,
          unit: "degC",
        }),
      ),
    ).toBe("284–285 degC");
    expect(
      globalPhysicalPropertyValue(
        property({ valueKind: "TEXT", textValue: "Colorless liquid" }),
      ),
    ).toBe("Colorless liquid");
    expect(
      globalPhysicalPropertyValue(
        property({ valueKind: "RANGE_NUMERIC", numericMin: 284 }),
      ),
    ).toBe("Not available");
  });
});
