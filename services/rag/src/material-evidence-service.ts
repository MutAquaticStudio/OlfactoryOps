import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { materialEvidenceIndexRequestSchema, materialEvidenceQueryRequestSchema, type MaterialEvidenceCitation } from '../../../packages/contracts/src/material-evidence.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'

type Transaction = Prisma.TransactionClient
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
const identifier = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`
const stableJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(stableJson).join(',')}]` : value && typeof value === 'object' ? `{${Object.entries(value as JsonRecord).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}` : JSON.stringify(value)
const digest = (value: unknown) => createHash('sha256').update(stableJson(value)).digest('hex')
const tokens = (value: string) => [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(0, 24)

/** Evidence-only retrieval. It indexes reviewed, tenant-scoped material sources;
 * it never sends a document to a browser, model provider, or arbitrary URL. */
export class MaterialEvidenceService {
  constructor(private readonly client: PrismaClient, private readonly platform: PlatformService) {}

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`; return action(tx) })
  }
  private async audit(tx: Transaction, context: PlatformContext, action: string, outcome: 'allowed' | 'blocked', subject: string, value: unknown) {
    await tx.$executeRaw`INSERT INTO v2_audit_events (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id, payload_hash) VALUES (${identifier('audit')}, ${context.organizationId}, ${context.userId}, ${action}, ${outcome}, 'material_evidence', ${subject}, ${identifier('corr')}, ${digest(value)})`
  }
  private async idempotent<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown, action: (tx: Transaction) => Promise<T>) {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const existing = await tx.$queryRaw<IdempotencyRow[]>`SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}`
      if (existing[0]) { if (existing[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409); if (!existing[0].response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409); return existing[0].response as T }
      const claim = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash) VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash}) ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING RETURNING id`
      if (!claim[0]) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
      const result = await action(tx)
      await tx.$executeRaw`UPDATE v2_operation_idempotency SET response = ${JSON.stringify(result)}::jsonb WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}`
      return result
    })
  }

  async index(context: PlatformContext, rawInput: unknown, key?: string) {
    await this.platform.requirePermission(context, 'rag.index')
    const parsed = materialEvidenceIndexRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide bounded reviewed material evidence.', 422)
    return this.idempotent(context, 'rag.material-evidence.index', key, parsed.data, async (tx) => {
      const material = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_materials WHERE organization_id = ${context.organizationId} AND id = ${parsed.data.materialId} AND status = 'ACTIVE'`
      if (!material[0]) throw new PlatformError('MATERIAL_NOT_FOUND', 'Evidence may only be indexed for an active material in this workspace.', 404)
      if (parsed.data.sourceKind === 'DOCUMENT') {
        const document = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM v2_material_documents WHERE organization_id = ${context.organizationId} AND material_id = ${parsed.data.materialId} AND object_ref = ${parsed.data.sourceRef} AND status = 'APPROVED'`
        if (!document[0]) throw new PlatformError('RAG_SOURCE_NOT_APPROVED', 'Only an approved material document may be indexed.', 409)
      }
      const source = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO v2_material_evidence_sources (id, organization_id, material_id, source_kind, source_ref, version, status, content_hash) VALUES (${identifier('evidence')}, ${context.organizationId}, ${parsed.data.materialId}, ${parsed.data.sourceKind}, ${parsed.data.sourceRef}, ${parsed.data.version}, 'APPROVED', ${parsed.data.contentHash}) ON CONFLICT (organization_id, material_id, source_kind, source_ref, version) DO UPDATE SET content_hash = EXCLUDED.content_hash, status = 'APPROVED' RETURNING id`
      const sourceId = source[0]!.id
      await tx.$executeRaw`DELETE FROM v2_material_evidence_chunks WHERE organization_id = ${context.organizationId} AND source_id = ${sourceId}`
      for (const [ordinal, value] of parsed.data.excerpts.entries()) await tx.$executeRaw`INSERT INTO v2_material_evidence_chunks (id, organization_id, source_id, ordinal, excerpt, excerpt_hash) VALUES (${identifier('chunk')}, ${context.organizationId}, ${sourceId}, ${ordinal}, ${value}, ${digest(value)})`
      await this.audit(tx, context, 'rag.material_evidence.index', 'allowed', sourceId, { materialId: parsed.data.materialId, sourceKind: parsed.data.sourceKind, contentHash: parsed.data.contentHash, excerptCount: parsed.data.excerpts.length })
      return { sourceId, materialId: parsed.data.materialId, status: 'APPROVED', excerptCount: parsed.data.excerpts.length }
    })
  }

  async retrieve(context: PlatformContext, rawInput: unknown) {
    await this.platform.requirePermission(context, 'rag.view'); await this.platform.requirePermission(context, 'materials.view')
    const parsed = materialEvidenceQueryRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a material and a bounded evidence query.', 422)
    const queryTokens = tokens(parsed.data.query)
    if (!queryTokens.length) throw new PlatformError('INVALID_INPUT', 'The evidence query must contain searchable terms.', 422)
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ sourceId: string; sourceKind: MaterialEvidenceCitation['sourceKind']; sourceRef: string; version: string; excerpt: string; excerptHash: string }>>`
        SELECT s.id AS "sourceId", s.source_kind AS "sourceKind", s.source_ref AS "sourceRef", s.version, c.excerpt, c.excerpt_hash AS "excerptHash"
        FROM v2_material_evidence_sources s JOIN v2_material_evidence_chunks c ON c.organization_id = s.organization_id AND c.source_id = s.id
        WHERE s.organization_id = ${context.organizationId} AND s.material_id = ${parsed.data.materialId} AND s.status = 'APPROVED'
      `
      const citations = rows.map((row) => ({ ...row, relevance: queryTokens.reduce((score, token) => score + (row.excerpt.toLocaleLowerCase().includes(token) ? 1 : 0), 0) / queryTokens.length })).filter((row) => row.relevance > 0).sort((a, b) => b.relevance - a.relevance || a.sourceId.localeCompare(b.sourceId)).slice(0, parsed.data.limit)
      await this.audit(tx, context, 'rag.material_evidence.retrieve', 'allowed', parsed.data.materialId, { queryHash: digest(parsed.data.query), resultCount: citations.length })
      return { materialId: parsed.data.materialId, evidenceStatus: citations.length ? 'VERIFIED' : 'NOT_ENOUGH_EVIDENCE', citations }
    })
  }
}
