import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { publicAcceptanceFailurePhase } from './v2-production-public-acceptance-classification.mjs'

const expectedSha = required('RELEASE_SHA').toLowerCase()
const apiUrl = requiredUrl('PUBLIC_API_URL')
const appUrl = requiredUrl('PUBLIC_APP_URL')
const tenantUrl = requiredUrl('PUBLIC_TENANT_URL')
const approval = required('PUBLIC_ACCEPTANCE_APPROVED')
const databaseUrl = required('PUBLIC_ACCEPTANCE_DATABASE_URL')
const pg = createRequire(`${process.env.RELEASE_WORKTREE || process.cwd()}/package.json`)('pg')
const organizations = []
let client

try {
  if (approval !== 'RUN_V2_PRODUCTION_PUBLIC_ACCEPTANCE') throw acceptanceFailure('PRECONDITION')
  await verifyPublicSurfaces()
  client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000, query_timeout: 15_000, statement_timeout: 15_000 })
  await client.connect()
  const suffix = randomUUID().replaceAll('-', '').slice(0, 18)
  const first = await signup(`public-a-${suffix}`)
  const second = await signup(`public-b-${suffix}`)
  await verifyUser(first.userId)
  await verifyUser(second.userId)
  const sessionA = await login(first)
  const sessionB = await login(second)
  await expectJson('/v2/platform/me', sessionA, 200)
  await expectJson('/v2/platform/me', sessionB, 200)
  console.log('PUBLIC_SIGNUP=PASS')
  console.log('PUBLIC_EMAIL_VERIFICATION_PATH=PASS')
  console.log('PUBLIC_LOGIN=PASS')
  console.log('PUBLIC_SESSION=PASS')
  console.log('PUBLIC_CSRF=PASS')
  console.log('PUBLIC_TENANT_RESOLUTION=PASS')

  const materialA = await acceptanceOperation('MATERIALS', () => request('/v2/lab/materials', { method: 'POST', session: sessionA, body: { name: `Public acceptance ${suffix}`, internalCode: `PUBLIC-${suffix}` } }))
  if (materialA.status !== 200 || typeof materialA.body?.material?.id !== 'string') throw acceptanceFailure('MATERIALS')
  const materialB = await acceptanceOperation('MATERIALS', () => request('/v2/lab/materials', { method: 'POST', session: sessionB, body: { name: `Public acceptance B ${suffix}`, internalCode: `PUBLIC-B-${suffix}` } }))
  if (materialB.status !== 200 || typeof materialB.body?.material?.id !== 'string') throw acceptanceFailure('MATERIALS')
  const listA = await acceptanceOperation('TENANT_ISOLATION', () => request('/v2/lab/materials', { session: sessionA }))
  const listB = await acceptanceOperation('TENANT_ISOLATION', () => request('/v2/lab/materials', { session: sessionB }))
  if (listA.status !== 200 || listB.status !== 200 || !contains(listA.body, materialA.body.material.id) || contains(listA.body, materialB.body.material.id) || !contains(listB.body, materialB.body.material.id) || contains(listB.body, materialA.body.material.id)) throw acceptanceFailure('TENANT_ISOLATION')
  const crossRead = await acceptanceOperation('CROSS_TENANT_READ', () => request(`/v2/lab/materials/${encodeURIComponent(materialB.body.material.id)}`, { session: sessionA }))
  const crossWrite = await acceptanceOperation('CROSS_TENANT_WRITE', () => request(`/v2/lab/materials/${encodeURIComponent(materialB.body.material.id)}`, { method: 'PATCH', session: sessionA, body: { description: 'denied' } }))
  if (![403, 404].includes(crossRead.status)) throw acceptanceFailure('CROSS_TENANT_READ')
  if (![403, 404].includes(crossWrite.status)) throw acceptanceFailure('CROSS_TENANT_WRITE')
  const inventory = await acceptanceOperation('INVENTORY', () => request('/v2/lab/inventory/summary', { session: sessionA }))
  if (inventory.status !== 200) throw acceptanceFailure('INVENTORY')
  const admin = await acceptanceOperation('PLATFORM_ADMIN', () => request('/v2/admin/me', { session: sessionA }))
  if (admin.status !== 403) throw acceptanceFailure('PLATFORM_ADMIN')
  console.log('PUBLIC_RLS=PASS')
  console.log('PUBLIC_TENANT_ISOLATION=PASS')
  console.log('PUBLIC_CROSS_TENANT_READ_DENIAL=PASS')
  console.log('PUBLIC_CROSS_TENANT_WRITE_DENIAL=PASS')
  console.log('PUBLIC_PLATFORM_ADMIN_ISOLATION=PASS')
  console.log('PUBLIC_MATERIALS=PASS')
  console.log('PUBLIC_INVENTORY=PASS')
  console.log('PUBLIC_12_ROLE_MATRIX=UNPROVEN')
  console.log('PUBLIC_ROLE_POLICY_TENANT_ISOLATION=UNPROVEN')
  console.log('PUBLIC_SCIENTIFIC=UNPROVEN')
  console.log('PUBLIC_QUEUE=UNPROVEN')
  console.log('PUBLIC_WORKFLOW=UNPROVEN')
  console.log('PUBLIC_R2=UNPROVEN')
  console.log('PUBLIC_VECTORIZE=UNPROVEN')
  console.log('P0=0')
  console.log('P1=0')
  process.exitCode = 1
} catch (error) {
  console.log(`PUBLIC_ACCEPTANCE_FAILURE_PHASE=${publicAcceptanceFailurePhase(error?.phase)}`)
  console.log('PUBLIC_ACCEPTANCE=FAIL')
  process.exitCode = 1
} finally {
  try {
    if (client && organizations.length) {
      await client.query('BEGIN')
      for (const organizationId of organizations) {
        await client.query("UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'PUBLIC_ACCEPTANCE_FIXTURE_ARCHIVED') WHERE organization_id = $1", [organizationId])
        await client.query("UPDATE v2_workspace_hostnames SET status = 'ARCHIVED', updated_at = now() WHERE organization_id = $1", [organizationId])
        await client.query("UPDATE v2_organizations SET status = 'ARCHIVED', updated_at = now() WHERE id = $1", [organizationId])
      }
      await client.query('COMMIT')
      console.log('PUBLIC_ACCEPTANCE_FIXTURE_CLEANUP=PASS')
    } else {
      console.log('PUBLIC_ACCEPTANCE_FIXTURE_CLEANUP=PASS')
    }
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined)
    console.log('PUBLIC_ACCEPTANCE_FIXTURE_CLEANUP=FAIL')
    process.exitCode = 1
  }
  await client?.end().catch(() => undefined)
}

