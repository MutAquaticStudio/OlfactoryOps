import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

export const candidateDomainResetExpectation = Object.freeze({
  releaseSha: "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  fixtureHostname: "rc9-release-31736285494-469ca8942a.next.labofscents.org",
  routerService: "olfactoryops-v2-tenant-router-production-candidate",
  zoneName: "labofscents.org",
});

const maxWaitAttempts = 8;
const waitMilliseconds = 5_000;
const maxControlPlaneIdLength = 512;
const domainIdentifierFile = "candidate-domain-id";
const zoneIdentifierFile = "candidate-zone-id";

function safeFailure(classification) {
  const error = new Error(classification);
  error.code = classification;
  return error;
}

function safeFailureCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code
    : "UNCLASSIFIED";
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

function validControlPlaneId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxControlPlaneIdLength &&
    !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
      );
    })
  );
}

function identifierState(value) {
  return validControlPlaneId(value) ? "PRESENT" : "MISSING_OR_UNSUPPORTED";
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
  const status = response?.status;
  return Number.isInteger(status) &&
    (status === 0 || (status >= 100 && status <= 599))
    ? status
    : 0;
}

function safeCloudflareErrorCode(envelope) {
  const errors = Array.isArray(envelope?.errors) ? envelope.errors : [];
  const errorCode = errors.find(
    (error) =>
      Number.isSafeInteger(error?.code) &&
      error.code >= 1_000 &&
      error.code <= 999_999,
  )?.code;
  return errorCode === undefined ? "NONE" : String(errorCode);
}

function envelopeSuccessState(envelope, jsonState) {
  if (jsonState !== "PARSED") return "BODY_UNPARSEABLE";
  if (
    envelope === null ||
    typeof envelope !== "object" ||
    Array.isArray(envelope)
  )
    return "SUCCESS_INVALID";
  if (!Object.hasOwn(envelope, "success")) return "SUCCESS_MISSING";
  if (envelope?.success === true) return "SUCCESS_TRUE";
  if (envelope?.success === false) return "SUCCESS_FALSE";
  return "SUCCESS_INVALID";
}

function classifyDetachResponse(response) {
  if (
    response?.success === true &&
    response?.envelopeSuccessState === "SUCCESS_TRUE"
  )
    return "SUCCESS_ENVELOPE";
  if (response?.envelopeSuccessState === "SUCCESS_FALSE")
    return "EXPLICIT_FAILURE";
  if (
    response?.httpStatus >= 200 &&
    response.httpStatus <= 299 &&
    response?.cfErrorCode === "NONE" &&
    ["SUCCESS_MISSING", "BODY_UNPARSEABLE"].includes(
      response?.envelopeSuccessState,
    )
  )
    return "HTTP_ACKNOWLEDGED_UNCONFIRMED";
  return "UNACKNOWLEDGED_FAILURE";
}

function safeDetachResponseClass(value) {
  if (value?.detachAttempted !== true) return "NOT_ATTEMPTED";
  return [
    "SUCCESS_ENVELOPE",
    "HTTP_ACKNOWLEDGED_UNCONFIRMED",
    "EXPLICIT_FAILURE",
    "UNACKNOWLEDGED_FAILURE",
  ].includes(value.detachResponseClass)
    ? value.detachResponseClass
    : "UNACKNOWLEDGED_FAILURE";
}

export function candidateDomainDetachEvidence(value) {
  if (value?.detachAttempted !== true)
    return {
      httpStatus: "NOT_ATTEMPTED",
      cloudflareErrorCode: "NOT_ATTEMPTED",
      responseClass: "NOT_ATTEMPTED",
      confirmationRequired: "NO",
    };
  const responseClass = safeDetachResponseClass(value);
  return {
    httpStatus: String(safeHttpStatus({ status: value.httpStatus })),
    cloudflareErrorCode:
      typeof value.cloudflareErrorCode === "string" &&
      /^(?:NONE|[1-9][0-9]{3,5})$/.test(value.cloudflareErrorCode)
        ? value.cloudflareErrorCode
        : "NONE",
    responseClass,
    confirmationRequired:
      responseClass === "HTTP_ACKNOWLEDGED_UNCONFIRMED" ? "YES" : "NO",
  };
}

