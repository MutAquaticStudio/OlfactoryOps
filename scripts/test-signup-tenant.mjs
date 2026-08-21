import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportRoot = path.join(repoRoot, 'reports')

const apiBaseUrl = stripTrailingSlash(process.env.SIGNUP_TEST_API_URL ?? process.env.FUNCTIONAL_API_URL ?? '')
const appUrl = stripTrailingSlash(process.env.SIGNUP_TEST_APP_URL ?? process.env.FUNCTIONAL_APP_URL ?? '')
if (process.env.QA_ENVIRONMENT !== 'test' || process.env.ALLOW_SIGNUP_TENANT_TEST !== 'true' || !apiBaseUrl || !appUrl) {
  throw new Error('Refusing signup mutation. Set QA_ENVIRONMENT=test, ALLOW_SIGNUP_TENANT_TEST=true, SIGNUP_TEST_API_URL, and SIGNUP_TEST_APP_URL for an isolated test environment.')
}
const runStartedAt = new Date()
const runStamp = stampForFile(runStartedAt)
const workspaceSlug = slugify(process.env.SIGNUP_TEST_WORKSPACE_SLUG ?? `signup-${runStamp.toLowerCase()}`)
const organizationName = process.env.SIGNUP_TEST_ORG_NAME ?? `Signup Tenant ${runStamp}`
const email = (process.env.SIGNUP_TEST_EMAIL ?? `owner+${workspaceSlug}@labofscents.test`).toLowerCase()
const ownerName = process.env.SIGNUP_TEST_OWNER_NAME ?? 'Signup Tenant Owner'
const password =
  process.env.SIGNUP_TEST_PASSWORD ?? `SignupQa2026!${randomBytes(18).toString('base64url')}`
const expectedOrganizationId = `org-${workspaceSlug}`
const expectedBrandId = `brand-${workspaceSlug}`
const expectedSystemHostname = `${workspaceSlug}.labofscents.org`
const expectedWorkspaceUrl = `https://${expectedSystemHostname}`
const reportPath = path.join(reportRoot, `signup-tenant-test-${runStamp}.md`)
const cookieJar = new Map()
let csrfToken = null

await mkdir(reportRoot, { recursive: true })

const evidence = []

