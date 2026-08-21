import { createHash, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import pg from 'pg'

const { Client } = pg
const approval = process.env.V2_STAGING_DLQ_PROBE_APPROVED
const databaseUrl = process.env.STAGING_DATABASE_URL
const outputPath = process.env.V2_STAGING_DLQ_PROBE_ENVELOPE_PATH

if (approval !== 'PREPARE_STAGING_DLQ_PROBE') throw new Error('STAGING_DLQ_PROBE=BLOCKED explicit staging approval is required')
if (process.env.V2_STAGING_ENVIRONMENT !== 'staging') throw new Error('STAGING_DLQ_PROBE=BLOCKED staging environment marker is required')
if (!databaseUrl) throw new Error('STAGING_DLQ_PROBE=BLOCKED STAGING_DATABASE_URL is required')
if (!outputPath) throw new Error('STAGING_DLQ_PROBE=BLOCKED V2_STAGING_DLQ_PROBE_ENVELOPE_PATH is required')

const database = new URL(databaseUrl)
if (!['postgresql:', 'postgres:'].includes(database.protocol) || ['localhost', '127.0.0.1', '::1'].includes(database.hostname)) {
  throw new Error('STAGING_DLQ_PROBE=FAIL a non-loopback staging PostgreSQL origin is required')
}

const suffix = randomUUID().replaceAll('-', '')
const organizationId = `org_staging_dlq_${suffix}`
const jobId = `job_staging_dlq_${suffix}`
const correlationId = `corr_staging_dlq_${suffix}`
const createdAt = new Date().toISOString()
const envelope = {
  protocolVersion: 'cloud-runtime/v1',
  jobId,
  organizationId,
  correlationId,
  idempotencyKey: `staging-dlq-probe-${suffix}`,
  jobType: 'STAGING_DLQ_TERMINAL_FAILURE_PROBE',
  artifactRef: `staging-fixtures/dlq/${jobId}`,
  inputHash: createHash('sha256').update(`STAGING_DLQ_TERMINAL_FAILURE_PROBE:${jobId}`, 'utf8').digest('hex'),
  createdAt,
}

const client = new Client({ connectionString: databaseUrl })
try {
  await client.connect()
  await client.query('BEGIN')
  try {
    await client.query(
      `INSERT INTO v2_organizations (id, slug, name, status)
       VALUES ($1, $2, $3, 'ACTIVE')`,
      [organizationId, `staging-dlq-${suffix.slice(0, 20)}`, `Staging DLQ acceptance fixture ${suffix.slice(0, 12)}`],
    )
    await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId])
    await client.query(
      `INSERT INTO v2_cloud_job_dispatches
         (id, organization_id, job_type, protocol_version, idempotency_key, correlation_id, artifact_ref, input_hash, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED')`,
      [jobId, organizationId, envelope.jobType, envelope.protocolVersion, envelope.idempotencyKey, correlationId, envelope.artifactRef, envelope.inputHash],
    )
    await client.query(
      `INSERT INTO v2_cloud_job_events (id, organization_id, dispatch_id, event_type, correlation_id, payload)
       VALUES ($1,$2,$3,'STAGING_DLQ_PROBE_SUBMITTED',$4,$5::jsonb)`,
      [`event_staging_dlq_${suffix}`, organizationId, jobId, correlationId, JSON.stringify({ fixture: 'STAGING_DLQ_TERMINAL_FAILURE_PROBE', businessSideEffects: 0 })],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
  writeFileSync(outputPath, `${JSON.stringify(envelope)}\n`, { encoding: 'utf8', mode: 0o600 })
  console.log(JSON.stringify({
    stagingDlqProbePrepared: 'PASS',
    organizationId,
    jobId,
    correlationId,
    jobType: envelope.jobType,
    createdAt,
  }))
} finally {
  await client.end().catch(() => undefined)
}
