import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  bulkIngestPlanSchema,
  type BulkIngestPlan,
  type MaterialIntelligenceImportAccounting,
  type MaterialIntelligenceImportCounts,
} from "../packages/contracts/src/material-intelligence.js";
import {
  assertMaterialIntelligenceApplyConfirmation,
  assertMaterialIntelligenceImportEnvironment,
  GovernedMaterialIntelligencePersistence,
  MATERIAL_INTELLIGENCE_IMPORT_BATCH_SIZE,
} from "../services/scientific/src/material-intelligence-persistence.js";

const execFileAsync = promisify(execFile);
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/i;

type Mode = "preview" | "apply";

type Options = {
  file: string;
  sheet: string;
  sourceSupplier?: string;
  expectedSha256?: string;
  mode: Mode;
  environment?: string;
  tenantId?: string;
  actorUserId?: string;
  runtimeRole?: string;
  confirmApply?: string;
  batchSize: number;
  failAfterBatches?: number;
};

type RunDependencies = {
  precheck?: (
    options: Options,
    sourcePath: string,
    outputDirectory: string,
  ) => Promise<BulkIngestPlan>;
  createPersistence?: (databaseUrl: string) => {
    persistence: GovernedMaterialIntelligencePersistence;
    disconnect: () => Promise<void>;
  };
  now?: () => Date;
};

function argumentValue(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error("BULK_IMPORT_ARGUMENT_VALUE_REQUIRED:" + name);
  return value;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(code);
  return parsed;
}

export function parseMaterialIntelligenceBulkImportArgs(
  args: string[],
): Options {
  const file = argumentValue(args, "--file");
  if (!file) throw new Error("BULK_IMPORT_SOURCE_FILE_REQUIRED");
  const rawMode = (argumentValue(args, "--mode") ?? "preview").toLowerCase();
  const mode = assertMaterialIntelligenceApplyConfirmation(
    rawMode,
    argumentValue(args, "--confirm-apply"),
  );
  const options: Options = {
    file,
    sheet: argumentValue(args, "--sheet") ?? "Material Intelligence",
    sourceSupplier: argumentValue(args, "--source-supplier"),
    expectedSha256: argumentValue(args, "--expected-sha256")?.toLowerCase(),
    mode,
    environment: argumentValue(args, "--environment"),
    tenantId: argumentValue(args, "--tenant"),
    actorUserId: argumentValue(args, "--actor-user"),
    runtimeRole:
      argumentValue(args, "--runtime-role") ??
      process.env.V2_RUNTIME_DATABASE_ROLE,
    confirmApply: argumentValue(args, "--confirm-apply"),
    batchSize: positiveInteger(
      argumentValue(args, "--batch-size"),
      MATERIAL_INTELLIGENCE_IMPORT_BATCH_SIZE,
      25,
      100,
      "BULK_IMPORT_BATCH_SIZE_INVALID",
    ),
    failAfterBatches:
      argumentValue(args, "--fail-after-batches") === undefined
        ? undefined
        : positiveInteger(
            argumentValue(args, "--fail-after-batches"),
            0,
            1,
            100_000,
            "BULK_IMPORT_FAILURE_INJECTION_INVALID",
          ),
  };
  if (options.expectedSha256 && !SHA256.test(options.expectedSha256))
    throw new Error("BULK_IMPORT_EXPECTED_SHA256_INVALID");
  if (mode === "apply") {
    if (!options.expectedSha256)
      throw new Error("BULK_IMPORT_EXPECTED_SHA256_REQUIRED");
    if (!options.environment)
      throw new Error("BULK_IMPORT_ENVIRONMENT_REQUIRED");
    assertMaterialIntelligenceImportEnvironment(options.environment);
    if (!options.tenantId || !options.actorUserId)
      throw new Error("BULK_IMPORT_TENANT_AND_ACTOR_REQUIRED");
    if (!options.runtimeRole)
      throw new Error("BULK_IMPORT_RUNTIME_ROLE_REQUIRED");
    if (
      options.failAfterBatches &&
      options.environment.toLowerCase() !== "test"
    )
      throw new Error("BULK_IMPORT_FAILURE_INJECTION_TEST_ONLY");
  }
  return options;
}

async function sha256File(path: string) {
  const digest = createHash("sha256");
  await new Promise<void>((accept, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("error", reject);
    stream.on("end", accept);
  });
  return digest.digest("hex");
}

