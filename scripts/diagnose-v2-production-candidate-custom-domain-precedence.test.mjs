import { expect, test } from "vitest";

import {
  candidateCustomDomainPrecedenceConfig,
  candidateCustomDomainPrecedenceEvidence,
  candidateCustomDomainPrecedenceExpectation,
  classifyCandidateCustomDomainPrecedence,
  diagnoseCandidateCustomDomainPrecedence,
  inspectCandidateDomainDetail,
  inspectCandidateDomainMapping,
  inspectExactDnsInventory,
  inspectZoneRouteInventory,
  routePatternMatchesFixture,
} from "./diagnose-v2-production-candidate-custom-domain-precedence.mjs";

const domainId = "opaque-domain-id-not-emitted";
const zoneId = "opaque-zone-id-not-emitted";
const certificateId = "opaque-certificate-id-not-emitted";
const accountId = "opaque-account-id-not-emitted";
const token = "opaque-token-not-emitted";
const nonCandidateScript = "opaque-non-candidate-script-not-emitted";
const fixtureHostname =
  candidateCustomDomainPrecedenceExpectation.fixtureHostname;

function environment(overrides = {}) {
  return {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: token,
    CUSTOM_DOMAIN_PRECEDENCE_RELEASE_SHA:
      candidateCustomDomainPrecedenceExpectation.releaseSha,
    CUSTOM_DOMAIN_PRECEDENCE_FIXTURE_HOSTNAME: fixtureHostname,
    ...overrides,
  };
}

function response(result, { status = 200, success = true } = {}) {
  return {
    httpStatus: status,
    success: status >= 200 && status <= 299 && success,
    envelope: { success, result },
  };
}

function networkResponse(result, options = {}) {
  const { status = 200, success = true } = options;
  return new Response(JSON.stringify({ success, result }), { status });
}

function candidateDomain(overrides = {}) {
  return {
    id: domainId,
    cert_id: certificateId,
    hostname: fixtureHostname,
    service: candidateCustomDomainPrecedenceExpectation.routerService,
    zone_id: zoneId,
    zone_name: candidateCustomDomainPrecedenceExpectation.zoneName,
    ...overrides,
  };
}

function completeEvidence(overrides = {}) {
  return {
    mapping: { mapping: "PASS" },
    detail: { detail: "PASS", certificateReference: "PRESENT" },
    zone: { status: "ACTIVE" },
    routes: { inventory: "PASS", precedence: "NONE" },
    dns: {
      inventory: "PASS",
      exactRecords: "ONE",
      allProxied: "YES",
      anyShadowed: "NO",
    },
    ...overrides,
  };
}

test("pins exact RC9 fixture inputs", () => {
  expect(candidateCustomDomainPrecedenceConfig(environment())).toMatchObject({
    releaseSha: candidateCustomDomainPrecedenceExpectation.releaseSha,
    fixtureHostname,
  });
  expect(() =>
    candidateCustomDomainPrecedenceConfig(
      environment({ CUSTOM_DOMAIN_PRECEDENCE_RELEASE_SHA: "not-rc9" }),
    ),
  ).toThrow("INVALID_IMMUTABLE_INPUT");
  expect(() =>
    candidateCustomDomainPrecedenceConfig(
      environment({
        CUSTOM_DOMAIN_PRECEDENCE_FIXTURE_HOSTNAME: "public-production.invalid",
      }),
    ),
  ).toThrow("INVALID_IMMUTABLE_INPUT");
});

