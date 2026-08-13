import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import pg from 'pg'

const { Client } = pg

const approvalToken = 'RUN_V2_PRODUCTION_CANDIDATE_ACCEPTANCE'
const candidateApiHostname = 'api-next.labofscents.org'
const candidateAdminHostname = 'admin-next.labofscents.org'
const candidateWorkspaceBaseDomain = 'next.labofscents.org'
const candidateProfile = 'production-candidate'
const generatedFixtureMode = 'GENERATED_ISOLATED'
const roles = [
  'Owner', 'Admin', 'Lab Manager', 'Perfumer', 'R&D Scientist', 'Lab Technician',
  'Procurement', 'Sensory Panelist', 'Brand', 'Supplier', 'Finance', 'Viewer',
]
const materialViewRoles = new Set(['Owner', 'Admin', 'Lab Manager', 'Perfumer', 'R&D Scientist', 'Lab Technician', 'Procurement', 'Viewer'])
const inventoryViewRoles = new Set(['Owner', 'Admin', 'Lab Manager', 'Lab Technician', 'Viewer'])

export function candidateAcceptanceConfig(environment = process.env, { requireDatabase = true } = {}) {
  const approval = required(environment, 'V2_PRODUCTION_CANDIDATE_ACCEPTANCE_APPROVED')
  if (approval !== approvalToken) blocked('EXPLICIT_APPROVAL_REQUIRED')
  const profile = required(environment, 'V2_PRODUCTION_CANDIDATE_PROFILE')
  if (profile !== candidateProfile) blocked('CANDIDATE_PROFILE_INVALID')

  const databaseUrl = requireDatabase ? required(environment, 'PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL') : undefined
  const database = databaseUrl ? parsePostgresUrl(databaseUrl) : undefined
  const api = exactHttpsOrigin(required(environment, 'V2_PRODUCTION_CANDIDATE_API_ORIGIN'), 'V2_PRODUCTION_CANDIDATE_API_ORIGIN', candidateApiHostname)
  const workspaceBaseDomain = required(environment, 'V2_PRODUCTION_CANDIDATE_WORKSPACE_BASE_DOMAIN')
  if (workspaceBaseDomain !== candidateWorkspaceBaseDomain) blocked('WORKSPACE_BASE_DOMAIN_INVALID')
  const tenant = candidateTenantOrigin(required(environment, 'V2_PRODUCTION_CANDIDATE_TENANT_URL'), workspaceBaseDomain)
  const expectedSha = required(environment, 'V2_PRODUCTION_CANDIDATE_EXPECTED_SHA').toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) blocked('EXPECTED_SHA_INVALID')
  const fixtureMode = required(environment, 'V2_PRODUCTION_CANDIDATE_FIXTURE_MODE')
  if (fixtureMode !== generatedFixtureMode) blocked('GENERATED_FIXTURE_MODE_REQUIRED')

  return { databaseUrl, database, profile, api, tenant, workspaceBaseDomain, expectedSha, fixtureMode }
}

export function candidateBrowserConfig(environment = process.env) {
  return candidateAcceptanceConfig(environment, { requireDatabase: false })
}

