import { describe, expect, it, vi } from "vitest";
import { MaterialIntelligenceService } from "./material-intelligence-service.js";

const context = {
  organizationId: "org_a",
  userId: "user_a",
  role: "Owner" as const,
  sessionId: "session",
  hostname: "tenant.example.test",
};

function serviceWith(query: (sql: string, values: unknown[]) => unknown) {
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
    service: new MaterialIntelligenceService(
      client as never,
      platform as never,
    ),
    tx,
    platform,
  };
}

describe("Material Intelligence tenant read API service", () => {
  it("uses sensitive material permission and bounded list pagination", async () => {
    const { service, tx, platform } = serviceWith((sql, _values) =>
      sql.includes("count(*) OVER()")
        ? [{ id: "material_a", name: "Vanillin", totalCount: 1 }]
        : [],
    );
    const result = await service.listMaterials(context, {
      page: "1",
      pageSize: "100",
      text: "Vanillin",
    });
    expect(platform.requirePermission).toHaveBeenCalledWith(
      context,
      "materials.viewSensitive",
    );
    expect(result).toMatchObject({
      page: 1,
      pageSize: 100,
      total: 1,
      items: [{ id: "material_a" }],
    });
    const listCall = tx.$queryRawUnsafe.mock.calls.find(([sql]) =>
      String(sql).includes("count(*) OVER()"),
    );
    expect(listCall?.[1]).toBe(context.organizationId);
    expect(String(listCall?.[0])).toContain("LIMIT");
  });

  it("rejects unbounded pagination before querying", async () => {
    const { service, tx } = serviceWith(() => []);
    await expect(
      service.listMaterials(context, { pageSize: "101" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 422 });
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("normalizes a missing migration without leaking database errors", async () => {
    const { service } = serviceWith(() => {
      throw Object.assign(new Error("sensitive relation text"), {
        code: "42P01",
      });
    });
    await expect(service.listMaterials(context, {})).rejects.toMatchObject({
      code: "MATERIAL_INTELLIGENCE_NOT_AVAILABLE",
      status: 503,
      message: "Material Intelligence is not available for this environment.",
    });
  });

  it("returns cross-tenant material identifiers as not found under the scoped organization", async () => {
    const { service, tx } = serviceWith(() => []);
    await expect(
      service.getMaterial(context, "material_tenant_b"),
    ).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND", status: 404 });
    expect(tx.$queryRawUnsafe.mock.calls[0]?.[1]).toBe(context.organizationId);
    expect(tx.$queryRawUnsafe.mock.calls[0]?.[2]).toBe("material_tenant_b");
  });
});
