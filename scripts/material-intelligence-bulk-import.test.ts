import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BulkIngestPlan,
  BulkIngestPlanRow,
} from "../packages/contracts/src/material-intelligence.js";
import {
  parseMaterialIntelligenceBulkImportArgs,
  runMaterialIntelligenceBulkImport,
} from "./material-intelligence-bulk-import.js";

const directories: string[] = [];
afterEach(async () => {
  delete process.env.V2_QA_DATABASE_URL;
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

const baseRow: BulkIngestPlanRow = {
  sourceRowId: "Sheet!2",
  sourceRowNumber: 2,
  sourceCatalogNumber: 1,
  inputName: "Material",
  normalizedDisplayName: "Material",
  supplierName: null,
  supplierProductCode: null,
  productClassification: "NEAT_SUBSTANCE",
  chemicalEntityAction: "CREATE_UNRESOLVED",
  resolutionStatus: "UNRESOLVED",
  reviewRequired: false,
  sourceCasClaims: [],
  sourceFemaClaims: [],
  sourceEinecsClaims: [],
  componentPlan: [],
  eligibilityReasonCodes: ["NO_STRUCTURE"],
  conflictCodes: [],
  reasonCodes: ["NO_STRUCTURE"],
};

async function fixture(rowCount: number) {
  const directory = await mkdtemp(join(tmpdir(), "mi-runner-test-"));
  directories.push(directory);
  const file = join(directory, "source.xlsx");
  const bytes = Buffer.from("bounded-xlsx-fixture");
  await writeFile(file, bytes);
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    ...baseRow,
    sourceRowId: "Sheet!" + (index + 2),
    sourceRowNumber: index + 2,
    sourceCatalogNumber: index + 1,
    inputName: "Material " + (index + 1),
    normalizedDisplayName: "Material " + (index + 1),
  }));
  const plan = {
    contractVersion: "bulk/1",
    policyVersion: "policy/1",
    rdkitContract: "rdkit/1",
    source: {
      fileName: "source.xlsx",
      fileSha256,
      format: "XLSX",
      sheet: "Material Intelligence",
      rowCount,
      columnCount: 3,
      supplierContext: null,
    },
    counts: { ROWS_WITH_ZERO_WAVES: 0, ROWS_WITH_MULTIPLE_WAVES: 0 },
    results: rows,
    recommendedIngestBatches: [{ wave: "Wave B", rowCount }],
    dataPrecheckReady: true,
  } as BulkIngestPlan;
  return { file, fileSha256, plan };
}

describe("Material Intelligence bulk runner", () => {
  it("defaults to preview and never permits production APPLY", () => {
    expect(
      parseMaterialIntelligenceBulkImportArgs(["--file", "source.xlsx"]),
    ).toMatchObject({ mode: "preview", batchSize: 50 });
    expect(() =>
      parseMaterialIntelligenceBulkImportArgs([
        "--file",
        "source.xlsx",
        "--mode",
        "apply",
        "--confirm-apply",
        "APPLY_MATERIAL_INTELLIGENCE_STAGING",
        "--expected-sha256",
        "a".repeat(64),
        "--environment",
        "production",
        "--tenant",
        "org_a",
        "--actor-user",
        "user_a",
        "--runtime-role",
        "v2_app",
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: "PRODUCTION_BULK_IMPORT_NOT_AUTHORIZED",
      }),
    );
  });

  it("reports canonical preview counts with zero writes", async () => {
    const { file, fileSha256, plan } = await fixture(2);
    const createPersistence = vi.fn();
    const report = await runMaterialIntelligenceBulkImport(
      ["--file", file, "--expected-sha256", fileSha256],
      {
        precheck: async () => plan,
        createPersistence,
      },
    );
    expect(report).toMatchObject({
      mode: "PREVIEW",
      sourceRows: 2,
      plannedMaterialProducts: 2,
      writeCount: 0,
    });
    expect(createPersistence).not.toHaveBeenCalled();
  });

  it("fails truthfully after an interrupted batch and resumes without duplicates", async () => {
    const { file, fileSha256, plan } = await fixture(51);
    process.env.V2_QA_DATABASE_URL = "postgresql://local.test/unused";
    const common = [
      "--file",
      file,
      "--mode",
      "apply",
      "--confirm-apply",
      "APPLY_MATERIAL_INTELLIGENCE_STAGING",
      "--expected-sha256",
      fileSha256,
      "--environment",
      "test",
      "--tenant",
      "org_a",
      "--actor-user",
      "user_a",
      "--runtime-role",
      "v2_app",
      "--batch-size",
      "25",
    ];
    const firstPersist = vi.fn(
      async ({ rows }: { rows: BulkIngestPlanRow[] }) => ({
        persistedRows: rows.length,
        skippedIdempotentRows: 0,
        counts: {
          materialProducts: rows.length,
          chemicalEntities: {},
          components: 0,
          evidence: rows.length,
          eligibilityDecisions: {},
        },
      }),
    );
    const persistence = {
      attestSchemaAndRls: vi.fn(async () => ({
        schema: "PASS",
        rls: "PASS",
        runtimeRole: "PASS",
      })),
      resolveOperatorContext: vi.fn(async () => ({
        organizationId: "org_a",
        userId: "user_a",
        role: "Owner",
        sessionId: "operator",
        hostname: "operator.local",
      })),
      persistBatch: firstPersist,
    };
    await expect(
      runMaterialIntelligenceBulkImport(
        [...common, "--fail-after-batches", "1"],
        {
          precheck: async () => plan,
          createPersistence: () => ({
            persistence: persistence as never,
            disconnect: async () => undefined,
          }),
        },
      ),
    ).rejects.toMatchObject({
      message: "BULK_IMPORT_PARTIAL_FAILURE",
      report: {
        persistedRows: 25,
        skippedIdempotentRows: 0,
        unaccountedRows: 26,
      },
    });

    const replayPersist = vi.fn(
      async ({ rows }: { rows: BulkIngestPlanRow[] }) => {
        const skipped = rows.filter((row) => row.sourceRowNumber < 27).length;
        return {
          persistedRows: rows.length - skipped,
          skippedIdempotentRows: skipped,
          counts: {
            materialProducts: rows.length - skipped,
            chemicalEntities: {},
            components: 0,
            evidence: rows.length - skipped,
            eligibilityDecisions: {},
          },
        };
      },
    );
    const report = await runMaterialIntelligenceBulkImport(common, {
      precheck: async () => plan,
      createPersistence: () => ({
        persistence: { ...persistence, persistBatch: replayPersist } as never,
        disconnect: async () => undefined,
      }),
    });
    expect(report).toMatchObject({
      inputRows: 51,
      persistedRows: 26,
      skippedIdempotentRows: 25,
      failedRows: 0,
      unaccountedRows: 0,
    });
  });
});
