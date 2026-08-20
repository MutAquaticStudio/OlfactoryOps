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
