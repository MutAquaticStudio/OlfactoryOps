import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const candidateBrowserRoutePaths = [
  "/",
  "/login",
  "/signup",
  "/v2/login",
  "/v2/signup",
];

export const expectedReleaseSha = "de0734df2d2b5b2dd3a2a67ee542131235e75eb7";
export const expectedTenantUrl =
  "https://rc9-release-31736285494-469ca8942a.next.labofscents.org";
export const expectedPagesOrigin =
  "https://production-candidate.olfactoryops-v2-production-candidate.pages.dev";

const diagnosticQueryKey = "oo_candidate_browser_route_diag";

export function candidateBrowserRouteDiagnosticConfig(
  environment = process.env,
) {
  const releaseSha = environment.CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_RELEASE_SHA;
  const tenantUrl = environment.CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_TENANT_URL;
  const pagesOrigin =
    environment.CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC_PAGES_ORIGIN;
  if (
    releaseSha !== expectedReleaseSha ||
    tenantUrl !== expectedTenantUrl ||
    pagesOrigin !== expectedPagesOrigin
  )
    throw new Error("CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC=FAIL_INVALID_INPUT");

  return {
    releaseSha,
    tenant: new URL(tenantUrl),
    pages: new URL(pagesOrigin),
  };
}

function safeHttpStatus(response) {
  return Number.isInteger(response?.status) ? String(response.status) : "000";
}

function isHtml(response) {
  return (
    response?.headers
      ?.get("content-type")
      ?.toLowerCase()
      .startsWith("text/html") === true
  );
}

function candidateUrl(origin, pathname, nonce) {
  const url = new URL(pathname, origin);
  url.searchParams.set(diagnosticQueryKey, nonce);
  return url;
}

