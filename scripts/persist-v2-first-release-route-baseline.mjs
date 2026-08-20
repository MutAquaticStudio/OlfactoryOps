import { chmodSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  captureFirstReleaseRouteBaseline,
  fingerprint,
  parseBaseline,
  sameBaseline,
} from "./v2-first-release-route-policy.mjs";

export async function persistFirstReleaseRouteBaseline({
  environment = process.env,
  fetchImpl = fetch,
  emit = (line) => console.log(line),
} = {}) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = environment.CLOUDFLARE_API_TOKEN?.trim();
  const releaseSha = environment.RELEASE_SHA?.trim();
  const persistedBaseline =
    environment.PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE?.trim();
  const outputFile = environment.FIRST_RELEASE_BASELINE_FILE?.trim();
  if (!account || !token || !releaseSha || !outputFile) {
    return emitFailure(emit, "CREDENTIAL_OR_CONTEXT_UNAVAILABLE");
  }
  if (!persistedBaseline) {
    return emitFailure(emit, "PERSISTENCE_UNAVAILABLE");
  }

  const stored = parseBaseline(persistedBaseline);
  if (!stored) {
    return emitFailure(emit, "PERSISTENCE_INVALID");
  }

  const captured = await captureFirstReleaseRouteBaseline({
    account,
    token,
    releaseSha,
    fetchImpl,
  });
  if (!captured.pass) return emitFailure(emit, captured.state);
  if (!sameBaseline(stored, captured.manifest)) {
    return emitFailure(emit, "CUTOVER_ROUTE_BASELINE_DRIFT");
  }

  writeFileSync(outputFile, persistedBaseline, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(outputFile, 0o600);
  emit("PRECUTOVER_ROUTE_BASELINE=PASS");
  emit("PREVIOUS_API_ROUTE_TARGET_PROVEN=PASS");
  emit("PREVIOUS_TENANT_ROUTER_ROUTE_TARGET_PROVEN=PASS");
  emit("FIRST_RELEASE_BASELINE_PERSISTENCE=VERIFIED");
  emit("FIRST_RELEASE_BASELINE_FINGERPRINT=" + fingerprint(stored));
  return { pass: true, fingerprint: fingerprint(stored) };
}

function emitFailure(emit, state) {
  emit("PRECUTOVER_ROUTE_BASELINE=FAIL");
  emit("FIRST_RELEASE_BASELINE_FAILURE=" + state);
  return { pass: false, state };
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const result = await persistFirstReleaseRouteBaseline();
  if (!result.pass) process.exitCode = 1;
}
