import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  edgeBrowserPaths,
  edgeFixtureHostname,
  edgeHyperdriveId,
  edgePagesProject,
  edgeReleaseSha,
  edgeRouterService,
  edgeWorkspaceBaseDomain,
  edgeReconciliationConfig,
  captureCandidateEdgePostflight,
  inventoryImmutablePages,
  preflightCandidateDomain,
  verifyCandidateDomain,
  verifyTenantRoutes,
} from "./reconcile-v2-production-candidate-edge.mjs";
import { renderCandidateEdgeRouterConfig } from "./render-v2-production-candidate-edge-router-config.mjs";

const temporaryDirectories = [];

function environment(overrides = {}) {
  return {
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    CLOUDFLARE_API_TOKEN: "not-a-real-token",
    CANDIDATE_EDGE_RECONCILE_RELEASE_SHA: edgeReleaseSha,
    CANDIDATE_EDGE_RECONCILE_FIXTURE_HOSTNAME: edgeFixtureHostname,
    CANDIDATE_EDGE_RECONCILE_PAGES_PROJECT: edgePagesProject,
    CANDIDATE_EDGE_RECONCILE_HYPERDRIVE_ID: edgeHyperdriveId,
    GITHUB_ENV: join(tmpdir(), "candidate-edge-github-env"),
    ...overrides,
  };
}