export async function verifyProductionCandidateAcceptance(environment = process.env) {
  const config = candidateAcceptanceConfig(environment)
  await verifyCandidateHealth(config)
  await verifyCandidateTenantSurface(config)

  const client = new Client({ connectionString: config.databaseUrl })
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
      await client.query('INSERT INTO v2_organizations (id, slug, name, status) VALUES ($1, $2, $3, $4)', [probeId, `probe-${suffix}`, 'Candidate runtime role rollback probe', 'ACTIVE'])
      phase = 'VERIFY_CONTEXT'
      const context = await client.query("SELECT current_user = 'hyperdrive_user' AS runtime_role, current_setting('app.organization_id', true) = $1 AS tenant_context", [probeId])
      assert(context.rows[0]?.runtime_role === true && context.rows[0]?.tenant_context === true, 'runtime_role_write_probe_context_invalid')
      await client.query('ROLLBACK')
      console.log(JSON.stringify({ candidateRuntimeRoleWriteProbe: 'PASS' }))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (phase === 'SET_ROLE' && postgresFailureCategory(error) === 'RLS_OR_PERMISSION') {
        console.log(JSON.stringify({ candidateRuntimeRoleWriteProbe: 'NOT_APPLICABLE', reason: 'CANDIDATE_DATABASE_SESSION_CANNOT_ASSUME_RUNTIME_ROLE' }))
        return
      }
      console.log(JSON.stringify({ candidateRuntimeRoleWriteProbe: 'FAIL', phase, category: postgresFailureCategory(error) }))
      fail('runtime_role_write_probe_failed')
    }
  }

  async function verifyUser(userId) {
    await client.query('UPDATE v2_users SET verified_at = now() WHERE id = $1', [userId])
  }

  async function signup(label, input) {
    const result = await expectStatus(config, '/v2/platform/auth/signup', {
      method: 'POST', origin: config.tenant.origin,
      body: {
        organizationName: `Candidate acceptance ${label} ${suffix}`,
        workspaceSlug: `candidate-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
        ...input,
      },
    }, 200, 'signup_failed')
    const organizationId = result.body?.membership?.organizationId
    if (typeof organizationId === 'string') fixtureOrganizationIds.push(organizationId)
    const hostname = result.body?.hostname?.hostname
    assert(
      typeof result.body?.user?.id === 'string'
        && typeof organizationId === 'string'
        && typeof hostname === 'string'
        && isCandidateWorkspaceHostname(hostname, config.workspaceBaseDomain),
      'signup_projection_invalid',
    )
    await verifyUser(result.body.user.id)
    return { ...input, userId: result.body.user.id, organizationId, hostname }
  }

  async function login(identity, hostname) {
    const origin = `https://${hostname}`
    const result = await expectStatus(config, '/v2/platform/auth/login', {
      method: 'POST', origin, body: { email: identity.email, password: identity.password },
    }, 200, 'login_failed')
    assert(result.cookie.includes('oo_v2_session='), 'session_cookie_missing')
    assert(typeof result.body?.csrfToken === 'string' && result.body.csrfToken.length >= 16, 'csrf_missing')
    return { origin, cookie: result.cookie, csrf: result.body.csrfToken, membership: result.body.membership }
  }

  async function cleanup() {
    if (!fixtureOrganizationIds.length && !platformOperatorFixtureIds.length) return
    try {
      await client.query('BEGIN')
      for (const organizationId of fixtureOrganizationIds) {
        // Archive instead of delete so immutable audit evidence remains intact.
        await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId])
        await client.query("UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'CANDIDATE_ACCEPTANCE_FIXTURE_ARCHIVED') WHERE organization_id = $1", [organizationId])
        await client.query("UPDATE v2_workspace_hostnames SET status = 'ARCHIVED', updated_at = now() WHERE organization_id = $1", [organizationId])
        await client.query("UPDATE v2_organizations SET status = 'ARCHIVED', updated_at = now() WHERE id = $1", [organizationId])
      }
      if (platformOperatorFixtureIds.length) {
        await client.query("UPDATE v2_platform_operators SET status = 'DISABLED', updated_at = now() WHERE id = ANY($1::text[])", [platformOperatorFixtureIds])
        await client.query(
          `INSERT INTO v2_platform_audit_events (id, actor_role, action, outcome, subject_type, subject_id, reason, correlation_id)
           SELECT 'pae_candidate_cleanup_' || substr(md5(operator_id || clock_timestamp()::text), 1, 16), 'PLATFORM_OWNER', 'platform.fixture.cleanup', 'ALLOWED', 'platform_operator', operator_id, 'candidate acceptance fixture cleanup', $2
           FROM unnest($1::text[]) AS entries(operator_id)`,
          [platformOperatorFixtureIds, `candidate-cleanup-${suffix}`],
        )
      }
      await client.query('COMMIT')
      console.log(JSON.stringify({ candidateFixtureCleanup: 'ARCHIVED', organizations: fixtureOrganizationIds.length, operators: platformOperatorFixtureIds.length }))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      console.log(JSON.stringify({ candidateCleanupFailure: { category: postgresFailureCategory(error) } }))
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

    const materialA = await expectStatus(config, '/v2/lab/materials', {
      method: 'POST', origin: sessionA.origin, cookie: sessionA.cookie, csrf: sessionA.csrf,
      idempotencyKey: `candidate-material-a-${suffix}`,
      body: { name: `Candidate tenant A material ${suffix}`, internalCode: `CANDIDATE-A-${suffix}` },
    }, 200, 'tenant_a_material_create_failed')
    const materialB = await expectStatus(config, '/v2/lab/materials', {
      method: 'POST', origin: sessionB.origin, cookie: sessionB.cookie, csrf: sessionB.csrf,
      idempotencyKey: `candidate-material-b-${suffix}`,
      body: { name: `Candidate tenant B material ${suffix}`, internalCode: `CANDIDATE-B-${suffix}` },
    }, 200, 'tenant_b_material_create_failed')
    assert(typeof materialA.body?.material?.id === 'string' && typeof materialB.body?.material?.id === 'string', 'material_projection_invalid')

    const listA = await expectStatus(config, '/v2/lab/materials', { origin: sessionA.origin, cookie: sessionA.cookie }, 200, 'tenant_a_material_list_failed')
    const listB = await expectStatus(config, '/v2/lab/materials', { origin: sessionB.origin, cookie: sessionB.cookie }, 200, 'tenant_b_material_list_failed')
    assert(Array.isArray(listA.body?.materials) && listA.body.materials.some((item) => item.id === materialA.body.material.id) && !listA.body.materials.some((item) => item.id === materialB.body.material.id), 'tenant_a_list_leaked')
    assert(Array.isArray(listB.body?.materials) && listB.body.materials.some((item) => item.id === materialB.body.material.id) && !listB.body.materials.some((item) => item.id === materialA.body.material.id), 'tenant_b_list_leaked')

    await expectStatus(config, `/v2/lab/materials/${encodeURIComponent(materialB.body.material.id)}`, {
      method: 'PATCH', origin: sessionA.origin, cookie: sessionA.cookie, csrf: sessionA.csrf,
      idempotencyKey: `candidate-cross-write-a-${suffix}`, body: { description: 'candidate cross-tenant write control' },
    }, 404, 'tenant_a_cross_write_not_denied')
    await expectStatus(config, `/v2/lab/materials/${encodeURIComponent(materialA.body.material.id)}`, {
      method: 'PATCH', origin: sessionB.origin, cookie: sessionB.cookie, csrf: sessionB.csrf,
      idempotencyKey: `candidate-cross-write-b-${suffix}`, body: { description: 'candidate cross-tenant write control' },
    }, 404, 'tenant_b_cross_write_not_denied')
    await expectStatus(config, '/v2/platform/me', { origin: sessionB.origin, cookie: sessionA.cookie }, 403, 'session_host_mismatch_not_denied')

    const identities = new Map([['Owner', first]])
    for (const role of roles.filter((role) => role !== 'Owner')) {
      const identity = await signup(`role-${role}`, credentials(suffix, role))
      await client.query('INSERT INTO v2_memberships (id, organization_id, user_id, role_key, status) VALUES ($1, $2, $3, $4, $5)', [
        `mem_candidate_${suffix}_${role.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, first.organizationId, identity.userId, role, 'ACTIVE',
      ])
      identities.set(role, identity)
    }

    for (const role of roles) {
      const identity = identities.get(role)
      assert(identity, 'role_identity_missing')
      const session = role === 'Owner' ? sessionA : await login(identity, first.hostname)
      const me = await expectStatus(config, '/v2/platform/me', { origin: session.origin, cookie: session.cookie }, 200, 'role_session_failed')
      assert(me.body?.membership?.organizationId === first.organizationId && me.body?.membership?.role === role, 'role_membership_projection_invalid')
      await expectStatus(config, '/v2/lab/materials', { origin: session.origin, cookie: session.cookie }, materialViewRoles.has(role) ? 200 : 403, 'role_material_projection_invalid')
      await expectStatus(config, '/v2/lab/inventory/summary', { origin: session.origin, cookie: session.cookie }, inventoryViewRoles.has(role) ? 200 : 403, 'role_inventory_projection_invalid')
      await expectStatus(config, '/v2/platform/workspace/observability', { origin: session.origin, cookie: session.cookie }, role === 'Owner' ? 200 : 403, 'role_owner_surface_invalid')
      roleResults.push({ role, status: 'PASS' })
    }

    const viewer = identities.get('Viewer')
    assert(viewer, 'viewer_identity_missing')
    await client.query('INSERT INTO v2_memberships (id, organization_id, user_id, role_key, status) VALUES ($1, $2, $3, $4, $5)', [
      `mem_candidate_${suffix}_viewer_b`, second.organizationId, viewer.userId, 'Viewer', 'ACTIVE',
    ])
    await expectStatus(config, '/v2/platform/workspace/roles/Viewer/permissions', {
      method: 'PATCH', origin: sessionA.origin, cookie: sessionA.cookie, csrf: sessionA.csrf,
      body: { permissions: ['tenant.view'] },
    }, 200, 'tenant_a_policy_update_failed')
    const viewerA = await login(viewer, first.hostname)
    const viewerB = await login(viewer, second.hostname)
    await expectStatus(config, '/v2/lab/materials', { origin: viewerA.origin, cookie: viewerA.cookie }, 403, 'tenant_a_role_policy_not_scoped')
    await expectStatus(config, '/v2/lab/materials', { origin: viewerB.origin, cookie: viewerB.cookie }, 200, 'tenant_b_role_policy_leaked')

    await expectStatus(config, '/v2/admin/me', { origin: viewerA.origin, cookie: viewerA.cookie }, 403, 'tenant_owner_platform_access_not_denied')
    const controlPlane = await signup('platform-control', credentials(suffix, 'Platform control'))
    const activePlatformOwner = await client.query("SELECT 1 FROM v2_platform_operators WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE' LIMIT 1")
    assert(activePlatformOwner.rows.length === 0, 'platform_owner_fixture_not_isolated')
    await client.query(
      `INSERT INTO v2_platform_operators (id, user_id, role_key, status, mfa_required, created_by)
       VALUES ($1, $2, 'PLATFORM_OWNER', 'ACTIVE', false, $2), ($3, $4, 'PLATFORM_SUPPORT', 'ACTIVE', false, $2)`,
      [`pop_candidate_owner_${suffix}`, first.userId, `pop_candidate_support_${suffix}`, second.userId],
    )
    platformOperatorFixtureIds.push(`pop_candidate_owner_${suffix}`, `pop_candidate_support_${suffix}`)
    const platformOwner = await login(first, candidateAdminHostname)
    const platformSupport = await login(second, candidateAdminHostname)
    const adminMe = await expectStatus(config, '/v2/admin/me', { origin: platformOwner.origin, cookie: platformOwner.cookie }, 200, 'platform_owner_me_failed')
    assert(adminMe.body?.operator?.role === 'PLATFORM_OWNER', 'platform_owner_projection_invalid')
    const supportOverview = await expectStatus(config, '/v2/admin/overview', { origin: platformSupport.origin, cookie: platformSupport.cookie }, 200, 'platform_support_overview_failed')
    assert(Number.isInteger(supportOverview.body?.activeWorkspaces), 'platform_overview_projection_invalid')
    await expectStatus(config, '/v2/admin/audit', { origin: platformSupport.origin, cookie: platformSupport.cookie }, 403, 'platform_support_audit_not_denied')
    const adminDirectory = await expectStatus(config, '/v2/admin/workspaces', { origin: platformOwner.origin, cookie: platformOwner.cookie }, 200, 'platform_workspace_directory_failed')
    assert(Array.isArray(adminDirectory.body?.workspaces) && adminDirectory.body.workspaces.some((item) => item.id === controlPlane.organizationId), 'platform_workspace_directory_projection_invalid')
    await expectStatus(config, `/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}`, { origin: platformOwner.origin, cookie: platformOwner.cookie }, 200, 'platform_workspace_detail_failed')
    const platformMutation = (path, method, body, key) => expectStatus(config, path, {
      method, origin: platformOwner.origin, cookie: platformOwner.cookie, csrf: platformOwner.csrf, idempotencyKey: key,
      body: { ...body, confirmation: 'CONFIRM_PLATFORM_ACTION' },
    }, 200, `platform_${key}_failed`)
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/suspend`, 'POST', { reason: 'Isolated candidate suspension fixture.' }, `candidate-suspend-${suffix}`)
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/reactivate`, 'POST', { reason: 'Isolated candidate reactivation fixture.' }, `candidate-reactivate-${suffix}`)
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/entitlements`, 'PATCH', { capability: 'workspace.access', enabled: true, expiresAt: null, reason: 'Isolated candidate entitlement fixture.' }, `candidate-entitlement-${suffix}`)
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/plan`, 'PATCH', { planId: 'managed_beta', endsAt: null, reason: 'Isolated candidate plan fixture.' }, `candidate-plan-${suffix}`)
    const platformLimit = await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/limits`, 'PATCH', { key: 'members', value: 25, reason: 'Isolated candidate usage-limit fixture.' }, `candidate-limit-${suffix}`)
    assert(platformLimit.body?.key === 'members' && platformLimit.body?.value === 25, 'platform_limit_projection_invalid')
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/export`, 'POST', { reason: 'Isolated candidate export review fixture.' }, `candidate-export-${suffix}`)
    await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/erasure-review`, 'POST', { reason: 'Isolated candidate erasure review fixture.' }, `candidate-erasure-${suffix}`)
    const hostnameRefresh = await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/hostname-refresh`, 'POST', { reason: 'Isolated candidate hostname refresh fixture.' }, `candidate-hostname-${suffix}`)
    assert(hostnameRefresh.body?.status === 'NOT_CONFIGURED', 'platform_hostname_refresh_not_honest')
    const revoke = await platformMutation(`/v2/admin/workspaces/${encodeURIComponent(controlPlane.organizationId)}/revoke-sessions`, 'POST', { reason: 'Isolated candidate session revocation fixture.' }, `candidate-revoke-${suffix}`)
    assert(Number.isInteger(revoke.body?.revokedSessions), 'platform_session_revoke_projection_invalid')
    const operatorRole = await platformMutation(`/v2/admin/operators/${encodeURIComponent(`pop_candidate_support_${suffix}`)}/role`, 'PATCH', { role: 'PLATFORM_SECURITY_AUDITOR', reason: 'Isolated candidate operator role rotation fixture.' }, `candidate-operator-role-${suffix}`)
    assert(operatorRole.body?.role === 'PLATFORM_SECURITY_AUDITOR', 'platform_operator_role_projection_invalid')
    await platformMutation(`/v2/admin/operators/${encodeURIComponent(`pop_candidate_support_${suffix}`)}/status`, 'PATCH', { status: 'DISABLED', reason: 'Isolated candidate operator disable fixture.' }, `candidate-operator-disable-${suffix}`)
    const disabledOperator = await request(config, '/v2/admin/me', { origin: platformSupport.origin, cookie: platformSupport.cookie })
    assert(
      (disabledOperator.status === 401 && disabledOperator.body?.error?.code === 'SESSION_EXPIRED')
        || (disabledOperator.status === 403 && disabledOperator.body?.error?.code === 'TENANT_ACCESS_DENIED'),
      'disabled_platform_operator_not_denied',
    )
    const platformAudit = await expectStatus(config, '/v2/admin/audit', { origin: platformOwner.origin, cookie: platformOwner.cookie }, 200, 'platform_audit_failed')
    assert(Array.isArray(platformAudit.body?.events) && platformAudit.body.events.some((event) => event.action === 'platform.workspace.suspended'), 'platform_audit_projection_invalid')

    console.log(JSON.stringify({
      productionCandidateAcceptance: 'PASS', apiWorker: 'PASS', hyperdrive: 'PASS', rlsCandidate: 'PASS',
      tenantIsolationCandidate: 'PASS', roleE2eCandidate: 'PASS', platformAdminCandidate: 'PASS', roles: roleResults,
    }))
  } catch (error) {
    executionError = safeExecutionFailure(error)
  }

  try {
    await cleanup()
  } catch {
    if (!executionError) executionError = new Error('PRODUCTION_CANDIDATE_ACCEPTANCE=FAIL fixture_cleanup_failed')
  }
  await client.end().catch(() => undefined)
  if (executionError) throw executionError
}

async function verifyCandidateHealth(config) {
  let response
  try {
    response = await fetch(new URL('/health', config.api), { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') fail('candidate_health_timeout')
    fail('candidate_health_transport_failure')
  }
  const body = await jsonBody(response, 'candidate_health_non_json')
  assert(response.status === 200, 'candidate_health_not_ok')
  assert(body?.status === 'ok' && body?.environment === 'production' && body?.database === 'hyperdrive', 'candidate_health_contract_invalid')
  assert(typeof body?.releaseGitSha === 'string' && body.releaseGitSha.toLowerCase() === config.expectedSha, 'candidate_release_sha_mismatch')
}

async function verifyCandidateTenantSurface(config) {
  let response
  try {
    response = await fetch(config.tenant, { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') fail('candidate_tenant_timeout')
    fail('candidate_tenant_transport_failure')
  }
  assert(response.status === 200, 'candidate_tenant_unreachable')
  assert(response.headers.get('content-type')?.toLowerCase().includes('text/html'), 'candidate_tenant_not_html')
  assert(response.headers.get('x-olfactoryops-workspace-router') === 'active', 'candidate_router_not_active')
  assert(response.headers.get('x-olfactoryops-release-environment') === 'production', 'candidate_router_environment_invalid')
  assert(response.headers.get('x-olfactoryops-release-sha')?.toLowerCase() === config.expectedSha, 'candidate_router_release_sha_mismatch')
  assert(response.headers.get('content-security-policy')?.includes(`https://${candidateApiHostname}`), 'candidate_pages_csp_blocks_api')
}

