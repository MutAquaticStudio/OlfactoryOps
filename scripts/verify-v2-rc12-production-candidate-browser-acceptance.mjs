import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

export const RC12_SHA = "331c1a6054fe1420b063a2e1fe9e5cef4f043ff8";
export const CANDIDATE_PUBLIC_AUTH_ORIGIN = "https://next.labofscents.org";

const apiOrigin = "https://api-next.labofscents.org";
const paths = ["/", "/login", "/signup", "/v2/login", "/v2/signup"];
export const AUTH_TRANSPORT_PATHS = Object.freeze({
  login: "/api/v1/v2/platform/auth/login",
  signup: "/api/v1/v2/platform/auth/signup",
});

export function browserAuthTransportIsExpected(result) {
  return (
    result?.login?.status >= 400 &&
    result.login.status <= 499 &&
    result.login.json === true &&
    result.login.opaque === false &&
    result.login.urlMatch === true &&
    result?.signup?.status >= 400 &&
    result.signup.status <= 499 &&
    result.signup.json === true &&
    result.signup.opaque === false &&
    result.signup.urlMatch === true &&
    result.loginPreflight === true &&
    result.signupPreflight === true &&
    result.rawNetworkErrors === 0
  );
}

export function candidateBrowserInputs(environment = process.env) {
  const releaseSha = environment.V2_PRODUCTION_CANDIDATE_EXPECTED_SHA?.trim().toLowerCase();
  const tenantUrl = environment.V2_PRODUCTION_CANDIDATE_TENANT_URL?.trim();
  if (releaseSha !== RC12_SHA || !tenantUrl) throw new Error("INVALID_INPUT");

  let tenant;
  try {
    tenant = new URL(tenantUrl);
  } catch {
    throw new Error("INVALID_INPUT");
  }
  if (
    tenant.protocol !== "https:"
    || tenant.port
    || tenant.username
    || tenant.password
    || tenant.pathname !== "/"
    || tenant.search
    || tenant.hash
    || tenant.hostname === "next.labofscents.org"
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/.test(tenant.hostname)
    || (tenantUrl !== tenant.origin && tenantUrl !== `${tenant.origin}/`)
  ) throw new Error("INVALID_INPUT");

  return { releaseSha, tenant, tenantUrl: tenant.origin, publicAuthOrigin: CANDIDATE_PUBLIC_AUTH_ORIGIN };
}

function fail(stage, code) {
  console.log(`CANDIDATE_BROWSER_ACCEPTANCE_STAGE=${stage}`);
  console.log(`CANDIDATE_BROWSER_ACCEPTANCE_FAILURE=${code}`);
  process.exitCode = 1;
}

function required(condition, code) {
  if (!condition) throw new Error(code);
}

