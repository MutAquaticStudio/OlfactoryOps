import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportRoot = path.join(repoRoot, 'reports')
const appUrl = requiredHttpsUrl('PRODUCTION_SMOKE_APP_URL')
const tenantUrl = requiredHttpsUrl('PRODUCTION_SMOKE_TENANT_URL')
const apiBaseUrl = requiredHttpsUrl('PRODUCTION_SMOKE_API_URL')
const loginEmail = requireEnvironmentValue('PRODUCTION_SMOKE_LOGIN_EMAIL')
const loginPassword = requireEnvironmentValue('PRODUCTION_SMOKE_LOGIN_PASSWORD')
const startedAt = new Date()
const reportPath = path.join(reportRoot, `production-smoke-${stampForFile(startedAt)}.md`)
const cookieJar = new Map()
const results = []

const cases = [
  {
    id: 'PS-001',
    title: 'Public app and API health are reachable without a session',
    run: async () => {
      const app = await fetch(appUrl, { redirect: 'manual' })
      assert(app.status >= 200 && app.status < 400, `public application returned ${app.status}`)

      const health = await apiFetch('/health', {}, { useCookie: false })
      assert(health.response.status === 200, `health returned ${health.response.status}`)
      assert(health.json?.ok === true, 'health response does not report ok=true')
      assert(health.response.headers.get('cache-control')?.includes('no-store'), 'health must be no-store')
      assert(health.response.headers.get('x-content-type-options') === 'nosniff', 'health must send nosniff')

      const untrusted = await apiFetch('/health', {}, { useCookie: false, origin: 'https://attacker.invalid' })
      assert(untrusted.response.headers.get('access-control-allow-origin') === null, 'untrusted CORS origin was allowed')
      return ['Public application and health endpoint responded.', 'Untrusted origin received no credentialed CORS header.']
    },
  },
  {
    id: 'PS-002',
    title: 'System workspace hostname is routed by the tenant router',
    run: async () => {
      const tenant = await fetch(tenantUrl, { redirect: 'manual' })
      assert(tenant.status >= 200 && tenant.status < 400, `tenant hostname returned ${tenant.status}`)
      assert(tenant.headers.get('x-olfactoryops-workspace-router') === 'active', 'tenant router header was not active')
      return ['System workspace hostname returned through the tenant router.']
    },
  },
  {
    id: 'PS-003',
    title: 'A production login restores the expected tenant session without data mutation',
    run: async () => {
      const login = await apiFetch(
        '/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        },
        { useCookie: false },
      )
      assert(login.response.status === 200, `login returned ${login.response.status}`)
      assert(cookieJar.has('oo_session'), 'login did not issue an opaque session cookie')
      assert(login.setCookies.some((cookie) => /HttpOnly/i.test(cookie) && /Secure/i.test(cookie)), 'session cookie is missing HttpOnly or Secure')

      const me = await apiFetch('/me', {}, { origin: tenantUrl })
      assert(me.response.status === 200, `/me returned ${me.response.status}`)
      assert(Boolean(me.json?.data?.session?.organizationId), '/me did not return a scoped tenant session')
      assert(me.response.headers.get('access-control-allow-origin') === tenantUrl, 'tenant CORS origin was not echoed exactly')
      return ['Login succeeded with an opaque secure cookie.', 'Tenant-scoped session restored through the exact workspace origin.']
    },
  },
]

for (const testCase of cases) {
  const started = Date.now()
  try {
    const evidence = await testCase.run()
    results.push({ ...testCase, status: 'PASS', durationMs: Date.now() - started, evidence })
    console.log(`PASS ${testCase.id} ${testCase.title}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({ ...testCase, status: 'FAIL', durationMs: Date.now() - started, evidence: [message] })
    console.error(`FAIL ${testCase.id} ${message}`)
  }
}

await mkdir(reportRoot, { recursive: true })
await writeFile(reportPath, renderReport(), 'utf8')
console.log(`Production smoke report: ${reportPath}`)

if (results.some((result) => result.status === 'FAIL')) {
  process.exitCode = 1
}

async function apiFetch(pathname, init = {}, options = {}) {
  const headers = new Headers(init.headers ?? {})
  headers.set('Origin', options.origin ?? appUrl)
  if (options.useCookie !== false && cookieJar.size > 0) {
    headers.set('Cookie', Array.from(cookieJar.entries()).map(([name, value]) => `${name}=${value}`).join('; '))
  }
  const response = await fetch(`${apiBaseUrl}${pathname}`, { ...init, headers, redirect: 'manual' })
  const setCookies = readSetCookies(response.headers)
  for (const header of setCookies) {
    const [pair] = header.split(';', 1)
    const separator = pair.indexOf('=')
    if (separator > 0) {
      cookieJar.set(pair.slice(0, separator), pair.slice(separator + 1))
    }
  }
  const raw = await response.text()
  let json = null
  try {
    json = raw ? JSON.parse(raw) : null
  } catch {
    // An invalid JSON error page is reported by the assertion for its status.
  }
  return { response, json, setCookies }
}

function readSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie()
  }
  const value = headers.get('set-cookie')
  return value ? [value] : []
}

function requiredHttpsUrl(name) {
  const value = requireEnvironmentValue(name)
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use https`)
  }
  return url.toString().replace(/\/$/, '')
}

function requireEnvironmentValue(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} must be provided through an untracked local environment`)
  }
  return value
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function stampForFile(value) {
  return value.toISOString().replace(/[:.]/g, '-')
}

function renderReport() {
  const passed = results.filter((result) => result.status === 'PASS').length
  return `# Production Smoke Report\n\n- Started: ${startedAt.toISOString()}\n- Scope: public health, tenant routing, secure login, and scoped session restore only\n- Data policy: no tenant, material, inventory, production, order, or domain mutation\n- Result: ${passed}/${results.length} passed\n\n## Cases\n\n${results.map((result) => `### ${result.status} ${result.id} - ${result.title}\n\n- Duration: ${result.durationMs}ms\n${result.evidence.map((entry) => `- ${entry}`).join('\n')}\n`).join('\n')}\n`
}