async function request(config, path, { method = 'GET', origin = config.tenant.origin, cookie, csrf, idempotencyKey, body } = {}) {
  const headers = new Headers({ Accept: 'application/json', Origin: origin })
  if (cookie) headers.set('Cookie', cookie)
  if (csrf) headers.set('X-CSRF-Token', csrf)
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  let response
  try {
    response = await fetch(new URL(`/api/v1${path}`, config.api), {
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
  return { status: response.status, body: await jsonBody(response, 'non_json_api_response'), cookie: setCookies(response) }
}

async function expectStatus(config, path, options, status, code) {
  const result = await request(config, path, options)
  if (result.status !== status) {
    const errorCode = typeof result.body?.error?.code === 'string' ? result.body.error.code : 'NO_STABLE_ERROR_CODE'
    console.log(JSON.stringify({ candidateAcceptanceFailure: { code, expectedStatus: status, actualStatus: result.status, errorCode } }))
  }
  assert(result.status === status, code)
  return result
}

async function jsonBody(response, failureCode) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    fail(failureCode)
  }
}

function setCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ?? '').split(/,(?=[^;,]+=)/)
  return values.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ')
}

function credentials(suffix, label) {
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return {
    email: `${safe}-${suffix}@candidate.invalid`,
    password: `Candidate-${suffix}-${safe}-Password!47`,
    displayName: `Candidate ${label}`,
  }
}