async function secureSourcePath(input: string) {
  const absolute = resolve(input);
  const [canonicalPath, stat] = await Promise.all([
    realpath(absolute),
    lstat(absolute),
  ]);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error("BULK_IMPORT_REGULAR_FILE_REQUIRED");
  if (extname(canonicalPath).toLowerCase() !== ".xlsx")
    throw new Error("BULK_IMPORT_XLSX_REQUIRED");
  if (stat.size < 1 || stat.size > MAX_SOURCE_BYTES)
    throw new Error("BULK_IMPORT_SOURCE_SIZE_INVALID");
  return canonicalPath;
}

async function canonicalPrecheck(
  options: Options,
  sourcePath: string,
  outputDirectory: string,
) {
  const python =
    process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
  const args = [
    "scripts/material_intelligence_bulk_precheck.py",
    "--source",
    sourcePath,
    "--sheet",
    options.sheet,
    "--output-dir",
    outputDirectory,
  ];
  if (options.sourceSupplier)
    args.push("--source-supplier", options.sourceSupplier);
  if (options.expectedSha256)
    args.push("--expected-sha256", options.expectedSha256);
  try {
    await execFileAsync(python, args, {
      cwd: resolve(fileURLToPath(new URL("..", import.meta.url))),
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error("BULK_IMPORT_CANONICAL_PRECHECK_FAILED");
  }
  const raw = JSON.parse(
    await readFile(join(outputDirectory, "BULK_INGEST_PRECHECK.json"), "utf8"),
  ) as unknown;
  return bulkIngestPlanSchema.parse(raw);
}

function previewReport(plan: BulkIngestPlan) {
  return {
    mode: "PREVIEW",
    sourceFileHash: plan.source.fileSha256,
    sourceRows: plan.source.rowCount,
    waveCounts: Object.fromEntries(
      plan.recommendedIngestBatches.map(
        (batch: { wave: string; rowCount: number }) => [
          batch.wave,
          batch.rowCount,
        ],
      ),
    ),
    plannedMaterialProducts: plan.results.length,
    plannedChemicalEntities:
      plan.results.filter(
        (row) => row.chemicalEntityAction !== "NOT_APPLICABLE",
      ).length +
      plan.results.reduce((total, row) => total + row.componentPlan.length, 0),
    plannedComponents: plan.results.reduce(
      (total, row) => total + row.componentPlan.length,
      0,
    ),
    reviewRequired: plan.results.filter((row) => row.reviewRequired).length,
    conflicts: plan.results.filter((row) => row.conflictCodes.length > 0)
      .length,
    likelyEligible: plan.results.filter(
      (row) =>
        row.verifiedStructureCandidate &&
        row.chemicalEntityAction === "CREATE_VERIFIED_CANDIDATE",
    ).length,
    writeCount: 0,
  };
}

function mergeCounts(
  target: MaterialIntelligenceImportCounts,
  source: MaterialIntelligenceImportCounts,
) {
  target.materialProducts += source.materialProducts;
  target.components += source.components;
  target.evidence += source.evidence;
  for (const [key, value] of Object.entries(source.chemicalEntities))
    target.chemicalEntities[key] = (target.chemicalEntities[key] ?? 0) + value;
  for (const [key, value] of Object.entries(source.eligibilityDecisions))
    target.eligibilityDecisions[key] =
      (target.eligibilityDecisions[key] ?? 0) + value;
}

function safeFailureCode(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown };
  if (
    typeof candidate?.code === "string" &&
    /^[A-Z0-9_]+$/.test(candidate.code)
  )
    return candidate.code;
  if (
    typeof candidate?.message === "string" &&
    /^[A-Z0-9_]+$/.test(candidate.message)
  )
    return candidate.message;
  return "BULK_IMPORT_BATCH_FAILED";
}

export async function runMaterialIntelligenceBulkImport(
  args: string[],
  dependencies: RunDependencies = {},
) {
  const options = parseMaterialIntelligenceBulkImportArgs(args);
  const sourcePath = await secureSourcePath(options.file);
  const initialHash = await sha256File(sourcePath);
  if (options.expectedSha256 && options.expectedSha256 !== initialHash)
    throw new Error("SOURCE_FILE_SHA256_MISMATCH");
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "olfactoryops-mi-precheck-"),
  );
  try {
    const plan = await (dependencies.precheck ?? canonicalPrecheck)(
      options,
      sourcePath,
      outputDirectory,
    );
    const finalHash = await sha256File(sourcePath);
    if (initialHash !== finalHash || plan.source.fileSha256 !== finalHash)
      throw new Error("BULK_IMPORT_SOURCE_MUTATED");
    if (
      plan.source.sheet !== options.sheet ||
      plan.source.rowCount !== plan.results.length
    )
      throw new Error("BULK_IMPORT_SOURCE_ACCOUNTING_FAILED");
    if (
      plan.counts.ROWS_WITH_ZERO_WAVES !== 0 ||
      plan.counts.ROWS_WITH_MULTIPLE_WAVES !== 0
    )
      throw new Error("BULK_IMPORT_WAVE_ACCOUNTING_FAILED");
    if (options.mode === "preview") return previewReport(plan);

    const environment = assertMaterialIntelligenceImportEnvironment(
      options.environment!,
    );
    const databaseUrl =
      environment === "staging"
        ? process.env.STAGING_DATABASE_URL
        : process.env.V2_QA_DATABASE_URL;
    if (!databaseUrl)
      throw new Error(
        environment === "staging"
          ? "STAGING_DATABASE_URL_REQUIRED"
          : "V2_QA_DATABASE_URL_REQUIRED",
      );
    const factory =
      dependencies.createPersistence ??
      ((connectionString: string) => {
        const prisma = new PrismaClient({
          adapter: new PrismaPg({ connectionString }),
        });
        return {
          persistence: new GovernedMaterialIntelligencePersistence(prisma),
          disconnect: () => prisma.$disconnect(),
        };
      });
    const { persistence, disconnect } = factory(databaseUrl);
    const startedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const importRunId =
      "mi_run_" +
      createHash("sha256")
        .update(
          [options.tenantId, plan.source.fileSha256, plan.source.sheet].join(
            "\u001f",
          ),
        )
        .digest("hex")
        .slice(0, 40);
    const accounting: MaterialIntelligenceImportAccounting = {
      inputRows: plan.source.rowCount,
      plannedRows: plan.results.length,
      persistedRows: 0,
      skippedIdempotentRows: 0,
      failedRows: 0,
      unaccountedRows: plan.results.length,
    };
    const counts: MaterialIntelligenceImportCounts = {
      materialProducts: 0,
      chemicalEntities: {},
      components: 0,
      evidence: 0,
      eligibilityDecisions: {},
    };
    let failureCode: string | undefined;
    try {
      await persistence.attestSchemaAndRls(options.runtimeRole!);
      const context = await persistence.resolveOperatorContext(
        options.runtimeRole!,
        options.tenantId!,
        options.actorUserId!,
      );
      const batches = Array.from(
        { length: Math.ceil(plan.results.length / options.batchSize) },
        (_, index) =>
          plan.results.slice(
            index * options.batchSize,
            (index + 1) * options.batchSize,
          ),
      );
      for (const [index, rows] of batches.entries()) {
        if (options.failAfterBatches && index >= options.failAfterBatches) {
          failureCode = "BULK_IMPORT_INJECTED_FAILURE";
          break;
        }
        try {
          const result = await persistence.persistBatch({
            context,
            runtimeRole: options.runtimeRole!,
            importRunId,
            batchNumber: index + 1,
            source: {
              fileSha256: plan.source.fileSha256,
              sheet: plan.source.sheet,
              contractVersion: plan.contractVersion,
              policyVersion: plan.policyVersion,
              retrievedAt: startedAt,
            },
            rows,
          });
          accounting.persistedRows += result.persistedRows;
          accounting.skippedIdempotentRows += result.skippedIdempotentRows;
          mergeCounts(counts, result.counts);
        } catch (error) {
          accounting.failedRows += rows.length;
          failureCode = safeFailureCode(error);
          break;
        }
      }
      accounting.unaccountedRows =
        accounting.inputRows -
        accounting.persistedRows -
        accounting.skippedIdempotentRows -
        accounting.failedRows;
      const report = {
        importRunId,
        sourceFileHash: plan.source.fileSha256,
        tenantId: options.tenantId,
        startedAt,
        finishedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
        ...accounting,
        materialProductCount: counts.materialProducts,
        chemicalEntityCountsByState: counts.chemicalEntities,
        componentCount: counts.components,
        evidenceCount: counts.evidence,
        eligibilityDecisionCounts: counts.eligibilityDecisions,
        batchSize: options.batchSize,
        failureCode: failureCode ?? null,
      };
      if (failureCode || accounting.unaccountedRows !== 0) {
        const error = new Error("BULK_IMPORT_PARTIAL_FAILURE");
        Object.assign(error, { report });
        throw error;
      }
      return report;
    } finally {
      await disconnect();
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runMaterialIntelligenceBulkImport(process.argv.slice(2))
    .then((report) => process.stdout.write(JSON.stringify(report) + "\n"))
    .catch((error) => {
      const report =
        error && typeof error === "object" && "report" in error
          ? (error as { report: unknown }).report
          : undefined;
      if (report) process.stderr.write(JSON.stringify(report) + "\n");
      process.stderr.write(
        (error instanceof Error ? error.message : "BULK_IMPORT_FAILED") + "\n",
      );
      process.exitCode = 1;
    });
}
