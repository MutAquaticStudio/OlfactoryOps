import { Prisma, type PrismaClient } from '@prisma/client'
import { scientificRuntimeResponseSchema } from '../../../packages/contracts/src/scientific.js'

type Transaction = Prisma.TransactionClient

type CloudScientificCompletion = {
  organizationId: string
  actorUserId?: string
  jobId: string
  correlationId: string
  resultArtifactRef: string
  runtimeVersion?: string
  payload: unknown
}

type JobRow = { materialId: string; requestedBy: string }

function identifier(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

/**
 * Projects a completed private Cloud Runtime result into the existing Phase 3
 * scientific aggregate. It is called by the durable Workflow, never by a
 * browser or queue payload, and remains idempotent across Workflow retries.
 */
export async function completeCloudScientificFeature(client: PrismaClient, input: CloudScientificCompletion) {
  const runtime = scientificRuntimeResponseSchema.parse(input.payload)
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", input.organizationId)
    if (input.actorUserId) await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", input.actorUserId)
    const jobs = await tx.$queryRawUnsafe<JobRow[]>(
      `SELECT material_id AS "materialId", requested_by AS "requestedBy"
       FROM v2_scientific_jobs
       WHERE organization_id = $1 AND id = $2 AND operation = 'FEATURE_GENERATE' AND cloud_input IS NOT NULL`,
      input.organizationId, input.jobId,
    )
    const job = jobs[0]
    if (!job) throw new Error('CLOUD_SCIENTIFIC_JOB_NOT_FOUND')
    for (const artifact of runtime.artifacts) {
      await tx.$executeRawUnsafe(
        `INSERT INTO v2_scientific_artifacts
          (id, organization_id, material_id, job_id, artifact_kind, evidence_status, schema_version, component_key, component_version, input_hash, content_hash, storage_ref, payload, provenance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)
         ON CONFLICT (job_id, artifact_kind) DO NOTHING`,
        identifier('scienceartifact'), input.organizationId, job.materialId, input.jobId,
        artifact.kind, artifact.status, artifact.schemaVersion, artifact.componentKey, artifact.componentVersion,
        artifact.inputHash, artifact.contentHash, input.resultArtifactRef, JSON.stringify(artifact.payload),
        JSON.stringify([...artifact.provenance, { kind: 'cloud_runtime', id: input.resultArtifactRef, version: input.runtimeVersion ?? runtime.runtimeVersion }]),
      )
    }
    const updated = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE v2_scientific_jobs
       SET status = 'SUCCEEDED', runtime_version = $3, completed_at = now(), failure_code = NULL
       WHERE organization_id = $1 AND id = $2 AND status <> 'SUCCEEDED'
       RETURNING id`,
      input.organizationId, input.jobId, input.runtimeVersion ?? runtime.runtimeVersion,
    )
    if (updated[0]) {
      await tx.$executeRawUnsafe(
        `INSERT INTO v2_audit_events
          (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id, payload_hash)
         VALUES ($1,$2,$3,'scientific.features.cloud_complete','allowed','scientific_job',$4,$5,NULL)`,
        identifier('audit'), input.organizationId, input.actorUserId ?? job.requestedBy, input.jobId, input.correlationId,
      )
    }
    return { artifactCount: runtime.artifacts.length, completed: Boolean(updated[0]) }
  })
}
