import { describe, expect, it, vi } from "vitest";
import { GlobalMaterialIntelligenceCatalog } from "./global-material-intelligence-catalog.js";

const context = {
  organizationId: "org_a",
  userId: "user_a",
  role: "Viewer" as const,
  sessionId: "session",
  hostname: "tenant.example.test",
};

function catalogWith(query: (sql: string, values: unknown[]) => unknown) {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    $queryRawUnsafe: vi.fn(async (sql: string, ...values: unknown[]) =>
      query(sql, values),
    ),
  };
  const client = {
    $transaction: vi.fn(async (action: (client: typeof tx) => unknown) =>
      action(tx),
    ),
  };
  const platform = { requirePermission: vi.fn(async () => undefined) };
  return {
    catalog: new GlobalMaterialIntelligenceCatalog(
      client as never,
      platform as never,
    ),
    tx,
    platform,
  };
}

describe("global Material Intelligence catalog", () => {
  it("requires authenticated material-read permission and never scopes global rows to one tenant", async () => {
    const { catalog, tx, platform } = catalogWith((sql) => {
      if (sql.includes('count(*)::int AS "totalCount"')) {
        return [{ totalCount: 1 }];
      }
      return [
        {
          id: "global_material_a",
          canonicalName: "Vanillin",
          lifecycleStatus: "ACTIVE",
          evidenceStatus: "VERIFIED",
          resolutionStatus: "RESOLVED",
          entityEvidenceStatus: "VERIFIED",
          structureHash: "a".repeat(64),
        },
      ];
    });

    const result = await catalog.listMaterials(context, {
      page: "1",
      pageSize: "25",
      text: "Vanillin",
    });

    expect(platform.requirePermission).toHaveBeenCalledWith(
      context,
      "materials.view",
    );
    expect(result).toMatchObject({
      scope: "GLOBAL",
      readOnly: true,
      total: 1,
      items: [
        {
          id: "global_material_a",
          name: "Vanillin",
          scope: "GLOBAL",
          readOnly: true,
          eligibilityResult: "ELIGIBLE",
        },
      ],
    });
    const sql = tx.$queryRawUnsafe.mock.calls
      .map(([statement]) => String(statement))
      .join("\n");
    expect(sql).toContain("v2_global_canonical_materials");
    expect(sql).not.toContain("material.organization_id");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(tx.$queryRawUnsafe.mock.calls[0]?.slice(1)).toEqual([
      "ACTIVE",
      "%Vanillin%",
    ]);
  });

  it("keeps taxonomy and lifecycle filters bounded and parameterized", async () => {
    const { catalog, tx } = catalogWith((sql) =>
      sql.includes('count(*)::int AS "totalCount"')
        ? [{ totalCount: 0 }]
        : [],
    );

    await catalog.listMaterials(context, {
      lifecycleStatus: "ARCHIVED",
      evidenceStatus: "CONFLICTED",
      taxonomyNode: "woody",
      pageSize: "10",
    });

    const countCall = tx.$queryRawUnsafe.mock.calls[0];
    expect(countCall?.slice(1)).toEqual([
      "ARCHIVED",
      "CONFLICTED",
      "woody",
    ]);
    expect(String(countCall?.[0])).toContain(
      "v2_osmo_taxonomy_assignments",
    );
    await expect(
      catalog.listMaterials(context, { pageSize: "101" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 422 });
  });

  it("returns a source-aware global detail without tenant operational joins", async () => {
    const { catalog, tx } = catalogWith((sql) => {
      if (sql.includes("FROM v2_global_canonical_materials material")) {
        return [
          {
            id: "global_material_a",
            canonicalName: "Vanillin",
            lifecycleStatus: "ACTIVE",
            evidenceStatus: "VERIFIED",
            chemicalEntityId: "entity_a",
            chemicalEntityName: "Vanillin",
            entityType: "SINGLE_SUBSTANCE",
            resolutionStatus: "RESOLVED",
            entityEvidenceStatus: "VERIFIED",
            inchi: "InChI=1S/C8H8O3",
            structureHash: "a".repeat(64),
          },
        ];
      }
      if (sql.includes("v2_global_chemical_identifiers")) {
        return [{ id: "identifier_a", type: "CAS", value: "121-33-5" }];
      }
      if (sql.includes("v2_global_physical_property_assertions")) {
        return [{
          id: "property_a",
          propertyKey: "BOILING_POINT",
          valueKind: "RANGE_NUMERIC",
          numericMin: 284,
          numericMax: 285,
          unit: "degC",
        }];
      }
      if (sql.includes("v2_osmo_taxonomy_assignments")) {
        return [{ id: "node_a", label: "Vanilla" }];
      }
      if (sql.includes("v2_global_material_source_observations")) {
        return [{ sourceRowNumber: 2, disposition: "CANONICAL_ACTIVE" }];
      }
      return [];
    });

    const detail = await catalog.getMaterial(context, "global_material_a");
    expect(detail).toMatchObject({
      id: "global_material_a",
      scope: "GLOBAL",
      readOnly: true,
      identifiers: [{ id: "identifier_a" }],
      physicalProperties: [{ id: "property_a" }],
      taxonomy: [{ id: "node_a" }],
      provenanceSources: [{ sourceRowNumber: 2 }],
      components: [],
      inchi: "InChI=1S/C8H8O3",
    });
    const sql = tx.$queryRawUnsafe.mock.calls
      .map(([statement]) => String(statement))
      .join("\n");
    expect(sql).not.toContain("v2_materials");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(sql).toContain('numeric_min::float8 AS "numericMin"');
    expect(sql).toContain('numeric_max::float8 AS "numericMax"');
  });

  it("normalizes an absent global schema without exposing database detail", async () => {
    const { catalog } = catalogWith(() => {
      throw Object.assign(new Error("sensitive relation text"), {
        code: "42P01",
      });
    });
    await expect(catalog.listMaterials(context, {})).rejects.toMatchObject({
      code: "MATERIAL_INTELLIGENCE_NOT_AVAILABLE",
      status: 503,
      message:
        "The global Material Intelligence catalog is not available for this environment.",
    });
  });
});
