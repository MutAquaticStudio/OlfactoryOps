import { expect, test } from "vitest";

import { inspectRouterIngressTail } from "./verify-v2-production-candidate-router-ingress-tail.mjs";

const nonce = "0123456789abcdef01234567";
const hostname = "rc9-release-31736285494-469ca8942a.next.labofscents.org";
const versionId = "96a902d8-9477-4e4e-b732-228dd17d376b";

function event(overrides = {}) {
  return JSON.stringify({
    outcome: "ok",
    event: {
      request: {
        method: "GET",
        url: `https://${hostname}/?oo_router_ingress_diag=${nonce}`,
        headers: { authorization: "never-emitted" },
      },
      response: { status: 404 },
    },
    ...overrides,
  });
}

function expectedOptions(overrides = {}) {
  return {
    errors: "",
    nonce,
    hostname,
    versionId,
    versionFilterRequested: true,
    tailProcessObserved: true,
    captureWindowCompleted: true,
    ...overrides,
  };
}

test("accepts the documented Tail event schema without undocumented version metadata", () => {
  const result = inspectRouterIngressTail({
    capture: event(),
    ...expectedOptions(),
  });

  expect(result).toMatchObject({
    permissionAvailable: "YES",
    readiness: "PASS",
    eventCaptured: "YES",
    versionFilterApplied: "PASS",
    captureWindowCompleted: "PASS",
    requestHostMatchesExpected: "PASS",
    requestSchemeHttps: "PASS",
    requestMethodGet: "PASS",
    eventOutcome: "OK",
    eventHttpStatus: "404",
  });
});

test("does not treat a redacted or delayed event as ingress drift evidence", () => {
  const redacted = inspectRouterIngressTail({
    capture: event({
      event: {
        request: {
          method: "GET",
          url: `https://${hostname}/?oo_router_ingress_diag=REDACTED`,
        },
        response: { status: 404 },
      },
    }),
    ...expectedOptions(),
  });
  expect(redacted).toMatchObject({
    readiness: "UNPROVEN",
    eventCaptured: "NO",
    versionFilterApplied: "UNPROVEN",
  });

  const delayed = inspectRouterIngressTail({
    capture: "",
    ...expectedOptions({ errors: "unexpected tail transport text" }),
  });
  expect(delayed).toMatchObject({
    readiness: "UNPROVEN",
    eventCaptured: "NO",
    captureWindowCompleted: "PASS",
  });
});

test("reports tail authorization failure without exposing raw error, URL, or nonce", () => {
  const result = inspectRouterIngressTail({
    capture: "",
    ...expectedOptions({ errors: "403 protected-value-not-emitted" }),
  });

  expect(result).toMatchObject({
    permissionAvailable: "NO",
    readiness: "UNAVAILABLE",
    eventCaptured: "NO",
    versionFilterApplied: "UNPROVEN",
  });
  const emitted = JSON.stringify(result);
  expect(emitted).not.toContain("protected-value-not-emitted");
  expect(emitted).not.toContain("never-emitted");
  expect(emitted).not.toContain(nonce);
  expect(emitted).not.toContain(hostname);
});
