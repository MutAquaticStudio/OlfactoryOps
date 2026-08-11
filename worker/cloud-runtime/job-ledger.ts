import type { PrismaClient } from '@prisma/client'
import { cloudJobEnvelopeSchema, safeCloudError, type CloudJobEnvelope } from './contracts.js'
import { withTenantTransaction } from './hyperdrive.js'

type DispatchRow = {
  id: string
  status: string
  attempts: number
  workflow_instance_id: string | null
  input_hash: string
  artifact_ref: string
}

export class CloudJobLedger {
  constructor(private readonly prisma: PrismaClient) {}

  async submit(input: CloudJobEnvelope): Promise<{ jobId: string; enqueue: boolean }> {
    const job = cloudJobEnvelopeSchema.parse(input)
    return withTenantTransaction(this.prisma, { organizationId: job.organizationId, actorUserId: job.actorUserId }, async (tx) => {
      const inserted = await tx.$queryRawUnsafe<DispatchRow[]>(
        `INSERT INTO v2_cloud_job_dispatches (id, organization_id, job_type, protocol_version, idempotency_key, correlation_id, actor_user_id, artifact_ref, input_hash, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'QUEUED')
         ON CONFLICT (organization_id, job_type, protocol_version, idempotency_key)
         DO NOTHING
         RETURNING id, status, attempts, workflow_instance_id, input_hash, artifact_ref`,
        job.jobId, job.organizationId, job.jobType, job.protocolVersion, job.idempotencyKey, job.correlationId, job.actorUserId ?? null, job.artifactRef, job.inputHash,
      )
      if (inserted[0]) {
        await this.recordEvent(tx, job, 'QUEUED', { status: 'QUEUED' })
        return { jobId: inserted[0].id, enqueue: true }
      }
      const existing = await tx.$queryRawUnsafe<DispatchRow[]>(
        `SELECT id, status, attempts, workflow_instance_id, input_hash, artifact_ref FROM v2_cloud_job_dispatches
         WHERE organization_id = $1 AND job_type = $2 AND protocol_version = $3 AND idempotency_key = $4`,
        job.organizationId, job.jobType, job.protocolVersion, job.idempotencyKey,
      )
      const row = existing[0]
      if (!row) throw new Error('CLOUD_JOB_PERSIST_FAILED')
      if (row.id !== job.jobId || row.input_hash !== job.inputHash || row.artifact_ref !== job.artifactRef) throw new Error('CLOUD_JOB_IDEMPOTENCY_CONFLICT')
      return { jobId: row.id, enqueue: row.status === 'QUEUED' && row.attempts === 0 && !row.workflow_instance_id }
    })
  }

  async claim(input: CloudJobEnvelope): Promise<boolean> {
    const job = cloudJobEnvelopeSchema.parse(input)
    return withTenantTransaction(this.prisma, { organizationId: job.organizationId, actorUserId: job.actorUserId }, async (tx) => {
      const updated = await tx.$queryRawUnsafe<DispatchRow[]>(
        `UPDATE v2_cloud_job_dispatches
         SET status = 'PROCESSING', attempts = attempts + 1, updated_at = now()
         WHERE organization_id = $1 AND id = $2 AND status IN ('QUEUED','RETRY') AND attempts < 3
         RETURNING id, status, attempts, workflow_instance_id, input_hash, artifact_ref`,
        job.organizationId, job.jobId,
      )
      if (!updated[0]) return false
      await this.recordEvent(tx, job, 'CLAIMED', { attempt: updated[0].attempts })
      return true
    })
  }

  /**
   * A queue may redeliver any message. Every delivery uses the same workflow
   * instance id, so a crash after reservation is recovered by attempting the
   * same durable create rather than creating a second scientific execution.
   */
  async reserveWorkflow(input: CloudJobEnvelope): Promise<{ workflowInstanceId: string; shouldCreate: boolean }> {
    const job = cloudJobEnvelopeSchema.parse(input)
    const workflowInstanceId = `scientific-${job.jobId}`
    return withTenantTransaction(this.prisma, { organizationId: job.organizationId, actorUserId: job.actorUserId }, async (tx) => {
      const rows = await tx.$queryRawUnsafe<DispatchRow[]>(
        `UPDATE v2_cloud_job_dispatches
         SET status = 'PROCESSING', workflow_instance_id = $3, attempts = attempts + 1, updated_at = now()
         WHERE organization_id = $1 AND id = $2 AND status IN ('QUEUED','RETRY') AND attempts < 3
         RETURNING id, status, attempts, workflow_instance_id, input_hash, artifact_ref`,
        job.organizationId, job.jobId, workflowInstanceId,
      )
      if (rows[0]) {
        await this.recordEvent(tx, job, 'WORKFLOW_RESERVED', { attempt: rows[0].attempts, workflowInstanceId })
        return { workflowInstanceId, shouldCreate: true }
      }
      const existing = await tx.$queryRawUnsafe<DispatchRow[]>(
        `SELECT id, status, attempts, workflow_instance_id, input_hash, artifact_ref FROM v2_cloud_job_dispatches
         WHERE organization_id = $1 AND id = $2`,
        job.organizationId, job.jobId,
      )
      const row = existing[0]
      if (!row) throw new Error('CLOUD_JOB_NOT_FOUND')
      if (row.status === 'PROCESSING' && row.workflow_instance_id === workflowInstanceId) return { workflowInstanceId, shouldCreate: true }
      return { workflowInstanceId, shouldCreate: false }
    })
  }

