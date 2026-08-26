import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptedGlobalWriteDenial,
  evidenceContainsProtectedValue,
  globalMaterialWriteRoutes,
  parseGeneratedRouteSpecs,
  stagingDemoInputs,
} from "./verify-material-intelligence-staging-vc-demo.mjs";

const validEnvironment = {
  MATERIAL_DEMO_EXPECTED_SHA: "a".repeat(40),
  MATERIAL_DEMO_PUBLIC_ORIGIN: "https://beta.labofscents.org",
  MATERIAL_DEMO_API_ORIGIN: "https://api-beta.labofscents.org",
  MATERIAL_DEMO_TENANT_SLUG: "vc-demo-fixture",
  MATERIAL_DEMO_LOGIN_EMAIL: "vc-demo@example.test",
  MATERIAL_DEMO_LOGIN_PASSWORD: "fixture-password-2026",
  MATERIAL_DEMO_EVIDENCE_DIR: resolve(".qa-fixture-evidence"),
};

describe("Material Intelligence staging VC demo acceptance", () => {
  it("accepts only the exact staging origins, exact SHA, and protected fixture shape", () => {
    expect(stagingDemoInputs(validEnvironment)).toMatchObject({
      expectedSha: "a".repeat(40),
      publicOrigin: "https://beta.labofscents.org",
      apiOrigin: "https://api-beta.labofscents.org",
      tenantSlug: "vc-demo-fixture",
      searchMaterial: "Vanillin",
      workspaceOrigin: "https://vc-demo-fixture.api-beta.labofscents.org",
    });

    for (const override of [
      { MATERIAL_DEMO_EXPECTED_SHA: "main" },
      { MATERIAL_DEMO_PUBLIC_ORIGIN: "https://labofscents.org" },
      { MATERIAL_DEMO_API_ORIGIN: "https://api.labofscents.org" },
      { MATERIAL_DEMO_TENANT_SLUG: "two.labels" },
      { MATERIAL_DEMO_LOGIN_EMAIL: "" },
      { MATERIAL_DEMO_LOGIN_PASSWORD: "short" },
      { MATERIAL_DEMO_EVIDENCE_DIR: "relative-evidence" },
    ]) {
      expect(() => stagingDemoInputs({ ...validEnvironment, ...override })).toThrow("INVALID_INPUT");
    }
  });

  it("proves the generated global catalog surface has no mutation route before live denial probes", async () => {
    const source = await readFile(resolve("worker/v2-api/generated-route-specs.ts"), "utf8");
    const routes = parseGeneratedRouteSpecs(source);
    expect(routes).toContainEqual(expect.objectContaining({
      method: "GET",
      path: "/v2/material-intelligence/materials",
    }));
    expect(routes).toContainEqual(expect.objectContaining({
      method: "GET",
      path: "/v2/material-intelligence/materials/:materialId",
    }));
    expect(globalMaterialWriteRoutes(routes)).toEqual([]);
    expect(globalMaterialWriteRoutes([
      ...routes,
      { method: "PATCH", path: "/v2/material-intelligence/materials/:materialId" },
    ])).toEqual([
      { method: "PATCH", path: "/v2/material-intelligence/materials/:materialId" },
    ]);
  });

  it("accepts only route absence and method denial for global write probes", () => {
    expect(acceptedGlobalWriteDenial(404)).toBe(true);
    expect(acceptedGlobalWriteDenial(405)).toBe(true);
    for (const status of [200, 201, 202, 204, 400, 401, 403, 409, 422, 500]) {
      expect(acceptedGlobalWriteDenial(status)).toBe(false);
    }
  });

  it("rejects evidence containing any protected fixture value", () => {
    const protectedValues = ["fixture-password-2026", "vc-demo@example.test", "vc-demo-fixture"];
    expect(evidenceContainsProtectedValue({ status: "PASS", checks: { login: "PASS" } }, protectedValues)).toBe(false);
    expect(evidenceContainsProtectedValue({ status: "FAIL", debug: "vc-demo-fixture" }, protectedValues)).toBe(true);
  });

  it("keeps the workflow staging-only, exact-main, browser-backed, sanitized, and fixture-preserving", async () => {
    const workflow = await readFile(
      resolve(".github/workflows/v2-staging-material-intelligence-vc-demo-acceptance.yml"),
      "utf8",
    );
    const script = await readFile(resolve("scripts/verify-material-intelligence-staging-vc-demo.mjs"), "utf8");

    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain('test "$STAGING_SHA" = "$(git rev-parse FETCH_HEAD)"');
    expect(workflow).toContain("secrets.MATERIAL_DEMO_LOGIN_EMAIL");
    expect(workflow).toContain("secrets.MATERIAL_DEMO_LOGIN_PASSWORD");
    expect(workflow).toContain("vars.MATERIAL_DEMO_TENANT_SLUG");
    expect(workflow).toContain("npx playwright install --with-deps chromium");
    expect(workflow).toContain("node scripts/verify-material-intelligence-staging-vc-demo.mjs");
    expect(workflow).toContain("uses: actions/upload-artifact@v4");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain('rm -rf -- "$evidence_dir"');
    expect(workflow).not.toMatch(/STAGING_DATABASE_URL|prepare-material-intelligence-staging-demo|delete.*fixture/i);

    expect(script).toContain('page.getByRole("button", { name: "Sign in securely", exact: true }).click()');
    expect(script).toContain('/api/v1/v2/platform/me');
    expect(script).toContain('body?.releaseGitSha === inputs.expectedSha');
    expect(script).toContain('method: "POST"');
    expect(script).toContain('method: "PATCH"');
    expect(script).toContain('method: "DELETE"');
    expect(script).not.toMatch(/console\.(?:log|error)\([^\n]*(?:password|email|tenantSlug|workspaceOrigin)/i);
  });
});
