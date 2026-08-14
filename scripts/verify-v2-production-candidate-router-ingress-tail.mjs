import { readFileSync } from "node:fs";

const noncePattern = /^[a-f0-9]{24}$/i;
const versionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? String(status)
    : "UNKNOWN";
}

function hasFatalTailError(errorText) {
  return /(?:\bfatal\b|unknown option|unrecognized option|invalid (?:option|argument|value|version(?:[- ]?id)?)|failed to (?:start|connect)|wrangler\s+error|command failed|startup failure)/i.test(
    errorText,
  );
}

function hasVersionFilterRejection(errorText) {
  return /(?:(?:--version-id|version(?:[- ]?id)?).{0,80}(?:invalid|unknown|unrecognized|unsupported|not found)|(?:invalid|unknown|unrecognized|unsupported|not found).{0,80}(?:--version-id|version(?:[- ]?id)?))/i.test(
    errorText,
  );
}

export function inspectRouterIngressTail({
  capture,
  errors,
  nonce,
  hostname,
  versionId,
  versionFilterRequested,
  tailProcessObserved,
  filterSamplingWindowElapsed,
  captureWindowCompleted,
}) {
  const captureText = typeof capture === "string" ? capture : "";
  const errorText = typeof errors === "string" ? errors : "";
  const validExpectedVersion =
    typeof versionId === "string" && versionIdPattern.test(versionId);
  const permissionUnavailable =
    /(?:\b401\b|\b403\b|permission denied|not authorized)/i.test(errorText);
  const observed = tailProcessObserved === true;
  const samplingWindowComplete =
    observed && filterSamplingWindowElapsed === true;
  const windowComplete = captureWindowCompleted === true;
  const versionFilterRejected = hasVersionFilterRejection(errorText);
  const sessionEstablished =
    observed &&
    windowComplete &&
    !permissionUnavailable &&
    !hasFatalTailError(errorText) &&
    !versionFilterRejected;
  const readiness = permissionUnavailable
    ? "UNAVAILABLE"
    : sessionEstablished
      ? "PASS"
      : "FAIL";
  const versionFilterApplied =
    readiness === "PASS" &&
    validExpectedVersion &&
    versionFilterRequested === true &&
    samplingWindowComplete &&
    !versionFilterRejected
      ? "PASS"
      : "UNPROVEN";
  let matching;

  for (const line of captureText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      const url = item?.event?.request?.url;
      if (typeof url !== "string") continue;
      const parsed = new URL(url);
      if (parsed.searchParams.get("oo_router_ingress_diag") === nonce) {
        matching = { item, parsed };
        break;
      }
    } catch {
      // Raw Tail records are parsed only in memory and never emitted.
    }
  }

  if (!matching)
    return {
      permissionAvailable: permissionUnavailable ? "NO" : "YES",
      readiness,
      eventCaptured: "NO",
      versionFilterApplied,
      filterSamplingWindowElapsed: samplingWindowComplete ? "PASS" : "UNPROVEN",
      captureWindowCompleted: windowComplete ? "PASS" : "UNPROVEN",
      requestHostMatchesExpected: "UNPROVEN",
      requestSchemeHttps: "UNPROVEN",
      requestMethodGet: "UNPROVEN",
      eventOutcome: "UNPROVEN",
      eventHttpStatus: "UNPROVEN",
    };

  const request = matching.item?.event?.request ?? {};
  const responseStatus =
    matching.item?.event?.response?.status ?? matching.item?.response?.status;
  const outcome = matching.item?.outcome;
  return {
    permissionAvailable: permissionUnavailable ? "NO" : "YES",
    readiness,
    eventCaptured: "YES",
    versionFilterApplied,
    filterSamplingWindowElapsed: samplingWindowComplete ? "PASS" : "UNPROVEN",
    captureWindowCompleted: windowComplete ? "PASS" : "UNPROVEN",
    requestHostMatchesExpected:
      matching.parsed.hostname === hostname ? "PASS" : "FAIL",
    requestSchemeHttps: matching.parsed.protocol === "https:" ? "PASS" : "FAIL",
    requestMethodGet: request.method === "GET" ? "PASS" : "FAIL",
    eventOutcome:
      outcome === "ok"
        ? "OK"
        : typeof outcome === "string"
          ? "OTHER"
          : "UNKNOWN",
    eventHttpStatus: safeStatus(responseStatus),
  };
}