async function expectPublicAuthRedirect(page, button, expectedPath) {
  const target = new URL(expectedPath, CANDIDATE_PUBLIC_AUTH_ORIGIN).toString();
  const navigation = page.waitForRequest(
    (request) => request.isNavigationRequest() && request.url() === target,
    { timeout: 15_000 },
  );
  await button.click();
  await navigation;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
let stage = "INVALID_INPUT";
try {
  const { tenant, tenantUrl } = candidateBrowserInputs();
  stage = "BROWSER_LAUNCH_UNAVAILABLE";
  const browser = await chromium.launch({ headless: true });
  try {
    for (const path of paths) {
      stage = "BROWSER_CONTEXT_CREATE_FAILURE";
      const context = await browser.newContext();
      stage = "BROWSER_PAGE_CREATE_FAILURE";
      const page = await context.newPage();
      let runtimeError = false;
      page.on("pageerror", () => (runtimeError = true));
      page.on("console", (message) => {
        if (message.type() === "error") runtimeError = true;
      });
      stage = "ROUTE_NAVIGATION_FAILURE";
      const response = await page.goto(new URL(path, tenant).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
      required(response?.status() === 200 && new URL(page.url()).host === tenant.host, "ROUTE_NAVIGATION_FAILURE");
      stage = "ROUTE_RENDER_FAILURE";
      if (path === "/") required(await page.getByText("OlfactoryOps").first().isVisible(), "ROUTE_RENDER_FAILURE");
      else {
        const card = page.getByTestId("v2-auth-card");
        required(await card.isVisible(), "ROUTE_RENDER_FAILURE");
        const heading = await card.locator("h1").textContent();
        required(path.includes("signup") ? /create|sign up/i.test(heading ?? "") : /sign in/i.test(heading ?? ""), "ROUTE_RENDER_FAILURE");
      }
      stage = "ROUTE_RUNTIME_ERROR";
      required(!runtimeError, "ROUTE_RUNTIME_ERROR");
      await context.close();
    }

    stage = "AUTH_REDIRECT_CONTEXT_CREATE_FAILURE";
    const redirectContext = await browser.newContext();
    const redirectPage = await redirectContext.newPage();
    stage = "AUTH_REDIRECT_NAVIGATION_FAILURE";
    const landingResponse = await redirectPage.goto(tenantUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    required(landingResponse?.status() === 200, "AUTH_REDIRECT_NAVIGATION_FAILURE");
    stage = "LOGIN_WORKSPACE_REDIRECT_FAILURE";
    await expectPublicAuthRedirect(redirectPage, redirectPage.locator(".landing-nav-actions").getByRole("button", { name: /sign in/i }), "/login");
    console.log("LOGIN_WORKSPACE_REDIRECT=PASS");
    await redirectContext.close();

    stage = "SIGNUP_REDIRECT_CONTEXT_CREATE_FAILURE";
    const signupContext = await browser.newContext();
    const signupPage = await signupContext.newPage();
    const signupLandingResponse = await signupPage.goto(tenantUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    required(signupLandingResponse?.status() === 200, "SIGNUP_REDIRECT_CONTEXT_CREATE_FAILURE");
    stage = "SIGNUP_WORKSPACE_REDIRECT_FAILURE";
    await expectPublicAuthRedirect(signupPage, signupPage.locator(".landing-nav-actions").locator(".landing-cta"), "/signup");
    console.log("SIGNUP_WORKSPACE_REDIRECT=PASS");
    await signupContext.close();

    stage = "BUNDLE_CONTEXT_CREATE_FAILURE";
    const bundleContext = await browser.newContext();
    stage = "BROWSER_PAGE_CREATE_FAILURE";
    const bundlePage = await bundleContext.newPage();
    stage = "BUNDLE_NAVIGATION_FAILURE";
    await bundlePage.goto(tenantUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    stage = "BUNDLE_SOURCE_FETCH_FAILURE";
    const configured = await bundlePage.evaluate(async (origin) => {
      const sources = Array.from(document.scripts).map((script) => script.src).filter(Boolean);
      const bundles = await Promise.all(sources.map(async (source) => (await fetch(source)).text()));
      return bundles.some((bundle) => bundle.includes(`${origin}/api/v1`));
    }, apiOrigin);
    required(configured, "BUNDLE_API_ORIGIN_FAILURE");
    await bundleContext.close();

    stage = "API_CONTEXT_CREATE_FAILURE";
    const apiContext = await browser.newContext();
    stage = "API_PAGE_CREATE_FAILURE";
    const apiPage = await apiContext.newPage();
    const apiUrl = `${apiOrigin}/api/v1/v2/platform/me`;
    stage = "API_CONTEXT_NAVIGATION_FAILURE";
    const apiNavigation = await apiPage.goto(tenantUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    required(apiNavigation?.status() === 200 && new URL(apiPage.url()).host === tenant.host, "API_CONTEXT_NAVIGATION_FAILURE");
    stage = "API_SESSION_PROBE_FAILURE";
    const apiAccepted = await apiPage.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      return response.status === 401 && response.url === url;
    }, apiUrl);
    required(apiAccepted, "API_SESSION_BOUNDARY_FAILURE");
    await apiContext.close();

    stage = "AUTH_TRANSPORT_CONTEXT_CREATE_FAILURE";
    const authTransportContext = await browser.newContext();
    const authTransportPage = await authTransportContext.newPage();
    const authTransportCdp = await authTransportContext.newCDPSession(
      authTransportPage,
    );
    await authTransportCdp.send("Network.enable");
    const loginUrl = `${apiOrigin}${AUTH_TRANSPORT_PATHS.login}`;
    const signupUrl = `${apiOrigin}${AUTH_TRANSPORT_PATHS.signup}`;
    const authUrls = new Set([loginUrl, signupUrl]);
    let rawAuthNetworkErrors = 0;
    let loginPreflight = false;
    let signupPreflight = false;
    authTransportPage.on("requestfailed", (request) => {
      if (authUrls.has(request.url())) rawAuthNetworkErrors += 1;
    });
    authTransportCdp.on("Network.responseReceived", ({ type, response }) => {
      if (
        type !== "Preflight" ||
        response.status < 200 ||
        response.status > 299
      )
        return;
      if (response.url === loginUrl) loginPreflight = true;
      if (response.url === signupUrl) signupPreflight = true;
    });
    stage = "AUTH_TRANSPORT_NAVIGATION_FAILURE";
    const authNavigation = await authTransportPage.goto(tenantUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    required(
      authNavigation?.status() === 200 &&
        new URL(authTransportPage.url()).host === tenant.host,
      "AUTH_TRANSPORT_NAVIGATION_FAILURE",
    );
    stage = "AUTH_TRANSPORT_PROBE_FAILURE";
    const transport = await authTransportPage.evaluate(
      async ({ login, signup }) => {
        const probe = async (url, body) => {
          try {
            const response = await fetch(url, {
              method: "POST",
              credentials: "include",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            });
            const contentType = response.headers.get("content-type") ?? "";
            let json = false;
            if (/^application\/json\b/i.test(contentType)) {
              try {
                const value = JSON.parse(await response.text());
                json = value !== null && typeof value === "object";
              } catch {
                json = false;
              }
            }
            return {
              status: response.status,
              json,
              opaque: response.type === "opaque",
              urlMatch: response.url === url,
            };
          } catch {
            return { status: 0, json: false, opaque: false, urlMatch: false };
          }
        };
        return {
          login: await probe(login, {
            email: "invalid-auth-transport",
            password: "invalid",
          }),
          signup: await probe(signup, {
            organizationName: "",
            workspaceSlug: "",
            displayName: "",
            email: "invalid-auth-transport",
            password: "invalid",
          }),
        };
      },
      { login: loginUrl, signup: signupUrl },
    );
    const authTransport = {
      ...transport,
      loginPreflight,
      signupPreflight,
      rawNetworkErrors: rawAuthNetworkErrors,
    };
    console.log(`BROWSER_LOGIN_POST_HTTP_STATUS=${authTransport.login.status}`);
    console.log(`BROWSER_LOGIN_POST_JSON=${authTransport.login.json ? "YES" : "NO"}`);
    console.log(`BROWSER_SIGNUP_POST_HTTP_STATUS=${authTransport.signup.status}`);
    console.log(`BROWSER_SIGNUP_POST_JSON=${authTransport.signup.json ? "YES" : "NO"}`);
    console.log(`BROWSER_LOGIN_PREFLIGHT=${loginPreflight ? "PASS" : "FAIL"}`);
    console.log(`BROWSER_SIGNUP_PREFLIGHT=${signupPreflight ? "PASS" : "FAIL"}`);
    console.log(`RAW_AUTH_NETWORK_ERRORS_VISIBLE=${rawAuthNetworkErrors}`);
    required(
      browserAuthTransportIsExpected(authTransport),
      "AUTH_TRANSPORT_PROBE_FAILURE",
    );
    await authTransportCdp.detach();
    await authTransportContext.close();
    console.log("BROWSER_LOGIN_POST_TRANSPORT=PASS");
    console.log("BROWSER_SIGNUP_POST_TRANSPORT=PASS");
    console.log("BROWSER_AUTH_PREFLIGHT_CORS=PASS");
    console.log("FAILED_TO_FETCH_REPRODUCED=NO");
    console.log("CANDIDATE_PUBLIC_AUTH_REDIRECT=PASS");
    console.log("CANDIDATE_BROWSER_ACCEPTANCE=PASS");
  } finally {
    await browser.close();
  }
} catch (error) {
  fail(stage, error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : stage);
}
}
