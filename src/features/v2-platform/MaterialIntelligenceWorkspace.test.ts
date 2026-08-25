import { describe, expect, it } from "vitest";
import {
  materialIntelligenceBaseFromRuntime,
  materialIntelligenceReasonText,
} from "./MaterialIntelligenceWorkspace";

describe("Material Intelligence workspace contract", () => {
  it("derives only the V2 Material Intelligence API base", () => {
    expect(
      materialIntelligenceBaseFromRuntime(
        "https://api-beta.labofscents.org/api/v1",
      ),
    ).toBe("https://api-beta.labofscents.org/api/v1/v2/material-intelligence");
    expect(materialIntelligenceBaseFromRuntime(undefined)).toBe(
      "/api/v1/v2/material-intelligence",
    );
  });

  it("explains natural, dilution, base and unresolved prediction blocks without guessing structure", () => {
    expect(materialIntelligenceReasonText(["NATURAL_COMPLEX"])).toContain(
      "Natural complex",
    );
    expect(materialIntelligenceReasonText(["DILUTION_PRODUCT"])).toContain(
      "verified active Chemical Entity",
    );
    expect(materialIntelligenceReasonText(["PROPRIETARY_BASE"])).toContain(
      "not represented as one molecule",
    );
    expect(materialIntelligenceReasonText(["UNRESOLVED_IDENTITY"])).toContain(
      "verified molecular structure required",
    );
    expect(materialIntelligenceReasonText(undefined)).toContain(
      "not been evaluated",
    );
  });
});
