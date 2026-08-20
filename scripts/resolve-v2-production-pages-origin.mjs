const apiBase = 'https://api.cloudflare.com/client/v4'
const accountId = required('CLOUDFLARE_ACCOUNT_ID')
const token = required('CLOUDFLARE_API_TOKEN')
const project = required('PRODUCTION_PAGES_PROJECT')
const sha = required('RELEASE_SHA').toLowerCase()
const branch = process.env.PRODUCTION_PAGES_BRANCH?.trim() || 'production'

const candidates = []
for (let page = 1; page <= 20; page += 1) {
  const response = await cfGet(`/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(project)}/deployments?env=production&page=${page}&per_page=20`)
  if (!response.ok) fail('PAGES_DEPLOYMENT_INVENTORY')
  const rows = Array.isArray(response.body?.result) ? response.body.result : []
  candidates.push(...rows)
  const totalPages = Number(response.body?.result_info?.total_pages)
  if (Number.isInteger(totalPages) && totalPages > 0 && page >= Math.min(totalPages, 20)) break
  if (rows.length < 20) break
}

const matches = candidates.filter((deployment) => deployment?.latest_stage?.status === 'success' && deployment?.is_skipped !== true && deployment?.environment === 'production' && deployment?.deployment_trigger?.metadata?.branch === branch && deployment?.deployment_trigger?.metadata?.commit_hash?.toLowerCase() === sha)
  .sort((a, b) => String(b.created_on ?? '').localeCompare(String(a.created_on ?? '')))

for (const deployment of matches) {
  const origin = immutableOrigin(deployment?.url, project)
  if (!origin) continue
  if (await healthy(origin)) {
    console.log(`PAGES_PRODUCTION_ORIGIN=${origin}`)
    console.log('PAGES_PRODUCTION_IMMUTABLE_IDENTITY=PASS')
    console.log('PAGES_PRODUCTION_FIVE_ROUTES=PASS')
    if (process.env.GITHUB_OUTPUT) {
      await import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_OUTPUT, `origin=${origin}\n`))
    }
    process.exit(0)
  }
}

fail('PAGES_PRODUCTION_DEPLOYMENT_NOT_HEALTHY')

async function cfGet(path) {
  try {
    const response = await fetch(`${apiBase}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
    let body
    try { body = await response.json() } catch { body = undefined }
    return { ok: response.status >= 200 && response.status < 300 && body?.success === true, body }
  } catch { return { ok: false, body: undefined } }
}

async function healthy(origin) {
  const manifest = await fetchJson(new URL('/release.json', origin))
  if (manifest?.fullGitSha?.toLowerCase() !== sha || manifest?.artifact !== 'pages') return false
  for (const path of ['/', '/login', '/signup', '/v2/login', '/v2/signup']) {
    try {
      const response = await fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
      if (response.status !== 200 || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') ?? '')) return false
    } catch { return false }
  }
  return true
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
    if (response.status !== 200) return undefined
    return await response.json()
  } catch { return undefined }
}

function immutableOrigin(value, expectedProject) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password || url.port) return undefined
    const suffix = `.${expectedProject}.pages.dev`
    if (!url.hostname.endsWith(suffix) || url.hostname === `${expectedProject}.pages.dev`) return undefined
    return url.origin
  } catch { return undefined }
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) fail(`CONFIG_${name}`)
  return value
}

function fail(code) {
  console.log(`PAGES_ORIGIN_RESOLUTION_FAILURE=${code}`)
  process.exitCode = 1
  throw new Error(code)
}
