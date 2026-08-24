import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import {
  CandidatePagesProjectRootError,
  emitCandidatePagesProjectRootFailure,
  verifyCandidatePagesProjectRoot,
} from "./verify-v2-rc12-candidate-pages-project-root.mjs";

const accountId = "account-fixture";
const token = "token-fixture-must-never-leak";
const candidateProject = "olfactoryops-v2-production-candidate";
const liveProject = "olfactoryops-v2-production";
const releaseSha = "331c1a6054fe1420b063a2e1fe9e5cef4f043ff8";
const origin = `https://${candidateProject}.pages.dev`;
const deploymentId = "opaque-deployment-fixture";
const apiBase = "https://api-next.labofscents.org/api/v1";
const workspaceBase = "next.labofscents.org";
const javascript = `window.__candidateConfig={api:${JSON.stringify(apiBase)},workspace:${JSON.stringify(workspaceBase)}};`;
const stylesheet = "body{color:#123}";
const html = '<!doctype html><html><head><link rel="stylesheet" href="/assets/index.css"></head><body><script type="module" src="/assets/index.js"></script></body></html>';

function response(body, { status = 200, contentType = "application/json" } = {}) {
  return new Response(
    typeof body === "string" || body instanceof Uint8Array
      ? body
      : JSON.stringify(body),
    { status, headers: { "content-type": contentType } },
  );
}

function pagesEnvelope(result, resultInfo) {
  return { success: true, result, ...(resultInfo ? { result_info: resultInfo } : {}) };
}

function deployment(overrides = {}) {
  return {
    id: deploymentId,
    project_name: candidateProject,
    environment: "production",
    is_skipped: false,
    latest_stage: { status: "success" },
    deployment_trigger: {
      metadata: { branch: "production-candidate", commit_hash: releaseSha },
    },
    url: `https://bec95d4e.${candidateProject}.pages.dev`,
    ...overrides,
  };
}

function environment(checkpoint = "BEFORE_ROUTER") {
  return {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: token,
    PRODUCTION_CANDIDATE_PAGES_PROJECT: candidateProject,
    RELEASE_SHA: releaseSha,
    PROJECT_ROOT_RECHECK_CHECKPOINT: checkpoint,
  };
}

