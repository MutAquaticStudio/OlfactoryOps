import { expect, it } from "vitest";

import {
  classifyRc12InactiveUploadFailure,
  emitRc12InactiveUploadFailure,
} from "./classify-v2-rc12-inactive-upload-failure.mjs";

it("emits bounded token-permission evidence without exposing provider text", () => {
  const sentinel = "never-print-this-provider-message";
  const evidence = classifyRc12InactiveUploadFailure({
    component: "api",
    stderr: `HTTP status 403; Cloudflare error code 10000; ${sentinel}`,
  });
  const lines = [];
  emitRc12InactiveUploadFailure(evidence, (line) => lines.push(line));
  expect(lines).toEqual([
    "RC12_INACTIVE_UPLOAD_COMPONENT=API",
    "RC12_INACTIVE_UPLOAD_HTTP_STATUS=403",
    "RC12_INACTIVE_UPLOAD_CF_ERROR_CODE=10000",
    "RC12_INACTIVE_UPLOAD_FAILURE_CLASS=CLOUDFLARE_TOKEN_PERMISSION",
  ]);
  expect(JSON.stringify(lines)).not.toContain(sentinel);
});

it("distinguishes production resource ownership from configuration rejection", () => {
  expect(
    classifyRc12InactiveUploadFailure({
      component: "cloud-runtime",
      stderr:
        "The Workflow belongs to a different Worker and will be reassigned",
    }).failureClass,
  ).toBe("PRODUCTION_RESOURCE_OWNERSHIP_CONFLICT");
  expect(
    classifyRc12InactiveUploadFailure({
      component: "tenant-router",
      stderr: "Invalid configuration field",
    }).failureClass,
  ).toBe("WORKER_VERSION_CONFIGURATION_REJECTED");
});

it("fails closed with bounded evidence for unknown provider output", () => {
  const sentinel = "raw-upload-error-must-never-appear";
  const evidence = classifyRc12InactiveUploadFailure({
    component: "unknown",
    stderr: sentinel,
  });
  expect(evidence).toEqual({
    component: "UNKNOWN",
    httpStatus: 0,
    cloudflareErrorCode: "NONE",
    failureClass: "INVALID_UPLOAD_COMPONENT",
  });
  expect(JSON.stringify(evidence)).not.toContain(sentinel);
});
