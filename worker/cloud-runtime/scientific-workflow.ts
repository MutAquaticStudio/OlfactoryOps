import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { cloudArtifactManifestSchema, cloudJobEnvelopeSchema, scientificContainerRequestSchema, scientificInputArtifactSchema, scientificModelInputArtifactSchema, type CloudJobEnvelope } from './contracts.js'
import { PrivateArtifactStore } from './artifact-store.js'
import { createHyperdrivePrisma } from './hyperdrive.js'
import { CloudJobLedger } from './job-ledger.js'
import { loadPrivateScientificInput, sha256 } from './scientific-input.js'
import { completeCloudScientificFeature } from '../../services/scientific/src/cloud-completion.js'

export type CloudScientificEnv = {
  HYPERDRIVE: Hyperdrive
  R2_ARTIFACTS: R2Bucket
  SCIENTIFIC_FEATURE_CONTAINER: DurableObjectNamespace
  SCIENTIFIC_MODEL_CONTAINER: DurableObjectNamespace
  SCIENTIFIC_RUNTIME_IMAGE_DIGEST?: string
  RELEASE_GIT_SHA?: string
  SCIENTIFIC_CONTAINER_SHARED_SECRET?: string
}

type ContainerResponse = { payload: Record<string, unknown>; runtimeVersion?: string; componentVersions?: Record<string, string>; modelVersion?: string }

function containerFor(env: CloudScientificEnv, job: CloudJobEnvelope): DurableObjectStub {
  const namespace = job.jobType === 'SCIENTIFIC_MODEL' ? env.SCIENTIFIC_MODEL_CONTAINER : env.SCIENTIFIC_FEATURE_CONTAINER
  return namespace.get(namespace.idFromName(job.jobId))
}

export class ScientificJobWorkflow extends WorkflowEntrypoint<CloudScientificEnv, CloudJobEnvelope> {
  async run(event: Readonly<WorkflowEvent<CloudJobEnvelope>>, step: WorkflowStep): Promise<{ status: 'SUCCEEDED'; resultArtifactRef: string }> {
    const job = cloudJobEnvelopeSchema.parse(event.payload)
    const ledger = new CloudJobLedger(createHyperdrivePrisma(this.env))
    try {
    if (job.jobType !== 'SCIENTIFIC_FEATURE' && job.jobType !== 'SCIENTIFIC_MODEL') throw new Error('CLOUD_WORKFLOW_JOB_TYPE_DENIED')
    const scientificContainerSharedSecret = this.env.SCIENTIFIC_CONTAINER_SHARED_SECRET
    if (!scientificContainerSharedSecret) throw new Error('SCIENTIFIC_CONTAINER_NOT_CONFIGURED')
    const serializedInput = await step.do('load-private-scientific-input', async () => {
      const source = await new PrivateArtifactStore(this.env.R2_ARTIFACTS).get(job.organizationId, job.artifactRef)
      return JSON.stringify(await loadPrivateScientificInput(job, source))
    })
    const input = JSON.parse(serializedInput) as Record<string, unknown>
    const serializedArtifact = await step.do('scientific-container-invocation', { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' } as const, async () => {
      const request = scientificContainerRequestSchema.parse({
        jobId: job.jobId,
        correlationId: job.correlationId,
        artifactRef: job.artifactRef,
        inputHash: job.inputHash,
        ...(job.jobType === 'SCIENTIFIC_FEATURE' ? scientificInputArtifactSchema.parse(input) : {}),
        ...(job.jobType === 'SCIENTIFIC_MODEL' ? { modelVersion: scientificModelInputArtifactSchema.parse(input).modelVersion } : {}),
        operation: job.jobType === 'SCIENTIFIC_MODEL' ? 'MODEL_SMOKE' : 'FEATURE_GENERATE',
      })
      const response = await containerFor(this.env, job).fetch('https://scientific.internal/v1/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-olfactoryops-scientific-key': scientificContainerSharedSecret },
        body: JSON.stringify(request),
      })
      if (!response.ok) throw new Error(response.status === 503 ? 'SCIENTIFIC_CONTAINER_UNAVAILABLE' : 'SCIENTIFIC_CONTAINER_FAILED')
      const parsed = await response.json() as unknown
      if (!isContainerResponse(parsed)) throw new Error('SCIENTIFIC_CONTAINER_INVALID_RESPONSE')
      const serialized = JSON.stringify(parsed)
      if (serialized.length > 1_000_000) throw new Error('SCIENTIFIC_CONTAINER_RESPONSE_TOO_LARGE')
      return serialized
    })
    const artifact = JSON.parse(serializedArtifact) as ContainerResponse
    const persisted = await step.do('persist-scientific-artifact-provenance', async () => {
      const encoded = JSON.stringify(artifact.payload)
      const bytes = new TextEncoder().encode(encoded)
      const contentHash = await sha256(encoded)
      const store = new PrivateArtifactStore(this.env.R2_ARTIFACTS)
      const saved = await store.put(cloudArtifactManifestSchema.parse({
        organizationId: job.organizationId,
        artifactFamily: 'SCIENTIFIC',
        artifactRef: `scientific-result/${job.jobId}`,
        contentHash,
        mimeType: 'application/json',
        schemaVersion: 'scientific-result/1',
        provenance: {
          correlationId: job.correlationId,
          inputHash: job.inputHash,
          runtimeImageDigest: this.env.SCIENTIFIC_RUNTIME_IMAGE_DIGEST,
          gitSha: this.env.RELEASE_GIT_SHA,
          componentVersions: artifact.componentVersions ?? {},
          modelVersion: artifact.modelVersion,
        },
      }), bytes)
      if (job.jobType === 'SCIENTIFIC_FEATURE') {
        const completionClient = createHyperdrivePrisma(this.env)
        try {
          await completeCloudScientificFeature(completionClient, {
            organizationId: job.organizationId,
            actorUserId: job.actorUserId,
            jobId: job.jobId,
            correlationId: job.correlationId,
            resultArtifactRef: saved.key,
            runtimeVersion: artifact.runtimeVersion,
            payload: artifact.payload,
          })
        } finally {
          await completionClient.$disconnect()
        }
      }
      await ledger.complete(job, saved.key)
      return { resultArtifactRef: saved.key }
    })
    return { status: 'SUCCEEDED', resultArtifactRef: persisted.resultArtifactRef }
    } catch (error) {
      await ledger.workflowFailed(job, error)
      throw error
    }
  }
}

function isContainerResponse(value: unknown): value is ContainerResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) return false
  if (row.runtimeVersion !== undefined && typeof row.runtimeVersion !== 'string') return false
  if (row.modelVersion !== undefined && typeof row.modelVersion !== 'string') return false
  if (row.componentVersions !== undefined && (!row.componentVersions || typeof row.componentVersions !== 'object' || Array.isArray(row.componentVersions) || Object.values(row.componentVersions as Record<string, unknown>).some((item) => typeof item !== 'string'))) return false
  return true
}
