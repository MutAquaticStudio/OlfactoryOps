import { describe, expect, it } from "vitest";
import {
  candidateBrowserRouteDiagnosticConfig,
  candidateBrowserRoutePaths,
  classifyCandidateBrowserRouteMatrix,
  expectedPagesOrigin,
  expectedReleaseSha,
  expectedTenantUrl,
  probeCandidateBrowserRoutes,
  safeRouteMatrixLines,
} from "./verify-v2-production-candidate-browser-route-diagnostic.mjs";

function environment() {
  return {
    CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_RELEASE_SHA: expectedReleaseSha,
    CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_TENANT_URL: expectedTenantUrl,
    CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_PAGES_ORIGIN: expectedPagesOrigin,
  };
}

function response(status = 200, headers = {}) {
  return new Response(null, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function route(path, overrides = {}) {
  return {
    path,
    tenantHttpStatus: "200",
    tenantRouterActive: true,
    tenantReleaseShaMatch: true,
    tenantContentTypeHtml: true,
    pagesHttpStatus: "200",
    pagesContentTypeHtml: true,
    ...overrides,
  };
}

function healthyRoutes() {
  return candidateBrowserRoutePaths.map((path) => route(path));
}

describe("candidate browser route diagnostic", () => {
  it("pins the exact RC9 tenant host and all five route paths", () => {
    expect(
      candidateBrowserRouteDiagnosticConfig(environment()).releaseSha,
    ).toBe(expectedReleaseSha);
    expect(candidateBrowserRoutePaths).toEqual([
      "/",
      "/login",
      "/signup",
      "/v2/login",
      "/v2/signup",
    ]);
    expect(() =>
      candidateBrowserRouteDiagnosticConfig({
        ...environment(),
        CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_TENANT_URL: "https://wrong.invalid",
      }),
    ).toThrow("FAIL_INVALID_INPUT");
    expect(() =>
      candidateBrowserRouteDiagnosticConfig({
        ...environment(),
        CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_PAGES_ORIGIN:
          "https://wrong.invalid",
      }),
    ).toThrow("FAIL_INVALID_INPUT");
  });

  it("uses unauthenticated manual GET requests and emits only safe route fields", async () => {
    const requests = [];
    const routes = await probeCandidateBrowserRoutes({
      config: candidateBrowserRouteDiagnosticConfig(environment()),
      nonce: "a".repeat(32),
      fetchFn: async (url, options) => {
        requests.push({ url: String(url), options });
        return response(200, {
          "x-olfactoryops-workspace-router": String(url).includes(
            ".next.labofscents.org",
          )
            ? "active"
            : "",
          "x-olfactoryops-release-sha": expectedReleaseSha,
          "x-hidden": "must-not-appear",
        });
      },
    });

    expect(requests).toHaveLength(10);
    for (const request of requests) {
      expect(request.url).toContain("oo_candidate_browser_route_diag=");
      expect(request.options.method).toBe("GET");
      expect(request.options.redirect).toBe("manual");
      expect(request.options.credentials).toBe("omit");
      expect(request.options.headers).toEqual({
        "cache-control": "no-cache",
        pragma: "no-cache",
      });
      expect(request.options.headers).not.toHaveProperty("authorization");
      expect(request.options.headers).not.toHaveProperty("cookie");
    }
    const output = safeRouteMatrixLines(
      routes,
      classifyCandidateBrowserRouteMatrix(routes),
    ).join("\n");
    expect(output).toContain("PATH=/v2/signup");
    expect(output).toContain("TENANT_HTTP_STATUS=200");
    expect(output).not.toContain("must-not-appear");
    expect(output).not.toContain(expectedReleaseSha);
  });

  it("retains a safe numeric failure when a public request is unavailable", async () => {
    const routes = await probeCandidateBrowserRoutes({
      config: candidateBrowserRouteDiagnosticConfig(environment()),
      nonce: "b".repeat(32),
      fetchFn: async () => {
        throw new Error("secret host must-not-appear");
      },
    });
    expect(routes[0].tenantHttpStatus).toBe("000");
    expect(routes[0].pagesHttpStatus).toBe("000");
    const output = safeRouteMatrixLines(
      routes,
      classifyCandidateBrowserRouteMatrix(routes),
    ).join("\n");
    expect(output).not.toContain("must-not-appear");
  });

  it.each([
    [
      "A",
      [
        route("/", {
          tenantHttpStatus: "404",
          tenantRouterActive: false,
          tenantReleaseShaMatch: false,
        }),
        ...healthyRoutes().slice(1),
      ],
      "CANDIDATE_CUSTOM_DOMAIN_OR_ROUTER_INGRESS_REGRESSION",
      "NO",
    ],
    [
      "B",
      healthyRoutes().map((item) =>
        item.path === "/login"
          ? {
              ...item,
              tenantHttpStatus: "404",
              tenantRouterActive: false,
              tenantReleaseShaMatch: false,
            }
          : item,
      ),
      "CANDIDATE_ROUTER_REQUEST_PATH_REGRESSION",
      "NO",
    ],
    [
      "C",
      healthyRoutes().map((item) =>
        item.path === "/v2/signup"
          ? { ...item, tenantHttpStatus: "404", pagesHttpStatus: "404" }
          : item,
      ),
      "CANDIDATE_PAGES_DEEP_LINK_ROUTING_FAILURE",
      "UNPROVEN",
    ],
    [
      "C deep-link failures take precedence over an auth status difference",
      healthyRoutes().map((item) =>
        item.path === "/login"
          ? {
              ...item,
              tenantHttpStatus: "404",
              pagesHttpStatus: "503",
            }
          : item,
      ),
      "CANDIDATE_PAGES_DEEP_LINK_ROUTING_FAILURE",
      "UNPROVEN",
    ],
    [
      "D",
      healthyRoutes(),
      "BROWSER_ONLY_OR_TRANSIENT_ACCEPTANCE_FAILURE",
      "NO",
    ],
    [
      "E",
      healthyRoutes().map((item) =>
        item.path === "/v2/login"
          ? { ...item, pagesContentTypeHtml: false }
          : item,
      ),
      "AUTH_ROUTE_OR_SPA_FALLBACK_DISCREPANCY",
      "UNPROVEN",
    ],
    [
      "E status divergence",
      healthyRoutes().map((item) =>
        item.path === "/v2/login" ? { ...item, pagesHttpStatus: "404" } : item,
      ),
      "AUTH_ROUTE_OR_SPA_FALLBACK_DISCREPANCY",
      "UNPROVEN",
    ],
    [
      "Router identity mismatch does not authorize browser-only acceptance",
      healthyRoutes().map((item) =>
        item.path === "/login"
          ? {
              ...item,
              tenantRouterActive: false,
              tenantReleaseShaMatch: false,
            }
          : item,
      ),
      "UNCLASSIFIED_CANDIDATE_BROWSER_ROUTE_MATRIX",
      "UNPROVEN",
    ],
  ])("classifies matrix branch %s", (_branch, routes, rootCause, rc10) => {
    const classification = classifyCandidateBrowserRouteMatrix(routes);
    expect(classification.rootCause).toBe(rootCause);
    expect(classification.rc10Required).toBe(rc10);
  });

  it("keeps uncovered mixed evidence unclassified instead of inventing an RC10 defect", () => {
    const routes = healthyRoutes().map((item) =>
      item.path === "/" ? { ...item, pagesHttpStatus: "404" } : item,
    );
    const classification = classifyCandidateBrowserRouteMatrix(routes);
    expect(classification.rootCause).toBe(
      "UNCLASSIFIED_CANDIDATE_BROWSER_ROUTE_MATRIX",
    );
    expect(classification.rc10Required).toBe("UNPROVEN");
  });

  it("keeps a Router-identified tenant 404 with a healthy Pages route in the auth discrepancy branch", () => {
    const routes = healthyRoutes().map((item) =>
      item.path === "/signup" ? { ...item, tenantHttpStatus: "404" } : item,
    );
    const classification = classifyCandidateBrowserRouteMatrix(routes);
    expect(classification.rootCause).toBe(
      "AUTH_ROUTE_OR_SPA_FALLBACK_DISCREPANCY",
    );
    expect(classification.rc10Required).toBe("UNPROVEN");
  });

  it("keeps matching alias failures across tenant and Pages surfaces unclassified", () => {
    const routes = healthyRoutes().map((item) =>
      ["/login", "/v2/login"].includes(item.path)
        ? { ...item, tenantHttpStatus: "404" }
        : item,
    );
    const classification = classifyCandidateBrowserRouteMatrix(routes);
    expect(classification.rootCause).toBe(
      "UNCLASSIFIED_CANDIDATE_BROWSER_ROUTE_MATRIX",
    );
    expect(classification.rc10Required).toBe("UNPROVEN");
  });
});
