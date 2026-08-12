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
  let response
  try {
    response = await fetch(new URL(`/api/v1${path}`, api), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') fail('api_request_timeout')
    fail('api_request_transport_failure')
  }
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
  const platformOperatorFixtureIds = []
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
      if (platformOperatorFixtureIds.length) {
        await client.query("UPDATE v2_platform_operators SET status = 'DISABLED', updated_at = now() WHERE id = ANY($1::text[])", [platformOperatorFixtureIds])
        await client.query(
          `INSERT INTO v2_platform_audit_events (id, actor_role, action, outcome, subject_type, subject_id, reason, correlation_id)
           SELECT 'pae_cleanup_' || substr(md5(operator_id || clock_timestamp()::text), 1, 20), 'PLATFORM_OWNER', 'platform.fixture.cleanup', 'ALLOWED', 'platform_operator', operator_id, 'staging fixture cleanup', $2
           FROM unnest($1::text[]) AS entries(operator_id)`,
          [platformOperatorFixtureIds, `staging-cleanup-${suffix}`],
        )
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

    // Platform authority is a separate PostgreSQL assignment. A tenant Owner
    // remains denied until this staging-only fixture receives an explicit
    // PlatformOperator row; no email or tenant role is used as authority.
    await expectStatus('/v2/admin/me', { origin: viewerA.origin, cookie: viewerA.cookie }, 403, 'tenant_owner_platform_access_not_denied')
    const controlPlane = await signup('platform-control', credentials(suffix, 'Platform control'))
    await client.query(
      `INSERT INTO v2_platform_operators (id, user_id, role_key, status, mfa_required, created_by)
       VALUES ($1, $2, 'PLATFORM_OWNER', 'ACTIVE', false, $2), ($3, $4, 'PLATFORM_SUPPORT', 'ACTIVE', false, $2)`,
      [`pop_remote_owner_${suffix}`, first.userId, `pop_remote_support_${suffix}`, second.userId],
    )
    platformOperatorFixtureIds.push(`pop_remote_owner_${suffix}`, `pop_remote_support_${suffix}`)
    const platformOwner = await login(first, publicPagesHost)
    const platformSupport = await login(second, publicPagesHost)
    const adminMe = await expectStatus('/v2/admin/me', { origin: platformOwner.origin, cookie: platformOwner.cookie }, 200, 'platform_owner_me_failed')
    assert(adminMe.body?.operator?.role === 'PLATFORM_OWNER', 'platform_owner_projection_invalid')
    const supportOverview = await expectStatus('/v2/admin/overview', { origin: platformSupport.origin, cookie: platformSupport.cookie }, 200, 'platform_support_overview_failed')
    assert(Number.isInteger(supportOverview.body?.activeWorkspaces), 'platform_overview_projection_invalid')
    await expectStatus('/v2/admin/audit', { origin: platformSupport.origin, cookie: platformSupport.cookie }, 403, 'platform_support_audit_not_denied')
    const adminDirectory = await expectStatus('/v2/admin/workspaces', { origin: platformOwner.origin, cookie: platformOwner.cookie }, 200, 'platform_workspace_directory_failed')
    assert(Array.isArray(adminDirectory.body?.workspaces) && adminDirectory.body.workspaces.some((item) => item.id === controlPlane.organizationId), 'platform_workspace_directory_projection_invalid')
    await expectStatus(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}`, { origin: platformOwner.origin, cookie: platformOwner.cookie }, 200, 'platform_workspace_detail_failed')
    const platformMutation = (path, method, body, key) => expectStatus(path, {
      method, origin: platformOwner.origin, cookie: platformOwner.cookie, csrf: platformOwner.csrf, idempotencyKey: key,
      body: { ...body, confirmation: 'CONFIRM_PLATFORM_ACTION' },
    }, 200, `platform_${key}_failed`)
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/suspend`, 'POST', { reason: 'Isolated staging suspension fixture.' }, `platform-suspend-${suffix}`)
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/reactivate`, 'POST', { reason: 'Isolated staging reactivation fixture.' }, `platform-reactivate-${suffix}`)
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/entitlements`, 'PATCH', { capability: 'workspace.access', enabled: true, expiresAt: null, reason: 'Isolated staging entitlement fixture.' }, `platform-entitlement-${suffix}`)
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/plan`, 'PATCH', { planId: 'managed_beta', endsAt: null, reason: 'Isolated staging plan fixture.' }, `platform-plan-${suffix}`)
    const platformLimit = await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/limits`, 'PATCH', { key: 'members', value: 25, reason: 'Isolated staging usage-limit fixture.' }, `platform-limit-${suffix}`)
    assert(platformLimit.body?.key === 'members' && platformLimit.body?.value === 25, 'platform_limit_projection_invalid')
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/export`, 'POST', { reason: 'Isolated staging export review fixture.' }, `platform-export-${suffix}`)
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/erasure-review`, 'POST', { reason: 'Isolated staging erasure review fixture.' }, `platform-erasure-${suffix}`)
    const hostnameRefresh = await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/hostname-refresh`, 'POST', { reason: 'Isolated staging hostname refresh fixture.' }, `platform-hostname-${suffix}`)
    assert(hostnameRefresh.body?.status === 'NOT_CONFIGURED', 'platform_hostname_refresh_not_honest')
    const revoke = await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/revoke-sessions`, 'POST', { reason: 'Isolated staging session revocation fixture.' }, `platform-revoke-${suffix}`)
    assert(Number.isInteger(revoke.body?.revokedSessions), 'platform_session_revoke_projection_invalid')
    const operatorRole = await platformMutation(`/v2/admin/operators/${encodeURIComponent(`pop_remote_support_${suffix}`)}/role`, 'PATCH', { role: 'PLATFORM_SECURITY_AUDITOR', reason: 'Isolated staging operator role rotation fixture.' }, `platform-operator-role-${suffix}`)
    assert(operatorRole.body?.role === 'PLATFORM_SECURITY_AUDITOR', 'platform_operator_role_projection_invalid')
    await platformMutation(`/v2/admin/operators/${encodeURIComponent(`pop_remote_support_${suffix}`)}/status`, 'PATCH', { status: 'DISABLED', reason: 'Isolated staging operator disable fixture.' }, `platform-operator-disable-${suffix}`)
    // Disabling an operator revokes their active sessions. The next request may
    // therefore be rejected during authentication (401) rather than later in
    // platform authorization (403); either response is a server-enforced deny.
    const disabledOperator = await request('/v2/admin/me', { origin: platformSupport.origin, cookie: platformSupport.cookie })
    assert(
      (disabledOperator.status === 401 && disabledOperator.body?.error?.code === 'SESSION_EXPIRED')
        || (disabledOperator.status === 403 && disabledOperator.body?.error?.code === 'TENANT_ACCESS_DENIED'),
      'disabled_platform_operator_not_denied',
    )
    const platformAudit = await expectStatus('/v2/admin/audit', { origin: platformOwner.origin, cookie: platformOwner.cookie }, 200, 'platform_audit_failed')
    assert(Array.isArray(platformAudit.body?.events) && platformAudit.body.events.some((event) => event.action === 'platform.workspace.suspended'), 'platform_audit_projection_invalid')

    console.log(JSON.stringify({
      remoteStaging: 'PASS', apiWorker: 'PASS', hyperdrive: 'PASS', rlsStaging: 'PASS',
      tenantIsolationStaging: 'PASS', roleE2eStaging: 'PASS', platformAdminStaging: 'PASS', roles: roleResults,
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
