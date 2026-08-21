import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { explainabilityRequestSchema, molecularEmbeddingRequestSchema, molecularSimilarityRequestSchema, odorPredictionRequestSchema } from '../../../packages/contracts/src/olfactory-intelligence.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'

type Transaction = Prisma.TransactionClient
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type ArtifactRow = { id: string; artifactKind: string; evidenceStatus: string; contentHash: string; payload: JsonRecord }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as JsonRecord).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  return JSON.stringify(value)
}
function digest(value: unknown) { return createHash('sha256').update(stableJson(value)).digest('hex') }
function identifier(prefix: string) { return `${prefix}_${randomUUID().replaceAll('-', '')}` }

function bitSet(artifact: ArtifactRow): { bits: number[]; dimension: number } | undefined {
  const values = artifact.payload.onBits
  const dimension = artifact.payload.bitLength
  if (!Array.isArray(values) || typeof dimension !== 'number' || !Number.isInteger(dimension) || dimension <= 0 || dimension > 4096) return undefined
  const boundedDimension = dimension
  const bits = values.filter((value): value is number => Number.isInteger(value) && value >= 0 && value < boundedDimension)
  if (!bits.length || new Set(bits).size !== bits.length) return undefined
  return { bits: bits.sort((left, right) => left - right), dimension: boundedDimension }
}

function tanimoto(left: number[], right: number[]) {
  const first = new Set(left); const second = new Set(right)
  const union = new Set([...first, ...second]).size
  if (!union) return undefined
  let shared = 0
  for (const bit of first) if (second.has(bit)) shared += 1
  return shared / union
}

/**
 * Phase 5 only derives auditable molecular evidence from already verified
 * feature artifacts. It deliberately cannot infer odor labels without a
 * reviewed dataset/model/evaluation path.
 */
