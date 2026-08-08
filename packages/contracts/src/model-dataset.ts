import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const key = z.string().trim().regex(/^[a-z][a-z0-9_-]{1,79}$/)
const hash = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
const url = z.string().url().max(2048)

export const datasetStatusSchema = z.enum(['DRAFT', 'REVIEW_REQUIRED', 'APPROVED', 'ARCHIVED', 'BLOCKED'])
export const modelStageSchema = z.enum(['RESEARCH', 'CANDIDATE', 'PRODUCTION', 'RETIRED'])
export const modelStatusSchema = datasetStatusSchema
export const splitStrategySchema = z.enum(['SCAFFOLD_GROUP', 'TIME_SPLIT'])
export const splitRoleSchema = z.enum(['TRAIN', 'VALIDATION', 'TEST'])
export const architectureKeySchema = z.enum(['KGCNN', 'TRANSFORMER_CNN'])
export const modelComponentKeySchema = z.enum(['KGCNN_KERAS_UNLOCKED', 'TRANSFORMER_CNN'])
export const scientificFeatureContractKindSchema = z.enum(['ECFP', 'BCFP', 'MOLFTP', 'OSMORDRED', 'SMILES_TOKENS', 'MOLECULAR_GRAPH'])

export const datasetLicenseInputSchema = z.object({
  spdxId: z.string().trim().min(1).max(120),
  attribution: z.string().trim().min(1).max(4000),
  usagePolicy: z.string().trim().min(1).max(4000),
  evidenceUrl: url.optional(),
  evidenceStatus: z.enum(['VERIFIED', 'REVIEW_REQUIRED', 'BLOCKED']).default('REVIEW_REQUIRED'),
})

export const datasetTransformationInputSchema = z.object({
  key: z.string().trim().min(1).max(120),
  version: z.string().trim().min(1).max(120),
  codeRef: z.string().trim().min(1).max(2048),
  configurationHash: hash,
  inputHash: hash,
  outputHash: hash,
})

export const datasetArtifactInputSchema = z.object({
  kind: z.enum(['MANIFEST', 'SPLIT', 'TRAINING', 'VALIDATION', 'TEST', 'LICENSE_EVIDENCE', 'METRICS']),
  storageRef: z.string().trim().min(1).max(2048),
  contentHash: hash,
  schemaVersion: z.string().trim().min(1).max(120),
})

export const createDatasetRequestSchema = z.object({
  key,
  name: z.string().trim().min(1).max(200),
  task: z.string().trim().min(1).max(240),
})
export type CreateDatasetRequest = z.infer<typeof createDatasetRequestSchema>

export const registerDatasetVersionRequestSchema = z.object({
  version: z.string().trim().min(1).max(120),
  sourceRepository: url,
  sourcePath: z.string().trim().min(1).max(2048).optional(),
  sourceCommit: z.string().trim().min(1).max(160),
  citation: z.string().trim().min(1).max(4000),
  sourceVersion: z.string().trim().min(1).max(160),
  schemaVersion: z.string().trim().min(1).max(120),
  contentChecksum: hash,
  materialUniverseHash: hash,
  rowCount: z.number().int().nonnegative(),
  license: datasetLicenseInputSchema,
  transformations: z.array(datasetTransformationInputSchema).min(1).max(40),
  artifacts: z.array(datasetArtifactInputSchema).min(1).max(20),
})
export type RegisterDatasetVersionRequest = z.infer<typeof registerDatasetVersionRequestSchema>

export const registerModelRequestSchema = z.object({
  key,
  name: z.string().trim().min(1).max(200),
  intendedUse: z.string().trim().min(1).max(2000),
})
export type RegisterModelRequest = z.infer<typeof registerModelRequestSchema>

export const registerModelVersionRequestSchema = z.object({
  version: z.string().trim().min(1).max(120),
  architecture: z.object({
    key: architectureKeySchema,
    version: z.string().trim().min(1).max(120),
    componentKey: modelComponentKeySchema,
    configurationHash: hash,
  }).superRefine((value, ctx) => {
    const expected = value.key === 'KGCNN' ? 'KGCNN_KERAS_UNLOCKED' : 'TRANSFORMER_CNN'
    if (value.componentKey !== expected) ctx.addIssue({ code: 'custom', path: ['componentKey'], message: 'The architecture must use its pinned upstream component.' })
  }),
  featureContract: z.object({
    key: z.string().trim().min(1).max(120),
    version: z.string().trim().min(1).max(120),
    featureKinds: z.array(scientificFeatureContractKindSchema).min(1).max(8).transform((items) => [...new Set(items)]),
    schemaHash: hash,
  }),
  trainingTask: z.string().trim().min(1).max(500),
  modelCard: z.object({
    purpose: z.string().trim().min(1).max(2000),
    limitations: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    prohibitedInterpretations: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  }),
  checkpoint: z.object({
    storageRef: z.string().trim().min(1).max(2048),
    checkpointHash: hash,
    format: z.enum(['KERAS', 'TENSORFLOW_SAVEDMODEL', 'H5', 'ONNX', 'OTHER']),
  }),
})
export type RegisterModelVersionRequest = z.infer<typeof registerModelVersionRequestSchema>

const trainingDatasetRelationSchema = z.object({
  datasetVersionId: id,
  splitRole: splitRoleSchema,
  splitArtifactHash: hash,
  groupSetHash: hash,
})

export const createTrainingRunRequestSchema = z.object({
  seed: z.number().int().min(0).max(2_147_483_647),
  splitStrategy: splitStrategySchema,
  splitManifestHash: hash,
  configurationHash: hash,
  datasets: z.array(trainingDatasetRelationSchema).length(3),
}).superRefine((value, ctx) => {
  const roles = value.datasets.map((item) => item.splitRole)
  if (new Set(roles).size !== 3) ctx.addIssue({ code: 'custom', path: ['datasets'], message: 'Training, validation, and test partitions are all required.' })
  const groupSets = value.datasets.map((item) => item.groupSetHash)
  if (new Set(groupSets).size !== 3) ctx.addIssue({ code: 'custom', path: ['datasets'], message: 'Partition group sets must be distinct to prove a leakage-safe split.' })
})
export type CreateTrainingRunRequest = z.infer<typeof createTrainingRunRequestSchema>

export const recordEvaluationRequestSchema = z.object({
  datasetVersionId: id,
  protocolVersion: z.string().trim().min(1).max(120),
  leakageStatus: z.literal('PASS'),
  metrics: z.array(z.object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_.-]{1,119}$/),
    value: z.number().finite(),
    unit: z.string().trim().min(1).max(80).optional(),
  })).min(1).max(80).superRefine((items, ctx) => {
    if (new Set(items.map((item) => item.key)).size !== items.length) ctx.addIssue({ code: 'custom', message: 'Metric keys must be unique.' })
  }),
})
export type RecordEvaluationRequest = z.infer<typeof recordEvaluationRequestSchema>

export const modelDatasetNotConfiguredSchema = z.object({
  status: z.literal('NOT_CONFIGURED'),
  code: z.literal('MODEL_RUNTIME_NOT_CONFIGURED'),
  message: z.string().trim().min(1).max(500),
})
