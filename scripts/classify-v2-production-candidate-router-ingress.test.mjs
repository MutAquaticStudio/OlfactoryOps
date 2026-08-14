import { expect, test } from "vitest";

import { classifyRouterIngress } from "./classify-v2-production-candidate-router-ingress.mjs";

const baseEvidence = {
  discovery: "PASS",
  publicProbe: "YES",
  permission: "YES",
  readiness: "PASS",
  captureWindowCompleted: "PASS",
  eventCaptured: "YES",
  versionFilterApplied: "PASS",
  hostMatchesExpected: "PASS",
  requestSchemeHttps: "PASS",
  requestMethodGet: "PASS",
  eventOutcome: "OK",
  eventHttpStatus: "404",
  versionStable: "PASS",
};

test("classifies a confirmed Router 404 only after version-stable tail evidence", () => {
  expect(classifyRouterIngress(baseEvidence)).toBe(
    "CANDIDATE_ROUTER_RUNTIME_TENANT_RESOLUTION_PATH",
  );
});

test("classifies a complete zero-event tail boundary as Custom Domain control-plane drift", () => {
  expect(classifyRouterIngress({ ...baseEvidence, eventCaptured: "NO" })).toBe(
    "CANDIDATE_CUSTOM_DOMAIN_CONTROL_PLANE_ROUTING_DRIFT",
  );
});

test("fails closed when the required tail evidence boundary is incomplete", () => {
  expect(
    classifyRouterIngress({
      ...baseEvidence,
      captureWindowCompleted: "UNPROVEN",
      eventCaptured: "NO",
    }),
  ).toBe("CANDIDATE_ROUTER_TAIL_CAPTURE_UNPROVEN");
  expect(classifyRouterIngress({ ...baseEvidence, publicProbe: "NO" })).toBe(
    "CANDIDATE_ROUTER_PUBLIC_PROBE_UNCONFIRMED",
  );
  expect(
    classifyRouterIngress({ ...baseEvidence, versionStable: "UNPROVEN" }),
  ).toBe("CANDIDATE_ROUTER_VERSION_CHANGED_DURING_TAIL");
  expect(
    classifyRouterIngress({
      ...baseEvidence,
      versionFilterApplied: "UNPROVEN",
    }),
  ).toBe("CANDIDATE_ROUTER_TAIL_FILTER_UNPROVEN");
});
