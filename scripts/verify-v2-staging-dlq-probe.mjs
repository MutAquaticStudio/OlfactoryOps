import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const { Client } = pg
const approval = process.env.V2_STAGING_DLQ_PROBE_APPROVED
const databaseUrl = process.env.STAGING_DATABASE_URL
const envelopePath = process.env.V2_STAGING_DLQ_PROBE_ENVELOPE_PATH
const outputPath = process.env.V2_STAGING_DLQ_PROBE_EVIDENCE_PATH
const timeoutMs = Number(process.env.V2_STAGING_DLQ_PROBE_TIMEOUT_MS ?? 180_000)

if (approval !== 'VERIFY_STAGING_DLQ_PROBE') throw new Error('STAGING_DLQ_PROBE=BLOCKED explicit staging verification approval is required')
if (process.env.V2_STAGING_ENVIRONMENT !== 'staging') throw new Error('STAGING_DLQ_PROBE=BLOCKED staging environment marker is required')
if (!databaseUrl || !envelopePath || !outputPath) throw new Error('STAGING_DLQ_PROBE=BLOCKED staging database and evidence paths are required')
if (!Number.isInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 600_000) throw new Error('STAGING_DLQ_PROBE=FAIL timeout must be between 30000 and 600000 milliseconds')

const database = new URL(databaseUrl)
if (!['postgresql:', 'postgres:'].includes(database.protocol) || ['localhost', '127.0.0.1', '::1'].includes(database.hostname)) {
  throw new Error('STAGING_DLQ_PROBE=FAIL a non-loopback staging PostgreSQL origin is required')
}

const envelope = JSON.parse(readFileSync(envelopePath, 'utf8'))
if (envelope?.jobType !== 'STAGING_DLQ_TERMINAL_FAILURE_PROBE' || typeof envelope?.organizationId !== 'string' || typeof envelope?.jobId !== 'string' || typeof envelope?.correlationId !== 'string') {
  throw new Error('STAGING_DLQ_PROBE=FAIL invalid prepared fixture envelope')
}

function fail(code) {
  throw new Error(`STAGING_DLQ_PROBE=FAIL ${code}`)
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const client = new Client({ connectionString: databaseUrl })
try {
  await client.connect()
  const deadline = Date.now() + timeoutMs
  let dispatch
  let events = []
  while (Date.now() < deadline) {
    await client.query("SELECT set_config('app.organization_id', $1, true)", [envelope.organizationId])
    const dispatchResult = await client.query(
      `SELECT id, job_type, status, attempts, failure_code, workflow_instance_id, result_artifact_ref, completed_at, created_at, updated_at
       FROM v2_cloud_job_dispatches
       WHERE organization_id = $1 AND id = $2`,
      [envelope.organizationId, envelope.jobId],
    )
    dispatch = dispatchResult.rows[0]
    const eventResult = await client.query(
      `SELECT event_type, correlation_id, payload, created_at
       FROM v2_cloud_job_events
       WHERE organization_id = $1 AND dispatch_id = $2
       ORDER BY created_at ASC`,
      [envelope.organizationId, envelope.jobId],
    )
    events = eventResult.rows
    if (dispatch?.status === 'FAILED' && Number(dispatch?.attempts) === 3 && events.filter((event) => event.event_type === 'STAGING_DLQ_DELIVERY_FAILED').length === 3) break
    await sleep(5_000)
  }
  if (!dispatch) fail('dispatch_missing')
  if (dispatch.job_type !== envelope.jobType || dispatch.status !== 'FAILED' || Number(dispatch.attempts) !== 3 || dispatch.failure_code !== 'STAGING_DLQ_TERMINAL_FAILURE') fail('terminal_dispatch_state_invalid')
  if (dispatch.workflow_instance_id || dispatch.result_artifact_ref || dispatch.completed_at) fail('unexpected_runtime_side_effect')
  if (events.length !== 4 || events[0]?.event_type !== 'STAGING_DLQ_PROBE_SUBMITTED' || events.some((event) => event.correlation_id !== envelope.correlationId) || events.filter((event) => event.event_type === 'STAGING_DLQ_DELIVERY_FAILED').length !== 3) fail('event_evidence_invalid')
  const sideEffects = await client.query(
    `SELECT
       (SELECT count(*)::int FROM v2_scientific_jobs WHERE organization_id = $1) AS scientific_jobs,
       (SELECT count(*)::int FROM v2_scientific_artifacts WHERE organization_id = $1) AS scientific_artifacts,
       (SELECT count(*)::int FROM v2_inventory_movements WHERE organization_id = $1) AS inventory_movements,
       (SELECT count(*)::int FROM v2_formula_drafts WHERE organization_id = $1) AS formula_drafts`,
    [envelope.organizationId],
  )
  const counts = sideEffects.rows[0]
  if (Object.values(counts).some((value) => Number(value) !== 0)) fail('business_side_effect_detected')
  const evidence = {
    terminalFailureFixtureSubmitted: 'PASS',
    queueRetryPolicyExecuted: 'PASS',
    terminalJobStatus: dispatch.status,
    businessSideEffects: 0,
    jobId: envelope.jobId,
    correlationId: envelope.correlationId,
    organizationId: envelope.organizationId,
    queue: 'olfactoryops-v2-scientific-staging',
    dlq: 'olfactoryops-v2-scientific-dlq-staging',
    attempts: Number(dispatch.attempts),
    retryPolicy: 3,
    submittedAt: events[0].created_at,
    deliveryEvents: events.slice(1).map((event) => ({ eventType: event.event_type, attempt: Number(event.payload?.attempt ?? 0), createdAt: event.created_at })),
    verifiedAt: new Date().toISOString(),
  }
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  console.log(JSON.stringify(evidence))
} finally {
  await client.end().catch(() => undefined)
}