async function requestRoute(fetchFn, origin, pathname, nonce) {
  try {
    return await fetchFn(candidateUrl(origin, pathname, nonce), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
}

export async function probeCandidateBrowserRoutes({
  config,
  fetchFn = fetch,
  nonce = randomBytes(16).toString("hex"),
} = {}) {
  if (!config || !/^[a-f0-9]{32}$/i.test(nonce))
    throw new Error("CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC=FAIL_INVALID_INPUT");

  const routes = [];
  for (const path of candidateBrowserRoutePaths) {
    const [tenant, pages] = await Promise.all([
      requestRoute(fetchFn, config.tenant, path, nonce),
      requestRoute(fetchFn, config.pages, path, nonce),
    ]);
    routes.push({
      path,
      tenantHttpStatus: safeHttpStatus(tenant),
      tenantRouterActive:
        tenant?.headers?.get("x-olfactoryops-workspace-router") === "active",
      tenantReleaseShaMatch:
        tenant?.headers?.get("x-olfactoryops-release-sha") ===
        config.releaseSha,
      tenantContentTypeHtml: isHtml(tenant),
      pagesHttpStatus: safeHttpStatus(pages),
      pagesContentTypeHtml: isHtml(pages),
    });
  }
  return routes;
}

function routeIs200(route) {
  return route.tenantHttpStatus === "200" && route.pagesHttpStatus === "200";
}

function routerIdentityMatches(route) {
  return route.tenantRouterActive && route.tenantReleaseShaMatch;
}

function authAliasPairDiffers(routes, canonicalPath, aliasPath) {
  const canonical = routes.find((route) => route.path === canonicalPath);
  const alias = routes.find((route) => route.path === aliasPath);
  if (!canonical || !alias) return false;
  return (
    canonical.tenantHttpStatus !== alias.tenantHttpStatus ||
    canonical.tenantContentTypeHtml !== alias.tenantContentTypeHtml ||
    canonical.pagesHttpStatus !== alias.pagesHttpStatus ||
    canonical.pagesContentTypeHtml !== alias.pagesContentTypeHtml
  );
}

export function classifyCandidateBrowserRouteMatrix(routes) {
  const root = routes.find((route) => route.path === "/");
  const authRoutes = routes.filter((route) => route.path !== "/");
  const unclassified = {
    rootCause: "UNCLASSIFIED_CANDIDATE_BROWSER_ROUTE_MATRIX",
    rc10Required: "UNPROVEN",
    rc9SourceDefect: "UNPROVEN",
    nextAction: "COLLECT_ADDITIONAL_READ_ONLY_ROUTE_EVIDENCE",
  };
  if (!root || routes.length !== candidateBrowserRoutePaths.length)
    return unclassified;

  if (root.tenantHttpStatus !== "200" && !routerIdentityMatches(root))
    return {
      rootCause: "CANDIDATE_CUSTOM_DOMAIN_OR_ROUTER_INGRESS_REGRESSION",
      rc10Required: "NO",
      rc9SourceDefect: "NOT_APPLICABLE",
      nextAction: "INVESTIGATE_CANDIDATE_ROUTER_CONTROL_PLANE_ONLY",
    };

  const rootHealthy =
    routeIs200(root) && root.tenantRouterActive && root.tenantReleaseShaMatch;
  const routerPathFailure = routes.some(
    (route) =>
      route.tenantHttpStatus !== "200" &&
      route.pagesHttpStatus === "200" &&
      !routerIdentityMatches(route),
  );
  if (routerPathFailure)
    return {
      rootCause: "CANDIDATE_ROUTER_REQUEST_PATH_REGRESSION",
      rc10Required: "NO",
      rc9SourceDefect: "NOT_APPLICABLE",
      nextAction: "INVESTIGATE_CANDIDATE_ROUTER_OR_CONTROL_PLANE_STATE",
    };

  const pagesDeepLinkFailure = authRoutes.some(
    (route) =>
      route.tenantHttpStatus !== "200" && route.pagesHttpStatus !== "200",
  );
  if (rootHealthy && pagesDeepLinkFailure)
    return {
      rootCause: "CANDIDATE_PAGES_DEEP_LINK_ROUTING_FAILURE",
      rc10Required: "UNPROVEN",
      rc9SourceDefect: "UNPROVEN",
      nextAction:
        "INSPECT_EXACT_RC9_PAGES_ARTIFACT_AND_CANDIDATE_CONFIGURATION",
    };

  const authAliasesDiffer =
    authAliasPairDiffers(routes, "/login", "/v2/login") ||
    authAliasPairDiffers(routes, "/signup", "/v2/signup");
  if (rootHealthy && authAliasesDiffer)
    return {
      rootCause: "AUTH_ROUTE_OR_SPA_FALLBACK_DISCREPANCY",
      rc10Required: "UNPROVEN",
      rc9SourceDefect: "UNPROVEN",
      nextAction: "COMPARE_EXACT_AUTH_ALIAS_ARTIFACTS_BEFORE_SOURCE_CHANGE",
    };

  if (
    routes.every((route) => routeIs200(route) && routerIdentityMatches(route))
  )
    return {
      rootCause: "BROWSER_ONLY_OR_TRANSIENT_ACCEPTANCE_FAILURE",
      rc10Required: "NO",
      rc9SourceDefect: "NOT_APPLICABLE",
      nextAction: "RUN_ONE_BOUNDED_PLAYWRIGHT_ROUTE_DIAGNOSTIC",
    };

  return unclassified;
}

export function safeRouteMatrixLines(routes, classification) {
  const lines = [];
  for (const route of routes) {
    lines.push(`PATH=${route.path}`);
    lines.push(`TENANT_HTTP_STATUS=${route.tenantHttpStatus}`);
    lines.push(`TENANT_ROUTER_ACTIVE=${route.tenantRouterActive}`);
    lines.push(`TENANT_RELEASE_SHA_MATCH=${route.tenantReleaseShaMatch}`);
    lines.push(`TENANT_CONTENT_TYPE_HTML=${route.tenantContentTypeHtml}`);
    lines.push(`PAGES_HTTP_STATUS=${route.pagesHttpStatus}`);
    lines.push(`PAGES_CONTENT_TYPE_HTML=${route.pagesContentTypeHtml}`);
  }
  lines.push(`ROOT_CAUSE_CLASS=${classification.rootCause}`);
  lines.push(`RC10_REQUIRED=${classification.rc10Required}`);
  lines.push(`RC9_SOURCE_DEFECT=${classification.rc9SourceDefect}`);
  lines.push(`NEXT_ACTION=${classification.nextAction}`);
  return lines;
}

export async function runCandidateBrowserRouteDiagnostic(
  environment = process.env,
) {
  const config = candidateBrowserRouteDiagnosticConfig(environment);
  const routes = await probeCandidateBrowserRoutes({ config });
  const classification = classifyCandidateBrowserRouteMatrix(routes);
  for (const line of safeRouteMatrixLines(routes, classification))
    console.log(line);
  console.log("CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC=COMPLETE");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await runCandidateBrowserRouteDiagnostic();
  } catch {
    console.log("CANDIDATE_BROWSER_ROUTE_DIAGNOSTIC=FAIL_INVALID_INPUT");
    process.exitCode = 1;
  }
}
