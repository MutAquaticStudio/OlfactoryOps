import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import pg from 'pg'

const { Client } = pg
const approval = process.env.V2_STAGING_SCIENTIFIC_CANARY_APPROVED
const databaseUrl = process.env.STAGING_DATABASE_URL
const expectedSha = process.env.V2_STAGING_EXPECTED_SHA
const apiOrigin = process.env.V2_STAGING_API_ORIGIN ?? 'https://api-beta.labofscents.org'
const publicPagesHost = process.env.V2_STAGING_PUBLIC_PAGES_HOST ?? 'beta.labofscents.org'
const workspaceBaseDomain = process.env.V2_STAGING_WORKSPACE_BASE_DOMAIN ?? 'api-beta.labofscents.org'
const resultReferencePath = process.env.V2_STAGING_SCIENTIFIC_RESULT_REF_PATH

function fail(code) { throw new Error(`STAGING_SCIENTIFIC_CANARY=FAIL ${code}`) }
function assert(value, code) { if (!value) fail(code) }
function safeDatabaseCode(error) {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : ''
  return /^[0-9A-Z]{5}$/.test(code) ? `PG_${code}` : 'DATABASE'
}

if (approval !== 'RUN_ONE_RC6_SCIENTIFIC_CANARY') throw new Error('STAGING_SCIENTIFIC_CANARY=BLOCKED explicit approval is required')
if (!databaseUrl) throw new Error('STAGING_SCIENTIFIC_CANARY=BLOCKED STAGING_DATABASE_URL is required')
if (!/^[0-9a-f]{40}$/i.test(expectedSha ?? '')) throw new Error('STAGING_SCIENTIFIC_CANARY=FAIL expected_release_sha_invalid')

const database = new URL(databaseUrl)
const api = new URL(apiOrigin)
if (!['postgresql:', 'postgres:'].includes(database.protocol) || ['localhost', '127.0.0.1', '::1'].includes(database.hostname)) fail('non_loopback_staging_postgres_required')
if (api.protocol !== 'https:' || api.hostname !== 'api-beta.labofscents.org' || publicPagesHost !== 'beta.labofscents.org' || workspaceBaseDomain !== 'api-beta.labofscents.org') fail('exact_staging_hosts_required')

function cookies(response) {
  const rows = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : (response.headers.get('set-cookie') ?? '').split(/,(?=[^;,]+=)/)
  return rows.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ')
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
  } catch {
    fail('api_transport_failure')
  }
  const text = await response.text()
  let parsed
  try { parsed = text ? JSON.parse(text) : undefined } catch { fail('api_non_json_response') }
  return { status: response.status, body: parsed, cookie: cookies(response) }
}

async function expect(path, options, status, code) {
  const result = await request(path, options)
  if (result.status !== status) {
    const errorCode = typeof result.body?.error?.code === 'string' ? result.body.error.code : 'NO_STABLE_ERROR_CODE'
    console.log(JSON.stringify({ stagingScientificCanaryFailure: { code, expectedStatus: status, actualStatus: result.status, errorCode } }))
  }
  assert(result.status === status, code)
  return result
}

async function sleep(ms) { await new Promise((resolve) => setTimeout(resolve, ms)) }

async function assertExactRelease() {
  let response
  try {
    response = await fetch(new URL('/health', api), { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
  } catch {
    fail('api_health_transport_failure')
  }
  const body = await response.json().catch(() => undefined)
  assert(response.ok && body?.environment === 'staging' && body?.database === 'hyperdrive' && body?.releaseGitSha === expectedSha, 'api_health_release_mismatch')
}

async function createFixture(client, suffix) {
  const email = `scientific-canary-${suffix}@staging.invalid`
  const password = `Scientific-canary-${suffix}-Password!47`
  const signup = await expect('/v2/platform/auth/signup', {
    method: 'POST',
    origin: `https://${publicPagesHost}`,
    body: { organizationName: `Scientific canary ${suffix}`, workspaceSlug: `scientific-canary-${suffix}`, email, password, displayName: 'Scientific canary owner' },
  }, 200, 'signup_failed')
  const organizationId = signup.body?.membership?.organizationId
  const userId = signup.body?.user?.id
  const hostname = signup.body?.hostname?.hostname
  assert(typeof organizationId === 'string' && typeof userId === 'string' && typeof hostname === 'string' && hostname.endsWith(`.${workspaceBaseDomain}`), 'signup_projection_invalid')
  await client.query('UPDATE v2_users SET verified_at = now() WHERE id = $1', [userId])
  const login = await expect('/v2/platform/auth/login', { method: 'POST', origin: `https://${hostname}`, body: { email, password } }, 200, 'login_failed')
  assert(login.cookie.includes('oo_v2_session=') && typeof login.body?.csrfToken === 'string', 'session_bootstrap_invalid')
  const session = { origin: `https://${hostname}`, cookie: login.cookie, csrf: login.body.csrfToken }
  const material = await expect('/v2/lab/materials', {
    method: 'POST',
    ...session,
    idempotencyKey: `scientific-canary-material-${suffix}`,
    body: { name: `Scientific canary material ${suffix}`, internalCode: `SCI-CANARY-${suffix}` },
  }, 200, 'material_create_failed')
  const materialId = material.body?.material?.id
  assert(typeof materialId === 'string', 'material_projection_invalid')

  const identityId = `scientific_canary_identity_${suffix}`
  const structureHash = 'a'.repeat(64)
  await client.query('BEGIN')
  try {
    await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId])
    await client.query(
      `INSERT INTO v2_molecular_identities
        (id, organization_id, resolution_status, canonical_smiles, inchikey, structure_hash, canonicalization_version, rdkit_version, created_by, inchi, input_hash, output_hash, standardization_version, molecular_graph, provenance)
       VALUES ($1,$2,'RESOLVED','CCO','LFQSCWFLJHTTHZ-UHFFFAOYSA-N',$3,'fixture/1','fixture-rdkit',$4,'InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3',$3,$3,'fixture/1','{"atoms":[],"bonds":[]}'::jsonb,'[]'::jsonb)`,
      [identityId, organizationId, structureHash, userId],
    )
    await client.query('UPDATE v2_materials SET molecular_identity_id = $1, status = $2, updated_at = now() WHERE id = $3 AND organization_id = $4', [identityId, 'ACTIVE', materialId, organizationId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    fail(`fixture_identity_${safeDatabaseCode(error)}`)
  }
  return { organizationId, materialId, session, suffix }
}

async function awaitCompletion(client, fixture) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const query = await client.query(
      `SELECT dispatch.status AS dispatch_status, dispatch.failure_code AS dispatch_failure_code, dispatch.result_artifact_ref,
        job.status AS scientific_status, job.failure_code AS scientific_failure_code,
        (SELECT count(*)::int FROM v2_scientific_artifacts artifact WHERE artifact.organization_id = job.organization_id AND artifact.job_id = job.id) AS artifact_count
       FROM v2_scientific_jobs job
       LEFT JOIN v2_cloud_job_dispatches dispatch ON dispatch.organization_id = job.organization_id AND dispatch.id = job.id
       WHERE job.organization_id = $1 AND job.id = $2`,
      [fixture.organizationId, fixture.jobId],
    )
    const row = query.rows[0]
    if (row?.dispatch_status === 'SUCCEEDED' && row?.scientific_status === 'SUCCEEDED' && Number(row?.artifact_count) >= 3 && typeof row?.result_artifact_ref === 'string') return row
    if (['FAILED', 'DLQ', 'CANCELLED'].includes(row?.dispatch_status) || ['FAILED', 'CANCELLED', 'BLOCKED'].includes(row?.scientific_status)) {
      const code = typeof row?.dispatch_failure_code === 'string' && /^[A-Z][A-Z0-9_]{2,119}$/.test(row.dispatch_failure_code)
        ? row.dispatch_failure_code
        : (typeof row?.scientific_failure_code === 'string' && /^[A-Z][A-Z0-9_]{2,119}$/.test(row.scientific_failure_code) ? row.scientific_failure_code : 'NO_STABLE_FAILURE_CODE')
      fail(`workflow_terminal_${code}`)
    }
    await sleep(3_000)
  }
  fail('workflow_timeout')
}

