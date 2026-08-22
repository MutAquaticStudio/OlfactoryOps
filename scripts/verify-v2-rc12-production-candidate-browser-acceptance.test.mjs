import { expect, test } from "vitest";
import { CANDIDATE_PUBLIC_AUTH_ORIGIN, RC12_SHA, candidateBrowserInputs } from "./verify-v2-rc12-production-candidate-browser-acceptance.mjs";

const validEnvironment = {
  V2_PRODUCTION_CANDIDATE_EXPECTED_SHA: RC12_SHA,
  V2_PRODUCTION_CANDIDATE_TENANT_URL: "https://release-fixture.next.labofscents.org",
};

test("RC12 browser acceptance allows only an exact candidate tenant and RC12", () => {
  const result = candidateBrowserInputs(validEnvironment);
  expect(result.tenant.hostname).toBe("release-fixture.next.labofscents.org");
  expect(result.publicAuthOrigin).toBe(CANDIDATE_PUBLIC_AUTH_ORIGIN);
});

test("RC12 browser acceptance rejects raw Pages, production, root candidate, and prior release inputs", () => {
  for (const changes of [
    { V2_PRODUCTION_CANDIDATE_EXPECTED_SHA: "98cfac77853ffb0b6b69235bb3483117dc3b6961" },
    { V2_PRODUCTION_CANDIDATE_TENANT_URL: "https://production-candidate.olfactoryops-v2-production-candidate.pages.dev" },
    { V2_PRODUCTION_CANDIDATE_TENANT_URL: "https://labofscents.org" },
    { V2_PRODUCTION_CANDIDATE_TENANT_URL: "https://next.labofscents.org" },
    { V2_PRODUCTION_CANDIDATE_TENANT_URL: "https://too.many.next.labofscents.org" },
  ]) expect(() => candidateBrowserInputs({ ...validEnvironment, ...changes })).toThrow("INVALID_INPUT");
});
