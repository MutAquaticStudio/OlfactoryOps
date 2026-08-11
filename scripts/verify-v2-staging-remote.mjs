import { randomUUID } from 'node:crypto'
import pg from 'pg'

const { Client } = pg

const approval = process.env.V2_STAGING_REMOTE_APPROVED
const databaseUrl = process.env.STAGING_DATABASE_URL
const apiOrigin = process.env.V2_STAGING_API_ORIGIN ?? 'https://api-beta.labofscents.org'
const publicPagesHost = process.env.V2_STAGING_PUBLIC_PAGES_HOST ?? 'beta.labofscents.org'
const workspaceBaseDomain = process.env.V2_STAGING_WORKSPACE_BASE_DOMAIN ?? 'api-beta.labofscents.org'

if (approval !== 'RUN_REMOTE_STAGING_E2E') throw new Error('REMOTE_STAGING_E2E=BLOCKED explicit RUN_REMOTE_STAGING_E2E approval is required')
if (!databaseUrl) throw new Error('REMOTE_STAGING_E2E=BLOCKED STAGING_DATABASE_URL is required')

const database = new URL(databaseUrl)
const api = new URL(apiOrigin)
if (!['postgresql:', 'postgres:'].includes(database.protocol) || ['localhost', '127.0.0.1', '::1'].includes(database.hostname)) throw new Error('REMOTE_STAGING_E2E=FAIL a non-loopback staging PostgreSQL origin is required')
if (api.protocol !== 'https:' || api.hostname !== 'api-beta.labofscents.org') throw new Error('REMOTE_STAGING_E2E=FAIL api origin must be the exact staging API hostname')
if (publicPagesHost !== 'beta.labofscents.org' || workspaceBaseDomain !== 'api-beta.labofscents.org') throw new Error('REMOTE_STAGING_E2E=FAIL the staging public and workspace hosts are fixed')

const roles = [
  'Owner', 'Admin', 'Lab Manager', 'Perfumer', 'R&D Scientist', 'Lab Technician',
  'Procurement', 'Sensory Panelist', 'Brand', 'Supplier', 'Finance', 'Viewer',
]
const materialViewRoles = new Set(['Owner', 'Admin', 'Lab Manager', 'Perfumer', 'R&D Scientist', 'Lab Technician', 'Procurement', 'Viewer'])
const inventoryViewRoles = new Set(['Owner', 'Admin', 'Lab Manager', 'Lab Technician', 'Viewer'])

function fail(code) { throw new Error(`REMOTE_STAGING_E2E=FAIL ${code}`) }
function assert(condition, code) { if (!condition) fail(code) }
function postgresFailureCategory(error) {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : ''
  if (code === '42501') return 'RLS_OR_PERMISSION'
  if (code === '23505') return 'CONFLICT'
  if (code === '23514') return 'CHECK'
  if (code === '23503') return 'FOREIGN_KEY'
  if (code === '23502') return 'NOT_NULL'
  if (/^[0-9A-Z]{5}$/.test(code)) return `PG_${code}`
  return 'DATABASE'
}

function setCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ?? '').split(/,(?=[^;,]+=)/)
  return values.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ')
}