async function archiveFixture(client, organizationId) {
  await client.query('BEGIN')
  try {
    await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId])
    await client.query("UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'STAGING_SCIENTIFIC_CANARY_ARCHIVED') WHERE organization_id = $1", [organizationId])
    await client.query("UPDATE v2_workspace_hostnames SET status = 'ARCHIVED', updated_at = now() WHERE organization_id = $1", [organizationId])
    await client.query("UPDATE v2_organizations SET status = 'ARCHIVED', updated_at = now() WHERE id = $1", [organizationId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    fail(`fixture_archive_${safeDatabaseCode(error)}`)
  }
}

async function main() {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000, query_timeout: 30_000, statement_timeout: 30_000, lock_timeout: 10_000 })
  let organizationId
  let executionError
  try {
    await assertExactRelease()
    await client.connect()
    const suffix = randomUUID().replaceAll('-', '').slice(0, 18)
    const fixture = await createFixture(client, suffix)
    organizationId = fixture.organizationId
    const queued = await expect(`/v2/scientific/materials/${encodeURIComponent(fixture.materialId)}/features`, {
      method: 'POST',
      ...fixture.session,
      idempotencyKey: `scientific-canary-features-${suffix}`,
      body: { featureKinds: ['ECFP', 'BCFP', 'MOLFTP'] },
    }, 200, 'scientific_dispatch_failed')
    const jobId = queued.body?.job?.id
    assert(typeof jobId === 'string' && queued.body?.job?.status === 'QUEUED', 'scientific_queue_projection_invalid')
    const completed = await awaitCompletion(client, { ...fixture, jobId })
    const read = await expect(`/v2/scientific/jobs/${encodeURIComponent(jobId)}`, fixture.session, 200, 'scientific_job_read_failed')
    const artifacts = await expect(`/v2/scientific/materials/${encodeURIComponent(fixture.materialId)}/artifacts`, fixture.session, 200, 'scientific_artifact_read_failed')
    assert(read.body?.job?.status === 'SUCCEEDED' && Array.isArray(artifacts.body?.artifacts) && artifacts.body.artifacts.length >= 3, 'scientific_projection_not_completed')
    if (resultReferencePath) writeFileSync(resultReferencePath, `${completed.result_artifact_ref}\n`, { encoding: 'utf8', mode: 0o600 })
    console.log(JSON.stringify({ stagingScientificCanary: 'PASS', queue: 'PASS', workflow: 'PASS', cloudRuntime: 'PASS', featureContainer: 'PASS', modelContainer: 'NOT_REQUIRED', r2Result: 'PASS', jobs: 1 }))
  } catch (error) {
    executionError = error instanceof Error ? error : new Error('STAGING_SCIENTIFIC_CANARY=FAIL unexpected')
  }
  if (organizationId) {
    try {
      await archiveFixture(client, organizationId)
      console.log('STAGING_SCIENTIFIC_CANARY_FIXTURE_CLEANUP=ARCHIVED')
    } catch (error) {
      if (!executionError) executionError = error instanceof Error ? error : new Error('STAGING_SCIENTIFIC_CANARY=FAIL fixture_archive_unknown')
    }
  }
  await client.end().catch(() => undefined)
  if (executionError) throw executionError
}

await main()
