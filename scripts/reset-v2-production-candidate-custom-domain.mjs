import { appendFileSync } from "node:fs";

export const candidateDomainResetExpectation = Object.freeze({
  releaseSha: "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  fixtureHostname: "rc9-release-31736285494-469ca8942a.next.labofscents.org",
  routerService: "olfactoryops-v2-tenant-router-production-candidate",
  zoneName: "labofscents.org",
});

const domainIdPattern =
  /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const maxWaitAttempts = 8;
const waitMilliseconds = 5_000;

function safeFailure(classification) {
  return new Error(classification);
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

function validDomainId(value) {
  return typeof value === "string" && domainIdPattern.test(value);
}

export function candidateDomainResetConfig(environment = process.env) {
  return {
    accountId: required(environment, "CLOUDFLARE_ACCOUNT_ID"),
    apiToken: required(environment, "CLOUDFLARE_API_TOKEN"),
    releaseSha: exact(
      required(environment, "CANDIDATE_DOMAIN_RESET_RELEASE_SHA"),
      candidateDomainResetExpectation.releaseSha,
    ),
    fixtureHostname: exact(
      required(environment, "CANDIDATE_DOMAIN_RESET_FIXTURE_HOSTNAME"),
      candidateDomainResetExpectation.fixtureHostname,
    ),
  };
}

function authorizationHeaders(config, extra = {}) {
  return {
    authorization: `Bearer ${config.apiToken}`,
    ...extra,
  };
}

function controlPlaneEndpoint(config, suffix = "") {
  return new URL(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/workers/domains${suffix}`,
  );
}

function safeHttpStatus(response) {
  return response && Number.isInteger(response.status) ? response.status : 0;
}

async function controlPlaneRequest({
  config,
  fetchFn = fetch,
  method,
  suffix = "",
  body,
}) {
  try {
    const response = await fetchFn(controlPlaneEndpoint(config, suffix), {
      method,
      redirect: "manual",
      credentials: "omit",
      headers: authorizationHeaders(
        config,
        body === undefined ? {} : { "content-type": "application/json" },
      ),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

export function inspectCandidateDomainList(
  envelope,
  expectation = candidateDomainResetExpectation,
) {
  const domains = envelope?.success === true ? envelope?.result : undefined;
  if (!Array.isArray(domains))
    return {
      listRead: false,
      attachment: "UNAVAILABLE",
      domainId: undefined,
    };

  const exactDomains = domains.filter(
    (domain) => domain?.hostname === expectation.fixtureHostname,
  );
  if (exactDomains.length === 0)
    return { listRead: true, attachment: "ABSENT", domainId: undefined };
  if (exactDomains.length !== 1)
    return { listRead: true, attachment: "AMBIGUOUS", domainId: undefined };

  const [domain] = exactDomains;
  if (
    domain?.service !== expectation.routerService ||
    domain?.zone_name !== expectation.zoneName
  )
    return {
      listRead: true,
      attachment: "OTHER_SERVICE",
      domainId: undefined,
    };
  if (!validDomainId(domain?.id) || !validDomainId(domain?.zone_id))
    return {
      listRead: true,
      attachment: "INVALID",
      domainId: undefined,
      zoneId: undefined,
    };
  return {
    listRead: true,
    attachment: "CANDIDATE_ROUTER",
    domainId: domain.id.toLowerCase(),
    zoneId: domain.zone_id.toLowerCase(),
  };
}

function attachResponseMatches(envelope, expectation, zoneId) {
  const domain = envelope?.success === true ? envelope?.result : undefined;
  return (
    validDomainId(domain?.id) &&
    domain?.hostname === expectation.fixtureHostname &&
    domain?.service === expectation.routerService &&
    domain?.zone_name === expectation.zoneName &&
    domain?.zone_id?.toLowerCase() === zoneId.toLowerCase()
  );
}

export async function readCandidateDomain({ config, fetchFn = fetch }) {
  const endpoint = controlPlaneEndpoint(config);
  endpoint.searchParams.set("hostname", config.fixtureHostname);
  const response = await controlPlaneRequest({
    config,
    fetchFn,
    method: "GET",
    suffix: `?${endpoint.searchParams.toString()}`,
  });
  return {
    response,
    state: inspectCandidateDomainList(response.envelope),
  };
}

function requireCandidateAttachment(state) {
  if (!state.listRead)
    throw safeFailure("CUSTOM_DOMAIN_CONTROL_PLANE_UNAVAILABLE");
  if (state.attachment !== "CANDIDATE_ROUTER")
    throw safeFailure("CUSTOM_DOMAIN_OWNERSHIP_MISMATCH");
  return state.domainId;
}

function requireCandidateAbsence(state) {
  if (!state.listRead)
    throw safeFailure("CUSTOM_DOMAIN_CONTROL_PLANE_UNAVAILABLE");
  if (state.attachment !== "ABSENT")
    throw safeFailure("CUSTOM_DOMAIN_DETACHMENT_UNCONFIRMED");
}

export async function detachCandidateDomain({
  config,
  expectedDomainId,
  fetchFn = fetch,
}) {
  if (!validDomainId(expectedDomainId))
    throw safeFailure("INVALID_CUSTOM_DOMAIN_ID");
  const current = await readCandidateDomain({ config, fetchFn });
  const domainId = requireCandidateAttachment(current.state);
  if (domainId !== expectedDomainId.toLowerCase())
    throw safeFailure("CUSTOM_DOMAIN_OWNERSHIP_CHANGED");
  const response = await controlPlaneRequest({
    config,
    fetchFn,
    method: "DELETE",
    suffix: `/${encodeURIComponent(domainId)}`,
  });
  if (!response.success) throw safeFailure("CUSTOM_DOMAIN_DETACH_FAILED");
  return { detached: true };
}

export async function attachCandidateDomain({
  config,
  zoneId,
  fetchFn = fetch,
}) {
  if (!validDomainId(zoneId))
    throw safeFailure("INVALID_CUSTOM_DOMAIN_ZONE_ID");
  const current = await readCandidateDomain({ config, fetchFn });
  requireCandidateAbsence(current.state);
  const response = await controlPlaneRequest({
    config,
    fetchFn,
    method: "PUT",
    body: {
      hostname: candidateDomainResetExpectation.fixtureHostname,
      service: candidateDomainResetExpectation.routerService,
      zone_id: zoneId,
      zone_name: candidateDomainResetExpectation.zoneName,
    },
  });
  if (
    !response.success ||
    !attachResponseMatches(
      response.envelope,
      candidateDomainResetExpectation,
      zoneId,
    )
  )
    throw safeFailure("CUSTOM_DOMAIN_ATTACH_FAILED");
  return { attached: true };
}

export async function waitForCandidateDomain({
  config,
  desiredAttachment,
  fetchFn = fetch,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxAttempts = maxWaitAttempts,
  intervalMilliseconds = waitMilliseconds,
}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1)
    throw safeFailure("INVALID_WAIT_BOUND");
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = await readCandidateDomain({ config, fetchFn });
    if (current.state.attachment === desiredAttachment)
      return { attempts: attempt, state: current.state };
    if (attempt < maxAttempts) await sleep(intervalMilliseconds);
  }
  throw safeFailure(
    desiredAttachment === "ABSENT"
      ? "CUSTOM_DOMAIN_DETACHMENT_UNCONFIRMED"
      : "CUSTOM_DOMAIN_ATTACHMENT_UNCONFIRMED",
  );
}

export async function restoreCandidateDomain({
  config,
  zoneId,
  fetchFn = fetch,
  sleep,
}) {
  const current = await readCandidateDomain({ config, fetchFn });
  if (current.state.attachment === "CANDIDATE_ROUTER")
    return { restoration: "ALREADY_ATTACHED" };
  requireCandidateAbsence(current.state);
  await attachCandidateDomain({ config, zoneId, fetchFn });
  await waitForCandidateDomain({
    config,
    desiredAttachment: "CANDIDATE_ROUTER",
    fetchFn,
    sleep,
  });
  return { restoration: "RESTORED" };
}

function writeOutput(name, value) {
  const output = process.env.GITHUB_OUTPUT;
  if (typeof output === "string" && output.length > 0)
    appendFileSync(output, `${name}=${value}\n`, { encoding: "utf8" });
}

function print(name, value) {
  console.log(`${name}=${value}`);
}

function reportFailure(mode) {
  const names = {
    preflight: "CANDIDATE_CUSTOM_DOMAIN_RESET_PREFLIGHT",
    detach: "CANDIDATE_CUSTOM_DOMAIN_DETACH",
    "wait-detached": "CANDIDATE_CUSTOM_DOMAIN_DETACH_CONFIRMATION",
    reattach: "CANDIDATE_CUSTOM_DOMAIN_REATTACH",
    "wait-attached": "CANDIDATE_CUSTOM_DOMAIN_ATTACHMENT_CONFIRMATION",
    restore: "CANDIDATE_CUSTOM_DOMAIN_RESTORATION",
    postflight: "CANDIDATE_CUSTOM_DOMAIN_POSTFLIGHT",
  };
  print(names[mode] ?? "CANDIDATE_CUSTOM_DOMAIN_RESET", "FAIL");
}

async function main() {
  const mode = process.argv[2];
  const config = candidateDomainResetConfig();
  if (mode === "preflight") {
    const { state } = await readCandidateDomain({ config });
    const domainId = requireCandidateAttachment(state);
    writeOutput("domain_id", domainId);
    writeOutput("zone_id", state.zoneId);
    print("CANDIDATE_CUSTOM_DOMAIN_OWNERSHIP", "PASS");
    print("CANDIDATE_CUSTOM_DOMAIN_EXACT_ONLY", "PASS");
    print("CANDIDATE_CUSTOM_DOMAIN_RESET_PREFLIGHT", "PASS");
    return;
  }
  if (mode === "detach") {
    await detachCandidateDomain({
      config,
      expectedDomainId: required(
        process.env,
        "CANDIDATE_DOMAIN_RESET_DOMAIN_ID",
      ),
    });
    writeOutput("detached", "YES");
    print("CANDIDATE_CUSTOM_DOMAIN_DETACH", "PASS");
    return;
  }
  if (mode === "wait-detached") {
    await waitForCandidateDomain({ config, desiredAttachment: "ABSENT" });
    print("CANDIDATE_CUSTOM_DOMAIN_DETACH_CONFIRMATION", "PASS");
    return;
  }
  if (mode === "reattach") {
    await attachCandidateDomain({
      config,
      zoneId: required(process.env, "CANDIDATE_DOMAIN_RESET_ZONE_ID"),
    });
    writeOutput("attached", "YES");
    print("CANDIDATE_CUSTOM_DOMAIN_REATTACH", "PASS");
    return;
  }
  if (mode === "wait-attached") {
    await waitForCandidateDomain({
      config,
      desiredAttachment: "CANDIDATE_ROUTER",
    });
    print("CANDIDATE_CUSTOM_DOMAIN_ATTACHMENT_CONFIRMATION", "PASS");
    return;
  }
  if (mode === "restore") {
    const result = await restoreCandidateDomain({
      config,
      zoneId: required(process.env, "CANDIDATE_DOMAIN_RESET_ZONE_ID"),
    });
    print("CANDIDATE_CUSTOM_DOMAIN_RESTORATION", result.restoration);
    return;
  }
  if (mode === "postflight") {
    const { state } = await readCandidateDomain({ config });
    print("CANDIDATE_CUSTOM_DOMAIN_POSTFLIGHT_ATTACHMENT", state.attachment);
    print(
      "CANDIDATE_CUSTOM_DOMAIN_POSTFLIGHT",
      state.listRead ? "CAPTURED" : "UNAVAILABLE",
    );
    if (!state.listRead) process.exitCode = 1;
    return;
  }
  throw safeFailure("INVALID_CUSTOM_DOMAIN_RESET_MODE");
}

if (import.meta.main)
  main().catch(() => {
    reportFailure(process.argv[2]);
    process.exitCode = 1;
  });
