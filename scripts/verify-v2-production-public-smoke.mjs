const paths = ['/', '/login', '/signup', '/v2/login', '/v2/signup']

async function main() {
  const expectedSha = required('RELEASE_SHA').toLowerCase()
  const appUrl = requiredUrl('PRODUCTION_SMOKE_APP_URL')
  const tenantUrl = requiredTenantUrl('PRODUCTION_SMOKE_TENANT_URL')
  const apiUrl = requiredUrl('PRODUCTION_SMOKE_API_URL')
  const email = required('PRODUCTION_SMOKE_LOGIN_EMAIL')
  const password = required('PRODUCTION_SMOKE_LOGIN_PASSWORD')
  const results = []

  try {
    await checkApplication()
    await checkPages()
    await checkApiHealth()
    await checkTenantRouter()
    await checkLoginAndSession()
    for (const result of results) console.log(`${result.name}=PASS`)
    console.log('PUBLIC_V2_SMOKE=PASS')
  } catch (error) {
    const phase = error instanceof SmokeFailure ? error.phase : 'UNCLASSIFIED'
    if (error instanceof SmokeFailure) {
      for (const line of error.evidence) console.log(line)
    }
    console.log(`PUBLIC_V2_SMOKE_FAILURE=${phase}`)
    console.log('PUBLIC_V2_SMOKE=FAIL')
    process.exitCode = 1
  }

  async function checkApplication() {
  const response = await get(appUrl)
  if (response.status < 200 || response.status >= 400) throw new SmokeFailure('PUBLIC_APP')
  results.push({ name: 'PUBLIC_APP' })
}

  async function checkPages() {
  const manifest = await jsonGet(new URL('/release.json', appUrl))
  if (manifest.response.status !== 200 || manifest.body?.fullGitSha?.toLowerCase() !== expectedSha || manifest.body?.artifact !== 'pages') {
    throw new SmokeFailure('PUBLIC_RELEASE_IDENTITY')
  }
  for (const path of paths) {
    const response = await get(new URL(path, appUrl))
    if (response.status !== 200 || !html(response.contentType)) throw new SmokeFailure('PUBLIC_PAGES_ROUTE')
  }
  results.push({ name: 'PUBLIC_PAGES' })
  results.push({ name: 'PUBLIC_RELEASE_IDENTITY' })
}

  async function checkApiHealth() {
  const result = await jsonGet(new URL('/health', apiUrl))
  const body = result.body
  if (result.response.status !== 200 || body?.status !== 'ok' || body?.environment !== 'production' || body?.database !== 'hyperdrive' || body?.releaseGitSha?.toLowerCase() !== expectedSha) {
    throw new SmokeFailure('PUBLIC_API_HEALTH')
  }
  results.push({ name: 'PUBLIC_API_HEALTH' })
}

  async function checkTenantRouter() {
  const response = await get(tenantUrl)
  if (response.status !== 200 || !html(response.contentType) || response.headers.get('x-olfactoryops-workspace-router') !== 'active' || response.headers.get('x-olfactoryops-release-environment') !== 'production' || response.headers.get('x-olfactoryops-release-sha')?.toLowerCase() !== expectedSha) {
    throw new SmokeFailure('PUBLIC_TENANT_ROUTER')
  }
  results.push({ name: 'PUBLIC_TENANT_ROUTER' })
}

  async function checkLoginAndSession() {
  const origin = tenantUrl.origin
  const login = await loginRequest(new URL('/v2/platform/auth/login', apiUrl), {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const loginResult = classifyPublicLogin(login)
  if (!loginResult.pass) throw new SmokeFailure('PUBLIC_LOGIN', loginResult.evidence)
  const cookie = login.cookie
  results.push({ name: 'PUBLIC_LOGIN' })
  results.push({ name: 'PUBLIC_SESSION' })
  results.push({ name: 'PUBLIC_CSRF' })

  const session = await jsonGet(new URL('/v2/platform/me', apiUrl), { headers: { origin, cookie: cookie.pair } })
  if (session.response.status !== 200 || typeof session.body?.membership?.organizationId !== 'string' || session.response.headers.get('access-control-allow-origin') !== origin) {
    throw new SmokeFailure('PUBLIC_SESSION')
  }
}

  async function get(url, init = {}) {
  try {
    const response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20_000) })
    return { status: response.status, contentType: response.headers.get('content-type') ?? '', headers: response.headers }
  } catch {
    throw new SmokeFailure('TRANSPORT')
  }
}

  async function jsonGet(url, init = {}) {
  return jsonRequest(url, { ...init, method: 'GET' })
}

  async function jsonRequest(url, init) {
  let response
  try {
    response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new SmokeFailure('TRANSPORT')
  }
  let body
  try {
    body = await response.json()
  } catch {
    throw new SmokeFailure('NON_JSON_RESPONSE')
  }
  return { response, body, cookie: responseCookie(response) }
  }

  async function loginRequest(url, init) {
    let response
    try {
      response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20_000) })
    } catch {
      return { response: undefined, parsedJson: false, body: undefined, cookie: undefined }
    }
    try {
      const body = await response.json()
      return { response, parsedJson: true, body, cookie: responseCookie(response) }
    } catch {
      return { response, parsedJson: false, body: undefined, cookie: undefined }
    }
  }
}