function isCandidateWorkspaceHostname(hostname, workspaceBaseDomain = candidateWorkspaceBaseDomain) {
  const normalized = hostname.toLowerCase()
  const suffix = `.${workspaceBaseDomain}`
  const slug = normalized.endsWith(suffix) ? normalized.slice(0, -suffix.length) : ''
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)
}

function parsePostgresUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    blocked('DATABASE_URL_INVALID')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || isLoopback(url.hostname) || !url.username || !url.pathname || url.pathname === '/') {
    blocked('DATABASE_URL_INVALID')
  }
  return url
}

function exactHttpsOrigin(value, name, expectedHostname) {
  let url
  try {
    url = new URL(value)
  } catch {
    blocked(`${name}_INVALID`)
  }
  if (url.protocol !== 'https:' || url.hostname !== expectedHostname || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !canonicalOrigin(value, url)) {
    blocked(`${name}_INVALID`)
  }
  return url
}

function candidateTenantOrigin(value, workspaceBaseDomain) {
  let url
  try {
    url = new URL(value)
  } catch {
    blocked('CANDIDATE_TENANT_URL_INVALID')
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !canonicalOrigin(value, url) || !isCandidateWorkspaceHostname(url.hostname, workspaceBaseDomain)) {
    blocked('CANDIDATE_TENANT_URL_INVALID')
  }
  return url
}

