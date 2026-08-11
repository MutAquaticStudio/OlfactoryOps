import { readFileSync } from 'node:fs'
import pg from 'pg'

const { Client } = pg
const approval = process.env.V2_STAGING_DLQ_PROBE_APPROVED
const databaseUrl = process.env.STAGING_DATABASE_URL
const envelopePath = process.env.V2_STAGING_DLQ_PROBE_ENVELOPE_PATH

if (approval !== 'ARCHIVE_STAGING_DLQ_PROBE') throw new Error('STAGING_DLQ_PROBE=BLOCKED explicit staging archive approval is required')
if (process.env.V2_STAGING_ENVIRONMENT !== 'staging') throw new Error('STAGING_DLQ_PROBE=BLOCKED staging environment marker is required')
if (!databaseUrl || !envelopePath) throw new Error('STAGING_DLQ_PROBE=BLOCKED staging database and envelope path are required')

const database = new URL(databaseUrl)
if (!['postgresql:', 'postgres:'].includes(database.protocol) || ['localhost', '127.0.0.1', '::1'].includes(database.hostname)) {
  throw new Error('STAGING_DLQ_PROBE=FAIL a non-loopback staging PostgreSQL origin is required')
}
const envelope = JSON.parse(readFileSync(envelopePath, 'utf8'))
if (envelope?.jobType !== 'STAGING_DLQ_TERMINAL_FAILURE_PROBE' || typeof envelope?.organizationId !== 'string' || typeof envelope?.jobId !== 'string') {
  throw new Error('STAGING_DLQ_PROBE=FAIL invalid prepared fixture envelope')
}

const client = new Client({ connectionString: databaseUrl })
try {
  await client.connect()
  await client.query('BEGIN')
  try {
    await client.query("SELECT set_config('app.organization_id', $1, true)", [envelope.organizationId])
    const dispatch = await client.query(
      `SELECT status, attempts FROM v2_cloud_job_dispatches
       WHERE organization_id = $1 AND id = $2 AND job_type = 'STAGING_DLQ_TERMINAL_FAILURE_PROBE'`,
      [envelope.organizationId, envelope.jobId],
    )
    if (dispatch.rows[0]?.status !== 'FAILED' || Number(dispatch.rows[0]?.attempts) !== 3) throw new Error('STAGING_DLQ_PROBE=FAIL terminal evidence is incomplete')
    await client.query("UPDATE v2_organizations SET status = 'ARCHIVED', updated_at = now() WHERE id = $1 AND status = 'ACTIVE'", [envelope.organizationId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
  console.log(JSON.stringify({ stagingDlqProbeCleanup: 'ARCHIVED', organizationId: envelope.organizationId, jobId: envelope.jobId }))
} finally {
  await client.end().catch(() => undefined)
}
