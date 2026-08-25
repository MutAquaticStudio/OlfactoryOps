import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { odorResearchPredictionSchema } from '../../packages/contracts/src/olfactory-intelligence.js'
import { handleInternalOdorPrediction } from './odor-prediction-transport.js'

const hash = (character: string) => character.repeat(64)
const secret = 'scientific-container-secret'

function prediction() {
  return odorResearchPredictionSchema.parse({
    schemaVersion: '1.0.0', modelId: 'artifact-model', modelVersionId: 'osmo-dravnieks-transformer-cnn/1.0.0',
    modelStage: 'RESEARCH', trainingMode: 'FINE_TUNE_FROZEN_PRETRAINED_ENCODER', datasetVersionId: 'dataset-sha',
    inputStructureHash: hash('a'), canonicalSmiles: 'CCO', rdkitVersion: '2023.9.3', standardizationVersion: 'olfactoryops-rdkit-standardization/1.0.0',
    predictions: [{ descriptor: 'Floral', targetKey: 'regression_floral', score: 0.42, scale: 'dataset descriptor response score, source range 0-1; not a probability', uncertainty: 0.08, uncertaintyMethod: 'per-target validation residual RMSE' }],
    provenance: { upstreamCommit: '4db725b5e549af7697215d8cc7a6e8a2a952dca5', checkpointSha256: hash('b'), evaluationHash: hash('c') },
    evidenceStatus: 'EVALUATED_RESEARCH', runtimeVersion: 'olfactoryops-osmo-research-runtime/1.0.0',
  })
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://cloud-runtime.internal/internal/odor-prediction', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-olfactoryops-internal-dispatch': 'cloud-runtime/v1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const validRequest = {
  protocolVersion: 'cloud-runtime/v1',
  operation: 'ODOR_PREDICTION',
  payload: { modelVersionId: 'osmo-dravnieks-transformer-cnn/1.0.0', canonicalSmiles: 'CCO', requestedTargets: ['regression_floral'] },
}

function harness(response = { status: 200, body: JSON.stringify(prediction()) }) {
  const container = { runOdorPrediction: vi.fn().mockResolvedValue(response) }
  const resolve = vi.fn().mockResolvedValue(container)
  const env = { SCIENTIFIC_MODEL_CONTAINER: {}, SCIENTIFIC_CONTAINER_SHARED_SECRET: secret }
  return { container, resolve, env }
}

