import { describe, expect, it } from 'vitest'
import {
  createTrainingRunRequestSchema,
  registerDatasetVersionRequestSchema,
  registerModelVersionRequestSchema,
  verifyModelCheckpointRequestSchema,
} from '../../../packages/contracts/src/model-dataset.js'

const hash = (character: string) => character.repeat(64)

describe('Phase 4 model and dataset contracts', () => {
  it('normalizes checksums while requiring source, license, transformation, and artifact evidence', () => {
    const result = registerDatasetVersionRequestSchema.safeParse({
      version: '2026.08', sourceRepository: 'https://github.com/osmoai/publications', sourceCommit: '5aa9d2c', citation: 'Selected Osmo dataset with attribution.', sourceVersion: '2026.08', schemaVersion: 'dataset/1', contentChecksum: hash('A'), materialUniverseHash: hash('B'), rowCount: 1,
      license: { spdxId: 'CC-BY-4.0', attribution: 'Attribution retained.', usagePolicy: 'Research-only evaluation.' },
      transformations: [{ key: 'split', version: '1', codeRef: 'tests/split', configurationHash: hash('C'), inputHash: hash('D'), outputHash: hash('E') }],
      artifacts: [{ kind: 'MANIFEST', storageRef: 'test://manifest', contentHash: hash('F'), schemaVersion: 'manifest/1' }],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.contentChecksum).toBe(hash('a'))
    const missingTransformation = registerDatasetVersionRequestSchema.safeParse({
      version: '2026.08', sourceRepository: 'https://github.com/osmoai/publications', sourceCommit: '5aa9d2c', citation: 'Selected Osmo dataset with attribution.', sourceVersion: '2026.08', schemaVersion: 'dataset/1', contentChecksum: hash('A'), materialUniverseHash: hash('B'), rowCount: 1,
      license: { spdxId: 'CC-BY-4.0', attribution: 'Attribution retained.', usagePolicy: 'Research-only evaluation.' },
      transformations: [], artifacts: [{ kind: 'MANIFEST', storageRef: 'test://manifest', contentHash: hash('F'), schemaVersion: 'manifest/1' }],
    })
    expect(missingTransformation.success).toBe(false)
  })

  it('requires a pinned upstream component matching the controlled architecture', () => {
    const result = registerModelVersionRequestSchema.safeParse({
      version: '1', architecture: { key: 'KGCNN', version: '1', componentKey: 'TRANSFORMER_CNN', configurationHash: hash('a') },
      featureContract: { key: 'graph', version: '1', featureKinds: ['MOLECULAR_GRAPH'], schemaHash: hash('b') }, trainingTask: 'benchmark',
      modelCard: { purpose: 'Benchmark only.', limitations: ['No production validation.'], prohibitedInterpretations: ['Not a compliance decision.'] },
      checkpoint: { storageRef: 'test://checkpoint', checkpointHash: hash('c'), format: 'KERAS' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects random-only and overlapping partition evidence before a training run exists', () => {
    const result = createTrainingRunRequestSchema.safeParse({
      seed: 42, splitStrategy: 'SCAFFOLD_GROUP', splitManifestHash: hash('a'), configurationHash: hash('b'),
      datasets: [
        { datasetVersionId: 'dataset-version', splitRole: 'TRAIN', splitArtifactHash: hash('c'), groupSetHash: hash('d') },
        { datasetVersionId: 'dataset-version', splitRole: 'VALIDATION', splitArtifactHash: hash('e'), groupSetHash: hash('d') },
        { datasetVersionId: 'dataset-version', splitRole: 'TEST', splitArtifactHash: hash('f'), groupSetHash: hash('g') },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('accepts only an independently computed SHA-256 for checkpoint verification', () => {
    expect(verifyModelCheckpointRequestSchema.safeParse({ expectedSha256: hash('a') }).success).toBe(true)
    expect(verifyModelCheckpointRequestSchema.safeParse({ expectedSha256: 'test://checkpoint' }).success).toBe(false)
  })
})
