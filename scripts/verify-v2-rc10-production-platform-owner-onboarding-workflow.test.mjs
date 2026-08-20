import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("Platform Owner onboarding workflow remains protected, exact-RC10, and route-free", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/verify-v2-rc10-production-platform-owner-onboarding-workflow.mjs",
    ],
    { encoding: "utf8" },
  );
  expect(output).toContain("PLATFORM_OWNER_ONBOARDING_WORKFLOW=PASS");
  expect(output).toContain("PLATFORM_OWNER_ONBOARDING_RC10_PATH=PASS");
  expect(output).toContain("PLATFORM_OWNER_ONBOARDING_NO_PUBLIC_ROUTE=PASS");
});

test("does not derive a persisted workspace slug from the email-link token", () => {
  const worker = readFileSync(
    "worker/v2-platform-owner-onboarding.ts.template",
    "utf8",
  );
  expect(worker).not.toContain("ONBOARDING_LINK_TOKEN.slice");
  expect(worker).toContain("crypto.randomUUID()");
});

test("keeps email delivery failures bounded and preflights the runtime before delivery", () => {
  const worker = readFileSync(
    "worker/v2-platform-owner-onboarding.ts.template",
    "utf8",
  );
  const workflow = readFileSync(
    ".github/workflows/v2-rc10-production-platform-owner-onboarding.yml",
    "utf8",
  );
  expect(worker).toContain('return "EMAIL_REJECTED_4XX"');
  expect(worker).toContain('return "EMAIL_REJECTED_5XX"');
  expect(worker).toContain('return "EMAIL_TRANSPORT_FAILURE"');
  expect(worker).toContain('state: "USER_STATE_UNAVAILABLE"');
  expect(worker).not.toContain("state: delivery.error");
  expect(workflow).toContain("OWNER_ONBOARDING_WORKER_READINESS=PASS");
  expect(workflow).toContain("OWNER_ONBOARDING_WORKER_READINESS=FAIL");
  expect(
    workflow.indexOf("OWNER_ONBOARDING_RUNTIME_PREFLIGHT=PASS"),
  ).toBeLessThan(workflow.indexOf('dispatch_status="$(curl'));
});
