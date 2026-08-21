import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i)
const smiles = z.string().trim().min(1).max(4096).refine(
  (value) => [...value].every((character) => {
    const code = character.charCodeAt(0)
    return code >= 32 && code !== 127
  }),
  'SMILES must not contain control characters.',
)
const evidenceStatusSchema = z.enum(['VERIFIED', 'REVIEW_REQUIRED', 'NOT_EVALUATED', 'NOT_ENOUGH_EVIDENCE', 'NOT_CONFIGURED', 'BLOCKED'])
const jobStatusSchema = z.enum(['QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'BLOCKED'])
const provenanceReferenceSchema = z.object({
  kind: z.string().trim().min(1).max(80),
  id,
  version: z.string().trim().min(1).max(160).optional(),
  contentHash: z.string().trim().min(1).max(160).optional(),
  sourceUri: z.string().url().max(2048).optional(),
})

export const scientificFeatureKindSchema = z.enum(['ECFP', 'BCFP', 'MOLFTP', 'OSMORDRED'])
export type ScientificFeatureKind = z.infer<typeof scientificFeatureKindSchema>

export const structureNormalizeRequestSchema = z.object({
  smiles,
})
export type StructureNormalizeRequest = z.infer<typeof structureNormalizeRequestSchema>

export const scientificFeatureRequestSchema = z.object({
  featureKinds: z.array(scientificFeatureKindSchema).min(1).max(4).transform((items) => [...new Set(items)]),
})
export type ScientificFeatureRequest = z.infer<typeof scientificFeatureRequestSchema>

export const molecularStructureSchema = z.object({
  canonicalSmiles: smiles,
  inchi: z.string().trim().min(1).max(8192).nullable(),
  inchiKey: z.string().trim().min(1).max(64).nullable(),
  structureHash: sha256,
  inputHash: sha256,
  outputHash: sha256,
  molecularGraph: z.object({
    atoms: z.array(z.object({ index: z.number().int().nonnegative(), symbol: z.string().trim().min(1).max(8), atomicNumber: z.number().int().positive() })).max(1024),
    bonds: z.array(z.object({ begin: z.number().int().nonnegative(), end: z.number().int().nonnegative(), order: z.number().positive() })).max(2048),
  }),
  rdkitVersion: z.string().trim().min(1).max(120),
  standardizationVersion: z.string().trim().min(1).max(120),
})
export type MolecularStructure = z.infer<typeof molecularStructureSchema>

export const scientificRuntimeArtifactSchema = z.object({
  kind: scientificFeatureKindSchema.or(z.literal('STRUCTURE')),
  status: evidenceStatusSchema,
  schemaVersion: z.string().trim().min(1).max(80),
  componentKey: z.string().trim().min(1).max(120),
  componentVersion: z.string().trim().min(1).max(160),
  inputHash: sha256,
  contentHash: sha256,
  payload: z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= 524288, 'Scientific artifact payload is too large.'),
  provenance: z.array(provenanceReferenceSchema).min(1).max(12),
})
export type ScientificRuntimeArtifact = z.infer<typeof scientificRuntimeArtifactSchema>

export const scientificRuntimeResponseSchema = z.object({
  structure: molecularStructureSchema,
  artifacts: z.array(scientificRuntimeArtifactSchema).max(4),
  runtimeVersion: z.string().trim().min(1).max(160),
})
export type ScientificRuntimeResponse = z.infer<typeof scientificRuntimeResponseSchema>

export const scientificJobProjectionSchema = z.object({
  id,
  materialId: id,
  operation: z.enum(['STRUCTURE_NORMALIZE', 'FEATURE_GENERATE']),
  status: jobStatusSchema,
  requestHash: sha256,
  failureCode: z.string().trim().min(1).max(80).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
})
export type ScientificJobProjection = z.infer<typeof scientificJobProjectionSchema>
