import { describe, expect, it } from 'vitest'
import {
  chunkEvidenceText,
  isCurrentEvidenceDocument,
  isEligibleEvidenceDocument,
  MaterialEvidenceRag,
  MATERIAL_EVIDENCE_EMBEDDING_DIMENSIONS,
  MATERIAL_EVIDENCE_EMBEDDING_MODEL,
  MATERIAL_EVIDENCE_INDEX_VERSION,
  materialEvidenceQuerySchema,
  materialEvidenceQueryScopes,
  safeEvidenceExcerpt,
} from './material-evidence-rag.js'

describe('controlled material evidence RAG', () => {
  it('uses the versioned multilingual BGE-M3 retrieval contract', () => {
    expect(MATERIAL_EVIDENCE_EMBEDDING_MODEL).toBe('@cf/baai/bge-m3')
    expect(MATERIAL_EVIDENCE_EMBEDDING_DIMENSIONS).toBe(1024)
    expect(MATERIAL_EVIDENCE_INDEX_VERSION).toBe(2)
  })

  it('creates bounded, overlapping evidence chunks without losing the source tail', () => {
    const text = Array.from({ length: 80 }, (_, index) => `Sentence ${index + 1} carries approved material evidence.`).join(' ')
    const chunks = chunkEvidenceText(text, 180, 30)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 180)).toBe(true)
    expect(chunks.at(-1)).toContain('Sentence 80')
  })

  it('allows only approved clean compliance documents or explicitly tagged supplier catalogues', () => {
    expect(isEligibleEvidenceDocument({ type: 'SDS', status: 'APPROVED', scanStatus: 'CLEAN' })).toBe(true)
    expect(isEligibleEvidenceDocument({ type: 'Invoice', status: 'APPROVED', scanStatus: 'CLEAN', tags: ['supplier-catalogue'] })).toBe(true)
    expect(isEligibleEvidenceDocument({ type: 'SDS', status: 'REVIEW_REQUIRED', scanStatus: 'CLEAN' })).toBe(false)
    expect(isEligibleEvidenceDocument({ type: 'CoA', status: 'APPROVED', scanStatus: 'INFECTED' })).toBe(false)
  })

  it('rejects a superseded or changed document snapshot before a vector result is projected', () => {
    const approved = { type: 'SDS' as const, status: 'APPROVED' as const, scanStatus: 'CLEAN' as const, checksum: 'hash-v2', version: 'v2' }
    expect(isCurrentEvidenceDocument(approved, 'v2', 'hash-v2')).toBe(true)
    expect(isCurrentEvidenceDocument(approved, 'v1', 'hash-v2')).toBe(false)
    expect(isCurrentEvidenceDocument(approved, 'v2', 'hash-v1')).toBe(false)
    expect(isCurrentEvidenceDocument({ ...approved, status: 'ARCHIVED' }, 'v2', 'hash-v2')).toBe(false)
  })

  it('bounds returned excerpts and rejects oversized queries before a vector call', () => {
    expect(safeEvidenceExcerpt('x'.repeat(900))).toHaveLength(700)
    expect(materialEvidenceQuerySchema.safeParse({ query: 'x'.repeat(321) }).success).toBe(false)
    expect(materialEvidenceQuerySchema.safeParse({ query: 'approved woody material', topK: 8 }).success).toBe(true)
  })

  it('keeps tenant-scoped evidence honestly unavailable when Cloudflare bindings are absent', async () => {
    const calls: unknown[][] = []
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            calls.push(values)
            return {
              first: async () => sql.includes('FROM material_records')
                ? { id: 'mat-a', organization_id: 'org-a', record_json: JSON.stringify({ id: 'mat-a', organizationId: 'org-a', name: 'Bergamot FCF' }) }
                : null,
              all: async () => ({ results: [{ extraction_status: 'NOT_CONFIGURED' }] }),
              run: async () => ({ meta: { changes: 1 } }),
            }
          },
        }
      },
    } as unknown as D1Database

    const rag = new MaterialEvidenceRag({ DB: db })
    await expect(rag.materialEvidence({ organizationId: 'org-a', userId: 'usr-a', permissions: ['documents.view', 'materials.view'] }, 'mat-a')).resolves.toMatchObject({ state: 'NOT_CONFIGURED', citations: [] })
    expect(calls.some((values) => values.includes('org-a'))).toBe(true)
  })

  it('queries tenant-private evidence plus global material evidence without exposing global documents', () => {
    expect(materialEvidenceQueryScopes('org-customer', ['MATERIAL', 'DOCUMENT'])).toEqual([
      { organizationId: 'org-customer', sourceKinds: ['MATERIAL', 'DOCUMENT'] },
      { organizationId: 'org-nxl', sourceKinds: ['MATERIAL'] },
    ])
    expect(materialEvidenceQueryScopes('org-customer', ['DOCUMENT'])).toEqual([
      { organizationId: 'org-customer', sourceKinds: ['DOCUMENT'] },
    ])
    expect(materialEvidenceQueryScopes('org-nxl', ['MATERIAL', 'DOCUMENT'])).toEqual([
      { organizationId: 'org-nxl', sourceKinds: ['MATERIAL', 'DOCUMENT'] },
    ])
  })
})
