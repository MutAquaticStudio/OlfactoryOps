import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportRoot = path.join(repoRoot, 'reports')

const appUrl = stripTrailingSlash(process.env.FUNCTIONAL_APP_URL ?? 'https://labofscents.pages.dev')
const apiBaseUrl = stripTrailingSlash(process.env.FUNCTIONAL_API_URL ?? 'https://api.labofscents.org/api/v1')
const loginEmail = process.env.FUNCTIONAL_LOGIN_EMAIL ?? 'owner@example.test'
const documentId = process.env.FUNCTIONAL_DOCUMENT_ID ?? 'DOC-118'
const browserFallbackReason =
  process.env.FUNCTIONAL_BROWSER_FALLBACK_REASON ??
  'Browser plugin invocation failed during setup with "Invalid or unexpected token"; regular Playwright was used.'
const productionMutationEnabled = process.env.FUNCTIONAL_MUTATE_PRODUCTION === '1'

const runStartedAt = new Date()
const runStamp = stampForFile(runStartedAt)
const evidenceRoot = path.join(reportRoot, 'evidence', runStamp)
const cookieJar = new Map()
const results = []
let csrfToken = null

await mkdir(evidenceRoot, { recursive: true })

const testCases = [
  {
    id: 'TC-001',
    module: 'Edge API / Auth Boundary',
    priority: 'P0',
    title: 'Public health is open and protected routes reject anonymous access',
    objective: 'Verify the production Worker is reachable while tenant and secret-bearing routes require authentication.',
    steps: [
      'Call GET /health without cookies.',
      'Call GET /persistence/status without cookies.',
      'Call GET /security/tenant-console without cookies.',
      'Call GET /api-keys without cookies.',
    ],
    assertions: [
      '/health returns 200 and service identity.',
      'Persistence status reports hybrid D1 with normalized sell-ready domain tables outside Formula.',
      'Tenant console returns 401 without a session.',
      'API keys return 401 without a session.',
    ],
    execute: async () => {
      const health = await apiFetch('/health', {}, { useCookie: false })
      assertStatus(health, 200, 'health should be public')
      assert(Boolean(health.json?.ok), 'health payload should include ok=true')

      const persistence = await apiFetch('/persistence/status', {}, { useCookie: false })
      assertStatus(persistence, 200, 'persistence status should be public')
      assert(persistence.json?.data?.adapter === 'cloudflare-d1-hybrid', 'persistence adapter should be hybrid D1')
      const requiredTables = [
        'auth_sessions',
        'audit_events',
        'tenant_organizations',
        'tenant_brands',
        'tenant_memberships',
        'role_policies',
        'material_records',
        'molecule_components',
        'storage_locations',
        'stock_take_records',
        'tenant_settings',
        'feature_flags',
        'numbering_sequences',
        'custom_fields',
        'tenant_branding',
        'document_records',
        'production_batches',
        'suppliers',
        'purchase_orders',
        'price_history',
        'commercial_skus',
        'price_lists',
        'quotes',
        'sample_requests',
        'customers',
        'sales_orders',
        'order_shipments',
        'order_documents',
        'scheduled_reports',
        'billing_subscriptions',
        'billing_invoices',
        'webhook_deliveries',
        'inventory_lots',
        'inventory_movements',
        'lab_usage_records',
      ]
      assert(
        requiredTables.every((table) => persistence.json.data.normalizedTables.includes(table)),
        'persistence status should report normalized commercial operations tables',
      )

      const tenant = await apiFetch('/security/tenant-console', {}, { useCookie: false })
      assertStatus(tenant, 401, 'tenant console should reject anonymous access')

      const apiKeys = await apiFetch('/api-keys', {}, { useCookie: false })
      assertStatus(apiKeys, 401, 'api key console should reject anonymous access')

      return [
        `Health service: ${health.json.service ?? 'unknown'}`,
        `Persistence: ${persistence.json.data.adapter} / ${persistence.json.data.normalizedTables.join(', ')}`,
        `Anonymous tenant status: ${tenant.status}`,
        `Anonymous api-key status: ${apiKeys.status}`,
      ]
    },
  },
  {
    id: 'TC-002',
    module: 'Auth Session',
    priority: 'P0',
    title: 'Login issues HttpOnly cookie and server session can bootstrap /me',
    objective: 'Verify auth no longer depends on frontend-stored bearer secrets and the API can authenticate with the session cookie.',
    steps: [
      `POST /auth/login with ${loginEmail}.`,
      'Inspect Set-Cookie security attributes.',
      'Call GET /me with the cookie.',
      'Call GET /me with bearer fallback for tooling compatibility.',
    ],
    assertions: [
      'Login returns a session for org-nxl Owner.',
      'Set-Cookie includes HttpOnly, Secure, SameSite=None, and oo_session.',
      '/me works with cookie auth.',
      '/me works with bearer fallback.',
    ],
    execute: async () => {
      const login = await apiFetch(
        '/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail }),
        },
        { useCookie: false },
      )
      assertStatus(login, 200, 'login should succeed')
      const setCookie = login.setCookie.join(' | ')
      assert(/oo_session=/.test(setCookie), 'login should set oo_session')
      assert(/HttpOnly/i.test(setCookie), 'session cookie should be HttpOnly')
      assert(/Secure/i.test(setCookie), 'session cookie should be Secure')
      assert(/SameSite=None/i.test(setCookie), 'session cookie should use SameSite=None')
      const sessionId = cookieJar.get('oo_session')
      assert(sessionId, 'cookie jar should capture oo_session')

      const session = login.json?.data?.session
      assert(session?.email === loginEmail, 'login session should match requested email')
      assert(session?.organizationId === 'org-nxl', 'owner demo should be scoped to org-nxl')
      assert(session?.role === 'Owner', 'owner demo should have Owner role')
      csrfToken = login.json?.data?.csrfToken ?? null
      assert(csrfToken && csrfToken.startsWith('csrf_'), 'login should return a session-bound CSRF token')

      const meByCookie = await apiFetch('/me')
      assertStatus(meByCookie, 200, '/me should accept cookie auth')
      assert(meByCookie.json?.data?.session?.id === sessionId, '/me should resolve the same cookie session')
      assert(meByCookie.json?.data?.csrfToken === csrfToken, '/me should return the same CSRF token for the session')

      const meByBearer = await apiFetch('/me', { headers: { Authorization: `Bearer ${sessionId}` } }, { useCookie: false })
      assertStatus(meByBearer, 200, '/me should keep bearer fallback for test tooling')

      return [
        `Session id: ${sessionId}`,
        `Tenant: ${session.organizationId}`,
        `Role: ${session.role}`,
      ]
    },
  },
  {
    id: 'TC-003',
    module: 'Tenant / Permission Guard',
    priority: 'P0',
    title: 'Tenant console is scoped and permission probes block unauthorized roles',
    objective: 'Verify server-side tenant isolation and role permission decisions for the active session.',
    steps: [
      'Call GET /security/tenant-console with owner cookie.',
      'Call GET /security/tenant-probe?organizationId=org-other.',
      'Call GET /security/permission-probe for Viewer inventory.adjust.',
      'Call GET /security/permission-probe for Owner inventory.adjust.',
    ],
    assertions: [
      'Tenant console only returns org-nxl memberships and brands.',
      'Cross-tenant probe returns 403.',
      'Viewer inventory.adjust returns 403.',
      'Owner inventory.adjust returns 200.',
    ],
    execute: async () => {
      const consoleResponse = await apiFetch('/security/tenant-console')
      assertStatus(consoleResponse, 200, 'tenant console should load for owner')
      const tenantData = consoleResponse.json?.data
      assert(tenantData?.organization?.id === 'org-nxl', 'tenant console organization should be org-nxl')
      assert(
        tenantData.memberships.every((membership) => membership.organizationId === 'org-nxl'),
        'tenant memberships should stay inside org-nxl',
      )
      assert(
        tenantData.brands.every((brand) => brand.organizationId === 'org-nxl'),
        'tenant brands should stay inside org-nxl',
      )

      const crossTenant = await apiFetch('/security/tenant-probe?organizationId=org-other')
      assertStatus(crossTenant, 403, 'cross-tenant probe should be blocked')

      const viewerAdjust = await apiFetch('/security/permission-probe?role=Viewer&permission=inventory.adjust')
      assertStatus(viewerAdjust, 403, 'Viewer inventory.adjust should be blocked')

      const ownerAdjust = await apiFetch('/security/permission-probe?role=Owner&permission=inventory.adjust')
      assertStatus(ownerAdjust, 200, 'Owner inventory.adjust should be allowed')

      return [
        `Memberships scoped: ${tenantData.memberships.length}`,
        `Brands scoped: ${tenantData.brands.length}`,
        `Cross-tenant status: ${crossTenant.status}`,
        `Viewer adjust status: ${viewerAdjust.status}`,
      ]
    },
  },
  {
    id: 'TC-004',
    module: 'Core Read Models',
    priority: 'P1',
    title: 'Primary SaaS modules return authenticated read models',
    objective: 'Verify the main North Star modules still hydrate from the production Worker and D1 snapshot.',
    steps: [
      'Call GET /materials.',
      'Call GET /formulas.',
      'Call GET /inventory/console.',
      'Call GET /documents.',
      'Call GET /billing/console.',
    ],
    assertions: [
      'Materials and formulas contain records.',
      'Inventory console contains lots and movements arrays.',
      'Documents contain at least one seeded document.',
      'Billing console exposes plan and usage data.',
    ],
    execute: async () => {
      const materials = await apiFetch('/materials')
      const formulas = await apiFetch('/formulas')
      const inventory = await apiFetch('/inventory/console')
      const documents = await apiFetch('/documents')
      const billing = await apiFetch('/billing/console')

      assertStatus(materials, 200, 'materials should load')
      assertStatus(formulas, 200, 'formulas should load')
      assertStatus(inventory, 200, 'inventory console should load')
      assertStatus(documents, 200, 'documents should load')
      assertStatus(billing, 200, 'billing console should load')

      assert(Array.isArray(materials.json?.data) && materials.json.data.length > 0, 'materials should not be empty')
      assert(Array.isArray(formulas.json?.data) && formulas.json.data.length > 0, 'formulas should not be empty')
      assert(Array.isArray(inventory.json?.data?.lots), 'inventory lots should be an array')
      assert(Array.isArray(inventory.json?.data?.movements), 'inventory movements should be an array')
      assert(Array.isArray(documents.json?.data) && documents.json.data.length > 0, 'documents should not be empty')
      assert(Boolean(billing.json?.data?.plan), 'billing console should expose a plan')

      return [
        `Materials: ${materials.json.data.length}`,
        `Formulas: ${formulas.json.data.length}`,
        `Lots: ${inventory.json.data.lots.length}`,
        `Documents: ${documents.json.data.length}`,
        `Billing plan: ${billing.json.data.plan.name ?? billing.json.data.plan.tier ?? 'available'}`,
      ]
    },
  },
  {
    id: 'TC-005',
    module: 'Documents',
    priority: 'P1',
    title: 'Signed document URL is nonce-bearing and audited behind auth',
    objective: 'Verify document download signing remains permission-gated and private object paths are represented as signed URLs.',
    steps: [
      `POST /documents/${documentId}/signed-url with owner cookie.`,
      'Inspect the returned signed URL metadata.',
    ],
    assertions: [
      'Cookie-authenticated mutation without CSRF returns 403.',
      'Response returns document, signedUrl, and audit data.',
      'Signed URL includes expires and nonce query parameters.',
      'Audit outcome is allowed.',
    ],
    execute: async () => {
      const missingCsrf = await apiFetch(`/documents/${documentId}/signed-url`, { method: 'POST' }, { useCsrf: false })
      assertStatus(missingCsrf, 403, 'signed document URL without CSRF should be blocked')

      const signed = await apiFetch(`/documents/${documentId}/signed-url`, { method: 'POST' })
      assertStatus(signed, 200, 'signed document URL should be created for owner')
      const data = signed.json?.data
      const signedUrl = data?.signedUrl?.url
      assert(data?.document?.id === documentId, 'signed URL should target requested document')
      assert(typeof signedUrl === 'string' && signedUrl.includes('expires='), 'signed URL should include expires')
      assert(typeof signedUrl === 'string' && signedUrl.includes('nonce='), 'signed URL should include nonce')
      assert(data?.audit?.outcome === 'allowed', 'signed URL audit should be allowed')

      return [
        `Missing CSRF status: ${missingCsrf.status}`,
        `Document: ${data.document.id}`,
        `Signed URL expires: ${data.signedUrl.expiresAt}`,
        `Audit: ${data.audit.outcome}`,
      ]
    },
  },
  {
    id: 'TC-006',
    module: 'Production Phase 9',
    priority: 'P0',
    title: 'Production read model includes work order, QC protocol, genealogy, and output lot evidence',
    objective: 'Verify the Phase 9 production hardening is visible through API read models without creating a new batch by default.',
    steps: [
      'Call GET /production/batches.',
      'Inspect the newest batch for work order steps and QC checks.',
      'Find a released batch with output lot genealogy.',
    ],
    assertions: [
      'At least one batch exists.',
      'Every inspected batch has a workOrder, qcChecks, and genealogy.',
      'At least one released batch has outputLot and genealogy.outputLotId.',
    ],
    execute: async () => {
      const batchesResponse = await apiFetch('/production/batches')
      assertStatus(batchesResponse, 200, 'production batches should load')
      const batches = batchesResponse.json?.data
      assert(Array.isArray(batches) && batches.length > 0, 'production batches should not be empty')

      const inspected = batches.slice(0, Math.min(5, batches.length))
      for (const batch of inspected) {
        assert(batch.workOrder?.id, `batch ${batch.id} should include workOrder`)
        assert(Array.isArray(batch.workOrder.steps) && batch.workOrder.steps.length > 0, `batch ${batch.id} should include workOrder steps`)
        assert(Array.isArray(batch.qcChecks) && batch.qcChecks.length > 0, `batch ${batch.id} should include qcChecks`)
        assert(batch.genealogy && Array.isArray(batch.genealogy.inputLotIds), `batch ${batch.id} should include genealogy`)
      }

      let releasedBatch = batches.find((batch) => batch.status === 'RELEASED' && batch.outputLot && batch.genealogy?.outputLotId)
      if (!releasedBatch && productionMutationEnabled) {
        releasedBatch = await createReleasedProductionBatch()
      }
      assert(releasedBatch, 'at least one released batch should expose output lot genealogy')

      return [
        `Batches: ${batches.length}`,
        `Inspected: ${inspected.map((batch) => batch.id).join(', ')}`,
        `Released output: ${releasedBatch.outputLot.lotNumber}`,
        `Genealogy outputLotId: ${releasedBatch.genealogy.outputLotId}`,
      ]
    },
  },
  {
    id: 'TC-007',
    module: 'Frontend Auth / Production UI',
    priority: 'P0',
    title: 'Live UI logs in without frontend secrets and renders Production phase evidence',
    objective: 'Verify the deployed Pages app can authenticate with the cookie session, survive reload, and render the Phase 9 production panels.',
    steps: [
      'Open the live Pages app in Chromium.',
      'Login with owner@example.test.',
      'Inspect localStorage and API-domain cookies.',
      'Reload and confirm the console restores from cookie.',
      'Open the Production module and capture screenshot evidence.',
    ],
    assertions: [
      'No framework overlay or blank page is shown.',
      'localStorage does not contain olfactoryops.auth.v1.',
      'localStorage only stores the session marker.',
      'API cookie named oo_session is HttpOnly and Secure.',
      'Production UI shows Work Order & QC Protocol, Batch Board, and Phase 9 Guardrails.',
      'No relevant console errors, page errors, or failed requests are emitted.',
    ],
    execute: async () => runUiFunctionalCase(),
  },
]

