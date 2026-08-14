const diagnosticTokenHeader = "x-olfactoryops-router-request-path-diagnostic";

export type RouterRequestPathProbeTarget = "TARGET_ROUTER" | "SHADOW_ROUTER";

export type RouterRequestPathDiagnosticEnv = {
  ROUTER_REQUEST_PATH_DIAGNOSTIC_TOKEN: string;
  DIAGNOSTIC_FIXTURE_HOSTNAME: string;
  TARGET_RELEASE_SHA: string;
  DIAGNOSTIC_CORRELATION_NONCE: string;
  DIAGNOSTIC_PROBE_TARGET: RouterRequestPathProbeTarget;
  DIAGNOSTIC_PROBE_QUERY_KEY: "oo_service_diag" | "oo_shadow_diag";
  TARGET_ROUTER: Fetcher;
  SHADOW_ROUTER?: Fetcher;
};

export type RouterRequestPathProbe = {
  candidateRouterRequestPathDiagnostic: "COMPLETE";
  probeTarget: RouterRequestPathProbeTarget;
  targetStatusClass: "2XX" | "404" | "503" | "OTHER";
  targetRouterHeaderActive: boolean;
  targetReleaseEnvironmentProduction: boolean;
  targetReleaseShaMatch: boolean;
  targetCacheControlPresent: boolean;
  targetBodyClass: "NOT_FOUND" | "SERVICE_UNAVAILABLE" | "OTHER";
};

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

function unavailable() {
  return Response.json(
    { candidateRouterRequestPathDiagnostic: "UNAVAILABLE" },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

function equalSecret(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function validFixtureHostname(hostname: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/.test(
    hostname,
  );
}

function validReleaseSha(value: string) {
  return /^[a-f0-9]{40}$/i.test(value);
}

function validNonce(value: string) {
  return /^[a-f0-9]{32}$/i.test(value);
}

function statusClass(
  status: number,
): RouterRequestPathProbe["targetStatusClass"] {
  if (status >= 200 && status < 300) return "2XX";
  if (status === 404) return "404";
  if (status === 503) return "503";
  return "OTHER";
}

function bodyClass(status: number): RouterRequestPathProbe["targetBodyClass"] {
  if (status === 404) return "NOT_FOUND";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  return "OTHER";
}

function targetFor(env: RouterRequestPathDiagnosticEnv) {
  if (env.DIAGNOSTIC_PROBE_TARGET === "TARGET_ROUTER") return env.TARGET_ROUTER;
  if (env.DIAGNOSTIC_PROBE_TARGET === "SHADOW_ROUTER" && env.SHADOW_ROUTER)
    return env.SHADOW_ROUTER;
  return null;
}

function authenticated(request: Request, env: RouterRequestPathDiagnosticEnv) {
  const provided = request.headers.get(diagnosticTokenHeader);
  return (
    typeof provided === "string" &&
    typeof env.ROUTER_REQUEST_PATH_DIAGNOSTIC_TOKEN === "string" &&
    equalSecret(provided, env.ROUTER_REQUEST_PATH_DIAGNOSTIC_TOKEN)
  );
}

export function createRouterRequestPathDiagnostic(
  targetFetch?: (target: Fetcher, request: Request) => Promise<Response>,
) {
  const invokeTarget =
    targetFetch ?? ((target, request) => target.fetch(request));
  return {
    async fetch(
      request: Request,
      env: RouterRequestPathDiagnosticEnv,
    ): Promise<Response> {
      if (!authenticated(request, env)) return notFound();

      const path = new URL(request.url).pathname;
      if (path === "/ready")
        return Response.json(
          { candidateRouterRequestPathDiagnostic: "READY" },
          { headers: { "cache-control": "no-store" } },
        );
      if (path !== "/probe") return notFound();

      try {
        if (
          !validFixtureHostname(env.DIAGNOSTIC_FIXTURE_HOSTNAME) ||
          !validReleaseSha(env.TARGET_RELEASE_SHA) ||
          !validNonce(env.DIAGNOSTIC_CORRELATION_NONCE) ||
          !["oo_service_diag", "oo_shadow_diag"].includes(
            env.DIAGNOSTIC_PROBE_QUERY_KEY,
          )
        )
          return unavailable();

        const target = targetFor(env);
        if (!target) return unavailable();

        const targetUrl = new URL(
          `https://${env.DIAGNOSTIC_FIXTURE_HOSTNAME}/`,
        );
        targetUrl.searchParams.set(
          env.DIAGNOSTIC_PROBE_QUERY_KEY,
          env.DIAGNOSTIC_CORRELATION_NONCE,
        );
        const targetResponse = await invokeTarget(
          target,
          new Request(targetUrl, {
            method: "GET",
            headers: {
              "cache-control": "no-cache",
              pragma: "no-cache",
            },
            redirect: "manual",
          }),
        );
        const body: RouterRequestPathProbe = {
          candidateRouterRequestPathDiagnostic: "COMPLETE",
          probeTarget: env.DIAGNOSTIC_PROBE_TARGET,
          targetStatusClass: statusClass(targetResponse.status),
          targetRouterHeaderActive:
            targetResponse.headers.get("x-olfactoryops-workspace-router") ===
            "active",
          targetReleaseEnvironmentProduction:
            targetResponse.headers.get("x-olfactoryops-release-environment") ===
            "production",
          targetReleaseShaMatch:
            targetResponse.headers.get("x-olfactoryops-release-sha") ===
            env.TARGET_RELEASE_SHA,
          targetCacheControlPresent:
            targetResponse.headers.has("cache-control"),
          targetBodyClass: bodyClass(targetResponse.status),
        };
        return Response.json(body, {
          headers: { "cache-control": "no-store" },
        });
      } catch {
        return unavailable();
      }
    },
  };
}

export default createRouterRequestPathDiagnostic() satisfies ExportedHandler<RouterRequestPathDiagnosticEnv>;
