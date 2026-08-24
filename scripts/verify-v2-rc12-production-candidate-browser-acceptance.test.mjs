import { expect, test } from "vitest";
import {
  AUTH_TRANSPORT_PATHS,
  CANDIDATE_PUBLIC_AUTH_ORIGIN,
  RC12_SHA,
  browserAuthTransportIsExpected,
  candidateBrowserInputs,
} from "./verify-v2-rc12-production-candidate-browser-acceptance.mjs";

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

test("RC12 browser auth transport accepts only JSON 4xx responses with both CORS preflights and no network failures", () => {
  const valid = {
    login: { status: 401, json: true, opaque: false, urlMatch: true },
    signup: { status: 422, json: true, opaque: false, urlMatch: true },
    loginPreflight: true,
    signupPreflight: true,
    rawNetworkErrors: 0,
  };
  expect(browserAuthTransportIsExpected(valid)).toBe(true);
  for (const change of [
    { login: { ...valid.login, status: 0 } },
    { signup: { ...valid.signup, status: 200 } },
    { signup: { ...valid.signup, json: false } },
    { login: { ...valid.login, opaque: true } },
    { loginPreflight: false },
    { signupPreflight: false },
    { rawNetworkErrors: 1 },
  ]) {
    expect(browserAuthTransportIsExpected({ ...valid, ...change })).toBe(false);
  }
  expect(AUTH_TRANSPORT_PATHS).toEqual({
    login: "/api/v1/v2/platform/auth/login",
    signup: "/api/v1/v2/platform/auth/signup",
  });
});
