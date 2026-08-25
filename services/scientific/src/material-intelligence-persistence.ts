import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  bulkIngestPlanRowSchema,
  type BulkIngestPlanRow,
  type MaterialIntelligenceImportCounts,
} from "../../../packages/contracts/src/material-intelligence.js";
import { platformRoleSchema } from "../../../packages/contracts/src/platform.js";
import { PlatformError } from "../../platform/src/service.js";
import type { PlatformContext } from "../../platform/src/types.js";

type Transaction = Prisma.TransactionClient;

type SourceContract = {
  fileSha256: string;
  sheet: string;
  contractVersion: string;
  policyVersion: string;
  retrievedAt: string;
};

type PersistBatchInput = {
  context: PlatformContext;
  runtimeRole: string;
  importRunId: string;
  batchNumber: number;
  source: SourceContract;
  rows: BulkIngestPlanRow[];
};

type PersistBatchResult = {
  persistedRows: number;
  skippedIdempotentRows: number;
  counts: MaterialIntelligenceImportCounts;
};

const REQUIRED_TABLES = [
  "v2_chemical_entities",
  "v2_chemical_identifiers",
  "v2_material_components",
  "v2_material_intelligence_evidence",
  "v2_scientific_eligibility_decisions",
] as const;

const MUTABLE_TABLES = new Set([
  "v2_chemical_entities",
  "v2_chemical_identifiers",
  "v2_material_components",
]);

const REQUIRED_OPERATOR_PERMISSIONS = [
  "materials.edit",
  "materials.approve",
  "imports.commit",
] as const;
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/i;

export const MATERIAL_INTELLIGENCE_IMPORT_BATCH_SIZE = 50;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function contentHash(value: unknown) {
  return hash(JSON.stringify(canonical(value)));
}

export function deterministicMaterialIntelligenceId(
  kind: string,
  ...identity: string[]
) {
  if (!/^[a-z][a-z0-9_]{0,20}$/.test(kind))
    throw new Error("MATERIAL_INTELLIGENCE_ID_KIND_INVALID");
  return "mi_" + kind + "_" + hash(identity.join("\u001f")).slice(0, 40);
}

export function materialIntelligenceSourceIdentity(
  organizationId: string,
  source: SourceContract,
  sourceRowId: string,
) {
  return hash(
    [organizationId, source.fileSha256, source.sheet, sourceRowId].join(
      "\u001f",
    ),
  );
}

export function assertMaterialIntelligenceImportEnvironment(
  environment: string,
) {
  const normalized = environment.trim().toLowerCase();
  if (normalized === "production")
    throw new PlatformError(
      "PRODUCTION_BULK_IMPORT_NOT_AUTHORIZED",
      "Production bulk import is not authorized.",
      403,
    );
  if (normalized !== "staging" && normalized !== "test") {
    throw new PlatformError(
      "BULK_IMPORT_ENVIRONMENT_INVALID",
      "The bulk import target must be explicitly staging or test.",
      422,
    );
  }
  return normalized as "staging" | "test";
}

export function assertMaterialIntelligenceApplyConfirmation(
  mode: string,
  confirmation?: string,
) {
  const normalized = mode.trim().toLowerCase();
  if (normalized !== "preview" && normalized !== "apply")
    throw new PlatformError(
      "BULK_IMPORT_MODE_INVALID",
      "Use preview or apply mode.",
      422,
    );
  if (
    normalized === "apply" &&
    confirmation !== "APPLY_MATERIAL_INTELLIGENCE_STAGING"
  ) {
    throw new PlatformError(
      "BULK_IMPORT_CONFIRMATION_REQUIRED",
      "Explicit staging apply confirmation is required.",
      428,
    );
  }
  return normalized as "preview" | "apply";
}

