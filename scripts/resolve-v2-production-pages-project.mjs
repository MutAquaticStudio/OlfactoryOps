const account = required('CLOUDFLARE_ACCOUNT_ID')
const token = required('CLOUDFLARE_API_TOKEN')
const expectedProject = 'olfactoryops-v2-production'
const candidateProject = 'olfactoryops-v2-production-candidate'
const apiBase = 'https://api.cloudflare.com/client/v4'

const projects = []
for (let page = 1; page <= 10; page += 1) {
  const response = await get(`/accounts/${encodeURIComponent(account)}/pages/projects?page=${page}&per_page=100`)
  if (!response.ok) fail('PRODUCTION_PAGES_PROJECT_API_UNAVAILABLE')
  const rows = Array.isArray(response.body?.result) ? response.body.result : []
  projects.push(...rows)
  const totalPages = Number(response.body?.result_info?.total_pages)
  if ((Number.isInteger(totalPages) && totalPages > 0 && page >= totalPages) || rows.length < 100) break
}

const exact = projects.filter((project) => project?.name === expectedProject)
if (exact.length > 1) fail('PRODUCTION_PAGES_PROJECT_AMBIGUOUS')
if (exact.length === 0) {
  const candidateExists = projects.some((project) => project?.name === candidateProject)
  fail(candidateExists ? 'PRODUCTION_PAGES_PROJECT_CONFLICT' : 'PRODUCTION_PAGES_PROJECT_MISSING')
}

const detail = await get(`/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(expectedProject)}`)
if (!detail.ok || detail.body?.result?.name !== expectedProject) fail('PRODUCTION_PAGES_PROJECT_DETAIL_UNPROVEN')

const domains = Array.isArray(detail.body.result.domains) ? detail.body.result.domains : []
const deployments = await get(`/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(expectedProject)}/deployments?env=production&page=1&per_page=20`)
if (!deployments.ok) fail('PRODUCTION_PAGES_PROJECT_DEPLOYMENT_STATE_UNPROVEN')
const productionDeployments = Array.isArray(deployments.body?.result) ? deployments.body.result : []
const publicDomainState = domains.length === 0 && productionDeployments.length === 0 ? 'NONE' : 'EXISTING_KNOWN'

console.log(`PRODUCTION_PAGES_PROJECT=${expectedProject}`)
console.log('PRODUCTION_PAGES_PROJECT_READY=PASS')
console.log(`PRODUCTION_PAGES_PUBLIC_DOMAIN_BEFORE_CUTOVER=${publicDomainState}`)
if (process.env.GITHUB_OUTPUT) {
  const { appendFile } = await import('node:fs/promises')
  await appendFile(process.env.GITHUB_OUTPUT, `project=${expectedProject}\npublic_domain_state=${publicDomainState}\n`)
}

async function get(path) {
  try {
    const response = await fetch(`${apiBase}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    })
    let body
    try { body = await response.json() } catch { body = undefined }
    return { ok: response.ok && body?.success === true, body }
  } catch { return { ok: false, body: undefined } }
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) fail(`CONFIG_${name}`)
  return value
}

function fail(code) {
  console.log(`PRODUCTION_PAGES_PROJECT_RESOLUTION_FAILURE=${code}`)
  process.exitCode = 1
  throw new Error(code)
}
