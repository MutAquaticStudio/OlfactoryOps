import { describe, expect, it } from 'vitest'
import { molecularEmbeddingRequestSchema, molecularSimilarityRequestSchema, odorPredictionRequestSchema } from '../../../packages/contracts/src/olfactory-intelligence.js'

describe('Phase 5 olfactory intelligence contracts', () => {
  it('permits only a bounded, versioned molecular feature projection', () => {
    const parsed = molecularEmbeddingRequestSchema.safeParse({ featureKinds: ['ECFP', 'ECFP'], method: 'FINGERPRINT_BINARY_VECTOR', normalization: 'L2', indexVersion: 'molecular-index/1' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.featureKinds).toEqual(['ECFP'])
  })

  it('requires two distinct fingerprints for a fusion projection', () => {
    expect(molecularEmbeddingRequestSchema.safeParse({ featureKinds: ['ECFP'], method: 'FUSION_CONCAT' }).success).toBe(false)
    expect(molecularEmbeddingRequestSchema.safeParse({ featureKinds: ['ECFP', 'BCFP'], method: 'FUSION_CONCAT' }).success).toBe(true)
  })

  it('requires a distinct material for deterministic fingerprint similarity', () => {
    const parsed = molecularSimilarityRequestSchema.safeParse({ candidateMaterialId: 'material_b', featureKind: 'ECFP', indexVersion: 'molecular-index/1' })
    expect(parsed.success).toBe(true)
  })

  it('requires a model reference before an odor-prediction request can be recorded as not evaluated', () => {
    expect(odorPredictionRequestSchema.safeParse({ requestedTask: 'odor-descriptor' }).success).toBe(false)
    expect(odorPredictionRequestSchema.safeParse({ modelVersionId: 'model-version', requestedTask: 'odor-descriptor' }).success).toBe(true)
  })
})
