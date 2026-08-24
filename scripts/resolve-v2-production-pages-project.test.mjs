import { describe, expect, it, vi } from "vitest";
import {
  emitPagesProjectFailure,
  PagesProjectError,
  resolveProductionPagesProject,
} from "./resolve-v2-production-pages-project.mjs";

const project = "olfactoryops-v2-production";
const productionBranch = "production";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function pagesResult(result) {
  return response({
    success: true,
    result,
    result_info: { total_pages: 1 },
  });
}

function readEnvironment(token = "pages-read-fixture") {
  return {
    CLOUDFLARE_ACCOUNT_ID: "account-fixture",
    CLOUDFLARE_PAGES_READ_TOKEN: token,
  };
}

function productionDeployment(overrides = {}) {
  return {
    id: "deployment-fixture",
    project_name: project,
    environment: "production",
    is_skipped: false,
    latest_stage: { status: "success" },
    deployment_trigger: { metadata: { branch: productionBranch } },
    url: "https://deployment-fixture.olfactoryops-v2-production.pages.dev",
    ...overrides,
  };
}

function successfulFetch({
  deployments = [],
  domains = [],
  canonicalDeployment = null,
} = {}) {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(pagesResult([{ name: project }]))
    .mockResolvedValueOnce(
      response({
        success: true,
        result: {
          name: project,
          production_branch: productionBranch,
          canonical_deployment: canonicalDeployment,
        },
      }),
    )
    .mockResolvedValueOnce(pagesResult(domains))
    .mockResolvedValueOnce(pagesResult(deployments));
  if (canonicalDeployment !== null) {
    fetchImpl.mockResolvedValueOnce(
      response({ success: true, result: canonicalDeployment }),
    );
  }
  return fetchImpl;
}