function responseCookie(response) {
  const values = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie') ?? '']
  const raw = values.find((value) => /^oo_v2_session=/i.test(value))
  if (!raw) return undefined
  const pair = raw.split(';', 1)[0]
  const attributes = raw.split(';').slice(1).map((value) => value.trim().toLowerCase())
  return { name: pair, pair, secure: attributes.includes('secure'), httpOnly: attributes.includes('httponly'), sameSite: attributes.find((value) => value.startsWith('samesite=')) ?? '' }
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new SmokeFailure(`CONFIG_${name}`)
  return value
}

function requiredUrl(name) {
  const value = required(name)
  let url
  try { url = new URL(value) } catch { throw new SmokeFailure(`CONFIG_${name}`) }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw new SmokeFailure(`CONFIG_${name}`)
  return url
}

function requiredTenantUrl(name) {
  const url = requiredUrl(name)
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/.test(url.hostname) || url.hostname === 'next.labofscents.org') {
    throw new SmokeFailure(`CONFIG_${name}`)
  }
  return url
}

function html(value) { return /^text\/html(?:;|$)/i.test(value) }

class SmokeFailure extends Error {
  constructor(phase, evidence = []) {
    super(phase)
    this.phase = phase
    this.evidence = evidence.filter(safePublicLoginEvidence)
  }
}

function safePublicLoginEvidence(line) {
  return /^PUBLIC_LOGIN_HTTP_STATUS=(?:[1-5]\d\d|UNAVAILABLE)$/.test(line) ||
    /^PUBLIC_LOGIN_RESPONSE=(?:JSON|NON_JSON|TRANSPORT)$/.test(line) ||
    /^PUBLIC_LOGIN_SESSION_COOKIE=(?:PASS|FAIL|UNPROVEN)$/.test(line) ||
    /^PUBLIC_LOGIN_CSRF=(?:PASS|FAIL|UNPROVEN)$/.test(line)
}

function safeLoginStatus(response) {
  const status = response?.status
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? String(status)
    : 'UNAVAILABLE'
}

export function classifyPublicLogin({ response, parsedJson, cookie, body }) {
  if (!response) {
    return {
      pass: false,
      evidence: [
        'PUBLIC_LOGIN_HTTP_STATUS=UNAVAILABLE',
        'PUBLIC_LOGIN_RESPONSE=TRANSPORT',
        'PUBLIC_LOGIN_SESSION_COOKIE=UNPROVEN',
        'PUBLIC_LOGIN_CSRF=UNPROVEN',
      ],
    }
  }
  if (!parsedJson) {
    return {
      pass: false,
      evidence: [
        `PUBLIC_LOGIN_HTTP_STATUS=${safeLoginStatus(response)}`,
        'PUBLIC_LOGIN_RESPONSE=NON_JSON',
        'PUBLIC_LOGIN_SESSION_COOKIE=UNPROVEN',
        'PUBLIC_LOGIN_CSRF=UNPROVEN',
      ],
    }
  }
  const sessionCookie = Boolean(
    cookie?.name?.startsWith('oo_v2_session=') &&
      cookie.secure &&
      cookie.httpOnly &&
      cookie.sameSite,
  )
  const csrf = typeof body?.csrfToken === 'string' && body.csrfToken.length >= 16
  return {
    pass: response.status === 200 && sessionCookie && csrf,
    evidence: [
      `PUBLIC_LOGIN_HTTP_STATUS=${safeLoginStatus(response)}`,
      'PUBLIC_LOGIN_RESPONSE=JSON',
      `PUBLIC_LOGIN_SESSION_COOKIE=${sessionCookie ? 'PASS' : 'FAIL'}`,
      `PUBLIC_LOGIN_CSRF=${csrf ? 'PASS' : 'FAIL'}`,
    ],
  }
}

export { responseCookie }

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).pathname) await main()
