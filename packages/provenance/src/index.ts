import { z } from 'zod'

const id = z.string().trim().min(1).max(200)
const hash = z.string().regex(/^[a-f0-9]{64}$/i)

export const sourceRefSchema = z.object({
  sourceId: id,
  locator: z.string().trim().min(1).max(2048),
  title: z.string().trim().min(1).max(500).optional(),
  publisher: z.string().trim().max(240).optional(),
})
export type SourceRef = z.infer<typeof sourceRefSchema>

export const datasetLicenseSchema = z.object({
  spdxId: z.string().trim().min(1).max(120),
  attribution: z.string().trim().max(2000).optional(),
  usagePolicy: z.string().trim().max(2000).optional(),
})
export type DatasetLicense = z.infer<typeof datasetLicenseSchema>

export const datasetVersionSchema = z.object({
  datasetId: id,
  version: id,
  checksum: hash,
  source: sourceRefSchema,
  license: datasetLicenseSchema,
})
export type DatasetVersion = z.infer<typeof datasetVersionSchema>
export const datasetRefSchema = datasetVersionSchema.pick({ datasetId: true, version: true, checksum: true })
export type DatasetRef = z.infer<typeof datasetRefSchema>

export const componentRefSchema = z.object({
  name: id,
  repository: z.string().url().max(2048),
  license: id,
  upstreamRef: id,
  upstreamCommit: id.nullable(),
  adapterVersion: id,
})
export type ComponentRef = z.infer<typeof componentRefSchema>

export const modelRefSchema = z.object({
  modelId: id,
  version: id,
  architecture: id,
  codeRef: id,
  checkpointHash: hash.nullable(),
})
export type ModelRef = z.infer<typeof modelRefSchema>

export const modelVersionSchema = modelRefSchema.extend({
  trainingRunId: id.nullable(),
  featureContract: id,
  datasets: z.array(datasetRefSchema),
  components: z.array(componentRefSchema),
})
export type ModelVersion = z.infer<typeof modelVersionSchema>

export const artifactRefSchema = z.object({
  artifactId: id,
  kind: id,
  uri: z.string().trim().min(1).max(2048),
  checksum: hash,
  schemaVersion: id,
})
export type ArtifactRef = z.infer<typeof artifactRefSchema>

export const transformationRefSchema = z.object({
  transformationId: id,
  version: id,
  codeRef: id,
  inputHash: hash,
  outputHash: hash,
})
export type TransformationRef = z.infer<typeof transformationRefSchema>

export const predictionProvenanceSchema = z.object({
  predictionId: id,
  model: modelVersionSchema,
  featureContract: id,
  datasets: z.array(datasetVersionSchema),
  sources: z.array(sourceRefSchema),
  transformations: z.array(transformationRefSchema),
  artifacts: z.array(artifactRefSchema),
})
export type PredictionProvenance = z.infer<typeof predictionProvenanceSchema>
