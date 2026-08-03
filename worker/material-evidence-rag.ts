import { z } from 'zod'
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '../server/src/shared/http-error.js'
import { isLluchCatalogueMasterMaterial, lluchCatalogueGlobalMasterMaterialById, lluchCatalogueGlobalMasterMaterials } from '../src/data/lluch-catalogue-2026.js'
import type { DocumentRecord, Material } from '../src/data/northStar.js'
import type { AgentActor } from './agent-runtime.js'
import { auditFormulaIntelligence } from './formula-intelligence.js'

export const MATERIAL_EVIDENCE_EMBEDDING_MODEL = '@cf/baai/bge-m3'
export const MATERIAL_EVIDENCE_EMBEDDING_DIMENSIONS = 1024
export const MATERIAL_EVIDENCE_INDEX_VERSION = 2
const MAX_EXCERPT_CHARS = 700
const MAX_REVIEW_TEXT_CHARS = 100_000
const MAX_QUERY_CHARS = 320
const MAX_CHUNK_CHARS = 1_200
const MAX_CHUNKS_PER_SOURCE = 48
const JOB_LEASE_MS = 90_000
const RETRY_BACKOFF_MS = [30_000, 120_000]
const GLOBAL_MASTER_QUEUE_LIMIT = 48
const GLOBAL_MASTER_SCAN_LIMIT = 96
const GLOBAL_MASTER_CURSOR_KEY = 'material_evidence.global_master.cursor.v2'
export const GLOBAL_LIBRARY_ORGANIZATION_ID = 'org-nxl'

export function materialEvidenceQueryScopes(
  actorOrganizationId: string,
  sourceKinds: Array<'MATERIAL' | 'DOCUMENT'>,
) {
  const scopes: Array<{ organizationId: string; sourceKinds: Array<'MATERIAL' | 'DOCUMENT'> }> = [
    { organizationId: actorOrganizationId, sourceKinds },
  ]
  if (actorOrganizationId !== GLOBAL_LIBRARY_ORGANIZATION_ID && sourceKinds.includes('MATERIAL')) {
    scopes.push({ organizationId: GLOBAL_LIBRARY_ORGANIZATION_ID, sourceKinds: ['MATERIAL'] })
  }
  return scopes
}

export type RagAiBinding = {
  run<T = { data: number[][] }>(model: string, input: unknown): Promise<T>
  toMarkdown?(input: { name: string; blob: Blob }, options?: Record<string, unknown>): Promise<{ format: string; data: string; error?: string }>
}

export type RagVectorIndex = {
  upsert(vectors: Array<{ id: string; values: number[]; metadata: Record<string, string | number | boolean> }>): Promise<unknown>
  query(vector: number[], options: { topK: number; filter: Record<string, unknown>; returnMetadata?: 'all' }): Promise<{ matches: Array<{ id: string; score: number }> }>
  deleteByIds(ids: string[]): Promise<unknown>
}

export type MaterialEvidenceEnv = {
  DB: D1Database
  DOCUMENTS?: KVNamespace
  AI?: RagAiBinding
  RAG_INDEX?: RagVectorIndex
}

export type MaterialEvidenceActor = Pick<AgentActor, 'organizationId' | 'userId'> & {
  permissions: string[]
}

type EvidenceDocumentRow = {
  id: string
  organization_id: string
  source_kind: 'MATERIAL' | 'DOCUMENT'
  material_id: string | null
  document_id: string | null
  source_title: string
  source_version: string
  content_hash: string
  approval_status: string
  extraction_status: EvidenceState
  extracted_text: string | null
  reviewed_text: string | null
  index_version: number
}

type EvidenceChunkRow = {
  id: string
  evidence_document_id: string
  vector_id: string
  chunk_index: number
  page_number: number | null
  section_label: string | null
  excerpt: string
  source_title: string
  source_version: string
  source_kind: 'MATERIAL' | 'DOCUMENT'
  material_id: string | null
  document_id: string | null
  content_hash: string
}

export type EvidenceState = 'QUEUED' | 'EXTRACTED' | 'REVIEW_REQUIRED' | 'READY' | 'NOT_INDEXED' | 'NOT_CONFIGURED' | 'FAILED' | 'INVALIDATED'
export type EvidencePublicState = 'READY' | 'NOT_INDEXED' | 'NOT_CONFIGURED' | 'NOT_EVALUATED'

export type EvidenceCitation = {
  citationId: string
  sourceKind: 'material' | 'document'
  materialId?: string
  title: string
  version: string
  page?: number
  section?: string
  excerpt: string
  score: number
}

export type EvidenceQueryResult = {
  state: EvidencePublicState
  citations: EvidenceCitation[]
  indexedSourceCount: number
}

export type EvidenceSource = {
  sourceKind: 'material' | 'document'
  documentId?: string
  title: string
  version: string
  state: EvidenceState
  updatedAt: string
}

export type EvidenceReviewSource = {
  documentId: string
  title: string
  version: string
  state: EvidenceState
  extractedText: string
}

export const materialEvidenceQuerySchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_CHARS),
  materialIds: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
  documentIds: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
  sourceKinds: z.array(z.enum(['MATERIAL', 'DOCUMENT'])).min(1).max(2).optional(),
  topK: z.number().int().min(1).max(8).optional(),
})

export const materialEvidenceReviewSchema = z.object({
  reviewedText: z.string().trim().min(1).max(MAX_REVIEW_TEXT_CHARS),
  idempotencyKey: z.string().trim().min(8).max(240),
})

function now() {
  return new Date().toISOString()
}

