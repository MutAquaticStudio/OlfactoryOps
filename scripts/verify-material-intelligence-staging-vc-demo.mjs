import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const STAGING_PUBLIC_ORIGIN = "https://beta.labofscents.org";
export const STAGING_API_ORIGIN = "https://api-beta.labofscents.org";
export const STAGING_WORKSPACE_BASE_DOMAIN = "api-beta.labofscents.org";
export const DEFAULT_DEMO_MATERIAL = "Vanillin";
export const DILUTION_DEMO_MATERIAL = "Beta-Damascenone";

const GLOBAL_MATERIAL_API_PATH = "/api/v1/v2/material-intelligence/materials";
const GENERATED_ROUTES_PATH = "worker/v2-api/generated-route-specs.ts";
const STAGING_WORKSPACE_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const FORBIDDEN_GLOBAL_CONTROLS = /^(?:edit|delete|save changes|change cas|change structure|change chemicalentity|change chemical entity|change physical properties|change taxonomy)$/i;
const DILUTION_PROVENANCE = /(?:dilution\s+merged\s+to\s+neat|dilution[^\n]{0,80}(?:source|alias|carrier|concentration|neat)|source\s+alias|carrier\s*[:/]?|concentration\s*[:/]?)/i;

class DemoAcceptanceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function required(condition, code) {
  if (!condition) throw new DemoAcceptanceError(code);
}

function exactHttpsOrigin(value, expected) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new DemoAcceptanceError("INVALID_INPUT");
  }
  required(
    parsed.protocol === "https:"
      && !parsed.username
      && !parsed.password
      && !parsed.port
      && parsed.pathname === "/"
      && !parsed.search
      && !parsed.hash
      && parsed.origin === expected,
    "INVALID_INPUT",
  );
  return parsed.origin;
}

export function stagingDemoInputs(environment = process.env) {
  const expectedSha = environment.MATERIAL_DEMO_EXPECTED_SHA?.trim().toLowerCase() ?? "";
  const publicOrigin = exactHttpsOrigin(
    environment.MATERIAL_DEMO_PUBLIC_ORIGIN?.trim() || STAGING_PUBLIC_ORIGIN,
    STAGING_PUBLIC_ORIGIN,
  );
  const apiOrigin = exactHttpsOrigin(
    environment.MATERIAL_DEMO_API_ORIGIN?.trim() || STAGING_API_ORIGIN,
    STAGING_API_ORIGIN,
  );
  const tenantSlug = environment.MATERIAL_DEMO_TENANT_SLUG?.trim().toLowerCase() ?? "";
  const email = environment.MATERIAL_DEMO_LOGIN_EMAIL?.trim() ?? "";
  const password = environment.MATERIAL_DEMO_LOGIN_PASSWORD ?? "";
  const searchMaterial = environment.MATERIAL_DEMO_SEARCH_MATERIAL?.trim() || DEFAULT_DEMO_MATERIAL;
  const evidenceDir = environment.MATERIAL_DEMO_EVIDENCE_DIR?.trim() ?? "";

  required(/^[0-9a-f]{40}$/.test(expectedSha), "INVALID_INPUT");
  required(STAGING_WORKSPACE_LABEL.test(tenantSlug), "INVALID_INPUT");
  required(email.includes("@") && email.length <= 320, "INVALID_INPUT");
  required(password.length >= 12, "INVALID_INPUT");
  required(searchMaterial.length > 0 && searchMaterial.length <= 160, "INVALID_INPUT");
  required(evidenceDir.length > 0 && isAbsolute(evidenceDir), "INVALID_INPUT");

  return {
    expectedSha,
    publicOrigin,
    apiOrigin,
    tenantSlug,
    email,
    password,
    searchMaterial,
    evidenceDir,
  };
}

function stagingWorkspaceSlug(hostname) {
  const suffix = `.${STAGING_WORKSPACE_BASE_DOMAIN}`;
  if (!hostname.endsWith(suffix)) return undefined;
  const slug = hostname.slice(0, -suffix.length);
  return STAGING_WORKSPACE_LABEL.test(slug) && hostname === `${slug}${suffix}` ? slug : undefined;
}

