import { expect, test } from "vitest";

import { classifyRouteOverrideTail } from "./classify-v2-production-candidate-route-override-tail.mjs";

const baseline = [
  "TAIL_PERMISSION_AVAILABLE=YES",
  "TAIL_READINESS=PASS",
  "TAIL_VERSION_FILTER_APPLIED=PASS",
  "TAIL_FILTER_SAMPLING_WINDOW_ELAPSED=PASS",
  "TAIL_CAPTURE_WINDOW_COMPLETED=PASS",
];

test("keeps a Tail miss non-blocking after deterministic Router identity passes", () => {
  expect(
    classifyRouteOverrideTail({
      identityProven: "PASS",
      tailOutput: baseline.concat("TAIL_EVENT_CAPTURED=NO").join("\n"),
    }),
  ).toBe("NON_BLOCKING_MISS");
});

test("fails a contradictory captured Tail event", () => {
  expect(
    classifyRouteOverrideTail({
      identityProven: "PASS",
      tailOutput: baseline
        .concat([
          "TAIL_EVENT_CAPTURED=YES",
          "TAIL_REQUEST_HOST_MATCHES_EXPECTED=FAIL",
          "TAIL_REQUEST_METHOD_GET=PASS",
          "TAIL_REQUEST_SCHEME_HTTPS=PASS",
          "TAIL_EVENT_OUTCOME=OK",
          "TAIL_EVENT_HTTP_STATUS=200",
        ])
        .join("\n"),
    }),
  ).toBe("CONTRADICTORY_EVENT");
});
