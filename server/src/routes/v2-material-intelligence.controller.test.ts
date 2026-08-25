import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { V2MaterialIntelligenceController } from "./v2-material-intelligence.controller.js";

describe("V2 Material Intelligence controller", () => {
  it("blocks unauthenticated catalog reads before the service", async () => {
    const platform = { cookieName: "v2_session", contextFromToken: vi.fn() };
    const intelligence = { listMaterials: vi.fn() };
    const controller = new V2MaterialIntelligenceController(
      platform as never,
      intelligence as never,
    );
    await expect(
      controller.materials(
        { headers: { host: "tenant.example.test" } } as never,
        {},
      ),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED", status: 401 });
    expect(intelligence.listMaterials).not.toHaveBeenCalled();
  });

  it("delegates only authenticated tenant context", async () => {
    const context = { organizationId: "org_a", userId: "user_a" };
    const platform = {
      cookieName: "v2_session",
      contextFromToken: vi.fn(async () => ({ context })),
    };
    const intelligence = { listMaterials: vi.fn(async () => ({ items: [] })) };
    const controller = new V2MaterialIntelligenceController(
      platform as never,
      intelligence as never,
    );
    await expect(
      controller.materials(
        {
          headers: { host: "tenant.example.test", cookie: "v2_session=opaque" },
        } as never,
        { page: "1" },
      ),
    ).resolves.toEqual({ items: [] });
    expect(intelligence.listMaterials).toHaveBeenCalledWith(context, {
      page: "1",
    });
  });

  it("exposes read routes only and no public bulk-write endpoint", async () => {
    const source = await readFile(
      new URL("./v2-material-intelligence.controller.ts", import.meta.url),
      "utf8",
    );
    expect(source.match(/@Get\(/g)).toHaveLength(6);
    expect(source).not.toMatch(/@Post\(|bulk-import|bulkImport/);
  });
});
