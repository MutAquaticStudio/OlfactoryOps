import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const QA_ROLE_FIXTURE_ROLES = Object.freeze([
  'Owner',
  'Admin',
  'Perfumer',
  'Lab Manager',
  'Brand',
  'Finance',
  'SENSORY_PANELIST',
  'Viewer',
])

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export function validateIsolatedFixtureConfig(input = process.env) {
  const environment = input.QA_ENVIRONMENT
  const enabled = input.QA_ISOLATED_FIXTURES
  const apiUrl = input.QA_FIXTURE_API_URL
  const persistPath = input.QA_FIXTURE_D1_PERSIST_PATH
  const appOrigin = input.QA_FIXTURE_APP_ORIGIN ?? 'http://127.0.0.1:5173'

  if (environment !== 'test' || enabled !== 'true') {
    throw new Error('Refusing fixture mutation. Set QA_ENVIRONMENT=test and QA_ISOLATED_FIXTURES=true.')
  }
  if (!apiUrl || !persistPath) {
    throw new Error('QA_FIXTURE_API_URL and QA_FIXTURE_D1_PERSIST_PATH are required for isolated fixtures.')
  }

  const parsedApi = new URL(apiUrl)
  const parsedApp = new URL(appOrigin)
  if (!LOOPBACK_HOSTS.has(parsedApi.hostname) || !LOOPBACK_HOSTS.has(parsedApp.hostname)) {
    throw new Error('Refusing fixture mutation outside a loopback API and app origin.')
  }
  if (!path.basename(path.resolve(persistPath)).startsWith('.qa-isolated-worker-')) {
    throw new Error('Refusing fixture mutation without a .qa-isolated-worker-* persistence directory.')
  }

  return {
    apiUrl: parsedApi.toString().replace(/\/$/, ''),
    appOrigin: parsedApp.origin,
    persistPath: path.resolve(persistPath),
    outputDir: path.resolve(input.QA_FIXTURE_OUTPUT_DIR ?? path.join(persistPath, 'role-fixtures')),
  }
}

export function legacyPasswordHash(email, password) {
  return `sha256:${createHash('sha256').update(`auth:v1:${email.trim().toLowerCase()}:${password}`).digest('hex')}`
}

export function storageStateForSession({ appOrigin, sessionCredential }) {
  const origin = new URL(appOrigin)
  return {
    cookies: [{
      name: 'oo_session',
      value: sessionCredential,
      domain: origin.hostname,
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: origin.protocol === 'https:',
      // Chromium rejects SameSite=None cookies served over a loopback HTTP test origin.
      sameSite: origin.protocol === 'https:' ? 'None' : 'Lax',
    }],
    origins: [{
      origin: origin.origin,
      localStorage: [{ name: 'olfactoryops.has_session.v1', value: '1' }],
    }],
  }
}

export class IsolatedApiClient {
  #apiUrl
  #credential
  #forwardedFor

  constructor({ apiUrl, credential, forwardedFor }) {
    this.#apiUrl = apiUrl
    this.#credential = credential
    this.#forwardedFor = forwardedFor
  }

