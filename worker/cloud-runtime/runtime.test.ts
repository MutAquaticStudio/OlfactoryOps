import { describe, expect, it } from 'vitest'
import { PrivateArtifactStore } from './artifact-store.js'
import { cloudArtifactManifestSchema, cloudJobEnvelopeSchema } from './contracts.js'
import { TenantVectorStore } from './vector-store.js'

const hash = 'a'.repeat(64)

describe('Cloudflare cloud runtime bindings', () => {
  it('accepts only reference-based, idempotent queue envelopes', () => {
    const valid = cloudJobEnvelopeSchema.parse({
      protocolVersion: 'cloud-runtime/v1', jobId: 'job_1', organizationId: 'org_1', correlationId: 'corr_1',
      idempotencyKey: 'idempotency_key_0001', jobType: 'SCIENTIFIC_FEATURE', artifactRef: 'scientific-input/1', inputHash: hash,
      createdAt: '2026-08-11T00:00:00.000Z',
    })
    expect(valid.jobType).toBe('SCIENTIFIC_FEATURE')
    expect(() => cloudJobEnvelopeSchema.parse({ ...valid, payload: { smiles: 'CCO' } })).toThrow()
  })

  it('allows the isolated staging terminal-failure fixture without adding a payload channel', () => {
    const probe = cloudJobEnvelopeSchema.parse({
      protocolVersion: 'cloud-runtime/v1', jobId: 'job_dlq_probe_1', organizationId: 'org_dlq_probe_1', correlationId: 'corr_dlq_probe_1',
      idempotencyKey: 'staging-dlq-probe-idempotency-key-0001', jobType: 'STAGING_DLQ_TERMINAL_FAILURE_PROBE', artifactRef: 'staging-fixtures/dlq/job_dlq_probe_1', inputHash: hash,
      createdAt: '2026-08-11T00:00:00.000Z',
    })
    expect(probe.jobType).toBe('STAGING_DLQ_TERMINAL_FAILURE_PROBE')
    expect(() => cloudJobEnvelopeSchema.parse({ ...probe, payload: { unsafe: true } })).toThrow()
  })

  it('writes private tenant-scoped R2 artifacts and denies cross-tenant reads', async () => {
    const objects = new Map<string, { bytes: Uint8Array; metadata: Record<string, string>; version: string; etag: string }>()
    const bucket = {
      put: async (key: string, value: Uint8Array, options: { customMetadata: Record<string, string> }) => {
        const row = { bytes: value, metadata: options.customMetadata, version: 'v1', etag: 'etag1' }
        objects.set(key, row)
        return { key, version: row.version, etag: row.etag }
      },
      get: async (key: string) => {
        const row = objects.get(key)
        return row ? { key, version: row.version, etag: row.etag, customMetadata: row.metadata } : null
      },
    } as unknown as R2Bucket
    const store = new PrivateArtifactStore(bucket)
    const manifest = cloudArtifactManifestSchema.parse({
      organizationId: 'org_a', artifactFamily: 'SCIENTIFIC', artifactRef: 'artifact_a', contentHash: hash,
      mimeType: 'application/json', schemaVersion: 'scientific-result/1', provenance: { correlationId: 'corr_a', inputHash: hash },
    })
    const saved = await store.put(manifest, '{"ok":true}')
    await expect(store.get('org_a', saved.key)).resolves.toMatchObject({ key: saved.key })
    await expect(store.get('org_b', saved.key)).rejects.toThrow('CLOUD_ARTIFACT_TENANT_DENIED')
  })

  it('uses only the approved Material Evidence index and filters tenant/model metadata twice', async () => {
    const upserts: Array<{ binding: string; vectors: Array<{ metadata?: Record<string, unknown> }> }> = []
    const vector = (binding: string) => ({
      upsert: async (vectors: Array<{ metadata?: Record<string, unknown> }>) => { upserts.push({ binding, vectors }); return { mutationId: `${binding}-1` } },
      query: async () => ({ matches: [
        { id: 'right', score: 1, metadata: { organizationId: 'org_a', embeddingVersion: 'emb/1', modelVersion: 'model/1', status: 'READY' } },
        { id: 'wrong', score: 0.9, metadata: { organizationId: 'org_b', embeddingVersion: 'emb/1', modelVersion: 'model/1', status: 'READY' } },
      ], count: 2 }),
    }) as unknown as Vectorize
    const store = new TenantVectorStore({ MATERIAL_EVIDENCE_VECTORS: vector('material') })
    await store.upsert({ space: 'MATERIAL_EVIDENCE', organizationId: 'org_a', vectorId: 'vec_a', values: [0.1, 0.2], artifactRef: 'artifact_a', embeddingVersion: 'emb/1', modelVersion: 'model/1', sourceKind: 'catalogue', status: 'READY' })
    expect(upserts[0].binding).toBe('material')
    const matches = await store.query({ space: 'MATERIAL_EVIDENCE', organizationId: 'org_a', values: [0.1, 0.2], embeddingVersion: 'emb/1', modelVersion: 'model/1', limit: 10 })
    expect(matches.map((match) => match.id)).toEqual(['right'])
    await expect(store.query({ space: 'MOLECULAR_EMBEDDING', organizationId: 'org_a', values: [0.1], embeddingVersion: 'emb/1', modelVersion: 'model/1', limit: 10 })).rejects.toThrow('VECTOR_SPACE_NOT_CONFIGURED')
  })
})
