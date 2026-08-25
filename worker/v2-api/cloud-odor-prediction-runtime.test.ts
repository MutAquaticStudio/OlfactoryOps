import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { odorResearchPredictionSchema } from '../../packages/contracts/src/olfactory-intelligence.js'
import { handleInternalOdorPrediction } from '../cloud-runtime/odor-prediction-transport.js'
import { CloudflareOdorPredictionRuntime, odorPredictionRuntimeForBinding } from './cloud-odor-prediction-runtime.js'
import { OdorPredictionRuntimeUnavailable } from '../../services/scientific/src/model-http-runtime.js'

const hash = (character: string) => character.repeat(64)

function prediction() {
  return odorResearchPredictionSchema.parse({
    schemaVersion: '1.0.0',
    modelId: 'artifact-model',
    modelVersionId: 'osmo-dravnieks-transformer-cnn/1.0.0',
    modelStage: 'RESEARCH',
    trainingMode: 'FINE_TUNE_FROZEN_PRETRAINED_ENCODER',
    datasetVersionId: 'dataset-sha',
    inputStructureHash: hash('a'),
    canonicalSmiles: 'CCO',
    rdkitVersion: '2023.9.3',
    standardizationVersion: 'olfactoryops-rdkit-standardization/1.0.0',
    predictions: [{
      descriptor: 'Floral', targetKey: 'regression_floral', score: 0.42,
      scale: 'dataset descriptor response score, source range 0-1; not a probability',
      uncertainty: 0.08, uncertaintyMethod: 'per-target validation residual RMSE',
    }],
    provenance: { upstreamCommit: '4db725b5e549af7697215d8cc7a6e8a2a952dca5', checkpointSha256: hash('b'), evaluationHash: hash('c') },
    evidenceStatus: 'EVALUATED_RESEARCH',
    runtimeVersion: 'olfactoryops-osmo-research-runtime/1.0.0',
  })
}

describe('Cloudflare odor prediction runtime', () => {
  it('injects the binding-backed runtime through the actual Worker service factory', () => {
    const binding = { fetch: vi.fn() }
    expect(odorPredictionRuntimeForBinding(binding as never)).toBeInstanceOf(CloudflareOdorPredictionRuntime)
    expect(odorPredictionRuntimeForBinding(undefined)).toBeInstanceOf(OdorPredictionRuntimeUnavailable)

    const factory = readFileSync('worker/v2-api/service-container.ts', 'utf8')
    expect(factory).toContain('new OlfactoryIntelligenceService(prisma, platform, odorPredictionRuntimeForBinding(env.CLOUD_RUNTIME))')
  })

  it('uses only the internal binding and validates the returned research prediction', async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://cloud-runtime.internal/internal/odor-prediction')
      expect(request.headers.get('x-olfactoryops-internal-dispatch')).toBe('cloud-runtime/v1')
      expect(await request.json()).toEqual({
        protocolVersion: 'cloud-runtime/v1',
        operation: 'ODOR_PREDICTION',
        payload: { modelVersionId: 'osmo-dravnieks-transformer-cnn/1.0.0', canonicalSmiles: 'CCO', requestedTargets: ['regression_floral'] },
      })
      return Response.json(prediction())
    })
    const runtime = new CloudflareOdorPredictionRuntime({ fetch } as never)
    await expect(runtime.predict({
      artifactModelVersion: 'osmo-dravnieks-transformer-cnn/1.0.0',
      canonicalSmiles: 'CCO',
      requestedTargets: ['regression_floral'],
    })).resolves.toEqual(prediction())
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    [409, 'MODEL_NOT_EVALUATED'],
    [413, 'MODEL_RUNTIME_INVALID_INPUT'],
    [422, 'MODEL_RUNTIME_INVALID_INPUT'],
    [504, 'MODEL_RUNTIME_TIMEOUT'],
    [500, 'MODEL_RUNTIME_UNAVAILABLE'],
  ])('maps internal status %s to %s', async (status, code) => {
    const runtime = new CloudflareOdorPredictionRuntime({ fetch: vi.fn().mockResolvedValue(Response.json({ code }, { status })) } as never)
    await expect(runtime.predict({ artifactModelVersion: 'model', canonicalSmiles: 'CCO' })).rejects.toThrow(code)
  })

  it('fails closed on a malformed or oversized runtime response', async () => {
    const malformed = new CloudflareOdorPredictionRuntime({ fetch: vi.fn().mockResolvedValue(Response.json({ predictions: [] })) } as never)
    await expect(malformed.predict({ artifactModelVersion: 'model', canonicalSmiles: 'CCO' })).rejects.toThrow('MODEL_RUNTIME_RESPONSE_INVALID')

    const oversized = new CloudflareOdorPredictionRuntime({ fetch: vi.fn().mockResolvedValue(new Response('x'.repeat(65_537))) } as never)
    await expect(oversized.predict({ artifactModelVersion: 'model', canonicalSmiles: 'CCO' })).rejects.toThrow('MODEL_RUNTIME_RESPONSE_TOO_LARGE')
  })

  it('fails closed when the internal binding exceeds the bounded Worker timeout', async () => {
    vi.useFakeTimers()
    try {
      const runtime = new CloudflareOdorPredictionRuntime({
        fetch: vi.fn((_request: Request) => new Promise<Response>((_resolve, reject) => {
          _request.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })),
      } as never, 25)
      const pending = expect(runtime.predict({ artifactModelVersion: 'model', canonicalSmiles: 'CCO' })).rejects.toThrow('MODEL_RUNTIME_TIMEOUT')
      await vi.advanceTimersByTimeAsync(25)
      await pending
    } finally {
      vi.useRealTimers()
    }
  })

  it('integrates Worker adapter through Cloud Runtime to the private prediction RPC', async () => {
    const container = { runOdorPrediction: vi.fn().mockResolvedValue({ status: 200, body: JSON.stringify(prediction()) }) }
    const env = { SCIENTIFIC_MODEL_CONTAINER: {}, SCIENTIFIC_CONTAINER_SHARED_SECRET: 'server-side-only-secret' }
    const binding = {
      fetch: (request: Request) => handleInternalOdorPrediction(request, env as never, async () => container as never),
    }
    const runtime = new CloudflareOdorPredictionRuntime(binding)
    await expect(runtime.predict({ artifactModelVersion: 'osmo-dravnieks-transformer-cnn/1.0.0', canonicalSmiles: 'CCO' })).resolves.toEqual(prediction())
    expect(container.runOdorPrediction).toHaveBeenCalledWith(
      { modelVersionId: 'osmo-dravnieks-transformer-cnn/1.0.0', canonicalSmiles: 'CCO' },
      'server-side-only-secret',
    )
  })
})
