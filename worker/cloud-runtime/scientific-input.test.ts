import { describe, expect, it } from 'vitest'
import { loadPrivateScientificInput, sha256 } from './scientific-input.js'

const rawFeatureInput = JSON.stringify({ canonicalSmiles: 'CCO', featureKinds: ['ECFP', 'BCFP'] })
const baseJob = {
  protocolVersion: 'cloud-runtime/v1' as const,
  jobId: 'job_science_1',
  organizationId: 'org_1',
  correlationId: 'corr_1',
  idempotencyKey: 'science-input-idempotency-key-0001',
  jobType: 'SCIENTIFIC_FEATURE' as const,
  artifactRef: 'v2/org_1/scientific/input',
  createdAt: '2026-08-11T00:00:00.000Z',
}

describe('private scientific input', () => {
  it('accepts a hash-bound bounded feature artifact', async () => {
    const inputHash = await sha256(rawFeatureInput)
    await expect(loadPrivateScientificInput({ ...baseJob, inputHash }, { text: async () => rawFeatureInput } as R2ObjectBody)).resolves.toEqual({
      canonicalSmiles: 'CCO', featureKinds: ['ECFP', 'BCFP'],
    })
  })

  it('rejects a changed artifact before a Container sees it', async () => {
    const inputHash = await sha256(rawFeatureInput)
    await expect(loadPrivateScientificInput({ ...baseJob, inputHash }, { text: async () => JSON.stringify({ canonicalSmiles: 'CCN', featureKinds: ['ECFP'] }) } as R2ObjectBody)).rejects.toThrow('SCIENTIFIC_INPUT_HASH_MISMATCH')
  })

  it('validates the distinct model input contract', async () => {
    const rawModelInput = JSON.stringify({ requestKind: 'MODEL_SMOKE', modelVersion: 'candidate/1' })
    const inputHash = await sha256(rawModelInput)
    await expect(loadPrivateScientificInput({ ...baseJob, jobType: 'SCIENTIFIC_MODEL', inputHash }, { text: async () => rawModelInput } as R2ObjectBody)).resolves.toEqual({
      requestKind: 'MODEL_SMOKE', modelVersion: 'candidate/1',
    })
  })
})