function uuid() {
  return crypto.randomUUID()
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function safeEvidenceExcerpt(value: string, maxLength = MAX_EXCERPT_CHARS) {
  const compact = compactText(value)
  return compact.length <= maxLength ? compact : `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function chunkEvidenceText(value: string, maxChunkChars = MAX_CHUNK_CHARS, overlapChars = 140) {
  const text = compactText(value)
  if (!text) return []
  const chunks: string[] = []
  let offset = 0
  while (offset < text.length && chunks.length < MAX_CHUNKS_PER_SOURCE) {
    const ceiling = Math.min(text.length, offset + maxChunkChars)
    let end = ceiling
    if (ceiling < text.length) {
      const boundary = Math.max(text.lastIndexOf('. ', ceiling), text.lastIndexOf('; ', ceiling), text.lastIndexOf(' ', ceiling))
      if (boundary > offset + Math.floor(maxChunkChars * 0.55)) end = boundary + 1
    }
    const chunk = text.slice(offset, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= text.length) break
    offset = Math.max(end - overlapChars, offset + 1)
  }
  return chunks
}

export function isEligibleEvidenceDocument(document: Pick<DocumentRecord, 'type' | 'status' | 'scanStatus' | 'tags'>) {
  const approved = document.status === 'APPROVED' || document.status === 'SHARED'
  const scanClean = document.scanStatus === 'CLEAN' || document.scanStatus === 'NOT_REQUIRED'
  const catalogue = document.tags?.some((tag) => ['catalogue', 'supplier-catalogue'].includes(tag.trim().toLowerCase())) ?? false
  const supportedType = document.type === 'SDS' || document.type === 'CoA' || document.type === 'IFRA' || document.type === 'Allergen Declaration'
  return approved && scanClean && (supportedType || catalogue)
}

export function isCurrentEvidenceDocument(
  document: Pick<DocumentRecord, 'type' | 'status' | 'scanStatus' | 'tags' | 'checksum' | 'version'>,
  sourceVersion: string,
  contentHash: string,
) {
  return isEligibleEvidenceDocument(document) && document.checksum === contentHash && document.version === sourceVersion
}

export function materialEvidenceSourceVersion(material: Material) {
  const catalogueSource = material.catalogueSource
  if (catalogueSource?.status === 'MASTER_APPROVED' && isLluchCatalogueMasterMaterial(material)) {
    return [
      'catalogue-master',
      catalogueSource.catalogueVersion,
      material.olfactiveProfile?.version ?? 'supplier-declared',
    ].join(':')
  }
  return material.olfactiveProfile?.version ?? 'material-v1'
}

export function materialEvidenceText(material: Material) {
  const profile = material.olfactiveProfile
  const catalogue = material.supplierCatalogueReferences?.map((item) => `${item.supplier} ${item.productName} ${item.catalogue} ${item.catalogueVersion}`).join('; ') ?? ''
  const supplierEvidence = material.catalogueEvidence
  const density = supplierEvidence?.density
    ? [supplierEvidence.density.value, supplierEvidence.density.min, supplierEvidence.density.max].filter(Boolean).join(' to ')
    : ''
  return compactText([
    `Material: ${material.name}.`, `CAS: ${material.cas}.`, `Family: ${material.family}.`, `Note: ${material.tier}.`,
    `Odor: ${material.odor.join(', ')}.`,
    profile ? `Profile: ${profile.description}. Strength ${profile.strength}. Diffusion ${profile.diffusion}. Tenacity ${profile.tenacity}. Volatility ${profile.volatility}. Formula role ${profile.formulaRole}. Facets ${profile.facets.join(', ')}.` : '',
    catalogue ? `Supplier catalogue: ${catalogue}.` : '',
    supplierEvidence ? [
      `Supplier-declared chemical identity: ${supplierEvidence.chemicalIdentification ?? 'Not documented'}.`,
      `Supplier-declared use: ${supplierEvidence.declaredUse ?? 'Not documented'}.`,
      `Supplier-declared appearance: ${supplierEvidence.appearance ?? 'Not documented'}.`,
      `Supplier-declared density: ${density || 'Not documented'}.`,
      `Supplier evidence source: ${supplierEvidence.source} ${supplierEvidence.version}.`,
    ].join(' ') : '',
  ].filter(Boolean).join(' '))
}

function genericErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('binding') || message.includes('not configured')) return 'provider_not_configured'
  if (message.includes('timeout')) return 'provider_timeout'
  return 'indexing_failed'
}

function nextRetry(attempt: number) {
  const delay = RETRY_BACKOFF_MS[Math.min(Math.max(0, attempt - 1), RETRY_BACKOFF_MS.length - 1)]
  return new Date(Date.now() + delay).toISOString()
}

export class MaterialEvidenceRag {
  constructor(private readonly env: MaterialEvidenceEnv) {}

  get configured() {
    return Boolean(this.env.AI && this.env.RAG_INDEX)
  }

  private async audit(actor: MaterialEvidenceActor, action: string, entity: string, outcome = 'allowed') {
    await auditFormulaIntelligence(this.env.DB, { ...actor, sessionId: 'material-evidence', role: 'System' }, action, entity, outcome)
  }

  private async requireView(actor: MaterialEvidenceActor, entity: string) {
    if (actor.permissions.includes('documents.view') && actor.permissions.includes('materials.view')) return
    await this.audit(actor, 'material-evidence.access.denied', entity, 'denied')
    throw new ForbiddenException('Material evidence requires documents.view and materials.view')
  }

  private async requireManage(actor: MaterialEvidenceActor, entity: string) {
    if (actor.permissions.includes('documents.manage')) return
    await this.audit(actor, 'material-evidence.manage.denied', entity, 'denied')
    throw new ForbiddenException('Managing material evidence requires documents.manage')
  }

  private async documentForActor(actor: MaterialEvidenceActor, documentId: string) {
    const row = await this.env.DB.prepare(
      `SELECT id, organization_id, type, title, linked_to, version, sensitivity, status, issue_date, expires_at,
              last_accessed, downloads, storage_key, mime_type, size_kb, checksum, owner, generated_from,
              record_json, updated_at
       FROM document_records WHERE id = ? AND organization_id = ?`,
    ).bind(documentId, actor.organizationId).first<Record<string, unknown> & { record_json?: string | null }>()
    if (!row) throw new NotFoundException('Document not found')
    const record = parseJson<DocumentRecord>(row.record_json, {
      id: String(row.id), organizationId: String(row.organization_id), type: row.type as DocumentRecord['type'], title: String(row.title),
      linkedTo: String(row.linked_to), version: String(row.version), sensitivity: row.sensitivity as DocumentRecord['sensitivity'],
      status: row.status as DocumentRecord['status'], lastAccessed: String(row.last_accessed), downloads: Number(row.downloads),
      storageKey: String(row.storage_key), mimeType: String(row.mime_type), sizeKb: Number(row.size_kb), checksum: String(row.checksum), owner: String(row.owner),
    })
    return { ...record, id: String(row.id), organizationId: String(row.organization_id), checksum: String(row.checksum), storageKey: String(row.storage_key), mimeType: String(row.mime_type), title: String(row.title), version: String(row.version), linkedTo: String(row.linked_to), status: row.status as DocumentRecord['status'] }
  }

  private async materialForActor(actor: MaterialEvidenceActor, materialId: string) {
    const row = await this.env.DB.prepare(
      `SELECT id, library_scope, organization_id, record_json
       FROM material_records
       WHERE id = ? AND (library_scope = 'GLOBAL' OR organization_id = ?)`,
    ).bind(materialId, actor.organizationId).first<{ id: string; library_scope: 'GLOBAL' | 'TENANT'; organization_id: string | null; record_json: string }>()
    if (!row) {
      const master = lluchCatalogueGlobalMasterMaterialById(materialId)
      if (master) return master
      throw new NotFoundException('Material not found')
    }
    const material = parseJson<Material>(row.record_json, { id: row.id } as Material)
    return {
      ...material,
      id: row.id,
      libraryScope: row.library_scope,
      organizationId: row.library_scope === 'GLOBAL' ? undefined : row.organization_id ?? actor.organizationId,
    }
  }

  private evidenceOrganizationForMaterial(material: Pick<Material, 'libraryScope' | 'organizationId'>, actorOrganizationId: string) {
    return material.libraryScope === 'GLOBAL' ? GLOBAL_LIBRARY_ORGANIZATION_ID : material.organizationId ?? actorOrganizationId
  }

  private async enqueue(actor: MaterialEvidenceActor, evidenceDocumentId: string, action: 'EXTRACT' | 'INDEX' | 'INVALIDATE', idempotencyKey: string) {
    const stamp = now()
    const inputHash = await sha256(`${evidenceDocumentId}:${action}:${MATERIAL_EVIDENCE_INDEX_VERSION}`)
    const existing = await this.env.DB.prepare(
      `SELECT id, status, correlation_id FROM material_evidence_jobs
       WHERE organization_id = ? AND idempotency_key = ?`,
    ).bind(actor.organizationId, idempotencyKey).first<{ id: string; status: string; correlation_id: string }>()
    if (existing) return { jobId: existing.id, status: existing.status, correlationId: existing.correlation_id }
    const jobId = uuid()
    const correlationId = uuid()
    await this.env.DB.prepare(
      `INSERT INTO material_evidence_jobs (
        id, organization_id, evidence_document_id, action, status, input_hash, idempotency_key,
        available_at, correlation_id, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(jobId, actor.organizationId, evidenceDocumentId, action, inputHash, idempotencyKey, stamp, correlationId, actor.userId, stamp, stamp).run()
    return { jobId, status: 'QUEUED', correlationId }
  }

  async queueMaterial(actor: MaterialEvidenceActor, materialId: string, idempotencyKey: string) {
    await this.requireManage(actor, materialId)
    const material = await this.materialForActor(actor, materialId)
    if (material.libraryScope === 'GLOBAL' && actor.organizationId !== GLOBAL_LIBRARY_ORGANIZATION_ID) {
      await this.audit(actor, 'material-evidence.global.manage.denied', materialId, 'denied')
      throw new ForbiddenException('Only the internal material curator can index global material evidence')
    }
    const evidenceOrganizationId = this.evidenceOrganizationForMaterial(material, actor.organizationId)
    const evidenceActor = { ...actor, organizationId: evidenceOrganizationId }
    const text = materialEvidenceText(material)
    const hash = await sha256(text)
    const stamp = now()
    const sourceVersion = materialEvidenceSourceVersion(material)
    let evidence = await this.env.DB.prepare(
      `SELECT id FROM material_evidence_documents
       WHERE organization_id = ? AND source_kind = 'MATERIAL' AND material_id = ? AND source_version = ?`,
    ).bind(evidenceOrganizationId, material.id, sourceVersion).first<{ id: string }>()
    if (!evidence) {
      const id = uuid()
      await this.env.DB.prepare(
        `INSERT INTO material_evidence_documents (
          id, organization_id, source_kind, material_id, source_title, source_version, content_hash,
          approval_status, extraction_status, reviewed_text, index_version, created_at, updated_at
        ) VALUES (?, ?, 'MATERIAL', ?, ?, ?, ?, 'APPROVED', 'QUEUED', ?, ?, ?, ?)`,
      ).bind(id, evidenceOrganizationId, material.id, material.name, sourceVersion, hash, text, MATERIAL_EVIDENCE_INDEX_VERSION, stamp, stamp).run()
      evidence = { id }
    } else {
      await this.env.DB.prepare(
        `UPDATE material_evidence_documents
         SET source_title = ?, content_hash = ?, reviewed_text = ?, approval_status = 'APPROVED',
             extraction_status = 'QUEUED', error_code = NULL, index_version = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?`,
      ).bind(material.name, hash, text, MATERIAL_EVIDENCE_INDEX_VERSION, stamp, evidence.id, evidenceOrganizationId).run()
    }
    const job = await this.enqueue(evidenceActor, evidence.id, 'INDEX', idempotencyKey)
    await this.audit(actor, 'material-evidence.material.index.queued', material.id)
    return { evidenceDocumentId: evidence.id, ...job }
  }

  async queueDocumentExtraction(actor: MaterialEvidenceActor, documentId: string, idempotencyKey: string) {
    await this.requireManage(actor, documentId)
    const document = await this.documentForActor(actor, documentId)
    if (!isEligibleEvidenceDocument(document)) throw new UnprocessableEntityException('Only approved, clean SDS, CoA, IFRA, allergen, or catalogue documents can be indexed')
    const supersededJobs = document.supersedesDocumentId
      ? await this.invalidateDocument(actor, document.supersedesDocumentId, `${idempotencyKey}:superseded`)
      : []
    const stamp = now()
    const material = await this.env.DB.prepare(
      `SELECT id FROM material_records WHERE id = ? AND (library_scope = 'GLOBAL' OR organization_id = ?)`,
    ).bind(document.linkedTo, actor.organizationId).first<{ id: string }>()
    const sourceVersion = document.version || 'v1'
    let evidence = await this.env.DB.prepare(
      `SELECT id FROM material_evidence_documents
       WHERE organization_id = ? AND source_kind = 'DOCUMENT' AND document_id = ? AND source_version = ?`,
    ).bind(actor.organizationId, document.id, sourceVersion).first<{ id: string }>()
    if (!evidence) {
      const id = uuid()
      await this.env.DB.prepare(
        `INSERT INTO material_evidence_documents (
          id, organization_id, source_kind, material_id, document_id, source_title, source_version, content_hash,
          approval_status, extraction_status, index_version, created_at, updated_at
        ) VALUES (?, ?, 'DOCUMENT', ?, ?, ?, ?, ?, 'APPROVED', 'QUEUED', ?, ?, ?)`,
      ).bind(id, actor.organizationId, material?.id ?? null, document.id, document.title, sourceVersion, document.checksum, MATERIAL_EVIDENCE_INDEX_VERSION, stamp, stamp).run()
      evidence = { id }
    } else {
      await this.env.DB.prepare(
        `UPDATE material_evidence_documents
         SET material_id = ?, source_title = ?, content_hash = ?, approval_status = 'APPROVED',
             extraction_status = CASE WHEN reviewed_text IS NULL THEN 'QUEUED' ELSE 'QUEUED' END,
             error_code = NULL, index_version = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?`,
      ).bind(material?.id ?? null, document.title, document.checksum, MATERIAL_EVIDENCE_INDEX_VERSION, stamp, evidence.id, actor.organizationId).run()
    }
    const action = (await this.evidenceDocument(evidence.id, actor.organizationId))?.reviewed_text ? 'INDEX' : 'EXTRACT'
    const job = await this.enqueue(actor, evidence.id, action, idempotencyKey)
    await this.audit(actor, 'material-evidence.document.index.queued', document.id)
    return { evidenceDocumentId: evidence.id, supersededJobCount: supersededJobs.length, ...job }
  }

  async reviewDocument(actor: MaterialEvidenceActor, documentId: string, input: unknown) {
    await this.requireManage(actor, documentId)
    const payload = materialEvidenceReviewSchema.parse(input)
    const document = await this.documentForActor(actor, documentId)
    if (!isEligibleEvidenceDocument(document)) throw new UnprocessableEntityException('Document is not eligible for evidence indexing')
    const evidence = await this.env.DB.prepare(
      `SELECT id FROM material_evidence_documents
       WHERE organization_id = ? AND source_kind = 'DOCUMENT' AND document_id = ? AND source_version = ?`,
    ).bind(actor.organizationId, document.id, document.version || 'v1').first<{ id: string }>()
    if (!evidence) throw new NotFoundException('Extracted document is not available for review')
    const reviewedText = compactText(payload.reviewedText)
    await this.env.DB.prepare(
      `UPDATE material_evidence_documents
       SET reviewed_text = ?, extraction_status = 'QUEUED', reviewed_by_user_id = ?, reviewed_at = ?,
           error_code = NULL, index_version = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
    ).bind(reviewedText, actor.userId, now(), MATERIAL_EVIDENCE_INDEX_VERSION, now(), evidence.id, actor.organizationId).run()
    const job = await this.enqueue(actor, evidence.id, 'INDEX', payload.idempotencyKey)
    await this.audit(actor, 'material-evidence.document.reviewed', document.id)
    return { evidenceDocumentId: evidence.id, ...job }
  }

  async retryDocument(actor: MaterialEvidenceActor, documentId: string, idempotencyKey: string) {
    await this.requireManage(actor, documentId)
    const document = await this.documentForActor(actor, documentId)
    const evidence = await this.env.DB.prepare(
      `SELECT id, reviewed_text FROM material_evidence_documents
       WHERE organization_id = ? AND source_kind = 'DOCUMENT' AND document_id = ? ORDER BY updated_at DESC LIMIT 1`,
    ).bind(actor.organizationId, document.id).first<{ id: string; reviewed_text: string | null }>()
    if (!evidence) return this.queueDocumentExtraction(actor, documentId, idempotencyKey)
    await this.env.DB.prepare(
      `UPDATE material_evidence_documents SET extraction_status = 'QUEUED', error_code = NULL, index_version = ?, updated_at = ?
       WHERE id = ? AND organization_id = ?`,
    ).bind(MATERIAL_EVIDENCE_INDEX_VERSION, now(), evidence.id, actor.organizationId).run()
    const job = await this.enqueue(actor, evidence.id, evidence.reviewed_text ? 'INDEX' : 'EXTRACT', idempotencyKey)
    await this.audit(actor, 'material-evidence.document.retry.queued', document.id)
    return { evidenceDocumentId: evidence.id, ...job }
  }

  async invalidateDocument(actor: MaterialEvidenceActor, documentId: string, idempotencyKey: string) {
    await this.requireManage(actor, documentId)
    const rows = await this.env.DB.prepare(
      `SELECT id FROM material_evidence_documents WHERE organization_id = ? AND document_id = ? AND extraction_status != 'INVALIDATED'`,
    ).bind(actor.organizationId, documentId).all<{ id: string }>()
    const queued = await Promise.all((rows.results ?? []).map(async (row, index) => this.enqueue(actor, row.id, 'INVALIDATE', `${idempotencyKey}:${index}`)))
    if (queued.length) await this.audit(actor, 'material-evidence.document.invalidation.queued', documentId)
    return queued
  }

  async materialSources(actor: MaterialEvidenceActor, materialId: string): Promise<EvidenceSource[]> {
    await this.requireView(actor, materialId)
    const material = await this.materialForActor(actor, materialId)
    const evidenceOrganizationId = this.evidenceOrganizationForMaterial(material, actor.organizationId)
    const rows = await this.env.DB.prepare(
      `SELECT source_kind, document_id, source_title, source_version, extraction_status, updated_at
       FROM material_evidence_documents
       WHERE organization_id = ? AND material_id = ? AND extraction_status != 'INVALIDATED'
       ORDER BY updated_at DESC LIMIT 24`,
    ).bind(evidenceOrganizationId, materialId).all<{
      source_kind: 'MATERIAL' | 'DOCUMENT'
      document_id: string | null
      source_title: string
      source_version: string
      extraction_status: EvidenceState
      updated_at: string
    }>()
    const mayManage = actor.permissions.includes('documents.manage')
    return (rows.results ?? []).map((row) => ({
      sourceKind: row.source_kind === 'MATERIAL' ? 'material' : 'document',
      documentId: mayManage && row.document_id ? row.document_id : undefined,
      title: row.source_title,
      version: row.source_version,
      state: row.extraction_status,
      updatedAt: row.updated_at,
    }))
  }

  async reviewSource(actor: MaterialEvidenceActor, documentId: string): Promise<EvidenceReviewSource> {
    await this.requireManage(actor, documentId)
    const document = await this.documentForActor(actor, documentId)
    const evidence = await this.env.DB.prepare(
      `SELECT source_title, source_version, extraction_status, extracted_text
       FROM material_evidence_documents
       WHERE organization_id = ? AND source_kind = 'DOCUMENT' AND document_id = ?
       ORDER BY updated_at DESC LIMIT 1`,
    ).bind(actor.organizationId, document.id).first<{
      source_title: string
      source_version: string
      extraction_status: EvidenceState
      extracted_text: string | null
    }>()
    if (!evidence?.extracted_text) throw new NotFoundException('No extracted evidence is available for review')
    return {
      documentId: document.id,
      title: evidence.source_title,
      version: evidence.source_version,
      state: evidence.extraction_status,
      extractedText: evidence.extracted_text,
    }
  }

  async materialEvidence(actor: MaterialEvidenceActor, materialId: string, requestedQuery?: string | null) {
    await this.requireView(actor, materialId)
    const material = await this.materialForActor(actor, materialId)
    const evidenceOrganizationId = this.evidenceOrganizationForMaterial(material, actor.organizationId)
    const sources = await this.env.DB.prepare(
      `SELECT extraction_status FROM material_evidence_documents
       WHERE organization_id = ? AND material_id = ? AND extraction_status != 'INVALIDATED'`,
    ).bind(evidenceOrganizationId, materialId).all<{ extraction_status: EvidenceState }>()
    const ready = (sources.results ?? []).filter((row) => row.extraction_status === 'READY').length
    const hasUnconfigured = (sources.results ?? []).some((row) => row.extraction_status === 'NOT_CONFIGURED')
    if (!requestedQuery?.trim()) {
      return { state: this.configured ? (ready ? 'READY' : 'NOT_INDEXED') : hasUnconfigured || !this.configured ? 'NOT_CONFIGURED' : 'NOT_INDEXED', citations: [], indexedSourceCount: ready } satisfies EvidenceQueryResult
    }
    const result = await this.retrieve(actor, { query: requestedQuery, materialIds: [materialId] })
    return { ...result, indexedSourceCount: ready }
  }

  async retrieve(actor: MaterialEvidenceActor, input: unknown): Promise<EvidenceQueryResult> {
    await this.requireView(actor, 'query')
    const request = materialEvidenceQuerySchema.parse(input)
    if (!this.configured || !this.env.AI || !this.env.RAG_INDEX) {
      await this.audit(actor, 'material-evidence.query.not-configured', await sha256(request.query))
      return { state: 'NOT_CONFIGURED', citations: [], indexedSourceCount: 0 }
    }
    const materialIds = request.materialIds ?? []
    const documentIds = request.documentIds ?? []
    const sourceKinds = request.sourceKinds ?? ['MATERIAL', 'DOCUMENT']
    const queryInput = { text: [request.query] }
    const embeddings = await this.env.AI.run(MATERIAL_EVIDENCE_EMBEDDING_MODEL, queryInput)
    const vector = embeddings.data?.[0]
    if (!Array.isArray(vector) || vector.length !== MATERIAL_EVIDENCE_EMBEDDING_DIMENSIONS) throw new UnprocessableEntityException('Material evidence embedding provider returned an invalid vector')
    const topK = request.topK ?? 6
    const scopes = materialEvidenceQueryScopes(actor.organizationId, sourceKinds)
    const scopedMatches: Array<{ id: string; score: number; organizationId: string; sourceKinds: Array<'MATERIAL' | 'DOCUMENT'> }> = []
    for (const scope of scopes) {
      const filter: Record<string, unknown> = { organizationId: scope.organizationId, status: 'READY', indexVersion: MATERIAL_EVIDENCE_INDEX_VERSION }
      filter.sourceKind = scope.sourceKinds.length === 1 ? scope.sourceKinds[0] : { $in: scope.sourceKinds }
      if (materialIds.length) filter.materialId = materialIds.length === 1 ? materialIds[0] : { $in: materialIds }
      if (documentIds.length && scope.organizationId === actor.organizationId) filter.documentId = documentIds.length === 1 ? documentIds[0] : { $in: documentIds }
      const result = await this.env.RAG_INDEX.query(vector, { topK, filter, returnMetadata: 'all' })
      scopedMatches.push(...result.matches.map((match) => ({ ...match, organizationId: scope.organizationId, sourceKinds: scope.sourceKinds })))
    }
    const citations: EvidenceCitation[] = []
    for (const match of scopedMatches.sort((left, right) => right.score - left.score).slice(0, topK)) {
      const scopedDocumentIds = match.organizationId === actor.organizationId ? documentIds : []
      const chunk = await this.env.DB.prepare(
        `SELECT c.id, c.evidence_document_id, c.vector_id, c.chunk_index, c.page_number, c.section_label, c.excerpt,
                d.source_title, d.source_version, d.source_kind, d.material_id, d.document_id, d.content_hash
         FROM material_evidence_chunks c
         JOIN material_evidence_documents d ON d.id = c.evidence_document_id AND d.organization_id = c.organization_id
         WHERE c.organization_id = ? AND c.vector_id = ? AND c.status = 'READY'
           AND d.extraction_status = 'READY' AND d.approval_status = 'APPROVED'
           AND c.index_version = ? AND d.index_version = ?
           ${materialIds.length ? `AND d.material_id IN (${materialIds.map(() => '?').join(', ')})` : ''}
           ${scopedDocumentIds.length ? `AND d.document_id IN (${scopedDocumentIds.map(() => '?').join(', ')})` : ''}
           ${match.sourceKinds.length ? `AND d.source_kind IN (${match.sourceKinds.map(() => '?').join(', ')})` : ''}
         LIMIT 1`,
      ).bind(
        match.organizationId,
        match.id,
        MATERIAL_EVIDENCE_INDEX_VERSION,
        MATERIAL_EVIDENCE_INDEX_VERSION,
        ...materialIds,
        ...scopedDocumentIds,
        ...match.sourceKinds,
      ).first<EvidenceChunkRow>()
      if (!chunk) continue
      if (!(await this.chunkStillEligible(chunk, match.organizationId, actor.organizationId))) continue
      citations.push({
        citationId: chunk.id,
        sourceKind: chunk.source_kind === 'MATERIAL' ? 'material' : 'document',
        materialId: chunk.material_id ?? undefined,
        title: chunk.source_title,
        version: chunk.source_version,
        page: chunk.page_number ?? undefined,
        section: chunk.section_label ?? undefined,
        excerpt: safeEvidenceExcerpt(chunk.excerpt),
        score: Number(Math.max(0, Math.min(1, match.score)).toFixed(4)),
      })
    }
    await this.audit(actor, 'material-evidence.query.completed', await sha256(`${request.query}:${citations.length}`))
    return { state: citations.length ? 'READY' : 'NOT_INDEXED', citations, indexedSourceCount: citations.length }
  }

  private async evidenceDocument(id: string, organizationId: string) {
    return this.env.DB.prepare(
      `SELECT id, organization_id, source_kind, material_id, document_id, source_title, source_version, content_hash,
              approval_status, extraction_status, extracted_text, reviewed_text, index_version
       FROM material_evidence_documents WHERE id = ? AND organization_id = ?`,
    ).bind(id, organizationId).first<EvidenceDocumentRow>()
  }

  private async claimJob(jobId: string) {
    const candidate = await this.env.DB.prepare(
      `SELECT id, organization_id, evidence_document_id, action, attempt_count, max_attempts, correlation_id
       FROM material_evidence_jobs
       WHERE id = ? AND status IN ('QUEUED', 'RETRY') AND available_at <= ?
       LIMIT 1`,
    ).bind(jobId, now()).first<{ id: string; organization_id: string; evidence_document_id: string; action: 'EXTRACT' | 'INDEX' | 'INVALIDATE'; attempt_count: number; max_attempts: number; correlation_id: string }>()
    if (!candidate) return null
    const leaseToken = uuid()
    const stamp = now()
    const leaseExpires = new Date(Date.now() + JOB_LEASE_MS).toISOString()
    const update = await this.env.DB.prepare(
      `UPDATE material_evidence_jobs
       SET status = 'RUNNING', attempt_count = attempt_count + 1, lease_token = ?, lease_expires_at = ?, updated_at = ?
       WHERE id = ? AND organization_id = ? AND status IN ('QUEUED', 'RETRY') AND available_at <= ?`,
    ).bind(leaseToken, leaseExpires, stamp, candidate.id, candidate.organization_id, stamp).run()
    if ((update.meta.changes ?? 0) !== 1) return null
    return { ...candidate, leaseToken }
  }

  private async assertLease(job: { id: string; organization_id: string; leaseToken: string }) {
    const row = await this.env.DB.prepare(
      `SELECT 1 AS active FROM material_evidence_jobs
       WHERE id = ? AND organization_id = ? AND status = 'RUNNING' AND lease_token = ? AND lease_expires_at > ?`,
    ).bind(job.id, job.organization_id, job.leaseToken, now()).first<{ active: number }>()
    if (!row) throw new UnprocessableEntityException('Material evidence job lease is no longer active')
  }

  private async completeJob(job: { id: string; organization_id: string; leaseToken: string }, status: 'COMPLETED' | 'WAITING_REVIEW' | 'WAITING_CONFIGURATION') {
    const stamp = now()
    await this.env.DB.prepare(
      `UPDATE material_evidence_jobs
       SET status = ?, lease_token = NULL, lease_expires_at = NULL, error_code = NULL, completed_at = ?, updated_at = ?
       WHERE id = ? AND organization_id = ? AND status = 'RUNNING' AND lease_token = ?`,
    ).bind(status, stamp, stamp, job.id, job.organization_id, job.leaseToken).run()
  }

  private async failJob(job: { id: string; organization_id: string; leaseToken: string; attempt_count: number; max_attempts: number }, error: unknown) {
    const errorCode = genericErrorCode(error)
    const retry = job.attempt_count < job.max_attempts
    const status = retry ? 'RETRY' : 'FAILED'
    await this.env.DB.prepare(
      `UPDATE material_evidence_jobs
       SET status = ?, lease_token = NULL, lease_expires_at = NULL, available_at = ?, error_code = ?, updated_at = ?, completed_at = CASE WHEN ? = 'FAILED' THEN ? ELSE NULL END
       WHERE id = ? AND organization_id = ? AND status = 'RUNNING' AND lease_token = ?`,
    ).bind(status, retry ? nextRetry(job.attempt_count) : now(), errorCode, now(), status, now(), job.id, job.organization_id, job.leaseToken).run()
    await this.env.DB.prepare(
      `UPDATE material_evidence_documents SET extraction_status = ?, error_code = ?, updated_at = ?
       WHERE id = (SELECT evidence_document_id FROM material_evidence_jobs WHERE id = ?) AND organization_id = ?`,
    ).bind(retry ? 'QUEUED' : 'FAILED', errorCode, now(), job.id, job.organization_id).run()
  }

  private async reclaimExpiredLeases(limit = 10) {
    const expired = await this.env.DB.prepare(
      `SELECT id, organization_id, evidence_document_id, attempt_count, max_attempts
       FROM material_evidence_jobs
       WHERE status = 'RUNNING' AND lease_expires_at <= ?
       ORDER BY lease_expires_at ASC LIMIT ?`,
    ).bind(now(), Math.min(Math.max(1, limit), 10)).all<{
      id: string
      organization_id: string
      evidence_document_id: string
      attempt_count: number
      max_attempts: number
    }>()
    for (const job of expired.results ?? []) {
      const retry = job.attempt_count < job.max_attempts
      const status = retry ? 'RETRY' : 'FAILED'
      const reclaimed = await this.env.DB.prepare(
        `UPDATE material_evidence_jobs
         SET status = ?, lease_token = NULL, lease_expires_at = NULL, available_at = ?, error_code = 'lease_expired',
             completed_at = CASE WHEN ? = 'FAILED' THEN ? ELSE NULL END, updated_at = ?
         WHERE id = ? AND organization_id = ? AND status = 'RUNNING' AND lease_expires_at <= ?`,
      ).bind(status, retry ? nextRetry(job.attempt_count) : now(), status, now(), now(), job.id, job.organization_id, now()).run()
      if ((reclaimed.meta.changes ?? 0) !== 1) continue
      await this.env.DB.prepare(
        `UPDATE material_evidence_documents
         SET extraction_status = ?, error_code = 'lease_expired', updated_at = ?
         WHERE id = ? AND organization_id = ?`,
      ).bind(retry ? 'QUEUED' : 'FAILED', now(), job.evidence_document_id, job.organization_id).run()
      const actor: MaterialEvidenceActor = {
        organizationId: job.organization_id,
        userId: 'system:material-evidence',
        permissions: ['documents.view', 'documents.manage', 'materials.view'],
      }
      await this.audit(actor, retry ? 'material-evidence.job.lease.reclaimed' : 'material-evidence.job.lease.failed', job.evidence_document_id, retry ? 'review' : 'blocked')
    }
  }

  private async documentStillEligible(row: EvidenceDocumentRow) {
    if (row.source_kind === 'MATERIAL') return true
    if (!row.document_id) return false
    const document = await this.env.DB.prepare(
      `SELECT record_json, checksum, version FROM document_records WHERE id = ? AND organization_id = ?`,
    ).bind(row.document_id, row.organization_id).first<{ record_json: string | null; checksum: string; version: string }>()
    if (!document) return false
    const record = parseJson<DocumentRecord>(document.record_json, {} as DocumentRecord)
    return isCurrentEvidenceDocument({ ...record, checksum: document.checksum, version: document.version }, row.source_version, row.content_hash)
  }

  private async chunkStillEligible(chunk: EvidenceChunkRow, evidenceOrganizationId: string, actorOrganizationId: string) {
    if (chunk.source_kind === 'MATERIAL') {
      if (!chunk.material_id) return false
      const master = lluchCatalogueGlobalMasterMaterialById(chunk.material_id)
      if (master && evidenceOrganizationId === GLOBAL_LIBRARY_ORGANIZATION_ID) {
        return isLluchCatalogueMasterMaterial(master)
      }
      const material = await this.env.DB.prepare(
        `SELECT library_scope, organization_id FROM material_records
         WHERE id = ? AND (
           (library_scope = 'GLOBAL' AND ? = ?)
           OR (library_scope = 'TENANT' AND organization_id = ? AND ? = ?)
         )`,
      ).bind(
        chunk.material_id,
        evidenceOrganizationId,
        GLOBAL_LIBRARY_ORGANIZATION_ID,
        actorOrganizationId,
        evidenceOrganizationId,
        actorOrganizationId,
      ).first<{ library_scope: string; organization_id: string | null }>()
      return Boolean(material)
    }
    if (!chunk.document_id) return false
    if (evidenceOrganizationId !== actorOrganizationId) return false
    const document = await this.env.DB.prepare(
      `SELECT record_json, checksum, version FROM document_records WHERE id = ? AND organization_id = ?`,
    ).bind(chunk.document_id, actorOrganizationId).first<{ record_json: string | null; checksum: string; version: string }>()
    if (!document) return false
    const record = parseJson<DocumentRecord>(document.record_json, {} as DocumentRecord)
    return isCurrentEvidenceDocument({ ...record, checksum: document.checksum, version: document.version }, chunk.source_version, chunk.content_hash)
  }

  private async extractDocument(row: EvidenceDocumentRow) {
    if (!row.document_id || !this.env.DOCUMENTS || !this.env.AI?.toMarkdown) return null
    const document = await this.env.DB.prepare(
      `SELECT storage_key, mime_type, title FROM document_records WHERE id = ? AND organization_id = ?`,
    ).bind(row.document_id, row.organization_id).first<{ storage_key: string; mime_type: string; title: string }>()
    if (!document) return null
    const bytes = await this.env.DOCUMENTS.get(document.storage_key, 'arrayBuffer')
    if (!bytes) return null
    const converted = await this.env.AI.toMarkdown({ name: document.title, blob: new Blob([bytes], { type: document.mime_type }) })
    if (converted.error || !converted.data?.trim()) return null
    return compactText(converted.data).slice(0, MAX_REVIEW_TEXT_CHARS)
  }

  private async invalidateEvidence(row: EvidenceDocumentRow) {
    const chunkRows = await this.env.DB.prepare(
      `SELECT vector_id FROM material_evidence_chunks WHERE organization_id = ? AND evidence_document_id = ? AND status = 'READY'`,
    ).bind(row.organization_id, row.id).all<{ vector_id: string }>()
    const vectorIds = (chunkRows.results ?? []).map((chunk) => chunk.vector_id)
    if (this.env.RAG_INDEX && vectorIds.length) await this.env.RAG_INDEX.deleteByIds(vectorIds)
    await this.env.DB.batch([
      this.env.DB.prepare(`UPDATE material_evidence_chunks SET status = 'INVALIDATED', updated_at = ? WHERE organization_id = ? AND evidence_document_id = ?`).bind(now(), row.organization_id, row.id),
      this.env.DB.prepare(`UPDATE material_evidence_documents SET extraction_status = 'INVALIDATED', invalidated_at = ?, updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now(), now(), row.id, row.organization_id),
    ])
  }

  private async indexEvidence(row: EvidenceDocumentRow) {
    if (!this.env.AI || !this.env.RAG_INDEX) return 'NOT_CONFIGURED' as const
    const sourceText = row.reviewed_text ?? (row.source_kind === 'MATERIAL' ? row.extracted_text : null)
    if (!sourceText?.trim()) return 'REVIEW_REQUIRED' as const
    const chunks = chunkEvidenceText(sourceText)
    if (!chunks.length) return 'NOT_INDEXED' as const
    const old = await this.env.DB.prepare(
      `SELECT vector_id FROM material_evidence_chunks WHERE organization_id = ? AND evidence_document_id = ? AND status = 'READY'`,
    ).bind(row.organization_id, row.id).all<{ vector_id: string }>()
    if ((old.results ?? []).length) await this.env.RAG_INDEX.deleteByIds((old.results ?? []).map((item) => item.vector_id))
    await this.env.DB.prepare(`DELETE FROM material_evidence_chunks WHERE organization_id = ? AND evidence_document_id = ?`).bind(row.organization_id, row.id).run()
    const vectors: Array<{ id: string; values: number[]; metadata: Record<string, string | number | boolean> }> = []
    const chunkRows: Array<{ id: string; vectorId: string; index: number; excerpt: string; hash: string }> = []
    for (let index = 0; index < chunks.length; index += 1) {
      const data = await this.env.AI.run(MATERIAL_EVIDENCE_EMBEDDING_MODEL, { text: [chunks[index]] })
      const values = data.data?.[0]
      if (!Array.isArray(values) || values.length !== MATERIAL_EVIDENCE_EMBEDDING_DIMENSIONS) throw new UnprocessableEntityException('Material evidence embedding provider returned an invalid vector')
      const vectorId = `${row.organization_id}:${row.id}:${MATERIAL_EVIDENCE_INDEX_VERSION}:${index}`
      vectors.push({ id: vectorId, values, metadata: {
        organizationId: row.organization_id, sourceKind: row.source_kind, materialId: row.material_id ?? 'global',
        documentId: row.document_id ?? 'none', status: 'READY', indexVersion: MATERIAL_EVIDENCE_INDEX_VERSION,
      } })
      chunkRows.push({ id: uuid(), vectorId, index, excerpt: safeEvidenceExcerpt(chunks[index], MAX_CHUNK_CHARS), hash: await sha256(chunks[index]) })
    }
    await this.env.RAG_INDEX.upsert(vectors)
    const stamp = now()
    await this.env.DB.batch([
      ...chunkRows.map((chunk) => this.env.DB.prepare(
        `INSERT INTO material_evidence_chunks (
          id, organization_id, evidence_document_id, vector_id, chunk_index, excerpt, content_hash, status, index_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?)`,
      ).bind(chunk.id, row.organization_id, row.id, chunk.vectorId, chunk.index, chunk.excerpt, chunk.hash, MATERIAL_EVIDENCE_INDEX_VERSION, stamp, stamp)),
      this.env.DB.prepare(
        `UPDATE material_evidence_documents
         SET extraction_status = 'READY', error_code = NULL, index_version = ?, indexed_at = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
      ).bind(MATERIAL_EVIDENCE_INDEX_VERSION, stamp, stamp, row.id, row.organization_id),
    ])
    return 'READY' as const
  }

  async processJob(jobId: string) {
    const job = await this.claimJob(jobId)
    if (!job) return
    const actor: MaterialEvidenceActor = { organizationId: job.organization_id, userId: 'system:material-evidence', permissions: ['documents.view', 'documents.manage', 'materials.view'] }
    try {
      const row = await this.evidenceDocument(job.evidence_document_id, job.organization_id)
      if (!row) throw new NotFoundException('Material evidence source not found')
      await this.assertLease(job)
      if (job.action === 'INVALIDATE' || !(await this.documentStillEligible(row))) {
        await this.invalidateEvidence(row)
        await this.completeJob(job, 'COMPLETED')
        await this.audit(actor, 'material-evidence.source.invalidated', row.document_id ?? row.material_id ?? row.id)
        return
      }
      if (job.action === 'EXTRACT') {
        if (!this.configured) {
          await this.env.DB.prepare(`UPDATE material_evidence_documents SET extraction_status = 'NOT_CONFIGURED', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now(), row.id, row.organization_id).run()
          await this.completeJob(job, 'WAITING_CONFIGURATION')
          return
        }
        const extracted = await this.extractDocument(row)
        if (!extracted) {
          await this.env.DB.prepare(`UPDATE material_evidence_documents SET extraction_status = 'NOT_INDEXED', error_code = 'text_extraction_unavailable', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now(), row.id, row.organization_id).run()
          await this.completeJob(job, 'COMPLETED')
          return
        }
        await this.assertLease(job)
        await this.env.DB.prepare(`UPDATE material_evidence_documents SET extracted_text = ?, extraction_status = 'REVIEW_REQUIRED', error_code = NULL, updated_at = ? WHERE id = ? AND organization_id = ?`).bind(extracted, now(), row.id, row.organization_id).run()
        await this.completeJob(job, 'WAITING_REVIEW')
        await this.audit(actor, 'material-evidence.document.extracted', row.document_id ?? row.id)
        return
      }
      const state = await this.indexEvidence(row)
      await this.assertLease(job)
      if (state === 'NOT_CONFIGURED') {
        await this.env.DB.prepare(`UPDATE material_evidence_documents SET extraction_status = 'NOT_CONFIGURED', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now(), row.id, row.organization_id).run()
        await this.completeJob(job, 'WAITING_CONFIGURATION')
        return
      }
      if (state === 'REVIEW_REQUIRED') {
        await this.env.DB.prepare(`UPDATE material_evidence_documents SET extraction_status = 'REVIEW_REQUIRED', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now(), row.id, row.organization_id).run()
        await this.completeJob(job, 'WAITING_REVIEW')
        return
      }
      if (state === 'NOT_INDEXED') {
        await this.env.DB.prepare(`UPDATE material_evidence_documents SET extraction_status = 'NOT_INDEXED', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(now(), row.id, row.organization_id).run()
      }
      await this.completeJob(job, 'COMPLETED')
      await this.audit(actor, 'material-evidence.source.indexed', row.document_id ?? row.material_id ?? row.id)
    } catch (error) {
      await this.failJob(job, error)
      await this.audit(actor, 'material-evidence.job.failed', job.evidence_document_id, 'review').catch(() => undefined)
    }
  }

  private async globalMasterQueueCursor() {
    const row = await this.env.DB.prepare(
      `SELECT metadata_value FROM persistence_metadata WHERE metadata_key = ?`,
    ).bind(GLOBAL_MASTER_CURSOR_KEY).first<{ metadata_value: string }>()
    const value = Number.parseInt(row?.metadata_value ?? '0', 10)
    return Number.isSafeInteger(value) && value >= 0 ? value : 0
  }

  private async persistGlobalMasterQueueCursor(cursor: number) {
    await this.env.DB.prepare(
      `INSERT INTO persistence_metadata (metadata_key, metadata_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(metadata_key) DO UPDATE SET metadata_value = excluded.metadata_value, updated_at = excluded.updated_at`,
    ).bind(GLOBAL_MASTER_CURSOR_KEY, String(cursor), now()).run()
  }

  private async masterEvidenceNeedsQueue(material: Material) {
    const sourceVersion = materialEvidenceSourceVersion(material)
    const row = await this.env.DB.prepare(
      `SELECT source_version, extraction_status, index_version
       FROM material_evidence_documents
       WHERE organization_id = ? AND source_kind = 'MATERIAL' AND material_id = ?
       ORDER BY updated_at DESC LIMIT 1`,
    ).bind(GLOBAL_LIBRARY_ORGANIZATION_ID, material.id).first<{
      source_version: string
      extraction_status: EvidenceState
      index_version: number
    }>()
    if (!row) return true
    if (row.source_version !== sourceVersion || row.index_version !== MATERIAL_EVIDENCE_INDEX_VERSION) return true
    return !['QUEUED', 'READY', 'REVIEW_REQUIRED', 'NOT_CONFIGURED', 'FAILED'].includes(row.extraction_status)
  }

  private async queueMissingGlobalMasterMaterials(actor: MaterialEvidenceActor, limit: number) {
    const masters = lluchCatalogueGlobalMasterMaterials()
    if (masters.length === 0 || limit <= 0) return 0
    const cursor = (await this.globalMasterQueueCursor()) % masters.length
    const maxQueue = Math.min(Math.max(1, limit), GLOBAL_MASTER_QUEUE_LIMIT)
    let queued = 0
    let scanned = 0
    while (scanned < Math.min(masters.length, GLOBAL_MASTER_SCAN_LIMIT) && queued < maxQueue) {
      const material = masters[(cursor + scanned) % masters.length]!
      scanned += 1
      if (!(await this.masterEvidenceNeedsQueue(material))) continue
      const sourceVersion = materialEvidenceSourceVersion(material)
      await this.queueMaterial(actor, material.id, `global-master-material:${MATERIAL_EVIDENCE_INDEX_VERSION}:${sourceVersion}:${material.id}`)
      queued += 1
    }
    await this.persistGlobalMasterQueueCursor((cursor + scanned) % masters.length)
    return queued
  }

  async queueMissingGlobalMaterials(limit = 3) {
    if (!this.configured) return { queued: 0, state: 'NOT_CONFIGURED' as const }
    const rows = await this.env.DB.prepare(
      `SELECT m.id
       FROM material_records m
       LEFT JOIN material_evidence_documents d
         ON d.organization_id = ? AND d.source_kind = 'MATERIAL' AND d.material_id = m.id
        AND d.extraction_status != 'INVALIDATED' AND d.index_version = ?
       WHERE m.library_scope = 'GLOBAL' AND d.id IS NULL
       ORDER BY m.name ASC LIMIT ?`,
    ).bind(GLOBAL_LIBRARY_ORGANIZATION_ID, MATERIAL_EVIDENCE_INDEX_VERSION, Math.min(Math.max(1, limit), 8)).all<{ id: string }>()
    const actor: MaterialEvidenceActor = {
      organizationId: GLOBAL_LIBRARY_ORGANIZATION_ID,
      userId: 'system:global-material-curator',
      permissions: ['documents.view', 'documents.manage', 'materials.view'],
    }
    for (const material of rows.results ?? []) {
      await this.queueMaterial(actor, material.id, `global-material-bootstrap:${MATERIAL_EVIDENCE_INDEX_VERSION}:${material.id}`)
    }
    const masterQueued = await this.queueMissingGlobalMasterMaterials(actor, GLOBAL_MASTER_QUEUE_LIMIT)
    return {
      queued: (rows.results?.length ?? 0) + masterQueued,
      masterQueued,
      masterTotal: lluchCatalogueGlobalMasterMaterials().length,
      state: 'QUEUED' as const,
    }
  }

  async processDueJobs(limit = 8) {
    await this.reclaimExpiredLeases(limit)
    const due = await this.env.DB.prepare(
      `SELECT id FROM material_evidence_jobs
       WHERE status IN ('QUEUED', 'RETRY') AND available_at <= ?
       ORDER BY created_at ASC LIMIT ?`,
    ).bind(now(), Math.min(Math.max(1, limit), 10)).all<{ id: string }>()
    for (const job of due.results ?? []) await this.processJob(job.id)
  }
}
