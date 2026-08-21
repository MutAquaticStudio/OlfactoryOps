import { pathToFileURL } from "node:url";

import {
  parseBaseline,
  verifyPostCutoverRouteRollback,
} from "./v2-first-release-route-policy.mjs";

export async function verifyProductionPostcutoverRouteRollback({
  environment = process.env,
  fetchImpl = fetch,
  emit = (line) => console.log(line),
} = {}) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = environment.CLOUDFLARE_API_TOKEN?.trim();
  const releaseSha = environment.RELEASE_SHA?.trim();
  const baseline = parseBaseline(
    environment.PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE,
  );
  const result =
    account && token && releaseSha && baseline
      ? await verifyPostCutoverRouteRollback({
          account,
          token,
          baseline,
          releaseSha,
          fetchImpl,
        })
      : {
          pass: false,
          state: "BASELINE_UNAVAILABLE",
          previousTargets: { api: false, tenantRouter: false },
          cleanupReady: false,
          routeInventory: {
            attempted: false,
            httpStatus: "0",
            cfErrorCode: "NONE",
          },
        };
  const pass = result.pass;
  emit(`POSTCUTOVER_ROUTE_HANDOFF_STATE=${pass ? "PASS" : "FAIL"}`);
  emit(
    "POSTCUTOVER_ROUTE_INVENTORY_ATTEMPTED=" +
      (result.routeInventory.attempted ? "YES" : "NO"),
  );
  emit(
    `POSTCUTOVER_ROUTE_INVENTORY_HTTP_STATUS=${result.routeInventory.httpStatus}`,
  );
  emit(
    `POSTCUTOVER_ROUTE_INVENTORY_CF_ERROR_CODE=${result.routeInventory.cfErrorCode}`,
  );
  emit(
    "PREVIOUS_API_ROUTE_TARGET_PROVEN=" +
      (result.previousTargets.api ? "PASS" : "UNPROVEN"),
  );
  emit(
    "PREVIOUS_TENANT_ROUTER_ROUTE_TARGET_PROVEN=" +
      (result.previousTargets.tenantRouter ? "PASS" : "UNPROVEN"),
  );
  emit(`FIRST_RELEASE_ROUTE_ROLLBACK_POLICY=${pass ? "PASS" : "UNPROVEN"}`);
  emit(
    "ROLLBACK_TO_EXISTING_ROUTE_TARGET_READY=" +
      (pass ? "PASS" : "UNPROVEN"),
  );
  emit(
    "ROLLBACK_TO_ABSENCE_READY=" +
      (result.cleanupReady ? "PASS" : "UNPROVEN"),
  );
  emit(`PRODUCTION_ROUTE_ROLLBACK_READY=${pass ? "PASS" : "UNPROVEN"}`);
  if (!pass) emit(`POSTCUTOVER_ROUTE_ROLLBACK_FAILURE=${result.state}`);
  return result;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const result = await verifyProductionPostcutoverRouteRollback();
  if (!result.pass) process.exitCode = 1;
}
