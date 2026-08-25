import { describe, expect, it, vi } from "vitest";
import { prepareMaterialIntelligenceStagingDemo } from "./prepare-material-intelligence-staging-demo.mjs";

const env = {
  V2_STAGING_API_ORIGIN: "https://api-beta.labofscents.org/api/v1",
  V2_STAGING_WORKSPACE_BASE_DOMAIN: "api-beta.labofscents.org",
  MATERIAL_DEMO_TENANT_SLUG: "material-intelligence-demo-a1b2c3d4",
  MATERIAL_DEMO_LOGIN_EMAIL: "demo@example.invalid",
  MATERIAL_DEMO_LOGIN_PASSWORD: "correct-horse-battery-staging-only",
};
const auth = {
  user: { id: "usr_demo" },
  membership: { organizationId: "org_demo", status: "ACTIVE", role: "Owner" },
  hostname: {
    hostname: env.MATERIAL_DEMO_TENANT_SLUG + ".api-beta.labofscents.org",
  },
};
const reply = (status, body) => ({ status, json: async () => body });

describe("Material Intelligence staging demo preparation", () => {
  it("reuses an active owner context without signup or secret output", async () => {
    const fetchImpl = vi.fn(async () => reply(200, auth));
    const outputs = [];
    const result = await prepareMaterialIntelligenceStagingDemo({
      fetchImpl,
      env,
      writeOutput: async (name, value) => outputs.push(name + "=" + value),
    });
    expect(result).toMatchObject({
      disposition: "REUSED",
      organizationId: "org_demo",
      userId: "usr_demo",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(outputs.join("\n")).not.toContain(env.MATERIAL_DEMO_LOGIN_EMAIL);
    expect(outputs.join("\n")).not.toContain(env.MATERIAL_DEMO_LOGIN_PASSWORD);
  });

  it("creates one tenant only after an expected missing-login response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        reply(401, { error: { code: "INVALID_CREDENTIALS" } }),
      )
      .mockResolvedValueOnce(reply(201, auth));
    const result = await prepareMaterialIntelligenceStagingDemo({
      fetchImpl,
      env,
      writeOutput: async () => undefined,
    });
    expect(result.disposition).toBe("CREATED");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://api-beta.labofscents.org/api/v1/v2/platform/auth/signup",
    );
  });

  it("fails closed on conflicting credentials without returning provider data", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply(401, {}))
      .mockResolvedValueOnce(reply(409, { message: "provider detail" }))
      .mockResolvedValueOnce(reply(401, {}));
    await expect(
      prepareMaterialIntelligenceStagingDemo({
        fetchImpl,
        env,
        writeOutput: async () => undefined,
      }),
    ).rejects.toThrow("MATERIAL_DEMO_IDENTITY_CONFLICT");
  });
});
