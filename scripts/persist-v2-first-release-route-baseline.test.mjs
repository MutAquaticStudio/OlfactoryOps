import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { persistFirstReleaseRouteBaseline } from "./persist-v2-first-release-route-baseline.mjs";

const releaseSha = "f".repeat(40);

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function fetchFixture({ baselineValue } = {}) {
  const routes = [
    {
      id: "route-api-fixture",
      pattern: "api.labofscents.org/*",
      script: "old-api",
    },
    {
      id: "route-router-fixture",
      pattern: "*.labofscents.org/*",
      script: "old-router",
    },
  ];
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ method: init.method ?? "GET", url: url.pathname });
    if (url.hostname === "api.github.com") {
      if (
        url.pathname.endsWith("/" + "PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE")
      ) {
        return baselineValue
          ? response({
              name: "PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE",
              value: baselineValue,
            })
          : response({ message: "not found" }, 404);
      }
      return response({ name: "PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE" }, 201);
    }
    if (url.pathname === "/client/v4/zones") {
      return response({
        success: true,
        result: [{ id: "zone-fixture", name: "labofscents.org" }],
      });
    }
    if (url.pathname === "/client/v4/zones/zone-fixture/workers/routes") {
      return response({ success: true, result: routes });
    }
    if (url.pathname.endsWith("/workers/domains")) {
      return response({ success: true, result: [] });
    }
    if (url.pathname.endsWith("/versions/version-fixture")) {
      return response({
        success: true,
        result: {
          id: "version-fixture",
          resources: {
            bindings: [
              {
                type: "plain_text",
                name: "RELEASE_ENVIRONMENT",
                text: "production",
              },
            ],
          },
        },
      });
    }
    if (url.pathname.includes("/deployments")) {
      const service = decodeURIComponent(url.pathname.split("/").at(-2));
      if (service.startsWith("olfactoryops-v2-")) {
        return response({ success: false, errors: [{ code: 10007 }] }, 404);
      }
      return response({
        success: true,
        result: {
          deployments: [
            {
              strategy: "percentage",
              versions: [{ percentage: 100, version_id: "version-fixture" }],
            },
          ],
        },
      });
    }
    throw new Error("unexpected endpoint");
  };
  return { fetchImpl, calls };
}

describe("first-release route baseline persistence", () => {
  it("stores a captured baseline without emitting its service or route identifiers", async () => {
    const directory = mkdtempSync(join(tmpdir(), "first-release-baseline-"));
    const file = join(directory, "baseline");
    const output = [];
    const fixture = fetchFixture();
    try {
      const result = await persistFirstReleaseRouteBaseline({
        environment: {
          CLOUDFLARE_ACCOUNT_ID: "account-fixture",
          CLOUDFLARE_API_TOKEN: "cf-token",
          RELEASE_SHA: releaseSha,
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_TOKEN: "github-token",
          FIRST_RELEASE_BASELINE_FILE: file,
        },
        fetchImpl: fixture.fetchImpl,
        emit: (line) => output.push(line),
      });
      expect(result.pass).toBe(true);
      expect(readFileSync(file, "utf8")).not.toBe("");
      expect(output.join("\n")).not.toContain("old-api");
      expect(output.join("\n")).not.toContain("route-api-fixture");
      expect(output.join("\n")).not.toContain("cf-token");
      expect(fixture.calls.some((call) => call.method === "POST")).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