  withCredential(credential) {
    return new IsolatedApiClient({ apiUrl: this.#apiUrl, credential, forwardedFor: this.#forwardedFor })
  }

  async request(pathname, options = {}) {
    const headers = new Headers(options.headers ?? {})
    headers.set('Accept', 'application/json')
    headers.set('X-Forwarded-For', this.#forwardedFor ?? '127.0.0.1')
    if (this.#credential) headers.set('Authorization', `Bearer ${this.#credential}`)
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
    if (options.body !== undefined) headers.set('Content-Type', 'application/json')
    const response = await fetch(`${this.#apiUrl}${pathname}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    const text = await response.text()
    let json
    try {
      json = text ? JSON.parse(text) : undefined
    } catch {
      json = undefined
    }
    return { status: response.status, json, headers: response.headers }
  }
}

export function sessionCredentialFromResponse(response) {
  const setCookie = response.headers.get('set-cookie') ?? ''
  const matched = /(?:^|,|;)\s*oo_session=([^;]+)/u.exec(setCookie)
  if (!matched?.[1]) throw new Error('Fixture login did not issue an opaque session cookie.')
  return decodeURIComponent(matched[1])
}

export async function assertIsolatedWorker(config) {
  const client = new IsolatedApiClient({ apiUrl: config.apiUrl, forwardedFor: '198.18.0.1' })
  const health = await client.request('/health')
  if (health.status !== 200 || health.json?.release?.environment !== 'test') {
    throw new Error('Refusing fixture mutation because the target is not the local test Worker.')
  }
  return health.json
}

export async function createTestTenant(config, suffix, forwardedFor) {
  const runId = suffix.toLowerCase().replace(/[^a-z0-9-]/g, '')
  const slug = `qa-${runId}`.slice(0, 48)
  const email = `owner+${slug}@qa.invalid`
  const password = `Qa-${randomBytes(18).toString('base64url')}-7`
  const client = new IsolatedApiClient({ apiUrl: config.apiUrl, forwardedFor })
  const signup = await client.request('/auth/signup', {
    method: 'POST',
    body: {
      organizationName: `QA ${suffix}`,
      workspaceSlug: slug,
      email,
      name: 'QA Owner',
      password,
    },
  })
  if (signup.status !== 200 || !signup.json?.data?.organization?.id) {
    throw new Error(`Isolated signup failed with ${signup.status}: ${String(signup.json?.message ?? 'unknown error')}`)
  }
  return {
    id: signup.json.data.organization.id,
    brandId: signup.json.data.brand.id,
    slug,
    email,
    password,
    ownerUserId: signup.json.data.membership.userId,
    client: client.withCredential(sessionCredentialFromResponse(signup)),
  }
}

export async function loginFixtureUser(config, { email, password, forwardedFor = '198.18.0.9' }) {
  const anonymous = new IsolatedApiClient({ apiUrl: config.apiUrl, forwardedFor })
  const response = await anonymous.request('/auth/login', { method: 'POST', body: { email, password } })
  if (response.status !== 200) {
    throw new Error(`Fixture role login failed with ${response.status}.`)
  }
  return anonymous.withCredential(sessionCredentialFromResponse(response))
}

export async function executeD1Sql(config, sql, label = 'fixture') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'olfactoryops-qa-'))
  const file = path.join(directory, `${label}.sql`)
  try {
    await writeFile(file, sql, 'utf8')
    const result = spawnSync(
      process.execPath,
      [path.join(repositoryRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'execute', 'olfactoryops-test', '--local', '--config', 'wrangler.test.toml', '--persist-to', config.persistPath, '--file', file, '--json'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    if (result.status !== 0) {
      const detail = [result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n').trim()
      throw new Error(`D1 ${label} failed: ${detail || `exit ${result.status ?? 'unknown'}`}`)
    }
    return JSON.parse(result.stdout || '[]')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function provisionRoleFixtures(config, { runId = randomUUID(), cleanup = false } = {}) {
  await assertIsolatedWorker(config)
  // Use a run-scoped loopback test address so repeated local fixture runs do
  // not collide with the Worker signup rate limiter. This value is never used
  // outside the disposable QA Worker and is not a production bypass.
  const octet = Number.parseInt(runId.replaceAll('-', '').slice(0, 6), 16)
  const forwardedFor = `198.18.${(octet % 200) + 20}.${(Math.floor(octet / 200) % 200) + 20}`
  const tenant = await createTestTenant(config, `roles-${runId.slice(0, 8)}`, forwardedFor)
  const now = new Date().toISOString()
  const credentials = []
  const members = []
  for (const role of QA_ROLE_FIXTURE_ROLES.filter((role) => role !== 'Owner')) {
    const safeRole = role.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const email = `${safeRole}+${tenant.slug}@qa.invalid`
    const password = `Qa-${randomBytes(18).toString('base64url')}-7`
    const userId = `usr-qa-${runId.slice(0, 8)}-${safeRole}`
    const membershipId = `mem-qa-${runId.slice(0, 8)}-${safeRole}`
    credentials.push({ email, password })
    members.push({ role, email, userId, membershipId, passwordHash: legacyPasswordHash(email, password) })
  }
  const values = members.map((member) => `(${sqlString(member.membershipId)}, ${sqlString(member.userId)}, ${sqlString(member.email)}, ${sqlString(`QA ${member.role}`)}, ${sqlString(tenant.id)}, ${sqlString(JSON.stringify([tenant.brandId]))}, ${sqlString(member.role)}, 'ACTIVE', 0, ${sqlString(now)}, NULL, ${sqlString(now)})`).join(',\n')
  const credentialValues = members.map((member) => `(${sqlString(member.email)}, ${sqlString(member.passwordHash)}, ${sqlString(now)}, ${sqlString(now)})`).join(',\n')
  await executeD1Sql(config, `
    INSERT INTO tenant_memberships (id, user_id, email, name, organization_id, brand_ids_json, role, status, mfa_enabled, last_active_at, invited_at, updated_at)
    VALUES ${values};
    INSERT INTO auth_credentials (email, password_hash, password_set_at, updated_at)
    VALUES ${credentialValues};
  `, 'role-fixtures')

  const states = {}
  const reportRoles = []
  // Signup credentials are intentionally not retained in reports. Re-login to obtain every state uniformly.
  const ownerClient = await loginFixtureUser(config, { email: tenant.email, password: tenant.password, forwardedFor: '198.18.1.11' })
  const ownerLogin = await new IsolatedApiClient({ apiUrl: config.apiUrl, forwardedFor: '198.18.1.12' }).request('/auth/login', { method: 'POST', body: { email: tenant.email, password: tenant.password } })
  states.Owner = storageStateForSession({ appOrigin: config.appOrigin, sessionCredential: sessionCredentialFromResponse(ownerLogin) })
  reportRoles.push('Owner')
  for (const member of members) {
    const credential = credentials.find((entry) => entry.email === member.email)
    const login = await new IsolatedApiClient({ apiUrl: config.apiUrl, forwardedFor: `198.18.2.${reportRoles.length + 10}` }).request('/auth/login', { method: 'POST', body: { email: member.email, password: credential.password } })
    if (login.status !== 200) throw new Error(`Fixture login for ${member.role} failed.`)
    states[member.role] = storageStateForSession({ appOrigin: config.appOrigin, sessionCredential: sessionCredentialFromResponse(login) })
    reportRoles.push(member.role)
  }
  await mkdir(config.outputDir, { recursive: true })
  const statePaths = {}
  for (const role of reportRoles) {
    const filename = `${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.storage-state.json`
    const target = path.join(config.outputDir, filename)
    await writeFile(target, JSON.stringify(states[role]), 'utf8')
    statePaths[role] = target
  }
  const manifestPath = path.join(config.outputDir, 'role-storage-states.json')
  await writeFile(manifestPath, JSON.stringify(statePaths, null, 2), 'utf8')
  const reportPath = path.join(config.outputDir, `role-fixtures-${runId}.md`)
  await writeFile(reportPath, [
    '# Isolated QA role fixtures',
    '',
    `- Run: ${runId}`,
    '- Environment: local Worker/D1 test only',
    `- Roles: ${reportRoles.join(', ')}`,
    '- Session credentials and passwords are runtime-only and intentionally omitted.',
    '- Cleanup: disabled by default so a local Playwright run can consume the states.',
  ].join('\n'), 'utf8')
  if (cleanup) await cleanupTenantFixtures(config, tenant.id, [...members.map((member) => member.email), tenant.email])
  return { runId, tenantId: tenant.id, statePaths, manifestPath, reportPath, ownerClient }
}

export async function cleanupTenantFixtures(config, organizationId, emails = []) {
  const organization = sqlString(organizationId)
  // The list is deliberately explicit so fixture cleanup remains one D1 call.
  // Running a schema probe per table made the QA runner slower than the suite
  // itself. Foreign keys are disabled only for this disposable local database;
  // production fixture mutation is refused by validateIsolatedFixtureConfig.
  const tenantScopedTables = [
    'api_keys', 'approved_material_substitutions', 'audit_chain_events', 'audit_export_jobs', 'auth_sessions', 'billing_subscriptions', 'commercial_skus', 'customers', 'document_records', 'email_verification_records',
    'finished_good_lots', 'finished_good_movements', 'formula_records', 'formula_version_records', 'fragrance_sensory_memory', 'fragrance_sensory_observations', 'fragrance_sensory_sessions', 'fragrance_trial_decisions', 'fragrance_trial_public_links', 'fragrance_trial_usage_links', 'fragrance_trials',
    'inventory_approval_requests', 'inventory_lots', 'landed_cost_allocations', 'legal_acceptance_records', 'material_compliance_profiles', 'material_evidence_chunks', 'material_evidence_documents', 'material_evidence_jobs', 'material_records', 'mfa_enrollments', 'notification_outbox', 'operation_approval_requests', 'operation_idempotency_records',
    'order_documents', 'order_shipments', 'price_history', 'price_lists', 'privacy_requests', 'procurement_receipts', 'production_qc_results', 'production_qc_templates', 'production_yield_records', 'purchase_orders', 'quotes', 'saas_custom_domains', 'sales_orders', 'sample_requests', 'scheduled_reports', 'sso_configs',
    'suppliers', 'tenant_audit_chain_events', 'tenant_audit_chain_heads', 'tenant_audit_events', 'tenant_branding', 'tenant_brands', 'tenant_custom_fields', 'tenant_feature_flags', 'tenant_isolation_legacy_audit_chains', 'tenant_memberships', 'tenant_numbering_sequences', 'tenant_role_policies', 'tenant_settings', 'user_settings', 'webhooks', 'workspace_hostnames', 'workspace_preference_profiles',
  ]
  const cleanupStatements = [
    'PRAGMA foreign_keys = OFF;',
    `DELETE FROM inventory_movements WHERE lot_id IN (SELECT id FROM inventory_lots WHERE organization_id = ${organization});`,
    `DELETE FROM stock_take_records WHERE lot_id IN (SELECT id FROM inventory_lots WHERE organization_id = ${organization});`,
    ...tenantScopedTables.map((tableName) => `DELETE FROM ${tableName} WHERE organization_id = ${organization};`),
    `DELETE FROM tenant_organizations WHERE id = ${organization};`,
    'PRAGMA foreign_keys = ON;',
  ]
  if (emails.length) cleanupStatements.splice(-2, 0, `DELETE FROM auth_credentials WHERE email IN (${emails.map(sqlString).join(', ')});`)
  await executeD1Sql(config, cleanupStatements.join('\n'), 'fixture-cleanup')
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}
