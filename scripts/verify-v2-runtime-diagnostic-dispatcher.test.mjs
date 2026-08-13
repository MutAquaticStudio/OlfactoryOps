import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(".");
const workflow = readFileSync(
  resolve(
    root,
    ".github/workflows/v2-production-candidate-runtime-path-diagnostic.yml",
  ),
  "utf8",
);
const worker = readFileSync(
  resolve(root, "worker/v2-tenant-router-runtime-diagnostic.ts"),
  "utf8",
);

describe("RC9 route-free runtime diagnostic dispatcher", () => {
  it("enforces the exact RC9 release, fixture, and isolated Hyperdrive target", () => {
    expect(workflow).toContain(
      "TARGET_RELEASE_SHA: de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
    );
    expect(workflow).toContain(
      "EXPECTED_FIXTURE_HOSTNAME: rc9-release-31736285494-469ca8942a.next.labofscents.org",
    );
    expect(workflow).toContain("v2-production-rc9^{}");
    expect(workflow).not.toContain("5985834a0e14728c81c8c028a72122ded544bd6b");
    expect(workflow).not.toContain("DIAGNOSTIC_SOURCE_SHA");
    expect(workflow).not.toContain("prisma:generate:v2");
    expect(workflow).not.toContain("generate:v2-worker-transport");
    expect(workflow).toContain("origin/$RELEASE_BRANCH");
    expect(workflow).not.toContain("${{ env.EXPECTED_");
    expect(workflow).toContain("ref: ${{ github.sha }}");
  });

  it("keeps the diagnostic worker read-only, route-free, and boolean-only", () => {
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("if: ${{ always() }}");
    expect(workflow).not.toMatch(/(?:workers\/domains|workers\/routes)/);
    expect(workflow).not.toMatch(
      /^\s*(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/m,
    );
    expect(worker).toContain('await client.query("BEGIN READ ONLY")');
    expect(worker).toContain('await client.query("ROLLBACK")');
    expect(worker).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|ALTER\s+TABLE)/i,
    );
    expect(worker).toContain("runtimeResolverOrganizationMatch");
    expect(worker).toContain("safeBooleanMatrix");
    expect(worker).toContain(
      '{ candidateRuntimeDiagnostic: "COMPLETE", ...safeBooleanMatrix }',
    );
  });

  it("passes the checked-in dispatcher contract verifier", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/verify-v2-runtime-diagnostic-dispatcher.mjs"],
      { cwd: root, encoding: "utf8" },
    );
    expect(output).toContain("STAGED_DIAGNOSTIC_CONTRACT=PASS");
    expect(output).toContain("DIAGNOSTIC_WORKER_CLEANUP_CONTRACT=PASS");
  });
});
