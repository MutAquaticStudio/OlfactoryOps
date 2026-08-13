import { readFileSync } from "node:fs";

const capturePath = process.env.ROUTER_TAIL_CAPTURE_FILE;
const errorPath = process.env.ROUTER_TAIL_ERROR_FILE;
const nonce = process.env.ROUTER_TAIL_EXPECTED_NONCE;
const hostname = process.env.ROUTER_TAIL_EXPECTED_HOSTNAME;
const version = process.env.ROUTER_TAIL_VERSION_FILTER;
if (
  !capturePath ||
  !errorPath ||
  !/^[a-f0-9]{32}$/i.test(nonce ?? "") ||
  !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/.test(
    hostname ?? "",
  ) ||
  !/^[0-9a-f-]{36}$/i.test(version ?? "")
) {
  console.log("TAIL_CAPTURE_CONTRACT=FAIL");
  process.exitCode = 1;
  process.exit();
}

let capture = "";
let errors = "";
try {
  capture = readFileSync(capturePath, "utf8");
  errors = readFileSync(errorPath, "utf8");
} catch {
  console.log("TAIL_CAPTURE_CONTRACT=FAIL");
  process.exitCode = 1;
  process.exit();
}

const permissionUnavailable =
  /(?:\b401\b|\b403\b|permission denied|not authorized)/i.test(errors);
let matching = null;
for (const line of capture.split(/\r?\n/)) {
  if (!line.trim()) continue;
  try {
    const item = JSON.parse(line);
    const url = item?.event?.request?.url;
    if (typeof url !== "string") continue;
    const parsed = new URL(url);
    if (parsed.searchParams.get("oo_router_path_diag") === nonce) {
      matching = { item, parsed };
      break;
    }
  } catch {
    // Tail output can include connection diagnostics. They are deliberately ignored.
  }
}

const tailStartupFailure =
  !permissionUnavailable &&
  !matching &&
  /(?:\berror\b|\bfailed\b|\bunable\b|\binvalid\b|\bnot found\b|\btimed out\b|\btimeout\b)/i.test(
    errors,
  );
const tailReadiness = permissionUnavailable
  ? "UNAVAILABLE"
  : tailStartupFailure
    ? "FAIL"
    : "PASS";
const versionFilter = tailReadiness === "PASS" ? "PASS" : "UNPROVEN";

console.log(
  `TAIL_PERMISSION_AVAILABLE=${permissionUnavailable ? "NO" : "YES"}`,
);
console.log(`TAIL_READINESS=${tailReadiness}`);
console.log(`TAIL_EVENT_CAPTURED=${matching ? "YES" : "NO"}`);
console.log(`TAIL_VERSION_FILTER_APPLIED=${versionFilter}`);

if (!matching) process.exit();

const request = matching.item.event?.request ?? {};
const responseStatus = Number(
  matching.item.event?.response?.status ?? matching.item.response?.status,
);
const statusClass =
  Number.isInteger(responseStatus) &&
  responseStatus >= 200 &&
  responseStatus < 300
    ? "2XX"
    : Number.isInteger(responseStatus) &&
        responseStatus >= 400 &&
        responseStatus < 500
      ? "4XX"
      : Number.isInteger(responseStatus) && responseStatus >= 500
        ? "5XX"
        : "UNKNOWN";
console.log(
  `TAIL_REQUEST_HOST_MATCHES_EXPECTED=${matching.parsed.hostname === hostname ? "PASS" : "FAIL"}`,
);
console.log(
  `TAIL_REQUEST_SCHEME_HTTPS=${matching.parsed.protocol === "https:" ? "PASS" : "FAIL"}`,
);
console.log(
  `TAIL_REQUEST_METHOD_GET=${request.method === "GET" ? "PASS" : "FAIL"}`,
);
console.log(
  `TAIL_INVOCATION_OUTCOME_OK=${matching.item.outcome === "ok" ? "PASS" : "FAIL"}`,
);
console.log(`TAIL_RESPONSE_STATUS_CLASS=${statusClass}`);
