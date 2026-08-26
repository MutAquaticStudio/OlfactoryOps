import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  cleanupStagingRuntimeRoleBridge,
  prepareStagingRuntimeRoleBridge,
  runStagingMaterialIntelligenceBulk,
} from "./run-material-intelligence-staging-bulk";

const env = {
  V2_STAGING_ROLE_BRIDGE_APPROVED: "BRIDGE_STAGING_RUNTIME_ROLE",
  V2_RUNTIME_DB_ROLE: "hyperdrive_user",
  STAGING_DATABASE_URL:
    "postgresql://staging-admin:protected@db.staging.invalid/app",
  RUNNER_TEMP: "/tmp",
};

function harness({
  grantorMembership = false,
  canSet = false,
  unsafe = false,
  grantFails = false,
} = {}) {
  const state = {
    grantorMembership,
    canSet,
    grants: 0,
    revokes: 0,
    marker: undefined as string | undefined,
  };
  const clients: Array<{
    connect: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  }> = [];
  const clientFactory = () => {
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT current_user::text"))
          return { rows: [{ sessionRole: "staging_admin" }] };
        if (sql.includes("FROM pg_roles"))
          return {
            rows: [
              {
                canLogin: true,
                superuser: unsafe,
                createDb: false,
                createRole: false,
                inherit: false,
                bypassRls: false,
                replication: false,
              },
            ],
          };
        if (sql.includes("FROM pg_auth_members"))
          return {
            rows: state.grantorMembership ? [{ setOption: state.canSet }] : [],
          };
        if (sql.includes("pg_has_role"))
          return { rows: [{ canSet: state.canSet }] };
        if (sql.startsWith("GRANT")) {
          state.grants += 1;
          if (grantFails) throw new Error("GRANT_DENIED");
          state.grantorMembership = true;
          state.canSet = !sql.includes("SET FALSE");
          return { rows: [] };
        }
        if (sql.startsWith("REVOKE")) {
          state.revokes += 1;
          state.grantorMembership = false;
          state.canSet = false;
          return { rows: [] };
        }
        throw new Error("UNEXPECTED_QUERY");
      }),
    };
    clients.push(client);
    return client;
  };
  const missing = () => Object.assign(new Error("missing"), { code: "ENOENT" });
  return {
    state,
    clients,
    dependencies: {
      clientFactory,
      markerPath: "/tmp/material-intelligence-role-bridge.json",
      writeMarker: async (_path: string, value: string) => {
        state.marker = value;
      },
      readMarker: async () => {
        if (state.marker === undefined) throw missing();
        return state.marker;
      },
      removeMarker: async () => {
        state.marker = undefined;
      },
    },
  };
}