function canonicalOrigin(value, url) {
  return value === url.origin || value === `${url.origin}/`
}

function isLoopback(hostname) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname.toLowerCase())
}

function required(environment, name) {
  const value = environment[name]?.trim()
  if (!value) blocked(`${name}_REQUIRED`)
  return value
}

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

export function safeExecutionFailure(error) {
  const message = error instanceof Error ? error.message : ''
  if (/^PRODUCTION_CANDIDATE_ACCEPTANCE=FAIL [a-z0-9_]+$/.test(message)) return new Error(message)
  return new Error(`PRODUCTION_CANDIDATE_ACCEPTANCE=FAIL ${postgresFailureCategory(error)}`)
}

function assert(condition, code) {
  if (!condition) fail(code)
}

function fail(code) {
  throw new Error(`PRODUCTION_CANDIDATE_ACCEPTANCE=FAIL ${code}`)
}

function blocked(code) {
  throw new Error(`PRODUCTION_CANDIDATE_ACCEPTANCE=BLOCKED ${code}`)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--validate-only')) {
    const config = candidateAcceptanceConfig()
    console.log(JSON.stringify({ productionCandidateAcceptance: 'CONFIG_VALIDATED', api: candidateApiHostname, expectedSha: config.expectedSha }))
  } else {
    await verifyProductionCandidateAcceptance()
  }
}