function deployment() {
  return {
    environment: "preview",
    is_skipped: false,
    latest_stage: { status: "success" },
    url: `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
    aliases: [],
    deployment_trigger: {
      metadata: { branch: "production-candidate", commit_hash: edgeReleaseSha },
    },
  };
}

function htmlResponse(headers = {}) {
  return new Response(null, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function successfulEdgeFetch(request, options) {
  const url = new URL(request);
  if (url.hostname === "api.cloudflare.com")
    return Promise.resolve(
      new Response(JSON.stringify({ success: true, result: [deployment()] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  expect(options.redirect).toBe("manual");
  expect(options.credentials).toBe("omit");
  expect(options.headers["cache-control"]).toBe("no-cache");
  expect(options.headers.pragma).toBe("no-cache");
  return Promise.resolve(htmlResponse());
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("RC9 candidate edge reconciliation", () => {
  it("pins only the exact RC9 candidate inputs", () => {
    expect(edgeReconciliationConfig(environment()).releaseSha).toBe(
      edgeReleaseSha,
    );
    expect(edgeReconciliationConfig(environment()).hyperdriveId).toBe(
      edgeHyperdriveId,
    );
    expect(edgeBrowserPaths).toEqual([
      "/",
      "/login",
      "/signup",
      "/v2/login",
      "/v2/signup",
    ]);
    expect(() =>
      edgeReconciliationConfig(
        environment({ CANDIDATE_EDGE_RECONCILE_RELEASE_SHA: "c".repeat(40) }),
      ),
    ).toThrow("INVALID_IMMUTABLE_INPUT");
    expect(() =>
      edgeReconciliationConfig(
        environment({ CANDIDATE_EDGE_RECONCILE_HYPERDRIVE_ID: "b".repeat(32) }),
      ),
    ).toThrow("INVALID_HYPERDRIVE_ID");
    expect(() =>
      edgeReconciliationConfig(
        environment({
          CANDIDATE_EDGE_RECONCILE_FIXTURE_HOSTNAME: "wrong.invalid",
        }),
      ),
    ).toThrow("INVALID_IMMUTABLE_INPUT");
  });

  it("selects one exact immutable Pages deployment without exposing its URL or token", async () => {
    const lines = [];
    const persisted = [];
    const config = edgeReconciliationConfig(environment());
    const result = await inventoryImmutablePages({
      config,
      environment: environment(),
      fetchFn: successfulEdgeFetch,
      emitLine: (line) => lines.push(line),
      persistOrigin: (origin) => persisted.push(origin),
    });
    expect(result.origin).toBe(
      `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
    );
    expect(persisted).toEqual([result.origin]);
    expect(lines).toContain("PAGES_RC9_DEPLOYMENT_EXISTS=PASS");
    expect(lines).toContain("PAGES_RC9_COMMIT_MATCH=PASS");
    expect(lines).toContain("PAGES_RC9_IMMUTABLE_DEPLOYMENT=PASS");
    expect(lines).toContain("PAGES_RC9_BRANCH_ALIAS_ROUTING=HEALTHY");
    expect(lines.join("\n")).not.toContain(result.origin);
    expect(lines.join("\n")).not.toContain("not-a-real-token");
  });

  it("fails closed when a Pages deployment is not uniquely pinned to RC9", async () => {
    const config = edgeReconciliationConfig(environment());
    const response = new Response(
      JSON.stringify({ success: true, result: [deployment(), deployment()] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    await expect(
      inventoryImmutablePages({
        config,
        environment: environment(),
        fetchFn: async () => response,
        persistOrigin: () => undefined,
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENT_NOT_UNIQUE");
  });

  it("rejects skipped or incomplete Pages deployments before the Router can change", async () => {
    const config = edgeReconciliationConfig(environment());
    const skipped = {
      ...deployment(),
      is_skipped: true,
      latest_stage: { status: "success" },
    };
    const response = new Response(
      JSON.stringify({ success: true, result: [skipped] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    await expect(
      inventoryImmutablePages({
        config,
        environment: environment(),
        fetchFn: async () => response,
        persistOrigin: () => undefined,
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENT_NOT_UNIQUE");
  });

  it("classifies a fully healthy immutable deployment with a 404 branch alias as control-plane drift", async () => {
    const lines = [];
    const config = edgeReconciliationConfig(environment());
    await expect(
      inventoryImmutablePages({
        config,
        environment: environment(),
        persistOrigin: () => undefined,
        emitLine: (line) => lines.push(line),
        fetchFn: async (request, options) => {
          const url = new URL(request);
          if (url.hostname === "api.cloudflare.com")
            return new Response(
              JSON.stringify({ success: true, result: [deployment()] }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          expect(options.redirect).toBe("manual");
          expect(options.credentials).toBe("omit");
          if (url.hostname.startsWith("production-candidate."))
            return new Response(null, { status: 404 });
          return htmlResponse();
        },
      }),
    ).resolves.toMatchObject({
      origin: `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
    });
    expect(lines).toContain("PAGES_RC9_BRANCH_ALIAS_ROUTING=DRIFTED");
    expect(lines).toContain(
      "ROOT_CAUSE_PAGES=PAGES_BRANCH_ALIAS_CONTROL_PLANE_DRIFT",
    );
  });

  it("preflights only the exact candidate-owned Custom Domain and never deletes it", async () => {
    const requests = [];
    const config = edgeReconciliationConfig(environment());
    await preflightCandidateDomain({
      config,
      fetchFn: async (request, options) => {
        requests.push({ url: String(request), options });
        return new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                hostname: edgeFixtureHostname,
                service: edgeRouterService,
                zone_name: "labofscents.org",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].options.method).toBe("GET");
    expect(requests[0].options.redirect).toBe("manual");
    expect(requests[0].url).toContain("/workers/domains?hostname=");
  });

  it("refuses a Custom Domain attached to another service before deployment", async () => {
    const config = edgeReconciliationConfig(environment());
    await expect(
      preflightCandidateDomain({
        config,
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              success: true,
              result: [
                {
                  hostname: edgeFixtureHostname,
                  service: "not-the-candidate-router",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      }),
    ).rejects.toThrow("CUSTOM_DOMAIN_OWNED_BY_OTHER_SERVICE");
  });

  it("requires the post-deploy Custom Domain attachment to be exact", async () => {
    const config = edgeReconciliationConfig(environment());
    await expect(
      verifyCandidateDomain({
        config,
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              success: true,
              result: [
                {
                  hostname: edgeFixtureHostname,
                  service: edgeRouterService,
                  zone_name: "labofscents.org",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      }),
    ).resolves.toMatchObject({ service: edgeRouterService });
  });

  it("accepts only active RC9 tenant routes, ignores spoofed headers, and fails closed for an unknown host", async () => {
    const requests = [];
    await verifyTenantRoutes({
      fetchFn: async (request, options) => {
        const url = new URL(request);
        requests.push({ url, options });
        if (url.hostname.startsWith("missing-"))
          return new Response(null, { status: 404 });
        return htmlResponse({
          "x-olfactoryops-workspace-router": "active",
          "x-olfactoryops-release-environment": "production",
          "x-olfactoryops-release-sha": edgeReleaseSha,
        });
      },
    });
    expect(requests).toHaveLength(edgeBrowserPaths.length + 2);
    expect(
      requests.some(
        (request) =>
          request.options.headers["x-olfactoryops-organization-id"] ===
          "untrusted",
      ),
    ).toBe(true);
    expect(
      requests.every((request) => request.options.credentials === "omit"),
    ).toBe(true);
  });

  it("rejects an unknown hostname that leaks candidate Pages without Router identity", async () => {
    await expect(
      verifyTenantRoutes({
        fetchFn: async () =>
          htmlResponse({
            "x-olfactoryops-workspace-router": "active",
            "x-olfactoryops-release-environment": "production",
            "x-olfactoryops-release-sha": edgeReleaseSha,
          }),
      }),
    ).rejects.toThrow("UNKNOWN_HOST_DID_NOT_FAIL_CLOSED");
  });

  it("rejects spoofed tenant headers when the safe Router surface differs from the baseline", async () => {
    await expect(
      verifyTenantRoutes({
        fetchFn: async (request, options) => {
          if (options.headers["x-olfactoryops-organization-id"])
            return new Response(null, {
              status: 200,
              headers: {
                "x-olfactoryops-workspace-router": "active",
                "x-olfactoryops-release-environment": "production",
                "x-olfactoryops-release-sha": edgeReleaseSha,
              },
            });
          if (new URL(request).hostname.startsWith("missing-"))
            return new Response(null, { status: 404 });
          return htmlResponse({
            "x-olfactoryops-workspace-router": "active",
            "x-olfactoryops-release-environment": "production",
            "x-olfactoryops-release-sha": edgeReleaseSha,
          });
        },
      }),
    ).rejects.toThrow("CALLER_TENANT_HEADER_ACCEPTANCE_FAILURE");
  });

  it("captures candidate-only postflight state without mutating the Router after a failed verification", async () => {
    const requests = [];
    const lines = [];
    const result = await captureCandidateEdgePostflight({
      config: edgeReconciliationConfig(environment()),
      emitLine: (line) => lines.push(line),
      fetchFn: async (request, options) => {
        const url = new URL(request);
        requests.push({ url, options });
        if (url.hostname === "api.cloudflare.com")
          return new Response(
            JSON.stringify({
              success: true,
              result: [
                {
                  hostname: edgeFixtureHostname,
                  service: edgeRouterService,
                  zone_name: "labofscents.org",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        return new Response(null, { status: 404 });
      },
    });
    expect(result).toMatchObject({ attachment: "CANDIDATE_ROUTER" });
    expect(lines).toContain("CANDIDATE_EDGE_POSTFLIGHT=CAPTURED");
    expect(requests.every((request) => request.options.method === "GET")).toBe(
      true,
    );
  });

  it("fails closed when postflight state cannot be captured", async () => {
    await expect(
      captureCandidateEdgePostflight({
        config: edgeReconciliationConfig(environment()),
        fetchFn: async () => {
          throw new Error("control plane unavailable");
        },
      }),
    ).rejects.toThrow("CANDIDATE_EDGE_POSTFLIGHT_UNAVAILABLE");
  });

  it("renders only the exact candidate Router with the proven immutable Pages deployment", () => {
    const directory = mkdtempSync(join(tmpdir(), "candidate-edge-router-"));
    temporaryDirectories.push(directory);
    const template = join(directory, "template.toml");
    const output = join(directory, "candidate.toml");
    const worker = join(directory, "worker", "v2-tenant-router.ts");
    const workerDirectory = join(directory, "worker");
    writeFileSync(
      template,
      `name = "olfactoryops-v2-tenant-router-production"\nmain = "worker/v2-tenant-router.ts"\nroutes = [{ pattern = "*.labofscents.org/*", zone_name = "labofscents.org" }]\n[vars]\nPAGES_ORIGIN = "https://REPLACE_WITH_PRODUCTION_PAGES_ORIGIN"\nRELEASE_GIT_SHA = "REPLACE_WITH_VERIFIED_RELEASE_SHA"\nV2_WORKSPACE_BASE_DOMAIN = "labofscents.org"\n[[hyperdrive]]\nbinding = "HYPERDRIVE"\nid = "REPLACE_WITH_PRODUCTION_HYPERDRIVE_ID"\n`,
    );
    mkdirSync(workerDirectory, { recursive: true });
    writeFileSync(worker, "export {}\n");
    const result = renderCandidateEdgeRouterConfig({
      environment: {
        CANDIDATE_EDGE_RECONCILE_TEMPLATE: template,
        CANDIDATE_EDGE_RECONCILE_OUTPUT: output,
        CANDIDATE_EDGE_RECONCILE_RELEASE_SHA: edgeReleaseSha,
        CANDIDATE_EDGE_RECONCILE_FIXTURE_HOSTNAME: edgeFixtureHostname,
        CANDIDATE_EDGE_RECONCILE_HYPERDRIVE_ID: edgeHyperdriveId,
        CANDIDATE_PAGES_ORIGIN: `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
      },
    });
    const config = readFileSync(output, "utf8");
    expect(result.pagesOrigin).toBe(
      `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
    );
    expect(config).toContain(`pattern = "${edgeFixtureHostname}"`);
    expect(config).toContain("custom_domain = true");
    expect(config).toContain(
      `V2_WORKSPACE_BASE_DOMAIN = "${edgeWorkspaceBaseDomain}"`,
    );
    expect(config).toContain(`id = "${edgeHyperdriveId}"`);
    expect(config).not.toContain("*.labofscents.org/*");
  });

  it("rejects the broken branch alias as a Router Pages origin", () => {
    const directory = mkdtempSync(join(tmpdir(), "candidate-edge-router-"));
    temporaryDirectories.push(directory);
    const template = join(directory, "template.toml");
    const output = join(directory, "candidate.toml");
    writeFileSync(template, "");
    expect(() =>
      renderCandidateEdgeRouterConfig({
        environment: {
          CANDIDATE_EDGE_RECONCILE_TEMPLATE: template,
          CANDIDATE_EDGE_RECONCILE_OUTPUT: output,
          CANDIDATE_EDGE_RECONCILE_RELEASE_SHA: edgeReleaseSha,
          CANDIDATE_EDGE_RECONCILE_FIXTURE_HOSTNAME: edgeFixtureHostname,
          CANDIDATE_EDGE_RECONCILE_HYPERDRIVE_ID: edgeHyperdriveId,
          CANDIDATE_PAGES_ORIGIN: `https://production-candidate.${edgePagesProject}.pages.dev`,
        },
      }),
    ).toThrow("immutable isolated deployment");
  });

  it("rejects any non-approved Hyperdrive binding during Router rendering", () => {
    const directory = mkdtempSync(join(tmpdir(), "candidate-edge-router-"));
    temporaryDirectories.push(directory);
    const template = join(directory, "template.toml");
    const output = join(directory, "candidate.toml");
    writeFileSync(template, "");
    expect(() =>
      renderCandidateEdgeRouterConfig({
        environment: {
          CANDIDATE_EDGE_RECONCILE_TEMPLATE: template,
          CANDIDATE_EDGE_RECONCILE_OUTPUT: output,
          CANDIDATE_EDGE_RECONCILE_RELEASE_SHA: edgeReleaseSha,
          CANDIDATE_EDGE_RECONCILE_FIXTURE_HOSTNAME: edgeFixtureHostname,
          CANDIDATE_EDGE_RECONCILE_HYPERDRIVE_ID: "b".repeat(32),
          CANDIDATE_PAGES_ORIGIN: `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
        },
      }),
    ).toThrow("approved production binding");
  });
});
