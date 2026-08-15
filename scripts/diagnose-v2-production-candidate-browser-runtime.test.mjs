import { expect, test } from "vitest";

import {
  browserRuntimeHttpAccepted,
  candidateBrowserRuntimeConfig,
  candidateBrowserRuntimeExpectation,
  candidateBrowserRuntimePaths,
  classifyCandidateBrowserRuntime,
  classifyCandidateBrowserSmokeParity,
  probeCandidateBrowserRuntimeRoutes,
} from "./diagnose-v2-production-candidate-browser-runtime.mjs";

function config() {
  return candidateBrowserRuntimeConfig({
    CANDIDATE_BROWSER_RUNTIME_RELEASE_SHA:
      candidateBrowserRuntimeExpectation.releaseSha,
    CANDIDATE_BROWSER_RUNTIME_TENANT_URL:
      candidateBrowserRuntimeExpectation.tenantUrl,
  });
}

function headers(overrides = {}) {
  return {
    "content-type": "text/html; charset=utf-8",
    "x-olfactoryops-workspace-router": "active",
    "x-olfactoryops-release-environment": "production",
    "x-olfactoryops-release-sha": candidateBrowserRuntimeExpectation.releaseSha,
    ...overrides,
  };
}

test("requires all five unauthenticated routes to have exact Router identity", async () => {
  const requests = [];
  const routes = await probeCandidateBrowserRuntimeRoutes({
    config: config(),
    nonce: "a".repeat(24),
    fetchFn: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(null, { status: 200, headers: headers() });
    },
  });
  expect(routes).toHaveLength(candidateBrowserRuntimePaths.length);
  expect(browserRuntimeHttpAccepted(routes)).toBe(true);
  for (const request of requests) {
    expect(request.options.method).toBe("GET");
    expect(request.options.redirect).toBe("manual");
    expect(request.options.credentials).toBe("omit");
    expect(request.options.headers).not.toHaveProperty("cookie");
    expect(request.options.headers).not.toHaveProperty("authorization");
  }
});

test("classifies the immutable smoke verifier sequence without exposing runtime text", () => {
  const healthy = {
    execution: "PASS",
    routeContract: "PASS",
    bundleApiOriginConfigured: "YES",
    apiSessionBoundary: "PASS",
    routeRuntimeErrors: "NO",
    bundleRuntimeErrors: "NO",
    apiRuntimeErrors: "NO",
  };
  expect(classifyCandidateBrowserSmokeParity(healthy)).toBe(
    "CANDIDATE_BROWSER_SMOKE_PARITY_HEALTHY",
  );
  expect(
    classifyCandidateBrowserSmokeParity({
      ...healthy,
      apiRuntimeErrors: "YES",
    }),
  ).toBe("CANDIDATE_BROWSER_SMOKE_PARITY_API_RUNTIME_ERRORS");
  expect(
    classifyCandidateBrowserSmokeParity({
      ...healthy,
      bundleApiOriginConfigured: "NO",
    }),
  ).toBe("CANDIDATE_BROWSER_SMOKE_PARITY_API_ORIGIN_FAILURE");
  expect(
    classifyCandidateBrowserSmokeParity({ ...healthy, execution: "UNAVAILABLE" }),
  ).toBe("CANDIDATE_BROWSER_SMOKE_PARITY_UNAVAILABLE");
});

test("fails closed for missing identity headers or incorrect immutable inputs", async () => {
  const routes = await probeCandidateBrowserRuntimeRoutes({
    config: config(),
    nonce: "b".repeat(24),
    fetchFn: async () =>
      new Response(null, {
        status: 200,
        headers: headers({ "x-olfactoryops-release-sha": "wrong" }),
      }),
  });
  expect(browserRuntimeHttpAccepted(routes)).toBe(false);
  expect(() =>
    candidateBrowserRuntimeConfig({
      CANDIDATE_BROWSER_RUNTIME_RELEASE_SHA: "wrong",
      CANDIDATE_BROWSER_RUNTIME_TENANT_URL:
        candidateBrowserRuntimeExpectation.tenantUrl,
    }),
  ).toThrow("FAIL_INVALID_INPUT");
});

test("classifies safe browser-only outcomes without exposing console content", () => {
  expect(
    classifyCandidateBrowserRuntime({
      httpAccepted: true,
      browserRoutes: candidateBrowserRuntimePaths.map((path) => ({
        path,
        finalHostMatch: "YES",
        rootVisible: path === "/" ? "YES" : "NOT_APPLICABLE",
        authCardVisible: path === "/" ? "NOT_APPLICABLE" : "YES",
        pageError: "NO",
        consoleError: "NO",
      })),
    }),
  ).toBe("CANDIDATE_BROWSER_RUNTIME_HEALTHY");
  expect(
    classifyCandidateBrowserRuntime({
      httpAccepted: true,
      browserRoutes: [{ pageError: "NO", consoleError: "YES" }],
    }),
  ).toBe("CANDIDATE_BROWSER_RUNTIME_ERRORS_OBSERVED");
});
