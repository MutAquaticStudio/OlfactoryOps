import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import pg from 'pg'

const { Client } = pg
const approval = process.env.V2_STAGING_SCIENTIFIC_APPROVED
const databaseUrl = process.env.STAGING_DATABASE_URL
const apiOrigin = process.env.V2_STAGING_API_ORIGIN ?? 'https://api-beta.labofscents.org'
const publicBaseDomain = process.env.V2_STAGING_PUBLIC_BASE_DOMAIN ?? 'beta.labofscents.org'
const resultReferencePath = process.env.V2_STAGING_SCIENTIFIC_RESULT_REF_PATH

if (approval !== 'RUN_REMOTE_SCIENTIFIC_E2E') throw new Error('REMOTE_SCIENTIFIC_E2E=BLOCKED explicit approval is required')
if (!databaseUrl) throw new Error('REMOTE_SCIENTIFIC_E2E=BLOCKED STAGING_DATABASE_URL is required')
const database = new URL(databaseUrl)
const api = new URL(apiOrigin)
if (!['postgresql:', 'postgres:'].includes(database.protocol) || ['localhost', '127.0.0.1', '::1'].includes(database.hostname)) throw new Error('REMOTE_SCIENTIFIC_E2E=FAIL a non-loopback staging PostgreSQL origin is required')
if (api.protocol !== 'https:' || api.hostname !== 'api-beta.labofscents.org' || publicBaseDomain !== 'beta.labofscents.org') throw new Error('REMOTE_SCIENTIFIC_E2E=FAIL the exact staging public hosts are required')

function fail(code) { throw new Error(`REMOTE_SCIENTIFIC_E2E=FAIL ${code}`) }
function assert(value, code) { if (!value) fail(code) }
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
  const response = await fetch(new URL(`/api/v1${path}`, api), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' })
  const text = await response.text()
  let parsed
  try { parsed = text ? JSON.parse(text) : undefined } catch { fail('api_non_json_response') }
  return { status: response.status, body: parsed, cookie: cookies(response) }
}
async function expect(path, options, status, code) {
  const result = await request(path, options)
  if (result.status !== status) {
    console.log(JSON.stringify({ remoteScientificFailure: { code, expectedStatus: status, actualStatus: result.status, errorCode: result.body?.error?.code ?? 'NO_STABLE_ERROR_CODE' } }))
  }
  assert(result.status === status, code)
  return result
}
async function sleep(ms) { await new Promise((resolve) => setTimeout(resolve, ms)) }