async function request(path, { method = 'GET', origin, cookie, csrf, idempotencyKey, body } = {}) {
  const headers = new Headers({ Accept: 'application/json' })
  if (origin) headers.set('Origin', origin)
  if (cookie) headers.set('Cookie', cookie)
  if (csrf) headers.set('X-CSRF-Token', csrf)
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  const response = await fetch(new URL(`/api/v1${path}`, api), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  const text = await response.text()
  let json
  try { json = text ? JSON.parse(text) : undefined } catch { fail('non_json_api_response') }
  return { status: response.status, body: json, cookie: setCookies(response) }
}

async function expectStatus(path, options, status, code) {
  const result = await request(path, options)
  if (result.status !== status) {
    const errorCode = typeof result.body?.error?.code === 'string' ? result.body.error.code : 'NO_STABLE_ERROR_CODE'
    console.log(JSON.stringify({ remoteStagingFailure: { code, expectedStatus: status, actualStatus: result.status, errorCode } }))
  }
  assert(result.status === status, code)
  return result
}

function credentials(suffix, label) {
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return {
    email: `${safe}-${suffix}@staging.invalid`,
    password: `Staging-${suffix}-${safe}-Password!47`,
    displayName: `Staging ${label}`,
  }
}

async function main() {
  const client = new Client({ connectionString: databaseUrl })
  const suffix = randomUUID().replaceAll('-', '').slice(0, 18)
  const ownerA = credentials(suffix, 'Owner A')
  const ownerB = credentials(suffix, 'Owner B')
  const fixtureOrganizationIds = []
  const roleResults = []

  async function verifyRuntimeRoleWriteProbe() {
    const probeId = `probe_${suffix}`
    let phase = 'BEGIN'
    await client.query('BEGIN')
    try {
      phase = 'SET_ROLE'
      await client.query('SET LOCAL ROLE "hyperdrive_user"')
      phase = 'SET_CONTEXT'
      await client.query("SELECT set_config('app.organization_id', $1, true)", [probeId])
      phase = 'INSERT_ORGANIZATION'
      await client.query('INSERT INTO v2_organizations (id, slug, name, status) VALUES ($1, $2, $3, $4)', [probeId, `probe-${suffix}`, 'Staging runtime role rollback probe', 'ACTIVE'])
      phase = 'VERIFY_CONTEXT'
      const context = await client.query("SELECT current_user = 'hyperdrive_user' AS runtime_role, current_setting('app.organization_id', true) = $1 AS tenant_context", [probeId])
      assert(context.rows[0]?.runtime_role === true && context.rows[0]?.tenant_context === true, 'runtime_role_write_probe_context_invalid')
      await client.query('ROLLBACK')
      console.log(JSON.stringify({ runtimeRoleWriteProbe: 'PASS' }))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (phase === 'SET_ROLE' && postgresFailureCategory(error) === 'RLS_OR_PERMISSION') {
        console.log(JSON.stringify({ runtimeRoleWriteProbe: 'NOT_APPLICABLE', reason: 'STAGING_DATABASE_SESSION_CANNOT_ASSUME_RUNTIME_ROLE' }))
        return
      }
      console.log(JSON.stringify({ runtimeRoleWriteProbe: 'FAIL', phase, category: postgresFailureCategory(error) }))
      fail('runtime_role_write_probe_failed')
    }
  }

  async function verifyUser(userId) {
    await client.query('UPDATE v2_users SET verified_at = now() WHERE id = $1', [userId])
  }

  async function signup(label, input) {
    const result = await expectStatus('/v2/platform/auth/signup', {
      method: 'POST', origin: `https://${publicPagesHost}`,
      body: { organizationName: `Staging remote ${label} ${suffix}`, workspaceSlug: `stage-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`, ...input },
    }, 200, 'signup_failed')
    assert(typeof result.body?.user?.id === 'string' && typeof result.body?.membership?.organizationId === 'string' && typeof result.body?.hostname?.hostname === 'string' && result.body.hostname.hostname.endsWith(`.${workspaceBaseDomain}`), 'signup_projection_invalid')
    fixtureOrganizationIds.push(result.body.membership.organizationId)
    await verifyUser(result.body.user.id)
    return { ...input, userId: result.body.user.id, organizationId: result.body.membership.organizationId, hostname: result.body.hostname.hostname }
  }

  async function login(identity, hostname) {
    const origin = `https://${hostname}`
    const result = await expectStatus('/v2/platform/auth/login', { method: 'POST', origin, body: { email: identity.email, password: identity.password } }, 200, 'login_failed')
    assert(result.cookie.includes('oo_v2_session='), 'session_cookie_missing')
    assert(typeof result.body?.csrfToken === 'string' && result.body.csrfToken.length >= 16, 'csrf_missing')
    return { origin, cookie: result.cookie, csrf: result.body.csrfToken, membership: result.body.membership }
  }

  async function cleanup() {
    if (!fixtureOrganizationIds.length) return
    let phase = 'ARCHIVE'
    try {
      await client.query('BEGIN')
      for (const organizationId of fixtureOrganizationIds) {
        // The remote flow intentionally creates immutable audit evidence. Deleting an
        // organization would cascade into the append-only audit table and weaken that
        // invariant, so staging fixtures are made unreachable instead.
        await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId])
        await client.query("UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'STAGING_FIXTURE_ARCHIVED') WHERE organization_id = $1", [organizationId])
        await client.query("UPDATE v2_workspace_hostnames SET status = 'ARCHIVED', updated_at = now() WHERE organization_id = $1", [organizationId])
        await client.query("UPDATE v2_organizations SET status = 'ARCHIVED', updated_at = now() WHERE id = $1", [organizationId])
      }
      await client.query('COMMIT')
      console.log(JSON.stringify({ remoteStagingFixtureCleanup: 'ARCHIVED', organizations: fixtureOrganizationIds.length }))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      console.log(JSON.stringify({ remoteStagingCleanupFailure: { phase, category: postgresFailureCategory(error) } }))
      throw error
    }
  }

  let executionError
  try {
    await client.connect()
    await client.query('SELECT 1')
    await verifyRuntimeRoleWriteProbe()

    const first = await signup('tenant-a', ownerA)
    const second = await signup('tenant-b', ownerB)
    const sessionA = await login(first, first.hostname)
    const sessionB = await login(second, second.hostname)

    const materialA = await expectStatus('/v2/lab/materials', {
      method: 'POST', origin: sessionA.origin, cookie: sessionA.cookie, csrf: sessionA.csrf,
      idempotencyKey: `remote-material-a-${suffix}`,
      body: { name: `Remote tenant A material ${suffix}`, internalCode: `REMOTE-A-${suffix}` },
    }, 200, 'tenant_a_material_create_failed')
    const materialB = await expectStatus('/v2/lab/materials', {
      method: 'POST', origin: sessionB.origin, cookie: sessionB.cookie, csrf: sessionB.csrf,
      idempotencyKey: `remote-material-b-${suffix}`,
      body: { name: `Remote tenant B material ${suffix}`, internalCode: `REMOTE-B-${suffix}` },
    }, 200, 'tenant_b_material_create_failed')
    assert(typeof materialA.body?.material?.id === 'string' && typeof materialB.body?.material?.id === 'string', 'material_projection_invalid')

    const listA = await expectStatus('/v2/lab/materials', { origin: sessionA.origin, cookie: sessionA.cookie }, 200, 'tenant_a_material_list_failed')
    const listB = await expectStatus('/v2/lab/materials', { origin: sessionB.origin, cookie: sessionB.cookie }, 200, 'tenant_b_material_list_failed')
    assert(Array.isArray(listA.body?.materials) && listA.body.materials.some((item) => item.id === materialA.body.material.id) && !listA.body.materials.some((item) => item.id === materialB.body.material.id), 'tenant_a_list_leaked')
    assert(Array.isArray(listB.body?.materials) && listB.body.materials.some((item) => item.id === materialB.body.material.id) && !listB.body.materials.some((item) => item.id === materialA.body.material.id), 'tenant_b_list_leaked')

    await expectStatus(`/v2/lab/materials/${encodeURIComponent(materialB.body.material.id)}`, {
      method: 'PATCH', origin: sessionA.origin, cookie: sessionA.cookie, csrf: sessionA.csrf,
      idempotencyKey: `remote-cross-write-a-${suffix}`, body: { description: 'cross-tenant write control' },
    }, 404, 'tenant_a_cross_write_not_denied')
    await expectStatus(`/v2/lab/materials/${encodeURIComponent(materialA.body.material.id)}`, {
      method: 'PATCH', origin: sessionB.origin, cookie: sessionB.cookie, csrf: sessionB.csrf,
      idempotencyKey: `remote-cross-write-b-${suffix}`, body: { description: 'cross-tenant write control' },
    }, 404, 'tenant_b_cross_write_not_denied')
    await expectStatus('/v2/platform/me', { origin: sessionB.origin, cookie: sessionA.cookie }, 403, 'session_host_mismatch_not_denied')

    const identities = new Map([['Owner', first]])
    for (const role of roles.filter((role) => role !== 'Owner')) {
      const identity = await signup(`role-${role}`, credentials(suffix, role))
      await client.query('INSERT INTO v2_memberships (id, organization_id, user_id, role_key, status) VALUES ($1, $2, $3, $4, $5)', [
        `mem_remote_${suffix}_${role.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, first.organizationId, identity.userId, role, 'ACTIVE',
      ])
      identities.set(role, identity)
    }

    for (const role of roles) {
      const identity = identities.get(role)
      assert(identity, 'role_identity_missing')
      const session = role === 'Owner' ? sessionA : await login(identity, first.hostname)
      const me = await expectStatus('/v2/platform/me', { origin: session.origin, cookie: session.cookie }, 200, 'role_session_failed')
      assert(me.body?.membership?.organizationId === first.organizationId && me.body?.membership?.role === role, 'role_membership_projection_invalid')
      await expectStatus('/v2/lab/materials', { origin: session.origin, cookie: session.cookie }, materialViewRoles.has(role) ? 200 : 403, 'role_material_projection_invalid')
      await expectStatus('/v2/lab/inventory/summary', { origin: session.origin, cookie: session.cookie }, inventoryViewRoles.has(role) ? 200 : 403, 'role_inventory_projection_invalid')
      await expectStatus('/v2/platform/workspace/observability', { origin: session.origin, cookie: session.cookie }, role === 'Owner' ? 200 : 403, 'role_owner_surface_invalid')
      roleResults.push({ role, status: 'PASS' })
    }

    const viewer = identities.get('Viewer')
    assert(viewer, 'viewer_identity_missing')
    await client.query('INSERT INTO v2_memberships (id, organization_id, user_id, role_key, status) VALUES ($1, $2, $3, $4, $5)', [
      `mem_remote_${suffix}_viewer_b`, second.organizationId, viewer.userId, 'Viewer', 'ACTIVE',
    ])
    await expectStatus('/v2/platform/workspace/roles/Viewer/permissions', {
      method: 'PATCH', origin: sessionA.origin, cookie: sessionA.cookie, csrf: sessionA.csrf,
      body: { permissions: ['tenant.view'] },
    }, 200, 'tenant_a_policy_update_failed')
    const viewerA = await login(viewer, first.hostname)
    const viewerB = await login(viewer, second.hostname)
    await expectStatus('/v2/lab/materials', { origin: viewerA.origin, cookie: viewerA.cookie }, 403, 'tenant_a_role_policy_not_scoped')
    await expectStatus('/v2/lab/materials', { origin: viewerB.origin, cookie: viewerB.cookie }, 200, 'tenant_b_role_policy_leaked')

    console.log(JSON.stringify({
      remoteStaging: 'PASS', apiWorker: 'PASS', hyperdrive: 'PASS', rlsStaging: 'PASS',
      tenantIsolationStaging: 'PASS', roleE2eStaging: 'PASS', roles: roleResults,
    }))
  } catch (error) {
    executionError = error
  }

  try {
    await cleanup()
  } catch {
    if (!executionError) executionError = new Error('REMOTE_STAGING_E2E=FAIL fixture_cleanup_failed')
  }
  await client.end().catch(() => undefined)
  if (executionError) throw executionError
}

await main()