export function trustedStagingWorkspaceContext(workspaceUrl) {
  required(typeof workspaceUrl === "string", "LOGIN_WORKSPACE_URL_INVALID");
  let parsed;
  try {
    parsed = new URL(workspaceUrl);
  } catch {
    throw new DemoAcceptanceError("LOGIN_WORKSPACE_URL_INVALID");
  }
  const hostname = parsed.hostname;
  const slug = stagingWorkspaceSlug(hostname);
  const canonicalUrl = slug ? `https://${hostname}/v2/workspace` : "";
  required(
    Boolean(slug)
      && parsed.protocol === "https:"
      && !parsed.username
      && !parsed.password
      && !parsed.port
      && parsed.pathname === "/v2/workspace"
      && !parsed.search
      && !parsed.hash
      && workspaceUrl === canonicalUrl,
    "LOGIN_WORKSPACE_URL_INVALID",
  );
  return {
    hostname,
    origin: parsed.origin,
    slug,
    workspaceUrl: canonicalUrl,
  };
}

export function sanitizedBrowserLocation(value, publicOrigin, expectedWorkspaceOrigin) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { locationClass: "INVALID", pathname: "UNAVAILABLE" };
  }
  let locationClass = "OTHER";
  if (expectedWorkspaceOrigin && parsed.origin === expectedWorkspaceOrigin) {
    locationClass = "EXPECTED_WORKSPACE";
  } else if (parsed.origin === publicOrigin && parsed.pathname === "/login") {
    locationClass = "PUBLIC_LOGIN";
  } else if (stagingWorkspaceSlug(parsed.hostname)) {
    locationClass = "OTHER_STAGING_WORKSPACE";
  }
  return {
    locationClass,
    pathname: parsed.pathname.slice(0, 256),
  };
}

export function parseGeneratedRouteSpecs(source) {
  const declaration = source.indexOf("export const generatedRouteSpecs");
  const assignment = source.indexOf("=", declaration);
  const start = source.indexOf("[", assignment);
  const end = source.lastIndexOf("]");
  required(
    declaration >= 0 && assignment > declaration && start > assignment && end > start,
    "GENERATED_ROUTE_MATRIX_INVALID",
  );
  let routes;
  try {
    routes = JSON.parse(source.slice(start, end + 1));
  } catch {
    throw new DemoAcceptanceError("GENERATED_ROUTE_MATRIX_INVALID");
  }
  required(Array.isArray(routes), "GENERATED_ROUTE_MATRIX_INVALID");
  return routes;
}

export function globalMaterialWriteRoutes(routes) {
  return routes.filter(
    (route) => route
      && typeof route.path === "string"
      && route.path.startsWith("/v2/material-intelligence/materials")
      && route.method !== "GET",
  );
}

export function acceptedGlobalWriteDenial(status) {
  return status === 404 || status === 405;
}

export function evidenceContainsProtectedValue(evidence, protectedValues) {
  const serialized = JSON.stringify(evidence);
  return protectedValues.some((value) => typeof value === "string" && value.length > 0 && serialized.includes(value));
}

