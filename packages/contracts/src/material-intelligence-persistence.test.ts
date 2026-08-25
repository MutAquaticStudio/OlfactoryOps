import { describe, expect, it } from "vitest";
import {
  bulkIngestPlanRowSchema,
  bulkIngestPlanSchema,
  materialIntelligenceListQuerySchema,
} from "./material-intelligence.js";

const row = {
  sourceRowId: "Sheet!2",
  sourceRowNumber: 2,
  sourceCatalogNumber: 1,
  inputName: "Vanillin",
  normalizedDisplayName: "Vanillin",
  supplierName: null,
  supplierProductCode: null,
  productClassification: "NEAT_SUBSTANCE",
  chemicalEntityAction: "CREATE_UNRESOLVED",
  resolutionStatus: "UNRESOLVED",
  reviewRequired: false,
  sourceCasClaims: [{ value: "121-33-5", formatStatus: "VALID" }],
  componentPlan: [],
  eligibilityReasonCodes: ["NO_STRUCTURE"],
  conflictCodes: [],
  reasonCodes: ["NO_STRUCTURE"],
};

describe("Material Intelligence persistence and read contracts", () => {
  it("defaults list pagination to 50 and caps it at 100", () => {
    expect(materialIntelligenceListQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 50,
    });
    expect(
      materialIntelligenceListQuerySchema.safeParse({ pageSize: 101 }).success,
    ).toBe(false);
    expect(
      materialIntelligenceListQuerySchema.parse({ reviewRequired: "true" })
        .reviewRequired,
    ).toBe(true);
  });

  it("requires unique accounted canonical source rows and exclusive waves", () => {
    const base = {
      contractVersion: "bulk/1",
      policyVersion: "policy/1",
      rdkitContract: "rdkit/1",
      source: {
        fileName: "source.xlsx",
        fileSha256: "a".repeat(64),
        format: "XLSX",
        sheet: "Sheet",
        rowCount: 1,
        columnCount: 3,
        supplierContext: null,
      },
      counts: { ROWS_WITH_ZERO_WAVES: 0, ROWS_WITH_MULTIPLE_WAVES: 0 },
      results: [row],
      dataPrecheckReady: true,
    };
    expect(bulkIngestPlanSchema.safeParse(base).success).toBe(true);
    expect(
      bulkIngestPlanSchema.safeParse({
        ...base,
        source: { ...base.source, rowCount: 2 },
      }).success,
    ).toBe(false);
    expect(
      bulkIngestPlanSchema.safeParse({
        ...base,
        counts: { ROWS_WITH_ZERO_WAVES: 1, ROWS_WITH_MULTIPLE_WAVES: 0 },
      }).success,
    ).toBe(false);
    expect(
      bulkIngestPlanSchema.safeParse({
        ...base,
        source: { ...base.source, rowCount: 2 },
        results: [row, row],
      }).success,
    ).toBe(false);
  });

  it("requires governed structure evidence and an explicit entity for verified links", () => {
    expect(
      bulkIngestPlanRowSchema.safeParse({
        ...row,
        chemicalEntityAction: "CREATE_VERIFIED_CANDIDATE",
      }).success,
    ).toBe(false);
    expect(
      bulkIngestPlanRowSchema.safeParse({
        ...row,
        chemicalEntityAction: "LINK_VERIFIED_EXISTING",
        verifiedStructureCandidate: {
          canonicalSmiles: "CCO",
          isomericSmiles: null,
          inchi: null,
          inchiKey: "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
          structureHash: "b".repeat(64),
          normalizationVersion: "normalization/1",
          rdkitVersion: "2026.03.5",
          molecularFormula: "C2H6O",
          molecularWeight: 46.07,
          sourceRef: "https://example.test/evidence",
        },
      }).success,
    ).toBe(false);
    expect(
      bulkIngestPlanRowSchema.safeParse({
        ...row,
        chemicalEntityAction: "LINK_VERIFIED_EXISTING",
        verifiedExistingEntityId: "entity_verified",
      }).success,
    ).toBe(false);
  });
});
