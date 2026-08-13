import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath =
  ".github/workflows/v2-production-environment-revalidation.yml";

describe("production environment revalidation workflow contract", () => {
  it("is manually dispatched, protected, and pinned to RC9", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("name: V2 Production Environment Revalidation");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("ACTIVE_RC_TAG: v2-production-rc9");
    expect(workflow).toContain(
      "ACTIVE_RC_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
    );
    expect(workflow).toContain(
      "REVALIDATE_PRODUCTION_ENVIRONMENT_FOR_ACTIVE_RC",
    );
    expect(workflow).toContain("persist-credentials: false");
  });

  it("has only read-only production checks and does not mutate deployment state", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("await client.query('SELECT 1')");
    expect(workflow).toContain("user/tokens/verify");
    expect(workflow).toContain("PRODUCTION_SECRET_BOUNDARY_REVALIDATION=PASS");
    expect(workflow).toContain("npm run security:client-bundle");
    expect(workflow).not.toMatch(
      /wrangler\s+deploy|wrangler\s+secret\s+put|gh\s+(variable|secret)\s+set|INSERT\s+|UPDATE\s+|DELETE\s+|ALTER\s+/i,
    );
    expect(workflow).not.toContain("workflow_run:");
    expect(workflow).not.toContain("pull_request_target:");
  });

  it("keeps all required runtime secrets inside the protected job", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    for (const name of [
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
      "PRODUCTION_DATABASE_URL",
      "V2_SESSION_PEPPER",
      "V2_PASSWORD_PEPPER",
      "V2_INVITATION_ENCRYPTION_KEY",
      "SCIENTIFIC_CONTAINER_SHARED_SECRET",
      "PLATFORM_OWNER_BOOTSTRAP_EMAIL",
    ]) {
      expect(workflow).toContain(`      ${name}: $${"{"}{ secrets.${name} }}`);
    }
  });
});
