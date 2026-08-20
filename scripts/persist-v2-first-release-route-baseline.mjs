import { chmodSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  FIRST_RELEASE_BASELINE_VARIABLE,
  captureFirstReleaseRouteBaseline,
  parseBaseline,
  sameBaseline,
  serializeBaseline,
} from "./v2-first-release-route-policy.mjs";

const githubApi = "https://api.github.com";

export async function persistFirstReleaseRouteBaseline({
  environment = process.env,
  fetchImpl = fetch,
  emit = (line) => console.log(line),
} = {}) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = environment.CLOUDFLARE_API_TOKEN?.trim();
  const releaseSha = environment.RELEASE_SHA?.trim();
  const repository = environment.GITHUB_REPOSITORY?.trim();
  const githubToken = environment.GITHUB_TOKEN?.trim();
  const outputFile = environment.FIRST_RELEASE_BASELINE_FILE?.trim();
  if (
    !account ||
    !token ||
    !releaseSha ||
    !repository ||
    !githubToken ||
    !outputFile
  ) {
    return emitFailure(emit, "CREDENTIAL_OR_CONTEXT_UNAVAILABLE");
  }

  const captured = await captureFirstReleaseRouteBaseline({
    account,
    token,
    releaseSha,
    fetchImpl,
  });
  if (!captured.pass) return emitFailure(emit, captured.state);

  const stored = await readEnvironmentVariable({
    repository,
    githubToken,
    fetchImpl,
  });
  if (stored.state === "UNPROVEN")
    return emitFailure(emit, "PERSISTENCE_UNPROVEN");
  if (stored.value) {
    const existing = parseBaseline(stored.value);
    if (!existing || !sameBaseline(existing, captured.manifest)) {
      return emitFailure(emit, "CUTOVER_ROUTE_BASELINE_DRIFT");
    }
  } else {
    const created = await createEnvironmentVariable({
      repository,
      githubToken,
      value: serializeBaseline(captured.manifest),
      fetchImpl,
    });
    if (!created) return emitFailure(emit, "PERSISTENCE_UNPROVEN");
  }

  writeFileSync(outputFile, serializeBaseline(captured.manifest), {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(outputFile, 0o600);
  emit("PRECUTOVER_ROUTE_BASELINE=PASS");
  emit("PREVIOUS_API_ROUTE_TARGET_PROVEN=PASS");
  emit("PREVIOUS_TENANT_ROUTER_ROUTE_TARGET_PROVEN=PASS");
  emit(
    "FIRST_RELEASE_BASELINE_PERSISTENCE=" +
      (stored.value ? "VERIFIED" : "CREATED"),
  );
  emit("FIRST_RELEASE_BASELINE_FINGERPRINT=" + captured.fingerprint);
  return { pass: true, fingerprint: captured.fingerprint };
}

async function readEnvironmentVariable({ repository, githubToken, fetchImpl }) {
  const response = await githubRequest({
    repository,
    githubToken,
    fetchImpl,
    path:
      "/environments/production/variables/" + FIRST_RELEASE_BASELINE_VARIABLE,
  });
  if (response.status === 404) return { state: "ABSENT" };
  if (!response.ok || typeof response.body?.value !== "string") {
    return { state: "UNPROVEN" };
  }
  return { state: "PRESENT", value: response.body.value };
}

async function createEnvironmentVariable({
  repository,
  githubToken,
  value,
  fetchImpl,
}) {
  const response = await githubRequest({
    repository,
    githubToken,
    fetchImpl,
    method: "POST",
    path: "/environments/production/variables",
    body: { name: FIRST_RELEASE_BASELINE_VARIABLE, value },
  });
  return response.ok;
}

async function githubRequest({
  repository,
  githubToken,
  fetchImpl,
  path,
  method = "GET",
  body,
}) {
  try {
    const response = await fetchImpl(
      githubApi + "/repos/" + repository + path,
      {
        method,
        headers: {
          authorization: "Bearer " + githubToken,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20_000),
      },
    );
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    return { ok: Boolean(response.ok), status: response.status, body: payload };
  } catch {
    return { ok: false, status: 0, body: undefined };
  }
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