async function withDist(action, { js = javascript, css = stylesheet } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "oo-rc12-pages-root-"));
  try {
    mkdirSync(join(directory, "assets"));
    writeFileSync(join(directory, "index.html"), html);
    writeFileSync(join(directory, "assets", "index.js"), js);
    writeFileSync(join(directory, "assets", "index.css"), css);
    return await action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function successfulFetch({
  candidateName = candidateProject,
  liveName = liveProject,
  domains = [],
  canonicalDeployment = deployment(),
  listedDeployment = canonicalDeployment,
  detailedDeployment = canonicalDeployment,
  manifestSha = releaseSha,
  remoteJavascript = javascript,
  remoteStylesheet = stylesheet,
  remoteHtml = html,
} = {}) {
  return vi.fn(async (input, options = {}) => {
    const url = new URL(input);
    expect(options.method ?? "GET").toBe("GET");

    if (url.hostname === "api.cloudflare.com") {
      expect(options.headers.authorization).toBe(`Bearer ${token}`);
      const base = `/client/v4/accounts/${accountId}/pages/projects/`;
      if (url.pathname === `${base}${candidateProject}`)
        return response(
          pagesEnvelope({
            name: candidateName,
            subdomain: `${candidateProject}.pages.dev`,
            production_branch: "production-candidate",
            canonical_deployment: { id: canonicalDeployment.id },
          }),
        );
      if (url.pathname === `${base}${liveProject}`)
        return response(pagesEnvelope({ name: liveName }));
      if (url.pathname === `${base}${candidateProject}/domains`)
        return response(pagesEnvelope(domains));
      if (url.pathname === `${base}${candidateProject}/deployments`)
        return response(
          pagesEnvelope([listedDeployment], {
            page: 1,
            per_page: 20,
            total_pages: 1,
          }),
        );
      if (
        url.pathname ===
        `${base}${candidateProject}/deployments/${encodeURIComponent(deploymentId)}`
      )
        return response(pagesEnvelope(detailedDeployment));
    }

    expect(options.headers?.authorization).toBeUndefined();
    if (url.origin !== origin) return response("missing", { status: 404 });
    if (url.pathname === "/release.json")
      return response({ fullGitSha: manifestSha, artifact: "pages" });
    if (url.pathname === "/")
      return response(remoteHtml, { contentType: "text/html; charset=utf-8" });
    if (url.pathname === "/assets/index.js")
      return response(remoteJavascript, { contentType: "application/javascript" });
    if (url.pathname === "/assets/index.css")
      return response(remoteStylesheet, { contentType: "text/css" });
    return response("missing", { status: 404 });
  });
}

describe("RC12 candidate Pages project-root verifier", () => {
  it("proves the isolated project, exact canonical RC12 deployment, and byte-identical runtime artifact", async () => {
    await withDist(async (distDirectory) => {
      const output = [];
      const outputs = [];
      const fetchImpl = successfulFetch();

      const result = await verifyCandidatePagesProjectRoot({
        environment: environment(),
        fetchImpl,
        distDirectory,
        emit: (line) => output.push(line),
        appendOutput: async (values) => outputs.push(values),
      });

      expect(result).toEqual({ origin, checkpoint: "BEFORE_ROUTER" });
      expect(outputs).toEqual([{ origin, githubOutput: undefined }]);
      expect(output).toEqual([
        `CANDIDATE_PAGES_ORIGIN=${origin}`,
        "CANDIDATE_PROJECT_ROOT_VERIFIED=PASS",
        "CANDIDATE_PROJECT_ROOT_RELEASE_SHA=RC12",
        "CANDIDATE_PROJECT_ROOT_HTTP=PASS",
        "PAGES_PROJECT_ISOLATION=PASS",
        "LIVE_CUSTOM_DOMAIN_OWNERSHIP=NONE",
        "PAGES_API_CONFIGURATION=PASS",
        "PAGES_WORKSPACE_CONFIGURATION=PASS",
        "PROJECT_ROOT_RELEASE_RECHECK_BEFORE_ROUTER=PASS",
      ]);
      expect(fetchImpl).toHaveBeenCalledTimes(13);
      expect(fetchImpl.mock.calls.every(([, options]) => (options?.method ?? "GET") === "GET")).toBe(true);
      expect(output.join("\n")).not.toContain(token);
      expect(output.join("\n")).not.toContain(deploymentId);
    });
  });

  it("emits the smoke checkpoint only after the same complete proof", async () => {
    await withDist(async (distDirectory) => {
      const output = [];
      await verifyCandidatePagesProjectRoot({
        environment: environment("BEFORE_SMOKE"),
        fetchImpl: successfulFetch(),
        distDirectory,
        emit: (line) => output.push(line),
        appendOutput: async () => {},
      });
      expect(output).toContain("PROJECT_ROOT_RELEASE_RECHECK_BEFORE_SMOKE=PASS");
      expect(output).not.toContain("PROJECT_ROOT_RELEASE_RECHECK_BEFORE_ROUTER=PASS");
    });
  });

  it("rejects project identity drift, live-project reuse, and custom-domain ownership", async () => {
    await withDist(async (distDirectory) => {
      for (const [fetchImpl, classification] of [
        [successfulFetch({ candidateName: "other" }), "CANDIDATE_PROJECT_IDENTITY_MISMATCH"],
        [successfulFetch({ liveName: candidateProject }), "CANDIDATE_PROJECT_NOT_ISOLATED"],
        [successfulFetch({ domains: [{ name: "live.example" }] }), "CANDIDATE_CUSTOM_DOMAIN_PRESENT"],
      ]) {
        const error = await verifyCandidatePagesProjectRoot({
          environment: environment(),
          fetchImpl,
          distDirectory,
        }).catch((caught) => caught);
        expect(error).toBeInstanceOf(CandidatePagesProjectRootError);
        expect(error.classification).toBe(classification);
      }
    });
  });

  it("rejects stale canonical, listed, detail, or publicly served release identity", async () => {
    await withDist(async (distDirectory) => {
      const wrongShaDeployment = deployment({
        deployment_trigger: {
          metadata: { branch: "production-candidate", commit_hash: "0".repeat(40) },
        },
      });
      for (const fetchImpl of [
        successfulFetch({ listedDeployment: wrongShaDeployment }),
        successfulFetch({ detailedDeployment: wrongShaDeployment }),
        successfulFetch({ manifestSha: "0".repeat(40) }),
      ]) {
        const error = await verifyCandidatePagesProjectRoot({
          environment: environment(),
          fetchImpl,
          distDirectory,
        }).catch((caught) => caught);
        expect(error).toBeInstanceOf(CandidatePagesProjectRootError);
        expect(error.classification).toMatch(/DEPLOYMENT|RELEASE/);
      }
    });
  });

  it("fails when the mutable project root drifts during a verification window", async () => {
    await withDist(async (distDirectory) => {
      const base = successfulFetch();
      let candidateProjectReads = 0;
      const fetchImpl = vi.fn(async (input, options) => {
        const url = new URL(input);
        if (
          url.hostname === "api.cloudflare.com" &&
          url.pathname.endsWith(`/pages/projects/${candidateProject}`) &&
          candidateProjectReads++ === 1
        ) {
          return response(
            pagesEnvelope({
              name: candidateProject,
              subdomain: `${candidateProject}.pages.dev`,
              production_branch: "production-candidate",
              canonical_deployment: { id: "replacement-deployment" },
            }),
          );
        }
        return base(input, options);
      });

      const error = await verifyCandidatePagesProjectRoot({
        environment: environment(),
        fetchImpl,
        distDirectory,
      }).catch((caught) => caught);
      expect(error).toMatchObject({
        classification: "CANDIDATE_PROJECT_ROOT_DRIFT_DURING_VERIFICATION",
      });
    });
  });

  it("rejects remote artifact or compiled candidate configuration drift", async () => {
    await withDist(async (distDirectory) => {
      const artifactError = await verifyCandidatePagesProjectRoot({
        environment: environment(),
        fetchImpl: successfulFetch({ remoteJavascript: `${javascript}changed` }),
        distDirectory,
      }).catch((caught) => caught);
      expect(artifactError).toMatchObject({ classification: "PROJECT_ROOT_ARTIFACT_MISMATCH" });
    });

    await withDist(
      async (distDirectory) => {
        const configError = await verifyCandidatePagesProjectRoot({
          environment: environment(),
          fetchImpl: successfulFetch({ remoteJavascript: "window.__candidateConfig={};" }),
          distDirectory,
        }).catch((caught) => caught);
        expect(configError).toMatchObject({ classification: "CANDIDATE_API_CONFIGURATION_MISSING" });
      },
      { js: "window.__candidateConfig={};" },
    );
  });

  it("fails closed without echoing provider errors, credentials, URLs, or opaque IDs", async () => {
    const providerMessage = "provider-secret-message";
    const output = [];
    const error = await withDist((distDirectory) =>
      verifyCandidatePagesProjectRoot({
        environment: environment(),
        fetchImpl: vi.fn().mockResolvedValue(
          response(
            {
              success: false,
              errors: [{ code: 10000, message: providerMessage }],
            },
            { status: 403 },
          ),
        ),
        distDirectory,
      }).catch((caught) => caught),
    );

    emitCandidatePagesProjectRootFailure(error, (line) => output.push(line));
    expect(output).toEqual([
      "CANDIDATE_PROJECT_ROOT_VERIFIED=FAIL",
      "CANDIDATE_PROJECT_ROOT_FAILURE=CLOUDFLARE_PROJECT_READ_FAILED",
    ]);
    const serialized = JSON.stringify({ output, error });
    for (const forbidden of [providerMessage, token, accountId, deploymentId])
      expect(serialized).not.toContain(forbidden);
  });
});
