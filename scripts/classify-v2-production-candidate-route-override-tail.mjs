const requiredBaseline = Object.freeze({
  TAIL_PERMISSION_AVAILABLE: "YES",
  TAIL_READINESS: "PASS",
  TAIL_VERSION_FILTER_APPLIED: "PASS",
  TAIL_FILTER_SAMPLING_WINDOW_ELAPSED: "PASS",
  TAIL_CAPTURE_WINDOW_COMPLETED: "PASS",
});

function parseSafeLines(value) {
  const result = new Map();
  for (const line of String(value ?? "").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=([A-Z0-9_]+)$/.exec(line);
    if (match) result.set(match[1], match[2]);
  }
  return result;
}

export function classifyRouteOverrideTail({ identityProven, tailOutput }) {
  const values = parseSafeLines(tailOutput);
  if (identityProven !== "PASS") return "IDENTITY_UNPROVEN";
  for (const [name, expected] of Object.entries(requiredBaseline))
    if (values.get(name) !== expected) return "BLOCKING_TAIL_FAILURE";
  if (values.get("TAIL_EVENT_CAPTURED") === "NO") return "NON_BLOCKING_MISS";
  if (values.get("TAIL_EVENT_CAPTURED") !== "YES")
    return "BLOCKING_TAIL_FAILURE";
  const captured = {
    TAIL_REQUEST_HOST_MATCHES_EXPECTED: "PASS",
    TAIL_REQUEST_METHOD_GET: "PASS",
    TAIL_REQUEST_SCHEME_HTTPS: "PASS",
    TAIL_EVENT_OUTCOME: "OK",
    TAIL_EVENT_HTTP_STATUS: "200",
  };
  for (const [name, expected] of Object.entries(captured))
    if (values.get(name) !== expected) return "CONTRADICTORY_EVENT";
  return "CAPTURED";
}

if (import.meta.main) {
  const classification = classifyRouteOverrideTail({
    identityProven: process.env.ROUTE_OVERRIDE_IDENTITY_PROVEN,
    tailOutput: process.env.ROUTE_OVERRIDE_TAIL_OUTPUT,
  });
  console.log(`TAIL_OBSERVABILITY=${classification}`);
  if (classification !== "CAPTURED" && classification !== "NON_BLOCKING_MISS")
    process.exitCode = 1;
}
