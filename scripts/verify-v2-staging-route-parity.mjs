import { readFile } from 'node:fs/promises'

const approval = process.env.V2_STAGING_ROUTE_PARITY_APPROVED
const expectedSha = process.env.V2_STAGING_ROUTE_SHA
const apiOrigin = process.env.V2_STAGING_API_ORIGIN ?? 'https://api-beta.labofscents.org'
const matrixPath = new URL('../docs/v2/cloudflare/V2_WORKER_ROUTE_MATRIX.md', import.meta.url)

if (approval !== 'VERIFY_ROUTE_PARITY') throw new Error('PUBLIC_V2_WORKER_ROUTE_COVERAGE=BLOCKED explicit VERIFY_ROUTE_PARITY approval is required')
if (!/^[a-f0-9]{40}$/i.test(expectedSha ?? '')) throw new Error('PUBLIC_V2_WORKER_ROUTE_COVERAGE=FAIL an exact staging SHA is required')

const api = new URL(apiOrigin)
if (api.protocol !== 'https:' || api.hostname !== 'api-beta.labofscents.org') throw new Error('PUBLIC_V2_WORKER_ROUTE_COVERAGE=FAIL the exact staging API hostname is required')

function routeEntries(markdown) {
  const expression = /^\|\s*[^|]+\s*\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|\s*$/gm
  return [...markdown.matchAll(expression)].map((match) => ({ method: match[1], path: match[2] }))
}

function probePath(path) {
  return path.replace(/:[A-Za-z0-9_]+/g, 'route-probe')
}

async function probe(entry) {
  const response = await fetch(new URL(probePath(entry.path), api), {
    method: entry.method,
    headers: { accept: 'application/json' },
    cache: 'no-store',
    redirect: 'manual',
  })
  if (response.status === 403 && response.headers.get('cf-mitigated') === 'challenge') return { ok: false, reason: 'CLOUDFLARE_EDGE_CHALLENGE' }
  if (response.status === 404) return { ok: false, reason: 'ROUTE_NOT_RESOLVED' }
  if (response.status >= 500) return { ok: false, reason: `SERVER_${response.status}` }
  return { ok: true }
}

const matrix = await readFile(matrixPath, 'utf8')
const entries = routeEntries(matrix)
if (!entries.length) throw new Error('PUBLIC_V2_WORKER_ROUTE_COVERAGE=FAIL no generated V2 routes were found')

const health = await fetch(new URL('/health', api), { headers: { accept: 'application/json' }, cache: 'no-store' })
const healthBody = await health.json().catch(() => undefined)
if (!health.ok || healthBody?.releaseGitSha !== expectedSha || healthBody?.database !== 'hyperdrive') {
  throw new Error('PUBLIC_V2_WORKER_ROUTE_COVERAGE=FAIL API health does not match the approved Hyperdrive Worker revision')
}

const failed = []
for (let index = 0; index < entries.length; index += 10) {
  const batch = await Promise.all(entries.slice(index, index + 10).map(async (entry) => ({ entry, result: await probe(entry) })))
  failed.push(...batch.filter(({ result }) => !result.ok))
}

if (failed.length) {
  const reasons = [...new Set(failed.map(({ result }) => result.reason))].sort()
  throw new Error(`PUBLIC_V2_WORKER_ROUTE_COVERAGE=FAIL ${entries.length - failed.length}/${entries.length} reasons=${reasons.join(',')}`)
}

console.log(`PUBLIC_V2_WORKER_ROUTE_COVERAGE=100% ${entries.length}/${entries.length}`)
