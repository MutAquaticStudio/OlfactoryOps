import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import pg from 'pg'

const { Client } = pg
const approval = process.env.V2_STAGING_TENANT_HOST_APPROVED
const databaseUrl = process.env.STAGING_DATABASE_URL
const apiOrigin = process.env.V2_STAGING_API_ORIGIN ?? 'https://api-beta.labofscents.org'
const publicPagesHost = process.env.V2_STAGING_PUBLIC_PAGES_HOST ?? 'beta.labofscents.org'
const workspaceBaseDomain = process.env.V2_STAGING_WORKSPACE_BASE_DOMAIN ?? 'api-beta.labofscents.org'
const expectedSha = process.env.V2_STAGING_EXPECTED_SHA
const evidenceDirectory = process.env.V2_STAGING_TENANT_EVIDENCE_DIR

if (approval !== 'RUN_STAGING_TENANT_HOST_E2E') throw new Error('STAGING_TENANT_HOSTS=BLOCKED explicit staging approval is required')
if (process.env.V2_STAGING_ENVIRONMENT !== 'staging') throw new Error('STAGING_TENANT_HOSTS=BLOCKED staging environment marker is required')
if (!databaseUrl || !evidenceDirectory || !/^[a-f0-9]{40}$/i.test(expectedSha ?? '')) throw new Error('STAGING_TENANT_HOSTS=BLOCKED staging database, evidence directory, and exact SHA are required')

const database = new URL(databaseUrl)
const api = new URL(apiOrigin)
if (!['postgresql:', 'postgres:'].includes(database.protocol) || ['localhost', '127.0.0.1', '::1'].includes(database.hostname)) throw new Error('STAGING_TENANT_HOSTS=FAIL a non-loopback staging PostgreSQL origin is required')
if (api.protocol !== 'https:' || api.hostname !== 'api-beta.labofscents.org' || publicPagesHost !== 'beta.labofscents.org' || workspaceBaseDomain !== 'api-beta.labofscents.org') throw new Error('STAGING_TENANT_HOSTS=FAIL the approved staging host convention is required')

function fail(code) {
  throw new Error(`STAGING_TENANT_HOSTS=FAIL ${code}`)
}

function assert(value, code) {
  if (!value) fail(code)
}

function cookies(response) {
  const rows = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : (response.headers.get('set-cookie') ?? '').split(/,(?=[^;,]+=)/)
  return rows.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ')
}