describe("resolve RC10 production Pages project", () => {
  it("fails closed when the dedicated Pages Read credential is absent", async () => {
    const output = [];
    const fetchImpl = vi.fn();
    const error = await resolveProductionPagesProject({
      environment: {
        ...readEnvironment(""),
        CLOUDFLARE_API_TOKEN: "general-token-must-not-be-used",
      },
      fetchImpl,
      emit: (line) => output.push(line),
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(PagesProjectError);
    expect(error.classification).toBe("PAGES_READ_TOKEN_MISSING");
    expect(fetchImpl).not.toHaveBeenCalled();
    emitPagesProjectFailure(
      error,
      (line) => output.push(line),
      readEnvironment(""),
    );
    expect(output).toEqual([
      "PAGES_READ_TOKEN_PRESENT=FAIL",
      "PAGES_READ_TOKEN_ACTIVE=UNPROVEN",
      "PAGES_READ_TOKEN_ACCOUNT_BINDING=UNPROVEN",
      "PAGES_READ_TOKEN_PERMISSION=UNPROVEN",
      "PAGES_READ_TOKEN_ACCESS=FAIL",
      "PAGES_READ_API_OPERATION=LIST_PROJECTS",
      "PAGES_READ_API_HTTP_STATUS=0",
      "PAGES_READ_API_CF_ERROR_CODE=NONE",
      "PRODUCTION_PAGES_PROJECT_RESOLUTION_FAILURE=PAGES_READ_TOKEN_MISSING",
    ]);
  });

  it("classifies a denied Pages Read request without provider payloads", async () => {
    const output = [];
    const error = await resolveProductionPagesProject({
      environment: readEnvironment(),
      fetchImpl: vi.fn().mockResolvedValue(
        response(
          {
            success: false,
            errors: [{ code: 10000, message: "provider-secret-message" }],
          },
          403,
        ),
      ),
    }).catch((caught) => caught);

    emitPagesProjectFailure(
      error,
      (line) => output.push(line),
      readEnvironment(),
    );
    expect(error).toMatchObject({
      classification: "PAGES_READ_TOKEN_ACCESS_DENIED",
      httpStatus: "403",
      cfErrorCode: "10000",
    });
    expect(output).toEqual([
      "PAGES_READ_TOKEN_PRESENT=PASS",
      "PAGES_READ_TOKEN_ACTIVE=UNPROVEN",
      "PAGES_READ_TOKEN_ACCOUNT_BINDING=UNPROVEN",
      "PAGES_READ_TOKEN_PERMISSION=UNPROVEN",
      "PAGES_READ_TOKEN_ACCESS=FAIL",
      "PAGES_READ_API_OPERATION=LIST_PROJECTS",
      "PAGES_READ_API_HTTP_STATUS=403",
      "PAGES_READ_API_CF_ERROR_CODE=10000",
      "PRODUCTION_PAGES_PROJECT_RESOLUTION_FAILURE=PAGES_READ_TOKEN_ACCESS_DENIED",
    ]);
    expect(output.join("\n")).not.toContain("provider-secret-message");
    expect(output.join("\n")).not.toContain("pages-read-fixture");
  });

  it("classifies unavailable and malformed project inventories separately from absence", async () => {
    const unavailable = await resolveProductionPagesProject({
      environment: readEnvironment(),
      fetchImpl: vi.fn().mockResolvedValue(response({ success: false }, 500)),
    }).catch((caught) => caught);
    const notFound = await resolveProductionPagesProject({
      environment: readEnvironment(),
      fetchImpl: vi.fn().mockResolvedValue(pagesResult([])),
    }).catch((caught) => caught);

    expect(unavailable).toMatchObject({
      classification: "PRODUCTION_PAGES_PROJECT_API_UNAVAILABLE",
    });
    expect(notFound).toMatchObject({
      classification: "PRODUCTION_PAGES_PROJECT_NOT_FOUND",
    });
  });

  it("requires exactly one exact project match", async () => {
    const error = await resolveProductionPagesProject({
      environment: readEnvironment(),
      fetchImpl: vi
        .fn()
        .mockResolvedValue(pagesResult([{ name: project }, { name: project }])),
    }).catch((caught) => caught);

    expect(error).toMatchObject({
      classification: "PRODUCTION_PAGES_PROJECT_AMBIGUOUS",
    });
  });

  it("uses the dedicated token for project, domain, and deployment proof", async () => {
    const fetchImpl = successfulFetch();
    const output = [];
    const outputWrites = [];

    const result = await resolveProductionPagesProject({
      environment: readEnvironment(),
      fetchImpl,
      emit: (line) => output.push(line),
      appendOutput: async (values) => outputWrites.push(values),
    });

    expect(result).toEqual({ project, baselineType: "EMPTY_UNROUTED" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[0][0]).toMatch(/\/pages\/projects$/);
    expect(fetchImpl.mock.calls[2][0]).toMatch(/\/domains$/);
    expect(fetchImpl.mock.calls[3][0]).toMatch(
      /\/deployments\?env=production$/,
    );
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.headers.authorization).toBe("Bearer pages-read-fixture");
    }
    expect(output).toEqual(
      expect.arrayContaining([
        "PAGES_READ_TOKEN_PRESENT=PASS",
        "PAGES_READ_TOKEN_ACTIVE=PASS",
        "PAGES_READ_TOKEN_ACCOUNT_BINDING=PASS",
        "PAGES_READ_TOKEN_PERMISSION=PASS",
        "PAGES_READ_TOKEN_ACCESS=PASS",
        "PAGES_READ_API_OPERATION=LIST_PROJECTS",
        "PAGES_READ_API_HTTP_STATUS=200",
        "PAGES_READ_API_CF_ERROR_CODE=NONE",
        "PRODUCTION_PAGES_PROJECT_READY=PASS",
        "PRODUCTION_PAGES_BASELINE_POLICY=FIRST_RELEASE_UNROUTED",
        "PRODUCTION_PAGES_PUBLIC_DOMAIN_BASELINE=NONE",
        "PRODUCTION_PAGES_BASELINE=PASS",
        "PRODUCTION_PAGES_BASELINE_TYPE=EMPTY_UNROUTED",
        "PRODUCTION_PAGES_CANONICAL_DEPLOYMENT=NONE",
      ]),
    );
    expect(outputWrites).toHaveLength(1);
    expect(output.join("\n")).not.toContain("pages-read-fixture");
  });

  it("does not accept a public-domain baseline", async () => {
    const error = await resolveProductionPagesProject({
      environment: readEnvironment(),
      fetchImpl: successfulFetch({ domains: [{}] }),
    }).catch((caught) => caught);

    expect(error).toMatchObject({
      classification: "PRODUCTION_PAGES_BASELINE_UNPROVEN",
    });
  });

  it("accepts only the exact active apex for an existing live upgrade baseline", async () => {
    const canonicalDeployment = productionDeployment();
    const output = [];
    const result = await resolveProductionPagesProject({
      environment: {
        ...readEnvironment(),
        PRODUCTION_PAGES_BASELINE_POLICY: "EXISTING_LIVE_UPGRADE",
      },
      fetchImpl: successfulFetch({
        domains: [{ name: "labofscents.org", status: "active" }],
        canonicalDeployment,
        deployments: [canonicalDeployment],
      }),
      emit: (line) => output.push(line),
      appendOutput: async () => {},
    });

    expect(result).toEqual({
      project,
      baselineType: "EXISTING_DEPLOYMENT",
    });
    expect(output).toEqual(
      expect.arrayContaining([
        "PRODUCTION_PAGES_BASELINE_POLICY=EXISTING_LIVE_UPGRADE",
        "PRODUCTION_PAGES_PUBLIC_DOMAIN_BASELINE=EXACT_APEX_ACTIVE",
        "PRODUCTION_PAGES_BASELINE=PASS",
      ]),
    );
  });

  it.each([
    [{ name: "other.example", status: "active" }],
    [{ name: "labofscents.org", status: "pending" }],
    [
      { name: "labofscents.org", status: "active" },
      { name: "other.example", status: "active" },
    ],
  ])("rejects a drifted live-upgrade domain baseline", async (domains) => {
    const canonicalDeployment = productionDeployment();
    const error = await resolveProductionPagesProject({
      environment: {
        ...readEnvironment(),
        PRODUCTION_PAGES_BASELINE_POLICY: "EXISTING_LIVE_UPGRADE",
      },
      fetchImpl: successfulFetch({
        domains,
        canonicalDeployment,
        deployments: [canonicalDeployment],
      }),
    }).catch((caught) => caught);

    expect(error).toMatchObject({
      classification: "PRODUCTION_PAGES_BASELINE_UNPROVEN",
    });
  });

  it("fails closed rather than sending unsupported pagination parameters", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        success: true,
        result: [{ name: project }],
        result_info: { total_pages: 2 },
      }),
    );

    const error = await resolveProductionPagesProject({
      environment: readEnvironment(),
      fetchImpl,
    }).catch((caught) => caught);

    expect(error).toMatchObject({
      classification: "PRODUCTION_PAGES_PROJECT_API_UNAVAILABLE",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).not.toMatch(/[?&](?:page|per_page)=/);
  });

  it("proves an existing baseline through the configured production branch and canonical deployment", async () => {
    const canonicalDeployment = productionDeployment();
    const fetchImpl = successfulFetch({
      canonicalDeployment,
      deployments: [canonicalDeployment],
    });
    const output = [];

    const result = await resolveProductionPagesProject({
      environment: readEnvironment(),
      fetchImpl,
      emit: (line) => output.push(line),
      appendOutput: async () => {},
    });

    expect(result).toEqual({ project, baselineType: "EXISTING_DEPLOYMENT" });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(fetchImpl.mock.calls[4][0]).toContain(
      "/deployments/deployment-fixture",
    );
    expect(output).toEqual(
      expect.arrayContaining([
        "PRODUCTION_PAGES_PROJECT_PRODUCTION_BRANCH=CONFIGURED",
        "PRODUCTION_PAGES_BASELINE_TYPE=EXISTING_DEPLOYMENT",
        "PRODUCTION_PAGES_CANONICAL_DEPLOYMENT=VERIFIED",
      ]),
    );
    expect(output.join("\n")).not.toContain("deployment-fixture");
  });

  it("rejects an unbound or branch-mismatched existing deployment baseline", async () => {
    const canonicalDeployment = productionDeployment();
    const noCanonical = await resolveProductionPagesProject({
      environment: readEnvironment(),
      fetchImpl: successfulFetch({ deployments: [canonicalDeployment] }),
    }).catch((caught) => caught);
    const wrongBranch = await resolveProductionPagesProject({
      environment: readEnvironment(),
      fetchImpl: successfulFetch({
        canonicalDeployment,
        deployments: [
          productionDeployment({
            deployment_trigger: { metadata: { branch: "other" } },
          }),
        ],
      }),
    }).catch((caught) => caught);

    expect(noCanonical).toMatchObject({
      classification: "PRODUCTION_PAGES_BASELINE_UNPROVEN",
    });
    expect(wrongBranch).toMatchObject({
      classification: "PRODUCTION_PAGES_BASELINE_UNPROVEN",
    });
  });

  it("preserves the legacy general-token caller without claiming Pages Read evidence", async () => {
    const output = [];
    await resolveProductionPagesProject({
      environment: {
        CLOUDFLARE_ACCOUNT_ID: "account-fixture",
        CLOUDFLARE_API_TOKEN: "general-fixture",
      },
      fetchImpl: successfulFetch({
        canonicalDeployment: productionDeployment(),
        deployments: [productionDeployment()],
      }),
      emit: (line) => output.push(line),
      appendOutput: async () => {},
    });

    expect(output).toContain(
      "PRODUCTION_PAGES_BASELINE_TYPE=EXISTING_DEPLOYMENT",
    );
    expect(output.join("\n")).not.toContain("PAGES_READ_TOKEN_");
  });
});