export function stableFailureCode(error, stage) {
  if (error instanceof DemoAcceptanceError) return error.code;
  if (error && typeof error === "object" && error.name === "TimeoutError") {
    return stage === "WORKSPACE_REDIRECT" ? "WORKSPACE_REDIRECT_TIMEOUT" : "BROWSER_TIMEOUT";
  }
  return "UNCLASSIFIED_BROWSER_FAILURE";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ignorableConsoleError(message) {
  return /static\.cloudflareinsights\.com|ERR_BLOCKED_BY_CLIENT|favicon|manifest/i.test(message);
}

async function safeScreenshot(page, inputs, fileName, fullPage = false) {
  await page.screenshot({
    path: join(inputs.evidenceDir, fileName),
    fullPage,
    animations: "disabled",
    mask: [
      page.getByText(inputs.email, { exact: true }),
      page.locator('input[type="email"], input[autocomplete="email"]'),
      page.locator('input[type="password"]'),
    ],
  });
}

async function assertNoFailedToFetch(page) {
  required(await page.getByText(/failed to fetch/i).count() === 0, "FAILED_TO_FETCH_PRESENT");
}

async function materialFieldValue(page, label) {
  const field = page.locator(".v2-mi-field").filter({ hasText: label }).first();
  required(await field.count() === 1, "MATERIAL_DETAIL_FIELD_MISSING");
  return (await field.locator("dd").innerText()).trim();
}

async function fetchHealth(inputs) {
  let response;
  try {
    response = await fetch(`${inputs.apiOrigin}/health`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new DemoAcceptanceError("STAGING_API_HEALTH_UNREACHABLE");
  }
  required(response.status === 200, "STAGING_API_HEALTH_FAILURE");
  required(response.headers.get("cf-mitigated") !== "challenge", "CLOUDFLARE_CHALLENGE_PRESENT");
  required(response.headers.get("content-type")?.includes("application/json"), "STAGING_API_HEALTH_NOT_JSON");
  const body = await response.json().catch(() => undefined);
  required(
    body?.status === "ok"
      && body?.environment === "staging"
      && body?.database === "hyperdrive"
      && body?.releaseGitSha === inputs.expectedSha,
    "DEPLOYED_API_SHA_MISMATCH",
  );
}

async function writeEvidence(evidenceDir, evidence, protectedValues) {
  await mkdir(evidenceDir, { recursive: true });
  const safeEvidence = evidenceContainsProtectedValue(evidence, protectedValues)
    ? {
        schemaVersion: "olfactoryops-material-vc-demo-acceptance/1",
        status: "FAIL",
        stage: "EVIDENCE_REDACTION",
        failureCode: "EVIDENCE_REDACTION_FAILED",
      }
    : evidence;
  await writeFile(join(evidenceDir, "evidence.json"), `${JSON.stringify(safeEvidence, null, 2)}\n`, "utf8");
  required(safeEvidence === evidence, "EVIDENCE_REDACTION_FAILED");
}

export async function runStagingMaterialVcDemo(environment = process.env, browserType = chromium) {
  const protectedValues = [
    environment.MATERIAL_DEMO_LOGIN_EMAIL,
    environment.MATERIAL_DEMO_LOGIN_PASSWORD,
    environment.MATERIAL_DEMO_TENANT_SLUG,
  ].filter((value) => typeof value === "string" && value.length > 0);
  const configuredEvidenceDir = environment.MATERIAL_DEMO_EVIDENCE_DIR?.trim() ?? "";
  let inputs;
  let browser;
  let context;
  let page;
  let workspace;
  let stage = "INVALID_INPUT";
  let failureCode;
  const evidence = {
    schemaVersion: "olfactoryops-material-vc-demo-acceptance/1",
    generatedAt: new Date().toISOString(),
    target: "STAGING_ONLY",
    status: "FAIL",
    stage,
    expectedSha: environment.MATERIAL_DEMO_EXPECTED_SHA?.trim().toLowerCase() || "INVALID",
    searchMaterial: environment.MATERIAL_DEMO_SEARCH_MATERIAL?.trim() || DEFAULT_DEMO_MATERIAL,
    checks: {},
    runtime: {
      consoleErrorCount: 0,
      pageErrorCount: 0,
      requestFailureCount: 0,
    },
    screenshots: [],
  };

  try {
    inputs = stagingDemoInputs(environment);
    await mkdir(inputs.evidenceDir, { recursive: true });

    stage = "DEPLOYED_API_HEALTH";
    await fetchHealth(inputs);
    evidence.checks.deployedApiHealthSha = "PASS";

    stage = "GLOBAL_ROUTE_MATRIX";
    const routeSource = await readFile(resolve(GENERATED_ROUTES_PATH), "utf8");
    const routes = parseGeneratedRouteSpecs(routeSource);
    required(globalMaterialWriteRoutes(routes).length === 0, "GLOBAL_WRITE_ROUTE_PRESENT");
    evidence.checks.globalWriteRoutesAbsent = "PASS";

    stage = "BROWSER_LAUNCH";
    browser = await browserType.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "dark",
    });
    page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error" && !ignorableConsoleError(message.text())) {
        evidence.runtime.consoleErrorCount += 1;
      }
    });
    page.on("pageerror", () => {
      evidence.runtime.pageErrorCount += 1;
    });
    page.on("requestfailed", (request) => {
      let origin;
      try {
        origin = new URL(request.url()).origin;
      } catch {
        return;
      }
      if ([inputs.apiOrigin, inputs.publicOrigin, workspace?.origin].includes(origin)) {
        evidence.runtime.requestFailureCount += 1;
      }
    });

    stage = "LOGIN_PAGE";
    const loginPageResponse = await page.goto(`${inputs.publicOrigin}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    required(loginPageResponse?.status() === 200, "LOGIN_PAGE_UNAVAILABLE");
    required(new URL(page.url()).origin === inputs.publicOrigin, "LOGIN_PAGE_ORIGIN_MISMATCH");
    required(await page.getByTestId("v2-auth-card").isVisible(), "V2_LOGIN_NOT_RENDERED");
    required(await page.getByRole("heading", { name: "Sign in", exact: true }).isVisible(), "V2_LOGIN_NOT_RENDERED");
    await assertNoFailedToFetch(page);
    await safeScreenshot(page, inputs, "01-login.png");
    evidence.screenshots.push("01-login.png");

    stage = "LOGIN_SUBMIT";
    await page.getByLabel("Email", { exact: true }).fill(inputs.email);
    await page.getByLabel("Password", { exact: true }).fill(inputs.password);
    const loginUrl = `${inputs.apiOrigin}/api/v1/v2/platform/auth/login`;
    const loginResponsePromise = page.waitForResponse(
      (response) => response.url() === loginUrl && response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Sign in securely", exact: true }).click();
    const loginResponse = await loginResponsePromise;
    required(loginResponse.status() === 200, "LOGIN_RESPONSE_NOT_SUCCESSFUL");
    required(loginResponse.headers()["cf-mitigated"] !== "challenge", "CLOUDFLARE_CHALLENGE_PRESENT");
    const loginBody = await loginResponse.json().catch(() => undefined);
    workspace = trustedStagingWorkspaceContext(loginBody?.workspaceUrl);
    required(loginBody?.hostname?.hostname === workspace.hostname, "LOGIN_WORKSPACE_HOSTNAME_MISMATCH");
    required(loginBody?.hostname?.kind === "DEFAULT", "LOGIN_WORKSPACE_HOSTNAME_KIND_INVALID");
    required(loginBody?.hostname?.status === "ACTIVE", "LOGIN_WORKSPACE_HOSTNAME_NOT_ACTIVE");
    required(loginBody?.membership?.organizationSlug === workspace.slug, "LOGIN_WORKSPACE_MEMBERSHIP_MISMATCH");
    required(loginBody?.membership?.status === "ACTIVE", "LOGIN_WORKSPACE_MEMBERSHIP_NOT_ACTIVE");
    required(loginBody?.membership?.role === "Owner", "LOGIN_WORKSPACE_FIXTURE_ROLE_INVALID");
    required(loginBody?.user?.verified === true, "LOGIN_WORKSPACE_USER_NOT_VERIFIED");
    required(
      typeof loginBody?.membership?.organizationId === "string"
        && loginBody.membership.organizationId === loginBody?.hostname?.organizationId
        && loginBody.membership.organizationId === loginBody?.session?.organizationId,
      "LOGIN_WORKSPACE_ORGANIZATION_MISMATCH",
    );
    evidence.checks.authenticatedWorkspaceContract = "PASS";
    evidence.checks.configuredSlugMatchesAuthenticatedWorkspace = inputs.tenantSlug === workspace.slug ? "YES" : "NO";

    stage = "WORKSPACE_REDIRECT";
    await page.waitForURL(
      (url) => url.origin === workspace.origin && url.pathname === "/v2/workspace",
      { timeout: 30_000, waitUntil: "domcontentloaded" },
    );
    required(new URL(page.url()).origin === workspace.origin, "WORKSPACE_REDIRECT_MISMATCH");
    await page.getByTestId("v2-workspace").waitFor({ state: "visible", timeout: 30_000 });
    await page.getByTestId("v2-workspace-home").waitFor({ state: "visible", timeout: 30_000 });
    await assertNoFailedToFetch(page);

    stage = "AUTHENTICATED_ME";
    const me = await page.evaluate(async ({ url, expectedSlug }) => {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const contentTypeJson = response.headers.get("content-type")?.includes("application/json") === true;
      const body = contentTypeJson ? await response.json().catch(() => undefined) : undefined;
      return {
        status: response.status,
        contentTypeJson,
        hasUser: typeof body?.user?.id === "string",
        hasSession: typeof body?.session?.id === "string",
        membershipMatches: body?.membership?.organizationSlug === expectedSlug,
      };
    }, {
      url: `${inputs.apiOrigin}/api/v1/v2/platform/me`,
      expectedSlug: workspace.slug,
    });
    required(
      me.status === 200
        && me.contentTypeJson
        && me.hasUser
        && me.hasSession
        && me.membershipMatches,
      "AUTHENTICATED_ME_FAILURE",
    );
    evidence.checks.login = "PASS";
    evidence.checks.authenticatedMe = "PASS";
    evidence.checks.workspaceDashboard = "PASS";
    await safeScreenshot(page, inputs, "02-dashboard.png");
    evidence.screenshots.push("02-dashboard.png");

    stage = "MATERIAL_INTELLIGENCE_NAVIGATION";
    const materialNavigation = page.getByRole("button", { name: "Material Intelligence", exact: true });
    required(await materialNavigation.isVisible(), "MATERIAL_INTELLIGENCE_NAVIGATION_MISSING");
    await materialNavigation.click();
    await page.waitForURL(
      (url) => url.origin === workspace.origin && url.pathname === "/material-intelligence",
      { timeout: 20_000 },
    );
    const catalog = page.getByTestId("v2-global-material-intelligence");
    await catalog.waitFor({ state: "visible", timeout: 30_000 });
    required(await page.getByRole("heading", { name: "Global Material Intelligence", exact: true }).isVisible(), "MATERIAL_LIST_MISSING");
    required(await catalog.getByText("GLOBAL · READ ONLY", { exact: true }).isVisible(), "GLOBAL_READ_ONLY_MISSING");
    await assertNoFailedToFetch(page);
    await safeScreenshot(page, inputs, "03-material-list.png");
    evidence.screenshots.push("03-material-list.png");

    stage = "MATERIAL_SEARCH";
    const searchResponsePromise = page.waitForResponse((response) => {
      try {
        const url = new URL(response.url());
        return response.request().method() === "GET"
          && url.origin === inputs.apiOrigin
          && url.pathname === GLOBAL_MATERIAL_API_PATH
          && url.searchParams.get("text") === inputs.searchMaterial;
      } catch {
        return false;
      }
    }, { timeout: 30_000 });
    await page.getByPlaceholder("Search canonical name, entity or identifier", { exact: true }).fill(inputs.searchMaterial);
    const searchResponse = await searchResponsePromise;
    required(searchResponse.status() === 200, "MATERIAL_SEARCH_API_FAILURE");
    const resultRow = page.getByRole("button", {
      name: new RegExp(`^Open ${escapeRegExp(inputs.searchMaterial)} detail$`, "i"),
    }).first();
    await resultRow.waitFor({ state: "visible", timeout: 20_000 });
    required(/verified/i.test(await resultRow.innerText()), "MATERIAL_SEARCH_NOT_VERIFIED");
    evidence.checks.materialList = "PASS";
    evidence.checks.materialSearch = "PASS";

    stage = "MATERIAL_DETAIL";
    const detailResponsePromise = page.waitForResponse((response) => {
      try {
        const url = new URL(response.url());
        return response.request().method() === "GET"
          && url.origin === inputs.apiOrigin
          && url.pathname.startsWith(`${GLOBAL_MATERIAL_API_PATH}/`)
          && !url.pathname.endsWith("/components")
          && !url.pathname.endsWith("/evidence")
          && !url.pathname.endsWith("/eligibility");
      } catch {
        return false;
      }
    }, { timeout: 30_000 });
    await resultRow.click();
    const detailResponse = await detailResponsePromise;
    required(detailResponse.status() === 200, "MATERIAL_DETAIL_API_FAILURE");
    await page.waitForURL(
      (url) => url.origin === workspace.origin && /^\/material-intelligence\/materials\/[^/]+$/.test(url.pathname),
      { timeout: 20_000 },
    );
    const detail = page.getByTestId("v2-global-material-detail");
    await detail.waitFor({ state: "visible", timeout: 30_000 });
    required(await detail.getByText("GLOBAL · READ ONLY", { exact: true }).isVisible(), "GLOBAL_READ_ONLY_MISSING");
    const materialHeading = detail.getByRole("heading", { name: inputs.searchMaterial, exact: true });
    await materialHeading.waitFor({ state: "visible", timeout: 30_000 });

    const chemicalEntity = await materialFieldValue(page, "Chemical entity");
    const canonicalSmiles = await materialFieldValue(page, "Canonical SMILES");
    const inchiKey = await materialFieldValue(page, "InChIKey");
    required(chemicalEntity !== "Not available", "CHEMICAL_ENTITY_MISSING");
    required(canonicalSmiles !== "Not available" && inchiKey !== "Not available", "STRUCTURE_IDENTIFIERS_MISSING");

    const physicalSection = page.locator(".v2-mi-detail-section").filter({ hasText: "Physical properties" }).first();
    required(await physicalSection.locator("article").count() > 0, "PHYSICAL_PROPERTIES_MISSING");
    required(!/no physical-property assertion/i.test(await physicalSection.innerText()), "PHYSICAL_PROPERTIES_MISSING");

    const taxonomySection = page.locator(".v2-mi-detail-section").filter({ hasText: "Osmo taxonomy" }).first();
    required(await taxonomySection.locator("article").count() > 0, "OSMO_TAXONOMY_MISSING");
    required(!/no active taxonomy assignment/i.test(await taxonomySection.innerText()), "OSMO_TAXONOMY_MISSING");

    const controlTexts = await detail.locator("button, a").allTextContents();
    required(!controlTexts.some((text) => FORBIDDEN_GLOBAL_CONTROLS.test(text.trim())), "GLOBAL_MUTATION_CONTROL_PRESENT");
    await assertNoFailedToFetch(page);
    evidence.checks.materialDetailRoute = "PASS";
    evidence.checks.globalReadOnly = "PASS";
    evidence.checks.chemicalEntity = "PASS";
    evidence.checks.structureIdentifiers = "PASS";
    evidence.checks.physicalProperties = "PASS";
    evidence.checks.osmoTaxonomy = "PASS";
    await safeScreenshot(page, inputs, "04-material-detail.png", true);
    evidence.screenshots.push("04-material-detail.png");

    stage = "DILUTION_TO_NEAT_DETAIL";
    await page.getByRole("button", { name: "Back to global catalog", exact: true }).click();
    await page.waitForURL(
      (url) => url.origin === workspace.origin && url.pathname === "/material-intelligence",
      { timeout: 20_000 },
    );
    const dilutionSearchResponsePromise = page.waitForResponse((response) => {
      try {
        const url = new URL(response.url());
        return response.request().method() === "GET"
          && url.origin === inputs.apiOrigin
          && url.pathname === GLOBAL_MATERIAL_API_PATH
          && url.searchParams.get("text") === DILUTION_DEMO_MATERIAL;
      } catch {
        return false;
      }
    }, { timeout: 30_000 });
    await page.getByPlaceholder("Search canonical name, entity or identifier", { exact: true }).fill(DILUTION_DEMO_MATERIAL);
    const dilutionSearchResponse = await dilutionSearchResponsePromise;
    required(dilutionSearchResponse.status() === 200, "DILUTION_SEARCH_API_FAILURE");
    const dilutionResult = page.getByRole("button", {
      name: new RegExp(`^Open ${escapeRegExp(DILUTION_DEMO_MATERIAL)} detail$`, "i"),
    }).first();
    await dilutionResult.waitFor({ state: "visible", timeout: 20_000 });
    await dilutionResult.click();
    await page.waitForURL(
      (url) => url.origin === workspace.origin && /^\/material-intelligence\/materials\/[^/]+$/.test(url.pathname),
      { timeout: 20_000 },
    );
    const dilutionDetail = page.getByTestId("v2-global-material-detail");
    await dilutionDetail.waitFor({ state: "visible", timeout: 30_000 });
    const dilutionHeading = dilutionDetail.getByRole("heading", { name: DILUTION_DEMO_MATERIAL, exact: true });
    await dilutionHeading.waitFor({ state: "visible", timeout: 30_000 });
    const sourceSection = dilutionDetail.locator(".v2-mi-detail-section").filter({ hasText: "Source accounting" }).first();
    required(DILUTION_PROVENANCE.test(await sourceSection.innerText()), "DILUTION_PROVENANCE_MISSING");
    evidence.checks.dilutionToNeatProvenance = "PASS";
    await safeScreenshot(page, inputs, "05-dilution-to-neat.png", true);
    evidence.screenshots.push("05-dilution-to-neat.png");

    stage = "GLOBAL_WRITE_DENIAL";
    const detailPath = new URL(page.url()).pathname;
    const materialId = decodeURIComponent(detailPath.split("/").filter(Boolean).at(-1) ?? "");
    required(materialId.length > 0, "MATERIAL_DETAIL_ID_MISSING");
    const writeChecks = [
      { key: "POST_COLLECTION", method: "POST", url: `${inputs.apiOrigin}${GLOBAL_MATERIAL_API_PATH}` },
      { key: "PATCH_DETAIL", method: "PATCH", url: `${inputs.apiOrigin}${GLOBAL_MATERIAL_API_PATH}/${encodeURIComponent(materialId)}` },
      { key: "DELETE_DETAIL", method: "DELETE", url: `${inputs.apiOrigin}${GLOBAL_MATERIAL_API_PATH}/${encodeURIComponent(materialId)}` },
    ];
    const writeStatuses = {};
    for (const check of writeChecks) {
      const response = await context.request.fetch(check.url, {
        method: check.method,
        data: { acceptanceProbe: "NO_WRITE_ROUTE_EXPECTED" },
        failOnStatusCode: false,
        timeout: 20_000,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: workspace.origin,
        },
      });
      required(acceptedGlobalWriteDenial(response.status()), "GLOBAL_WRITE_NOT_DENIED");
      writeStatuses[check.key] = response.status();
    }
    evidence.checks.globalWriteDenied = "PASS";
    evidence.negativeWriteStatuses = writeStatuses;

    stage = "OPTIONAL_DESIGN_STUDIO_BRIDGE";
    evidence.checks.designStudioGlobalMaterial = "SKIPPED_NOT_VISIBLE";
    const designNavigation = page.getByRole("button", { name: "Design Studio", exact: true });
    if (await designNavigation.count() > 0 && await designNavigation.first().isVisible()) {
      await designNavigation.first().click();
      const designStudio = page.getByTestId("v2-design-studio");
      await designStudio.waitFor({ state: "visible", timeout: 20_000 });
      const bridge = designStudio.getByText(/(?:global material intelligence|canonical global material|global material reference|global · read only)/i).first();
      if (await bridge.count() > 0 && await bridge.isVisible()) {
        evidence.checks.designStudioGlobalMaterial = "PASS";
        await safeScreenshot(page, inputs, "06-design-studio-global-material.png", true);
        evidence.screenshots.push("06-design-studio-global-material.png");
      }
    }

    stage = "RUNTIME_HEALTH";
    required(evidence.runtime.consoleErrorCount === 0, "BROWSER_CONSOLE_ERROR");
    required(evidence.runtime.pageErrorCount === 0, "BROWSER_PAGE_ERROR");
    required(evidence.runtime.requestFailureCount === 0, "BROWSER_NETWORK_FAILURE");
    evidence.checks.failedToFetchAbsent = "PASS";
    evidence.status = "PASS";
    evidence.stage = "COMPLETE";
  } catch (error) {
    failureCode = stableFailureCode(error, stage);
    evidence.status = "FAIL";
    evidence.stage = stage;
    evidence.failureCode = failureCode;
    if (page && inputs) {
      evidence.browserLocation = sanitizedBrowserLocation(page.url(), inputs.publicOrigin, workspace?.origin);
      await safeScreenshot(page, inputs, "failure.png", true)
        .then(() => evidence.screenshots.push("failure.png"))
        .catch(() => undefined);
    }
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    if (configuredEvidenceDir && isAbsolute(configuredEvidenceDir)) {
      await writeEvidence(configuredEvidenceDir, evidence, protectedValues).catch(() => {
        failureCode = "EVIDENCE_WRITE_FAILED";
      });
    }
  }

  if (failureCode) throw new DemoAcceptanceError(failureCode);
  return evidence;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runStagingMaterialVcDemo()
    .then((evidence) => {
      console.log("MATERIAL_VC_DEMO_ACCEPTANCE=PASS");
      console.log("LOGIN_LIVE=PASS");
      console.log("FAILED_TO_FETCH_PRESENT=NO");
      console.log("MATERIAL_LIST=PASS");
      console.log("MATERIAL_SEARCH=PASS");
      console.log("MATERIAL_DETAIL_ROUTE=PASS");
      console.log("GLOBAL_READ_ONLY=PASS");
      console.log("GLOBAL_WRITE_DENIED=PASS");
      console.log(`DESIGN_STUDIO_GLOBAL_MATERIAL=${evidence.checks.designStudioGlobalMaterial}`);
    })
    .catch((error) => {
      console.log("MATERIAL_VC_DEMO_ACCEPTANCE=FAIL");
      console.log(`MATERIAL_VC_DEMO_FAILURE=${stableFailureCode(error)}`);
      process.exitCode = 1;
    });
}
