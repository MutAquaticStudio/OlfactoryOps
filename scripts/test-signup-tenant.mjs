import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportRoot = path.join(repoRoot, 'reports')

const apiBaseUrl = stripTrailingSlash(process.env.SIGNUP_TEST_API_URL ?? process.env.FUNCTIONAL_API_URL ?? 'https://api.labofscents.org/api/v1')
const appUrl = stripTrailingSlash(process.env.SIGNUP_TEST_APP_URL ?? process.env.FUNCTIONAL_APP_URL ?? 'https://labofscents.pages.dev')
const runStartedAt = new Date()
const runStamp = stampForFile(runStartedAt)
const workspaceSlug = slugify(process.env.SIGNUP_TEST_WORKSPACE_SLUG ?? `signup-${runStamp.toLowerCase()}`)
const organizationName = process.env.SIGNUP_TEST_ORG_NAME ?? `Signup Tenant ${runStamp}`
const email = (process.env.SIGNUP_TEST_EMAIL ?? `owner+${workspaceSlug}@labofscents.test`).toLowerCase()
const ownerName = process.env.SIGNUP_TEST_OWNER_NAME ?? 'Signup Tenant Owner'
const expectedOrganizationId = `org-${workspaceSlug}`
const expectedBrandId = `brand-${workspaceSlug}`
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
      }),
    },
    { useCookie: false },
  )
  assertStatus(signup, 200, 'signup should create a tenant')
  const signupData = signup.json?.data
  assert(signupData?.organization?.id === expectedOrganizationId, 'signup should return the expected organization id')
  assert(signupData.organization.slug === workspaceSlug, 'signup should return the requested workspace slug')
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
  csrfToken = signupData.csrfToken ?? null
  assert(csrfToken?.startsWith('csrf_'), 'signup should return a session-bound CSRF token')

  const setCookie = signup.setCookie.join(' | ')
  assert(/oo_session=/.test(setCookie), 'signup should set oo_session')
  assert(/HttpOnly/i.test(setCookie), 'signup cookie should be HttpOnly')
  assert(/Secure/i.test(setCookie), 'signup cookie should be Secure')
  assert(/SameSite=None/i.test(setCookie), 'signup cookie should use SameSite=None')
  assert(cookieJar.get('oo_session') === signupData.session.id, 'cookie jar should capture the signup session')

  evidence.push(`Signup organization: ${signupData.organization.id} / ${signupData.organization.slug}`)
  evidence.push(`Signup brand: ${signupData.brand.id}`)
  evidence.push(`Signup membership: ${signupData.membership.id} / ${signupData.membership.email}`)
  evidence.push(`Signup session: ${signupData.session.id}`)

  const me = await apiFetch('/me')
  assertStatus(me, 200, '/me should load with signup cookie')
  assert(me.json?.data?.session?.organizationId === expectedOrganizationId, '/me should hydrate the new tenant session')
  assert(me.json?.data?.csrfToken === csrfToken, '/me should return the signup session CSRF token')
  evidence.push(`/me tenant: ${me.json.data.session.organizationId}`)

  const tenantConsole = await apiFetch('/security/tenant-console')
  assertStatus(tenantConsole, 200, 'tenant console should load for the signup owner')
  const tenantData = tenantConsole.json?.data
  assert(tenantData?.organization?.id === expectedOrganizationId, 'tenant console should return the new organization')
  assert(tenantData.brands.length === 1, 'new tenant should expose one default brand')
  assert(tenantData.brands[0].id === expectedBrandId, 'tenant console brand should be the default signup brand')
  assert(
    tenantData.memberships.some((membership) => membership.email === email && membership.role === 'Owner'),
    'tenant console should include the signup owner membership',
  )
  assert(
    tenantData.memberships.every((membership) => membership.organizationId === expectedOrganizationId),
    'tenant memberships should stay inside the new organization',
  )
  assert(
    tenantData.sessions.every((session) => session.organizationId === expectedOrganizationId),
    'tenant sessions should stay inside the new organization',
  )
  evidence.push(`Tenant console memberships: ${tenantData.memberships.length}`)
  evidence.push(`Tenant console role policies: ${tenantData.rolePolicies.length}`)

  const crossTenant = await apiFetch('/security/tenant-probe?organizationId=org-nxl')
  assertStatus(crossTenant, 403, 'new signup tenant should not access org-nxl')
  evidence.push(`Cross-tenant probe status: ${crossTenant.status}`)

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

- POST /auth/signup creates organization, brand, active owner membership, owner session, and CSRF token.
- Signup cookie is HttpOnly, Secure, SameSite=None.
- GET /me hydrates the signup session from the persisted Worker state.
- GET /security/tenant-console returns only the new tenant's organization, brand, membership, and sessions.
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
