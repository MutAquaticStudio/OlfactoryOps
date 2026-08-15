import { expect, test } from "vitest";

import {
  candidateRouterIdentityExpectation,
  inspectCandidateRouterIdentity,
} from "./verify-v2-production-candidate-router-identity.mjs";

function response(status, headers = {}) {
  return new Response(null, { status, headers });
}

function expectedHeaders(overrides = {}) {
  return {
    "content-type": "text/html; charset=utf-8",
    "x-olfactoryops-workspace-router": "active",
    "x-olfactoryops-release-environment": "production",
    "x-olfactoryops-release-sha": candidateRouterIdentityExpectation.releaseSha,
    ...overrides,
  };
}

test("proves Router execution only for HTTP 200 HTML with every exact identity header", () => {
  expect(
    inspectCandidateRouterIdentity(response(200, expectedHeaders())),
  ).toMatchObject({ proven: true, routerActive: true, releaseShaMatch: true });
});

test("fails closed for a missing Router header, wrong release SHA, or controlled 404", () => {
  expect(
    inspectCandidateRouterIdentity(
      response(200, expectedHeaders({ "x-olfactoryops-workspace-router": "" })),
    ),
  ).toMatchObject({ proven: false, routerActive: false });
  expect(
    inspectCandidateRouterIdentity(
      response(200, expectedHeaders({ "x-olfactoryops-release-sha": "wrong" })),
    ),
  ).toMatchObject({ proven: false, releaseShaMatch: false });
  expect(inspectCandidateRouterIdentity(response(404))).toMatchObject({
    proven: false,
    httpStatus: "404",
  });
});