test("fails closed before downstream reads when candidate mapping is not exact", async () => {
  const config = candidateCustomDomainPrecedenceConfig(environment());
  const wrongService = inspectCandidateDomainMapping(
    response([candidateDomain({ service: "opaque-wrong-service" })]),
  );
  expect(wrongService).toMatchObject({
    inventory: "PASS",
    mapping: "FAIL",
    exactHostRows: "ONE",
  });
  expect(JSON.stringify(wrongService)).not.toContain("opaque-wrong-service");

  let calls = 0;
  const result = await diagnoseCandidateCustomDomainPrecedence({
    config,
    fetchFn: async () => {
      calls += 1;
      return networkResponse([
        candidateDomain({ service: "opaque-wrong-service" }),
      ]);
    },
  });
  expect(calls).toBe(1);
  expect(result.detail.inventory).toBe("NOT_EVALUATED");
  expect(result.rootCause).toBe("CANDIDATE_CUSTOM_DOMAIN_MAPPING_UNPROVEN");
});

test("treats a missing Custom Domain certificate reference as unproven", () => {
  const detail = inspectCandidateDomainDetail(
    response(candidateDomain({ cert_id: "" })),
    { domainId, zoneId },
  );
  expect(detail).toMatchObject({
    inventory: "PASS",
    detail: "PASS",
    certificateReference: "MISSING",
  });
  expect(
    classifyCandidateCustomDomainPrecedence(completeEvidence({ detail })),
  ).toBe("CANDIDATE_CUSTOM_DOMAIN_CERTIFICATE_UNPROVEN");
});

test("matches only route patterns that can intercept the exact fixture", () => {
  expect(
    routePatternMatchesFixture("*.next.labofscents.org/*", fixtureHostname),
  ).toBe(true);
  expect(
    routePatternMatchesFixture(`${fixtureHostname}/*`, fixtureHostname),
  ).toBe(true);
  expect(
    routePatternMatchesFixture("other.next.labofscents.org/*", fixtureHostname),
  ).toBe(false);
  expect(routePatternMatchesFixture("", fixtureHostname)).toBe(false);
});

test("classifies a noncandidate route or bypass without exposing its pattern or script", () => {
  const nonCandidate = inspectZoneRouteInventory(
    response([
      {
        pattern: `${fixtureHostname}/*`,
        script: nonCandidateScript,
      },
    ]),
  );
  expect(nonCandidate).toMatchObject({
    inventory: "PASS",
    exactSyntheticRouteMatches: "ONE",
    precedence: "SCRIPTED_NON_CANDIDATE",
  });
  expect(
    classifyCandidateCustomDomainPrecedence(
      completeEvidence({ routes: nonCandidate }),
    ),
  ).toBe("ZONE_ROUTE_PRECEDENCE_INTERCEPTS_CANDIDATE_CUSTOM_DOMAIN");

  const bypass = inspectZoneRouteInventory(
    response([{ pattern: `${fixtureHostname}/*`, script: null }]),
  );
  expect(bypass.precedence).toBe("BYPASS");
  expect(
    classifyCandidateCustomDomainPrecedence(
      completeEvidence({ routes: bypass }),
    ),
  ).toBe("ZONE_ROUTE_BYPASS_PRECEDES_CANDIDATE_CUSTOM_DOMAIN");
  expect(JSON.stringify(nonCandidate)).not.toContain(nonCandidateScript);
  expect(JSON.stringify(nonCandidate)).not.toContain(fixtureHostname);
});

test("fails closed on multiple matching routes and reports DNS absence separately", () => {
  const multiple = inspectZoneRouteInventory(
    response([
      { pattern: `${fixtureHostname}/*`, script: nonCandidateScript },
      { pattern: "*.next.labofscents.org/*", script: null },
    ]),
  );
  expect(multiple).toMatchObject({
    exactSyntheticRouteMatches: "MULTIPLE",
    precedence: "AMBIGUOUS",
  });
  expect(
    classifyCandidateCustomDomainPrecedence(
      completeEvidence({ routes: multiple }),
    ),
  ).toBe("ZONE_ROUTE_PRECEDENCE_AMBIGUOUS");

  const absentDns = inspectExactDnsInventory(response([]));
  expect(absentDns).toMatchObject({
    inventory: "PASS",
    exactRecords: "ZERO",
    allProxied: "UNPROVEN",
    anyShadowed: "UNPROVEN",
  });
  expect(
    classifyCandidateCustomDomainPrecedence(
      completeEvidence({ dns: absentDns }),
    ),
  ).toBe("CANDIDATE_MANAGED_DNS_RECORD_ABSENT");
});

