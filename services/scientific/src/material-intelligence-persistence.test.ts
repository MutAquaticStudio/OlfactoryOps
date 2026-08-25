import { describe, expect, it, vi } from "vitest";
import type { BulkIngestPlanRow } from "../../../packages/contracts/src/material-intelligence.js";
import {
  assertMaterialIntelligenceApplyConfirmation,
  assertMaterialIntelligenceImportEnvironment,
  deterministicMaterialIntelligenceId,
  GovernedMaterialIntelligencePersistence,
  materialIntelligenceSourceIdentity,
} from "./material-intelligence-persistence.js";

const row: BulkIngestPlanRow = {
  sourceRowId: "Material Intelligence!2",
  sourceRowNumber: 2,
  sourceCatalogNumber: 1,
  inputName: "Vanillin",
  normalizedDisplayName: "Vanillin",
  supplierName: "Test supplier",
  supplierProductCode: null,
  productClassification: "NEAT_SUBSTANCE",
  chemicalEntityAction: "CREATE_UNRESOLVED",
  resolutionStatus: "UNRESOLVED",
  reviewRequired: false,
  sourceCasClaims: [
    { value: "121-33-5", formatStatus: "VALID" },
    { value: "121-33-6", formatStatus: "INVALID_CHECKSUM" },
  ],
  sourceCasRaw: "121-33-5 / 121-33-6",
  sourceFemaClaims: [],
  sourceEinecsClaims: [],
  componentPlan: [],
  eligibilityReasonCodes: ["NO_STRUCTURE"],
  conflictCodes: [],
  reasonCodes: ["NO_STRUCTURE"],
};

const context = {
  organizationId: "org_a",
  userId: "user_a",
  role: "Owner" as const,
  sessionId: "operator",
  hostname: "operator.local",
};
const source = {
  fileSha256: "a".repeat(64),
  sheet: "Material Intelligence",
  contractVersion: "bulk/1",
  policyVersion: "policy/1",
  retrievedAt: "2026-08-25T00:00:00.000Z",
};

