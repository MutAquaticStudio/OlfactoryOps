import { randomBytes } from "node:crypto";

export const candidateBrowserRuntimeExpectation = Object.freeze({
  releaseSha: "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  tenantUrl: "https://rc9-release-31736285494-469ca8942a.next.labofscents.org",
  apiOrigin: "https://api-next.labofscents.org",
});

export const candidateBrowserRuntimePaths = Object.freeze([
  "/",
  "/login",
  "/signup",
  "/v2/login",
  "/v2/signup",
]);

function safeStatus(response) {
  return Number.isInteger(response?.status) &&
    response.status >= 100 &&
    response.status <= 599
    ? String(response.status)
    : "000";
}

function isHtml(response) {
  return /^text\/html(?:;|$)/i.test(
    response?.headers?.get?.("content-type") ?? "",
  );
}

export function candidateBrowserRuntimeConfig(environment = process.env) {
  if (
    environment.CANDIDATE_BROWSER_RUNTIME_RELEASE_SHA !==
      candidateBrowserRuntimeExpectation.releaseSha ||
    environment.CANDIDATE_BROWSER_RUNTIME_TENANT_URL !==
      candidateBrowserRuntimeExpectation.tenantUrl
  )
    throw new Error("CANDIDATE_BROWSER_RUNTIME_DIAGNOSTIC=FAIL_INVALID_INPUT");
  return {
    releaseSha: candidateBrowserRuntimeExpectation.releaseSha,
    tenant: new URL(candidateBrowserRuntimeExpectation.tenantUrl),
  };
}

function requestUrl(config, path, nonce) {
  const url = new URL(path, config.tenant);
  url.searchParams.set("oo_browser_runtime", nonce);
  return url;
}

