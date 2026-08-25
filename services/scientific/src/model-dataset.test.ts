import { describe, expect, it, vi } from 'vitest'
import {
  createTrainingRunRequestSchema,
  registerDatasetVersionRequestSchema,
  registerModelVersionRequestSchema,
  verifyModelCheckpointRequestSchema,
} from '../../../packages/contracts/src/model-dataset.js'
import { ModelDatasetService } from './model-dataset-service.js'
import { isResearchEvaluationEligible } from './research-model-eligibility.js'

const hash = (character: string) => character.repeat(64)
const context = { organizationId: 'org_research', userId: 'user_research', sessionId: 'session_research', role: 'Owner', hostname: 'research.example.test' } as const
const sqlText = (query: { strings?: readonly string[]; sql?: string } | readonly string[]) => Array.isArray(query) ? query.join(' ') : query.strings?.join(' ') ?? query.sql ?? ''

class ModelDatasetClient {
  readonly queried: string[] = []
  readonly executed: string[] = []

  constructor(
    private readonly evaluationStatus = 'REVIEW_REQUIRED',
    private readonly leakageStatus = 'PASS',
    private readonly checkpointStatus = 'VERIFIED',
  ) {}

  async $transaction<T>(action: (tx: this) => Promise<T>) { return action(this) }
  async $executeRaw(query: { strings?: readonly string[]; sql?: string } | readonly string[]) { this.executed.push(sqlText(query)); return 1 }
  async $queryRaw(query: { strings?: readonly string[]; sql?: string } | readonly string[]) {
    const sql = sqlText(query)
    this.queried.push(sql)
    if (sql.includes('SELECT request_hash AS')) return []
    if (sql.includes('INSERT INTO v2_operation_idempotency')) return [{ id: 'idem_checkpoint' }]
    if (sql.includes('FROM v2_model_versions WHERE')) return [{ id: 'model_version_1', modelId: 'model_1', version: '1.0.0', stage: 'RESEARCH', status: 'REVIEW_REQUIRED' }]
    if (sql.includes('SELECT id, checkpoint_hash AS')) return [{ id: 'checkpoint_1', checkpointHash: hash('a'), status: this.checkpointStatus }]
    if (sql.includes('FROM v2_model_versions version')) {
      return isResearchEvaluationEligible(this.evaluationStatus, this.leakageStatus) && this.checkpointStatus === 'VERIFIED'
        ? [{ id: 'model_version_1', modelId: 'model_1', name: 'Research odor candidate', version: '1.0.0', stage: 'RESEARCH', trainingMode: 'FINE_TUNE_FROZEN_PRETRAINED_ENCODER', datasetVersion: 'dataset-1', evaluationStatus: this.evaluationStatus }]
        : []
    }
    throw new Error(`Unhandled query: ${sql}`)
  }
}

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

  it('allows REVIEW_REQUIRED research evidence while excluding BLOCKED or leakage-failed evaluations from ready listing', async () => {
    const platform = { requirePermission: vi.fn().mockResolvedValue(undefined) }
    const reviewClient = new ModelDatasetClient()
    const blockedClient = new ModelDatasetClient('BLOCKED')
    const leakageClient = new ModelDatasetClient('REVIEW_REQUIRED', 'FAIL')

    await expect(new ModelDatasetService(reviewClient as never, platform as never).listResearchReadyModels(context)).resolves.toHaveLength(1)
    await expect(new ModelDatasetService(blockedClient as never, platform as never).listResearchReadyModels(context)).resolves.toEqual([])
    await expect(new ModelDatasetService(leakageClient as never, platform as never).listResearchReadyModels(context)).resolves.toEqual([])
    const readySql = reviewClient.queried.find((sql) => sql.includes('FROM v2_model_versions version')) ?? ''
    const latestEvidenceEnd = readySql.indexOf(') evidence ON true')
    expect(readySql).toContain("checkpoint.status = 'VERIFIED'")
    expect(readySql.indexOf('evidence."evaluationStatus" IN')).toBeGreaterThan(latestEvidenceEnd)
    expect(readySql.indexOf('evidence."evaluationLeakageStatus" = \'PASS\'')).toBeGreaterThan(latestEvidenceEnd)
  })

  it.each(['BLOCKED', 'REVOKED'])('never verifies a %s checkpoint', async (checkpointStatus) => {
    const client = new ModelDatasetClient('REVIEW_REQUIRED', 'PASS', checkpointStatus)
    const service = new ModelDatasetService(client as never, { requirePermission: vi.fn().mockResolvedValue(undefined) } as never)
    await expect(service.verifyCheckpoint(context, 'model_version_1', { expectedSha256: hash('a') }, `checkpoint-key-${checkpointStatus}`)).rejects.toMatchObject({ code: 'MODEL_CHECKPOINT_BLOCKED', status: 409 })
    expect(client.executed.some((sql) => sql.includes("UPDATE v2_model_checkpoints SET status = 'VERIFIED'"))).toBe(false)
  })

  it('fails closed on checkpoint hash mismatch without marking the checkpoint verified', async () => {
    const client = new ModelDatasetClient('REVIEW_REQUIRED', 'PASS', 'PENDING')
    const service = new ModelDatasetService(client as never, { requirePermission: vi.fn().mockResolvedValue(undefined) } as never)
    await expect(service.verifyCheckpoint(context, 'model_version_1', { expectedSha256: hash('b') }, 'checkpoint-key-mismatch')).rejects.toMatchObject({ code: 'CHECKPOINT_HASH_MISMATCH', status: 409 })
    expect(client.executed.some((sql) => sql.includes("UPDATE v2_model_checkpoints SET status = 'VERIFIED'"))).toBe(false)
  })
})
