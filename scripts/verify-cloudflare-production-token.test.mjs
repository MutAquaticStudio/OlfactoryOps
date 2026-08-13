import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { verifyProductionCloudflareToken } from "./verify-cloudflare-production-token.mjs";

const accountId = "account-safe-id";
const active = { success: true, result: { status: "active" } };

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchFor(routes) {
  return async (url) => {
    const path = new URL(url).pathname.replace(/^\/client\/v4/, "");
    return routes[path] ?? response(404, { success: false });
  };
}

function activeScopes(routes = {}) {
  return {
    [`/accounts/${accountId}`]: response(200, active),
    [`/accounts/${accountId}/workers/scripts`]: response(200, active),
    [`/accounts/${accountId}/pages/projects`]: response(200, active),
    [`/accounts/${accountId}/containers/applications`]: response(200, active),
    ...routes,
  };
}

describe("production Cloudflare token verifier", () => {
  it("accepts an active cfut user token through the user endpoint", async () => {
    const result = await verifyProductionCloudflareToken({
      token: "cfut_test_user_token",
      accountId,
      fetchImpl: fetchFor(
        activeScopes({ "/user/tokens/verify": response(200, active) }),
      ),
    });
    expect(result.pass).toBe(true);
    expect(result.lines).toContain("CLOUDFLARE_TOKEN_KIND=USER_API_TOKEN");
    expect(result.lines).toContain("CLOUDFLARE_USER_TOKEN_VERIFY=PASS");
  });

  it("accepts an active cfat account token without using the user endpoint", async () => {
    const result = await verifyProductionCloudflareToken({
      token: "cfat_test_account_token",
      accountId,
      fetchImpl: fetchFor(
        activeScopes({
          [`/accounts/${accountId}/tokens/verify`]: response(200, active),
        }),
      ),
    });
    expect(result.pass).toBe(true);
    expect(result.lines).toContain("CLOUDFLARE_TOKEN_KIND=ACCOUNT_API_TOKEN");
    expect(result.lines).toContain("CLOUDFLARE_ACCOUNT_TOKEN_VERIFY=PASS");
  });

  it("does not reject an account token because the user endpoint would return 401", async () => {
    const fetchImpl = fetchFor(
      activeScopes({
        "/user/tokens/verify": response(401, { success: false }),
        [`/accounts/${accountId}/tokens/verify`]: response(200, active),
      }),
    );
    const result = await verifyProductionCloudflareToken({
      token: "cfat_test_account_token",
      accountId,
      fetchImpl,
    });
    expect(result.pass).toBe(true);
    expect(result.lines).toContain(
      "CLOUDFLARE_USER_TOKEN_VERIFY=NOT_APPLICABLE",
    );
  });

  it.each([
    ["/user/tokens/verify", "CLOUDFLARE_USER_TOKEN_VERIFY=PASS"],
    [
      `/accounts/${accountId}/tokens/verify`,
      "CLOUDFLARE_ACCOUNT_TOKEN_VERIFY=PASS",
    ],
  ])(
    "accepts a legacy token through exactly one supported endpoint",
    async (path, expectedLine) => {
      const result = await verifyProductionCloudflareToken({
        token: "legacy-test-token",
        accountId,
        fetchImpl: fetchFor(
          activeScopes({
            "/user/tokens/verify": response(401, { success: false }),
            [`/accounts/${accountId}/tokens/verify`]: response(401, {
              success: false,
            }),
            [path]: response(200, active),
          }),
        ),
      });
      expect(result.pass).toBe(true);
      expect(result.lines).toContain(
        "CLOUDFLARE_TOKEN_KIND=LEGACY_UNPREFIXED_API_TOKEN",
      );
      expect(result.lines).toContain(expectedLine);
    },
  );

  it("classifies both token endpoints returning 401 as invalid or revoked", async () => {
    const result = await verifyProductionCloudflareToken({
      token: "legacy-test-token",
      accountId,
      fetchImpl: fetchFor({
        "/user/tokens/verify": response(401, { success: false }),
        [`/accounts/${accountId}/tokens/verify`]: response(401, {
          success: false,
        }),
      }),
    });
    expect(result.pass).toBe(false);
    expect(result.lines).toContain(
      "PRODUCTION_CLOUDFLARE_AUTH=CLOUDFLARE_TOKEN_REVOKED_OR_INVALID",
    );
  });

  it("classifies a valid token denied from a required deployment read surface as insufficient scope", async () => {
    const result = await verifyProductionCloudflareToken({
      token: "cfut_test_user_token",
      accountId,
      fetchImpl: fetchFor(
        activeScopes({
          "/user/tokens/verify": response(200, active),
          [`/accounts/${accountId}/containers/applications`]: response(403, {
            success: false,
          }),
        }),
      ),
    });
    expect(result.pass).toBe(false);
    expect(result.lines).toContain(
      "PRODUCTION_CLOUDFLARE_AUTH=FAIL_INSUFFICIENT_SCOPE",
    );
  });

  it("never emits a token, prefix, length, hash, or response body", async () => {
    const token = "cfat_do_not_log_this_token";
    const result = await verifyProductionCloudflareToken({
      token,
      accountId,
      fetchImpl: fetchFor(
        activeScopes({
          [`/accounts/${accountId}/tokens/verify`]: response(200, active),
        }),
      ),
    });
    const output = result.lines.join("\n");
    expect(output).not.toContain(token);
    expect(output).not.toContain("cfat_");
    expect(output).not.toContain('success":true');
    const source = readFileSync(
      "scripts/verify-cloudflare-production-token.mjs",
      "utf8",
    );
    expect(source).not.toContain("console.log(token");
    expect(source).not.toContain("console.log(body");
    expect(source).not.toMatch(
      /console\.(?:log|error)\([^)]*(?:token\.length|createHash|digest)\b/,
    );
  });
});
