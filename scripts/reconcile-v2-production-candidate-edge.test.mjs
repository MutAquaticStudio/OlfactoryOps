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
  captureCandidateEdgePostflight,
  edgeBrowserPaths,
  edgeFixtureHostname,
  edgeHyperdriveId,
  edgeKnownImmutablePagesOrigin,
  edgePagesProject,
  edgeReconciliationConfig,
  edgeReleaseSha,
  edgeRouterService,
  expectedCandidatePagesEnvironment,
  inspectPagesRequestLadder,
  inventoryImmutablePages,
  preflightCandidateDomain,
  reconcilePagesInventory,
  runWranglerPagesInventory,
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

function deployment({
  id = "11111111-1111-1111-1111-111111111111",
  projectName = edgePagesProject,
  environmentName = "production",
  branch = "production-candidate",
  commitHash = edgeReleaseSha,
  url = edgeKnownImmutablePagesOrigin,
  stage = "success",
  skipped = false,
} = {}) {
  return {
    id,
    project_name: projectName,
    created_on: "2026-08-14T03:00:00.000Z",
    environment: environmentName,
    is_skipped: skipped,
    latest_stage: { status: stage },
    url,
    deployment_trigger: { metadata: { branch, commit_hash: commitHash } },
  };
}

function cloudflareResponse({
  status = 200,
  success = true,
  result = {},
  resultInfo,
  errors,
} = {}) {
  const body = { success, result };
  if (resultInfo !== undefined) body.result_info = resultInfo;
  if (errors !== undefined) body.errors = errors;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function htmlResponse(headers = {}) {
  return new Response(null, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function releaseManifestResponse({
  fullGitSha = edgeReleaseSha,
  artifact = "pages",
  status = 200,
} = {}) {
  return new Response(JSON.stringify({ fullGitSha, artifact }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pagesInventoryFetch({
  pages = [[deployment()]],
  releaseManifest = true,
  html = true,
  aliasStatus = 404,
  requests = [],
}) {
  const allDeployments = pages.flat();
  return async (request, options) => {
    const url = new URL(request);
    requests.push({ url, options });
    if (url.hostname === "api.cloudflare.com") {
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("manual");
      expect(options.credentials).toBe("omit");
      expect(options.headers.authorization).toBe("Bearer not-a-real-token");
      const detailId = url.pathname.match(/\/deployments\/([^/]+)$/)?.[1];
      if (detailId) {
        const item = allDeployments.find(
          (candidate) => candidate.id === detailId,
        );
        return cloudflareResponse({
          success: Boolean(item),
          result: item ?? null,
        });
      }
      expect(url.pathname).toContain("/deployments");
      expect(url.searchParams.has("env")).toBe(false);
      expect(url.searchParams.get("page")).toMatch(/^[1-9]\d*$/);
      expect(url.searchParams.get("per_page")).toBe("20");
      const page = Number(url.searchParams.get("page"));
      const result = pages[page - 1] ?? [];
      return cloudflareResponse({
        result,
        resultInfo: {
          page,
          per_page: 20,
          total_pages: pages.length,
          count: result.length,
          total_count: allDeployments.length,
        },
      });
    }
    expect(options.redirect).toBe("manual");
    expect(options.credentials).toBe("omit");
    if (url.pathname === "/release.json")
      return releaseManifest
        ? releaseManifestResponse()
        : new Response(null, { status: 404 });
    if (url.hostname.startsWith("production-candidate."))
      return new Response(null, { status: aliasStatus });
    return html ? htmlResponse() : new Response(null, { status: 404 });
  };
}

async function inventory({
  pages,
  releaseManifest,
  html,
  expectedEnvironment = "production",
  knownImmutableOrigin = edgeKnownImmutablePagesOrigin,
  aliasStatus,
  emitLine = () => undefined,
  persistOrigin = () => undefined,
  requests,
} = {}) {
  return inventoryImmutablePages({
    config: edgeReconciliationConfig(environment()),
    environment: environment(),
    fetchFn: pagesInventoryFetch({
      pages,
      releaseManifest,
      html,
      aliasStatus,
      requests,
    }),
    emitLine,
    persistOrigin,
    expectedEnvironment,
    knownImmutableOrigin,
  });
}

function reconciliationFetch({
  productionBranch = "production-candidate",
  bare = [deployment()],
  preview = [],
  production = [deployment()],
  previewStatus = 200,
  productionStatus = 200,
  requests = [],
}) {
  const known = bare.find(
    (candidate) => candidate.url === edgeKnownImmutablePagesOrigin,
  );
  return async (request, options) => {
    const url = new URL(request);
    requests.push({ url, options });
    if (url.hostname === "api.cloudflare.com") {
      const detailId = url.pathname.match(/\/deployments\/([^/]+)$/)?.[1];
      if (detailId)
        return cloudflareResponse({
          success: Boolean(known && detailId === known.id),
          result: known ?? null,
        });
      if (url.pathname.endsWith("/deployments")) {
        const requestedEnvironment = url.searchParams.get("env");
        const result =
          requestedEnvironment === "preview"
            ? preview
            : requestedEnvironment === "production"
              ? production
              : bare;
        const status =
          requestedEnvironment === "preview"
            ? previewStatus
            : requestedEnvironment === "production"
              ? productionStatus
              : 200;
        return cloudflareResponse({
          status,
          success: status === 200,
          result: status === 200 ? result : null,
          resultInfo: {
            page: Number(url.searchParams.get("page") ?? "1"),
            per_page: 20,
            total_pages: 1,
            count: result.length,
            total_count: result.length,
          },
        });
      }
      return cloudflareResponse({
        result: {
          name: edgePagesProject,
          production_branch: productionBranch,
        },
      });
    }
    if (url.pathname === "/release.json") return releaseManifestResponse();
    if (url.hostname.startsWith("production-candidate."))
      return new Response(null, { status: 404 });
    return htmlResponse();
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("RC9 candidate Pages environment classification", () => {
  it("pins the exact immutable candidate inputs", () => {
    const config = edgeReconciliationConfig(environment());
    expect(config.releaseSha).toBe(edgeReleaseSha);
    expect(config.pagesProject).toBe(edgePagesProject);
    expect(config.hyperdriveId).toBe(edgeHyperdriveId);
    expect(edgeBrowserPaths).toEqual([
      "/",
      "/login",
      "/signup",
      "/v2/login",
      "/v2/signup",
    ]);
    expect(() =>
      edgeReconciliationConfig(
        environment({ CANDIDATE_EDGE_RECONCILE_RELEASE_SHA: "f".repeat(40) }),
      ),
    ).toThrow("INVALID_IMMUTABLE_INPUT");
  });

  it("derives production only when the isolated candidate branch is the project production branch", () => {
    expect(expectedCandidatePagesEnvironment("production-candidate")).toBe(
      "production",
    );
    expect(expectedCandidatePagesEnvironment("main")).toBe("preview");
    expect(() => expectedCandidatePagesEnvironment("")).toThrow(
      "PAGES_PROJECT_PRODUCTION_BRANCH_INVALID",
    );
  });

  it("accepts the known RC9 immutable deployment in the project production environment", async () => {
    const lines = [];
    const persisted = [];
    const result = await inventory({
      pages: [[deployment({ environmentName: "production" })]],
      emitLine: (line) => lines.push(line),
      persistOrigin: (origin) => persisted.push(origin),
    });
    expect(result.origin).toBe(edgeKnownImmutablePagesOrigin);
    expect(persisted).toEqual([edgeKnownImmutablePagesOrigin]);
    for (const line of [
      "PAGES_KNOWN_IMMUTABLE_DEPLOYMENT_FOUND=PASS",
      "PAGES_KNOWN_DEPLOYMENT_PROJECT=PASS",
      "PAGES_KNOWN_DEPLOYMENT_BRANCH=PASS",
      "PAGES_KNOWN_DEPLOYMENT_SHA=PASS",
      "PAGES_KNOWN_DEPLOYMENT_ENVIRONMENT=PASS",
      "PAGES_KNOWN_DEPLOYMENT_STAGE=PASS",
      "PAGES_KNOWN_DEPLOYMENT_RELEASE_JSON=PASS",
      "PAGES_KNOWN_DEPLOYMENT_FIVE_ROUTES=PASS",
      "PAGES_RC9_SELECTED_IMMUTABLE_DEPLOYMENT=PASS",
      "PAGES_REDEPLOY_REQUIRED=NO",
    ])
      expect(lines).toContain(line);
    expect(lines.join("\n")).not.toContain("not-a-real-token");
    expect(lines.join("\n")).not.toContain(deployment().id);
  });

  it("accepts a preview deployment only when the project production branch differs", async () => {
    await expect(
      inventory({
        pages: [[deployment({ environmentName: "preview" })]],
        expectedEnvironment: "preview",
      }),
    ).resolves.toMatchObject({ origin: edgeKnownImmutablePagesOrigin });
  });

  it("keeps a non-authoritative branch alias result out of immutable selection", async () => {
    const lines = [];
    const persisted = [];
    await expect(
      inventory({
        aliasStatus: 503,
        emitLine: (line) => lines.push(line),
        persistOrigin: (origin) => persisted.push(origin),
      }),
    ).resolves.toMatchObject({ origin: edgeKnownImmutablePagesOrigin });
    expect(persisted).toEqual([edgeKnownImmutablePagesOrigin]);
    expect(lines).toContain("PAGES_RC9_BRANCH_ALIAS_ROUTING=UNPROVEN");
  });

  it.each([
    ["unexpected environment", { environmentName: "preview" }],
    ["wrong branch", { branch: "other-branch" }],
    ["wrong SHA", { commitHash: "f".repeat(40) }],
    ["wrong deployment project", { projectName: "another-project" }],
  ])("rejects a %s before an origin can persist", async (_name, overrides) => {
    const persisted = [];
    await expect(
      inventory({
        pages: [[deployment(overrides)]],
        persistOrigin: (origin) => persisted.push(origin),
      }),
    ).rejects.toThrow("PAGES_RC9_MATCHES_MISSING");
    expect(persisted).toEqual([]);
  });

  it("fails closed when the known immutable deployment cannot be found", async () => {
    const lines = [];
    await expect(
      inventory({
        pages: [
          [
            deployment({
              url: "https://1cb6e1c5.olfactoryops-v2-production-candidate.pages.dev",
            }),
          ],
        ],
        emitLine: (line) => lines.push(line),
      }),
    ).rejects.toThrow("PAGES_KNOWN_IMMUTABLE_DEPLOYMENT_MISSING");
    expect(lines).toContain("PAGES_KNOWN_IMMUTABLE_DEPLOYMENT_FOUND=FAIL");
    expect(lines).toContain("PAGES_REDEPLOY_REQUIRED=NO");
  });

  it("rejects a mismatched detail record", async () => {
    const item = deployment();
    await expect(
      inventoryImmutablePages({
        config: edgeReconciliationConfig(environment()),
        environment: environment(),
        expectedEnvironment: "production",
        knownImmutableOrigin: edgeKnownImmutablePagesOrigin,
        persistOrigin: () => undefined,
        fetchFn: async (request, _options) => {
          const url = new URL(request);
          if (url.hostname === "api.cloudflare.com") {
            if (url.pathname.endsWith("/deployments"))
              return cloudflareResponse({
                result: [item],
                resultInfo: { page: 1, per_page: 20, total_pages: 1 },
              });
            return cloudflareResponse({
              result: deployment({
                id: "22222222-2222-2222-2222-222222222222",
              }),
            });
          }
          return htmlResponse();
        },
      }),
    ).rejects.toThrow("PAGES_KNOWN_IMMUTABLE_DEPLOYMENT_DETAIL_INVALID");
  });

  it.each([
    ["release manifest", { releaseManifest: false, html: true }],
    ["five-route surface", { releaseManifest: true, html: false }],
  ])(
    "rejects a missing %s without a Pages redeploy request",
    async (_name, options) => {
      const lines = [];
      await expect(
        inventory({ ...options, emitLine: (line) => lines.push(line) }),
      ).rejects.toThrow("PAGES_KNOWN_IMMUTABLE_DEPLOYMENT_UNHEALTHY");
      expect(lines).toContain("PAGES_REDEPLOY_REQUIRED=NO");
    },
  );

  it("uses bare page-20 inventory as the complete selection source when preview is empty", async () => {
    const lines = [];
    const persisted = [];
    const requests = [];
    await reconcilePagesInventory({
      config: edgeReconciliationConfig(environment()),
      environment: environment(),
      emitLine: (line) => lines.push(line),
      persistOrigin: (origin) => persisted.push(origin),
      runWrangler: async ({ expectedEnvironment }) => {
        expect(expectedEnvironment).toBe("production");
        return { available: false, failureClass: "AUTHORIZATION" };
      },
      fetchFn: reconciliationFetch({ preview: [], requests }),
    });
    expect(persisted).toEqual([edgeKnownImmutablePagesOrigin]);
    expect(lines).toContain(
      "PAGES_PROJECT_PRODUCTION_BRANCH=production-candidate",
    );
    expect(lines).toContain("CANDIDATE_PAGES_PROJECT_PRODUCTION_BRANCH=PASS");
    expect(lines).toContain("EXPECTED_CANDIDATE_PAGES_ENVIRONMENT=production");
    expect(lines).toContain("PAGES_DEPLOYMENT_COUNT_PREVIEW=0");
    expect(lines).toContain("PAGES_DEPLOYMENT_COUNT_PRODUCTION=1");
    const listRequests = requests.filter(
      (request) =>
        request.url.hostname === "api.cloudflare.com" &&
        request.url.pathname.endsWith("/deployments"),
    );
    expect(
      listRequests.some((request) => !request.url.searchParams.has("env")),
    ).toBe(true);
    expect(
      listRequests.every(
        (request) => request.url.searchParams.get("per_page") === "20",
      ),
    ).toBe(true);
    expect(
      listRequests.some(
        (request) => request.url.searchParams.get("per_page") === "100",
      ),
    ).toBe(false);
  });

  it("derives preview selection from a non-candidate project production branch", async () => {
    const lines = [];
    const persisted = [];
    await reconcilePagesInventory({
      config: edgeReconciliationConfig(environment()),
      environment: environment(),
      emitLine: (line) => lines.push(line),
      persistOrigin: (origin) => persisted.push(origin),
      runWrangler: async ({ expectedEnvironment }) => {
        expect(expectedEnvironment).toBe("preview");
        return { available: true, candidates: [] };
      },
      fetchFn: reconciliationFetch({
        productionBranch: "main",
        bare: [deployment({ environmentName: "preview" })],
        preview: [deployment({ environmentName: "preview" })],
        production: [],
      }),
    });
    expect(persisted).toEqual([edgeKnownImmutablePagesOrigin]);
    expect(lines).toContain("PAGES_PROJECT_PRODUCTION_BRANCH=main");
    expect(lines).toContain(
      "CANDIDATE_PAGES_PROJECT_PRODUCTION_BRANCH=NOT_PRODUCTION_BRANCH",
    );
    expect(lines).toContain("EXPECTED_CANDIDATE_PAGES_ENVIRONMENT=preview");
    expect(lines).toContain("PAGES_KNOWN_DEPLOYMENT_ENVIRONMENT=PASS");
  });

  it("keeps filtered environment failures as telemetry when bare inventory selects the known origin", async () => {
    const lines = [];
    const persisted = [];
    await reconcilePagesInventory({
      config: edgeReconciliationConfig(environment()),
      environment: environment(),
      emitLine: (line) => lines.push(line),
      persistOrigin: (origin) => persisted.push(origin),
      runWrangler: async () => ({ available: false, failureClass: "OTHER" }),
      fetchFn: reconciliationFetch({
        previewStatus: 500,
        productionStatus: 403,
      }),
    });
    expect(persisted).toEqual([edgeKnownImmutablePagesOrigin]);
    expect(lines).toContain("PAGES_DEPLOYMENTS_PREVIEW_HTTP_STATUS=500");
    expect(lines).toContain("PAGES_DEPLOYMENTS_PRODUCTION_HTTP_STATUS=403");
    expect(lines).toContain("PAGES_FILTERED_ENVIRONMENT_INVENTORY=PARTIAL");
    expect(lines).toContain("PAGES_RC9_SELECTED_IMMUTABLE_DEPLOYMENT=PASS");
  });

  it("paginates the bare page-20 inventory before selecting the known immutable deployment", async () => {
    const known = deployment();
    const firstPage = Array.from({ length: 20 }, (_, index) =>
      deployment({
        id: `other-${index}`,
        branch: "other-branch",
        url: `https://${String(index).padStart(8, "0")}.${edgePagesProject}.pages.dev`,
      }),
    );
    const requests = [];
    await expect(
      inventory({ pages: [firstPage, [known]], requests }),
    ).resolves.toMatchObject({ origin: edgeKnownImmutablePagesOrigin });
    expect(
      requests.some(
        ({ url }) =>
          url.hostname === "api.cloudflare.com" &&
          url.pathname.endsWith("/deployments") &&
          url.searchParams.get("page") === "2" &&
          url.searchParams.get("per_page") === "20",
      ),
    ).toBe(true);
  });

  it("rejects a wrong Pages project before inventory or Router work", async () => {
    const requests = [];
    const result = await inspectPagesRequestLadder({
      config: edgeReconciliationConfig(environment()),
      fetchFn: async (request) => {
        requests.push(new URL(request));
        return cloudflareResponse({
          result: {
            name: "another-project",
            production_branch: "production-candidate",
          },
        });
      },
      emitLine: () => undefined,
    });
    expect(result.stop).toBe(true);
    expect(result.rootCause).toBe("CLOUDFLARE_PAGES_PROJECT_RESOURCE_MISMATCH");
    expect(requests).toHaveLength(1);
  });

  it("fails closed for an invalid project production branch before deployment inventory", async () => {
    const requests = [];
    const result = await inspectPagesRequestLadder({
      config: edgeReconciliationConfig(environment()),
      fetchFn: async (request) => {
        requests.push(new URL(request));
        return cloudflareResponse({
          result: { name: edgePagesProject, production_branch: "" },
        });
      },
      emitLine: () => undefined,
    });
    expect(result.stop).toBe(true);
    expect(result.rootCause).toBe("PAGES_PROJECT_CONFIGURATION_INVALID");
    expect(requests).toHaveLength(1);
  });

  it("lists both Pages environments through pinned Wrangler without exposing records", async () => {
    const lines = [];
    const commands = [];
    const result = await runWranglerPagesInventory({
      config: edgeReconciliationConfig(environment()),
      expectedEnvironment: "production",
      emitLine: (line) => lines.push(line),
      runCommand: async ({ args }) => {
        commands.push(args);
        if (args[1] === "project")
          return { ok: true, value: [{ "Project Name": edgePagesProject }] };
        return {
          ok: true,
          value:
            args[args.indexOf("--environment") + 1] === "production"
              ? [
                  {
                    Id: "11111111-1111-1111-1111-111111111111",
                    Environment: "Production",
                    Branch: "production-candidate",
                    Source: edgeReleaseSha.slice(0, 7),
                  },
                ]
              : [],
        };
      },
    });
    expect(result.available).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(commands).toHaveLength(3);
    expect(commands.flat()).toContain("preview");
    expect(commands.flat()).toContain("production");
    expect(lines).toContain("WRANGLER_PREVIEW_COUNT=0");
    expect(lines).toContain("WRANGLER_PRODUCTION_COUNT=1");
    expect(lines.join("\n")).not.toContain("not-a-real-token");
  });

  it("rejects duplicate deployment IDs during bare pagination", async () => {
    const item = deployment();
    const firstPage = Array.from({ length: 20 }, (_, index) =>
      index === 0
        ? item
        : deployment({
            id: `other-${index}`,
            branch: "other-branch",
            url: `https://${String(index).padStart(8, "0")}.${edgePagesProject}.pages.dev`,
          }),
    );
    await expect(
      inventory({
        pages: [firstPage, [item]],
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENTS_API_FAILURE");
  });
});

describe("RC9 candidate Router reconciliation boundaries", () => {
  it("keeps Pages selection ahead of every candidate Router mutation", () => {
    const workflow = readFileSync(
      ".github/workflows/v2-production-candidate-edge-reconciliation.yml",
      "utf8",
    );
    expect(workflow.indexOf("pages-inventory")).toBeGreaterThan(
      workflow.indexOf("npm ci --ignore-scripts"),
    );
    expect(workflow.indexOf("domain-preflight")).toBeGreaterThan(
      workflow.indexOf("pages-inventory"),
    );
    expect(
      workflow.indexOf("./node_modules/.bin/wrangler deploy"),
    ).toBeGreaterThan(workflow.indexOf("domain-preflight"));
    expect(workflow).not.toContain("wrangler pages deploy");
    expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
  });

  it("preflights only the exact candidate-owned Custom Domain with GET", async () => {
    const requests = [];
    await preflightCandidateDomain({
      config: edgeReconciliationConfig(environment()),
      fetchFn: async (request, options) => {
        requests.push({ request: String(request), options });
        return cloudflareResponse({
          result: [
            {
              hostname: edgeFixtureHostname,
              service: edgeRouterService,
              zone_name: "labofscents.org",
            },
          ],
        });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].options.method).toBe("GET");
    expect(requests[0].request).toContain("/workers/domains?hostname=");
  });

  it("rejects a Custom Domain attached to another service", async () => {
    await expect(
      preflightCandidateDomain({
        config: edgeReconciliationConfig(environment()),
        fetchFn: async () =>
          cloudflareResponse({
            result: [
              {
                hostname: edgeFixtureHostname,
                service: "not-the-candidate-router",
              },
            ],
          }),
      }),
    ).rejects.toThrow("CUSTOM_DOMAIN_OWNED_BY_OTHER_SERVICE");
  });

  it("verifies active tenant routes, spoof resistance, and unknown-host failure", async () => {
    await expect(
      verifyTenantRoutes({
        fetchFn: async (request) => {
          if (new URL(request).hostname.startsWith("missing-"))
            return new Response(null, { status: 404 });
          return htmlResponse({
            "x-olfactoryops-workspace-router": "active",
            "x-olfactoryops-release-environment": "production",
            "x-olfactoryops-release-sha": edgeReleaseSha,
          });
        },
      }),
    ).resolves.toMatchObject({ unknown: { status: "404" } });
  });

  it("rejects an unknown hostname that leaks a successful candidate surface", async () => {
    await expect(
      verifyTenantRoutes({
        fetchFn: async (request) => {
          if (new URL(request).hostname.startsWith("missing-"))
            return htmlResponse();
          return htmlResponse({
            "x-olfactoryops-workspace-router": "active",
            "x-olfactoryops-release-environment": "production",
            "x-olfactoryops-release-sha": edgeReleaseSha,
          });
        },
      }),
    ).rejects.toThrow("UNKNOWN_HOST_DID_NOT_FAIL_CLOSED");
  });

  it("rejects a spoofed tenant header that changes the trusted Router surface", async () => {
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

  it("captures candidate-only postflight state read-only", async () => {
    const requests = [];
    await captureCandidateEdgePostflight({
      config: edgeReconciliationConfig(environment()),
      fetchFn: async (request, options) => {
        requests.push(options);
        if (new URL(request).hostname === "api.cloudflare.com")
          return cloudflareResponse({
            result: [
              {
                hostname: edgeFixtureHostname,
                service: edgeRouterService,
                zone_name: "labofscents.org",
              },
            ],
          });
        return new Response(null, { status: 404 });
      },
    });
    expect(requests.every((options) => options.method === "GET")).toBe(true);
  });

  it("fails closed when candidate-only postflight inventory is unavailable", async () => {
    await expect(
      captureCandidateEdgePostflight({
        config: edgeReconciliationConfig(environment()),
        fetchFn: async () => {
          throw new Error("unavailable");
        },
      }),
    ).rejects.toThrow("CANDIDATE_EDGE_POSTFLIGHT_UNAVAILABLE");
  });

  it("renders only the exact candidate Router with an immutable Pages deployment", () => {
    const directory = mkdtempSync(join(tmpdir(), "candidate-edge-router-"));
    temporaryDirectories.push(directory);
    const template = join(directory, "template.toml");
    const output = join(directory, "candidate.toml");
    const workerDirectory = join(directory, "worker");
    mkdirSync(workerDirectory, { recursive: true });
    writeFileSync(join(workerDirectory, "v2-tenant-router.ts"), "export {}\n");
    writeFileSync(
      template,
      'name = "olfactoryops-v2-tenant-router-production"\nmain = "worker/v2-tenant-router.ts"\nroutes = [{ pattern = "*.labofscents.org/*", zone_name = "labofscents.org" }]\n[vars]\nPAGES_ORIGIN = "https://REPLACE_WITH_PRODUCTION_PAGES_ORIGIN"\nRELEASE_GIT_SHA = "REPLACE_WITH_VERIFIED_RELEASE_SHA"\nV2_WORKSPACE_BASE_DOMAIN = "labofscents.org"\n[[hyperdrive]]\nbinding = "HYPERDRIVE"\nid = "REPLACE_WITH_PRODUCTION_HYPERDRIVE_ID"\n',
    );
    const result = renderCandidateEdgeRouterConfig({
      environment: {
        CANDIDATE_EDGE_RECONCILE_TEMPLATE: template,
        CANDIDATE_EDGE_RECONCILE_OUTPUT: output,
        CANDIDATE_EDGE_RECONCILE_RELEASE_SHA: edgeReleaseSha,
        CANDIDATE_EDGE_RECONCILE_FIXTURE_HOSTNAME: edgeFixtureHostname,
        CANDIDATE_EDGE_RECONCILE_HYPERDRIVE_ID: edgeHyperdriveId,
        CANDIDATE_PAGES_ORIGIN: edgeKnownImmutablePagesOrigin,
      },
    });
    expect(result.pagesOrigin).toBe(edgeKnownImmutablePagesOrigin);
    expect(readFileSync(output, "utf8")).toContain("custom_domain = true");
    expect(() =>
      renderCandidateEdgeRouterConfig({
        environment: {
          CANDIDATE_EDGE_RECONCILE_TEMPLATE: template,
          CANDIDATE_EDGE_RECONCILE_OUTPUT: output,
          CANDIDATE_EDGE_RECONCILE_RELEASE_SHA: edgeReleaseSha,
          CANDIDATE_EDGE_RECONCILE_FIXTURE_HOSTNAME: edgeFixtureHostname,
          CANDIDATE_EDGE_RECONCILE_HYPERDRIVE_ID: edgeHyperdriveId,
          CANDIDATE_PAGES_ORIGIN:
            "https://production-candidate.olfactoryops-v2-production-candidate.pages.dev",
        },
      }),
    ).toThrow("immutable isolated deployment");
  });

  it("rejects a non-approved Hyperdrive binding during Router rendering", () => {
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
          CANDIDATE_PAGES_ORIGIN: edgeKnownImmutablePagesOrigin,
        },
      }),
    ).toThrow("approved production binding");
  });

  it("requires the post-deploy Custom Domain attachment to stay exact", async () => {
    await expect(
      verifyCandidateDomain({
        config: edgeReconciliationConfig(environment()),
        fetchFn: async () =>
          cloudflareResponse({
            result: [
              {
                hostname: edgeFixtureHostname,
                service: edgeRouterService,
                zone_name: "labofscents.org",
              },
            ],
          }),
      }),
    ).resolves.toMatchObject({ service: edgeRouterService });
  });
});