function safeControlPlaneFailure(classification, response) {
  const error = safeFailure(classification);
  error.detachAttempted = true;
  error.httpStatus = safeHttpStatus({ status: response?.httpStatus });
  error.cloudflareErrorCode =
    typeof response?.cfErrorCode === "string" ? response.cfErrorCode : "NONE";
  error.detachResponseClass = classifyDetachResponse(response);
  return error;
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
    let jsonState = "BODY_UNPARSEABLE";
    try {
      envelope = await response.json();
      jsonState = "PARSED";
    } catch {
      envelope = undefined;
    }
    return {
      httpStatus: safeHttpStatus(response),
      success: response?.ok === true && envelope?.success === true,
      cfErrorCode: safeCloudflareErrorCode(envelope),
      envelopeSuccessState: envelopeSuccessState(envelope, jsonState),
      envelope,
    };
  } catch {
    return {
      httpStatus: 0,
      success: false,
      cfErrorCode: "NONE",
      envelopeSuccessState: "TRANSPORT_FAILURE",
      envelope: undefined,
    };
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
      zoneId: undefined,
      exactHostRows: "UNPROVEN",
      serviceMatch: "UNPROVEN",
      zoneMatch: "UNPROVEN",
      domainIdState: "UNPROVEN",
      zoneIdState: "UNPROVEN",
    };

  const exactDomains = domains.filter(
    (domain) => domain?.hostname === expectation.fixtureHostname,
  );
  if (exactDomains.length === 0)
    return {
      listRead: true,
      attachment: "ABSENT",
      domainId: undefined,
      zoneId: undefined,
      exactHostRows: "ZERO",
      serviceMatch: "UNKNOWN",
      zoneMatch: "UNKNOWN",
      domainIdState: "UNKNOWN",
      zoneIdState: "UNKNOWN",
    };
  if (exactDomains.length !== 1)
    return {
      listRead: true,
      attachment: "AMBIGUOUS",
      domainId: undefined,
      zoneId: undefined,
      exactHostRows: "MULTIPLE",
      serviceMatch: "UNKNOWN",
      zoneMatch: "UNKNOWN",
      domainIdState: "UNKNOWN",
      zoneIdState: "UNKNOWN",
    };

  const [domain] = exactDomains;
  const serviceMatch =
    domain?.service === expectation.routerService ? "PASS" : "FAIL";
  const zoneMatch =
    domain?.zone_name === expectation.zoneName ? "PASS" : "FAIL";
  const domainIdState = identifierState(domain?.id);
  const zoneIdState = identifierState(domain?.zone_id);
  if (serviceMatch !== "PASS" || zoneMatch !== "PASS")
    return {
      listRead: true,
      attachment: "OTHER_SERVICE",
      domainId: undefined,
      zoneId: undefined,
      exactHostRows: "ONE",
      serviceMatch,
      zoneMatch,
      domainIdState,
      zoneIdState,
    };
  if (domainIdState !== "PRESENT" || zoneIdState !== "PRESENT")
    return {
      listRead: true,
      attachment: "INVALID",
      domainId: undefined,
      zoneId: undefined,
      exactHostRows: "ONE",
      serviceMatch,
      zoneMatch,
      domainIdState,
      zoneIdState,
    };
  return {
    listRead: true,
    attachment: "CANDIDATE_ROUTER",
    domainId: domain.id,
    zoneId: domain.zone_id,
    exactHostRows: "ONE",
    serviceMatch,
    zoneMatch,
    domainIdState,
    zoneIdState,
  };
}

