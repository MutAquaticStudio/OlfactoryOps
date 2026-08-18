const account = required('CLOUDFLARE_ACCOUNT_ID')
const token = required('CLOUDFLARE_API_TOKEN')
const bucket = required('BACKUP_BUCKET')
const base = 'https://api.cloudflare.com/client/v4'

try {
  const buckets = await listBuckets()
  const exact = buckets.filter((item) => item?.name === bucket)
  if (exact.length === 0) {
    console.log('BACKUP_BUCKET_MISSING=YES')
    process.exitCode = 10
  } else if (exact.length !== 1) {
    fail('BACKUP_BUCKET_AMBIGUOUS')
  } else {
    const managed = await get(`/accounts/${encodeURIComponent(account)}/r2/buckets/${encodeURIComponent(bucket)}/domains/managed`)
    if (managed?.result?.enabled !== false) fail('BACKUP_BUCKET_R2DEV_NOT_PRIVATE')
    const custom = await get(`/accounts/${encodeURIComponent(account)}/r2/buckets/${encodeURIComponent(bucket)}/domains/custom`)
    const domains = custom?.result?.domains
    if (!Array.isArray(domains) || domains.length !== 0) fail('BACKUP_BUCKET_CUSTOM_DOMAIN_PRESENT')
    console.log('BACKUP_BUCKET=PASS')
    console.log('BACKUP_BUCKET_PRIVATE=PASS')
    console.log('BACKUP_BUCKET_R2DEV=DISABLED')
    console.log('BACKUP_BUCKET_CUSTOM_DOMAINS=ZERO')
  }
} catch {
  console.log('BACKUP_BUCKET_PRIVATE=UNPROVEN')
  process.exitCode = 1
}

async function listBuckets() {
  const rows = []
  let cursor = ''
  for (let page = 0; page < 20; page += 1) {
    const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
    const response = await get(`/accounts/${encodeURIComponent(account)}/r2/buckets?per_page=100${suffix}`)
    const pageRows = response?.result?.buckets
    if (!Array.isArray(pageRows)) throw new Error('BUCKET_LIST_SCHEMA')
    rows.push(...pageRows)
    const next = response?.result_info?.cursor
    if (typeof next !== 'string' || next.length === 0) return rows
    if (next === cursor) throw new Error('BUCKET_CURSOR_STALLED')
    cursor = next
  }
  throw new Error('BUCKET_LIST_PAGINATION_LIMIT')
}

async function get(path) {
  const response = await fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  let body
  try { body = await response.json() } catch { throw new Error('R2_API_BODY') }
  if (!response.ok || body?.success !== true) throw new Error('R2_API_FAILURE')
  return body
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`CONFIG_${name}`)
  return value
}

function fail(code) {
  console.log(`BACKUP_BUCKET_PRIVATE=${code}`)
  process.exitCode = 1
  throw new Error(code)
}
