import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { cloudArtifactManifestSchema, cloudJobEnvelopeSchema, scientificContainerRequestSchema, scientificContainerResponseSchema, scientificInputArtifactSchema, scientificModelInputArtifactSchema, type CloudJobEnvelope } from './contracts.js'
import { PrivateArtifactStore } from './artifact-store.js'
import { createHyperdrivePrisma } from './hyperdrive.js'
import { CloudJobLedger } from './job-ledger.js'
import { loadPrivateScientificInput, sha256 } from './scientific-input.js'
import { completeCloudScientificFeature } from '../../services/scientific/src/cloud-completion.js'
import { safeScientificContainerError } from './scientific-container-error.js'
import { scientificContainerFor } from './scientific-container-routing.js'
import type { BufferedScientificContainerResponse, ScientificFeatureContainer, ScientificModelContainer } from './scientific-containers.js'

export type CloudScientificEnv = {
  HYPERDRIVE: Hyperdrive
  R2_ARTIFACTS: R2Bucket
  SCIENTIFIC_FEATURE_CONTAINER: DurableObjectNamespace<ScientificFeatureContainer>
  SCIENTIFIC_MODEL_CONTAINER: DurableObjectNamespace<ScientificModelContainer>
  SCIENTIFIC_RUNTIME_IMAGE_DIGEST?: string
  RELEASE_GIT_SHA?: string
  SCIENTIFIC_CONTAINER_SHARED_SECRET?: string
}

type ContainerResponse = { payload: Record<string, unknown>; runtimeVersion?: string; componentVersions?: Record<string, string>; modelVersion?: string }
type ScientificContainerStub = Pick<DurableObjectStub<ScientificFeatureContainer | ScientificModelContainer>, 'runScientificJob'>
export type ScientificWorkflowResult = { status: 'SUCCEEDED'; resultArtifactRef: string }

function containerFor(env: CloudScientificEnv, job: CloudJobEnvelope): Promise<ScientificContainerStub> {
  if (job.jobType === 'SCIENTIFIC_MODEL') return scientificContainerFor(env.SCIENTIFIC_MODEL_CONTAINER)
  return scientificContainerFor(env.SCIENTIFIC_FEATURE_CONTAINER)
}

export class ScientificJobWorkflow extends WorkflowEntrypoint<CloudScientificEnv, CloudJobEnvelope> {
  async run(event: Readonly<WorkflowEvent<CloudJobEnvelope>>, step: WorkflowStep): Promise<ScientificWorkflowResult> {
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
    const serializedArtifact = await step.do('scientific-container-invocation', { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '6 minutes' } as const, async () => {
      const request = scientificContainerRequestSchema.parse({
        jobId: job.jobId,
        correlationId: job.correlationId,
        artifactRef: job.artifactRef,
        inputHash: job.inputHash,
        ...(job.jobType === 'SCIENTIFIC_FEATURE' ? scientificInputArtifactSchema.parse(input) : {}),
        ...(job.jobType === 'SCIENTIFIC_MODEL' ? { modelVersion: scientificModelInputArtifactSchema.parse(input).modelVersion } : {}),
        operation: job.jobType === 'SCIENTIFIC_MODEL' ? 'MODEL_SMOKE' : 'FEATURE_GENERATE',
      })
      const container = await containerFor(this.env, job)
      const response = await container.runScientificJob(request, scientificContainerSharedSecret) as BufferedScientificContainerResponse
      if (response.status < 200 || response.status >= 300) {
        throw new Error(await safeScientificContainerError(new Response(response.body, { status: response.status })))
      }
      try {
        return JSON.stringify(scientificContainerResponseSchema.parse(JSON.parse(response.body)))
      } catch {
        throw new Error('SCIENTIFIC_CONTAINER_INVALID_RESPONSE')
      }
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
