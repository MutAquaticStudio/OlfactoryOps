import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backup = readFileSync(
  ".github/workflows/v2-rc10-production-backup-snapshot.yml",
  "utf8",
);
const backupR2Private = readFileSync(
  "scripts/verify-v2-rc10-backup-r2-private.mjs",
  "utf8",
);
const pages = readFileSync(
  ".github/workflows/v2-rc10-production-pages-project-preparation.yml",
  "utf8",
);
const readiness = readFileSync(
  ".github/workflows/v2-rc10-production-readiness.yml",
  "utf8",
);
const dispatcher = readFileSync(
  ".github/workflows/v2-production-release-dispatch.yml",
  "utf8",
);
const acceptance = readFileSync(
  ".github/workflows/v2-production-public-acceptance.yml",
  "utf8",
);
const rollback = readFileSync(
  "scripts/verify-v2-production-rollback-readiness.mjs",
  "utf8",
);
const publicHarness = readFileSync(
  "scripts/verify-v2-production-public-acceptance.mjs",
  "utf8",
);

describe("RC10 final readiness operations", () => {
  it("creates and validates a private custom-format backup only", () => {
    expect(backup).toContain("CREATE_RC10_PRECUTOVER_BACKUP");
    expect(backup).toContain("fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd");
    expect(backup).toContain("olfactoryops-v2-production-backups");
    expect(backup).toContain("--format=custom --no-owner --no-acl");
    expect(backup).toContain("verify-v2-rc10-backup-r2-private.mjs");
    expect(backup).not.toContain("r2 bucket list --json");
    expect(backupR2Private).toContain("/r2/buckets/");
    expect(backupR2Private).toContain("/domains/managed");
    expect(backupR2Private).toContain("/domains/custom");
    expect(backupR2Private).not.toContain("console.error");
    expect(backup).toContain("BACKUP_CHECKSUM=PASS");
    expect(backup).toContain("if: always()");
    expect(backup).not.toMatch(
      /pages deploy|wrangler deploy|custom.domain|routes\s*=/i,
    );
  });

  it("prepares only the exact unrouted production Pages project", () => {
    expect(pages).toContain("olfactoryops-v2-production");
    expect(pages).toContain("pages project create");
    expect(pages).not.toContain("pages deploy");
    expect(pages).not.toContain("production-candidate");
  });

  it("requires immutable backup evidence and smoke-tenant proof", () => {
    expect(readiness).toContain("backup_run_id:");
    expect(readiness).toContain("V2 RC10 Production Backup Snapshot");
    expect(readiness).toContain(
      'test "$((now_epoch - created_epoch))" -le 86400',
    );
    expect(readiness).toContain("resolve-v2-production-pages-project.mjs");
    expect(readiness).toContain(
      "verify-v2-production-smoke-tenant-readiness.mjs",
    );
    expect(readiness).not.toContain("PRODUCTION_BACKUP_TYPE:");
  });

  it("resolves production Pages before either Pages or Router mutation", () => {
    expect(dispatcher).toContain("resolve-v2-production-pages-project.mjs");
    expect(dispatcher).not.toContain(
      "PRODUCTION_PAGES_PROJECT: ${{ vars.PRODUCTION_PAGES_PROJECT }}",
    );
    expect(dispatcher).not.toContain("PRODUCTION_CANDIDATE_PAGES_ORIGIN");
  });

  it("supports an empty unrouted Pages rollback baseline", () => {
    expect(rollback).toContain("EMPTY_UNROUTED");
    expect(rollback).toContain("EXISTING_DEPLOYMENT");
    expect(rollback).toContain("olfactoryops-v2-production");
  });

  it("provides a protected post-cutover public acceptance harness", () => {
    expect(acceptance).toContain("v2-production-ready");
    expect(acceptance).toContain("RUN_V2_PRODUCTION_PUBLIC_ACCEPTANCE");
    expect(acceptance).not.toMatch(/wrangler\s+(deploy|pages)/i);
    expect(publicHarness).toContain("PUBLIC_ACCEPTANCE_FIXTURE_CLEANUP=PASS");
    expect(publicHarness).toContain("PUBLIC_CROSS_TENANT_READ_DENIAL=PASS");
    expect(publicHarness).toContain("PUBLIC_PLATFORM_ADMIN_ISOLATION=PASS");
  });
});