function emptyCounts(): MaterialIntelligenceImportCounts {
  return {
    materialProducts: 0,
    chemicalEntities: {},
    components: 0,
    evidence: 0,
    eligibilityDecisions: {},
  };
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

function entityType(row: BulkIngestPlanRow) {
  switch (row.productClassification) {
    case "NEAT_SUBSTANCE":
      return "SINGLE_SUBSTANCE";
    case "DILUTION":
    case "DEFINED_MIXTURE":
      return "DEFINED_MIXTURE";
    case "UNDEFINED_MIXTURE":
      return "UNDEFINED_OR_VARIABLE_COMPOSITION";
    case "NATURAL":
      return "NATURAL_COMPLEX";
    default:
      return "UNKNOWN";
  }
}

function productEligibility(row: BulkIngestPlanRow): {
  result: "NOT_ELIGIBLE" | "REVIEW_REQUIRED";
  reasons: string[];
} {
  const fixed = {
    DILUTION: "DILUTION_PRODUCT",
    DEFINED_MIXTURE: "DEFINED_MIXTURE",
    UNDEFINED_MIXTURE: "UNDEFINED_MIXTURE",
    NATURAL: "NATURAL_COMPLEX",
    BASE: "PROPRIETARY_BASE",
    FORMULATION: "FORMULATION",
  } as const;
  const reason = fixed[row.productClassification as keyof typeof fixed];
  if (reason) return { result: "NOT_ELIGIBLE", reasons: [reason] };
  if (row.conflictCodes.length)
    return { result: "REVIEW_REQUIRED", reasons: ["IDENTITY_CONFLICT"] };
  if (row.productClassification === "UNKNOWN")
    return { result: "REVIEW_REQUIRED", reasons: ["UNKNOWN_COMPOSITION"] };
  return { result: "REVIEW_REQUIRED", reasons: ["NO_STRUCTURE"] };
}

function entityEligibility(row: BulkIngestPlanRow): {
  result: "NOT_ELIGIBLE" | "REVIEW_REQUIRED" | "ELIGIBLE";
  reasons: string[];
} {
  if (
    row.verifiedStructureCandidate &&
    (row.chemicalEntityAction === "CREATE_VERIFIED_CANDIDATE" ||
      row.chemicalEntityAction === "LINK_VERIFIED_EXISTING")
  ) {
    return { result: "ELIGIBLE", reasons: ["RESOLVED_SINGLE_SUBSTANCE"] };
  }
  if (row.conflictCodes.length)
    return { result: "REVIEW_REQUIRED", reasons: ["IDENTITY_CONFLICT"] };
  const type = entityType(row);
  if (type === "DEFINED_MIXTURE")
    return { result: "NOT_ELIGIBLE", reasons: ["DEFINED_MIXTURE"] };
  if (type === "UNDEFINED_OR_VARIABLE_COMPOSITION")
    return { result: "NOT_ELIGIBLE", reasons: ["UNDEFINED_MIXTURE"] };
  if (type === "NATURAL_COMPLEX")
    return { result: "NOT_ELIGIBLE", reasons: ["NATURAL_COMPLEX"] };
  return { result: "REVIEW_REQUIRED", reasons: ["UNRESOLVED_IDENTITY"] };
}

function sourceRef(source: SourceContract, row: BulkIngestPlanRow) {
  return (
    "bulk:" +
    source.fileSha256 +
    ":" +
    encodeURIComponent(source.sheet) +
    ":" +
    encodeURIComponent(row.sourceRowId)
  );
}

function normalizedIdentifier(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function safeRole(role: string) {
  if (!ROLE_NAME.test(role))
    throw new PlatformError(
      "BULK_IMPORT_RUNTIME_ROLE_INVALID",
      "The runtime database role is invalid.",
      422,
    );
  return role;
}

export class GovernedMaterialIntelligencePersistence {
  constructor(private readonly client: PrismaClient) {}

  private async scoped<T>(
    runtimeRole: string,
    context: Pick<PlatformContext, "organizationId" | "userId">,
    action: (tx: Transaction) => Promise<T>,
  ) {
    const role = safeRole(runtimeRole);
    return this.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE "' + role + '"');
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)",
        context.organizationId,
        context.userId,
      );
      return action(tx);
    });
  }

  async attestSchemaAndRls(runtimeRole: string) {
    const role = safeRole(runtimeRole);
    const roles = await this.client.$queryRawUnsafe<
      Array<{ superuser: boolean; bypassRls: boolean }>
    >(
      'SELECT rolsuper AS "superuser", rolbypassrls AS "bypassRls" FROM pg_roles WHERE rolname = $1',
      role,
    );
    if (!roles[0] || roles[0].superuser || roles[0].bypassRls) {
      throw new PlatformError(
        "BULK_IMPORT_RLS_ROLE_INVALID",
        "A non-bypass tenant runtime role is required.",
        409,
      );
    }
    const tables = await this.client.$queryRawUnsafe<
      Array<{ tableName: string; rlsEnabled: boolean; rlsForced: boolean }>
    >(
      'SELECT c.relname::text AS "tableName", c.relrowsecurity AS "rlsEnabled", c.relforcerowsecurity AS "rlsForced" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = \'public\' AND c.relname = ANY($1::text[])',
      [...REQUIRED_TABLES],
    );
    if (
      tables.length !== REQUIRED_TABLES.length ||
      tables.some((table) => !table.rlsEnabled || !table.rlsForced)
    ) {
      throw new PlatformError(
        "MATERIAL_INTELLIGENCE_SCHEMA_OR_RLS_NOT_READY",
        "Material Intelligence schema and forced RLS are required.",
        503,
      );
    }
    const policies = await this.client.$queryRawUnsafe<
      Array<{ tableName: string; policyCount: bigint }>
    >(
      "SELECT tablename::text AS \"tableName\", count(*) AS \"policyCount\" FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1::text[]) AND qual LIKE '%app.organization_id%' AND with_check LIKE '%app.organization_id%' GROUP BY tablename",
      [...REQUIRED_TABLES],
    );
    if (
      policies.length !== REQUIRED_TABLES.length ||
      policies.some((item) => Number(item.policyCount) < 1)
    ) {
      throw new PlatformError(
        "MATERIAL_INTELLIGENCE_RLS_POLICY_NOT_READY",
        "Canonical tenant RLS policies are required.",
        503,
      );
    }
    for (const table of REQUIRED_TABLES) {
      const privilege = await this.client.$queryRawUnsafe<
        Array<{
          canSelect: boolean;
          canInsert: boolean;
          canUpdate: boolean;
          canDelete: boolean;
        }>
      >(
        "SELECT has_table_privilege($1, $2, 'SELECT') AS \"canSelect\", has_table_privilege($1, $2, 'INSERT') AS \"canInsert\", has_table_privilege($1, $2, 'UPDATE') AS \"canUpdate\", has_table_privilege($1, $2, 'DELETE') AS \"canDelete\"",
        role,
        "public." + table,
      );
      const grant = privilege[0];
      if (
        !grant?.canSelect ||
        !grant.canInsert ||
        (MUTABLE_TABLES.has(table)
          ? !grant.canUpdate || !grant.canDelete
          : grant.canUpdate || grant.canDelete)
      ) {
        throw new PlatformError(
          "MATERIAL_INTELLIGENCE_RUNTIME_GRANTS_NOT_READY",
          "Material Intelligence runtime grants are not ready.",
          503,
        );
      }
    }
    return {
      schema: "PASS" as const,
      rls: "PASS" as const,
      runtimeRole: "PASS" as const,
    };
  }

  async resolveOperatorContext(
    runtimeRole: string,
    organizationId: string,
    userId: string,
  ): Promise<PlatformContext> {
    return this.scoped(runtimeRole, { organizationId, userId }, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          role: string;
          permissions: unknown;
        }>
      >(
        "SELECT membership.role_key AS role, policy.permissions FROM v2_memberships membership JOIN v2_organizations organization ON organization.id = membership.organization_id JOIN v2_users app_user ON app_user.id = membership.user_id LEFT JOIN v2_role_policies policy ON policy.organization_id = membership.organization_id AND policy.role_key = membership.role_key WHERE membership.organization_id = $1 AND membership.user_id = $2 AND membership.status = 'ACTIVE' AND organization.status = 'ACTIVE' AND app_user.status = 'ACTIVE' LIMIT 1",
        organizationId,
        userId,
      );
      const row = rows[0];
      const parsedRole = platformRoleSchema.safeParse(row?.role);
      const permissions = Array.isArray(row?.permissions)
        ? row.permissions.filter(
            (item): item is string => typeof item === "string",
          )
        : [];
      if (
        !parsedRole.success ||
        REQUIRED_OPERATOR_PERMISSIONS.some(
          (permission) => !permissions.includes(permission),
        )
      ) {
        throw new PlatformError(
          "BULK_IMPORT_OPERATOR_NOT_AUTHORIZED",
          "An active tenant operator with governed import permissions is required.",
          403,
        );
      }
      return {
        organizationId,
        userId,
        role: parsedRole.data,
        sessionId: "operator-bulk-import",
        hostname: "operator.local",
      };
    });
  }

  async persistBatch(input: PersistBatchInput): Promise<PersistBatchResult> {
    if (input.rows.length < 1 || input.rows.length > 100) {
      throw new PlatformError(
        "BULK_IMPORT_BATCH_INVALID",
        "A persistence batch must contain between 1 and 100 rows.",
        422,
      );
    }
    const rows = input.rows.map((row) => bulkIngestPlanRowSchema.parse(row));
    return this.scoped(input.runtimeRole, input.context, async (tx) => {
      const counts = emptyCounts();
      let persistedRows = 0;
      let skippedIdempotentRows = 0;
      for (const row of rows) {
        const identity = materialIntelligenceSourceIdentity(
          input.context.organizationId,
          input.source,
          row.sourceRowId,
        );
        const materialId = deterministicMaterialIntelligenceId("mat", identity);
        const internalCode = "MI-" + identity.slice(0, 40);
        const existing = await tx.$queryRawUnsafe<
          Array<{ id: string; internalCode: string | null }>
        >(
          'SELECT id, internal_code AS "internalCode" FROM v2_materials WHERE organization_id = $1 AND id = $2 LIMIT 1',
          input.context.organizationId,
          materialId,
        );
        if (existing[0]) {
          if (existing[0].internalCode !== internalCode) {
            throw new PlatformError(
              "BULK_IMPORT_IDEMPOTENCY_CONFLICT",
              "Existing source identity does not match the governed import.",
              409,
            );
          }
          const provenanceId = deterministicMaterialIntelligenceId(
            "evm",
            identity,
          );
          const provenance = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            "SELECT id FROM v2_material_intelligence_evidence WHERE organization_id = $1 AND material_id = $2 AND id = $3 LIMIT 1",
            input.context.organizationId,
            materialId,
            provenanceId,
          );
          if (!provenance[0]) {
            throw new PlatformError(
              "BULK_IMPORT_IDEMPOTENCY_INCOMPLETE",
              "An existing material lacks governed source provenance.",
              409,
            );
          }
          skippedIdempotentRows += 1;
          continue;
        }

        const rowHash = contentHash(row);
        const verified =
          row.chemicalEntityAction === "CREATE_VERIFIED_CANDIDATE" ||
          row.chemicalEntityAction === "LINK_VERIFIED_EXISTING"
            ? (row.verifiedStructureCandidate ?? null)
            : null;
        const materialStatus = row.reviewRequired ? "REVIEW_REQUIRED" : "DRAFT";
        await tx.$executeRawUnsafe(
          "INSERT INTO v2_materials (id, organization_id, name, internal_code, status, product_classification, supplier_name, supplier_product_code, trade_name, grade, physical_form, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          materialId,
          input.context.organizationId,
          row.normalizedDisplayName,
          internalCode,
          materialStatus,
          row.productClassification,
          row.supplierName,
          row.supplierProductCode,
          row.tradeName ?? null,
          row.grade ?? null,
          row.physicalForm ?? null,
          input.context.userId,
        );
        counts.materialProducts += 1;

        let entityId: string | null = null;
        if (row.chemicalEntityAction !== "NOT_APPLICABLE") {
          entityId = deterministicMaterialIntelligenceId("ent", identity);
          if (row.chemicalEntityAction === "LINK_VERIFIED_EXISTING") {
            if (!verified || !row.verifiedExistingEntityId) {
              throw new PlatformError(
                "BULK_IMPORT_VERIFIED_ENTITY_LINK_INVALID",
                "A governed strong identity link is required.",
                422,
              );
            }
            const linked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
              "SELECT entity.id FROM v2_chemical_entities entity JOIN v2_molecular_identities identity ON identity.organization_id = entity.organization_id AND identity.id = entity.molecular_identity_id WHERE entity.organization_id = $1 AND entity.id = $2 AND entity.resolution_status = 'RESOLVED' AND entity.evidence_status = 'VERIFIED' AND entity.verified_structure_hash = $3 AND entity.verified_inchikey = $4 AND identity.structure_hash = $3 AND identity.inchikey = $4 AND EXISTS (SELECT 1 FROM v2_material_intelligence_evidence evidence WHERE evidence.organization_id = entity.organization_id AND evidence.chemical_entity_id = entity.id AND evidence.assertion_key = 'STRUCTURE' AND evidence.evidence_status = 'VERIFIED') LIMIT 1",
              input.context.organizationId,
              row.verifiedExistingEntityId,
              verified.structureHash,
              verified.inchiKey,
            );
            if (!linked[0]) {
              throw new PlatformError(
                "BULK_IMPORT_VERIFIED_ENTITY_LINK_NOT_FOUND",
                "The explicit tenant entity does not match verified structure evidence.",
                409,
              );
            }
            entityId = linked[0].id;
          } else {
            let molecularIdentityId: string | null = null;
            if (verified) {
              molecularIdentityId = deterministicMaterialIntelligenceId(
                "mol",
                identity,
              );
              await tx.$executeRawUnsafe(
                "INSERT INTO v2_molecular_identities (id, organization_id, resolution_status, canonical_smiles, inchi, inchikey, structure_hash, canonicalization_version, rdkit_version, molecular_formula, molecular_weight, created_by) VALUES ($1,$2,'RESOLVED',$3,$4,$5,$6,$7,$8,$9,$10,$11)",
                molecularIdentityId,
                input.context.organizationId,
                verified.canonicalSmiles,
                verified.inchi,
                verified.inchiKey,
                verified.structureHash,
                verified.normalizationVersion,
                verified.rdkitVersion,
                verified.molecularFormula,
                verified.molecularWeight,
                input.context.userId,
              );
            }
            const resolution = verified
              ? "RESOLVED"
              : row.conflictCodes.length
                ? "CONFLICTED"
                : row.resolutionStatus;
            const evidenceStatus = verified
              ? "VERIFIED"
              : row.conflictCodes.length
                ? "CONFLICTED"
                : "UNVERIFIED";
            await tx.$executeRawUnsafe(
              "INSERT INTO v2_chemical_entities (id, organization_id, preferred_name, entity_type, resolution_status, evidence_status, molecular_identity_id, verified_structure_hash, verified_inchikey, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
              entityId,
              input.context.organizationId,
              row.normalizedDisplayName,
              entityType(row),
              resolution,
              evidenceStatus,
              molecularIdentityId,
              verified?.structureHash ?? null,
              verified?.inchiKey ?? null,
              input.context.userId,
            );
            increment(counts.chemicalEntities, resolution);
          }

          const identifierClaims: Array<{
            type: string;
            value: string;
            status: string;
          }> = [
            ...row.sourceCasClaims.map((claim) => ({
                type: "CAS",
                value: claim.value,
                status: "UNVERIFIED",
            })),
            ...row.sourceFemaClaims.map((value) => ({
              type: "FEMA",
              value,
              status: "UNVERIFIED",
            })),
            ...row.sourceEinecsClaims.map((value) => ({
              type: "EINECS",
              value,
              status: "UNVERIFIED",
            })),
            ...(row.tradeName
              ? [
                  {
                    type: "TRADE_NAME",
                    value: row.tradeName,
                    status: "UNVERIFIED",
                  },
                ]
              : []),
            ...(verified
              ? [
                  {
                    type: "SMILES",
                    value: verified.canonicalSmiles,
                    status: "VERIFIED",
                  },
                  {
                    type: "INCHIKEY",
                    value: verified.inchiKey,
                    status: "VERIFIED",
                  },
                  ...(verified.inchi
                    ? [
                        {
                          type: "INCHI",
                          value: verified.inchi,
                          status: "VERIFIED",
                        },
                      ]
                    : []),
                ]
              : []),
          ];
          for (const claim of identifierClaims) {
            const normalized = normalizedIdentifier(claim.value);
            const identifierId = deterministicMaterialIntelligenceId(
              "idn",
              identity,
              claim.type,
              normalized,
            );
            await tx.$executeRawUnsafe(
              "INSERT INTO v2_chemical_identifiers (id, organization_id, chemical_entity_id, identifier_type, identifier_value, normalized_value, evidence_status, source_ref, source_version, content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING",
              identifierId,
              input.context.organizationId,
              entityId,
              claim.type,
              claim.value,
              normalized,
              claim.status,
              sourceRef(input.source, row),
              input.source.contractVersion,
              rowHash,
            );
          }

          if (verified) {
            const structureEvidenceId = deterministicMaterialIntelligenceId(
              "evs",
              identity,
            );
            await tx.$executeRawUnsafe(
              "INSERT INTO v2_material_intelligence_evidence (id, organization_id, chemical_entity_id, assertion_key, source_kind, source_ref, source_version, retrieved_at, content_hash, evidence_status, metadata, created_by) VALUES ($1,$2,$3,'STRUCTURE','OPERATOR_ASSERTION',$4,$5,$6,$7,'VERIFIED',$8::jsonb,$9)",
              structureEvidenceId,
              input.context.organizationId,
              entityId,
              verified.sourceRef,
              input.source.contractVersion,
              input.source.retrievedAt,
              rowHash,
              JSON.stringify({
                normalizationVersion: verified.normalizationVersion,
                rdkitVersion: verified.rdkitVersion,
              }),
              input.context.userId,
            );
            counts.evidence += 1;
          }
        }

        for (const [componentIndex, component] of row.componentPlan.entries()) {
          const componentIdentity = identity + ":component:" + componentIndex;
          const componentEntityId = deterministicMaterialIntelligenceId(
            "ent",
            componentIdentity,
          );
          const componentId = deterministicMaterialIntelligenceId(
            "cmp",
            componentIdentity,
          );
          await tx.$executeRawUnsafe(
            "INSERT INTO v2_chemical_entities (id, organization_id, preferred_name, entity_type, resolution_status, evidence_status, created_by) VALUES ($1,$2,$3,'UNKNOWN','UNRESOLVED','UNVERIFIED',$4)",
            componentEntityId,
            input.context.organizationId,
            component.componentName,
            input.context.userId,
          );
          increment(counts.chemicalEntities, "UNRESOLVED");
          const concentrationKnown =
            component.concentration !== null && component.basis !== "UNKNOWN";
          await tx.$executeRawUnsafe(
            "INSERT INTO v2_material_components (id, organization_id, material_id, chemical_entity_id, component_name, component_role, concentration_kind, concentration_min, concentration_max, concentration_unit, concentration_basis, evidence_status, source_ref, source_version, content_hash, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'UNVERIFIED',$12,$13,$14,$15)",
            componentId,
            input.context.organizationId,
            materialId,
            componentEntityId,
            component.componentName,
            component.role,
            concentrationKnown ? "EXACT" : "UNKNOWN",
            concentrationKnown ? component.concentration : null,
            concentrationKnown ? component.concentration : null,
            concentrationKnown ? "PERCENT" : "UNKNOWN",
            concentrationKnown ? component.basis : "UNKNOWN",
            sourceRef(input.source, row),
            input.source.contractVersion,
            rowHash,
            input.context.userId,
          );
          const componentEvidenceId = deterministicMaterialIntelligenceId(
            "evc",
            componentIdentity,
          );
          await tx.$executeRawUnsafe(
            "INSERT INTO v2_material_intelligence_evidence (id, organization_id, component_id, assertion_key, source_kind, source_ref, source_version, retrieved_at, content_hash, evidence_status, metadata, created_by) VALUES ($1,$2,$3,'COMPOSITION','OPERATOR_ASSERTION',$4,$5,$6,$7,'UNVERIFIED',$8::jsonb,$9)",
            componentEvidenceId,
            input.context.organizationId,
            componentId,
            sourceRef(input.source, row),
            input.source.contractVersion,
            input.source.retrievedAt,
            rowHash,
            JSON.stringify({
              sourceConcentration: component.concentration,
              sourceBasis: component.basis,
            }),
            input.context.userId,
          );
          counts.components += 1;
          counts.evidence += 1;
        }

        const materialEvidenceId = deterministicMaterialIntelligenceId(
          "evm",
          identity,
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO v2_material_intelligence_evidence (id, organization_id, material_id, assertion_key, source_kind, source_ref, source_version, retrieved_at, content_hash, evidence_status, metadata, created_by) VALUES ($1,$2,$3,'PRODUCT_IDENTITY','OPERATOR_ASSERTION',$4,$5,$6,$7,'UNVERIFIED',$8::jsonb,$9)",
          materialEvidenceId,
          input.context.organizationId,
          materialId,
          sourceRef(input.source, row),
          input.source.contractVersion,
          input.source.retrievedAt,
          rowHash,
          JSON.stringify({
            sourceRowId: row.sourceRowId,
            sourceCasRaw: row.sourceCasRaw ?? null,
            supplierName: row.supplierName,
            supplierProductCode: row.supplierProductCode,
            sourceFormula: row.sourceFormula ?? null,
            sourceMolecularWeight: row.sourceMolecularWeight ?? null,
            reviewRequired: row.reviewRequired,
            reasonCodes: row.reasonCodes,
          }),
          input.context.userId,
        );
        counts.evidence += 1;

        const materialDecision = productEligibility(row);
        const materialDecisionId = deterministicMaterialIntelligenceId(
          "elm",
          identity,
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO v2_scientific_eligibility_decisions (id, organization_id, subject_type, material_id, chemical_entity_id, result, reason_codes, structure_hash, normalization_version, policy_version, evidence_hash, evaluated_by) VALUES ($1,$2,'MATERIAL_PRODUCT',$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)",
          materialDecisionId,
          input.context.organizationId,
          materialId,
          entityId,
          materialDecision.result,
          JSON.stringify(materialDecision.reasons),
          verified?.structureHash ?? null,
          verified?.normalizationVersion ?? null,
          input.source.policyVersion,
          rowHash,
          input.context.userId,
        );
        increment(counts.eligibilityDecisions, materialDecision.result);

        if (entityId) {
          const decision = entityEligibility(row);
          const entityDecisionId = deterministicMaterialIntelligenceId(
            "ele",
            identity,
          );
          await tx.$executeRawUnsafe(
            "INSERT INTO v2_scientific_eligibility_decisions (id, organization_id, subject_type, chemical_entity_id, result, reason_codes, structure_hash, normalization_version, policy_version, evidence_hash, evaluated_by) VALUES ($1,$2,'CHEMICAL_ENTITY',$3,$4,$5::jsonb,$6,$7,$8,$9,$10)",
            entityDecisionId,
            input.context.organizationId,
            entityId,
            decision.result,
            JSON.stringify(decision.reasons),
            verified?.structureHash ?? null,
            verified?.normalizationVersion ?? null,
            input.source.policyVersion,
            rowHash,
            input.context.userId,
          );
          increment(counts.eligibilityDecisions, decision.result);
        }
        persistedRows += 1;
      }

      const auditPayload = {
        importRunId: input.importRunId,
        batchNumber: input.batchNumber,
        sourceFileHash: input.source.fileSha256,
        sourceSheet: input.source.sheet,
        persistedRows,
        skippedIdempotentRows,
        counts,
      };
      await tx.$executeRawUnsafe(
        "INSERT INTO v2_audit_events (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id, payload_hash) VALUES ($1,$2,$3,'material_intelligence.bulk_import.batch','allowed','material_intelligence_import',$4,$5,$6) ON CONFLICT DO NOTHING",
        deterministicMaterialIntelligenceId(
          "aud",
          input.importRunId,
          String(input.batchNumber),
        ),
        input.context.organizationId,
        input.context.userId,
        input.importRunId,
        "corr_" + randomUUID().replaceAll("-", "").slice(0, 24),
        contentHash(auditPayload),
      );
      return { persistedRows, skippedIdempotentRows, counts };
    });
  }
}

export function isMaterialIntelligenceSchemaMissing(error: unknown) {
  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown };
    cause?: { code?: unknown };
  };
  return (
    candidate?.code === "42P01" ||
    candidate?.meta?.code === "42P01" ||
    candidate?.cause?.code === "42P01"
  );
}
