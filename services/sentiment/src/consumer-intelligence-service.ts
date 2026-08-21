import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { analyzeTransientFeedbackRequestSchema, createFeedbackSourceRequestSchema, createPreferenceVectorRequestSchema, ingestFeedbackRequestSchema, invalidateFeedbackSourceRequestSchema, recordSentimentAnalysisRequestSchema } from '../../../packages/contracts/src/consumer-intelligence.js'
import { analyzeConsentedFeedback } from './deterministic-analyzer.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'

type Transaction = Prisma.TransactionClient
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type SourceRow = { id: string; sourceScope: string; consentRequired: boolean; retentionDays: number; status: string }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as JsonRecord).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  return JSON.stringify(value)
}
function digest(value: unknown) { return createHash('sha256').update(stableJson(value)).digest('hex') }
function identifier(prefix: string) { return `${prefix}_${randomUUID().replaceAll('-', '')}` }
function expiry(collectedAt: Date, retentionDays: number) { return new Date(collectedAt.getTime() + retentionDays * 86_400_000) }

/**
 * Consumer intelligence stores consented references and bounded derived signals.
 * It never reads, returns, or trains on the raw feedback payload in this phase.
 */
export class ConsumerIntelligenceService {
  constructor(private readonly client: PrismaClient, private readonly platform: PlatformService) {}

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`
      return action(tx)
    })
  }

  private async idempotent<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown, action: (tx: Transaction) => Promise<T>) {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const current = await tx.$queryRaw<IdempotencyRow[]>`SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}`
      if (current[0]) {
        if (current[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
        if (!current[0].response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
        return current[0].response as T
      }
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash) VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash}) ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING RETURNING id`
      if (!inserted[0]) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
      const result = await action(tx)
      await tx.$executeRaw`UPDATE v2_operation_idempotency SET response = ${JSON.stringify(result)}::jsonb WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}`
      return result
    })
  }

  private async audit(tx: Transaction, context: PlatformContext, action: string, outcome: 'allowed' | 'blocked', subjectType: string, subjectId: string, value: unknown) {
    await tx.$executeRaw`INSERT INTO v2_audit_events (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id, payload_hash) VALUES (${identifier('audit')}, ${context.organizationId}, ${context.userId}, ${action}, ${outcome}, ${subjectType}, ${subjectId}, ${identifier('corr')}, ${digest(value)})`
  }

  private async source(tx: Transaction, context: PlatformContext, sourceId: string): Promise<SourceRow> {
    const rows = await tx.$queryRaw<SourceRow[]>`SELECT id, source_scope AS "sourceScope", consent_required AS "consentRequired", retention_days AS "retentionDays", status FROM v2_feedback_sources WHERE id = ${sourceId} AND organization_id = ${context.organizationId}`
    if (!rows[0]) throw new PlatformError('FEEDBACK_SOURCE_NOT_FOUND', 'The feedback source is not available in this workspace.', 404)
    return rows[0]
  }

  async createSource(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'sentiment.manageSources')
    const parsed = createFeedbackSourceRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a bounded feedback source, policy and private storage reference.', 422)
    return this.idempotent(context, 'consumer-intelligence.sources.create', key, parsed.data, async (tx) => {
      const id = identifier('feedback_source')
      try {
        await tx.$executeRaw`INSERT INTO v2_feedback_sources (id, organization_id, source_key, source_type, source_scope, storage_ref, purpose, consent_required, retention_days, created_by) VALUES (${id}, ${context.organizationId}, ${parsed.data.key}, ${parsed.data.type}, ${parsed.data.sourceScope}, ${parsed.data.storageRef}, ${parsed.data.purpose}, ${parsed.data.consentRequired}, ${parsed.data.retentionDays}, ${context.userId})`
      } catch { throw new PlatformError('FEEDBACK_SOURCE_CONFLICT', 'A feedback source already uses this key in the current workspace.', 409) }
      await this.audit(tx, context, 'consumer_intelligence.source.create', 'allowed', 'feedback_source', id, { key: parsed.data.key, type: parsed.data.type, sourceScope: parsed.data.sourceScope })
      return { id, key: parsed.data.key, sourceScope: parsed.data.sourceScope, status: 'ACTIVE' }
    })
  }

  async ingestFeedback(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'sentiment.analyze')
    const parsed = ingestFeedbackRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide only hashed feedback identifiers and a private content reference.', 422)
    return this.idempotent(context, 'consumer-intelligence.feedback.ingest', key, parsed.data, async (tx) => {
      const source = await this.source(tx, context, parsed.data.sourceId)
      if (source.status !== 'ACTIVE') throw new PlatformError('FEEDBACK_SOURCE_UNAVAILABLE', 'Feedback can only be recorded against an active source.', 409)
      if (source.consentRequired && !parsed.data.consentProofHash) throw new PlatformError('CONSENT_REQUIRED', 'A consent proof hash is required for this feedback source.', 409)
      const collectedAt = new Date(parsed.data.collectedAt)
      const id = identifier('feedback')
      const existing = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_feedback_items (id, organization_id, source_id, external_ref_hash, content_hash, private_content_ref, consent_proof_hash, language_hint, collected_at, expires_at, created_by) VALUES (${id}, ${context.organizationId}, ${source.id}, ${parsed.data.externalRefHash}, ${parsed.data.contentHash}, ${parsed.data.privateContentRef}, ${parsed.data.consentProofHash ?? null}, ${parsed.data.languageHint}, ${collectedAt}, ${expiry(collectedAt, source.retentionDays)}, ${context.userId}) ON CONFLICT (organization_id, source_id, external_ref_hash) DO UPDATE SET external_ref_hash = EXCLUDED.external_ref_hash RETURNING id`
      const persistedId = existing[0]?.id
      if (!persistedId) throw new PlatformError('FEEDBACK_WRITE_FAILED', 'The feedback reference could not be recorded.', 409)
      await this.audit(tx, context, 'consumer_intelligence.feedback.ingest', 'allowed', 'feedback_item', persistedId, { sourceId: source.id, contentHash: parsed.data.contentHash })
      return { id: persistedId, sourceId: source.id, status: 'RECORDED', rawContentStored: false }
    })
  }

  async recordAnalysis(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'sentiment.analyze')
    const parsed = recordSentimentAnalysisRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide bounded, structured analysis signals with an explicit evidence state.', 422)
    return this.idempotent(context, 'consumer-intelligence.analysis.record', key, parsed.data, async (tx) => {
      const item = await tx.$queryRaw<Array<{ id: string; sourceStatus: string }>>`SELECT fi.id, fs.status AS "sourceStatus" FROM v2_feedback_items fi JOIN v2_feedback_sources fs ON fs.id = fi.source_id AND fs.organization_id = fi.organization_id WHERE fi.id = ${parsed.data.feedbackItemId} AND fi.organization_id = ${context.organizationId}`
      if (!item[0]) throw new PlatformError('FEEDBACK_ITEM_NOT_FOUND', 'The feedback item is not available in this workspace.', 404)
      if (item[0].sourceStatus !== 'ACTIVE') throw new PlatformError('FEEDBACK_SOURCE_UNAVAILABLE', 'Analysis cannot be recorded against an inactive source.', 409)
      const id = identifier('sentiment')
      const saved = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_sentiment_analyses (id, organization_id, feedback_item_id, extraction_version, provider, model_version, language, language_confidence, overall, aspect_signals, perception_signals, descriptor_signals, evidence_status, created_by) VALUES (${id}, ${context.organizationId}, ${parsed.data.feedbackItemId}, ${parsed.data.extractionVersion}, ${parsed.data.provider}, ${parsed.data.modelVersion}, ${parsed.data.language}, ${parsed.data.languageConfidence}, ${JSON.stringify(parsed.data.overall)}::jsonb, ${JSON.stringify(parsed.data.aspects)}::jsonb, ${JSON.stringify(parsed.data.perceptions)}::jsonb, ${JSON.stringify(parsed.data.descriptors)}::jsonb, ${parsed.data.evidenceStatus}, ${context.userId}) ON CONFLICT (organization_id, feedback_item_id, extraction_version) DO UPDATE SET extraction_version = EXCLUDED.extraction_version RETURNING id`
      const persistedId = saved[0]?.id
      if (!persistedId) throw new PlatformError('ANALYSIS_WRITE_FAILED', 'The sentiment analysis could not be recorded.', 409)
      await this.audit(tx, context, 'consumer_intelligence.analysis.record', 'allowed', 'sentiment_analysis', persistedId, { feedbackItemId: parsed.data.feedbackItemId, extractionVersion: parsed.data.extractionVersion, evidenceStatus: parsed.data.evidenceStatus })
      return { id: persistedId, feedbackItemId: parsed.data.feedbackItemId, evidenceStatus: parsed.data.evidenceStatus, rawContentReturned: false }
    })
  }

  async analyzeTransientFeedback(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'sentiment.analyze')
    const parsed = analyzeTransientFeedbackRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide one bounded feedback item and consented text for transient analysis.', 422)
    const analysis = analyzeConsentedFeedback(parsed.data.rawText)
    // The idempotency record stores only a digest of this request; no raw text
    // crosses the persistence boundary below.
    return this.idempotent(context, 'consumer-intelligence.analysis.transient', key, { feedbackItemId: parsed.data.feedbackItemId, rawTextHash: digest(parsed.data.rawText) }, async (tx) => {
      const item = await tx.$queryRaw<Array<{ id: string; sourceStatus: string }>>`SELECT fi.id, fs.status AS "sourceStatus" FROM v2_feedback_items fi JOIN v2_feedback_sources fs ON fs.id = fi.source_id AND fs.organization_id = fi.organization_id WHERE fi.id = ${parsed.data.feedbackItemId} AND fi.organization_id = ${context.organizationId}`
      if (!item[0]) throw new PlatformError('FEEDBACK_ITEM_NOT_FOUND', 'The feedback item is not available in this workspace.', 404)
      if (item[0].sourceStatus !== 'ACTIVE') throw new PlatformError('FEEDBACK_SOURCE_UNAVAILABLE', 'Analysis cannot be recorded against an inactive source.', 409)
      const extractionVersion = 'deterministic-en-vi-v1'
      const id = identifier('sentiment')
      const saved = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_sentiment_analyses (id, organization_id, feedback_item_id, extraction_version, provider, model_version, language, language_confidence, overall, aspect_signals, perception_signals, descriptor_signals, evidence_status, created_by) VALUES (${id}, ${context.organizationId}, ${parsed.data.feedbackItemId}, ${extractionVersion}, 'deterministic-local', 'deterministic-en-vi-v1', ${analysis.language}, ${analysis.languageConfidence}, ${JSON.stringify(analysis.overall)}::jsonb, ${JSON.stringify(analysis.aspects)}::jsonb, ${JSON.stringify(analysis.perceptions)}::jsonb, ${JSON.stringify(analysis.descriptors)}::jsonb, ${analysis.evidenceStatus}, ${context.userId}) ON CONFLICT (organization_id, feedback_item_id, extraction_version) DO UPDATE SET language = EXCLUDED.language, language_confidence = EXCLUDED.language_confidence, overall = EXCLUDED.overall, aspect_signals = EXCLUDED.aspect_signals, perception_signals = EXCLUDED.perception_signals, descriptor_signals = EXCLUDED.descriptor_signals, evidence_status = EXCLUDED.evidence_status RETURNING id`
      const persistedId = saved[0]?.id
      if (!persistedId) throw new PlatformError('ANALYSIS_WRITE_FAILED', 'The feedback analysis could not be recorded.', 409)
      await this.audit(tx, context, 'consumer_intelligence.analysis.transient', 'allowed', 'sentiment_analysis', persistedId, { feedbackItemId: parsed.data.feedbackItemId, rawTextHash: digest(parsed.data.rawText), extractionVersion, evidenceStatus: analysis.evidenceStatus })
      return { id: persistedId, feedbackItemId: parsed.data.feedbackItemId, evidenceStatus: analysis.evidenceStatus, provider: 'deterministic-local', rawContentStored: false }
    })
  }

  async createPreferenceVector(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'sentiment.analyze')
    const parsed = createPreferenceVectorRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Select bounded active sources and a valid aggregation window.', 422)
    return this.idempotent(context, 'consumer-intelligence.preference.aggregate', key, parsed.data, async (tx) => {
      const sources = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_feedback_sources WHERE organization_id = ${context.organizationId} AND source_scope = ${parsed.data.sourceScope} AND status = 'ACTIVE' AND id IN (${Prisma.join(parsed.data.sourceIds)})`
      if (sources.length !== parsed.data.sourceIds.length) throw new PlatformError('PREFERENCE_SOURCE_UNAVAILABLE', 'Every selected source must be active and within the requested scope.', 409)
      const rows = await tx.$queryRaw<Array<{ descriptors: unknown; overall: unknown }>>`SELECT sa.descriptor_signals AS descriptors, sa.overall FROM v2_sentiment_analyses sa JOIN v2_feedback_items fi ON fi.id = sa.feedback_item_id AND fi.organization_id = sa.organization_id WHERE sa.organization_id = ${context.organizationId} AND fi.source_id IN (${Prisma.join(parsed.data.sourceIds)}) AND sa.evidence_status IN ('VERIFIED','LOW_CONFIDENCE')`
      const totals = new Map<string, { sum: number; count: number }>()
      for (const row of rows) {
        const score = typeof (row.overall as JsonRecord)?.score === 'number' ? (row.overall as JsonRecord).score as number : 0
        if (!Array.isArray(row.descriptors)) continue
        for (const signal of row.descriptors as JsonRecord[]) {
          if (typeof signal.id !== 'string' || typeof signal.value !== 'number') continue
          const current = totals.get(signal.id) ?? { sum: 0, count: 0 }
          current.sum += Math.max(-1, Math.min(1, signal.value * score)); current.count += 1; totals.set(signal.id, current)
        }
      }
      const dimensions = Object.fromEntries([...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => [name, Number((value.sum / value.count).toFixed(6))]))
      const evidenceStatus = rows.length < 3 ? 'NOT_ENOUGH_EVIDENCE' : 'VERIFIED'
      const id = identifier('preference')
      const sourceSetHash = digest(parsed.data.sourceIds)
      const saved = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_consumer_preference_vectors (id, organization_id, source_scope, source_ids, source_set_hash, window_start, window_end, vocabulary_version, dimensions, evidence_count, evidence_status, aggregation_version, created_by) VALUES (${id}, ${context.organizationId}, ${parsed.data.sourceScope}, ${JSON.stringify(parsed.data.sourceIds)}::jsonb, ${sourceSetHash}, ${parsed.data.windowStart ?? null}, ${parsed.data.windowEnd ?? null}, ${parsed.data.vocabularyVersion}, ${JSON.stringify(dimensions)}::jsonb, ${rows.length}, ${evidenceStatus}, ${parsed.data.aggregationVersion}, ${context.userId}) ON CONFLICT (organization_id, source_scope, source_set_hash, vocabulary_version, aggregation_version) DO UPDATE SET source_set_hash = EXCLUDED.source_set_hash RETURNING id`
      const persistedId = saved[0]?.id
      if (!persistedId) throw new PlatformError('PREFERENCE_WRITE_FAILED', 'The preference vector could not be recorded.', 409)
      await this.audit(tx, context, 'consumer_intelligence.preference.aggregate', 'allowed', 'consumer_preference_vector', persistedId, { sourceScope: parsed.data.sourceScope, sourceSetHash, evidenceCount: rows.length, evidenceStatus })
      return { id: persistedId, sourceScope: parsed.data.sourceScope, evidenceCount: rows.length, evidenceStatus, dimensions }
    })
  }

  async invalidateSource(context: PlatformContext, sourceId: string, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'sentiment.manageSources')
    const parsed = invalidateFeedbackSourceRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a bounded invalidation reason.', 422)
    return this.idempotent(context, 'consumer-intelligence.sources.invalidate', key, { sourceId, ...parsed.data }, async (tx) => {
      await this.source(tx, context, sourceId)
      await tx.$executeRaw`UPDATE v2_feedback_sources SET status = 'INVALIDATED', invalidated_at = now() WHERE id = ${sourceId} AND organization_id = ${context.organizationId}`
      const analyses = await tx.$executeRaw`UPDATE v2_sentiment_analyses SET evidence_status = 'INVALIDATED' WHERE organization_id = ${context.organizationId} AND feedback_item_id IN (SELECT id FROM v2_feedback_items WHERE organization_id = ${context.organizationId} AND source_id = ${sourceId})`
      const vectors = await tx.$executeRaw`UPDATE v2_consumer_preference_vectors SET evidence_status = 'INVALIDATED' WHERE organization_id = ${context.organizationId} AND source_ids ? ${sourceId}`
      await tx.$executeRaw`INSERT INTO v2_sentiment_invalidations (id, organization_id, source_id, reason_code, created_by) VALUES (${identifier('invalidate')}, ${context.organizationId}, ${sourceId}, ${parsed.data.reasonCode}, ${context.userId}) ON CONFLICT (organization_id, source_id, reason_code) DO NOTHING`
      await this.audit(tx, context, 'consumer_intelligence.source.invalidate', 'allowed', 'feedback_source', sourceId, { reasonCode: parsed.data.reasonCode })
      return { sourceId, status: 'INVALIDATED', analysisCount: Number(analyses), vectorCount: Number(vectors) }
    })
  }

  async latestPreference(context: PlatformContext, sourceScope: string) {
    await this.platform.requirePermission(context, 'sentiment.view')
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; sourceScope: string; dimensions: unknown; evidenceCount: number; evidenceStatus: string; vocabularyVersion: string; aggregationVersion: string }>>`SELECT id, source_scope AS "sourceScope", dimensions, evidence_count AS "evidenceCount", evidence_status AS "evidenceStatus", vocabulary_version AS "vocabularyVersion", aggregation_version AS "aggregationVersion" FROM v2_consumer_preference_vectors WHERE organization_id = ${context.organizationId} AND source_scope = ${sourceScope} AND evidence_status <> 'INVALIDATED' ORDER BY created_at DESC LIMIT 1`
      return rows[0] ?? { status: 'NOT_ENOUGH_EVIDENCE', sourceScope, evidenceCount: 0, dimensions: {} }
    })
  }
}
