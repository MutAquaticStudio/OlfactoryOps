import { describe, expect, it, vi } from 'vitest'
import { molecularEmbeddingRequestSchema, molecularSimilarityRequestSchema, odorPredictionRequestSchema, odorResearchPredictionSchema } from '../../../packages/contracts/src/olfactory-intelligence.js'
import { OlfactoryIntelligenceService } from './olfactory-intelligence-service.js'

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

  it('requires a model reference and bounded native descriptor targets', () => {
    expect(odorPredictionRequestSchema.safeParse({ requestedTask: 'odor-descriptor' }).success).toBe(false)
    expect(odorPredictionRequestSchema.safeParse({ modelVersionId: 'model-version', requestedTask: 'odor-descriptor', requestedTargets: ['regression_floral'] }).success).toBe(true)
    expect(odorPredictionRequestSchema.safeParse({ modelVersionId: 'model-version', requestedTask: 'arbitrary-task' }).success).toBe(false)
    expect(odorPredictionRequestSchema.safeParse({ modelVersionId: 'model-version', requestedTask: 'odor-descriptor', requestedTargets: Array.from({ length: 21 }, (_, index) => `regression_target_${index}`) }).success).toBe(false)
  })
})

const context = { organizationId: 'org_research', userId: 'user_research', sessionId: 'session_research', role: 'Owner', hostname: 'research.example.test' } as const
const hash = (character: string) => character.repeat(64)
const sqlText = (query: { strings?: readonly string[]; sql?: string } | readonly string[]) => Array.isArray(query) ? query.join(' ') : query.strings?.join(' ') ?? query.sql ?? ''

class PredictionClient {
  readonly executed: string[] = []
  readonly queried: string[] = []
  openTransactions = 0
  transactionCount = 0
  predictionWrites = 0
  auditWrites = 0
  private idempotency?: { requestHash: string; response: unknown }
  constructor(private readonly model: { visible?: boolean; materialVisible?: boolean; evaluationStatus?: string; leakageStatus?: string; checkpointStatus?: string; stage?: string; componentKey?: string; status?: string } = {}) {}
  async $transaction<T>(action: (tx: this) => Promise<T>) {
    const snapshot = { idempotency: this.idempotency ? { ...this.idempotency } : undefined, predictionWrites: this.predictionWrites, auditWrites: this.auditWrites }
    this.transactionCount += 1
    this.openTransactions += 1
    try { return await action(this) } catch (error) {
      this.idempotency = snapshot.idempotency
      this.predictionWrites = snapshot.predictionWrites
      this.auditWrites = snapshot.auditWrites
      throw error
    } finally { this.openTransactions -= 1 }
  }
  async $executeRaw(query: { strings?: readonly string[]; sql?: string } | readonly string[], ...values: unknown[]) {
    const sql = sqlText(query)
    this.executed.push(sql)
    if (sql.includes('INSERT INTO v2_audit_events')) this.auditWrites += 1
    if (sql.includes('DELETE FROM v2_operation_idempotency') && this.idempotency?.response == null && this.idempotency.requestHash === values[4]) this.idempotency = undefined
    return 1
  }
  async $queryRaw(query: { strings?: readonly string[]; sql?: string } | readonly string[], ...values: unknown[]) {
    const sql = sqlText(query)
    this.queried.push(sql)
    if (sql.includes('SELECT request_hash AS')) return this.idempotency ? [{ requestHash: this.idempotency.requestHash, response: this.idempotency.response }] : []
    if (sql.includes('INSERT INTO v2_operation_idempotency')) {
      if (this.idempotency) return []
      this.idempotency = { requestHash: String(values[5]), response: null }
      return [{ id: 'idem_prediction' }]
    }
    if (sql.includes('UPDATE v2_operation_idempotency')) {
      if (!this.idempotency || this.idempotency.response != null || this.idempotency.requestHash !== values[5]) return []
      this.idempotency.response = JSON.parse(String(values[0]))
      return [{ id: 'idem_prediction' }]
    }
    if (sql.includes('FROM v2_materials material')) return this.model.materialVisible === false ? [] : [{ id: 'material_1', canonicalSmiles: 'CCO', structureHash: hash('a'), resolutionStatus: 'RESOLVED', rdkitVersion: '2023.9.3', standardizationVersion: 'olfactoryops-rdkit-standardization/1.0.0' }]
    if (sql.includes('FROM v2_model_versions version')) return this.model.visible === false ? [] : [{ id: 'model_version_1', modelId: 'model_1', modelName: 'Research odor candidate', version: 'osmo-dravnieks-transformer-cnn/1.0.0', stage: this.model.stage ?? 'RESEARCH', status: this.model.status ?? 'REVIEW_REQUIRED', componentKey: this.model.componentKey ?? 'TRANSFORMER_CNN', checkpointHash: hash('b'), checkpointStatus: this.model.checkpointStatus ?? 'VERIFIED', datasetVersionId: 'dataset_version_1', datasetVersion: '5aa9d2cd-d560c47e', evaluationStatus: this.model.evaluationStatus ?? 'REVIEW_REQUIRED', leakageStatus: this.model.leakageStatus ?? 'PASS' }]
    if (sql.includes('INSERT INTO v2_olfactory_predictions')) { this.predictionWrites += 1; return [{ id: 'prediction_1' }] }
    throw new Error(`Unhandled query: ${sql}`)
  }
  idempotencyFinalized() { return this.idempotency?.response != null }
  idempotencyReserved() { return Boolean(this.idempotency) }
}

