import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  emitR2BackupFailure,
  R2BackupError,
  runR2BackupPreflight,
} from "./verify-v2-rc10-backup-r2-private.mjs";

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
const pagesResolver = readFileSync(
  "scripts/resolve-v2-production-pages-project.mjs",
  "utf8",
);
const publicHarness = readFileSync(
  "scripts/verify-v2-production-public-acceptance.mjs",
  "utf8",
);

describe("RC10 final readiness operations", () => {
  it("isolates private backup R2 operations behind the dedicated credential", () => {
    expect(backup).toContain("CREATE_RC10_PRECUTOVER_BACKUP");
    expect(backup).toContain("fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd");
    expect(backup).toContain("olfactoryops-v2-production-backups");
    expect(backup).toContain("--format=custom --no-owner --no-acl");
    expect(backup).toContain("verify-v2-rc10-backup-r2-private.mjs");
    expect(backup).toContain("CLOUDFLARE_R2_BACKUP_TOKEN");
    expect(backup).not.toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(backupR2Private).toContain("CLOUDFLARE_R2_BACKUP_TOKEN");
    expect(backupR2Private).not.toContain(
      'required(environment, "CLOUDFLARE_API_TOKEN"',
    );
    expect(backup).not.toContain("r2 bucket list --json");
    expect(backup).not.toContain("r2-private.txt");
    expect(backup).not.toContain("wrangler r2 bucket create");
    expect(backupR2Private).toContain("/r2/buckets/");
    expect(backupR2Private).toContain('method: "POST"');
    expect(backupR2Private).toContain("/domains/managed");
    expect(backupR2Private).toContain("/domains/custom");
    expect(backupR2Private).not.toContain("console.error");
    expect(
      backup.indexOf("Preflight the dedicated private R2 backup bucket"),
    ).toBeLessThan(
      backup.indexOf("Create and validate a runner-local custom-format dump"),
    );
    expect(backupR2Private).toContain("R2_BACKUP_TOKEN_LIST_ACCESS=PASS");
    expect(backupR2Private).toContain("BACKUP_BUCKET_R2DEV=DISABLED");
    expect(backup).toContain("BACKUP_CHECKSUM=PASS");
    expect(backup).toContain("BACKUP_LOCAL_CLEANUP=PASS");
    expect(backup).toContain("if: always()");
    expect(backup).not.toMatch(
      /pages deploy|wrangler deploy|custom.domain|routes\s*=/i,
    );
  });

  it("emits only safe evidence when protected R2 configuration is unavailable", () => {
    let output = "";
    try {
      execFileSync(
        process.execPath,
        ["scripts/verify-v2-rc10-backup-r2-private.mjs"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            BACKUP_BUCKET: "",
            CLOUDFLARE_ACCOUNT_ID: "",
            CLOUDFLARE_R2_BACKUP_TOKEN: "",
          },
        },
      );
    } catch (error) {
      output = String(error.stdout);
    }
    expect(output).toBe(
      [
        "R2_BACKUP_TOKEN_PRESENT=FAIL",
        "R2_BACKUP_TOKEN_LIST_ACCESS=FAIL",
        "R2_BACKUP_API_HTTP_STATUS=0",
        "R2_BACKUP_API_CF_ERROR_CODE=NONE",
        "BACKUP_BUCKET_CREATED=UNPROVEN",
        "BACKUP_BUCKET=UNPROVEN",
        "BACKUP_BUCKET_PRIVATE=UNPROVEN",
        "BACKUP_R2_API_OPERATION=LIST_BUCKETS",
        "BACKUP_R2_API_HTTP_STATUS=0",
        "BACKUP_R2_API_CF_ERROR_CODE=NONE",
        "BACKUP_R2_FAILURE_CLASS=AUTHENTICATION",
        "",
      ].join("\n"),
    );
    expect(output).toContain("R2_BACKUP_TOKEN_PRESENT=FAIL");
    expect(output).not.toMatch(/ReferenceError|CONFIG_|CLOUDFLARE_API_TOKEN/);
  });

  it("uses the dedicated token for list, private-bucket checks, and no other credential", async () => {
    const response = (body) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          success: true,
          result: { buckets: [{ name: "olfactoryops-v2-production-backups" }] },
        }),
      )
      .mockResolvedValueOnce(
        response({ success: true, result: { enabled: false } }),
      )
      .mockResolvedValueOnce(
        response({ success: true, result: { domains: [] } }),
      );
    const output = [];

    await runR2BackupPreflight({
      environment: {
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_R2_BACKUP_TOKEN: "fixture",
        BACKUP_BUCKET: "olfactoryops-v2-production-backups",
      },
      fetchImpl,
      emit: (line) => output.push(line),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(output).toEqual(
      expect.arrayContaining([
        "R2_BACKUP_TOKEN_PRESENT=PASS",
        "R2_BACKUP_TOKEN_LIST_ACCESS=PASS",
        "BACKUP_BUCKET_CREATED=NO",
        "BACKUP_BUCKET_PRIVATE=PASS",
      ]),
    );
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.headers.authorization).toBe("Bearer fixture");
    }
    expect(output.join("\n")).not.toContain("fixture");
  });

  it("creates only the fixed private backup bucket after a successful list", async () => {
    const response = (body) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({ success: true, result: { buckets: [] } }),
      )
      .mockResolvedValueOnce(
        response({
          success: true,
          result: { name: "olfactoryops-v2-production-backups" },
        }),
      )
      .mockResolvedValueOnce(
        response({ success: true, result: { enabled: false } }),
      )
      .mockResolvedValueOnce(
        response({ success: true, result: { domains: [] } }),
      );

    await runR2BackupPreflight({
      environment: {
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_R2_BACKUP_TOKEN: "fixture",
        BACKUP_BUCKET: "olfactoryops-v2-production-backups",
      },
      fetchImpl,
      emit: () => {},
    });

    expect(fetchImpl.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "olfactoryops-v2-production-backups" }),
    });
  });

  it("reports safe R2 API authorization evidence without provider payloads", () => {
    const output = [];
    emitR2BackupFailure(
      new R2BackupError("LIST_BUCKETS", {
        httpStatus: "403",
        cfErrorCode: "10000",
        failureClass: "AUTHORIZATION",
      }),
      (line) => output.push(line),
      { CLOUDFLARE_R2_BACKUP_TOKEN: "fixture" },
    );
    expect(output).toEqual(
      expect.arrayContaining([
        "R2_BACKUP_TOKEN_LIST_ACCESS=FAIL",
        "R2_BACKUP_API_HTTP_STATUS=403",
        "R2_BACKUP_API_CF_ERROR_CODE=10000",
      ]),
    );
    expect(output.join("\n")).not.toMatch(/message|Bearer|fixture/i);
  });

  it("preflights only the exact unrouted production Pages project with Pages Read authority", () => {
    const projectReadPreflight = pages.slice(
      pages.indexOf("- name: Preflight the dedicated Pages read credential"),
      pages.indexOf(
        "- name: Capture and persist the first-production route baseline",
      ),
    );
    const routeBaselineCapture = pages.slice(
      pages.indexOf(
        "- name: Capture and persist the first-production route baseline",
      ),
      pages.indexOf(
        "- name: Verify read-only rollback identifiers and Pages baseline",
      ),
    );
    expect(pages).toContain("olfactoryops-v2-production");
    expect(pages).toContain("CLOUDFLARE_PAGES_READ_TOKEN");
    expect(pages).toContain("Preflight the dedicated Pages read credential");
    expect(pages).toContain("verify-v2-production-rollback-readiness.mjs");
    expect(pages).toContain(
      "node scripts/resolve-v2-production-pages-project.mjs",
    );
    expect(projectReadPreflight).not.toContain("CLOUDFLARE_API_TOKEN");
    expect(routeBaselineCapture).toContain("CLOUDFLARE_API_TOKEN");
    expect(routeBaselineCapture).toContain(
      "persist-v2-first-release-route-baseline.mjs",
    );
    expect(routeBaselineCapture).not.toMatch(
      /curl\s+.*(?:POST|PUT|PATCH|DELETE)/i,
    );
    expect(pages).not.toMatch(
      /wrangler|pages\s+project\s+create|pages\s+deploy/i,
    );
    expect(pages).not.toMatch(/curl\s+.*(?:POST|PUT|PATCH|DELETE)/i);
    expect(pages).not.toContain("production-candidate");
    expect(pagesResolver).toContain("CLOUDFLARE_PAGES_READ_TOKEN");
    expect(pagesResolver).toContain("PAGES_READ_TOKEN_ACCESS");
    expect(pagesResolver).toContain("PAGES_READ_TOKEN_ACTIVE");
    expect(pagesResolver).toContain("PAGES_READ_TOKEN_ACCOUNT_BINDING");
    expect(pagesResolver).toContain("PAGES_READ_TOKEN_PERMISSION");
    expect(pagesResolver).toContain("/pages/projects/");
    expect(pagesResolver).not.toMatch(
      /method:\s*["'](?:POST|PUT|PATCH|DELETE)/i,
    );
    expect(pagesResolver).not.toMatch(
      /wrangler|pages\s+project\s+create|pages\s+deploy/i,
    );
  });

  it("requires immutable backup evidence and smoke-tenant proof", () => {
    expect(readiness).toContain("backup_run_id:");
    expect(readiness).toContain("V2 RC10 Production Backup Snapshot");
    expect(readiness).toContain(
      'test "$((now_epoch - created_epoch))" -le 86400',
    );
    expect(readiness).toContain("resolve-v2-production-pages-project.mjs");
    expect(readiness).toContain("CLOUDFLARE_PAGES_READ_TOKEN");
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

  it("keeps the dedicated R2 credential out of ordinary release dispatcher jobs", () => {
    expect(dispatcher).toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(dispatcher).not.toContain("CLOUDFLARE_R2_BACKUP_TOKEN");
  });

  it("supports an empty unrouted Pages rollback baseline", () => {
    expect(rollback).toContain("olfactoryops-v2-production");
    expect(rollback).toContain("CLOUDFLARE_PAGES_READ_TOKEN");
    expect(rollback).toContain("resolveProductionPagesProject");
    expect(rollback).toContain("emitPagesProjectFailure");
    expect(rollback).toContain("DEPLOYMENT_STATE");
    expect(rollback).toContain("API_HTTP_STATUS");
    expect(rollback).toContain("API_CF_ERROR_CODE");
    expect(rollback).not.toContain("response.text");
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
