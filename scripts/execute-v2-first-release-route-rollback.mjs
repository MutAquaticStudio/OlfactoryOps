import { pathToFileURL } from "node:url";

import {
  deleteFirstReleaseWorkers,
  parseBaseline,
  restoreApprovedRoutes,
} from "./v2-first-release-route-policy.mjs";

export async function executeFirstReleaseRouteRollback({
  environment = process.env,
  fetchImpl = fetch,
  emit = (line) => console.log(line),
} = {}) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = environment.CLOUDFLARE_API_TOKEN?.trim();
  const baseline = parseBaseline(
    environment.PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE,
  );
  const cleanup = environment.FIRST_RELEASE_ROLLBACK_CLEANUP?.trim();
  if (!account || !token || !baseline) {
    emit("ROLLBACK_ROUTE_RESTORATION=FAIL");
    emit("CLOUD_RUNTIME_ROLLBACK_TO_ABSENCE=UNPROVEN");
    return { pass: false, state: "BASELINE_UNAVAILABLE" };
  }
  const restored = await restoreApprovedRoutes({
    account,
    token,
    baseline,
    fetchImpl,
  });
  if (!restored.pass) {
    emit("ROLLBACK_ROUTE_RESTORATION=FAIL");
    emit("FIRST_RELEASE_ROLLBACK_FAILURE=" + restored.state);
    emit("CLOUD_RUNTIME_ROLLBACK_TO_ABSENCE=UNPROVEN");
    return restored;
  }
  emit("ROLLBACK_ROUTE_RESTORATION=PASS");
  if (cleanup === "LEAVE_RC10_UNROUTED") {
    emit("CLOUD_RUNTIME_ROLLBACK_TO_ABSENCE=NOT_REQUESTED");
    emit("FIRST_RELEASE_ROLLBACK=PASS");
    return { pass: true, state: "READY" };
  }
  if (cleanup !== "DELETE_RC10_FIRST_RELEASE_WORKERS") {
    emit("CLOUD_RUNTIME_ROLLBACK_TO_ABSENCE=UNPROVEN");
    return { pass: false, state: "CLEANUP_CONFIRMATION_INVALID" };
  }
  const deleted = await deleteFirstReleaseWorkers({
    account,
    token,
    baseline,
    routeRestored: true,
    fetchImpl,
  });
  emit("CLOUD_RUNTIME_ROLLBACK_TO_ABSENCE=" + (deleted.pass ? "PASS" : "FAIL"));
  if (!deleted.pass) {
    emit("FIRST_RELEASE_ROLLBACK_FAILURE=" + deleted.state);
    return deleted;
  }
  emit("FIRST_RELEASE_ROLLBACK=PASS");
  return deleted;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const result = await executeFirstReleaseRouteRollback();
  if (!result.pass) process.exitCode = 1;
}