function runtimeResponse() {
  return odorResearchPredictionSchema.parse({
    schemaVersion: '1.0.0', modelId: 'artifact-model', modelVersionId: 'osmo-dravnieks-transformer-cnn/1.0.0', modelStage: 'RESEARCH', trainingMode: 'FINE_TUNE_FROZEN_PRETRAINED_ENCODER', datasetVersionId: 'dataset-sha', inputStructureHash: hash('a'), canonicalSmiles: 'CCO', rdkitVersion: '2023.9.3', standardizationVersion: 'olfactoryops-rdkit-standardization/1.0.0',
    predictions: [{ descriptor: 'Floral', targetKey: 'regression_floral', score: 0.42, scale: 'dataset descriptor response score, source range 0-1; not a probability', uncertainty: 0.08, uncertaintyMethod: 'per-target validation residual RMSE' }],
    provenance: { upstreamCommit: '4db725b5e549af7697215d8cc7a6e8a2a952dca5', checkpointSha256: hash('b'), evaluationHash: hash('c') }, evidenceStatus: 'EVALUATED_RESEARCH', runtimeVersion: 'olfactoryops-osmo-research-runtime/1.0.0',
  })
}

describe('research odor inference boundary', () => {
  it('requires prediction permission, tenant-owned evidence, and persists only real runtime output', async () => {
    const client = new PredictionClient()
    const platform = { requirePermission: vi.fn().mockResolvedValue(undefined) }
    const runtime = { predict: vi.fn().mockResolvedValue(runtimeResponse()) }
    const service = new OlfactoryIntelligenceService(client as never, platform as never, runtime)
    await expect(service.predictOdor(context, 'material_1', { modelVersionId: 'model_version_1', requestedTask: 'odor-descriptor' }, 'prediction-key-0001')).resolves.toMatchObject({ status: 'SUCCESS', modelStage: 'RESEARCH', evidenceStatus: 'EVALUATED_RESEARCH' })
    expect(platform.requirePermission).toHaveBeenCalledWith(context, 'scientific_ai.predict')
    expect(runtime.predict).toHaveBeenCalledWith(expect.objectContaining({ artifactModelVersion: 'osmo-dravnieks-transformer-cnn/1.0.0', canonicalSmiles: 'CCO' }))
    const modelSql = client.queried.find((sql) => sql.includes('FROM v2_model_versions version')) ?? ''
    expect(modelSql).toContain("checkpoint.status = 'VERIFIED'")
    expect(modelSql).toContain("training.status = 'SUCCEEDED'")
    expect(modelSql).toContain("training.leakage_status = 'PASS'")
    expect(modelSql).not.toContain('evaluation.status IN')
    expect(modelSql).toContain('ORDER BY evaluation.created_at DESC LIMIT 1')
    expect(client.queried.filter((sql) => sql.includes('FROM v2_materials material'))).toHaveLength(2)
    expect(client.queried.filter((sql) => sql.includes('FROM v2_model_versions version'))).toHaveLength(2)
    expect(client.queried.some((sql) => sql.includes('INSERT INTO v2_olfactory_predictions'))).toBe(true)
    expect(client.executed.some((sql) => sql.includes('INSERT INTO v2_audit_events'))).toBe(true)
  })

  it('keeps the transaction closed during inference lasting more than five seconds and commits the result afterward', async () => {
    const client = new PredictionClient()
    const runtime = { predict: vi.fn(async () => {
      expect(client.openTransactions).toBe(0)
      await new Promise((resolve) => setTimeout(resolve, 5_050))
      expect(client.openTransactions).toBe(0)
      return runtimeResponse()
    }) }
    const service = new OlfactoryIntelligenceService(client as never, { requirePermission: vi.fn().mockResolvedValue(undefined) } as never, runtime)
    await expect(service.predictOdor(context, 'material_1', { modelVersionId: 'model_version_1', requestedTask: 'odor-descriptor' }, 'prediction-key-slow-runtime')).resolves.toMatchObject({ status: 'SUCCESS' })
    expect(client.transactionCount).toBe(2)
    expect(client.predictionWrites).toBe(1)
    expect(client.auditWrites).toBe(1)
    expect(client.idempotencyFinalized()).toBe(true)
  }, 10_000)

  it('keeps a concurrent duplicate safely in progress and returns the finalized response without another inference', async () => {
    const client = new PredictionClient()
    let finishInference!: (value: ReturnType<typeof runtimeResponse>) => void
    const inference = new Promise<ReturnType<typeof runtimeResponse>>((resolve) => { finishInference = resolve })
    const runtime = { predict: vi.fn().mockReturnValue(inference) }
    const service = new OlfactoryIntelligenceService(client as never, { requirePermission: vi.fn().mockResolvedValue(undefined) } as never, runtime)
    const input = { modelVersionId: 'model_version_1', requestedTask: 'odor-descriptor' }
    const first = service.predictOdor(context, 'material_1', input, 'prediction-key-concurrent')
    await vi.waitFor(() => expect(runtime.predict).toHaveBeenCalledTimes(1))
    await expect(service.predictOdor(context, 'material_1', input, 'prediction-key-concurrent')).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS', status: 409 })
    finishInference(runtimeResponse())
    const completed = await first
    await expect(service.predictOdor(context, 'material_1', input, 'prediction-key-concurrent')).resolves.toEqual(completed)
    expect(runtime.predict).toHaveBeenCalledTimes(1)
    expect(client.predictionWrites).toBe(1)
    expect(client.auditWrites).toBe(1)
    expect(client.idempotencyFinalized()).toBe(true)
  })

  it('blocks a cross-tenant model before invoking the private runtime', async () => {
    const runtime = { predict: vi.fn() }
    const service = new OlfactoryIntelligenceService(new PredictionClient({ visible: false }) as never, { requirePermission: vi.fn().mockResolvedValue(undefined) } as never, runtime)
    await expect(service.predictOdor(context, 'material_1', { modelVersionId: 'foreign_model', requestedTask: 'odor-descriptor' }, 'prediction-key-0002')).rejects.toMatchObject({ code: 'MODEL_VERSION_NOT_FOUND', status: 404 })
    expect(runtime.predict).not.toHaveBeenCalled()
  })

  it('blocks a cross-tenant material before invoking the private runtime', async () => {
    const runtime = { predict: vi.fn() }
    const service = new OlfactoryIntelligenceService(new PredictionClient({ materialVisible: false }) as never, { requirePermission: vi.fn().mockResolvedValue(undefined) } as never, runtime)
    await expect(service.predictOdor(context, 'foreign_material', { modelVersionId: 'model_version_1', requestedTask: 'odor-descriptor' }, 'prediction-key-cross-tenant-material')).rejects.toMatchObject({ code: 'MATERIAL_NOT_FOUND', status: 404 })
    expect(runtime.predict).not.toHaveBeenCalled()
  })

  it.each(['materials.viewSensitive', 'scientific_ai.predict'])('blocks missing %s before invoking the private runtime', async (deniedPermission) => {
    const runtime = { predict: vi.fn() }
    const platform = {
      requirePermission: vi.fn((_context, permission: string) => permission === deniedPermission
        ? Promise.reject(new Error('PERMISSION_DENIED'))
        : Promise.resolve()),
    }
    const service = new OlfactoryIntelligenceService(new PredictionClient() as never, platform as never, runtime)
    await expect(service.predictOdor(context, 'material_1', { modelVersionId: 'model_version_1', requestedTask: 'odor-descriptor' }, `prediction-key-denied-${deniedPermission}`)).rejects.toThrow('PERMISSION_DENIED')
    expect(runtime.predict).not.toHaveBeenCalled()
  })

  it('fails closed when the isolated runtime is unavailable', async () => {
    const runtime = { predict: vi.fn().mockRejectedValue(new Error('MODEL_RUNTIME_NOT_CONFIGURED')) }
    const client = new PredictionClient()
    const service = new OlfactoryIntelligenceService(client as never, { requirePermission: vi.fn().mockResolvedValue(undefined) } as never, runtime)
    await expect(service.predictOdor(context, 'material_1', { modelVersionId: 'model_version_1', requestedTask: 'odor-descriptor' }, 'prediction-key-0003')).rejects.toMatchObject({ code: 'MODEL_RUNTIME_NOT_CONFIGURED', status: 503 })
    expect(client.predictionWrites).toBe(0)
    expect(client.auditWrites).toBe(0)
    expect(client.idempotencyReserved()).toBe(false)
  })

  it.each([
    ['blocked evaluation', { evaluationStatus: 'BLOCKED' }],
    ['leakage failure', { leakageStatus: 'FAIL' }],
    ['blocked checkpoint', { checkpointStatus: 'BLOCKED' }],
    ['revoked checkpoint', { checkpointStatus: 'REVOKED' }],
    ['production stage', { stage: 'PRODUCTION' }],
    ['wrong architecture', { componentKey: 'RANDOM_FOREST' }],
    ['blocked model', { status: 'BLOCKED' }],
  ])('blocks %s before invoking the private runtime', async (_label, model) => {
    const runtime = { predict: vi.fn() }
    const service = new OlfactoryIntelligenceService(new PredictionClient(model) as never, { requirePermission: vi.fn().mockResolvedValue(undefined) } as never, runtime)
    await expect(service.predictOdor(context, 'material_1', { modelVersionId: 'model_version_1', requestedTask: 'odor-descriptor' }, `prediction-key-${_label.replaceAll(' ', '-')}`)).rejects.toMatchObject({ code: 'ODOR_MODEL_NOT_EVALUATED', status: 409 })
    expect(runtime.predict).not.toHaveBeenCalled()
  })
})
