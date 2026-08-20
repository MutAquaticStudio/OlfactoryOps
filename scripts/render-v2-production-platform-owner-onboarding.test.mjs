import { expect, test } from "vitest";
import { renderPlatformOwnerOnboardingConfig } from "./render-v2-production-platform-owner-onboarding.mjs";

const input = {
  workerName: "oo-v2-platform-owner-onboarding-123-1",
  releaseSha: "fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd",
  hyperdriveId: "b415b7572d9f45058ebb4ec4166b8739",
};

test("renders a route-free workers.dev config pinned to RC10 production Hyperdrive", () => {
  const rendered = renderPlatformOwnerOnboardingConfig(input);
  expect(rendered).toContain("workers_dev = true");
  expect(rendered).toContain('main = "worker/v2-platform-owner-onboarding.ts"');
  expect(rendered).toContain(
    'RELEASE_GIT_SHA = "fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd"',
  );
  expect(rendered).toContain('id = "b415b7572d9f45058ebb4ec4166b8739"');
  expect(rendered).not.toMatch(/routes\s*=|\[\[routes\]\]|custom_domain\s*=/);
});

test("rejects an unscoped worker name, release, or Hyperdrive binding", () => {
  expect(() =>
    renderPlatformOwnerOnboardingConfig({
      ...input,
      workerName: "olfactoryops-v2-api-production",
    }),
  ).toThrow("OWNER_ONBOARDING_CONFIG_INVALID_WORKER_NAME");
  expect(() =>
    renderPlatformOwnerOnboardingConfig({
      ...input,
      releaseSha: "0".repeat(40),
    }),
  ).toThrow("OWNER_ONBOARDING_CONFIG_INVALID_RELEASE");
  expect(() =>
    renderPlatformOwnerOnboardingConfig({
      ...input,
      hyperdriveId: "0".repeat(32),
    }),
  ).toThrow("OWNER_ONBOARDING_CONFIG_INVALID_HYPERDRIVE");
});
