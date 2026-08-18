const account = required('CLOUDFLARE_ACCOUNT_ID')
const token = required('CLOUDFLARE_API_TOKEN')
const project = required('PRODUCTION_PAGES_PROJECT')
const apiBase = 'https://api.cloudflare.com/client/v4'
const services = {
  cloudRuntime: 'olfactoryops-v2-cloud-runtime-production',
  api: 'olfactoryops-v2-api-production',
  router: 'olfactoryops-v2-tenant-router-production',
}

const workerResults = await Promise.all(Object.entries(services).map(async ([name, service]) => [name, await workerRollback(service)]))
const pages = await pagesRollback()
for (const [name, result] of workerResults) console.log(`ROLLBACK_${name.toUpperCase()}_READY=${result ? 'PASS' : 'FAIL'}`)
console.log(`ROLLBACK_PAGES_READY=${pages ? 'PASS' : 'FAIL'}`)
const pass = pages && workerResults.every(([, result]) => result)
console.log(`PRODUCTION_ROLLBACK_READY=${pass ? 'PASS' : 'UNPROVEN'}`)
if (!pass) process.exitCode = 1

async function workerRollback(service) {
  const body = await get(`/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(service)}/deployments`)
  const deployment = body?.result?.deployments?.[0]
  const version = deployment?.versions?.find((item) => item?.percentage === 100 && validId(item?.version_id))
  return Boolean(deployment && version)
}

async function pagesRollback() {
  const body = await get(`/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(project)}/deployments?env=production&per_page=20&page=1`)
  const deployment = Array.isArray(body?.result) ? body.result.find((item) => item?.latest_stage?.status === 'success' && item?.is_skipped !== true && validOrigin(item?.url, project)) : undefined
  return Boolean(deployment)
}

async function get(path) {
  try {
    const response = await fetch(`${apiBase}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
    if (!response.ok) return undefined
    const body = await response.json()
    return body?.success === true ? body : undefined
  } catch { return undefined }
}

function validId(value) { return typeof value === 'string' && value.trim().length >= 8 && value.trim().length <= 128 }
function validOrigin(value, expectedProject) { try { const url = new URL(value); return url.protocol === 'https:' && url.hostname.endsWith(`.${expectedProject}.pages.dev`) && !url.username && !url.password && !url.port } catch { return false } }
function required(name) { const value = process.env[name]?.trim(); if (!value) throw new Error('CONFIG_MISSING'); return value }
