const tailEvidence = process.env.ROUTER_REQUEST_PATH_TAIL_EVIDENCE ?? "";
const actualProbe = process.env.ROUTER_REQUEST_PATH_ACTUAL_PROBE ?? "";
const activeVersionStable =
  process.env.ROUTER_REQUEST_PATH_ACTIVE_VERSION_STABLE ?? "";
const shadowProbe = process.env.ROUTER_REQUEST_PATH_SHADOW_PROBE ?? "";

const validTailEvidence = new Set([
  "",
  "ABSENT",
  "HOST_MISMATCH",
  "PUBLIC_UNCONFIRMED",
  "TAIL_STARTUP_FAILURE",
  "TAIL_PERMISSION_UNAVAILABLE",
  "EXACT_INGRESS",
]);
const validProbe = /^(?:|PASS|FAIL_(?:2XX|404|503|OTHER))$/;
const validVersionStability = new Set(["", "true", "false"]);

function unclassified() {
  return {
    rootCause: "UNCLASSIFIED_DIAGNOSTIC_EVIDENCE",
    rc10Required: "UNPROVEN",
    nextRemediation: "COLLECT_ADDITIONAL_READ_ONLY_EVIDENCE",
  };
}

function classify() {
  if (
    !validTailEvidence.has(tailEvidence) ||
    !validProbe.test(actualProbe) ||
    !validProbe.test(shadowProbe) ||
    !validVersionStability.has(activeVersionStable)
  )
    return unclassified();

  switch (tailEvidence) {
    case "ABSENT":
      return {
        rootCause: "CUSTOM_DOMAIN_CONTROL_PLANE_ROUTING_DRIFT",
        rc10Required: "NO",
        nextRemediation: "PROTECTED_CANDIDATE_ONLY_CUSTOM_DOMAIN_RESET",
      };
    case "HOST_MISMATCH":
      return {
        rootCause: "CUSTOM_DOMAIN_REQUEST_HOST_TRANSFORMATION",
        rc10Required: "NO",
        nextRemediation: "INVESTIGATE_CLOUDFLARE_CUSTOM_DOMAIN_INGRESS",
      };
    case "PUBLIC_UNCONFIRMED":
      return {
        rootCause: "PUBLIC_PROBE_NOT_CONFIRMED",
        rc10Required: "UNPROVEN",
        nextRemediation: "COLLECT_ADDITIONAL_READ_ONLY_EVIDENCE",
      };
    case "TAIL_STARTUP_FAILURE":
      return {
        rootCause: "TAIL_STARTUP_OR_PLATFORM_FAILURE",
        rc10Required: "UNPROVEN",
        nextRemediation: "COLLECT_ADDITIONAL_READ_ONLY_EVIDENCE",
      };
    default:
      break;
  }

  if (tailEvidence === "TAIL_PERMISSION_UNAVAILABLE") {
    if (actualProbe === "PASS" && activeVersionStable === "true")
      return {
        rootCause: "TAIL_PERMISSION_UNAVAILABLE_SERVICE_BINDING_PASS",
        rc10Required: "UNPROVEN",
        nextRemediation: "COLLECT_ADDITIONAL_READ_ONLY_EVIDENCE",
      };
    return unclassified();
  }

  if (tailEvidence !== "EXACT_INGRESS") return unclassified();
  if (activeVersionStable === "false")
    return {
      rootCause: "ACTIVE_ROUTER_VERSION_CHANGED_DURING_SERVICE_PROBE",
      rc10Required: "UNPROVEN",
      nextRemediation: "COLLECT_ADDITIONAL_READ_ONLY_EVIDENCE",
    };
  if (actualProbe === "PASS" && activeVersionStable === "true")
    return {
      rootCause: "CUSTOM_DOMAIN_EDGE_ONLY_DISCREPANCY",
      rc10Required: "NO",
      nextRemediation: "PROTECTED_CANDIDATE_ONLY_CUSTOM_DOMAIN_RESET",
    };
  if (
    actualProbe !== "" &&
    actualProbe !== "PASS" &&
    activeVersionStable === "true" &&
    shadowProbe === "PASS"
  )
    return {
      rootCause: "CANDIDATE_ROUTER_WORKER_RESOURCE_STATE_DRIFT",
      rc10Required: "NO",
      nextRemediation: "PROTECTED_RECREATE_CANDIDATE_ROUTER_FROM_RC9",
    };
  if (actualProbe === "FAIL_503" && shadowProbe === "FAIL_503")
    return {
      rootCause: "RC9_HYPERDRIVE_ROUTER_RUNTIME_FAILURE_REPRODUCIBLE",
      rc10Required: "YES_OR_INFRA_PENDING_CLASSIFICATION",
      nextRemediation: "NO_PRIVILEGE_ESCALATION_PENDING_INFRA_CLASSIFICATION",
    };
  if (actualProbe !== "" && actualProbe !== "PASS" && shadowProbe !== "")
    return {
      rootCause: "RC9_RUNTIME_BEHAVIOR_REPRODUCIBLE",
      rc10Required: "YES",
      nextRemediation: "RC10_SOURCE_FIX_REQUIRED",
    };

  return unclassified();
}

const result = classify();
console.log(`ROOT_CAUSE=${result.rootCause}`);
console.log(`RC10_REQUIRED=${result.rc10Required}`);
console.log(`NEXT_REMEDIATION=${result.nextRemediation}`);
