import { describe, expect, it } from "vitest";

import {
  emitPagesDomainHandoffFailure,
  PagesDomainHandoffError,
  handoffProductionPagesDomain,
  preflightProductionPagesDomainHandoff,
  recoverProductionPagesDomainHandoff,
} from "./handoff-v2-rc10-production-pages-domain.mjs";

const releaseSha = "fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd";
const predecessor = "previous-pages-project.pages.dev";
const expected = "olfactoryops-v2-production.pages.dev";

function response(result, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => result,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  };
}

function cloudflare(result, status = 200, resultInfo) {
  return response(
    {
      success: status >= 200 && status < 300,
      result,
      ...(resultInfo ? { result_info: resultInfo } : {}),
    },
    status,
  );
}

function environment() {
  return {
    CLOUDFLARE_ACCOUNT_ID: "account-fixture",
    CLOUDFLARE_API_TOKEN: "provider-token",
    RELEASE_SHA: releaseSha,
    PAGES_DOMAIN_BASELINE_FILE: "/private/baseline.json",
  };
}

function createFetch({ publicReady = true } = {}) {
  const state = {
    domains: [],
    cname: predecessor,
    deletes: 0,
    calls: [],
  };
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    state.calls.push({ method, path: url.pathname, query: url.search });
    if (url.hostname === "labofscents.org") {
      if (!publicReady)
        return response({}, 200, { "content-type": "text/html" });
      if (url.pathname === "/release.json")
        return response({ fullGitSha: releaseSha, artifact: "pages" });
      return response({}, 200, { "content-type": "text/html; charset=utf-8" });
    }
    if (url.pathname.endsWith("/pages/projects/olfactoryops-v2-production")) {
      return cloudflare({
        name: "olfactoryops-v2-production",
        production_branch: "production",
      });
    }
    if (
      url.pathname.endsWith(
        "/pages/projects/olfactoryops-v2-production/deployments",
      )
    ) {
      return cloudflare(
        [
          {
            project_name: "olfactoryops-v2-production",
            environment: "production",
            is_skipped: false,
            latest_stage: { status: "success" },
            deployment_trigger: {
              metadata: { branch: "production", commit_hash: releaseSha },
            },
          },
        ],
        200,
        { page: 1, total_pages: 1 },
      );
    }
    if (
      url.pathname.endsWith(
        "/pages/projects/olfactoryops-v2-production/domains",
      )
    ) {
      if (method === "POST") {
        state.domains = [{ name: "labofscents.org" }];
        return cloudflare({ name: "labofscents.org" });
      }
      return cloudflare(state.domains);
    }
    if (
      url.pathname.endsWith(
        "/pages/projects/olfactoryops-v2-production/domains/labofscents.org",
      )
    ) {
      if (method === "DELETE") {
        state.deletes += 1;
        state.domains = [];
        return cloudflare({});
      }
    }
    if (url.pathname.endsWith("/zones")) {
      return cloudflare([{ id: "zone-fixture", name: "labofscents.org" }]);
    }
    if (url.pathname.endsWith("/dns_records") && method === "GET") {
      return cloudflare([
        {
          id: "dns-fixture",
          name: "labofscents.org",
          type: "CNAME",
          content: state.cname,
          proxied: true,
        },
      ]);
    }
    if (
      url.pathname.endsWith("/dns_records/dns-fixture") &&
      method === "PATCH"
    ) {
      state.cname = JSON.parse(init.body).content;
      return cloudflare({});
    }
    if (url.pathname.endsWith("/pages/projects")) {
      return cloudflare([
        { name: "olfactoryops-v2-production" },
        { name: "previous-pages-project" },
      ]);
    }
    throw new Error("unexpected request");
  };
  return { fetchImpl, state };
}

