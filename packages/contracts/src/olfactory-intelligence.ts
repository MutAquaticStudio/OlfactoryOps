import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const hash = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())

export const molecularEmbeddingRequestSchema = z.object({
  featureKinds: z.array(z.enum(['ECFP', 'BCFP'])).min(1).max(2).transform((items) => [...new Set(items)]),
  method: z.enum(['FINGERPRINT_BINARY_VECTOR', 'FUSION_CONCAT']).default('FINGERPRINT_BINARY_VECTOR'),
  normalization: z.literal('L2').default('L2'),
  indexVersion: z.string().trim().min(1).max(120).default('molecular-index/1'),
}).superRefine((value, context) => {
  if (value.method === 'FINGERPRINT_BINARY_VECTOR' && value.featureKinds.length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['featureKinds'], message: 'A fingerprint binary vector requires exactly one feature kind.' })
  }
  if (value.method === 'FUSION_CONCAT' && value.featureKinds.length !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['featureKinds'], message: 'A fusion embedding requires ECFP and BCFP.' })
  }
})
export type MolecularEmbeddingRequest = z.infer<typeof molecularEmbeddingRequestSchema>

export const molecularSimilarityRequestSchema = z.object({
  candidateMaterialId: id,
  featureKind: z.enum(['ECFP', 'BCFP']).default('ECFP'),
  indexVersion: z.string().trim().min(1).max(120).default('molecular-index/1'),
})
export type MolecularSimilarityRequest = z.infer<typeof molecularSimilarityRequestSchema>

export const odorPredictionRequestSchema = z.object({
  modelVersionId: id,
  requestedTask: z.literal('odor-descriptor'),
  requestedTargets: z.array(z.string().regex(/^regression_[a-z0-9_]{1,80}$/)).min(1).max(20).transform((items) => [...new Set(items)]).optional(),
})
export type OdorPredictionRequest = z.infer<typeof odorPredictionRequestSchema>

export const odorResearchPredictionSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  modelId: id,
  modelVersionId: id,
  modelStage: z.literal('RESEARCH'),
  trainingMode: z.literal('FINE_TUNE_FROZEN_PRETRAINED_ENCODER'),
  datasetVersionId: id,
  inputStructureHash: hash,
  canonicalSmiles: z.string().trim().min(1).max(4096),
  rdkitVersion: z.string().trim().min(1).max(80),
  standardizationVersion: z.literal('olfactoryops-rdkit-standardization/1.0.0'),
  predictions: z.array(z.object({
    descriptor: z.string().trim().min(1).max(120),
    targetKey: z.string().regex(/^regression_[a-z0-9_]{1,80}$/),
    score: z.number().finite(),
    scale: z.literal('dataset descriptor response score, source range 0-1; not a probability'),
    uncertainty: z.number().finite().nonnegative(),
    uncertaintyMethod: z.literal('per-target validation residual RMSE'),
  })).min(1).max(20),
  provenance: z.object({
    upstreamCommit: z.string().regex(/^[a-f0-9]{40}$/),
    checkpointSha256: hash,
    evaluationHash: hash,
  }),
  evidenceStatus: z.literal('EVALUATED_RESEARCH'),
  runtimeVersion: z.string().trim().min(1).max(120),
})
export type OdorResearchPrediction = z.infer<typeof odorResearchPredictionSchema>

export const explainabilityRequestSchema = z.object({
  modelVersionId: id.optional(),
  featureKind: z.enum(['MOLFTP', 'OSMORDRED', 'BCFP']).default('MOLFTP'),
  requestedTask: z.string().trim().min(1).max(160),
})
export type ExplainabilityRequest = z.infer<typeof explainabilityRequestSchema>

export const notEvaluatedScientificResultSchema = z.object({
  status: z.literal('NOT_EVALUATED'),
  code: z.enum(['ODOR_MODEL_NOT_EVALUATED', 'EXPLAINABILITY_NOT_EVALUATED']),
  message: z.string().trim().min(1).max(500),
})

export const embeddingManifestSchema = z.object({
  featureArtifactHashes: z.array(hash).min(1).max(2),
  featureManifestHash: hash,
  embeddingHash: hash,
  dimension: z.number().int().positive().max(4096),
})
