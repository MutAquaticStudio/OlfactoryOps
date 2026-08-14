import { describe, expect, it, vi } from "vitest";
import {
  createRouterRequestPathDiagnostic,
  type RouterRequestPathDiagnosticEnv,
} from "./v2-tenant-router-request-path-diagnostic";

const releaseSha = "de0734df2d2b5b2dd3a2a67ee542131235e75eb7";
const fixtureHostname =
  "rc9-release-31736285494-469ca8942a.next.labofscents.org";

function fetcher() {
  return { fetch: vi.fn(), connect: vi.fn() } as unknown as Fetcher;
}

function env(
  overrides: Partial<RouterRequestPathDiagnosticEnv> = {},
): RouterRequestPathDiagnosticEnv {
  return {
    ROUTER_REQUEST_PATH_DIAGNOSTIC_TOKEN: "test-only-token",
    DIAGNOSTIC_FIXTURE_HOSTNAME: fixtureHostname,
    TARGET_RELEASE_SHA: releaseSha,
    DIAGNOSTIC_CORRELATION_NONCE: "a".repeat(32),
    DIAGNOSTIC_PROBE_TARGET: "TARGET_ROUTER",
    DIAGNOSTIC_PROBE_QUERY_KEY: "oo_service_diag",
    TARGET_ROUTER: fetcher(),
    ...overrides,
  };
}

function request(path: string, token = "test-only-token") {
  return new Request(`https://diagnostic.invalid${path}`, {
    headers: {
      "x-olfactoryops-router-request-path-diagnostic": token,
    },
  });
}

describe("router request-path diagnostic Worker", () => {
  it("keeps unauthorized and unknown paths fail-closed", async () => {
    const worker = createRouterRequestPathDiagnostic();
    expect((await worker.fetch(request("/ready", "wrong"), env())).status).toBe(
      404,
    );
    expect((await worker.fetch(request("/other"), env())).status).toBe(404);
  });

  it("returns an exact ready response without invoking a service binding", async () => {
    const targetFetch = vi.fn();
    const worker = createRouterRequestPathDiagnostic(targetFetch);
    const response = await worker.fetch(request("/ready"), env());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      candidateRouterRequestPathDiagnostic: "READY",
    });
    expect(targetFetch).not.toHaveBeenCalled();
  });

  it("probes the exact fixture internally without forwarding caller tenant headers", async () => {
    const targetFetch = vi.fn(
      async (_target: Fetcher, targetRequest: Request) => {
        const url = new URL(targetRequest.url);
        expect(url.hostname).toBe(fixtureHostname);
        expect(url.searchParams.get("oo_service_diag")).toBe("a".repeat(32));
        expect(targetRequest.headers.get("x-organization-id")).toBeNull();
        expect(targetRequest.headers.get("x-tenant-id")).toBeNull();
        expect(targetRequest.headers.get("x-forwarded-host")).toBeNull();
        expect(targetRequest.headers.get("cache-control")).toBe("no-cache");
        return new Response("candidate page", {
          status: 200,
          headers: {
            "cache-control": "no-store",
            "x-olfactoryops-workspace-router": "active",
            "x-olfactoryops-release-environment": "production",
            "x-olfactoryops-release-sha": releaseSha,
          },
        });
      },
    );
    const worker = createRouterRequestPathDiagnostic(targetFetch);
    const response = await worker.fetch(
      new Request("https://diagnostic.invalid/probe", {
        headers: {
          "x-olfactoryops-router-request-path-diagnostic": "test-only-token",
          "x-organization-id": "attacker-controlled",
          "x-forwarded-host": "attacker.invalid",
        },
      }),
      env(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      candidateRouterRequestPathDiagnostic: "COMPLETE",
      probeTarget: "TARGET_ROUTER",
      targetStatusClass: "2XX",
      targetRouterHeaderActive: true,
      targetReleaseEnvironmentProduction: true,
      targetReleaseShaMatch: true,
      targetCacheControlPresent: true,
      targetBodyClass: "OTHER",
    });
  });

  it("classifies a target controlled 404 without exposing its body", async () => {
    const worker = createRouterRequestPathDiagnostic(
      async () =>
        new Response("fixture-or-database-details-must-not-leak", {
          status: 404,
          headers: { "cache-control": "no-store" },
        }),
    );
    const response = await worker.fetch(request("/probe"), env());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      targetStatusClass: "404",
      targetBodyClass: "NOT_FOUND",
      targetRouterHeaderActive: false,
    });
    expect(JSON.stringify(body)).not.toContain(
      "fixture-or-database-details-must-not-leak",
    );
  });

  it("uses an explicitly configured shadow binding only", async () => {
    const targetFetch = vi.fn(
      async () => new Response("Not found", { status: 404 }),
    );
    const worker = createRouterRequestPathDiagnostic(targetFetch);
    const response = await worker.fetch(
      request("/probe"),
      env({
        DIAGNOSTIC_PROBE_TARGET: "SHADOW_ROUTER",
        DIAGNOSTIC_PROBE_QUERY_KEY: "oo_shadow_diag",
        SHADOW_ROUTER: fetcher(),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { probeTarget: string };
    expect(body.probeTarget).toBe("SHADOW_ROUTER");
  });

  it("returns only a fixed safe unavailable envelope for unexpected failures", async () => {
    const worker = createRouterRequestPathDiagnostic(async () => {
      throw new Error("database-url-or-token-details");
    });
    const response = await worker.fetch(request("/probe"), env());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      candidateRouterRequestPathDiagnostic: "UNAVAILABLE",
    });
    expect(JSON.stringify(body)).not.toContain("database-url-or-token-details");
  });
});