describe("RC10 production Pages domain handoff", () => {
  it("emits only bounded telemetry for a rejected Pages project preflight", async () => {
    const rawError = "do-not-print-provider-response";
    const error = await preflightProductionPagesDomainHandoff({
      environment: environment(),
      fetchImpl: async () =>
        response(
          { success: false, errors: [{ code: 10000, message: rawError }] },
          403,
        ),
      writeBaseline: async () => {},
    }).catch((caught) => caught);
    const emitted = [];

    emitPagesDomainHandoffFailure(error, (line) => emitted.push(line));

    expect(error).toBeInstanceOf(PagesDomainHandoffError);
    expect(emitted).toEqual([
      "PRODUCTION_PAGES_DOMAIN_API_OPERATION=PAGES_PROJECT_READ",
      "PRODUCTION_PAGES_DOMAIN_API_HTTP_STATUS=403",
      "PRODUCTION_PAGES_DOMAIN_API_CF_ERROR_CODE=10000",
      "PRODUCTION_PAGES_DOMAIN_HANDOFF_FAILURE=PAGES_DOMAIN_CONTROL_PLANE_REJECTED",
    ]);
    expect(emitted.join("\n")).not.toContain(rawError);
    expect(emitted.join("\n")).not.toContain("provider-token");
  });

  it("captures only an exact Pages predecessor baseline without leaking opaque provider data", async () => {
    const { fetchImpl, state } = createFetch();
    const emitted = [];
    let baseline;

    await preflightProductionPagesDomainHandoff({
      environment: environment(),
      fetchImpl,
      emit: (line) => emitted.push(line),
      writeBaseline: async (_path, value) => {
        baseline = value;
      },
    });

    expect(baseline).toMatchObject({
      releaseSha,
      previousCname: predecessor,
      previousProxied: true,
    });
    expect(emitted).toEqual([
      "PRODUCTION_PAGES_DOMAIN_PREFLIGHT=PASS",
      "PRODUCTION_PAGES_RC10_DEPLOYMENT=PASS",
      "PRODUCTION_PAGES_DOMAIN_PREDECESSOR_TARGET=PROVEN",
    ]);
    expect(emitted.join("\n")).not.toContain(predecessor);
    expect(emitted.join("\n")).not.toContain("provider-token");
    expect(state.calls.every((call) => call.method === "GET")).toBe(true);
    expect(state.calls.some((call) => call.path === "/client/v4/zones")).toBe(
      true,
    );
    expect(
      state.calls.some((call) =>
        call.path.includes("/accounts/account-fixture/zones"),
      ),
    ).toBe(false);
  });

  it("attaches the exact Pages domain, changes only its exact CNAME, and verifies public RC10 identity", async () => {
    const { fetchImpl, state } = createFetch();
    let baseline;
    await preflightProductionPagesDomainHandoff({
      environment: environment(),
      fetchImpl,
      writeBaseline: async (_path, value) => {
        baseline = value;
      },
    });
    const emitted = [];
    await handoffProductionPagesDomain({
      environment: environment(),
      fetchImpl,
      readBaseline: async () => baseline,
      writeBaseline: async (_path, value) => {
        baseline = value;
      },
      emit: (line) => emitted.push(line),
      sleep: async () => {},
    });

    expect(state.cname).toBe(expected);
    expect(state.domains).toEqual([{ name: "labofscents.org" }]);
    expect(state.calls.filter((call) => call.method === "POST")).toHaveLength(
      1,
    );
    expect(state.calls.filter((call) => call.method === "PATCH")).toHaveLength(
      1,
    );
    expect(state.calls.filter((call) => call.method === "DELETE")).toHaveLength(
      0,
    );
    expect(emitted).toEqual([
      "PRODUCTION_PAGES_DOMAIN_HANDOFF=PASS",
      "PRODUCTION_PAGES_PUBLIC_DOMAIN=PASS",
      "PRODUCTION_PAGES_PUBLIC_RC10_IDENTITY=PASS",
    ]);
  });

  it("rejects a non-Pages predecessor before any public control-plane mutation", async () => {
    const { fetchImpl, state } = createFetch();
    state.cname = "unapproved.example.net";
    const error = await preflightProductionPagesDomainHandoff({
      environment: environment(),
      fetchImpl,
      writeBaseline: async () => {},
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(PagesDomainHandoffError);
    expect(error.classification).toBe("PAGES_DOMAIN_PREDECESSOR_UNPROVEN");
    expect(state.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("leaves a recoverable private baseline when public RC10 identity does not converge", async () => {
    const { fetchImpl, state } = createFetch({ publicReady: false });
    let baseline;
    await preflightProductionPagesDomainHandoff({
      environment: environment(),
      fetchImpl,
      writeBaseline: async (_path, value) => {
        baseline = value;
      },
    });

    const error = await handoffProductionPagesDomain({
      environment: environment(),
      fetchImpl,
      readBaseline: async () => baseline,
      writeBaseline: async (_path, value) => {
        baseline = value;
      },
      sleep: async () => {},
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(PagesDomainHandoffError);
    expect(error.classification).toBe("PAGES_DOMAIN_PUBLIC_IDENTITY_UNPROVEN");
    expect(state.cname).toBe(expected);
    expect(state.domains).toEqual([{ name: "labofscents.org" }]);

    await recoverProductionPagesDomainHandoff({
      environment: environment(),
      fetchImpl,
      readBaseline: async () => baseline,
    });
    expect(state.cname).toBe(predecessor);
    expect(state.domains).toEqual([]);
  });

  it("restores the captured predecessor and removes only the Pages domain created by the failed handoff", async () => {
    const { fetchImpl, state } = createFetch();
    state.cname = expected;
    state.domains = [{ name: "labofscents.org" }];
    const emitted = [];
    const baseline = {
      schema: 1,
      releaseSha,
      zoneId: "zone-fixture",
      dnsRecordId: "dns-fixture",
      previousCname: predecessor,
      previousProxied: true,
    };

    await recoverProductionPagesDomainHandoff({
      environment: environment(),
      fetchImpl,
      readBaseline: async () => baseline,
      emit: (line) => emitted.push(line),
    });

    expect(state.cname).toBe(predecessor);
    expect(state.domains).toEqual([]);
    expect(state.deletes).toBe(1);
    expect(emitted).toEqual(["PRODUCTION_PAGES_DOMAIN_RECOVERY=PASS"]);
    expect(emitted.join("\n")).not.toContain(predecessor);
  });
});