async function main() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 18)
  const client = new Client({ connectionString: databaseUrl })
  let organizationId
  let executionError
  try {
    await client.connect()
    const email = `scientific-${suffix}@staging.invalid`
    const password = `Scientific-${suffix}-Password!47`
    const signup = await expect('/v2/platform/auth/signup', {
      method: 'POST', origin: `https://${publicBaseDomain}`,
      body: { organizationName: `Scientific staging ${suffix}`, workspaceSlug: `scientific-${suffix}`, email, password, displayName: 'Scientific staging owner' },
    }, 200, 'signup_failed')
    organizationId = signup.body?.membership?.organizationId
    const userId = signup.body?.user?.id
    const hostname = signup.body?.hostname?.hostname
    assert(typeof organizationId === 'string' && typeof userId === 'string' && typeof hostname === 'string', 'signup_projection_invalid')
    await client.query('UPDATE v2_users SET verified_at = now() WHERE id = $1', [userId])
    const login = await expect('/v2/platform/auth/login', { method: 'POST', origin: `https://${hostname}`, body: { email, password } }, 200, 'login_failed')
    assert(login.cookie.includes('oo_v2_session=') && typeof login.body?.csrfToken === 'string', 'session_bootstrap_invalid')
    const session = { origin: `https://${hostname}`, cookie: login.cookie, csrf: login.body.csrfToken }

    const material = await expect('/v2/lab/materials', {
      method: 'POST', ...session, idempotencyKey: `scientific-material-${suffix}`,
      body: { name: `Scientific staging material ${suffix}`, internalCode: `SCI-${suffix}` },
    }, 200, 'material_create_failed')
    const materialId = material.body?.material?.id
    assert(typeof materialId === 'string', 'material_projection_invalid')

    // The isolated fixture seeds only the already-resolved molecular identity
    // precondition. The API request below is the tested Cloud Runtime action.
    const identityId = `scientific_identity_${suffix}`
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
      throw error
    }

    const queued = await expect(`/v2/scientific/materials/${encodeURIComponent(materialId)}/features`, {
      method: 'POST', ...session, idempotencyKey: `scientific-features-${suffix}`,
      body: { featureKinds: ['ECFP', 'BCFP', 'MOLFTP'] },
    }, 200, 'scientific_dispatch_failed')
    const jobId = queued.body?.job?.id
    assert(typeof jobId === 'string' && queued.body?.job?.status === 'QUEUED', 'scientific_queue_projection_invalid')

    let completed
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const query = await client.query(
        `SELECT dispatch.status AS dispatch_status, dispatch.result_artifact_ref, job.status AS scientific_status,
          (SELECT count(*)::int FROM v2_scientific_artifacts artifact WHERE artifact.organization_id = job.organization_id AND artifact.job_id = job.id) AS artifact_count
         FROM v2_scientific_jobs job
         LEFT JOIN v2_cloud_job_dispatches dispatch ON dispatch.organization_id = job.organization_id AND dispatch.id = job.id
         WHERE job.organization_id = $1 AND job.id = $2`,
        [organizationId, jobId],
      )
      const row = query.rows[0]
      if (row?.dispatch_status === 'SUCCEEDED' && row?.scientific_status === 'SUCCEEDED' && Number(row?.artifact_count) >= 3 && typeof row?.result_artifact_ref === 'string') {
        completed = row
        break
      }
      if (['FAILED', 'DLQ', 'CANCELLED'].includes(row?.dispatch_status) || ['FAILED', 'CANCELLED', 'BLOCKED'].includes(row?.scientific_status)) {
        fail(`scientific_workflow_terminal_${row?.dispatch_status ?? row?.scientific_status}`)
      }
      await sleep(3_000)
    }
    assert(completed, 'scientific_workflow_timeout')
    const job = await expect(`/v2/scientific/jobs/${encodeURIComponent(jobId)}`, session, 200, 'scientific_job_read_failed')
    const artifacts = await expect(`/v2/scientific/materials/${encodeURIComponent(materialId)}/artifacts`, session, 200, 'scientific_artifact_read_failed')
    assert(job.body?.job?.status === 'SUCCEEDED' && Array.isArray(artifacts.body?.artifacts) && artifacts.body.artifacts.length >= 3, 'scientific_projection_not_completed')
    if (resultReferencePath) writeFileSync(resultReferencePath, `${completed.result_artifact_ref}\n`, { encoding: 'utf8', mode: 0o600 })
    console.log(JSON.stringify({
      stagingScientificE2e: 'PASS', apiWorker: 'PASS', queue: 'PASS', workflow: 'PASS', scientificContainer: 'PASS',
      r2Result: 'PASS', postgresqlProjection: 'PASS', jobId,
    }))
  } catch (error) {
    executionError = error
  }
  try {
    if (organizationId) {
      await client.query('BEGIN')
      await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId])
      await client.query("UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'STAGING_SCIENTIFIC_FIXTURE_ARCHIVED') WHERE organization_id = $1", [organizationId])
      await client.query("UPDATE v2_workspace_hostnames SET status = 'ARCHIVED', updated_at = now() WHERE organization_id = $1", [organizationId])
      await client.query("UPDATE v2_organizations SET status = 'ARCHIVED', updated_at = now() WHERE id = $1", [organizationId])
      await client.query('COMMIT')
      console.log(JSON.stringify({ remoteScientificFixtureCleanup: 'ARCHIVED' }))
    }
  } catch {
    await client.query('ROLLBACK').catch(() => undefined)
    if (!executionError) executionError = new Error('REMOTE_SCIENTIFIC_E2E=FAIL fixture_cleanup_failed')
  }
  await client.end().catch(() => undefined)
  if (executionError) throw executionError
}

await main()
