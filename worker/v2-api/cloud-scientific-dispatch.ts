import { PrivateArtifactStore } from '../cloud-runtime/artifact-store.js'
import { cloudArtifactManifestSchema, cloudJobEnvelopeSchema, type CloudJobEnvelope } from '../cloud-runtime/contracts.js'
import { sha256 } from '../cloud-runtime/scientific-input.js'
import type { CloudScientificDispatcher, CloudScientificFeatureDispatch } from '../../services/scientific/src/cloud-dispatch.js'

type CloudRuntimeFetcher = Pick<Fetcher, 'fetch'>

export type CloudScientificDispatchEnv = {
  R2_ARTIFACTS: R2Bucket
  CLOUD_RUNTIME: CloudRuntimeFetcher
  RELEASE_ENVIRONMENT?: string
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function cloudIdempotencyKey(input: CloudScientificFeatureDispatch) {
  // The V2 scientific job id is created once inside the tenant-scoped
  // idempotency transaction. It is safe to carry as the Cloud Runtime's
  // independent idempotency identity without truncating a caller-supplied key.
  return `science-${input.jobId}`
}

function dispatchFailure(response: Response): Error {
  if (response.status === 409) return new Error('CLOUD_SCIENTIFIC_DISPATCH_CONFLICT')
  if (response.status === 503) return new Error('CLOUD_SCIENTIFIC_RUNTIME_NOT_CONFIGURED')
  return new Error('CLOUD_SCIENTIFIC_DISPATCH_FAILED')
}

/**
 * Worker-only adapter. The Cloud Runtime has no public route or workers.dev
 * endpoint; this Fetcher is an account-internal service binding, not a proxy
 * to localhost or a browser-addressable dispatch endpoint.
 */
export class CloudflareScientificDispatcher implements CloudScientificDispatcher {
  constructor(private readonly env: CloudScientificDispatchEnv) {}

  async dispatchFeatures(input: CloudScientificFeatureDispatch) {
    if (this.env.RELEASE_ENVIRONMENT !== 'staging') throw new Error('CLOUD_SCIENTIFIC_RUNTIME_NOT_CONFIGURED')
    const payload = stableJson({ canonicalSmiles: input.canonicalSmiles, featureKinds: input.featureKinds })
    const inputHash = await sha256(payload)
    const store = new PrivateArtifactStore(this.env.R2_ARTIFACTS)
    const artifact = await store.put(cloudArtifactManifestSchema.parse({
      organizationId: input.organizationId,
      artifactFamily: 'SCIENTIFIC',
      artifactRef: `scientific-input/${input.jobId}`,
      contentHash: inputHash,
      mimeType: 'application/json',
      schemaVersion: 'scientific-input/1',
      provenance: { correlationId: input.correlationId, inputHash },
    }), payload)
    const job = cloudJobEnvelopeSchema.parse({
      protocolVersion: 'cloud-runtime/v1',
      jobId: input.jobId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      idempotencyKey: cloudIdempotencyKey(input),
      jobType: 'SCIENTIFIC_FEATURE',
      artifactRef: artifact.key,
      inputHash,
      createdAt: new Date().toISOString(),
    })
    const response = await this.env.CLOUD_RUNTIME.fetch(new Request('https://cloud-runtime.internal/internal/scientific-dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-olfactoryops-internal-dispatch': 'cloud-runtime/v1' },
      body: JSON.stringify(job),
    }))
    if (!response.ok) throw dispatchFailure(response)
    const body = await response.json().catch(() => undefined) as { jobId?: unknown; queued?: unknown } | undefined
    if (body?.jobId !== job.jobId || typeof body.queued !== 'boolean') throw new Error('CLOUD_SCIENTIFIC_DISPATCH_INVALID_RESPONSE')
    return { dispatchId: job.jobId, queued: body.queued }
  }
}

export function cloudScientificEnvelopeForTest(input: CloudScientificFeatureDispatch, artifactRef: string, inputHash: string): CloudJobEnvelope {
  return cloudJobEnvelopeSchema.parse({
    protocolVersion: 'cloud-runtime/v1', jobId: input.jobId, organizationId: input.organizationId, actorUserId: input.actorUserId,
    correlationId: input.correlationId, idempotencyKey: cloudIdempotencyKey(input), jobType: 'SCIENTIFIC_FEATURE', artifactRef, inputHash,
    createdAt: '2026-08-11T00:00:00.000Z',
  })
}
