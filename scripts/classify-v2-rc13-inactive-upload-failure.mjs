import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const components = Object.freeze({
  api: "API",
  "cloud-runtime": "CLOUD_RUNTIME",
  "tenant-router": "TENANT_ROUTER",
});

function safeStatus(value) {
  const match = String(value ?? "").match(
    /\b(?:http\s*)?status(?:\s*code)?\D{0,12}([1-5]\d\d)\b/i,
  );
  const status = Number(match?.[1]);
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : 0;
}

function safeCloudflareErrorCode(value) {
  const match = String(value ?? "").match(
    /\b(?:cloudflare\s+)?(?:error\s+)?code\D{0,12}(\d{4,6})\b/i,
  );
  const code = Number(match?.[1]);
  return Number.isSafeInteger(code) && code >= 1000 ? code : "NONE";
}

export function classifyRc12InactiveUploadFailure({ component, stderr }) {
  const safeComponent = components[component] ?? "UNKNOWN";
  const text = typeof stderr === "string" ? stderr : "";
  const normalized = text.toLowerCase();
  const httpStatus = safeStatus(text);
  const cloudflareErrorCode = safeCloudflareErrorCode(text);
  let failureClass = "WRANGLER_UPLOAD_UNCLASSIFIED";

  if (safeComponent === "UNKNOWN") {
    failureClass = "INVALID_UPLOAD_COMPONENT";
  } else if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    cloudflareErrorCode === 10000 ||
    /permission|not authorized|forbidden/.test(normalized)
  ) {
    failureClass = "CLOUDFLARE_TOKEN_PERMISSION";
  } else if (
    /workflow.{0,160}(belongs|owner|reassign)|queue.{0,160}(consumer|belongs|owner|reassign)/.test(
      normalized,
    )
  ) {
    failureClass = "PRODUCTION_RESOURCE_OWNERSHIP_CONFLICT";
  } else if (
    /hyperdrive|r2|vectorize|durable object|container|service binding/.test(
      normalized,
    )
  ) {
    failureClass = "RESOURCE_BINDING_REJECTED";
  } else if (
    /configuration|config|unknown field|not supported|invalid option/.test(
      normalized,
    )
  ) {
    failureClass = "WORKER_VERSION_CONFIGURATION_REJECTED";
  } else if (/version|upload/.test(normalized)) {
    failureClass = "WORKER_VERSION_UPLOAD_REJECTED";
  }

  return {
    component: safeComponent,
    httpStatus,
    cloudflareErrorCode,
    failureClass,
  };
}

function readPrivateStderr(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export function emitRc12InactiveUploadFailure(evidence, emit = console.log) {
  emit(`RC13_INACTIVE_UPLOAD_COMPONENT=${evidence.component}`);
  emit(`RC13_INACTIVE_UPLOAD_HTTP_STATUS=${evidence.httpStatus}`);
  emit(`RC13_INACTIVE_UPLOAD_CF_ERROR_CODE=${evidence.cloudflareErrorCode}`);
  emit(`RC13_INACTIVE_UPLOAD_FAILURE_CLASS=${evidence.failureClass}`);
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const [component, file] = process.argv.slice(2);
  emitRc12InactiveUploadFailure(
    classifyRc12InactiveUploadFailure({
      component,
      stderr: readPrivateStderr(file),
    }),
  );
}