describe("staging Material Intelligence runtime role bridge", () => {
  it("runs the importer under a temporary membership and always revokes it", async () => {
    const test = harness();
    const report = { inputRows: 1986 } as never;
    await expect(
      runStagingMaterialIntelligenceBulk([], env, {
        ...test.dependencies,
        runImport: vi.fn(async () => report) as never,
      }),
    ).resolves.toBe(report);
    expect(test.state).toMatchObject({
      grantorMembership: false,
      canSet: false,
      grants: 1,
      revokes: 1,
    });
    expect(test.state.marker).toBeUndefined();
    expect(
      test.clients.every((client) => client.end.mock.calls.length === 1),
    ).toBe(true);
  });

  it("revokes the bridge when the importer fails", async () => {
    const test = harness();
    await expect(
      runStagingMaterialIntelligenceBulk([], env, {
        ...test.dependencies,
        runImport: vi.fn(async () => {
          throw new Error("IMPORT_FAILED");
        }) as never,
      }),
    ).rejects.toThrow("IMPORT_FAILED");
    expect(test.state).toMatchObject({
      grantorMembership: false,
      canSet: false,
      grants: 1,
      revokes: 1,
    });
    expect(test.state.marker).toBeUndefined();
  });

  it("temporarily enables SET on a grantor-owned membership and restores it", async () => {
    const test = harness({ grantorMembership: true, canSet: false });
    await expect(
      runStagingMaterialIntelligenceBulk([], env, {
        ...test.dependencies,
        runImport: vi.fn(async () => ({ inputRows: 1986 })) as never,
      }),
    ).resolves.toEqual({ inputRows: 1986 });
    expect(test.state).toMatchObject({
      grantorMembership: true,
      canSet: false,
      grants: 2,
      revokes: 0,
    });
  });

  it("does not mutate a pre-existing SET-capable membership", async () => {
    const test = harness({ grantorMembership: true, canSet: true });
    await expect(
      runStagingMaterialIntelligenceBulk([], env, {
        ...test.dependencies,
        runImport: vi.fn(async () => ({ inputRows: 1986 })) as never,
      }),
    ).resolves.toEqual({ inputRows: 1986 });
    expect(test.state).toMatchObject({
      grantorMembership: true,
      canSet: true,
      grants: 0,
      revokes: 0,
    });
  });

  it("rejects a privileged runtime role before granting membership", async () => {
    const test = harness({ unsafe: true });
    await expect(
      prepareStagingRuntimeRoleBridge(env, test.dependencies),
    ).rejects.toThrow("STAGING_ROLE_BRIDGE_RUNTIME_ROLE_UNSAFE");
    expect(test.state).toMatchObject({ grants: 0, revokes: 0 });
  });

  it("requires the exact staging-only approval and role", async () => {
    const test = harness();
    await expect(
      prepareStagingRuntimeRoleBridge(
        { ...env, V2_STAGING_ROLE_BRIDGE_APPROVED: "production" },
        test.dependencies,
      ),
    ).rejects.toThrow("STAGING_ROLE_BRIDGE_APPROVAL_REQUIRED");
    await expect(
      prepareStagingRuntimeRoleBridge(
        { ...env, V2_RUNTIME_DB_ROLE: "postgres" },
        test.dependencies,
      ),
    ).rejects.toThrow("STAGING_ROLE_BRIDGE_RUNTIME_ROLE_INVALID");
  });

  it("stores no connection or role identity in the temporary marker", async () => {
    const test = harness();
    await prepareStagingRuntimeRoleBridge(env, test.dependencies);
    expect(JSON.parse(test.state.marker ?? "{}")).toEqual({
      version: 2,
      bridgeChanged: true,
      grantorMembership: false,
    });
    expect(test.state.marker).not.toContain("staging_admin");
    expect(test.state.marker).not.toContain("postgresql");
    await cleanupStagingRuntimeRoleBridge(env, test.dependencies);
    expect(test.state.marker).toBeUndefined();
  });

  it("cleans the marker when the membership grant is denied", async () => {
    const test = harness({ grantFails: true });
    await expect(
      runStagingMaterialIntelligenceBulk([], env, {
        ...test.dependencies,
        runImport: vi.fn() as never,
      }),
    ).rejects.toThrow("GRANT_DENIED");
    expect(test.state).toMatchObject({
      grantorMembership: false,
      canSet: false,
      grants: 1,
      revokes: 1,
    });
    expect(test.state.marker).toBeUndefined();
  });

  it("checks SET capability rather than treating MEMBER as SET authorization", async () => {
    const source = await readFile(
      "scripts/run-material-intelligence-staging-bulk.ts",
      "utf8",
    );
    expect(source).toContain("pg_has_role($1, $2, 'SET')");
    expect(source).not.toContain("pg_has_role($1, $2, 'MEMBER')");
    expect(source).toContain("GRANTED BY CURRENT_USER");
  });

  it("keeps the workflow staging-scoped and wraps both apply and replay", async () => {
    const workflow = await readFile(
      ".github/workflows/v2-staging-material-intelligence-bulk.yml",
      "utf8",
    );
    expect(
      workflow.match(/run-material-intelligence-staging-bulk\.ts run/g),
    ).toHaveLength(2);
    expect(workflow).toContain(
      "V2_STAGING_ROLE_BRIDGE_APPROVED: BRIDGE_STAGING_RUNTIME_ROLE",
    );
    expect(workflow).toContain("V2_RUNTIME_DB_ROLE: hyperdrive_user");
    expect(workflow).toContain(
      "run-material-intelligence-staging-bulk.ts cleanup",
    );
    expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
    expect(workflow).not.toMatch(/^\s*GRANT\s/im);
  });
});
