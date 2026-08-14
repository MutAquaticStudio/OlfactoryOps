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
  edgePagesProject,
  edgeReconciliationConfig,
  edgeReleaseSha,
  edgeRouterService,
  edgeWorkspaceBaseDomain,
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

function deployment({
  id = "11111111-1111-1111-1111-111111111111",
  createdOn = "2026-08-14T03:00:00.000Z",
  label = "1cb6e1c5",
  url = `https://${label}.${edgePagesProject}.pages.dev`,
  overrides = {},
} = {}) {
  return {
    id,
    created_on: createdOn,
    environment: "preview",
    is_skipped: false,
    latest_stage: { status: "success" },
    url,
    deployment_trigger: {
      metadata: { branch: "production-candidate", commit_hash: edgeReleaseSha },
    },
    ...overrides,
  };
}

function nonMatchingDeployments(count, prefix) {
  return Array.from({ length: count }, (_, index) =>
    deployment({
      id: `nonmatching-${prefix}-${index}`,
      overrides: {
        deployment_trigger: {
          metadata: { branch: "unrelated", commit_hash: edgeReleaseSha },
        },
      },
    }),
  );
}

function pagesResultInfo(page, totalPages) {
  return {
    page,
    per_page: 100,
    total_pages: totalPages,
    count: 0,
    total_count: totalPages * 100,
  };
}

