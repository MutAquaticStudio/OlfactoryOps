import { describe, expect, it } from 'vitest'
import { predictionProvenanceSchema } from './index'

const provenance = {
  predictionId: 'pred-1', featureContract: 'features-v1',
  model: { modelId: 'odor-model', version: '1.0.0', architecture: 'ensemble', codeRef: 'git:abc', checkpointHash: null, trainingRunId: 'run-1', featureContract: 'features-v1', datasets: [], components: [] },
  datasets: [{ datasetId: 'dataset-1', version: '2026-01', checksum: 'a'.repeat(64), source: { sourceId: 'source-1', locator: 'https://example.test/dataset' }, license: { spdxId: 'CC-BY-4.0', attribution: 'Example' } }],
  sources: [{ sourceId: 'source-1', locator: 'https://example.test/dataset' }], transformations: [], artifacts: [],
}

describe('provenance chain', () => {
  it('can trace prediction to model, dataset, source and license', () => {
    const parsed = predictionProvenanceSchema.parse(provenance)
    expect(parsed.model.trainingRunId).toBe('run-1')
    expect(parsed.datasets[0].license.spdxId).toBe('CC-BY-4.0')
    expect(parsed.sources[0].sourceId).toBe('source-1')
  })

  it('rejects an unchecksummed dataset', () => {
    expect(predictionProvenanceSchema.safeParse({ ...provenance, datasets: [{ ...provenance.datasets[0], checksum: 'missing' }] }).success).toBe(false)
  })
})