  async attachWorkflow(input: CloudJobEnvelope, workflowInstanceId: string): Promise<void> {
    const job = cloudJobEnvelopeSchema.parse(input)
    await withTenantTransaction(this.prisma, { organizationId: job.organizationId, actorUserId: job.actorUserId }, async (tx) => {
      const attached = await tx.$queryRawUnsafe<DispatchRow[]>(
        `UPDATE v2_cloud_job_dispatches SET workflow_instance_id = $3, updated_at = now()
         WHERE organization_id = $1 AND id = $2 AND workflow_instance_id IS NULL
         RETURNING id, status, attempts, workflow_instance_id, input_hash, artifact_ref`,
        job.organizationId, job.jobId, workflowInstanceId,
      )
      if (attached[0]) await this.recordEvent(tx, job, 'WORKFLOW_ATTACHED', { workflowInstanceId })
    })
  }

  async complete(input: CloudJobEnvelope, resultArtifactRef: string): Promise<void> {
    const job = cloudJobEnvelopeSchema.parse(input)
    await withTenantTransaction(this.prisma, { organizationId: job.organizationId, actorUserId: job.actorUserId }, async (tx) => {
      const completed = await tx.$queryRawUnsafe<DispatchRow[]>(
        `UPDATE v2_cloud_job_dispatches SET status = 'SUCCEEDED', result_artifact_ref = $3, completed_at = now(), updated_at = now()
         WHERE organization_id = $1 AND id = $2 AND status = 'PROCESSING'
         RETURNING id, status, attempts, workflow_instance_id, input_hash, artifact_ref`,
        job.organizationId, job.jobId, resultArtifactRef,
      )
      if (completed[0]) await this.recordEvent(tx, job, 'SUCCEEDED', { resultArtifactRef })
    })
  }

  async fail(input: CloudJobEnvelope, error: unknown): Promise<void> {
    const job = cloudJobEnvelopeSchema.parse(input)
    const code = safeCloudError(error)
    await withTenantTransaction(this.prisma, { organizationId: job.organizationId, actorUserId: job.actorUserId }, async (tx) => {
      const failed = await tx.$queryRawUnsafe<DispatchRow[]>(
        `UPDATE v2_cloud_job_dispatches
         SET status = CASE WHEN attempts >= 3 THEN 'DLQ' ELSE 'RETRY' END, failure_code = $3, updated_at = now()
         WHERE organization_id = $1 AND id = $2 AND status = 'PROCESSING'
         RETURNING id, status, attempts, workflow_instance_id, input_hash, artifact_ref`,
        job.organizationId, job.jobId, code,
      )
      if (failed[0]) await this.recordEvent(tx, job, failed[0].status === 'DLQ' ? 'DLQ' : 'RETRY_SCHEDULED', { attempt: failed[0].attempts, code })
    })
  }

  /** Queue delivery can retry. A terminal Workflow failure cannot rely on that delivery being replayed. */
  async workflowFailed(input: CloudJobEnvelope, error: unknown): Promise<void> {
    const job = cloudJobEnvelopeSchema.parse(input)
    const code = safeCloudError(error)
    await withTenantTransaction(this.prisma, { organizationId: job.organizationId, actorUserId: job.actorUserId }, async (tx) => {
      const failed = await tx.$queryRawUnsafe<DispatchRow[]>(
        `UPDATE v2_cloud_job_dispatches
         SET status = 'FAILED', failure_code = $3, updated_at = now()
         WHERE organization_id = $1 AND id = $2 AND status = 'PROCESSING'
         RETURNING id, status, attempts, workflow_instance_id, input_hash, artifact_ref`,
        job.organizationId, job.jobId, code,
      )
      if (failed[0]) await this.recordEvent(tx, job, 'FAILED', { attempt: failed[0].attempts, code })
    })
  }

  private async recordEvent(tx: PrismaClient, job: CloudJobEnvelope, eventType: string, payload: Record<string, string | number>): Promise<void> {
    await tx.$executeRawUnsafe(
      `INSERT INTO v2_cloud_job_events (id, organization_id, dispatch_id, event_type, correlation_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      crypto.randomUUID(), job.organizationId, job.jobId, eventType, job.correlationId, JSON.stringify(payload),
    )
  }
}