describe("governed Material Intelligence persistence", () => {
  it("fails closed for production and requires explicit APPLY confirmation", () => {
    expect(() =>
      assertMaterialIntelligenceImportEnvironment("production"),
    ).toThrowError(
      expect.objectContaining({
        code: "PRODUCTION_BULK_IMPORT_NOT_AUTHORIZED",
      }),
    );
    expect(assertMaterialIntelligenceImportEnvironment("staging")).toBe(
      "staging",
    );
    expect(assertMaterialIntelligenceApplyConfirmation("preview")).toBe(
      "preview",
    );
    expect(() =>
      assertMaterialIntelligenceApplyConfirmation("apply"),
    ).toThrowError(
      expect.objectContaining({ code: "BULK_IMPORT_CONFIRMATION_REQUIRED" }),
    );
  });

  it("derives stable tenant/source identities without CAS or name merging", () => {
    const left = materialIntelligenceSourceIdentity(
      "org_a",
      source,
      row.sourceRowId,
    );
    const replay = materialIntelligenceSourceIdentity(
      "org_a",
      source,
      row.sourceRowId,
    );
    const otherTenant = materialIntelligenceSourceIdentity(
      "org_b",
      source,
      row.sourceRowId,
    );
    expect(left).toBe(replay);
    expect(left).not.toBe(otherTenant);
    expect(deterministicMaterialIntelligenceId("mat", left)).toBe(
      deterministicMaterialIntelligenceId("mat", replay),
    );
  });

  it("persists unresolved source claims without manufacturing molecular identity", async () => {
    const executed: string[] = [];
    const tx = {
      $executeRawUnsafe: vi.fn(async (sql: string) => {
        executed.push(sql);
        return 1;
      }),
      $queryRawUnsafe: vi.fn(async (sql: string) =>
        sql.startsWith("SELECT id, internal_code") ? [] : [],
      ),
    };
    const client = {
      $transaction: vi.fn(async (action: (client: typeof tx) => unknown) =>
        action(tx),
      ),
    };
    const service = new GovernedMaterialIntelligencePersistence(
      client as never,
    );
    const result = await service.persistBatch({
      context,
      runtimeRole: "v2_app",
      importRunId: "run_1",
      batchNumber: 1,
      source,
      rows: [row],
    });
    expect(result).toMatchObject({
      persistedRows: 1,
      skippedIdempotentRows: 0,
    });
    expect(
      executed.some((sql) => sql.includes("INSERT INTO v2_materials")),
    ).toBe(true);
    expect(
      executed.some((sql) => sql.includes("INSERT INTO v2_chemical_entities")),
    ).toBe(true);
    expect(
      executed.some((sql) =>
        sql.includes("INSERT INTO v2_molecular_identities"),
      ),
    ).toBe(false);
    expect(
      executed.some((sql) => sql.includes("v2_material_intelligence_evidence")),
    ).toBe(true);
    expect(
      executed.filter((sql) =>
        sql.includes("INSERT INTO v2_chemical_identifiers"),
      ),
    ).toHaveLength(2);
    expect(
      executed.filter((sql) =>
        sql.includes("v2_scientific_eligibility_decisions"),
      ),
    ).toHaveLength(2);
  });

  it("recognizes a complete deterministic replay as an idempotent skip", async () => {
    const identity = materialIntelligenceSourceIdentity(
      context.organizationId,
      source,
      row.sourceRowId,
    );
    const materialId = deterministicMaterialIntelligenceId("mat", identity);
    const internalCode = "MI-" + identity.slice(0, 40);
    const tx = {
      $executeRawUnsafe: vi.fn(async () => 1),
      $queryRawUnsafe: vi.fn(async (sql: string) => {
        if (sql.startsWith("SELECT id, internal_code"))
          return [{ id: materialId, internalCode }];
        if (sql.startsWith("SELECT id FROM v2_material_intelligence_evidence"))
          return [{ id: deterministicMaterialIntelligenceId("evm", identity) }];
        return [];
      }),
    };
    const client = {
      $transaction: vi.fn(async (action: (client: typeof tx) => unknown) =>
        action(tx),
      ),
    };
    const service = new GovernedMaterialIntelligencePersistence(
      client as never,
    );
    const result = await service.persistBatch({
      context,
      runtimeRole: "v2_app",
      importRunId: "run_1",
      batchNumber: 1,
      source,
      rows: [row],
    });
    expect(result).toMatchObject({
      persistedRows: 0,
      skippedIdempotentRows: 1,
    });
    expect(
      tx.$executeRawUnsafe.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO v2_materials"),
      ),
    ).toBe(false);
  });

  it("links only an explicit tenant entity with matching verified structure evidence", async () => {
    const linkedRow: BulkIngestPlanRow = {
      ...row,
      chemicalEntityAction: "LINK_VERIFIED_EXISTING",
      verifiedExistingEntityId: "entity_verified",
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
    };
    const executed: string[] = [];
    const tx = {
      $executeRawUnsafe: vi.fn(async (sql: string) => {
        executed.push(sql);
        return 1;
      }),
      $queryRawUnsafe: vi.fn(async (sql: string) => {
        if (sql.startsWith("SELECT id, internal_code")) return [];
        if (sql.startsWith("SELECT entity.id"))
          return [{ id: "entity_verified" }];
        return [];
      }),
    };
    const client = {
      $transaction: vi.fn(async (action: (client: typeof tx) => unknown) =>
        action(tx),
      ),
    };
    const service = new GovernedMaterialIntelligencePersistence(
      client as never,
    );
    const result = await service.persistBatch({
      context,
      runtimeRole: "v2_app",
      importRunId: "run_link",
      batchNumber: 1,
      source,
      rows: [linkedRow],
    });
    expect(result.persistedRows).toBe(1);
    expect(result.counts.chemicalEntities).toEqual({});
    expect(
      executed.some((sql) => sql.includes("INSERT INTO v2_chemical_entities")),
    ).toBe(false);
    expect(
      executed.some((sql) =>
        sql.includes("INSERT INTO v2_molecular_identities"),
      ),
    ).toBe(false);
  });
});
