import { z } from 'zod'
import { evidenceStatusSchema, jobStatusSchema, provenanceReferenceSchema, scientificArtifactMetadataSchema, type EvidenceStatus, type JobStatus } from '../../../../packages/contracts/src/index.js'

export const scientificOperationSchema = z.enum([
  'structure.normalize', 'structure.validate', 'features.generate', 'model.predict', 'embedding.generate', 'similarity.search', 'explainability.generate',
])
export type ScientificOperation = z.infer<typeof scientificOperationSchema>

export const scientificJobSchema = z.object({
  jobId: z.string().trim().min(1).max(160),
  operation: scientificOperationSchema,
  organizationId: z.string().trim().min(1).max(160),
  actorId: z.string().trim().min(1).max(160),
  status: jobStatusSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
  createdAt: z.string().datetime({ offset: true }),
})
export type ScientificJob = z.infer<typeof scientificJobSchema>

export const scientificArtifactSchema = z.object({
  metadata: scientificArtifactMetadataSchema,
  provenance: z.array(provenanceReferenceSchema),
})
export type ScientificArtifact = z.infer<typeof scientificArtifactSchema>

export const featureKindSchema = z.enum(['BCFP', 'MOLFTP', 'OSMORDRED', 'GNN', 'TRANSFORMER', 'FUSED_EMBEDDING', 'ODOR_EMBEDDING'])
export type FeatureKind = z.infer<typeof featureKindSchema>

export const featureSetSchema = z.object({
  featureKind: featureKindSchema,
  schemaVersion: z.string().trim().min(1).max(80),
  structureHash: z.string().regex(/^[a-f0-9]{64}$/i),
  component: provenanceReferenceSchema,
  artifact: scientificArtifactSchema,
})
export type FeatureSet = z.infer<typeof featureSetSchema>

export const embeddingRefSchema = z.object({
  embeddingId: z.string().trim().min(1).max(160),
  dimensions: z.number().int().positive().max(100000),
  indexVersion: z.string().trim().min(1).max(160),
  artifact: scientificArtifactSchema,
})
export type EmbeddingRef = z.infer<typeof embeddingRefSchema>

export const predictionResultSchema = z.object({
  predictionId: z.string().trim().min(1).max(160),
  status: evidenceStatusSchema,
  output: z.record(z.string(), z.unknown()),
  uncertainty: z.number().min(0).max(1).optional(),
  provenance: z.array(provenanceReferenceSchema),
})
export type PredictionResult = z.infer<typeof predictionResultSchema>

export const similarityResultSchema = z.object({
  queryId: z.string().trim().min(1).max(160),
  method: z.string().trim().min(1).max(160),
  metric: z.string().trim().min(1).max(80),
  indexVersion: z.string().trim().min(1).max(160),
  matches: z.array(z.object({ subjectId: z.string().trim().min(1).max(160), score: z.number().min(0).max(1) })),
  status: evidenceStatusSchema,
  provenance: z.array(provenanceReferenceSchema),
})
export type SimilarityResult = z.infer<typeof similarityResultSchema>

export const explainabilityResultSchema = z.object({
  explanationId: z.string().trim().min(1).max(160),
  method: z.string().trim().min(1).max(160),
  factors: z.array(z.object({ label: z.string().trim().min(1).max(160), contribution: z.number() })),
  status: evidenceStatusSchema,
  provenance: z.array(provenanceReferenceSchema),
})
export type ExplainabilityResult = z.infer<typeof explainabilityResultSchema>

export type ScientificStatus = EvidenceStatus | JobStatus | 'NOT_AVAILABLE'
