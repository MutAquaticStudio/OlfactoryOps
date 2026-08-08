import { z } from 'zod'

export const V2_CONTRACT_VERSION = '2.0.0'

const nonEmptyId = z.string().trim().min(1).max(160)
const permissionKey = z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/)

export const tenantContextSchema = z.object({
  organizationId: nonEmptyId,
  workspaceId: nonEmptyId.optional(),
  hostname: z.string().trim().min(1).max(255).optional(),
})
export type TenantContext = z.infer<typeof tenantContextSchema>

export const actorContextSchema = z.object({
  actorId: nonEmptyId,
  organizationId: nonEmptyId,
  kind: z.enum(['USER', 'SERVICE', 'SYSTEM']),
  sessionId: nonEmptyId.optional(),
})
export type ActorContext = z.infer<typeof actorContextSchema>

export const permissionSchema = z.object({
  key: permissionKey,
  registryVersion: z.literal(V2_CONTRACT_VERSION),
})
export type Permission = z.infer<typeof permissionSchema>

export const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().trim().min(1).max(80),
    message: z.string().trim().min(1).max(500),
    requestId: nonEmptyId,
    details: z.record(z.string(), z.unknown()).optional(),
  }),
})
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>

export const paginationSchema = z.object({
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})
export type Pagination = z.infer<typeof paginationSchema>

export const idempotencyMetadataSchema = z.object({
  key: z.string().trim().min(8).max(200),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/i),
  route: z.string().trim().min(1).max(240),
  scope: z.string().trim().min(1).max(160),
})
export type IdempotencyMetadata = z.infer<typeof idempotencyMetadataSchema>

export const correlationMetadataSchema = z.object({
  correlationId: nonEmptyId,
  traceId: nonEmptyId.optional(),
})
export type CorrelationMetadata = z.infer<typeof correlationMetadataSchema>

export const jobStatusSchema = z.enum(['QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'BLOCKED'])
export type JobStatus = z.infer<typeof jobStatusSchema>

export const evidenceStatusSchema = z.enum(['VERIFIED', 'REVIEW_REQUIRED', 'NOT_EVALUATED', 'NOT_ENOUGH_EVIDENCE', 'NOT_CONFIGURED', 'BLOCKED'])
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>

export const provenanceReferenceSchema = z.object({
  kind: z.string().trim().min(1).max(80),
  id: nonEmptyId,
  version: z.string().trim().min(1).max(160).optional(),
  contentHash: z.string().trim().min(1).max(160).optional(),
  sourceUri: z.string().url().max(2048).optional(),
})
export type ProvenanceReference = z.infer<typeof provenanceReferenceSchema>

export const scientificArtifactMetadataSchema = z.object({
  artifactId: nonEmptyId,
  kind: z.string().trim().min(1).max(100),
  schemaVersion: z.string().trim().min(1).max(40),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  storageRef: nonEmptyId.optional(),
  createdAt: z.string().datetime({ offset: true }),
})
export type ScientificArtifactMetadata = z.infer<typeof scientificArtifactMetadataSchema>

export const modelReferenceSchema = z.object({
  modelId: nonEmptyId,
  version: z.string().trim().min(1).max(160),
  provider: z.string().trim().min(1).max(120),
  codeRef: z.string().trim().min(1).max(240),
  featureContract: z.string().trim().min(1).max(160).optional(),
})
export type ModelReference = z.infer<typeof modelReferenceSchema>

export const datasetReferenceSchema = z.object({
  datasetId: nonEmptyId,
  version: z.string().trim().min(1).max(160),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  license: z.string().trim().min(1).max(160),
  source: z.string().trim().min(1).max(2048),
})
export type DatasetReference = z.infer<typeof datasetReferenceSchema>

export const ragCitationReferenceSchema = z.object({
  sourceId: nonEmptyId,
  documentVersion: z.string().trim().min(1).max(160),
  chunkId: nonEmptyId,
  citation: z.string().trim().min(1).max(500),
  excerpt: z.string().trim().max(1200).optional(),
  relevance: z.number().min(0).max(1).optional(),
})
export type RagCitationReference = z.infer<typeof ragCitationReferenceSchema>

export * from './platform.js'
export * from './lab-operations.js'
export * from './scientific.js'
export * from './model-dataset.js'
export * from './olfactory-intelligence.js'
export * from './consumer-intelligence.js'
