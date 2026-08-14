export function classifyRouterIngress({
  discovery,
  publicProbe,
  permission,
  readiness,
  captureWindowCompleted,
  eventCaptured,
  versionFilterApplied,
  hostMatchesExpected,
  requestSchemeHttps,
  requestMethodGet,
  eventOutcome,
  eventHttpStatus,
  versionStable,
}) {
  if (discovery !== "PASS")
    return "CANDIDATE_ROUTER_CONTROL_PLANE_CONFIGURATION_UNPROVEN";
  if (publicProbe !== "YES") return "CANDIDATE_ROUTER_PUBLIC_PROBE_UNCONFIRMED";
  if (permission !== "YES")
    return "CANDIDATE_ROUTER_TAIL_PERMISSION_UNAVAILABLE";
  if (readiness !== "PASS") return "CANDIDATE_ROUTER_TAIL_STARTUP_UNPROVEN";
  if (captureWindowCompleted !== "PASS")
    return "CANDIDATE_ROUTER_TAIL_CAPTURE_UNPROVEN";
  if (versionStable !== "PASS")
    return "CANDIDATE_ROUTER_VERSION_CHANGED_DURING_TAIL";
  if (versionFilterApplied !== "PASS")
    return "CANDIDATE_ROUTER_TAIL_FILTER_UNPROVEN";
  if (eventCaptured !== "YES")
    return "CANDIDATE_CUSTOM_DOMAIN_CONTROL_PLANE_ROUTING_DRIFT";
  if (hostMatchesExpected !== "PASS")
    return "CANDIDATE_CUSTOM_DOMAIN_REQUEST_HOST_TRANSFORMATION";
  if (requestSchemeHttps !== "PASS" || requestMethodGet !== "PASS")
    return "CANDIDATE_ROUTER_REQUEST_INTEGRITY_UNPROVEN";
  if (eventOutcome !== "OK")
    return "CANDIDATE_ROUTER_INVOCATION_OUTCOME_UNPROVEN";
  if (eventHttpStatus === "404")
    return "CANDIDATE_ROUTER_RUNTIME_TENANT_RESOLUTION_PATH";
  if (/^5\d\d$/.test(eventHttpStatus ?? ""))
    return "CANDIDATE_ROUTER_RUNTIME_RESPONSE_PATH_UNPROVEN";
  return "CANDIDATE_ROUTER_RESPONSE_PATH_UNPROVEN";
}

if (import.meta.main) {
  const rootCause = classifyRouterIngress({
    discovery: process.env.ROUTER_INGRESS_DISCOVERY,
    publicProbe: process.env.ROUTER_INGRESS_PUBLIC_PROBE,
    permission: process.env.ROUTER_INGRESS_TAIL_PERMISSION,
    readiness: process.env.ROUTER_INGRESS_TAIL_READINESS,
    captureWindowCompleted:
      process.env.ROUTER_INGRESS_TAIL_CAPTURE_WINDOW_COMPLETED,
    eventCaptured: process.env.ROUTER_INGRESS_TAIL_EVENT_CAPTURED,
    versionFilterApplied:
      process.env.ROUTER_INGRESS_TAIL_VERSION_FILTER_APPLIED,
    hostMatchesExpected: process.env.ROUTER_INGRESS_TAIL_HOST_MATCHES_EXPECTED,
    requestSchemeHttps: process.env.ROUTER_INGRESS_TAIL_REQUEST_SCHEME_HTTPS,
    requestMethodGet: process.env.ROUTER_INGRESS_TAIL_REQUEST_METHOD_GET,
    eventOutcome: process.env.ROUTER_INGRESS_TAIL_EVENT_OUTCOME,
    eventHttpStatus: process.env.ROUTER_INGRESS_TAIL_EVENT_HTTP_STATUS,
    versionStable: process.env.ROUTER_INGRESS_VERSION_STABLE,
  });
  console.log(`ROOT_CAUSE=${rootCause}`);
  console.log("ROUTER_INGRESS_DIAGNOSTIC_EXECUTION=PASS");
}