function print(result) {
  console.log(`TAIL_PERMISSION_AVAILABLE=${result.permissionAvailable}`);
  console.log(`TAIL_READINESS=${result.readiness}`);
  console.log(`TAIL_EVENT_CAPTURED=${result.eventCaptured}`);
  console.log(`TAIL_VERSION_FILTER_APPLIED=${result.versionFilterApplied}`);
  console.log(
    `TAIL_FILTER_SAMPLING_WINDOW_ELAPSED=${result.filterSamplingWindowElapsed}`,
  );
  console.log(`TAIL_CAPTURE_WINDOW_COMPLETED=${result.captureWindowCompleted}`);
  console.log(
    `TAIL_REQUEST_HOST_MATCHES_EXPECTED=${result.requestHostMatchesExpected}`,
  );
  console.log(`TAIL_REQUEST_SCHEME_HTTPS=${result.requestSchemeHttps}`);
  console.log(`TAIL_REQUEST_METHOD_GET=${result.requestMethodGet}`);
  console.log(`TAIL_EVENT_OUTCOME=${result.eventOutcome}`);
  console.log(`TAIL_EVENT_HTTP_STATUS=${result.eventHttpStatus}`);
}

function failedResult() {
  return {
    permissionAvailable: "UNPROVEN",
    readiness: "FAIL",
    eventCaptured: "NO",
    versionFilterApplied: "UNPROVEN",
    filterSamplingWindowElapsed: "UNPROVEN",
    captureWindowCompleted: "UNPROVEN",
    requestHostMatchesExpected: "UNPROVEN",
    requestSchemeHttps: "UNPROVEN",
    requestMethodGet: "UNPROVEN",
    eventOutcome: "UNPROVEN",
    eventHttpStatus: "UNPROVEN",
  };
}

if (import.meta.main) {
  const capturePath = process.env.ROUTER_INGRESS_TAIL_CAPTURE_FILE;
  const errorPath = process.env.ROUTER_INGRESS_TAIL_ERROR_FILE;
  const nonce = process.env.ROUTER_INGRESS_TAIL_NONCE;
  const hostname = process.env.ROUTER_INGRESS_TAIL_HOSTNAME;
  const versionId = process.env.ROUTER_INGRESS_TAIL_VERSION_ID;
  const tailProcessObserved =
    process.env.ROUTER_INGRESS_TAIL_PROCESS_OBSERVED === "YES";
  const filterSamplingWindowElapsed =
    process.env.ROUTER_INGRESS_TAIL_FILTER_SAMPLING_WINDOW_ELAPSED === "YES";
  const captureWindowCompleted =
    process.env.ROUTER_INGRESS_TAIL_CAPTURE_WINDOW_COMPLETED === "YES";
  if (
    !capturePath ||
    !errorPath ||
    !noncePattern.test(nonce ?? "") ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/.test(
      hostname ?? "",
    ) ||
    !versionIdPattern.test(versionId ?? "")
  ) {
    print(failedResult());
    process.exitCode = 1;
  } else {
    try {
      print(
        inspectRouterIngressTail({
          capture: readFileSync(capturePath, "utf8"),
          errors: readFileSync(errorPath, "utf8"),
          nonce,
          hostname,
          versionId,
          versionFilterRequested: true,
          tailProcessObserved,
          filterSamplingWindowElapsed,
          captureWindowCompleted,
        }),
      );
    } catch {
      print(failedResult());
      process.exitCode = 1;
    }
  }
}
