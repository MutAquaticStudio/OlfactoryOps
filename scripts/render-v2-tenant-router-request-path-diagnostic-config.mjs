import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const required = [
  "V2_REQUEST_PATH_DIAGNOSTIC_TARGET_RELEASE_SHA",
  "V2_REQUEST_PATH_DIAGNOSTIC_FIXTURE_HOSTNAME",
  "V2_REQUEST_PATH_DIAGNOSTIC_CORRELATION_NONCE",
  "V2_REQUEST_PATH_DIAGNOSTIC_PROBE_TARGET",
  "V2_REQUEST_PATH_DIAGNOSTIC_PROBE_QUERY_KEY",
  "V2_REQUEST_PATH_DIAGNOSTIC_CALLER_WORKER_NAME",
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length)
  throw new Error(
    `ROUTER_REQUEST_PATH_DIAGNOSTIC_CONFIG=BLOCKED missing:${missing.join(",")}`,
  );

const releaseSha =
  process.env.V2_REQUEST_PATH_DIAGNOSTIC_TARGET_RELEASE_SHA ?? "";
const hostname = process.env.V2_REQUEST_PATH_DIAGNOSTIC_FIXTURE_HOSTNAME ?? "";
const nonce = process.env.V2_REQUEST_PATH_DIAGNOSTIC_CORRELATION_NONCE ?? "";
const probeTarget = process.env.V2_REQUEST_PATH_DIAGNOSTIC_PROBE_TARGET ?? "";
const queryKey = process.env.V2_REQUEST_PATH_DIAGNOSTIC_PROBE_QUERY_KEY ?? "";
const callerWorkerName =
  process.env.V2_REQUEST_PATH_DIAGNOSTIC_CALLER_WORKER_NAME ?? "";
const shadowWorkerName =
  process.env.V2_REQUEST_PATH_DIAGNOSTIC_SHADOW_WORKER_NAME ?? "";
const includeShadow =
  process.env.V2_REQUEST_PATH_DIAGNOSTIC_INCLUDE_SHADOW === "true";
const outputPath =
  process.env.V2_REQUEST_PATH_DIAGNOSTIC_CONFIG ??
  ".qa/wrangler.v2-tenant-router-request-path-diagnostic.toml";

if (!/^[a-f0-9]{40}$/i.test(releaseSha))
  throw new Error("target release SHA must be exact");
if (
  !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/.test(
    hostname,
  )
)
  throw new Error(
    "fixture hostname must be one lowercase candidate workspace hostname",
  );
if (!/^[a-f0-9]{32}$/i.test(nonce))
  throw new Error(
    "diagnostic correlation nonce must be 32 lowercase hexadecimal characters",
  );
if (!/^oo-v2-router-service-diag-[0-9]+$/.test(callerWorkerName))
  throw new Error("diagnostic caller Worker name is invalid");
if (!["TARGET_ROUTER", "SHADOW_ROUTER"].includes(probeTarget))
  throw new Error("diagnostic probe target is invalid");
if (
  ![
    ["TARGET_ROUTER", "oo_service_diag"],
    ["SHADOW_ROUTER", "oo_shadow_diag"],
  ].some(([target, key]) => target === probeTarget && key === queryKey)
)
  throw new Error(
    "diagnostic probe target and query key must be an approved pair",
  );
if (probeTarget === "SHADOW_ROUTER" && !includeShadow)
  throw new Error("shadow probe requires the shadow service binding");
if (includeShadow && !/^oo-v2-router-rc9-shadow-[0-9]+$/.test(shadowWorkerName))
  throw new Error("diagnostic shadow Worker name is invalid");

const outputDirectory = dirname(resolve(outputPath));
const main = relative(
  outputDirectory,
  resolve("worker/v2-tenant-router-request-path-diagnostic.ts"),
).replaceAll("\\", "/");
let rendered = readFileSync(
  "wrangler.v2-tenant-router-request-path-diagnostic.example.toml",
  "utf8",
);
rendered = rendered.replace(
  'main = "worker/v2-tenant-router-request-path-diagnostic.ts"',
  `main = "${main}"`,
);
rendered = rendered.replaceAll(
  "REPLACE_WITH_DIAGNOSTIC_FIXTURE_HOSTNAME",
  hostname,
);
rendered = rendered.replaceAll("REPLACE_WITH_TARGET_RELEASE_SHA", releaseSha);
rendered = rendered.replaceAll(
  "REPLACE_WITH_DIAGNOSTIC_CORRELATION_NONCE",
  nonce,
);
rendered = rendered.replaceAll(
  "REPLACE_WITH_DIAGNOSTIC_PROBE_TARGET",
  probeTarget,
);
rendered = rendered.replaceAll(
  "REPLACE_WITH_DIAGNOSTIC_PROBE_QUERY_KEY",
  queryKey,
);
rendered = rendered.replaceAll(
  "REPLACE_WITH_DIAGNOSTIC_CALLER_WORKER_NAME",
  callerWorkerName,
);
if (includeShadow)
  rendered += `\n[[services]]\nbinding = "SHADOW_ROUTER"\nservice = "${shadowWorkerName}"\n`;

if (
  rendered.includes("REPLACE_WITH_") ||
  /^\s*(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/m.test(rendered) ||
  !/^workers_dev\s*=\s*true$/m.test(rendered) ||
  !/binding\s*=\s*"TARGET_ROUTER"/.test(rendered) ||
  (includeShadow && !/binding\s*=\s*"SHADOW_ROUTER"/.test(rendered))
)
  throw new Error(
    "ROUTER_REQUEST_PATH_DIAGNOSTIC_CONFIG=FAIL caller config must remain route-free workers.dev only",
  );

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, rendered, "utf8");
console.log("ROUTER_REQUEST_PATH_DIAGNOSTIC_CONFIG=PASS");