test("uses only GET requests and emits only safe precedence evidence", async () => {
  const requests = [];
  const config = candidateCustomDomainPrecedenceConfig(environment());
  const result = await diagnoseCandidateCustomDomainPrecedence({
    config,
    fetchFn: async (request, options) => {
      const url = new URL(request);
      requests.push({
        pathname: url.pathname,
        search: url.search,
        method: options.method,
      });
      if (url.pathname.endsWith("/workers/domains"))
        return networkResponse([candidateDomain()]);
      if (url.pathname.endsWith(`/workers/domains/${domainId}`))
        return networkResponse(candidateDomain());
      if (url.pathname.endsWith(`/zones/${zoneId}`))
        return networkResponse({ status: "active" });
      if (url.pathname.endsWith(`/zones/${zoneId}/workers/routes`))
        return networkResponse([]);
      if (url.pathname.endsWith(`/zones/${zoneId}/dns_records`))
        return networkResponse([
          {
            name: fixtureHostname,
            proxied: true,
            content: "never-emitted",
            meta: { shadowed_by: [] },
          },
        ]);
      throw new Error("unexpected request");
    },
  });

  expect(result.rootCause).toBe(
    "CANDIDATE_CUSTOM_DOMAIN_INGRESS_PLATFORM_INCONSISTENCY",
  );
  expect(requests.map((request) => request.method)).toEqual([
    "GET",
    "GET",
    "GET",
    "GET",
    "GET",
  ]);
  const dnsRequest = requests.find((request) =>
    request.pathname.endsWith("/dns_records"),
  );
  expect(new URLSearchParams(dnsRequest.search).get("name.exact")).toBe(
    fixtureHostname,
  );
  expect(new URLSearchParams(dnsRequest.search).get("per_page")).toBe("20");
  expect(
    new URLSearchParams(dnsRequest.search).get("include_shadow_metadata"),
  ).toBe("true");

  const emitted = JSON.stringify(
    candidateCustomDomainPrecedenceEvidence(result),
  );
  for (const value of [
    domainId,
    zoneId,
    certificateId,
    accountId,
    token,
    nonCandidateScript,
    fixtureHostname,
    "never-emitted",
  ])
    expect(emitted).not.toContain(value);
});

test("fails closed when the exact candidate DNS record is shadowed", () => {
  const shadowedDns = inspectExactDnsInventory(
    response([
      {
        name: fixtureHostname,
        proxied: true,
        meta: { shadowed_by: ["opaque-shadowing-record-id"] },
      },
    ]),
  );

  expect(shadowedDns).toMatchObject({
    inventory: "PASS",
    exactRecords: "ONE",
    allProxied: "YES",
    anyShadowed: "YES",
  });
  expect(
    classifyCandidateCustomDomainPrecedence(
      completeEvidence({ dns: shadowedDns }),
    ),
  ).toBe("CANDIDATE_MANAGED_DNS_RECORD_SHADOWED");
  expect(JSON.stringify(shadowedDns)).not.toContain(
    "opaque-shadowing-record-id",
  );
});

test("reports permission gaps as unproven without changing control-plane state", () => {
  const permissionDenied = inspectExactDnsInventory({
    httpStatus: 403,
    success: false,
    envelope: undefined,
  });
  expect(permissionDenied).toMatchObject({
    inventory: "PERMISSION_UNAVAILABLE",
    exactRecords: "UNPROVEN",
  });
  expect(
    classifyCandidateCustomDomainPrecedence(
      completeEvidence({ dns: permissionDenied }),
    ),
  ).toBe("CANDIDATE_MANAGED_DNS_UNPROVEN_TOKEN_SCOPE");
});
