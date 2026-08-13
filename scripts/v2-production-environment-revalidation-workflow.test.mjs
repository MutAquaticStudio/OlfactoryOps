import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
    expect(workflow).toContain(
      'git worktree add --detach "$RUNNER_TEMP/olfactoryops-rc9" "$RELEASE_SHA"',
    );
  });

  it("has only read-only production checks and does not mutate deployment state", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain(
      "scripts/verify-production-database-connectivity.mjs",
    );
    expect(workflow).toContain(
      "node scripts/verify-cloudflare-production-token.mjs",
    );
    expect(workflow).toContain("PRODUCTION_SECRET_BOUNDARY_REVALIDATION=PASS");
    expect(workflow).toContain(
      'npm --prefix "$RC9_WORKTREE" run security:client-bundle',
    );
    expect(workflow).not.toMatch(
      /wrangler\s+deploy|wrangler\s+secret\s+put|gh\s+(variable|secret)\s+set|INSERT\s+|UPDATE\s+|DELETE\s+|ALTER\s+/i,
    );
    expect(workflow).not.toContain("workflow_run:");
    expect(workflow).not.toContain("pull_request_target:");
  });

  it("copies and runs the bounded database probe from the exact RC9 dependency worktree", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const databaseStep = workflow
      .split("- name: Verify production database connectivity read-only")[1]
      .split("- name: Scan exact RC9 source and generated client bundle")[0];
    const databaseRun = databaseStep
      .split("run: |\n")[1]
      .replace(/^          /gm, "");
    expect(workflow).toContain('npm ci --prefix "$RC9_WORKTREE"');
    expect(databaseStep).toContain(
      'ops_directory="$RC9_WORKTREE/.ops-revalidation"',
    );
    expect(databaseStep).toContain(
      "scripts/verify-production-database-connectivity.mjs",
    );
    expect(databaseStep).toContain(
      '"$ops_directory/verify-production-database-connectivity.mjs"',
    );
    expect(databaseStep).toContain('cd "$RC9_WORKTREE"');
    expect(databaseStep.indexOf('cd "$RC9_WORKTREE"')).toBeLessThan(
      databaseStep.indexOf(
        "node .ops-revalidation/verify-production-database-connectivity.mjs",
      ),
    );
    expect(databaseStep).not.toContain("NODE_PATH");
    expect(databaseStep).not.toContain("node --input-type=module <<'NODE'");
    expect(databaseStep).toContain("trap 'rm -rf \"$ops_directory\"' EXIT");
    const localBash =
      process.platform === "win32"
        ? "C:\\Program Files\\Git\\bin\\bash.exe"
        : "bash";
    expect(() =>
      execFileSync(localBash, ["-n", "-c", databaseRun]),
    ).not.toThrow();
  });

  it("cleans up only the runner-local RC9 worktree", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain('git worktree remove --force "$RC9_WORKTREE"');
    expect(workflow).toContain("git worktree prune");
    expect(workflow).toContain("RUNNER_LOCAL_RC9_WORKTREE_CLEANUP=PASS");
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
