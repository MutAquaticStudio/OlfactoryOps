export const candidateCustomDomainPrecedenceExpectation = Object.freeze({
  releaseSha: "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  fixtureHostname: "rc9-release-31736285494-469ca8942a.next.labofscents.org",
  routerService: "olfactoryops-v2-tenant-router-production-candidate",
  zoneName: "labofscents.org",
});

const maxIdentifierLength = 512;

function safeFailure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0)
    throw safeFailure("MISSING_REQUIRED_INPUT");
  return value;
}

function exact(value, expected) {
  if (value !== expected) throw safeFailure("INVALID_IMMUTABLE_INPUT");
  return value;
}

function validIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxIdentifierLength &&
    !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
      );
    })
  );
}

function safeHttpStatus(response) {
  const status = response?.status;
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : 0;
}

function endpoint(config, suffix) {
  return new URL(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}${suffix}`,
  );
}

function zoneEndpoint(config, zoneId, suffix) {
  return new URL(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}${suffix}`,
  );
}

function responseAvailability(response) {
  if (response?.httpStatus === 401 || response?.httpStatus === 403)
    return "PERMISSION_UNAVAILABLE";
  return response?.success === true ? "PASS" : "UNAVAILABLE";
}

async function getEnvelope({ config, url, fetchFn = fetch }) {
  try {
    const response = await fetchFn(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: { authorization: `Bearer ${config.apiToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      envelope = undefined;
    }
    return {
      httpStatus: safeHttpStatus(response),
      success: response?.ok === true && envelope?.success === true,
      envelope,
    };
  } catch {
    return { httpStatus: 0, success: false, envelope: undefined };
  }
}

export function candidateCustomDomainPrecedenceConfig(
  environment = process.env,
) {
  return {
    accountId: required(environment, "CLOUDFLARE_ACCOUNT_ID"),
    apiToken: required(environment, "CLOUDFLARE_API_TOKEN"),
    releaseSha: exact(
      required(environment, "CUSTOM_DOMAIN_PRECEDENCE_RELEASE_SHA"),
      candidateCustomDomainPrecedenceExpectation.releaseSha,
    ),
    fixtureHostname: exact(
      required(environment, "CUSTOM_DOMAIN_PRECEDENCE_FIXTURE_HOSTNAME"),
      candidateCustomDomainPrecedenceExpectation.fixtureHostname,
    ),
  };
}

export function inspectCandidateDomainMapping(
  response,
  expectation = candidateCustomDomainPrecedenceExpectation,
) {
  const inventory = responseAvailability(response);
  const domains =
    response?.success === true ? response?.envelope?.result : undefined;
  if (!Array.isArray(domains)) {
    return {
      inventory,
      mapping: "UNPROVEN",
      exactHostRows: "UNPROVEN",
      domainId: undefined,
      zoneId: undefined,
    };
  }

  const exactDomains = domains.filter(
    (domain) => domain?.hostname === expectation.fixtureHostname,
  );
  if (exactDomains.length === 0)
    return {
      inventory: "PASS",
      mapping: "FAIL",
      exactHostRows: "ZERO",
      domainId: undefined,
      zoneId: undefined,
    };
  if (exactDomains.length !== 1)
    return {
      inventory: "PASS",
      mapping: "FAIL",
      exactHostRows: "MULTIPLE",
      domainId: undefined,
      zoneId: undefined,
    };

  const [domain] = exactDomains;
  const validIds =
    validIdentifier(domain?.id) && validIdentifier(domain?.zone_id);
  const exactMapping =
    domain?.service === expectation.routerService &&
    domain?.zone_name === expectation.zoneName &&
    validIds;
  return {
    inventory: "PASS",
    mapping: exactMapping ? "PASS" : "FAIL",
    exactHostRows: "ONE",
    domainId: exactMapping ? domain.id : undefined,
    zoneId: exactMapping ? domain.zone_id : undefined,
  };
}

export function inspectCandidateDomainDetail(
  response,
  { domainId, zoneId },
  expectation = candidateCustomDomainPrecedenceExpectation,
) {
  const inventory = responseAvailability(response);
  const domain =
    response?.success === true ? response?.envelope?.result : undefined;
  if (domain === null || typeof domain !== "object" || Array.isArray(domain))
    return {
      inventory,
      detail: "UNPROVEN",
      certificateReference: "UNPROVEN",
    };

  const exactDetail =
    domain?.id === domainId &&
    domain?.zone_id === zoneId &&
    domain?.hostname === expectation.fixtureHostname &&
    domain?.service === expectation.routerService &&
    domain?.zone_name === expectation.zoneName;
  return {
    inventory: "PASS",
    detail: exactDetail ? "PASS" : "FAIL",
    certificateReference: validIdentifier(domain?.cert_id)
      ? "PRESENT"
      : "MISSING",
  };
}

export function inspectZoneState(response) {
  const inventory = responseAvailability(response);
  const zone =
    response?.success === true ? response?.envelope?.result : undefined;
  if (zone === null || typeof zone !== "object" || Array.isArray(zone))
    return { inventory, status: "UNPROVEN" };
  return {
    inventory: "PASS",
    status: zone?.status === "active" ? "ACTIVE" : "NOT_ACTIVE",
  };
}

function escapeRegularExpression(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function routePatternMatchesFixture(pattern, hostname) {
  if (
    typeof pattern !== "string" ||
    pattern.length === 0 ||
    pattern.length > 512 ||
    typeof hostname !== "string"
  )
    return false;
  const normalizedPattern = pattern
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .toLowerCase();
  const expression = `^${normalizedPattern
    .split("*")
    .map(escapeRegularExpression)
    .join(".*")}$`;
  try {
    const matcher = new RegExp(expression, "i");
    return matcher.test(hostname) || matcher.test(`${hostname}/`);
  } catch {
    return false;
  }
}

export function routePatternHostScope(pattern, hostname) {
  if (!routePatternMatchesFixture(pattern, hostname)) return "UNPROVEN";
  const normalizedPattern = pattern
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .toLowerCase();
  const routeHostname = normalizedPattern.split("/", 1)[0];
  if (routeHostname === hostname.toLowerCase()) return "EXACT_HOST";
  return routeHostname.includes("*") ? "WILDCARD_HOST" : "UNPROVEN";
}

export function inspectZoneRouteInventory(
  response,
  expectation = candidateCustomDomainPrecedenceExpectation,
) {
  const inventory = responseAvailability(response);
  const routes =
    response?.success === true ? response?.envelope?.result : undefined;
  if (!Array.isArray(routes))
    return {
      inventory,
      exactSyntheticRouteMatches: "UNPROVEN",
      precedence: "UNPROVEN",
      hostScope: "UNPROVEN",
    };

  const matchingRoutes = routes.filter((route) =>
    routePatternMatchesFixture(route?.pattern, expectation.fixtureHostname),
  );
  if (matchingRoutes.length === 0)
    return {
      inventory: "PASS",
      exactSyntheticRouteMatches: "ZERO",
      precedence: "NONE",
      hostScope: "NONE",
    };
  if (matchingRoutes.length !== 1) {
    const scopes = matchingRoutes.map((route) =>
      routePatternHostScope(route?.pattern, expectation.fixtureHostname),
    );
    return {
      inventory: "PASS",
      exactSyntheticRouteMatches: "MULTIPLE",
      precedence: "AMBIGUOUS",
      hostScope: scopes.includes("WILDCARD_HOST")
        ? "WILDCARD_HOST"
        : scopes.every((scope) => scope === "EXACT_HOST")
          ? "EXACT_HOST"
          : "UNPROVEN",
    };
  }

  const [route] = matchingRoutes;
  const hostScope = routePatternHostScope(
    route?.pattern,
    expectation.fixtureHostname,
  );
  if (route?.script === null)
    return {
      inventory: "PASS",
      exactSyntheticRouteMatches: "ONE",
      precedence: "BYPASS",
      hostScope,
    };
  if (typeof route?.script === "string" && route.script.length > 0)
    return {
      inventory: "PASS",
      exactSyntheticRouteMatches: "ONE",
      precedence:
        route.script === expectation.routerService
          ? "SCRIPTED_CANDIDATE"
          : "SCRIPTED_NON_CANDIDATE",
      hostScope,
    };
  return {
    inventory: "PASS",
    exactSyntheticRouteMatches: "ONE",
    precedence: "UNPROVEN",
    hostScope,
  };
}

export function inspectExactDnsInventory(
  response,
  expectation = candidateCustomDomainPrecedenceExpectation,
) {
  const inventory = responseAvailability(response);
  const records =
    response?.success === true ? response?.envelope?.result : undefined;
  if (!Array.isArray(records))
    return {
      inventory,
      exactRecords: "UNPROVEN",
      allProxied: "UNPROVEN",
      anyShadowed: "UNPROVEN",
    };

  const exactRecords = records.filter(
    (record) => record?.name === expectation.fixtureHostname,
  );
  if (exactRecords.length === 0)
    return {
      inventory: "PASS",
      exactRecords: "ZERO",
      allProxied: "UNPROVEN",
      anyShadowed: "UNPROVEN",
    };
  const proxyValues = exactRecords.map((record) => record?.proxied);
  const allBoolean = proxyValues.every((value) => typeof value === "boolean");
  const allProxied = !allBoolean
    ? "UNPROVEN"
    : proxyValues.every(Boolean)
      ? "YES"
      : proxyValues.every((value) => !value)
        ? "NO"
        : "MIXED";
  const shadowStates = exactRecords.map((record) => {
    const metadata = record?.meta;
    if (
      metadata === null ||
      typeof metadata !== "object" ||
      Array.isArray(metadata)
    )
      return "UNPROVEN";
    if (!Object.hasOwn(metadata, "shadowed_by")) return "NO";
    if (!Array.isArray(metadata.shadowed_by)) return "UNPROVEN";
    return metadata.shadowed_by.length > 0 ? "YES" : "NO";
  });
  const anyShadowed = shadowStates.includes("YES")
    ? "YES"
    : shadowStates.every((state) => state === "NO")
      ? "NO"
      : "UNPROVEN";
  return {
    inventory: "PASS",
    exactRecords: exactRecords.length === 1 ? "ONE" : "MULTIPLE",
    allProxied,
    anyShadowed,
  };
}

export function classifyCandidateCustomDomainPrecedence({
  mapping,
  detail,
  zone,
  routes,
  dns,
}) {
  if (mapping.mapping !== "PASS")
    return "CANDIDATE_CUSTOM_DOMAIN_MAPPING_UNPROVEN";
  if (detail.detail !== "PASS")
    return "CANDIDATE_CUSTOM_DOMAIN_DETAIL_UNPROVEN";
  if (detail.certificateReference !== "PRESENT")
    return "CANDIDATE_CUSTOM_DOMAIN_CERTIFICATE_UNPROVEN";
  if (zone.status !== "ACTIVE") return "CANDIDATE_ZONE_STATE_UNPROVEN";
  if (routes.inventory === "PERMISSION_UNAVAILABLE")
    return "CANDIDATE_ZONE_ROUTE_PRECEDENCE_UNPROVEN_TOKEN_SCOPE";
  if (routes.precedence === "SCRIPTED_NON_CANDIDATE")
    return "ZONE_ROUTE_PRECEDENCE_INTERCEPTS_CANDIDATE_CUSTOM_DOMAIN";
  if (routes.precedence === "BYPASS")
    return "ZONE_ROUTE_BYPASS_PRECEDES_CANDIDATE_CUSTOM_DOMAIN";
  if (routes.precedence === "AMBIGUOUS")
    return "ZONE_ROUTE_PRECEDENCE_AMBIGUOUS";
  if (
    routes.precedence !== "NONE" &&
    routes.precedence !== "SCRIPTED_CANDIDATE"
  )
    return "CANDIDATE_ZONE_ROUTE_PRECEDENCE_UNPROVEN";
  if (dns.inventory === "PERMISSION_UNAVAILABLE")
    return "CANDIDATE_MANAGED_DNS_UNPROVEN_TOKEN_SCOPE";
  if (dns.exactRecords === "ZERO") return "CANDIDATE_MANAGED_DNS_RECORD_ABSENT";
  if (dns.anyShadowed === "YES") return "CANDIDATE_MANAGED_DNS_RECORD_SHADOWED";
  if (dns.exactRecords !== "ONE" || dns.allProxied !== "YES")
    return "CANDIDATE_MANAGED_DNS_RECORD_DISCREPANCY";
  if (dns.anyShadowed !== "NO")
    return "CANDIDATE_MANAGED_DNS_METADATA_UNPROVEN";
  return "CANDIDATE_CUSTOM_DOMAIN_INGRESS_PLATFORM_INCONSISTENCY";
}

export async function diagnoseCandidateCustomDomainPrecedence({
  config,
  fetchFn = fetch,
}) {
  const domainListUrl = endpoint(config, "/workers/domains");
  domainListUrl.searchParams.set("hostname", config.fixtureHostname);
  const domainListResponse = await getEnvelope({
    config,
    url: domainListUrl,
    fetchFn,
  });
  const mapping = inspectCandidateDomainMapping(domainListResponse);
  const notEvaluatedDetail = {
    inventory: "NOT_EVALUATED",
    detail: "UNPROVEN",
    certificateReference: "UNPROVEN",
  };
  const notEvaluatedZone = { inventory: "NOT_EVALUATED", status: "UNPROVEN" };
  const notEvaluatedRoutes = {
    inventory: "NOT_EVALUATED",
    exactSyntheticRouteMatches: "UNPROVEN",
    precedence: "UNPROVEN",
    hostScope: "UNPROVEN",
  };
  const notEvaluatedDns = {
    inventory: "NOT_EVALUATED",
    exactRecords: "UNPROVEN",
    allProxied: "UNPROVEN",
    anyShadowed: "UNPROVEN",
  };
  if (mapping.mapping !== "PASS") {
    return {
      mapping,
      detail: notEvaluatedDetail,
      zone: notEvaluatedZone,
      routes: notEvaluatedRoutes,
      dns: notEvaluatedDns,
      rootCause: classifyCandidateCustomDomainPrecedence({
        mapping,
        detail: notEvaluatedDetail,
        zone: notEvaluatedZone,
        routes: notEvaluatedRoutes,
        dns: notEvaluatedDns,
      }),
    };
  }

  const domainDetailResponse = await getEnvelope({
    config,
    url: endpoint(
      config,
      `/workers/domains/${encodeURIComponent(mapping.domainId)}`,
    ),
    fetchFn,
  });
  const detail = inspectCandidateDomainDetail(domainDetailResponse, mapping);
  if (detail.detail !== "PASS") {
    return {
      mapping,
      detail,
      zone: notEvaluatedZone,
      routes: notEvaluatedRoutes,
      dns: notEvaluatedDns,
      rootCause: classifyCandidateCustomDomainPrecedence({
        mapping,
        detail,
        zone: notEvaluatedZone,
        routes: notEvaluatedRoutes,
        dns: notEvaluatedDns,
      }),
    };
  }

  const dnsUrl = zoneEndpoint(config, mapping.zoneId, "/dns_records");
  dnsUrl.searchParams.set("name.exact", config.fixtureHostname);
  dnsUrl.searchParams.set("per_page", "20");
  dnsUrl.searchParams.set("include_shadow_metadata", "true");
  const [zoneResponse, routesResponse, dnsResponse] = await Promise.all([
    getEnvelope({
      config,
      url: zoneEndpoint(config, mapping.zoneId, ""),
      fetchFn,
    }),
    getEnvelope({
      config,
      url: zoneEndpoint(config, mapping.zoneId, "/workers/routes"),
      fetchFn,
    }),
    getEnvelope({
      config,
      url: dnsUrl,
      fetchFn,
    }),
  ]);
  const zone = inspectZoneState(zoneResponse);
  const routes = inspectZoneRouteInventory(routesResponse);
  const dns = inspectExactDnsInventory(dnsResponse);
  return {
    mapping,
    detail,
    zone,
    routes,
    dns,
    rootCause: classifyCandidateCustomDomainPrecedence({
      mapping,
      detail,
      zone,
      routes,
      dns,
    }),
  };
}

function print(name, value) {
  const safeValue =
    typeof value === "string" && /^[A-Z0-9_]+$/.test(value)
      ? value
      : "UNPROVEN";
  console.log(`${name}=${safeValue}`);
}

export function candidateCustomDomainPrecedenceEvidence(result) {
  return {
    CUSTOM_DOMAIN_PRECEDENCE_DOMAIN_LIST: result.mapping.inventory,
    CUSTOM_DOMAIN_PRECEDENCE_MAPPING: result.mapping.mapping,
    CUSTOM_DOMAIN_PRECEDENCE_EXACT_HOST_ROWS: result.mapping.exactHostRows,
    CUSTOM_DOMAIN_PRECEDENCE_DETAIL: result.detail.detail,
    CUSTOM_DOMAIN_CERTIFICATE_REFERENCE: result.detail.certificateReference,
    CANDIDATE_ZONE_INVENTORY: result.zone.inventory,
    CANDIDATE_ZONE_STATUS: result.zone.status,
    ZONE_ROUTE_INVENTORY: result.routes.inventory,
    EXACT_SYNTHETIC_ROUTE_MATCHES: result.routes.exactSyntheticRouteMatches,
    ZONE_ROUTE_PRECEDENCE: result.routes.precedence,
    ZONE_ROUTE_HOST_SCOPE: result.routes.hostScope,
    EXACT_DNS_INVENTORY: result.dns.inventory,
    EXACT_DNS_RECORDS: result.dns.exactRecords,
    EXACT_DNS_ALL_PROXIED: result.dns.allProxied,
    EXACT_DNS_ANY_SHADOWED: result.dns.anyShadowed,
    ROOT_CAUSE: result.rootCause,
    CUSTOM_DOMAIN_PRECEDENCE_DIAGNOSTIC_EXECUTION: "PASS",
  };
}

function printEvidence(result) {
  for (const [name, value] of Object.entries(
    candidateCustomDomainPrecedenceEvidence(result),
  ))
    print(name, value);
}

if (import.meta.main) {
  try {
    const result = await diagnoseCandidateCustomDomainPrecedence({
      config: candidateCustomDomainPrecedenceConfig(),
    });
    printEvidence(result);
  } catch {
    print("ROOT_CAUSE", "CANDIDATE_CUSTOM_DOMAIN_PRECEDENCE_UNAVAILABLE");
    print("CUSTOM_DOMAIN_PRECEDENCE_DIAGNOSTIC_EXECUTION", "FAIL");
    process.exitCode = 1;
  }
}
