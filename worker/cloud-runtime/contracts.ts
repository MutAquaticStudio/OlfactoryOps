import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const hash = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
const reference = z.string().trim().min(1).max(512)

export const cloudRuntimeProtocol = 'cloud-runtime/v1' as const
/**
 * `STAGING_DLQ_TERMINAL_FAILURE_PROBE` is an internal-only acceptance fixture.
 * It has no public dispatcher and the runtime acknowledges it outside staging.
 */
export const cloudJobTypeSchema = z.enum([
  'SCIENTIFIC_FEATURE',
  'SCIENTIFIC_MODEL',
  'RAG_INGESTION',
  'NOTIFICATION_DELIVERY',
  'STAGING_DLQ_TERMINAL_FAILURE_PROBE',
])
export type CloudJobType = z.infer<typeof cloudJobTypeSchema>

export function isStagingDlqTerminalFailureProbe(job: Pick<CloudJobEnvelope, 'jobType'>) {
  return job.jobType === 'STAGING_DLQ_TERMINAL_FAILURE_PROBE'
}

export const cloudJobEnvelopeSchema = z.object({
  protocolVersion: z.literal(cloudRuntimeProtocol),
  jobId: id,
  organizationId: id,
  actorUserId: id.optional(),
  correlationId: id,
  idempotencyKey: z.string().trim().min(16).max(200),
  jobType: cloudJobTypeSchema,
  artifactRef: reference,
  inputHash: hash,
  createdAt: z.string().datetime({ offset: true }),
}).strict()
export type CloudJobEnvelope = z.infer<typeof cloudJobEnvelopeSchema>

export const cloudArtifactManifestSchema = z.object({
  organizationId: id,
  artifactFamily: z.enum(['SCIENTIFIC', 'RAG', 'NOTIFICATION', 'EXPORT']),
  artifactRef: reference,
  contentHash: hash,
  mimeType: z.string().trim().regex(/^[a-z]+\/[a-z0-9.+-]+$/i).max(160),
  schemaVersion: z.string().trim().min(1).max(80),
  provenance: z.object({
    correlationId: id,
    inputHash: hash,
    runtimeImageDigest: z.string().trim().regex(/^sha256:[a-f0-9]{64}$/i).optional(),
    gitSha: z.string().trim().regex(/^[a-f0-9]{7,64}$/i).optional(),
    componentVersions: z.record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(160)).default({}),
    modelVersion: z.string().trim().min(1).max(160).optional(),
  }).strict(),
}).strict()
export type CloudArtifactManifest = z.infer<typeof cloudArtifactManifestSchema>

export const vectorSpaceSchema = z.enum(['MATERIAL_EVIDENCE', 'MOLECULAR_EMBEDDING', 'ODOR_EMBEDDING'])
export type VectorSpace = z.infer<typeof vectorSpaceSchema>

export const vectorWriteSchema = z.object({
  space: vectorSpaceSchema,
  organizationId: id,
  vectorId: id,
  values: z.array(z.number().finite()).min(1).max(8192),
  artifactRef: reference,
  embeddingVersion: z.string().trim().min(1).max(160),
  modelVersion: z.string().trim().min(1).max(160),
  sourceKind: z.string().trim().min(1).max(80),
  status: z.enum(['READY', 'INVALIDATED', 'REVIEW_REQUIRED']).default('READY'),
}).strict()
export type VectorWrite = z.infer<typeof vectorWriteSchema>

export const vectorQuerySchema = z.object({
  space: vectorSpaceSchema,
  organizationId: id,
  values: z.array(z.number().finite()).min(1).max(8192),
  embeddingVersion: z.string().trim().min(1).max(160),
  modelVersion: z.string().trim().min(1).max(160),
  limit: z.number().int().min(1).max(25).default(10),
}).strict()
export type VectorQuery = z.infer<typeof vectorQuerySchema>

export const scientificContainerRequestSchema = z.object({
  jobId: id,
  correlationId: id,
  artifactRef: reference,
  inputHash: hash,
  featureKinds: z.array(z.enum(['ECFP', 'BCFP', 'MOLFTP', 'OSMORDRED'])).min(1).max(4).optional(),
  canonicalSmiles: z.string().trim().min(1).max(4096).refine((value) => [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127), 'SMILES must not contain control characters.').optional(),
  modelVersion: z.string().trim().min(1).max(160).optional(),
  operation: z.enum(['STRUCTURE_NORMALIZE', 'FEATURE_GENERATE', 'MODEL_SMOKE']),
}).strict()
export type ScientificContainerRequest = z.infer<typeof scientificContainerRequestSchema>

export const scientificContainerResponseSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  runtimeVersion: z.string().trim().min(1).max(160).optional(),
  componentVersions: z.record(z.string(), z.string().trim().min(1).max(160)).optional(),
  modelVersion: z.string().trim().min(1).max(160).optional(),
}).strict()
export type ScientificContainerResponse = z.infer<typeof scientificContainerResponseSchema>

export const scientificInputArtifactSchema = z.object({
  canonicalSmiles: z.string().trim().min(1).max(4096).refine((value) => [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127), 'SMILES must not contain control characters.'),
  featureKinds: z.array(z.enum(['ECFP', 'BCFP', 'MOLFTP', 'OSMORDRED'])).min(1).max(4).default(['ECFP']),
}).strict()
export type ScientificInputArtifact = z.infer<typeof scientificInputArtifactSchema>

export const scientificModelInputArtifactSchema = z.object({
  requestKind: z.enum(['MODEL_SMOKE', 'EMBEDDING', 'PREDICTION']).default('MODEL_SMOKE'),
  modelVersion: z.string().trim().min(1).max(160).optional(),
}).strict()
export type ScientificModelInputArtifact = z.infer<typeof scientificModelInputArtifactSchema>

export function safeCloudError(error: unknown): string {
  if (!(error instanceof Error)) return 'CLOUD_RUNTIME_FAILED'
  const code = error.message.trim()
  return /^[A-Z][A-Z0-9_]{2,119}$/.test(code) ? code : 'CLOUD_RUNTIME_FAILED'
}