export class OlfactoryIntelligenceService {
  constructor(private readonly client: PrismaClient, private readonly platform: PlatformService) {}

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`
      return action(tx)
    })
  }

  private async requireView(context: PlatformContext) {
    await this.platform.requirePermission(context, 'materials.viewSensitive')
    await this.platform.requirePermission(context, 'scientific_ai.use')
  }

  private async requireManage(context: PlatformContext) {
    await this.requireView(context)
    await this.platform.requirePermission(context, 'scientific_ai.manage')
  }

  private async audit(tx: Transaction, context: PlatformContext, action: string, outcome: 'allowed' | 'blocked', subjectType: string, subjectId: string, payload: unknown) {
    await tx.$executeRaw`INSERT INTO v2_audit_events (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id, payload_hash)
      VALUES (${identifier('audit')}, ${context.organizationId}, ${context.userId}, ${action}, ${outcome}, ${subjectType}, ${subjectId}, ${identifier('corr')}, ${digest(payload)})`
  }

  private async idempotent<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown, action: (tx: Transaction) => Promise<T>) {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const existing = await tx.$queryRaw<IdempotencyRow[]>`SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}`
      if (existing[0]) {
        if (existing[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
        if (!existing[0].response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
        return existing[0].response as T
      }
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash) VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash}) ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING RETURNING id`
      if (!inserted.length) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
      const response = await action(tx)
      await tx.$executeRaw`UPDATE v2_operation_idempotency SET response = ${JSON.stringify(response)}::jsonb WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}`
      return response
    })
  }

  private async material(tx: Transaction, context: PlatformContext, materialId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_materials WHERE id = ${materialId} AND organization_id = ${context.organizationId}`
    if (!rows[0]) throw new PlatformError('MATERIAL_NOT_FOUND', 'The requested material is not available in this workspace.', 404)
  }

  private async artifacts(tx: Transaction, context: PlatformContext, materialId: string, kinds: string[]) {
    return tx.$queryRaw<ArtifactRow[]>`SELECT id, artifact_kind AS "artifactKind", evidence_status AS "evidenceStatus", content_hash AS "contentHash", payload FROM v2_scientific_artifacts WHERE organization_id = ${context.organizationId} AND material_id = ${materialId} AND artifact_kind IN (${Prisma.join(kinds)}) ORDER BY created_at DESC, id DESC`
  }

  private async latestArtifact(tx: Transaction, context: PlatformContext, materialId: string, kind: string) {
    const rows = await this.artifacts(tx, context, materialId, [kind])
    return rows[0]
  }

  async createMolecularEmbedding(context: PlatformContext, materialId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.requireManage(context)
    const parsed = molecularEmbeddingRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Choose verified molecular fingerprint features and a bounded index version.', 422)
    return this.idempotent(context, 'olfactory-intelligence.molecular-embedding.create', idempotencyKey, { materialId, ...parsed.data }, async (tx) => {
      await this.material(tx, context, materialId)
      const candidates = await this.artifacts(tx, context, materialId, parsed.data.featureKinds)
      const selected = parsed.data.featureKinds.map((kind) => candidates.find((item) => item.artifactKind === kind && item.evidenceStatus === 'VERIFIED')).filter((item): item is ArtifactRow => Boolean(item))
      if (selected.length !== parsed.data.featureKinds.length) {
        const id = identifier('embedding')
        await tx.$executeRaw`INSERT INTO v2_molecular_embeddings (id, organization_id, material_id, method, embedding_version, index_version, normalization, dimension, feature_manifest_hash, embedding_hash, vector, evidence_status, created_by) VALUES (${id}, ${context.organizationId}, ${materialId}, ${parsed.data.method}, 'molecular-embedding/1', ${parsed.data.indexVersion}, ${parsed.data.normalization}, 1, ${digest({ requested: parsed.data.featureKinds })}, ${digest({ status: 'NOT_EVALUATED', materialId, request: parsed.data })}, '[]'::jsonb, 'NOT_EVALUATED', ${context.userId})`
        await this.audit(tx, context, 'olfactory_intelligence.embedding.create', 'blocked', 'molecular_embedding', id, { materialId, reason: 'VERIFIED_FINGERPRINT_REQUIRED' })
        return { id, materialId, status: 'NOT_EVALUATED', code: 'VERIFIED_FINGERPRINT_REQUIRED' }
      }
      const vectors = selected.map(bitSet)
      if (vectors.some((item) => !item)) throw new PlatformError('FEATURE_ARTIFACT_INVALID', 'The verified fingerprint artifact has no valid bounded bit vector.', 409)
      const vector = vectors.flatMap((item, index) => item!.bits.map((bit) => index * item!.dimension + bit))
      const dimension = vectors.reduce((total, item) => total + item!.dimension, 0)
      const featureManifestHash = digest(selected.map((item) => item.contentHash))
      const embeddingHash = digest({ method: parsed.data.method, dimension, vector, featureManifestHash, normalization: parsed.data.normalization })
      const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_molecular_embeddings WHERE organization_id = ${context.organizationId} AND material_id = ${materialId} AND model_version_id IS NULL AND method = ${parsed.data.method} AND embedding_version = 'molecular-embedding/1' AND index_version = ${parsed.data.indexVersion} AND feature_manifest_hash = ${featureManifestHash}`
      if (existing[0]) return { id: existing[0].id, materialId, status: 'VERIFIED', dimension, featureManifestHash, embeddingHash, method: parsed.data.method, indexVersion: parsed.data.indexVersion }
      const id = identifier('embedding')
      const created = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_molecular_embeddings (id, organization_id, material_id, method, embedding_version, index_version, normalization, dimension, feature_manifest_hash, embedding_hash, vector, evidence_status, created_by) VALUES (${id}, ${context.organizationId}, ${materialId}, ${parsed.data.method}, 'molecular-embedding/1', ${parsed.data.indexVersion}, ${parsed.data.normalization}, ${dimension}, ${featureManifestHash}, ${embeddingHash}, ${JSON.stringify(vector)}::jsonb, 'VERIFIED', ${context.userId}) ON CONFLICT (organization_id, material_id, method, embedding_version, index_version, feature_manifest_hash) WHERE model_version_id IS NULL DO UPDATE SET index_version = EXCLUDED.index_version RETURNING id`
      const persistedId = created[0]?.id
      if (!persistedId) throw new PlatformError('EMBEDDING_WRITE_FAILED', 'The molecular embedding could not be recorded.', 409)
      await this.audit(tx, context, 'olfactory_intelligence.embedding.create', 'allowed', 'molecular_embedding', persistedId, { materialId, featureManifestHash, embeddingHash, dimension })
      return { id: persistedId, materialId, status: 'VERIFIED', dimension, featureManifestHash, embeddingHash, method: parsed.data.method, indexVersion: parsed.data.indexVersion }
    })
  }

  async compareMolecularSimilarity(context: PlatformContext, materialId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.requireView(context)
    const parsed = molecularSimilarityRequestSchema.safeParse(rawInput)
    if (!parsed.success || parsed.data.candidateMaterialId === materialId) throw new PlatformError('INVALID_INPUT', 'Choose a different candidate material and supported fingerprint.', 422)
    return this.idempotent(context, 'olfactory-intelligence.similarity.compare', idempotencyKey, { materialId, ...parsed.data }, async (tx) => {
      await this.material(tx, context, materialId); await this.material(tx, context, parsed.data.candidateMaterialId)
      const [source, candidate] = await Promise.all([this.latestArtifact(tx, context, materialId, parsed.data.featureKind), this.latestArtifact(tx, context, parsed.data.candidateMaterialId, parsed.data.featureKind)])
      const sourceBits = source && source.evidenceStatus === 'VERIFIED' ? bitSet(source) : undefined
      const candidateBits = candidate && candidate.evidenceStatus === 'VERIFIED' ? bitSet(candidate) : undefined
      const id = identifier('similarity')
      const method = `${parsed.data.featureKind}_TANIMOTO`
      const score = sourceBits && candidateBits && sourceBits.dimension === candidateBits.dimension ? tanimoto(sourceBits.bits, candidateBits.bits) : undefined
      const status = score === undefined ? 'NOT_EVALUATED' : 'VERIFIED'
      await tx.$executeRaw`INSERT INTO v2_similarity_records (id, organization_id, source_material_id, candidate_material_id, method, metric_version, index_version, score, evidence_status, reason_code, created_by) VALUES (${id}, ${context.organizationId}, ${materialId}, ${parsed.data.candidateMaterialId}, ${method}, 'tanimoto/1', ${parsed.data.indexVersion}, ${score ?? null}, ${status}, ${score === undefined ? 'VERIFIED_FINGERPRINT_REQUIRED' : null}, ${context.userId})`
      await this.audit(tx, context, 'olfactory_intelligence.similarity.compare', score === undefined ? 'blocked' : 'allowed', 'similarity_record', id, { materialId, candidateMaterialId: parsed.data.candidateMaterialId, method, status })
      return { id, materialId, candidateMaterialId: parsed.data.candidateMaterialId, method, metricVersion: 'tanimoto/1', indexVersion: parsed.data.indexVersion, status, score: score ?? null, reasonCode: score === undefined ? 'VERIFIED_FINGERPRINT_REQUIRED' : null }
    })
  }

  async recordOdorPredictionNotEvaluated(context: PlatformContext, materialId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.requireView(context)
    const parsed = odorPredictionRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Select a model version and bounded research task.', 422)
    return this.idempotent(context, 'olfactory-intelligence.odor-prediction.request', idempotencyKey, { materialId, ...parsed.data }, async (tx) => {
      await this.material(tx, context, materialId)
      const model = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_model_versions WHERE id = ${parsed.data.modelVersionId} AND organization_id = ${context.organizationId}`
      if (!model[0]) throw new PlatformError('MODEL_VERSION_NOT_FOUND', 'The requested model version is not available in this workspace.', 404)
      const inputHash = digest({ materialId, modelVersionId: parsed.data.modelVersionId, task: parsed.data.requestedTask })
      const id = identifier('prediction')
      const persisted = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_olfactory_predictions (id, organization_id, material_id, model_version_id, requested_task, input_hash, output, uncertainty, evidence_status, reason_code, created_by) VALUES (${id}, ${context.organizationId}, ${materialId}, ${parsed.data.modelVersionId}, ${parsed.data.requestedTask}, ${inputHash}, ${JSON.stringify({ reason: 'No reviewed odor-labelled dataset and calibrated serving model are registered.' })}::jsonb, NULL, 'NOT_EVALUATED', 'ODOR_MODEL_NOT_EVALUATED', ${context.userId}) ON CONFLICT (organization_id, material_id, model_version_id, requested_task, input_hash) DO UPDATE SET input_hash = EXCLUDED.input_hash RETURNING id`
      const persistedId = persisted[0]?.id
      if (!persistedId) throw new PlatformError('PREDICTION_WRITE_FAILED', 'The odor prediction request could not be recorded.', 409)
      await this.audit(tx, context, 'olfactory_intelligence.odor_prediction.request', 'blocked', 'olfactory_prediction', persistedId, { materialId, modelVersionId: parsed.data.modelVersionId, reason: 'ODOR_MODEL_NOT_EVALUATED' })
      return { id: persistedId, materialId, modelVersionId: parsed.data.modelVersionId, status: 'NOT_EVALUATED', code: 'ODOR_MODEL_NOT_EVALUATED', message: 'No reviewed odor-labelled dataset and calibrated serving model are registered.' }
    })
  }

  async explain(context: PlatformContext, materialId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.requireView(context)
    const parsed = explainabilityRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Choose a supported feature evidence source and task.', 422)
    return this.idempotent(context, 'olfactory-intelligence.explain.request', idempotencyKey, { materialId, ...parsed.data }, async (tx) => {
      await this.material(tx, context, materialId)
      if (parsed.data.modelVersionId) {
        const model = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_model_versions WHERE id = ${parsed.data.modelVersionId} AND organization_id = ${context.organizationId}`
        if (!model[0]) throw new PlatformError('MODEL_VERSION_NOT_FOUND', 'The requested model version is not available in this workspace.', 404)
      }
      const artifact = await this.latestArtifact(tx, context, materialId, parsed.data.featureKind)
      const usable = artifact?.evidenceStatus === 'VERIFIED'
      const id = identifier('explain')
      await tx.$executeRaw`INSERT INTO v2_explainability_records (id, organization_id, material_id, model_version_id, feature_kind, requested_task, association, evidence_status, reason_code, disclaimer, created_by) VALUES (${id}, ${context.organizationId}, ${materialId}, ${parsed.data.modelVersionId ?? null}, ${parsed.data.featureKind}, ${parsed.data.requestedTask}, ${usable ? JSON.stringify({ sourceArtifactHash: artifact!.contentHash, source: parsed.data.featureKind }) : null}::jsonb, ${usable ? 'VERIFIED' : 'NOT_EVALUATED'}, ${usable ? null : 'FEATURE_EVIDENCE_NOT_EVALUATED'}, 'Association is not causal proof.', ${context.userId})`
      await this.audit(tx, context, 'olfactory_intelligence.explain.request', usable ? 'allowed' : 'blocked', 'explainability_record', id, { materialId, featureKind: parsed.data.featureKind, status: usable ? 'VERIFIED' : 'NOT_EVALUATED' })
      return { id, materialId, status: usable ? 'VERIFIED' : 'NOT_EVALUATED', featureKind: parsed.data.featureKind, disclaimer: 'Association is not causal proof.', reasonCode: usable ? null : 'FEATURE_EVIDENCE_NOT_EVALUATED' }
    })
  }
}
