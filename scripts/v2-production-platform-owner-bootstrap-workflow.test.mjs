import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const workflow = readFileSync(
  ".github/workflows/v2-production-platform-owner-bootstrap.yml",
  "utf8",
);

test("Platform Owner dispatcher binds dispatch, release source, and revalidation to one exact SHA", () => {
  expect(workflow).toContain(
    "if: ${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && github.ref_type == 'branch' }}",
  );
  expect(workflow).toContain('test "$release_sha" = "$release_branch_sha"');
  expect(workflow).toContain(
    'test "$(git rev-list -n 1 "$RC10_TAG")" = "$RC10_SHA"',
  );
  expect(workflow).toContain(
    "PRODUCTION_RUNTIME_SECRET_ROTATION_RELEASE_SHA: ${{ vars.PRODUCTION_RUNTIME_SECRET_ROTATION_RELEASE_SHA }}",
  );
  expect(workflow).toContain(
    "PRODUCTION_ENVIRONMENT_REVALIDATED_RELEASE_SHA: ${{ vars.PRODUCTION_ENVIRONMENT_REVALIDATED_RELEASE_SHA }}",
  );
  expect(workflow).toContain(
    'test "$(git -C "$GITHUB_WORKSPACE/release" rev-parse HEAD)" = "$RELEASE_SHA"',
  );
  expect(workflow).toContain(
    'test "$(git -C "$GITHUB_WORKSPACE/ops" rev-parse HEAD)" = "$OPS_SHA"',
  );
  expect(workflow).toContain(
    'test "$PRODUCTION_RUNTIME_SECRET_ROTATION_RELEASE_SHA" = "$RELEASE_SHA"',
  );
  expect(workflow).toContain(
    'test "$PRODUCTION_ENVIRONMENT_REVALIDATED_RELEASE_SHA" = "$RELEASE_SHA"',
  );
});

test("Platform Owner dispatcher pins the immutable release and main-only operations wrapper", () => {
  expect(
    workflow.match(
      /uses: actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/g,
    ),
  ).toHaveLength(3);
  expect(workflow).toContain(
    "uses: actions/setup-node@cdca7365b2dadb8aad0a33bc7601856ffabcc48e",
  );
  expect(workflow.match(/persist-credentials: false/g)).toHaveLength(3);
  expect(workflow).toContain("ref: ${{ env.OPS_SHA }}");
  expect(workflow).toContain("ref: ${{ env.RELEASE_SHA }}");
  expect(workflow).toContain("working-directory: release");
  expect(workflow).toContain(
    "node ops/scripts/bootstrap-v2-production-platform-owner-pg.mjs",
  );
  expect(workflow).not.toContain("npm run bootstrap:platform-owner");

  const protectedJob = workflow.slice(
    workflow.indexOf("  bootstrap-platform-owner:"),
  );
  const mutationStep = protectedJob.indexOf(
    "      - name: Assign the one-time Platform Owner",
  );
  expect(mutationStep).toBeGreaterThan(0);
  expect(protectedJob.slice(0, mutationStep)).not.toContain(
    "secrets.PLATFORM_OWNER_BOOTSTRAP_EMAIL",
  );
  expect(protectedJob.slice(0, mutationStep)).not.toContain(
    "secrets.PRODUCTION_DATABASE_URL",
  );
  expect(protectedJob.slice(mutationStep)).toContain(
    "PLATFORM_OWNER_BOOTSTRAP_EMAIL: ${{ secrets.PLATFORM_OWNER_BOOTSTRAP_EMAIL }}",
  );
  expect(protectedJob.slice(mutationStep)).toContain(
    "PLATFORM_BOOTSTRAP_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}",
  );
  expect(protectedJob.slice(mutationStep)).toContain(
    "RELEASE_WORKTREE: ${{ github.workspace }}/release",
  );
});
