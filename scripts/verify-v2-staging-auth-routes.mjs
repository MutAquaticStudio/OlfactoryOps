const required = {
  approval: 'V2_STAGING_AUTH_ROUTE_APPROVED',
  publicOrigin: 'V2_STAGING_PUBLIC_ORIGIN',
  apiOrigin: 'V2_STAGING_API_ORIGIN',
  expectedSha: 'V2_STAGING_EXPECTED_SHA',
}

for (const [label, name] of Object.entries(required)) {
  if (!process.env[name]) throw new Error(`STAGING_AUTH_ROUTES=BLOCKED ${name} is required for ${label}`)
}
if (process.env[required.approval] !== 'VERIFY_STAGING_AUTH_ROUTES') throw new Error('STAGING_AUTH_ROUTES=BLOCKED explicit approval is required')
if (!/^[0-9a-f]{40}$/i.test(process.env[required.expectedSha])) throw new Error('STAGING_AUTH_ROUTES=FAIL expected release SHA is invalid')

const publicOrigin = new URL(process.env[required.publicOrigin])
const apiOrigin = new URL(process.env[required.apiOrigin])
if (publicOrigin.protocol !== 'https:' || apiOrigin.protocol !== 'https:') throw new Error('STAGING_AUTH_ROUTES=FAIL HTTPS origins are required')

const health = await fetch(new URL('/health', apiOrigin), { cache: 'no-store', headers: { accept: 'application/json' } })
const healthBody = await health.json().catch(() => undefined)
if (!health.ok || healthBody?.environment !== 'staging' || healthBody?.database !== 'hyperdrive' || healthBody?.releaseGitSha !== process.env[required.expectedSha]) {
  throw new Error(`STAGING_AUTH_ROUTES=FAIL API health does not match staging release (status=${health.status})`)
}

const { chromium } = await import('playwright')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const failures = []
page.on('pageerror', (error) => failures.push(`pageerror:${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon|manifest/i.test(message.text())) failures.push(`console:${message.text()}`)
})

try {
  for (const pathname of ['/login', '/signup', '/v2/login', '/v2/signup']) {
    const response = await page.goto(new URL(pathname, publicOrigin).toString(), { waitUntil: 'networkidle' })
    if (!response?.ok()) throw new Error(`STAGING_AUTH_ROUTES=FAIL ${pathname} returned ${response?.status() ?? 0}`)
    await page.getByTestId('v2-auth-card').waitFor({ state: 'visible', timeout: 15_000 })
    const heading = await page.locator('[data-testid="v2-auth-card"] h1').textContent()
    const expected = pathname.includes('signup') ? /create|tạo/i : /sign in|đăng nhập/i
    if (!expected.test(heading ?? '')) throw new Error(`STAGING_AUTH_ROUTES=FAIL ${pathname} did not render the authoritative V2 auth view`)
  }
  if (failures.length) throw new Error(`STAGING_AUTH_ROUTES=FAIL browser errors: ${failures.join(' | ')}`)
  console.log('STAGING_AUTH_ROUTES=PASS')
  console.log('NEW_SHA_STAGING_AUTH=PASS')
} finally {
  await browser.close()
}