try {
  const signup = await apiFetch(
    '/auth/signup',
    {
      method: 'POST',
      body: JSON.stringify({
        organizationName,
        workspaceSlug,
        email,
        name: ownerName,
        password,
      }),
    },
    { useCookie: false },
  )
  assertStatus(signup, [200, 201], 'signup should create a tenant')
  const signupData = signup.json?.data
  assert(signupData?.organization?.id === expectedOrganizationId, 'signup should return the expected organization id')
  assert(signupData.organization.slug === workspaceSlug, 'signup should return the requested workspace slug')
  assert(signupData.organization.customDomain == null, 'signup must not activate a customer-owned domain')
  assert(signupData.organization.systemHostname === expectedSystemHostname, 'signup should allocate the system hostname')
  assert(signupData.systemHostname === expectedSystemHostname, 'signup should return the system hostname')
  assert(signupData.workspaceUrl === expectedWorkspaceUrl, 'signup should return the canonical workspace URL')
  assert(signupData.organization.primaryContact === email, 'organization primary contact should be the signup email')
  assert(signupData?.brand?.id === expectedBrandId, 'signup should create the expected default brand')
  assert(signupData.brand.organizationId === expectedOrganizationId, 'default brand should be scoped to the new organization')
  assert(signupData?.membership?.email === email, 'signup should create an owner membership for the email')
  assert(signupData.membership.organizationId === expectedOrganizationId, 'membership should be scoped to the new organization')
  assert(signupData.membership.role === 'Owner', 'signup membership should be Owner')
  assert(signupData.membership.status === 'ACTIVE', 'signup membership should be active')
  assert(signupData.membership.brandIds.includes(expectedBrandId), 'membership should include the default brand scope')
  assert(signupData?.session?.organizationId === expectedOrganizationId, 'signup session should be scoped to the new tenant')
  assert(signupData.session.brandId === expectedBrandId, 'signup session should use the default brand')
  assert(signupData.session.email === email, 'signup session email should match signup email')
  assert(signupData.subscription.organizationId === expectedOrganizationId, 'signup should create a tenant-scoped subscription')
  assert(signupData.subscription.planId === 'BETA_ACCESS', 'signup should project managed beta access')
  assert(signupData.subscription.status === 'active', 'signup beta access should be active')
  assert(signupData.sso.organizationId === expectedOrganizationId, 'signup should create a tenant SSO config')
  assert(signupData.sso.domain === '', 'signup SSO stays unconfigured until an owner enables it')
  csrfToken = signupData.csrfToken ?? null
  assert(csrfToken?.startsWith('csrf_'), 'signup should return a session-bound CSRF token')

  const setCookie = signup.setCookie.join(' | ')
  if (setCookie) {
    assert(/oo_session=/.test(setCookie), 'signup should set oo_session')
    assert(/HttpOnly/i.test(setCookie), 'signup cookie should be HttpOnly')
    assert(/Secure/i.test(setCookie), 'signup cookie should be Secure')
    assert(/SameSite=None/i.test(setCookie), 'signup cookie should use SameSite=None')
    assert(cookieJar.get('oo_session') !== signupData.session.id, 'signup cookie must use an opaque credential, not the session record ID')
  } else {
    evidence.push('Signup cookie: not emitted by local Nest API; Worker edge wrapper owns cookie issuance')
  }

  evidence.push(`Signup organization: ${signupData.organization.id} / ${signupData.organization.slug}`)
  evidence.push(`Signup system hostname: ${signupData.systemHostname}`)
  evidence.push(`Signup brand: ${signupData.brand.id}`)
  evidence.push(`Signup membership: ${signupData.membership.id} / ${signupData.membership.email}`)
  evidence.push(`Signup session: ${signupData.session.id}`)
  evidence.push(`Signup subscription: ${signupData.subscription.id} / ${signupData.subscription.planId}`)

  const me = await apiFetch('/me')
  assertStatus(me, 200, '/me should load with signup cookie')
  assert(me.json?.data?.session?.organizationId === expectedOrganizationId, '/me should hydrate the new tenant session')
  assert(me.json?.data?.csrfToken === csrfToken, '/me should return the signup session CSRF token')
  evidence.push(`/me tenant: ${me.json.data.session.organizationId}`)

  const tenantConsole = await apiFetch('/security/tenant-console')
  assertStatus(tenantConsole, 403, 'internal tenant console should stay hidden from a customer owner')
  assert(
    tenantConsole.json?.message?.includes('security.manageUsers'),
    'tenant console denial should enforce the internal security permission',
  )
  evidence.push(`Customer owner internal tenant console status: ${tenantConsole.status}`)

  const billing = await apiFetch('/billing/console')
  assertStatus(billing, 200, 'billing console should load for the signup tenant')
  const billingData = billing.json?.data
  assert(billingData.subscription.organizationId === expectedOrganizationId, 'billing subscription should be scoped to the new tenant')
  assert(billingData.subscription.planId === 'BETA_ACCESS', 'billing console should project beta access')
  assert(billingData.plan.id === 'BETA_ACCESS', 'billing console should hide the commercial plan')
  assert(billingData.sso.domain === '', 'billing console should not imply SSO is configured')
  assert(billingData.billingMode === 'managed_beta', 'beta must keep self-service billing disabled')
  evidence.push('Billing mode: managed_beta')

  const firstFormula = await apiFetch('/formulas', {
    method: 'POST',
    body: JSON.stringify({ name: 'First Signup Workspace Formula', targetGrams: 100 }),
  })
  assertStatus(firstFormula, [200, 201], 'a new beta workspace should be able to create its first formula')
  assert(
    firstFormula.json?.data?.formula?.organizationId === expectedOrganizationId,
    'first formula should be scoped to the signup tenant',
  )

  const billingAfterFirstFormula = await apiFetch('/billing/console')
  assertStatus(billingAfterFirstFormula, 200, 'billing console should reload after the first formula')
  assert(
    billingAfterFirstFormula.json?.data?.usage?.formulas === 1,
    'billing usage should count only the new tenant formula, not records from other tenants',
  )
  evidence.push(`First Formula: ${firstFormula.json.data.formula.code}`)
  evidence.push(`Tenant formula usage: ${billingAfterFirstFormula.json.data.usage.formulas}`)

  const crossTenant = await apiFetch('/security/tenant-probe?organizationId=org-nxl')
  assertStatus(crossTenant, 403, 'new signup tenant should not access org-nxl')
  evidence.push(`Cross-tenant probe status: ${crossTenant.status}`)

  const freshLogin = await apiFetch(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    { useCookie: false, useCsrf: false },
  )
  assertStatus(freshLogin, 200, 'a newly signed-up owner should be able to log in from persisted D1 state')
  assert(
    freshLogin.json?.data?.session?.organizationId === expectedOrganizationId,
    'fresh login should resolve the newly created tenant rather than a seeded workspace',
  )
  const meAfterFreshLogin = await apiFetch('/me')
  assertStatus(meAfterFreshLogin, 200, '/me should restore the fresh owner session')
  assert(
    meAfterFreshLogin.json?.data?.session?.organizationId === expectedOrganizationId,
    'fresh owner session should retain tenant scope',
  )
  evidence.push(`Fresh login tenant: ${meAfterFreshLogin.json.data.session.organizationId}`)

  await writeFile(reportPath, renderReport('PASS'), 'utf8')
  console.log(`Signup tenant test report: ${reportPath}`)
  console.log(`Result: PASS (${expectedOrganizationId})`)
} catch (error) {
  evidence.push(`Error: ${error instanceof Error ? error.message : String(error)}`)
  await writeFile(reportPath, renderReport('FAIL', error), 'utf8')
  console.error(`Signup tenant test report: ${reportPath}`)
  throw error
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
  if (isMutatingRequest(init) && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', `qa-signup-${randomBytes(12).toString('hex')}`)
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
  const expectedStatuses = Array.isArray(expected) ? expected : [expected]
  assert(
    expectedStatuses.includes(response.status),
    `${message}: expected ${expectedStatuses.join('/')}, got ${response.status} ${response.text}`,
  )
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function renderReport(result, error) {
  const finishedAt = new Date()
  const evidenceLines = evidence.map((item) => `- ${item}`).join('\n')
  const failure = result === 'FAIL' ? `\n\nFailure:\n\n\`\`\`text\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n\`\`\`` : ''
  return `# OlfactoryOps Signup Tenant Test Report

Generated: ${finishedAt.toISOString()}
Run started: ${runStartedAt.toISOString()}
API URL: ${apiBaseUrl}
App origin: ${appUrl}
Workspace slug: ${workspaceSlug}
Signup email: ${email}

## Summary

- Result: ${result}
- Expected organization: ${expectedOrganizationId}
- Expected brand: ${expectedBrandId}

## Assertions

- POST /auth/signup atomically creates organization, system hostname, brand, active owner membership, owner session, and CSRF token.
- Worker signup cookie is HttpOnly, Secure, SameSite=None when the edge wrapper emits Set-Cookie.
- GET /me hydrates the signup session from the persisted Worker state.
- POST /auth/login resolves the same tenant from persisted D1 state and its new session restores through GET /me.
- GET /security/tenant-console remains hidden behind the internal security permission for customer owners.
- GET /billing/console returns the new tenant's managed-beta state without enabling checkout or plan changes.
- A new beta workspace can create its first Formula and its usage is tenant-scoped.
- Cross-tenant probe to org-nxl is blocked.

## Evidence

${evidenceLines || '- No evidence captured.'}${failure}
`
}

function stampForFile(date) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function slugify(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48)
  return slug || `signup-${Date.now()}`
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}