for (const testCase of testCases) {
  const started = Date.now()
  try {
    const evidence = await testCase.execute()
    results.push({ ...testCase, status: 'PASS', durationMs: Date.now() - started, evidence, error: null })
    console.log(`PASS ${testCase.id} ${testCase.title}`)
  } catch (error) {
    results.push({
      ...testCase,
      status: 'FAIL',
      durationMs: Date.now() - started,
      evidence: [],
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    })
    console.error(`FAIL ${testCase.id} ${testCase.title}`)
    console.error(error instanceof Error ? error.message : error)
  }
}

const reportPath = path.join(reportRoot, `functional-test-report-${runStamp}.md`)
await writeFile(reportPath, renderReport(), 'utf8')

const failed = results.filter((result) => result.status === 'FAIL')
console.log(`Functional test report: ${reportPath}`)
console.log(`Result: ${results.length - failed.length}/${results.length} passed`)

if (failed.length > 0) {
  process.exit(1)
}

async function createReleasedProductionBatch() {
  const created = await apiFetch(
    '/production/batches',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formulaId: 'frm-0421', targetGrams: 1 }),
    },
  )
  assertStatus(created, 200, 'production mutation setup should create a batch')
  const batchId = created.json?.data?.id
  assert(batchId, 'production mutation setup should return a batch id')
  const consumed = await apiFetch(`/production/batches/${encodeURIComponent(batchId)}/consume`, { method: 'POST' })
  assertStatus(consumed, 200, 'production mutation setup should consume inventory')
  const qc = await apiFetch(
    `/production/batches/${encodeURIComponent(batchId)}/qc`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: 'PASSED' }),
    },
  )
  assertStatus(qc, 200, 'production mutation setup should pass QC')
  const released = await apiFetch(
    `/production/batches/${encodeURIComponent(batchId)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RELEASED' }),
    },
  )
  assertStatus(released, 200, 'production mutation setup should release batch')
  return released.json?.data?.batch
}

async function runUiFunctionalCase() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const consoleIssues = []
  const pageErrors = []
  const failedRequests = []

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleIssues.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('requestfailed', (request) => {
    const failure = request.failure()
    const text = failure?.errorText ?? 'unknown'
    if (!text.includes('net::ERR_ABORTED')) {
      failedRequests.push(`${request.method()} ${request.url()} ${text}`)
    }
  })

  try {
    await page.goto(appUrl, { waitUntil: 'networkidle' })
    const title = await page.title()
    assert(title.toLowerCase().includes('olfactory'), `page title should identify OlfactoryOps, got "${title}"`)
    const bodyText = await page.locator('body').innerText({ timeout: 10_000 })
    assert(bodyText.includes('OlfactoryOps'), 'app should render meaningful OlfactoryOps content')
    assert(!/vite|webpack|runtime error|internal server error/i.test(bodyText), 'app should not show a framework error overlay')

    await page.getByLabel('Login email').fill(loginEmail)
    await page.getByRole('button', { name: /^Login$/ }).last().click()
    await page.locator('.topbar').waitFor({ timeout: 20_000 })
    await page.waitForFunction(() => window.localStorage.getItem('olfactoryops.has_session.v1') === '1')

    const storageState = await page.evaluate(() => ({
      sessionSecret: window.localStorage.getItem('olfactoryops.auth.v1'),
      marker: window.localStorage.getItem('olfactoryops.has_session.v1'),
      keys: Object.keys(window.localStorage),
    }))
    assert(storageState.sessionSecret === null, 'frontend should not keep auth session secret in localStorage')
    assert(storageState.marker === '1', 'frontend should keep only the session marker')

    const apiOrigin = new URL(apiBaseUrl).origin
    const cookies = await context.cookies(apiOrigin)
    const sessionCookie = cookies.find((cookie) => cookie.name === 'oo_session')
    assert(sessionCookie, 'browser context should have oo_session for API origin')
    assert(sessionCookie.httpOnly, 'oo_session should be HttpOnly')
    assert(sessionCookie.secure, 'oo_session should be Secure')

    const authScreenshot = path.join(evidenceRoot, 'ui-authenticated-dashboard.png')
    await page.screenshot({ path: authScreenshot, fullPage: false })

    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('.topbar').waitFor({ timeout: 20_000 })
    await page.locator('button.nav-item[title="Production"]').click()
    const workOrderHeading = page.getByText('Work Order & QC Protocol')
    await workOrderHeading.waitFor({ timeout: 20_000 })
    await page.getByText('Batch Board').waitFor({ timeout: 20_000 })
    await page.getByText('Phase 9 Guardrails').waitFor({ timeout: 20_000 })
    await page.getByText(/Output|Pending release/).first().waitFor({ timeout: 20_000 })

    const productionScreenshot = path.join(evidenceRoot, 'ui-production-phase9.png')
    await workOrderHeading.scrollIntoViewIfNeeded()
    await page.screenshot({ path: productionScreenshot, fullPage: true })

    const relevantConsoleIssues = consoleIssues.filter(isRelevantBrowserIssue)
    assert(relevantConsoleIssues.length === 0, `browser console should be clean: ${relevantConsoleIssues.join('; ')}`)
    assert(pageErrors.length === 0, `page errors should be empty: ${pageErrors.join('; ')}`)
    assert(failedRequests.length === 0, `failed requests should be empty: ${failedRequests.join('; ')}`)

    return [
      `Title: ${title}`,
      `localStorage keys: ${storageState.keys.join(', ') || '(none)'}`,
      `oo_session cookie: HttpOnly=${sessionCookie.httpOnly}, Secure=${sessionCookie.secure}, SameSite=${sessionCookie.sameSite}`,
      `Auth screenshot: ${relativeReportPath(authScreenshot)}`,
      `Production screenshot: ${relativeReportPath(productionScreenshot)}`,
    ]
  } finally {
    await browser.close()
  }
}

async function apiFetch(pathname, init = {}, options = {}) {
  const headers = new Headers(init.headers ?? {})
  headers.set('Origin', appUrl)
  if (csrfToken && options.useCsrf !== false && isMutatingRequest(init)) {
    headers.set('X-CSRF-Token', csrfToken)
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (options.useCookie !== false) {
    const cookieHeader = Array.from(cookieJar.entries())
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join('; ')
    if (cookieHeader) {
      headers.set('Cookie', cookieHeader)
    }
  }

  const response = await fetch(`${apiBaseUrl}${pathname}`, { ...init, headers })
  captureCookies(response.headers)
  const text = await response.text()
  let json = null
  if (text.trim()) {
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text }
    }
  }
  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    setCookie: getSetCookieValues(response.headers),
    json,
    text,
  }
}

function isMutatingRequest(init = {}) {
  const method = init.method?.toUpperCase() ?? 'GET'
  return method !== 'GET' && method !== 'HEAD'
}

function captureCookies(headers) {
  for (const setCookie of getSetCookieValues(headers)) {
    const [pair] = setCookie.split(';', 1)
    const [rawName, ...rawValue] = pair.split('=')
    if (!rawName || rawValue.length === 0) {
      continue
    }
    const maxAgeMatch = setCookie.match(/Max-Age=(\d+)/i)
    if (maxAgeMatch?.[1] === '0') {
      cookieJar.delete(rawName)
      continue
    }
    cookieJar.set(rawName, decodeURIComponent(rawValue.join('=')))
  }
}

function getSetCookieValues(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie()
  }
  const value = headers.get('set-cookie')
  return value ? [value] : []
}

function assertStatus(response, expected, message) {
  assert(response.status === expected, `${message}: expected ${expected}, got ${response.status} ${response.text}`)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function isRelevantBrowserIssue(message) {
  return ![
    'favicon',
    'DevTools failed to load source map',
  ].some((ignored) => message.includes(ignored))
}

function renderReport() {
  const passed = results.filter((result) => result.status === 'PASS').length
  const failed = results.length - passed
  const finishedAt = new Date()
  const rows = results
    .map(
      (result) =>
        `| ${result.id} | ${result.module} | ${result.priority} | ${result.status} | ${formatMs(result.durationMs)} | ${oneLine(result.evidence[0] ?? result.error ?? '')} |`,
    )
    .join('\n')
  const details = results.map(renderResultDetail).join('\n\n')

  return `# OlfactoryOps Functional Test Report

Generated: ${finishedAt.toISOString()}
Run started: ${runStartedAt.toISOString()}
App URL: ${appUrl}
API URL: ${apiBaseUrl}
Browser path: Playwright fallback
Fallback reason: ${browserFallbackReason}
Production mutation mode: ${productionMutationEnabled ? 'enabled' : 'disabled'}

## Summary

- Total: ${results.length}
- Passed: ${passed}
- Failed: ${failed}
- Result: ${failed === 0 ? 'PASS' : 'FAIL'}

## Test Case Matrix

| ID | Module | Priority | Result | Duration | Evidence |
| --- | --- | --- | --- | --- | --- |
${rows}

## Detailed Test Cases

${details}
`
}

function renderResultDetail(result) {
  const steps = result.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
  const assertions = result.assertions.map((assertion) => `- ${assertion}`).join('\n')
  const evidence = result.evidence.length > 0 ? result.evidence.map((item) => `- ${item}`).join('\n') : '- No passing evidence captured.'
  const failure = result.error ? `\n\nFailure:\n\n\`\`\`text\n${result.error}\n\`\`\`` : ''

  return `### ${result.id} - ${result.title}

Module: ${result.module}
Priority: ${result.priority}
Result: ${result.status}
Duration: ${formatMs(result.durationMs)}

Objective:
${result.objective}

Steps:
${steps}

Assertions:
${assertions}

Evidence:
${evidence}${failure}`
}

function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 180)
}

function formatMs(value) {
  return `${(value / 1000).toFixed(2)}s`
}

function stampForFile(date) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function relativeReportPath(filePath) {
  return path.relative(reportRoot, filePath).replace(/\\/g, '/')
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}