export async function probeCandidateBrowserRuntimeRoutes({
  config,
  fetchFn = fetch,
  nonce = randomBytes(12).toString("hex"),
} = {}) {
  if (!config || !/^[a-f0-9]{24}$/i.test(nonce))
    throw new Error("CANDIDATE_BROWSER_RUNTIME_DIAGNOSTIC=FAIL_INVALID_INPUT");
  const routes = [];
  for (const path of candidateBrowserRuntimePaths) {
    let response;
    try {
      response = await fetchFn(requestUrl(config, path, nonce), {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: { "cache-control": "no-cache", pragma: "no-cache" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      response = undefined;
    }
    routes.push({
      path,
      httpStatus: safeStatus(response),
      html: isHtml(response),
      routerActive:
        response?.headers?.get?.("x-olfactoryops-workspace-router") ===
        "active",
      environmentProduction:
        response?.headers?.get?.("x-olfactoryops-release-environment") ===
        "production",
      releaseShaMatch:
        response?.headers?.get?.("x-olfactoryops-release-sha") ===
        config.releaseSha,
    });
  }
  return routes;
}

export function browserRuntimeHttpAccepted(routes) {
  return (
    Array.isArray(routes) &&
    routes.length === candidateBrowserRuntimePaths.length &&
    routes.every(
      (route) =>
        route.httpStatus === "200" &&
        route.html &&
        route.routerActive &&
        route.environmentProduction &&
        route.releaseShaMatch,
    )
  );
}

export function classifyCandidateBrowserRuntime({
  httpAccepted,
  browserRoutes,
}) {
  if (!httpAccepted) return "CANDIDATE_BROWSER_ROUTE_OR_IDENTITY_FAILURE";
  if (!Array.isArray(browserRoutes))
    return "CANDIDATE_BROWSER_RUNTIME_UNPROVEN";
  if (
    browserRoutes.some(
      (route) => route.pageError === "YES" || route.consoleError === "YES",
    )
  )
    return "CANDIDATE_BROWSER_RUNTIME_ERRORS_OBSERVED";
  if (
    browserRoutes.some(
      (route) =>
        route.finalHostMatch !== "YES" ||
        (route.path === "/"
          ? route.rootVisible !== "YES"
          : route.authCardVisible !== "YES"),
    )
  )
    return "CANDIDATE_BROWSER_RENDERING_CONTRACT_FAILURE";
  return "CANDIDATE_BROWSER_RUNTIME_HEALTHY";
}

export function classifyCandidateBrowserSmokeParity(parity) {
  if (parity.execution !== "PASS")
    return "CANDIDATE_BROWSER_SMOKE_PARITY_UNAVAILABLE";
  if (parity.routeContract !== "PASS")
    return "CANDIDATE_BROWSER_SMOKE_PARITY_ROUTE_FAILURE";
  if (parity.bundleApiOriginConfigured !== "YES")
    return "CANDIDATE_BROWSER_SMOKE_PARITY_API_ORIGIN_FAILURE";
  if (parity.apiSessionBoundary !== "PASS")
    return "CANDIDATE_BROWSER_SMOKE_PARITY_API_SESSION_FAILURE";
  if (parity.routeRuntimeErrors !== "NO")
    return "CANDIDATE_BROWSER_SMOKE_PARITY_ROUTE_RUNTIME_ERRORS";
  if (parity.bundleRuntimeErrors !== "NO")
    return "CANDIDATE_BROWSER_SMOKE_PARITY_BUNDLE_RUNTIME_ERRORS";
  if (parity.apiRuntimeErrors !== "NO")
    return "CANDIDATE_BROWSER_SMOKE_PARITY_API_RUNTIME_ERRORS";
  return "CANDIDATE_BROWSER_SMOKE_PARITY_HEALTHY";
}

function print(name, value) {
  const routePath =
    (name === "PATH" || name === "BROWSER_PATH") &&
    candidateBrowserRuntimePaths.includes(value)
      ? value
      : undefined;
  const safe =
    routePath ??
    (typeof value === "boolean"
      ? value
        ? "YES"
        : "NO"
      : typeof value === "string" && /^[A-Z0-9_/]+$/.test(value)
        ? value
        : "UNPROVEN");
  console.log(`${name}=${safe}`);
}

function browserErrorsSince(errors, position) {
  return errors.length === position ? "NO" : "YES";
}

export async function inspectCandidateBrowserSmokeParity({ config, chromium }) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", () => errors.push("PAGE_ERROR"));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push("CONSOLE_ERROR");
    });
    let routeContract = "PASS";
    for (const path of candidateBrowserRuntimePaths) {
      const response = await page
        .goto(requestUrl(config, path, randomBytes(12).toString("hex")).toString(), {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        })
        .catch(() => undefined);
      if (response?.status() !== 200) routeContract = "FAIL";
      const visible =
        path === "/"
          ? await page.getByText("OlfactoryOps").first().isVisible().catch(() => false)
          : await page.getByTestId("v2-auth-card").isVisible().catch(() => false);
      if (!visible) routeContract = "FAIL";
    }
    const routeRuntimeErrors = browserErrorsSince(errors, 0);
    const bundleErrorsStart = errors.length;
    const bundleApiOriginConfigured = await page
      .evaluate(async (expectedApiOrigin) => {
        const sources = Array.from(document.scripts)
          .map((script) => script.src)
          .filter(Boolean);
        const bundles = await Promise.all(
          sources.map(async (source) => (await fetch(source)).text()),
        );
        return bundles.some((bundle) => bundle.includes(`${expectedApiOrigin}/api/v1`));
      }, config.apiOrigin)
      .then((configured) => (configured ? "YES" : "NO"))
      .catch(() => "NO");
    const bundleRuntimeErrors = browserErrorsSince(errors, bundleErrorsStart);
    const apiErrorsStart = errors.length;
    const expectedApiUrl = new URL("/api/v1/v2/platform/me", config.apiOrigin).toString();
    const apiSessionBoundary = await page
      .evaluate(async (url) => {
        const response = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        return response.status === 401 && response.url === url;
      }, expectedApiUrl)
      .then((expected) => (expected ? "PASS" : "FAIL"))
      .catch(() => "FAIL");
    const apiRuntimeErrors = browserErrorsSince(errors, apiErrorsStart);
    await context.close();
    return {
      execution: "PASS",
      routeContract,
      bundleApiOriginConfigured,
      apiSessionBoundary,
      routeRuntimeErrors,
      bundleRuntimeErrors,
      apiRuntimeErrors,
    };
  } catch {
    return {
      execution: "UNAVAILABLE",
      routeContract: "UNPROVEN",
      bundleApiOriginConfigured: "UNPROVEN",
      apiSessionBoundary: "UNPROVEN",
      routeRuntimeErrors: "UNPROVEN",
      bundleRuntimeErrors: "UNPROVEN",
      apiRuntimeErrors: "UNPROVEN",
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function printHttpRoutes(routes) {
  for (const route of routes) {
    print("PATH", route.path);
    print("HTTP_STATUS", route.httpStatus);
    print("HTML", route.html);
    print("ROUTER_ACTIVE", route.routerActive);
    print("RELEASE_ENVIRONMENT_PRODUCTION", route.environmentProduction);
    print("RELEASE_SHA_MATCH", route.releaseShaMatch);
  }
}

export async function inspectBrowserRuntimeWithPlaywright({
  config,
  chromium,
}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const routes = [];
    for (const path of candidateBrowserRuntimePaths) {
      const context = await browser.newContext();
      const page = await context.newPage();
      let pageError = false;
      let consoleError = false;
      page.on("pageerror", () => {
        pageError = true;
      });
      page.on("console", (message) => {
        if (message.type() === "error") consoleError = true;
      });
      let response;
      try {
        response = await page.goto(
          requestUrl(config, path, randomBytes(12).toString("hex")).toString(),
          {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          },
        );
      } catch {
        response = undefined;
      }
      let finalHostMatch = false;
      try {
        finalHostMatch = new URL(page.url()).host === config.tenant.host;
      } catch {
        finalHostMatch = false;
      }
      const rootVisible =
        path === "/"
          ? await page
              .getByText("OlfactoryOps")
              .first()
              .isVisible()
              .catch(() => false)
          : false;
      const authCardVisible =
        path === "/"
          ? "NOT_APPLICABLE"
          : (await page
                .getByTestId("v2-auth-card")
                .isVisible()
                .catch(() => false))
            ? "YES"
            : "NO";
      routes.push({
        path,
        navigationStatus: safeStatus({ status: response?.status() }),
        finalHostMatch: finalHostMatch ? "YES" : "NO",
        rootVisible: rootVisible
          ? "YES"
          : path === "/"
            ? "NO"
            : "NOT_APPLICABLE",
        authCardVisible,
        pageError: pageError ? "YES" : "NO",
        consoleError: consoleError ? "YES" : "NO",
      });
      await context.close();
    }
    return routes;
  } finally {
    await browser.close();
  }
}

async function main() {
  const config = candidateBrowserRuntimeConfig();
  const httpRoutes = await probeCandidateBrowserRuntimeRoutes({ config });
  printHttpRoutes(httpRoutes);
  const httpAccepted = browserRuntimeHttpAccepted(httpRoutes);
  print("CANDIDATE_BROWSER_RUNTIME_HTTP_GATE", httpAccepted ? "PASS" : "FAIL");
  if (!httpAccepted) {
    print("ROOT_CAUSE", classifyCandidateBrowserRuntime({ httpAccepted }));
    return;
  }
  const { chromium } = await import("playwright");
  const browserRoutes = await inspectBrowserRuntimeWithPlaywright({
    config,
    chromium,
  });
  for (const route of browserRoutes) {
    print("BROWSER_PATH", route.path);
    print("BROWSER_NAVIGATION_STATUS", route.navigationStatus);
    print("BROWSER_FINAL_HOST_MATCH", route.finalHostMatch);
    print("BROWSER_ROOT_VISIBLE", route.rootVisible);
    print("BROWSER_AUTH_CARD_VISIBLE", route.authCardVisible);
    print("BROWSER_PAGE_ERROR", route.pageError);
    print("BROWSER_CONSOLE_ERROR", route.consoleError);
  }
  print(
    "ROOT_CAUSE",
    classifyCandidateBrowserRuntime({ httpAccepted, browserRoutes }),
  );
  const parity = await inspectCandidateBrowserSmokeParity({ config, chromium });
  print("SMOKE_PARITY_EXECUTION", parity.execution);
  print("SMOKE_PARITY_ROUTE_CONTRACT", parity.routeContract);
  print("SMOKE_PARITY_BUNDLE_API_ORIGIN_CONFIGURED", parity.bundleApiOriginConfigured);
  print("SMOKE_PARITY_API_SESSION_BOUNDARY", parity.apiSessionBoundary);
  print("SMOKE_PARITY_ROUTE_RUNTIME_ERRORS", parity.routeRuntimeErrors);
  print("SMOKE_PARITY_BUNDLE_RUNTIME_ERRORS", parity.bundleRuntimeErrors);
  print("SMOKE_PARITY_API_RUNTIME_ERRORS", parity.apiRuntimeErrors);
  print("SMOKE_PARITY_ROOT_CAUSE", classifyCandidateBrowserSmokeParity(parity));
  print("CANDIDATE_BROWSER_RUNTIME_DIAGNOSTIC", "COMPLETE");
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    print("CANDIDATE_BROWSER_RUNTIME_DIAGNOSTIC", "UNAVAILABLE");
    process.exitCode = 1;
  }
}