function attachResponseMatches(envelope, expectation, zoneId) {
  const domain = envelope?.success === true ? envelope?.result : undefined;
  return (
    validControlPlaneId(domain?.id) &&
    domain?.hostname === expectation.fixtureHostname &&
    domain?.service === expectation.routerService &&
    domain?.zone_name === expectation.zoneName &&
    domain?.zone_id === zoneId
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

function resetEvidenceDirectory(environment = process.env) {
  const resetDirectory = required(environment, "CANDIDATE_DOMAIN_RESET_DIR");
  const runnerTemp = required(environment, "RUNNER_TEMP");
  const runId = required(environment, "GITHUB_RUN_ID");
  const resolvedDirectory = resolve(resetDirectory);
  const resolvedRunnerTemp = resolve(runnerTemp);
  const relativeDirectory = relative(resolvedRunnerTemp, resolvedDirectory);
  const expectedName = `oo-v2-candidate-domain-reset-${runId}`;
  if (
    basename(resolvedDirectory) !== expectedName ||
    relativeDirectory.length === 0 ||
    isAbsolute(relativeDirectory) ||
    relativeDirectory === ".." ||
    relativeDirectory.startsWith(`..${sep}`) ||
    !existsSync(resolvedDirectory)
  )
    throw safeFailure("INVALID_RESET_EVIDENCE_DIRECTORY");
  const metadata = lstatSync(resolvedDirectory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw safeFailure("INVALID_RESET_EVIDENCE_DIRECTORY");
  return resolvedDirectory;
}

function privateIdentifierPath(name, environment = process.env) {
  return resolve(resetEvidenceDirectory(environment), name);
}

function writePrivateIdentifier(name, value, environment = process.env) {
  if (!validControlPlaneId(value))
    throw safeFailure("INVALID_CONTROL_PLANE_IDENTIFIER");
  const filePath = privateIdentifierPath(name, environment);
  writeFileSync(filePath, value, { encoding: "utf8", mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function readPrivateIdentifier(name, environment = process.env) {
  const filePath = privateIdentifierPath(name, environment);
  let value;
  try {
    value = readFileSync(filePath, "utf8");
  } catch {
    throw safeFailure("MISSING_PREFLIGHT_IDENTIFIER");
  }
  if (!validControlPlaneId(value))
    throw safeFailure("INVALID_PREFLIGHT_IDENTIFIER");
  return value;
}

function writePreflightIdentifiers(state, environment = process.env) {
  writePrivateIdentifier(domainIdentifierFile, state.domainId, environment);
  writePrivateIdentifier(zoneIdentifierFile, state.zoneId, environment);
}

function readPreflightIdentifiers(environment = process.env) {
  return {
    domainId: readPrivateIdentifier(domainIdentifierFile, environment),
    zoneId: readPrivateIdentifier(zoneIdentifierFile, environment),
  };
}

function preflightClass(state) {
  const classes = {
    CANDIDATE_ROUTER: "EXACT_CANDIDATE_ROUTER",
    INVALID: "IDENTIFIER_MISSING_OR_UNSUPPORTED",
    ABSENT: "EXACT_HOST_ABSENT",
    AMBIGUOUS: "EXACT_HOST_MULTIPLE",
    OTHER_SERVICE: "OWNERSHIP_MISMATCH",
    UNAVAILABLE: "CONTROL_PLANE_UNAVAILABLE",
  };
  return classes[state.attachment] ?? "UNCLASSIFIED";
}

export function candidateDomainPreflightEvidence(state) {
  return {
    apiRead: state.listRead ? "PASS" : "FAIL",
    exactHostRows: state.exactHostRows,
    serviceMatch: state.serviceMatch,
    zoneMatch: state.zoneMatch,
    domainId: state.domainIdState,
    zoneId: state.zoneIdState,
    classification: preflightClass(state),
  };
}

function emitPreflightEvidence(state) {
  const evidence = candidateDomainPreflightEvidence(state);
  print("CANDIDATE_CUSTOM_DOMAIN_PREFLIGHT_API_READ", evidence.apiRead);
  print(
    "CANDIDATE_CUSTOM_DOMAIN_PREFLIGHT_EXACT_HOST_ROWS",
    evidence.exactHostRows,
  );
  print(
    "CANDIDATE_CUSTOM_DOMAIN_PREFLIGHT_SERVICE_MATCH",
    evidence.serviceMatch,
  );
  print("CANDIDATE_CUSTOM_DOMAIN_PREFLIGHT_ZONE_MATCH", evidence.zoneMatch);
  print("CANDIDATE_CUSTOM_DOMAIN_PREFLIGHT_DOMAIN_ID", evidence.domainId);
  print("CANDIDATE_CUSTOM_DOMAIN_PREFLIGHT_ZONE_ID", evidence.zoneId);
  print("CANDIDATE_CUSTOM_DOMAIN_PREFLIGHT_CLASS", evidence.classification);
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
  expectedZoneId,
  fetchFn = fetch,
}) {
  if (!validControlPlaneId(expectedDomainId))
    throw safeFailure("INVALID_CUSTOM_DOMAIN_ID");
  if (!validControlPlaneId(expectedZoneId))
    throw safeFailure("INVALID_CUSTOM_DOMAIN_ZONE_ID");
  const current = await readCandidateDomain({ config, fetchFn });
  const domainId = requireCandidateAttachment(current.state);
  if (domainId !== expectedDomainId || current.state.zoneId !== expectedZoneId)
    throw safeFailure("CUSTOM_DOMAIN_OWNERSHIP_CHANGED");
  const response = await controlPlaneRequest({
    config,
    fetchFn,
    method: "DELETE",
    suffix: `/${encodeURIComponent(domainId)}`,
  });
  const detachResponseClass = classifyDetachResponse(response);
  if (
    detachResponseClass !== "SUCCESS_ENVELOPE" &&
    detachResponseClass !== "HTTP_ACKNOWLEDGED_UNCONFIRMED"
  )
    throw safeControlPlaneFailure("CUSTOM_DOMAIN_DETACH_FAILED", response);
  return {
    detached: detachResponseClass === "SUCCESS_ENVELOPE",
    detachAttempted: true,
    detachResponseClass,
    httpStatus: response.httpStatus,
    cloudflareErrorCode: response.cfErrorCode,
  };
}

export async function attachCandidateDomain({
  config,
  zoneId,
  fetchFn = fetch,
}) {
  if (!validControlPlaneId(zoneId))
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

function print(name, value) {
  console.log(`${name}=${value}`);
}

function reportFailure(mode, error) {
  const names = {
    preflight: "CANDIDATE_CUSTOM_DOMAIN_RESET_PREFLIGHT",
    detach: "CANDIDATE_CUSTOM_DOMAIN_DETACH",
    "wait-detached": "CANDIDATE_CUSTOM_DOMAIN_DETACH_CONFIRMATION",
    reattach: "CANDIDATE_CUSTOM_DOMAIN_REATTACH",
    "wait-attached": "CANDIDATE_CUSTOM_DOMAIN_ATTACHMENT_CONFIRMATION",
    restore: "CANDIDATE_CUSTOM_DOMAIN_RESTORATION",
    postflight: "CANDIDATE_CUSTOM_DOMAIN_POSTFLIGHT",
  };
  if (mode === "detach") {
    const evidence = candidateDomainDetachEvidence(error);
    print("CANDIDATE_CUSTOM_DOMAIN_DETACH_HTTP_STATUS", evidence.httpStatus);
    print(
      "CANDIDATE_CUSTOM_DOMAIN_DETACH_CF_ERROR_CODE",
      evidence.cloudflareErrorCode,
    );
    print(
      "CANDIDATE_CUSTOM_DOMAIN_DETACH_RESPONSE_CLASS",
      evidence.responseClass,
    );
    print(
      "CANDIDATE_CUSTOM_DOMAIN_DETACH_CONFIRMATION_REQUIRED",
      evidence.confirmationRequired,
    );
  }
  print("CANDIDATE_CUSTOM_DOMAIN_RESET_FAILURE_CLASS", safeFailureCode(error));
  print(names[mode] ?? "CANDIDATE_CUSTOM_DOMAIN_RESET", "FAIL");
}

async function main() {
  const mode = process.argv[2];
  const config = candidateDomainResetConfig();
  if (mode === "preflight") {
    const { state } = await readCandidateDomain({ config });
    emitPreflightEvidence(state);
    const domainId = requireCandidateAttachment(state);
    writePreflightIdentifiers({ domainId, zoneId: state.zoneId });
    print("CANDIDATE_CUSTOM_DOMAIN_OWNERSHIP", "PASS");
    print("CANDIDATE_CUSTOM_DOMAIN_EXACT_ONLY", "PASS");
    print("CANDIDATE_CUSTOM_DOMAIN_RESET_PREFLIGHT", "PASS");
    return;
  }
  if (mode === "detach") {
    const { domainId, zoneId } = readPreflightIdentifiers();
    const result = await detachCandidateDomain({
      config,
      expectedDomainId: domainId,
      expectedZoneId: zoneId,
    });
    const evidence = candidateDomainDetachEvidence(result);
    print("CANDIDATE_CUSTOM_DOMAIN_DETACH_HTTP_STATUS", evidence.httpStatus);
    print(
      "CANDIDATE_CUSTOM_DOMAIN_DETACH_CF_ERROR_CODE",
      evidence.cloudflareErrorCode,
    );
    print(
      "CANDIDATE_CUSTOM_DOMAIN_DETACH_RESPONSE_CLASS",
      evidence.responseClass,
    );
    print(
      "CANDIDATE_CUSTOM_DOMAIN_DETACH_CONFIRMATION_REQUIRED",
      evidence.confirmationRequired,
    );
    print(
      "CANDIDATE_CUSTOM_DOMAIN_DETACH",
      evidence.responseClass === "SUCCESS_ENVELOPE"
        ? "PASS"
        : "ACKNOWLEDGED_UNCONFIRMED",
    );
    return;
  }
  if (mode === "wait-detached") {
    await waitForCandidateDomain({ config, desiredAttachment: "ABSENT" });
    print("CANDIDATE_CUSTOM_DOMAIN_DETACH_CONFIRMATION", "PASS");
    return;
  }
  if (mode === "reattach") {
    const { zoneId } = readPreflightIdentifiers();
    await attachCandidateDomain({
      config,
      zoneId,
    });
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
    const { zoneId } = readPreflightIdentifiers();
    const result = await restoreCandidateDomain({
      config,
      zoneId,
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
  main().catch((error) => {
    reportFailure(process.argv[2], error);
    process.exitCode = 1;
  });