function pagesResponse({
  status = 200,
  success = true,
  result = [],
  resultInfo,
  contentType = "application/json",
} = {}) {
  const body = { success, result };
  if (resultInfo !== undefined) body.result_info = resultInfo;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

function htmlResponse(headers = {}) {
  return new Response(null, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function inventoryFetch({
  pages,
  pageResponses = [],
  healthyLabels = [],
  aliasStatus = 200,
  requests = [],
}) {
  const healthy = new Set(healthyLabels);
  return async (request, options) => {
    const url = new URL(request);
    requests.push({ url, options });
    if (url.hostname === "api.cloudflare.com") {
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("manual");
      expect(options.credentials).toBe("omit");
      expect(options.headers.authorization).toBe("Bearer not-a-real-token");
      const page = Number(url.searchParams.get("page"));
      expect(url.searchParams.get("env")).toBe("preview");
      expect(url.searchParams.get("per_page")).toBe("100");
      const response = pageResponses[page - 1];
      if (typeof response === "function") return response();
      if (response instanceof Response) return response;
      if (response !== undefined) return pagesResponse(response);
      const result = pages[page - 1] ?? [];
      return pagesResponse({
        result,
        resultInfo: {
          ...pagesResultInfo(page, pages.length),
          count: result.length,
        },
      });
    }
    expect(options.redirect).toBe("manual");
    expect(options.credentials).toBe("omit");
    expect(options.headers["cache-control"]).toBe("no-cache");
    expect(options.headers.pragma).toBe("no-cache");
    if (url.hostname.startsWith("production-candidate."))
      return aliasStatus === 200
        ? htmlResponse()
        : new Response(null, { status: aliasStatus });
    return healthy.has(url.hostname.split(".")[0])
      ? htmlResponse()
      : new Response(null, { status: 404 });
  };
}

async function inventory({
  pages,
  pageResponses,
  healthyLabels,
  aliasStatus,
  emitLine = () => undefined,
  persistOrigin,
  requests,
} = {}) {
  return inventoryImmutablePages({
    config: edgeReconciliationConfig(environment()),
    environment: environment(),
    fetchFn: inventoryFetch({
      pages,
      pageResponses,
      healthyLabels,
      aliasStatus,
      requests,
    }),
    emitLine,
    persistOrigin,
  });
}

function apiPageNumbers(requests) {
  return requests
    .filter((request) => request.url.hostname === "api.cloudflare.com")
    .map((request) => request.url.searchParams.get("page"));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("RC9 candidate Pages inventory selection", () => {
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

  it("selects the one healthy exact-RC9 immutable Pages deployment", async () => {
    const lines = [];
    const persisted = [];
    const result = await inventory({
      pages: [[deployment()]],
      healthyLabels: ["1cb6e1c5"],
      emitLine: (line) => lines.push(line),
      persistOrigin: (origin) => persisted.push(origin),
    });
    expect(result.origin).toBe(
      `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
    );
    expect(persisted).toEqual([result.origin]);
    expect(lines).toContain("PAGES_DEPLOYMENTS_API=PASS");
    expect(lines).toContain("PAGES_RC9_MATCH_COUNT=1");
    expect(lines).toContain("PAGES_RC9_SELECTED_IMMUTABLE_DEPLOYMENT=PASS");
    expect(lines).toContain("PAGES_RC9_MULTIPLE_HEALTHY_DEPLOYMENTS=NO");
    expect(lines).toContain("PAGES_REDEPLOY_REQUIRED=NO");
    expect(lines.join("\n")).not.toContain(result.origin);
    expect(lines.join("\n")).not.toContain("not-a-real-token");
    expect(lines.join("\n")).not.toContain("a".repeat(32));
    expect(lines.join("\n")).not.toContain(deployment().id);
  });

  it("reports zero matching deployments and prevents Router progress", async () => {
    const lines = [];
    const persisted = [];
    const requests = [];
    await expect(
      inventory({
        pages: [[]],
        emitLine: (line) => lines.push(line),
        persistOrigin: (origin) => persisted.push(origin),
        requests,
      }),
    ).rejects.toThrow("PAGES_RC9_MATCHES_MISSING");
    expect(lines).toContain("PAGES_RC9_MATCH_COUNT=0");
    expect(lines).toContain(
      "PAGES_RC9_IMMUTABLE_DEPLOYMENT=MISSING_OR_UNHEALTHY",
    );
    expect(lines).toContain("PAGES_REDEPLOY_REQUIRED=YES");
    expect(persisted).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("selects the newest healthy deployment deterministically and records multiple healthy candidates", async () => {
    const newer = deployment({
      id: "22222222-2222-2222-2222-222222222222",
      createdOn: "2026-08-14T04:00:00.000Z",
      label: "2cb6e1c5",
    });
    const older = deployment({
      id: "11111111-1111-1111-1111-111111111111",
      createdOn: "2026-08-14T03:00:00.000Z",
      label: "1cb6e1c5",
    });
    const lines = [];
    const requests = [];
    const result = await inventory({
      pages: [[older, newer]],
      healthyLabels: ["1cb6e1c5", "2cb6e1c5"],
      emitLine: (line) => lines.push(line),
      persistOrigin: () => undefined,
      requests,
    });
    expect(result.origin).toBe(
      `https://2cb6e1c5.${edgePagesProject}.pages.dev`,
    );
    expect(lines).toContain("PAGES_RC9_MATCH_COUNT=2");
    expect(lines).toContain("PAGES_RC9_CANDIDATE_INDEX=1");
    expect(lines).toContain("PAGES_RC9_CANDIDATE_INDEX=2");
    expect(lines).toContain("PAGES_RC9_MULTIPLE_HEALTHY_DEPLOYMENTS=YES");
    expect(
      requests.filter(
        (request) =>
          request.url.hostname === `1cb6e1c5.${edgePagesProject}.pages.dev` ||
          request.url.hostname === `2cb6e1c5.${edgePagesProject}.pages.dev`,
      ),
    ).toHaveLength(edgeBrowserPaths.length * 2);
  });

  it("selects an older healthy deployment when the newest exact-RC9 deployment is unhealthy", async () => {
    const newer = deployment({
      id: "22222222-2222-2222-2222-222222222222",
      createdOn: "2026-08-14T04:00:00.000Z",
      label: "2cb6e1c5",
    });
    const older = deployment({ label: "1cb6e1c5" });
    const result = await inventory({
      pages: [[newer, older]],
      healthyLabels: ["1cb6e1c5"],
      persistOrigin: () => undefined,
    });
    expect(result.origin).toBe(
      `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
    );
    expect(result.healthy).toHaveLength(1);
  });

  it("accepts a successful Pages response with result_info absent", async () => {
    const lines = [];
    const requests = [];
    const result = await inventory({
      pages: [[]],
      pageResponses: [{ result: [deployment()] }],
      healthyLabels: ["1cb6e1c5"],
      emitLine: (line) => lines.push(line),
      persistOrigin: () => undefined,
      requests,
    });
    expect(result.origin).toBe(
      `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
    );
    expect(apiPageNumbers(requests)).toEqual(["1"]);
    expect(lines).toContain("PAGES_DEPLOYMENTS_HTTP_CLASS=2XX");
    expect(lines).toContain("PAGES_DEPLOYMENTS_SUCCESS_FLAG=true");
    expect(lines).toContain("PAGES_DEPLOYMENTS_RESULT_ARRAY=true");
    expect(lines).toContain("PAGES_DEPLOYMENTS_RESULT_INFO_PRESENT=false");
    expect(lines).toContain("PAGES_DEPLOYMENTS_FAILURE_CLASS=NONE");
    expect(lines).toContain("PAGES_DEPLOYMENTS_API=PASS");
  });

  it.each([
    ["page absent", { per_page: 100, total_pages: 1 }],
    ["per_page absent", { page: 1, total_pages: 1 }],
    ["total_pages absent", { page: 1, per_page: 100 }],
  ])(
    "accepts valid present pagination metadata with %s",
    async (_name, resultInfo) => {
      const requests = [];
      const result = await inventory({
        pages: [[]],
        pageResponses: [{ result: [deployment()], resultInfo }],
        healthyLabels: ["1cb6e1c5"],
        persistOrigin: () => undefined,
        requests,
      });
      expect(result.origin).toBe(
        `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
      );
      expect(apiPageNumbers(requests)).toEqual(["1"]);
    },
  );

  it("uses a present total_pages value to retrieve the declared final page", async () => {
    const pageTwoDeployment = deployment({ label: "2cb6e1c5" });
    const requests = [];
    const result = await inventory({
      pages: [[], []],
      pageResponses: [
        {
          result: nonMatchingDeployments(100, "total-pages-one"),
          resultInfo: { page: 1, per_page: 100, total_pages: 2 },
        },
        {
          result: [pageTwoDeployment],
          resultInfo: { page: 2, per_page: 100, total_pages: 2 },
        },
      ],
      healthyLabels: ["2cb6e1c5"],
      persistOrigin: () => undefined,
      requests,
    });
    expect(result.origin).toBe(
      `https://2cb6e1c5.${edgePagesProject}.pages.dev`,
    );
    expect(apiPageNumbers(requests)).toEqual(["1", "2"]);
  });

  it("infers the final page from a short response without total_pages", async () => {
    const pageTwoDeployment = deployment({ label: "2cb6e1c5" });
    const requests = [];
    const result = await inventory({
      pages: [[], []],
      pageResponses: [
        { result: nonMatchingDeployments(100, "short-page-one") },
        { result: [pageTwoDeployment] },
      ],
      healthyLabels: ["2cb6e1c5"],
      persistOrigin: () => undefined,
      requests,
    });
    expect(result.origin).toBe(
      `https://2cb6e1c5.${edgePagesProject}.pages.dev`,
    );
    expect(apiPageNumbers(requests)).toEqual(["1", "2"]);
  });

  it("stops at an empty optional-metadata page without progressing to the Router", async () => {
    const lines = [];
    const persisted = [];
    const requests = [];
    await expect(
      inventory({
        pages: [[], []],
        pageResponses: [
          { result: nonMatchingDeployments(100, "empty-page-one") },
          { result: [] },
        ],
        emitLine: (line) => lines.push(line),
        persistOrigin: (origin) => persisted.push(origin),
        requests,
      }),
    ).rejects.toThrow("PAGES_RC9_MATCHES_MISSING");
    expect(apiPageNumbers(requests)).toEqual(["1", "2"]);
    expect(lines).toContain("PAGES_DEPLOYMENTS_API=PASS");
    expect(lines).toContain("PAGES_DEPLOYMENTS_FAILURE_CLASS=NONE");
    expect(persisted).toEqual([]);
  });

  it("does not require total_pages to remain present on later pages", async () => {
    const pageTwoDeployment = deployment({ label: "2cb6e1c5" });
    const requests = [];
    const result = await inventory({
      pages: [[], []],
      pageResponses: [
        {
          result: nonMatchingDeployments(100, "optional-total-one"),
          resultInfo: { page: 1, per_page: 100, total_pages: 2 },
        },
        { result: [pageTwoDeployment], resultInfo: { page: 2, per_page: 100 } },
      ],
      healthyLabels: ["2cb6e1c5"],
      persistOrigin: () => undefined,
      requests,
    });
    expect(result.origin).toBe(
      `https://2cb6e1c5.${edgePagesProject}.pages.dev`,
    );
    expect(apiPageNumbers(requests)).toEqual(["1", "2"]);
  });

  it("rejects a pages inventory that would require more than 100 requests", async () => {
    const lines = [];
    await expect(
      inventory({
        pages: [[]],
        pageResponses: Array.from({ length: 100 }, (_, pageIndex) => ({
          result: nonMatchingDeployments(100, `page-limit-${pageIndex}`),
        })),
        emitLine: (line) => lines.push(line),
        persistOrigin: () => undefined,
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENTS_API_FAILURE");
    expect(lines).toContain("PAGES_DEPLOYMENTS_FAILURE_CLASS=PAGINATION_LIMIT");
  });

  it("rejects invalid immutable URLs and zero healthy candidates without persisting an origin", async () => {
    const validButUnhealthy = deployment({ label: "1cb6e1c5" });
    const invalidUrl = deployment({
      id: "22222222-2222-2222-2222-222222222222",
      createdOn: "2026-08-14T04:00:00.000Z",
      url: "https://production-candidate.invalid.pages.dev",
    });
    const lines = [];
    const persisted = [];
    await expect(
      inventory({
        pages: [[validButUnhealthy, invalidUrl]],
        healthyLabels: [],
        emitLine: (line) => lines.push(line),
        persistOrigin: (origin) => persisted.push(origin),
      }),
    ).rejects.toThrow("PAGES_RC9_MATCHES_UNHEALTHY");
    expect(lines).toContain("PAGES_RC9_CANDIDATE_URL_SHAPE_VALID=false");
    expect(lines).toContain("PAGES_REDEPLOY_REQUIRED=YES");
    expect(persisted).toEqual([]);
  });

  it("accepts a 404 branch alias only after selecting a healthy immutable deployment", async () => {
    const lines = [];
    await expect(
      inventory({
        pages: [[deployment()]],
        healthyLabels: ["1cb6e1c5"],
        aliasStatus: 404,
        emitLine: (line) => lines.push(line),
        persistOrigin: () => undefined,
      }),
    ).resolves.toMatchObject({
      origin: `https://1cb6e1c5.${edgePagesProject}.pages.dev`,
    });
    expect(lines).toContain("PAGES_RC9_BRANCH_ALIAS_ROUTING=DRIFTED");
    expect(lines).toContain(
      "ROOT_CAUSE_PAGES=PAGES_BRANCH_ALIAS_CONTROL_PLANE_DRIFT",
    );
  });

  it("fails safely when present total_pages values disagree", async () => {
    const lines = [];
    const requests = [];
    await expect(
      inventory({
        pages: [[], []],
        pageResponses: [
          {
            result: nonMatchingDeployments(100, "changed-total-one"),
            resultInfo: { page: 1, per_page: 100, total_pages: 3 },
          },
          {
            result: nonMatchingDeployments(100, "changed-total-two"),
            resultInfo: { page: 2, per_page: 100, total_pages: 4 },
          },
        ],
        emitLine: (line) => lines.push(line),
        persistOrigin: () => undefined,
        requests,
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENTS_API_FAILURE");
    expect(apiPageNumbers(requests)).toEqual(["1", "2"]);
    expect(lines).toContain(
      "PAGES_DEPLOYMENTS_FAILURE_CLASS=PAGINATION_METADATA",
    );
  });

  it("rejects duplicate deployment IDs before selecting or probing Pages", async () => {
    const duplicate = nonMatchingDeployments(100, "duplicate")[0];
    const lines = [];
    const persisted = [];
    const requests = [];
    await expect(
      inventory({
        pages: [[], []],
        pageResponses: [
          { result: nonMatchingDeployments(100, "duplicate") },
          { result: [duplicate] },
        ],
        emitLine: (line) => lines.push(line),
        persistOrigin: (origin) => persisted.push(origin),
        requests,
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENTS_API_FAILURE");
    expect(lines).toContain(
      "PAGES_DEPLOYMENTS_FAILURE_CLASS=DUPLICATE_DEPLOYMENT",
    );
    expect(apiPageNumbers(requests)).toEqual(["1", "2"]);
    expect(requests).toHaveLength(2);
    expect(persisted).toEqual([]);
  });

  it.each([
    ["page", { page: 0 }],
    ["per_page", { per_page: "100" }],
    ["total_pages", { total_pages: -1 }],
    ["total_count", { total_count: -1 }],
    ["result_info", null],
  ])(
    "rejects malformed present %s metadata safely",
    async (_name, resultInfo) => {
      const lines = [];
      await expect(
        inventory({
          pages: [[]],
          pageResponses: [{ result: [deployment()], resultInfo }],
          emitLine: (line) => lines.push(line),
          persistOrigin: () => undefined,
        }),
      ).rejects.toThrow("PAGES_DEPLOYMENTS_API_FAILURE");
      expect(lines).toContain(
        "PAGES_DEPLOYMENTS_FAILURE_CLASS=PAGINATION_METADATA",
      );
    },
  );

  it("classifies a successful response with success=false without emitting its body", async () => {
    const lines = [];
    await expect(
      inventory({
        pages: [[]],
        pageResponses: [{ success: false, result: [] }],
        emitLine: (line) => lines.push(line),
        persistOrigin: () => undefined,
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENTS_API_FAILURE");
    expect(lines).toContain("PAGES_DEPLOYMENTS_HTTP_CLASS=2XX");
    expect(lines).toContain("PAGES_DEPLOYMENTS_SUCCESS_FLAG=false");
    expect(lines).toContain("PAGES_DEPLOYMENTS_RESULT_ARRAY=true");
    expect(lines).toContain("PAGES_DEPLOYMENTS_FAILURE_CLASS=API_ENVELOPE");
  });

  it("classifies a successful response with a non-array result", async () => {
    const lines = [];
    await expect(
      inventory({
        pages: [[]],
        pageResponses: [{ result: {} }],
        emitLine: (line) => lines.push(line),
        persistOrigin: () => undefined,
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENTS_API_FAILURE");
    expect(lines).toContain("PAGES_DEPLOYMENTS_HTTP_CLASS=2XX");
    expect(lines).toContain("PAGES_DEPLOYMENTS_SUCCESS_FLAG=true");
    expect(lines).toContain("PAGES_DEPLOYMENTS_RESULT_ARRAY=false");
    expect(lines).toContain("PAGES_DEPLOYMENTS_FAILURE_CLASS=RESULT_SHAPE");
  });

  it("classifies malformed JSON without emitting the response body", async () => {
    const rawBody = "not-json-private-pages-response";
    const lines = [];
    await expect(
      inventory({
        pages: [[]],
        pageResponses: [
          new Response(rawBody, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ],
        emitLine: (line) => lines.push(line),
        persistOrigin: () => undefined,
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENTS_API_FAILURE");
    expect(lines).toContain("PAGES_DEPLOYMENTS_HTTP_CLASS=2XX");
    expect(lines).toContain("PAGES_DEPLOYMENTS_SUCCESS_FLAG=unavailable");
    expect(lines).toContain("PAGES_DEPLOYMENTS_RESULT_ARRAY=false");
    expect(lines).toContain("PAGES_DEPLOYMENTS_FAILURE_CLASS=API_ENVELOPE");
    expect(lines.join("\n")).not.toContain(rawBody);
  });

  it("classifies HTTP failures without emitting the response body", async () => {
    const rawError = "cloudflare-error-private-request-id";
    const lines = [];
    await expect(
      inventory({
        pages: [[]],
        pageResponses: [
          new Response(JSON.stringify({ error: rawError }), { status: 403 }),
        ],
        emitLine: (line) => lines.push(line),
        persistOrigin: () => undefined,
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENTS_API_FAILURE");
    expect(lines).toContain("PAGES_DEPLOYMENTS_HTTP_CLASS=4XX");
    expect(lines).toContain("PAGES_DEPLOYMENTS_SUCCESS_FLAG=unavailable");
    expect(lines).toContain("PAGES_DEPLOYMENTS_RESULT_ARRAY=false");
    expect(lines).toContain("PAGES_DEPLOYMENTS_RESULT_INFO_PRESENT=false");
    expect(lines).toContain("PAGES_DEPLOYMENTS_FAILURE_CLASS=HTTP");
    expect(lines.join("\n")).not.toContain(rawError);
  });

  it("classifies network failures without emitting the raw exception", async () => {
    const rawError = "postgresql://private-network-error";
    const lines = [];
    await expect(
      inventory({
        pages: [[]],
        pageResponses: [() => Promise.reject(new Error(rawError))],
        emitLine: (line) => lines.push(line),
        persistOrigin: () => undefined,
      }),
    ).rejects.toThrow("PAGES_DEPLOYMENTS_API_FAILURE");
    expect(lines).toContain("PAGES_DEPLOYMENTS_HTTP_CLASS=NETWORK");
    expect(lines).toContain("PAGES_DEPLOYMENTS_SUCCESS_FLAG=unavailable");
    expect(lines).toContain("PAGES_DEPLOYMENTS_RESULT_ARRAY=false");
    expect(lines).toContain("PAGES_DEPLOYMENTS_RESULT_INFO_PRESENT=false");
    expect(lines).toContain("PAGES_DEPLOYMENTS_FAILURE_CLASS=NETWORK");
    expect(lines.join("\n")).not.toContain(rawError);
  });
});

describe("RC9 candidate Router safety", () => {
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