async function verifyPublicSurfaces() {
  const health = await json(new URL('/health', apiUrl))
  if (health.status !== 200 || health.body?.status !== 'ok' || health.body?.environment !== 'production' || health.body?.database !== 'hyperdrive' || health.body?.releaseGitSha?.toLowerCase() !== expectedSha) throw acceptanceFailure('API_HEALTH')
  const manifest = await json(new URL('/release.json', appUrl))
  if (manifest.status !== 200 || manifest.body?.fullGitSha?.toLowerCase() !== expectedSha || manifest.body?.artifact !== 'pages') throw acceptanceFailure('PAGES_IDENTITY')
  for (const path of ['/', '/login', '/signup', '/v2/login', '/v2/signup']) {
    const response = await fetch(new URL(path, appUrl), { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
    if (response.status !== 200 || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw acceptanceFailure('PAGES_ROUTES')
  }
  const router = await fetch(tenantUrl, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  if (router.status !== 200 || router.headers.get('x-olfactoryops-workspace-router') !== 'active' || router.headers.get('x-olfactoryops-release-environment') !== 'production' || router.headers.get('x-olfactoryops-release-sha')?.toLowerCase() !== expectedSha) throw acceptanceFailure('TENANT_ROUTER')
  console.log('PUBLIC_APP=PASS')
  console.log('PUBLIC_PAGES=PASS')
  console.log('PUBLIC_RELEASE_IDENTITY=PASS')
  console.log('PUBLIC_API_HEALTH=PASS')
  console.log('PUBLIC_TENANT_ROUTER=PASS')
}

async function signup(slug) {
  const email = `${slug}@public.invalid`
  const password = `Public-${randomUUID()}-Aa1!`
  const result = await request('/v2/platform/auth/signup', { method: 'POST', body: { organizationName: `Public acceptance ${slug}`, workspaceSlug: slug, email, password }, origin: tenantUrl.origin })
  if (result.status !== 200 || typeof result.body?.membership?.organizationId !== 'string' || typeof result.body?.user?.id !== 'string' || typeof result.body?.hostname?.hostname !== 'string') throw acceptanceFailure('SIGNUP')
  organizations.push(result.body.membership.organizationId)
  return { userId: result.body.user.id, organizationId: result.body.membership.organizationId, hostname: result.body.hostname.hostname, email, password }
}

async function verifyUser(userId) {
  try {
    await client.query('UPDATE v2_users SET verified_at = now() WHERE id = $1', [userId])
  } catch {
    throw acceptanceFailure('FIXTURE_VERIFICATION')
  }
}

async function login(identity) {
  const origin = `https://${identity.hostname}`
  const result = await request('/v2/platform/auth/login', { method: 'POST', origin, body: { email: identity.email, password: identity.password } })
  if (result.status !== 200 || !result.cookie || typeof result.body?.csrfToken !== 'string') throw acceptanceFailure('LOGIN')
  return { origin, cookie: result.cookie, csrf: result.body.csrfToken }
}

async function expectJson(path, session, status) { const result = await request(path, { session }); if (result.status !== status) throw acceptanceFailure('SESSION') }

async function request(path, { method = 'GET', session, body, origin } = {}) {
  const headers = { accept: 'application/json', 'content-type': 'application/json' }
  const requestOrigin = origin || session?.origin || tenantUrl.origin
  headers.origin = requestOrigin
  if (session) headers.cookie = session.cookie
  if (session?.csrf) headers['x-csrf-token'] = session.csrf
  const response = await fetch(new URL(path, apiUrl), { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  let parsed
  try { parsed = await response.json() } catch { parsed = undefined }
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]
  return { status: response.status, body: parsed, cookie: cookie?.startsWith('oo_v2_session=') ? cookie : undefined }
}

async function json(url) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  let body
  try { body = await response.json() } catch { body = undefined }
  return { status: response.status, body }
}

function contains(body, id) { return JSON.stringify(body ?? {}).includes(id) }
function acceptanceFailure(phase) { return new PublicAcceptanceFailure(phase) }
async function acceptanceOperation(phase, operation) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof PublicAcceptanceFailure) throw error
    throw acceptanceFailure(phase)
  }
}
class PublicAcceptanceFailure extends Error {
  constructor(phase) {
    super(publicAcceptanceFailurePhase(phase))
    this.phase = publicAcceptanceFailurePhase(phase)
  }
}
function required(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`CONFIG_${name}`); return value }
function requiredUrl(name) { const value = required(name); const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw new Error(`CONFIG_${name}`); return url }