async function request(path, { method = 'GET', origin, cookie, body, headers = {} } = {}) {
  const requestHeaders = new Headers({ Accept: 'application/json', ...headers })
  if (origin) requestHeaders.set('Origin', origin)
  if (cookie) requestHeaders.set('Cookie', cookie)
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json')
  const response = await fetch(new URL(`/api/v1${path}`, api), {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  const text = await response.text()
  let parsed
  try { parsed = text ? JSON.parse(text) : undefined } catch { fail('api_non_json_response') }
  return { status: response.status, body: parsed, cookie: cookies(response) }
}

async function main() {
  mkdirSync(evidenceDirectory, { recursive: true })
  const suffix = randomUUID().replaceAll('-', '').slice(0, 18)
  const slug = `tenant-host-${suffix}`
  const email = `tenant-host-${suffix}@staging.invalid`
  const password = `TenantHost-${suffix}-Password!47`
  const client = new Client({ connectionString: databaseUrl })
  const fixtureOrganizationIds = []
  let browser
  let executionError
  try {
    await client.connect()
    const signup = await request('/v2/platform/auth/signup', {
      method: 'POST',
      origin: `https://${publicPagesHost}`,
      body: { organizationName: `Tenant host staging ${suffix}`, workspaceSlug: slug, email, password, displayName: 'Tenant host staging owner' },
    })
    assert(signup.status === 200, 'signup_failed')
    const organizationId = signup.body?.membership?.organizationId
    const userId = signup.body?.user?.id
    const hostname = signup.body?.hostname?.hostname
    assert(typeof organizationId === 'string' && typeof userId === 'string' && typeof hostname === 'string' && hostname === `${slug}.${workspaceBaseDomain}`, 'tenant_hostname_projection_invalid')
    fixtureOrganizationIds.push(organizationId)
    await client.query('UPDATE v2_users SET verified_at = now() WHERE id = $1', [userId])

    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()
    const consoleErrors = []
    const failedRequests = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300)) })
    page.on('requestfailed', (request) => failedRequests.push(request.url()))

    const knownUrl = `https://${hostname}/v2/login`
    const knownResponse = await page.goto(knownUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    assert(knownResponse?.status() === 200, 'known_tenant_http_status')
    assert(knownResponse?.headers()['x-olfactoryops-workspace-router'] === 'active', 'known_tenant_router_header_missing')
    assert(knownResponse?.headers()['x-olfactoryops-release-sha'] === expectedSha, 'known_tenant_router_sha_mismatch')
    await page.locator('[data-testid="v2-auth-card"]').waitFor({ state: 'visible', timeout: 30_000 })
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(new RegExp(`^https://${hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/v2/workspace`), { timeout: 45_000 })
    await page.locator('[data-testid="v2-workspace"]').waitFor({ state: 'visible', timeout: 30_000 })
    await page.screenshot({ path: `${evidenceDirectory}/known-tenant.png`, fullPage: true })

    const browserCookies = await context.cookies(apiOrigin)
    const sessionCookie = browserCookies.find((item) => item.name === 'oo_v2_session')
    assert(Boolean(sessionCookie?.value), 'browser_session_cookie_missing')
    const apiSession = `oo_v2_session=${encodeURIComponent(sessionCookie.value)}`
    const resolved = await request('/v2/platform/me', { origin: `https://${hostname}`, cookie: apiSession })
    assert(resolved.status === 200 && resolved.body?.membership?.organizationId === organizationId, 'server_side_tenant_resolution_failed')
    const forged = await request('/v2/platform/me', {
      origin: `https://${hostname}`,
      cookie: apiSession,
      headers: { 'X-Organization-ID': `org_untrusted_${suffix}` },
    })
    assert(forged.status === 200 && forged.body?.membership?.organizationId === organizationId, 'browser_tenant_header_override_accepted')
    assert(consoleErrors.length === 0 && failedRequests.length === 0, 'known_tenant_browser_errors')

    const unknownHostname = `unknown-${suffix}.${workspaceBaseDomain}`
    const unknownPage = await context.newPage()
    const unknownUrl = `https://${unknownHostname}/v2/login`
    const unknownResponse = await unknownPage.goto(unknownUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    assert(unknownResponse?.status() === 404, 'unknown_tenant_http_status')
    assert(unknownResponse?.headers()['x-olfactoryops-workspace-router'] === undefined, 'unknown_tenant_router_activated')
    assert(unknownPage.url() === unknownUrl, 'unknown_tenant_redirected')
    assert((await unknownPage.locator('body').innerText()).trim() === 'Not found', 'unknown_tenant_response_not_safe')
    await unknownPage.screenshot({ path: `${evidenceDirectory}/unknown-tenant.png`, fullPage: true })
    await unknownPage.close()

    const evidence = {
      stagingKnownTenantHost: 'PASS',
      stagingUnknownTenantHost: 'PASS',
      tenantHostnameConvention: `<workspace>.${workspaceBaseDomain}`,
      knownHostname: hostname,
      unknownHostname,
      tenantRouter: 'PASS',
      tenantResolution: 'SERVER_SIDE_PASS',
      publicHeaderOverride: 'DENIED',
      tlsValidatedByBrowser: 'PASS',
      consoleFatalErrors: consoleErrors.length,
      fatalNetworkErrors: failedRequests.length,
      releaseGitSha: expectedSha,
      verifiedAt: new Date().toISOString(),
    }
    writeFileSync(`${evidenceDirectory}/tenant-host-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    console.log(JSON.stringify(evidence))
  } catch (error) {
    executionError = error
  }

  await browser?.close().catch(() => undefined)
  try {
    if (fixtureOrganizationIds.length) {
      await client.query('BEGIN')
      for (const organizationId of fixtureOrganizationIds) {
        await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId])
        await client.query("UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'STAGING_TENANT_HOST_FIXTURE_ARCHIVED') WHERE organization_id = $1", [organizationId])
        await client.query("UPDATE v2_workspace_hostnames SET status = 'ARCHIVED', updated_at = now() WHERE organization_id = $1", [organizationId])
        await client.query("UPDATE v2_organizations SET status = 'ARCHIVED', updated_at = now() WHERE id = $1", [organizationId])
      }
      await client.query('COMMIT')
      console.log(JSON.stringify({ stagingTenantHostFixtureCleanup: 'ARCHIVED', organizations: fixtureOrganizationIds.length }))
    }
  } catch {
    await client.query('ROLLBACK').catch(() => undefined)
    if (!executionError) executionError = new Error('STAGING_TENANT_HOSTS=FAIL fixture_cleanup_failed')
  }
  await client.end().catch(() => undefined)
  if (executionError) throw executionError
}

await main()
