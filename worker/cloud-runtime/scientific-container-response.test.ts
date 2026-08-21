import { describe, expect, it } from 'vitest'
import { parseScientificContainerResponse, scientificContainerExpectedResultArtifactRef } from './contracts.js'

describe('scientific Container response contract', () => {
  const featureRequest = {
    artifactRef: 'v2/org_feature/scientific/input-a',
    operation: 'FEATURE_GENERATE' as const,
  }

  it('accepts the exact feature and model response references emitted by the private containers', () => {
    expect(parseScientificContainerResponse(featureRequest, {
      resultArtifactRef: 'v2/org_feature/scientific/input-a/result',
      payload: { artifacts: [] },
      runtimeVersion: 'scientific-runtime/1',
      componentVersions: { RDKIT: 'adapter/1' },
    }).resultArtifactRef).toBe(scientificContainerExpectedResultArtifactRef(featureRequest))

    const modelRequest = {
      artifactRef: 'v2/org_model/scientific/input-b',
      operation: 'MODEL_SMOKE' as const,
    }
    expect(parseScientificContainerResponse(modelRequest, {
      resultArtifactRef: 'v2/org_model/scientific/input-b/model-runtime',
      payload: { evidenceStatus: 'NOT_CONFIGURED' },
      runtimeVersion: 'model-runtime/1',
      componentVersions: {},
    }).resultArtifactRef).toBe(scientificContainerExpectedResultArtifactRef(modelRequest))
  })

  it('rejects absent or cross-artifact result references before artifact persistence', () => {
    expect(() => parseScientificContainerResponse(featureRequest, {
      payload: { artifacts: [] },
    })).toThrow()
    expect(() => parseScientificContainerResponse(featureRequest, {
      resultArtifactRef: 'v2/org_other/scientific/input-a/result',
      payload: { artifacts: [] },
    })).toThrow('SCIENTIFIC_CONTAINER_RESULT_REFERENCE_MISMATCH')
  })
})
