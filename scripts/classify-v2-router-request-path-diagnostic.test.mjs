import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function classify(environment) {
  return execFileSync(
    process.execPath,
    ["scripts/classify-v2-router-request-path-diagnostic.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, ...environment },
    },
  );
}

describe("RC9 request-path evidence classifier", () => {
  it.each([
    [
      "A",
      { ROUTER_REQUEST_PATH_TAIL_EVIDENCE: "ABSENT" },
      "CUSTOM_DOMAIN_CONTROL_PLANE_ROUTING_DRIFT",
      "RC10_REQUIRED=NO",
    ],
    [
      "B",
      { ROUTER_REQUEST_PATH_TAIL_EVIDENCE: "HOST_MISMATCH" },
      "CUSTOM_DOMAIN_REQUEST_HOST_TRANSFORMATION",
      "RC10_REQUIRED=NO",
    ],
    [
      "C",
      {
        ROUTER_REQUEST_PATH_TAIL_EVIDENCE: "EXACT_INGRESS",
        ROUTER_REQUEST_PATH_ACTUAL_PROBE: "PASS",
        ROUTER_REQUEST_PATH_ACTIVE_VERSION_STABLE: "true",
      },
      "CUSTOM_DOMAIN_EDGE_ONLY_DISCREPANCY",
      "RC10_REQUIRED=NO",
    ],
    [
      "D",
      {
        ROUTER_REQUEST_PATH_TAIL_EVIDENCE: "EXACT_INGRESS",
        ROUTER_REQUEST_PATH_ACTUAL_PROBE: "FAIL_404",
        ROUTER_REQUEST_PATH_ACTIVE_VERSION_STABLE: "true",
        ROUTER_REQUEST_PATH_SHADOW_PROBE: "PASS",
      },
      "CANDIDATE_ROUTER_WORKER_RESOURCE_STATE_DRIFT",
      "RC10_REQUIRED=NO",
    ],
    [
      "E",
      {
        ROUTER_REQUEST_PATH_TAIL_EVIDENCE: "EXACT_INGRESS",
        ROUTER_REQUEST_PATH_ACTUAL_PROBE: "FAIL_404",
        ROUTER_REQUEST_PATH_ACTIVE_VERSION_STABLE: "true",
        ROUTER_REQUEST_PATH_SHADOW_PROBE: "FAIL_404",
      },
      "RC9_RUNTIME_BEHAVIOR_REPRODUCIBLE",
      "RC10_REQUIRED=YES",
    ],
    [
      "F",
      {
        ROUTER_REQUEST_PATH_TAIL_EVIDENCE: "EXACT_INGRESS",
        ROUTER_REQUEST_PATH_ACTUAL_PROBE: "FAIL_503",
        ROUTER_REQUEST_PATH_ACTIVE_VERSION_STABLE: "true",
        ROUTER_REQUEST_PATH_SHADOW_PROBE: "FAIL_503",
      },
      "RC9_HYPERDRIVE_ROUTER_RUNTIME_FAILURE_REPRODUCIBLE",
      "RC10_REQUIRED=YES_OR_INFRA_PENDING_CLASSIFICATION",
    ],
  ])("classifies matrix branch %s", (_branch, environment, rootCause, rc10) => {
    const output = classify(environment);
    expect(output).toContain(`ROOT_CAUSE=${rootCause}`);
    expect(output).toContain(rc10);
  });

  it("fails closed without echoing invalid diagnostic input", () => {
    const output = classify({
      ROUTER_REQUEST_PATH_TAIL_EVIDENCE: "unexpected-input-not-printed",
    });
    expect(output).toContain("ROOT_CAUSE=UNCLASSIFIED_DIAGNOSTIC_EVIDENCE");
    expect(output).not.toContain("unexpected-input-not-printed");
  });
});
