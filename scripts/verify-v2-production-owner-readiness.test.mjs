import { describe, expect, it } from "vitest";
import {
  platformOwnerReadinessSql,
  summarizePlatformOwnerReadiness,
  unprovenPlatformOwnerReadiness,
  verifyPlatformOwnerReadiness,
} from "./verify-v2-production-owner-readiness.mjs";

class FakeClient {
  constructor(row, failure) {
    this.row = row;
    this.failure = failure;
    this.calls = [];
    this.closed = false;
  }

  async connect() {
    if (this.failure === "connect") throw new Error("secret connection detail");
  }

  async query(sql) {
    this.calls.push(sql);
    if (this.failure === "query") throw new Error("secret query detail");
    return { rows: [this.row] };
  }

  async end() {
    this.closed = true;
  }
}

function pgFor(client) {
  return {
    Client: class {
      constructor() {
        return client;
      }
    },
  };
}

describe("production platform owner readiness", () => {
  it("requires one active MFA-enforced owner with the bootstrap audit event", async () => {
    const client = new FakeClient({
      active_owners: 1,
      all_mfa_required: true,
      all_platform_owner_roles: true,
      all_active: true,
      bootstrap_audit_present: true,
    });
    const output = [];

    const exitCode = await verifyPlatformOwnerReadiness({
      environment: { PRODUCTION_DATABASE_URL: "not-a-database-url" },
      pgModule: pgFor(client),
      emit: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(output).toEqual([
      "ACTIVE_PLATFORM_OWNER_COUNT=ONE",
      "PLATFORM_OWNER_ROLE=PASS",
      "PLATFORM_OWNER_STATUS_ACTIVE=PASS",
      "PLATFORM_OWNER_MFA_REQUIRED=PASS",
      "PLATFORM_OWNER_AUDIT_EVENT=PASS",
      "PLATFORM_OWNER_READY=PASS",
    ]);
    expect(client.calls).toEqual([platformOwnerReadinessSql]);
    expect(platformOwnerReadinessSql).toMatch(/^\s*SELECT/i);
    expect(platformOwnerReadinessSql).toContain("platform.owner.bootstrap");
    expect(platformOwnerReadinessSql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i,
    );
    expect(output.join("\n")).not.toContain("not-a-database-url");
    expect(client.closed).toBe(true);
  });

  it("fails closed when any required post-bootstrap invariant is absent", () => {
    expect(
      summarizePlatformOwnerReadiness({
        active_owners: 0,
        all_mfa_required: false,
        all_platform_owner_roles: false,
        all_active: false,
        bootstrap_audit_present: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        "ACTIVE_PLATFORM_OWNER_COUNT=ZERO",
        "PLATFORM_OWNER_READY=UNPROVEN",
      ]),
    );
    expect(
      summarizePlatformOwnerReadiness({
        active_owners: 1,
        all_mfa_required: true,
        all_platform_owner_roles: true,
        all_active: true,
        bootstrap_audit_present: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        "PLATFORM_OWNER_AUDIT_EVENT=FAIL",
        "PLATFORM_OWNER_READY=UNPROVEN",
      ]),
    );
    expect(
      summarizePlatformOwnerReadiness({
        active_owners: 2,
        all_mfa_required: true,
        all_platform_owner_roles: true,
        all_active: true,
        bootstrap_audit_present: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        "ACTIVE_PLATFORM_OWNER_COUNT=MULTIPLE",
        "PLATFORM_OWNER_READY=UNPROVEN",
      ]),
    );
    expect(
      summarizePlatformOwnerReadiness({
        active_owners: 1,
        all_mfa_required: false,
        all_platform_owner_roles: false,
        all_active: false,
        bootstrap_audit_present: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        "PLATFORM_OWNER_ROLE=FAIL",
        "PLATFORM_OWNER_STATUS_ACTIVE=FAIL",
        "PLATFORM_OWNER_MFA_REQUIRED=FAIL",
        "PLATFORM_OWNER_READY=UNPROVEN",
      ]),
    );
  });

  it("emits only bounded unproven evidence when the read-only query fails", async () => {
    const client = new FakeClient({}, "query");
    const output = [];

    const exitCode = await verifyPlatformOwnerReadiness({
      environment: { PRODUCTION_DATABASE_URL: "not-a-database-url" },
      pgModule: pgFor(client),
      emit: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(output).toEqual(unprovenPlatformOwnerReadiness());
    expect(output.join("\n")).not.toContain("secret query detail");
    expect(client.closed).toBe(true);
  });
});
