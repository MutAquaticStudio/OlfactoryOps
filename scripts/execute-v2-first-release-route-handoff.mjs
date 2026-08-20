import { pathToFileURL } from "node:url";

import {
  handoffApprovedRoutes,
  parseBaseline,
} from "./v2-first-release-route-policy.mjs";

export async function executeFirstReleaseRouteHandoff({
  environment = process.env,
  fetchImpl = fetch,
  emit = (line) => console.log(line),
} = {}) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = environment.CLOUDFLARE_API_TOKEN?.trim();
  const releaseSha = environment.RELEASE_SHA?.trim();
  const expectedHyperdriveId = environment.PRODUCTION_HYPERDRIVE_ID?.trim();
  const baseline = parseBaseline(
    environment.PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE,
  );
  if (!account || !token || !releaseSha || !expectedHyperdriveId || !baseline) {
    emit("CURRENT_ROUTE_BASELINE_MATCH=FAIL");
    emit("API_ROUTE_HANDOFF=FAIL");
    emit("TENANT_ROUTER_ROUTE_HANDOFF=FAIL");
    return { pass: false, state: "BASELINE_UNAVAILABLE" };
  }
  const result = await handoffApprovedRoutes({
    account,
    token,
    baseline,
    releaseSha,
    expectedHyperdriveId,
    fetchImpl,
  });
  if (!result.pass) {
    emit(
      "CURRENT_ROUTE_BASELINE_MATCH=" +
        (result.state === "CUTOVER_ROUTE_BASELINE_DRIFT" ? "FAIL" : "UNPROVEN"),
    );
    emit("API_ROUTE_HANDOFF=FAIL");
    emit("TENANT_ROUTER_ROUTE_HANDOFF=FAIL");
    emit("FIRST_RELEASE_ROUTE_HANDOFF_FAILURE=" + result.state);
    return result;
  }
  emit("CURRENT_ROUTE_BASELINE_MATCH=PASS");
  emit("API_ROUTE_HANDOFF=PASS");
  emit("TENANT_ROUTER_ROUTE_HANDOFF=PASS");
  emit("FIRST_RELEASE_ROUTE_HANDOFF=PASS");
  return result;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const result = await executeFirstReleaseRouteHandoff();
  if (!result.pass) process.exitCode = 1;
}
