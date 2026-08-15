import { chromium } from "playwright";

const releaseSha = process.env.V2_PRODUCTION_CANDIDATE_EXPECTED_SHA;
const tenantUrl = process.env.V2_PRODUCTION_CANDIDATE_TENANT_URL;
const apiOrigin = "https://api-next.labofscents.org";
const paths = ["/", "/login", "/signup", "/v2/login", "/v2/signup"];

function fail(code) {
  console.log(`CANDIDATE_BROWSER_ACCEPTANCE_FAILURE=${code}`);
  process.exitCode = 1;
}

function required(condition, code) {
  if (!condition) throw new Error(code);
}

try {
  required(releaseSha === "de0734df2d2b5b2dd3a2a67ee542131235e75eb7", "INVALID_INPUT");
  required(tenantUrl === "https://rc9-release-31736285494-469ca8942a.next.labofscents.org", "INVALID_INPUT");
  const tenant = new URL(tenantUrl);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const path of paths) {
      const context = await browser.newContext();
      const page = await context.newPage();
      let runtimeError = false;
      page.on("pageerror", () => (runtimeError = true));
      page.on("console", (message) => {
        if (message.type() === "error") runtimeError = true;
      });
      const response = await page.goto(new URL(path, tenant).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
      required(response?.status() === 200 && new URL(page.url()).host === tenant.host, "ROUTE_NAVIGATION_FAILURE");
      if (path === "/") required(await page.getByText("OlfactoryOps").first().isVisible(), "ROUTE_RENDER_FAILURE");
      else {
        const card = page.getByTestId("v2-auth-card");
        required(await card.isVisible(), "ROUTE_RENDER_FAILURE");
        const heading = await card.locator("h1").textContent();
        required(path.includes("signup") ? /create|sign up/i.test(heading ?? "") : /sign in/i.test(heading ?? ""), "ROUTE_RENDER_FAILURE");
      }
      required(!runtimeError, "ROUTE_RUNTIME_ERROR");
      await context.close();
    }
    const bundleContext = await browser.newContext();
    const bundlePage = await bundleContext.newPage();
    await bundlePage.goto(tenantUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const configured = await bundlePage.evaluate(async (origin) => {
      const sources = Array.from(document.scripts).map((script) => script.src).filter(Boolean);
      const bundles = await Promise.all(sources.map(async (source) => (await fetch(source)).text()));
      return bundles.some((bundle) => bundle.includes(`${origin}/api/v1`));
    }, apiOrigin);
    required(configured, "BUNDLE_API_ORIGIN_FAILURE");
    await bundleContext.close();
    const apiContext = await browser.newContext();
    const apiPage = await apiContext.newPage();
    const apiUrl = `${apiOrigin}/api/v1/v2/platform/me`;
    const apiAccepted = await apiPage.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      return response.status === 401 && response.url === url;
    }, apiUrl);
    required(apiAccepted, "API_SESSION_BOUNDARY_FAILURE");
    await apiContext.close();
    console.log("CANDIDATE_BROWSER_ACCEPTANCE=PASS");
  } finally { await browser.close(); }
} catch (error) {
  fail(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "BROWSER_LAUNCH_UNAVAILABLE");
}
