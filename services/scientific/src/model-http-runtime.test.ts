import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { odorResearchPredictionSchema } from '../../../packages/contracts/src/olfactory-intelligence.js'
import { OdorPredictionHttpRuntime, OdorPredictionRuntimeUnavailable } from './model-http-runtime.js'

const hash = (character: string) => character.repeat(64)

function prediction() {
  return odorResearchPredictionSchema.parse({
    schemaVersion: '1.0.0', modelId: 'artifact-model', modelVersionId: 'model/1', modelStage: 'RESEARCH',
    trainingMode: 'FINE_TUNE_FROZEN_PRETRAINED_ENCODER', datasetVersionId: 'dataset-sha', inputStructureHash: hash('a'),
    canonicalSmiles: 'CCO', rdkitVersion: '2023.9.3', standardizationVersion: 'olfactoryops-rdkit-standardization/1.0.0',
    predictions: [{ descriptor: 'Floral', targetKey: 'regression_floral', score: 0.42, scale: 'dataset descriptor response score, source range 0-1; not a probability', uncertainty: 0.08, uncertaintyMethod: 'per-target validation residual RMSE' }],
    provenance: { upstreamCommit: '4db725b5e549af7697215d8cc7a6e8a2a952dca5', checkpointSha256: hash('b'), evaluationHash: hash('c') },
    evidenceStatus: 'EVALUATED_RESEARCH', runtimeVersion: 'runtime/1',
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('Node/Nest odor runtime regression', () => {
  it('keeps the configured private HTTP runtime operational', async () => {
    const fetch = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe('https://model.internal/v1/predictions')
      expect(new Headers(init?.headers).get('x-olfactoryops-scientific-key')).toBe('server-only-secret')
      return Response.json(prediction())
    })
    vi.stubGlobal('fetch', fetch)
    const runtime = new OdorPredictionHttpRuntime({ baseUrl: 'https://model.internal', sharedSecret: 'server-only-secret' })
    await expect(runtime.predict({ artifactModelVersion: 'model/1', canonicalSmiles: 'CCO' })).resolves.toEqual(prediction())
  })

  it('keeps the unconfigured Node/Nest runtime fail closed', async () => {
    await expect(new OdorPredictionRuntimeUnavailable().predict()).rejects.toThrow('MODEL_RUNTIME_NOT_CONFIGURED')
    const moduleSource = readFileSync('server/src/modules/v2-olfactory-intelligence.module.ts', 'utf8')
    expect(moduleSource).toContain('url && sharedSecret ? new OdorPredictionHttpRuntime')
    expect(moduleSource).toContain(': new OdorPredictionRuntimeUnavailable()')
  })
})
