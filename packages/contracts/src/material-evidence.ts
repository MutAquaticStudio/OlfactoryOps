import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const hash = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
const excerpt = z.string().trim().min(1).max(1_200)

export const materialEvidenceIndexRequestSchema = z.object({
  materialId: id,
  sourceKind: z.enum(['MATERIAL_PROFILE', 'COMPLIANCE', 'DOCUMENT', 'SUPPLIER_OFFER']),
  sourceRef: z.string().trim().min(1).max(500),
  version: z.string().trim().min(1).max(160),
  contentHash: hash,
  excerpts: z.array(excerpt).min(1).max(64),
}).strict()

export const materialEvidenceQueryRequestSchema = z.object({
  materialId: id,
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(10).default(5),
}).strict()

export type MaterialEvidenceCitation = {
  sourceId: string
  sourceKind: 'MATERIAL_PROFILE' | 'COMPLIANCE' | 'DOCUMENT' | 'SUPPLIER_OFFER'
  sourceRef: string
  version: string
  excerpt: string
  excerptHash: string
  relevance: number
}