describe('internal Cloud Runtime odor prediction transport', () => {
  it('keeps the model transport private and the container secret out of API Worker bindings', () => {
    const cloudConfig = readFileSync('wrangler.v2-cloud-runtime.example.toml', 'utf8')
    const apiConfig = readFileSync('wrangler.v2-api-staging.example.toml', 'utf8')
    expect(cloudConfig).toContain('workers_dev = false')
    expect(cloudConfig).not.toMatch(/^routes\s*=|^route\s*=/m)
    expect(cloudConfig).toContain('SCIENTIFIC_CONTAINER_SHARED_SECRET')
    expect(apiConfig).toContain('binding = "CLOUD_RUNTIME"')
    expect(apiConfig).not.toContain('SCIENTIFIC_CONTAINER_SHARED_SECRET')
    expect(`${cloudConfig}\n${apiConfig}`).not.toContain('VITE_SCIENTIFIC')
  })

  it('forwards only the strict scientific payload and injects the server-side secret', async () => {
    const { container, resolve, env } = harness()
    const response = await handleInternalOdorPrediction(request(validRequest), env as never, resolve)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual(prediction())
    expect(container.runOdorPrediction).toHaveBeenCalledWith(validRequest.payload, secret)
    expect(body.includes(secret)).toBe(false)
  })

  it('rejects unauthenticated internal calls before resolving a container', async () => {
    const { resolve, env } = harness()
    const response = await handleInternalOdorPrediction(request(validRequest, { 'x-olfactoryops-internal-dispatch': 'wrong' }), env as never, resolve)
    expect(response.status).toBe(403)
    expect(resolve).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown operation', { ...validRequest, operation: 'MODEL_SMOKE' }],
    ['unknown field', { ...validRequest, payload: { ...validRequest.payload, checkpointPath: '/tmp/model' } }],
    ['oversized SMILES', { ...validRequest, payload: { ...validRequest.payload, canonicalSmiles: 'C'.repeat(4097) } }],
    ['control character', { ...validRequest, payload: { ...validRequest.payload, canonicalSmiles: 'CC\nO' } }],
    ['duplicate targets', { ...validRequest, payload: { ...validRequest.payload, requestedTargets: ['regression_floral', 'regression_floral'] } }],
    ['too many targets', { ...validRequest, payload: { ...validRequest.payload, requestedTargets: Array.from({ length: 21 }, (_, index) => `regression_target_${index}`) } }],
  ])('rejects %s before model execution', async (_label, body) => {
    const { container, resolve, env } = harness()
    const response = await handleInternalOdorPrediction(request(body), env as never, resolve)
    expect(response.status).toBe(422)
    expect(container.runOdorPrediction).not.toHaveBeenCalled()
  })

  it('rejects an oversized transport body before model execution', async () => {
    const { resolve, env } = harness()
    const response = await handleInternalOdorPrediction(request('x'.repeat(16_385)), env as never, resolve)
    expect(response.status).toBe(413)
    expect(resolve).not.toHaveBeenCalled()
  })

  it.each([
    [409, 409, 'MODEL_NOT_EVALUATED'],
    [422, 422, 'MODEL_RUNTIME_INVALID_INPUT'],
    [503, 503, 'MODEL_RUNTIME_NOT_CONFIGURED'],
    [500, 503, 'MODEL_RUNTIME_UNAVAILABLE'],
  ])('normalizes container status %s without returning its body', async (containerStatus, expectedStatus, expectedCode) => {
    const { resolve, env } = harness({ status: containerStatus, body: JSON.stringify({ error: 'raw-private-error', secret }) })
    const response = await handleInternalOdorPrediction(request(validRequest), env as never, resolve)
    expect(response.status).toBe(expectedStatus)
    expect(await response.json()).toEqual({ code: expectedCode })
  })

  it('fails closed on malformed and oversized successful container responses', async () => {
    for (const body of [JSON.stringify({ predictions: [] }), 'x'.repeat(65_537)]) {
      const { resolve, env } = harness({ status: 200, body })
      const response = await handleInternalOdorPrediction(request(validRequest), env as never, resolve)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ code: 'MODEL_RUNTIME_UNAVAILABLE' })
    }
  })

  it.each([
    ['MODEL_RUNTIME_TIMEOUT', 504, 'MODEL_RUNTIME_TIMEOUT'],
    ['SCIENTIFIC_CONTAINER_NOT_CONFIGURED', 503, 'MODEL_RUNTIME_NOT_CONFIGURED'],
    ['private internal address leaked', 503, 'MODEL_RUNTIME_UNAVAILABLE'],
  ])('normalizes thrown runtime failure %s', async (failure, status, code) => {
    const resolve = vi.fn().mockResolvedValue({ runOdorPrediction: vi.fn().mockRejectedValue(new Error(failure)) })
    const env = { SCIENTIFIC_MODEL_CONTAINER: {}, SCIENTIFIC_CONTAINER_SHARED_SECRET: secret }
    const response = await handleInternalOdorPrediction(request(validRequest), env as never, resolve)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ code })
  })

  it('fails closed before container resolution when the Cloud Runtime secret is absent', async () => {
    const { resolve } = harness()
    const response = await handleInternalOdorPrediction(request(validRequest), { SCIENTIFIC_MODEL_CONTAINER: {} } as never, resolve)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ code: 'MODEL_RUNTIME_NOT_CONFIGURED' })
    expect(resolve).not.toHaveBeenCalled()
  })
})
