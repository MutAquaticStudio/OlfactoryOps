import { describe, expect, it } from 'vitest'
import { featureSetSchema, predictionResultSchema, scientificFeatureRequestSchema, scientificJobSchema, structureNormalizeRequestSchema } from './index'

const artifact = { metadata: { artifactId: 'artifact-1', kind: 'feature', schemaVersion: '1', contentHash: 'a'.repeat(64), createdAt: '2026-08-08T10:00:00.000Z' }, provenance: [{ kind: 'component', id: 'osmoai/bcfp', version: 'pinned-ref' }] }

describe('scientific service boundary', () => {
  it('validates async scientific jobs and versioned artifacts', () => {
    expect(scientificJobSchema.parse({ jobId: 'job-1', operation: 'features.generate', organizationId: 'org-1', actorId: 'user-1', status: 'QUEUED', idempotencyKey: 'idem-123456', createdAt: '2026-08-08T10:00:00.000Z' }).operation).toBe('features.generate')
    expect(featureSetSchema.parse({ featureKind: 'BCFP', schemaVersion: '1', structureHash: 'b'.repeat(64), component: { kind: 'component', id: 'bcfp', version: '1' }, artifact }).artifact.metadata.kind).toBe('feature')
  })

  it('keeps prediction uncertainty and missing evidence explicit', () => {
    const result = predictionResultSchema.parse({ predictionId: 'prediction-1', status: 'NOT_EVALUATED', output: {}, provenance: [] })
    expect(result.status).toBe('NOT_EVALUATED')
    expect(predictionResultSchema.safeParse({ predictionId: 'prediction-1', status: 'VERIFIED', output: {} }).success).toBe(false)
  })

  it('bounds structure and feature requests before they cross the private runtime boundary', () => {
    expect(structureNormalizeRequestSchema.parse({ smiles: 'CCO' }).smiles).toBe('CCO')
    expect(structureNormalizeRequestSchema.safeParse({ smiles: 'CCO\u0000' }).success).toBe(false)
    expect(scientificFeatureRequestSchema.parse({ featureKinds: ['ECFP', 'ECFP', 'MOLFTP'] }).featureKinds).toEqual(['ECFP', 'MOLFTP'])
  })
})
