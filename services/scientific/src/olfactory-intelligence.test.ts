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
  constructor(private readonly model: { visible?: boolean; materialVisible?: boolean; evaluationStatus?: string; leakageStatus?: string; checkpointStatus?: string } = {}) {}
  async $transaction<T>(action: (tx: this) => Promise<T>) { return action(this) }
  async $executeRaw(query: { strings?: readonly string[]; sql?: string } | readonly string[]) { this.executed.push(sqlText(query)); return 1 }
  async $queryRaw(query: { strings?: readonly string[]; sql?: string } | readonly string[]) {
    const sql = sqlText(query)
    this.queried.push(sql)
    if (sql.includes('SELECT request_hash AS')) return []
    if (sql.includes('INSERT INTO v2_operation_idempotency')) return [{ id: 'idem_prediction' }]
    if (sql.includes('FROM v2_materials material')) return this.model.materialVisible === false ? [] : [{ id: 'material_1', canonicalSmiles: 'CCO', structureHash: hash('a'), resolutionStatus: 'RESOLVED', rdkitVersion: '2023.9.3', standardizationVersion: 'olfactoryops-rdkit-standardization/1.0.0' }]
    if (sql.includes('FROM v2_model_versions version')) return this.model.visible === false ? [] : [{ id: 'model_version_1', modelId: 'model_1', modelName: 'Research odor candidate', version: 'osmo-dravnieks-transformer-cnn/1.0.0', stage: 'RESEARCH', status: 'REVIEW_REQUIRED', componentKey: 'TRANSFORMER_CNN', checkpointHash: hash('b'), checkpointStatus: this.model.checkpointStatus ?? 'VERIFIED', datasetVersionId: 'dataset_version_1', datasetVersion: '5aa9d2cd-d560c47e', evaluationStatus: this.model.evaluationStatus ?? 'REVIEW_REQUIRED', leakageStatus: this.model.leakageStatus ?? 'PASS' }]
    if (sql.includes('INSERT INTO v2_olfactory_predictions')) return [{ id: 'prediction_1' }]
    throw new Error(`Unhandled query: ${sql}`)
  }
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
    expect(modelSql).not.toContain('evaluation.status IN')
    expect(modelSql).toContain('ORDER BY evaluation.created_at DESC LIMIT 1')
    expect(client.queried.some((sql) => sql.includes('INSERT INTO v2_olfactory_predictions'))).toBe(true)
    expect(client.executed.some((sql) => sql.includes('INSERT INTO v2_audit_events'))).toBe(true)
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
    const service = new OlfactoryIntelligenceService(new PredictionClient() as never, { requirePermission: vi.fn().mockResolvedValue(undefined) } as never, runtime)
    await expect(service.predictOdor(context, 'material_1', { modelVersionId: 'model_version_1', requestedTask: 'odor-descriptor' }, 'prediction-key-0003')).rejects.toMatchObject({ code: 'MODEL_RUNTIME_NOT_CONFIGURED', status: 503 })
  })

  it.each([
    ['blocked evaluation', { evaluationStatus: 'BLOCKED' }],
    ['leakage failure', { leakageStatus: 'FAIL' }],
    ['blocked checkpoint', { checkpointStatus: 'BLOCKED' }],
    ['revoked checkpoint', { checkpointStatus: 'REVOKED' }],
  ])('blocks %s before invoking the private runtime', async (_label, model) => {
    const runtime = { predict: vi.fn() }
    const service = new OlfactoryIntelligenceService(new PredictionClient(model) as never, { requirePermission: vi.fn().mockResolvedValue(undefined) } as never, runtime)
    await expect(service.predictOdor(context, 'material_1', { modelVersionId: 'model_version_1', requestedTask: 'odor-descriptor' }, `prediction-key-${model.evaluationStatus ?? model.leakageStatus ?? model.checkpointStatus}`)).rejects.toMatchObject({ code: 'ODOR_MODEL_NOT_EVALUATED', status: 409 })
    expect(runtime.predict).not.toHaveBeenCalled()
  })
})
