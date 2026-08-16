import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync("worker/v2-exact-billing-path-diagnostic.ts", "utf8");

describe("exact billing Worker contract", () => {
  it("uses the exact RC9 repository and service and never gates on plan.findUnique", () => {
    expect(worker).toContain('from "../services/platform/src/prisma-repository.js"');
    expect(worker).toContain('from "../services/platform/src/service.js"');
    expect(worker).toContain("repository.getBilling(organizationId)");
    expect(worker).toContain("repository.transaction");
    expect(worker).not.toContain("plan.findUnique");
  });
  it("keeps response output to safe classifications", () => {
    expect(worker).not.toMatch(/console\.(?:log|error)/);
    expect(worker).not.toMatch(/JSON\.stringify\(error/);
    expect(worker).toContain('exactBillingPathDiagnostic: "MATRIX"');
    expect(worker).toContain('exactBillingPathDiagnostic: "NOT_FOUND"');
  });
});
