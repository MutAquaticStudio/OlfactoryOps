import { randomBytes } from "node:crypto";

export const candidateRouterIdentityExpectation = Object.freeze({
  fixtureHostname: "rc9-release-31736285494-469ca8942a.next.labofscents.org",
  releaseSha: "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
});

function safeStatus(response) {
  return Number.isInteger(response?.status) &&
    response.status >= 100 &&
    response.status <= 599
    ? String(response.status)
    : "000";
}

export function inspectCandidateRouterIdentity(
  response,
  expectation = candidateRouterIdentityExpectation,
) {
  const contentType = response?.headers?.get?.("content-type") ?? "";
  const routerActive =
    response?.headers?.get?.("x-olfactoryops-workspace-router") === "active";
  const environmentProduction =
    response?.headers?.get?.("x-olfactoryops-release-environment") ===
    "production";
  const releaseShaMatch =
    response?.headers?.get?.("x-olfactoryops-release-sha") ===
    expectation.releaseSha;
  const html = /^text\/html(?:;|$)/i.test(contentType);
  const proven =
    safeStatus(response) === "200" &&
    html &&
    routerActive &&
    environmentProduction &&
    releaseShaMatch;
  return {
    httpStatus: safeStatus(response),
    html,
    routerActive,
    environmentProduction,
    releaseShaMatch,
    proven,
  };
}

function print(name, value) {
  const safe =
    typeof value === "boolean"
      ? value
        ? "PASS"
        : "FAIL"
      : typeof value === "string" && /^[0-9A-Z_]+$/.test(value)
        ? value
        : "UNPROVEN";
  console.log(`${name}=${safe}`);
}

async function main() {
  const nonce = randomBytes(12).toString("hex");
  let response;
  try {
    response = await fetch(
      `https://${candidateRouterIdentityExpectation.fixtureHostname}/?oo_router_identity=${nonce}`,
      {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: { "cache-control": "no-cache", pragma: "no-cache" },
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch {
    response = undefined;
  }
  const result = inspectCandidateRouterIdentity(response);
  print("CANDIDATE_ROUTER_IDENTITY_HTTP_STATUS", result.httpStatus);
  print("CANDIDATE_ROUTER_IDENTITY_HTML", result.html);
  print("CANDIDATE_ROUTER_IDENTITY_HEADERS", result.proven);
  print("CANDIDATE_ROUTER_EXECUTION_PROVEN", result.proven);
  if (!result.proven) process.exitCode = 1;
}

if (import.meta.main) await main();
