import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  createDatasetRequestSchema,
  createTrainingRunRequestSchema,
  recordEvaluationRequestSchema,
  registerDatasetVersionRequestSchema,
  registerModelRequestSchema,
  registerModelVersionRequestSchema,
  verifyModelCheckpointRequestSchema,
} from '../../../packages/contracts/src/model-dataset.js'
import { PlatformError, PlatformService } from '../../platform/src/service.js'
import type { PlatformContext } from '../../platform/src/types.js'
import { researchEligibleEvaluationStatuses } from './research-model-eligibility.js'

type Transaction = Prisma.TransactionClient
type JsonRecord = Record<string, unknown>
type IdempotencyRow = { requestHash: string; response: unknown }
type DatasetRow = { id: string; datasetKey: string; name: string; task: string; status: string }
type DatasetVersionRow = { id: string; datasetId: string; version: string; status: string; contentChecksum: string; materialUniverseHash: string }
type ModelRow = { id: string; modelKey: string; name: string; intendedUse: string; status: string }
type ModelVersionRow = { id: string; modelId: string; version: string; stage: string; status: string }
type TrainingRunRow = { id: string; modelVersionId: string; splitManifestHash: string; configurationHash: string; status: string }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: unknown) { return createHash('sha256').update(stableJson(value)).digest('hex') }
function identifier(prefix: string) { return `${prefix}_${randomUUID().replaceAll('-', '')}` }

/**
 * Phase 4 provenance registry. The service deliberately stores source and
 * evaluation evidence separately from model execution. A registry record is
 * not permission to load a weight file or make a scientific prediction.
 */
export class ModelDatasetService {
  constructor(private readonly client: PrismaClient, private readonly platform: PlatformService) {}

  private async scoped<T>(context: PlatformContext, action: (tx: Transaction) => Promise<T>) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId}, true)`
      return action(tx)
    })
  }

  private async requireView(context: PlatformContext) {
    await this.platform.requirePermission(context, 'scientific_ai.use')
  }

  private async requireManage(context: PlatformContext) {
    await this.platform.requirePermission(context, 'scientific_ai.manage')
  }

  private async audit(tx: Transaction, context: PlatformContext, action: string, outcome: 'allowed' | 'blocked', subjectType: string, subjectId: string, payload?: unknown) {
    await tx.$executeRaw`
      INSERT INTO v2_audit_events (id, organization_id, actor_user_id, action, outcome, subject_type, subject_id, correlation_id, payload_hash)
      VALUES (${identifier('audit')}, ${context.organizationId}, ${context.userId}, ${action}, ${outcome}, ${subjectType}, ${subjectId}, ${identifier('corr')}, ${payload === undefined ? null : digest(payload)})
    `
  }

  private async idempotent<T extends JsonRecord>(context: PlatformContext, route: string, key: string | undefined, request: unknown, action: (tx: Transaction) => Promise<T>) {
    if (!key || key.length < 12 || key.length > 200) throw new PlatformError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key for this operation.', 428)
    const requestHash = digest(request)
    return this.scoped(context, async (tx) => {
      const existing = await tx.$queryRaw<IdempotencyRow[]>`
        SELECT request_hash AS "requestHash", response FROM v2_operation_idempotency
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
      `
      if (existing.length) {
        if (existing[0].requestHash !== requestHash) throw new PlatformError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.', 409)
        if (!existing[0].response) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
        return existing[0].response as T
      }
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO v2_operation_idempotency (id, organization_id, actor_user_id, route, idempotency_key, request_hash)
        VALUES (${identifier('idem')}, ${context.organizationId}, ${context.userId}, ${route}, ${key}, ${requestHash})
        ON CONFLICT (organization_id, actor_user_id, route, idempotency_key) DO NOTHING
        RETURNING id
      `
      if (!inserted.length) throw new PlatformError('OPERATION_IN_PROGRESS', 'The original operation is still being completed.', 409)
      const result = await action(tx)
      await tx.$executeRaw`
        UPDATE v2_operation_idempotency SET response = ${JSON.stringify(result)}::jsonb
        WHERE organization_id = ${context.organizationId} AND actor_user_id = ${context.userId} AND route = ${route} AND idempotency_key = ${key}
      `
      return result
    })
  }

  private async dataset(tx: Transaction, context: PlatformContext, datasetId: string): Promise<DatasetRow> {
    const rows = await tx.$queryRaw<DatasetRow[]>`
      SELECT id, dataset_key AS "datasetKey", name, task, status
      FROM v2_datasets WHERE id = ${datasetId} AND organization_id = ${context.organizationId}
    `
    if (!rows[0]) throw new PlatformError('DATASET_NOT_FOUND', 'The requested dataset is not available in this workspace.', 404)
    return rows[0]
  }

  private async datasetVersion(tx: Transaction, context: PlatformContext, versionId: string): Promise<DatasetVersionRow> {
    const rows = await tx.$queryRaw<DatasetVersionRow[]>`
      SELECT id, dataset_id AS "datasetId", version, status, content_checksum AS "contentChecksum", material_universe_hash AS "materialUniverseHash"
      FROM v2_dataset_versions WHERE id = ${versionId} AND organization_id = ${context.organizationId}
    `
    if (!rows[0]) throw new PlatformError('DATASET_VERSION_NOT_FOUND', 'The requested dataset version is not available in this workspace.', 404)
    return rows[0]
  }

  private async model(tx: Transaction, context: PlatformContext, modelId: string): Promise<ModelRow> {
    const rows = await tx.$queryRaw<ModelRow[]>`
      SELECT id, model_key AS "modelKey", name, intended_use AS "intendedUse", status
      FROM v2_models WHERE id = ${modelId} AND organization_id = ${context.organizationId}
    `
    if (!rows[0]) throw new PlatformError('MODEL_NOT_FOUND', 'The requested model is not available in this workspace.', 404)
    return rows[0]
  }

  private async modelVersion(tx: Transaction, context: PlatformContext, modelVersionId: string): Promise<ModelVersionRow> {
    const rows = await tx.$queryRaw<ModelVersionRow[]>`
      SELECT id, model_id AS "modelId", version, stage, status
      FROM v2_model_versions WHERE id = ${modelVersionId} AND organization_id = ${context.organizationId}
    `
    if (!rows[0]) throw new PlatformError('MODEL_VERSION_NOT_FOUND', 'The requested model version is not available in this workspace.', 404)
    return rows[0]
  }

  async createDataset(context: PlatformContext, rawInput: unknown, idempotencyKey?: string) {
    await this.requireManage(context)
    const parsed = createDatasetRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a valid dataset key, name, and task.', 422)
    return this.idempotent(context, 'model-dataset.datasets.create', idempotencyKey, parsed.data, async (tx) => {
      const id = identifier('dataset')
      try {
        await tx.$executeRaw`
          INSERT INTO v2_datasets (id, organization_id, dataset_key, name, task, status, created_by)
          VALUES (${id}, ${context.organizationId}, ${parsed.data.key}, ${parsed.data.name}, ${parsed.data.task}, 'REVIEW_REQUIRED', ${context.userId})
        `
      } catch {
        throw new PlatformError('DATASET_CONFLICT', 'A dataset already uses this key in the current workspace.', 409)
      }
      await this.audit(tx, context, 'model_dataset.dataset.create', 'allowed', 'dataset', id, { key: parsed.data.key, task: parsed.data.task })
      return { id, key: parsed.data.key, name: parsed.data.name, task: parsed.data.task, status: 'REVIEW_REQUIRED' }
    })
  }

  async registerDatasetVersion(context: PlatformContext, datasetId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.requireManage(context)
    const parsed = registerDatasetVersionRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide complete source, license, checksum, transformation, and artifact evidence.', 422)
    return this.idempotent(context, 'model-dataset.datasets.version.register', idempotencyKey, { datasetId, ...parsed.data }, async (tx) => {
      await this.dataset(tx, context, datasetId)
      const id = identifier('datasetver')
      try {
        await tx.$executeRaw`
          INSERT INTO v2_dataset_versions (id, organization_id, dataset_id, version, source_repository, source_path, source_commit, citation, source_version, schema_version, content_checksum, material_universe_hash, row_count, created_by)
          VALUES (${id}, ${context.organizationId}, ${datasetId}, ${parsed.data.version}, ${parsed.data.sourceRepository}, ${parsed.data.sourcePath ?? null}, ${parsed.data.sourceCommit}, ${parsed.data.citation}, ${parsed.data.sourceVersion}, ${parsed.data.schemaVersion}, ${parsed.data.contentChecksum}, ${parsed.data.materialUniverseHash}, ${parsed.data.rowCount}, ${context.userId})
        `
      } catch {
        throw new PlatformError('DATASET_VERSION_CONFLICT', 'This dataset version or checksum is already registered.', 409)
      }
      const license = parsed.data.license
      await tx.$executeRaw`
        INSERT INTO v2_dataset_licenses (id, organization_id, dataset_version_id, spdx_id, attribution, usage_policy, evidence_url, evidence_status)
        VALUES (${identifier('datasetlic')}, ${context.organizationId}, ${id}, ${license.spdxId}, ${license.attribution}, ${license.usagePolicy}, ${license.evidenceUrl ?? null}, ${license.evidenceStatus})
      `
      for (const item of parsed.data.transformations) {
        await tx.$executeRaw`
          INSERT INTO v2_dataset_transformations (id, organization_id, dataset_version_id, transformation_key, transformation_version, code_ref, configuration_hash, input_hash, output_hash)
          VALUES (${identifier('datasetxform')}, ${context.organizationId}, ${id}, ${item.key}, ${item.version}, ${item.codeRef}, ${item.configurationHash}, ${item.inputHash}, ${item.outputHash})
        `
      }
      for (const item of parsed.data.artifacts) {
        await tx.$executeRaw`
          INSERT INTO v2_dataset_artifacts (id, organization_id, dataset_version_id, artifact_kind, storage_ref, content_hash, schema_version)
          VALUES (${identifier('datasetartifact')}, ${context.organizationId}, ${id}, ${item.kind}, ${item.storageRef}, ${item.contentHash}, ${item.schemaVersion})
        `
      }
      await this.audit(tx, context, 'model_dataset.dataset_version.register', 'allowed', 'dataset_version', id, { datasetId, version: parsed.data.version, checksum: parsed.data.contentChecksum, license: license.spdxId })
      return { id, datasetId, version: parsed.data.version, status: 'REVIEW_REQUIRED', contentChecksum: parsed.data.contentChecksum, rowCount: parsed.data.rowCount }
    })
  }

  async approveDatasetVersion(context: PlatformContext, datasetVersionId: string, idempotencyKey?: string) {
    await this.requireManage(context)
    return this.idempotent(context, 'model-dataset.datasets.version.approve', idempotencyKey, { datasetVersionId }, async (tx) => {
      const version = await this.datasetVersion(tx, context, datasetVersionId)
      const licenses = await tx.$queryRaw<Array<{ evidenceStatus: string }>>`
        SELECT evidence_status AS "evidenceStatus" FROM v2_dataset_licenses
        WHERE dataset_version_id = ${datasetVersionId} AND organization_id = ${context.organizationId}
      `
      if (!licenses[0] || licenses[0].evidenceStatus === 'BLOCKED') {
        await this.audit(tx, context, 'model_dataset.dataset_version.approve', 'blocked', 'dataset_version', datasetVersionId, { reason: 'LICENSE_EVIDENCE_BLOCKED' })
        throw new PlatformError('DATASET_LICENSE_REVIEW_REQUIRED', 'Dataset license evidence must be reviewable before approval.', 409)
      }
      if (version.status === 'ARCHIVED' || version.status === 'BLOCKED') throw new PlatformError('DATASET_VERSION_NOT_APPROVABLE', 'This dataset version cannot be approved.', 409)
      await tx.$executeRaw`
        UPDATE v2_dataset_versions SET status = 'APPROVED', approved_by = ${context.userId}, approved_at = now()
        WHERE id = ${datasetVersionId} AND organization_id = ${context.organizationId}
      `
      await tx.$executeRaw`UPDATE v2_datasets SET status = 'APPROVED', updated_at = now() WHERE id = ${version.datasetId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'model_dataset.dataset_version.approve', 'allowed', 'dataset_version', datasetVersionId, { checksum: version.contentChecksum })
      return { id: datasetVersionId, status: 'APPROVED' }
    })
  }

  async createModel(context: PlatformContext, rawInput: unknown, idempotencyKey?: string) {
    await this.requireManage(context)
    const parsed = registerModelRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a valid model key, name, and intended use.', 422)
    return this.idempotent(context, 'model-dataset.models.create', idempotencyKey, parsed.data, async (tx) => {
      const id = identifier('model')
      try {
        await tx.$executeRaw`
          INSERT INTO v2_models (id, organization_id, model_key, name, intended_use, status, created_by)
          VALUES (${id}, ${context.organizationId}, ${parsed.data.key}, ${parsed.data.name}, ${parsed.data.intendedUse}, 'REVIEW_REQUIRED', ${context.userId})
        `
      } catch {
        throw new PlatformError('MODEL_CONFLICT', 'A model already uses this key in the current workspace.', 409)
      }
      await this.audit(tx, context, 'model_dataset.model.create', 'allowed', 'model', id, { key: parsed.data.key })
      return { id, key: parsed.data.key, name: parsed.data.name, status: 'REVIEW_REQUIRED' }
    })
  }

  async registerModelVersion(context: PlatformContext, modelId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.requireManage(context)
    const parsed = registerModelVersionRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a pinned architecture, feature contract, model card, and checkpoint reference.', 422)
    return this.idempotent(context, 'model-dataset.models.version.register', idempotencyKey, { modelId, ...parsed.data }, async (tx) => {
      await this.model(tx, context, modelId)
      const component = await tx.$queryRaw<Array<{ componentKey: string; licenseEvidenceStatus: string }>>`
        SELECT component_key AS "componentKey", license_evidence_status AS "licenseEvidenceStatus"
        FROM v2_model_component_pins WHERE component_key = ${parsed.data.architecture.componentKey}
      `
      if (!component[0]) throw new PlatformError('MODEL_COMPONENT_NOT_PINNED', 'The selected model component is not a pinned, approved integration.', 409)
      const architectureId = identifier('arch')
      await tx.$executeRaw`
        INSERT INTO v2_model_architectures (id, organization_id, architecture_key, version, component_key, configuration_hash)
        VALUES (${architectureId}, ${context.organizationId}, ${parsed.data.architecture.key}, ${parsed.data.architecture.version}, ${parsed.data.architecture.componentKey}, ${parsed.data.architecture.configurationHash})
        ON CONFLICT (organization_id, architecture_key, version, configuration_hash) DO NOTHING
      `
      const architecture = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v2_model_architectures
        WHERE organization_id = ${context.organizationId} AND architecture_key = ${parsed.data.architecture.key} AND version = ${parsed.data.architecture.version} AND configuration_hash = ${parsed.data.architecture.configurationHash}
      `
      const featureContractId = identifier('featurecontract')
      await tx.$executeRaw`
        INSERT INTO v2_feature_contracts (id, organization_id, contract_key, version, feature_kinds, schema_hash)
        VALUES (${featureContractId}, ${context.organizationId}, ${parsed.data.featureContract.key}, ${parsed.data.featureContract.version}, ${JSON.stringify(parsed.data.featureContract.featureKinds)}::jsonb, ${parsed.data.featureContract.schemaHash})
        ON CONFLICT (organization_id, contract_key, version, schema_hash) DO NOTHING
      `
      const featureContract = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v2_feature_contracts
        WHERE organization_id = ${context.organizationId} AND contract_key = ${parsed.data.featureContract.key} AND version = ${parsed.data.featureContract.version} AND schema_hash = ${parsed.data.featureContract.schemaHash}
      `
      const id = identifier('modelver')
      try {
        await tx.$executeRaw`
          INSERT INTO v2_model_versions (id, organization_id, model_id, version, architecture_id, feature_contract_id, training_task, stage, status, model_card, created_by)
          VALUES (${id}, ${context.organizationId}, ${modelId}, ${parsed.data.version}, ${architecture[0]!.id}, ${featureContract[0]!.id}, ${parsed.data.trainingTask}, 'RESEARCH', 'REVIEW_REQUIRED', ${JSON.stringify(parsed.data.modelCard)}::jsonb, ${context.userId})
        `
      } catch {
        throw new PlatformError('MODEL_VERSION_CONFLICT', 'This model version is already registered.', 409)
      }
      const checkpointId = identifier('checkpoint')
      await tx.$executeRaw`
        INSERT INTO v2_model_checkpoints (id, organization_id, model_version_id, storage_ref, checkpoint_hash, format)
        VALUES (${checkpointId}, ${context.organizationId}, ${id}, ${parsed.data.checkpoint.storageRef}, ${parsed.data.checkpoint.checkpointHash}, ${parsed.data.checkpoint.format})
      `
      // Registration records provenance only. Evidence and a model card still
      // need review before any version could ever become eligible to serve.
      const registryStatus = 'REVIEW_REQUIRED'
      await this.audit(tx, context, 'model_dataset.model_version.register', 'allowed', 'model_version', id, { modelId, version: parsed.data.version, component: parsed.data.architecture.componentKey, checkpointHash: parsed.data.checkpoint.checkpointHash, licenseEvidenceStatus: component[0].licenseEvidenceStatus })
      return { id, modelId, version: parsed.data.version, stage: 'RESEARCH', status: registryStatus, checkpoint: { id: checkpointId, status: 'PENDING_VERIFICATION' } }
    })
  }

  async createTrainingRun(context: PlatformContext, modelVersionId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.requireManage(context)
    const parsed = createTrainingRunRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Use a complete scaffold or time-based split with three distinct partitions.', 422)
    return this.idempotent(context, 'model-dataset.training-runs.create', idempotencyKey, { modelVersionId, ...parsed.data }, async (tx) => {
      await this.modelVersion(tx, context, modelVersionId)
      for (const relation of parsed.data.datasets) {
        const dataset = await this.datasetVersion(tx, context, relation.datasetVersionId)
        if (dataset.status !== 'APPROVED') {
          await this.audit(tx, context, 'model_dataset.training_run.create', 'blocked', 'dataset_version', relation.datasetVersionId, { reason: 'DATASET_VERSION_NOT_APPROVED' })
          throw new PlatformError('DATASET_VERSION_NOT_APPROVED', 'Every training dataset version must be approved before planning a run.', 409)
        }
      }
      const id = identifier('trainrun')
      try {
        await tx.$executeRaw`
          INSERT INTO v2_training_runs (id, organization_id, model_version_id, seed, split_strategy, split_manifest_hash, configuration_hash, created_by)
          VALUES (${id}, ${context.organizationId}, ${modelVersionId}, ${parsed.data.seed}, ${parsed.data.splitStrategy}, ${parsed.data.splitManifestHash}, ${parsed.data.configurationHash}, ${context.userId})
        `
      } catch {
        throw new PlatformError('TRAINING_RUN_CONFLICT', 'This reproducible training run is already registered.', 409)
      }
      for (const relation of parsed.data.datasets) {
        await tx.$executeRaw`
          INSERT INTO v2_training_dataset_relations (id, organization_id, training_run_id, dataset_version_id, split_role, split_artifact_hash, group_set_hash)
          VALUES (${identifier('traindata')}, ${context.organizationId}, ${id}, ${relation.datasetVersionId}, ${relation.splitRole}, ${relation.splitArtifactHash}, ${relation.groupSetHash})
        `
      }
      await this.audit(tx, context, 'model_dataset.training_run.create', 'allowed', 'training_run', id, { modelVersionId, splitStrategy: parsed.data.splitStrategy, splitManifestHash: parsed.data.splitManifestHash, datasetVersionIds: parsed.data.datasets.map((item) => item.datasetVersionId) })
      return { id, modelVersionId, status: 'PLANNED', leakageStatus: 'PENDING', splitStrategy: parsed.data.splitStrategy }
    })
  }

  async verifyCheckpoint(context: PlatformContext, modelVersionId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.requireManage(context)
    const parsed = verifyModelCheckpointRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide the independently computed checkpoint SHA-256.', 422)
    return this.idempotent(context, 'model-dataset.checkpoints.verify', idempotencyKey, { modelVersionId, ...parsed.data }, async (tx) => {
      await this.modelVersion(tx, context, modelVersionId)
      const checkpoints = await tx.$queryRaw<Array<{ id: string; checkpointHash: string; status: string }>>`
        SELECT id, checkpoint_hash AS "checkpointHash", status FROM v2_model_checkpoints
        WHERE model_version_id = ${modelVersionId} AND organization_id = ${context.organizationId}
      `
      const checkpoint = checkpoints[0]
      if (!checkpoint) throw new PlatformError('MODEL_CHECKPOINT_NOT_FOUND', 'No registered checkpoint is available for this model version.', 404)
      if (checkpoint.status === 'REVOKED' || checkpoint.status === 'BLOCKED') throw new PlatformError('MODEL_CHECKPOINT_BLOCKED', 'The checkpoint is not eligible for verification.', 409)
      if (checkpoint.checkpointHash !== parsed.data.expectedSha256) {
        await this.audit(tx, context, 'model_dataset.checkpoint.verify', 'blocked', 'model_checkpoint', checkpoint.id, { reason: 'CHECKPOINT_HASH_MISMATCH' })
        throw new PlatformError('CHECKPOINT_HASH_MISMATCH', 'The independently verified checkpoint hash does not match the registry.', 409)
      }
      await tx.$executeRaw`UPDATE v2_model_checkpoints SET status = 'VERIFIED', verified_at = now() WHERE id = ${checkpoint.id} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'model_dataset.checkpoint.verify', 'allowed', 'model_checkpoint', checkpoint.id, { checkpointHash: parsed.data.expectedSha256 })
      return { id: checkpoint.id, modelVersionId, status: 'VERIFIED', checkpointSha256: parsed.data.expectedSha256 }
    })
  }

  async recordEvaluation(context: PlatformContext, trainingRunId: string, rawInput: unknown, idempotencyKey?: string) {
    await this.requireManage(context)
    const parsed = recordEvaluationRequestSchema.safeParse(rawInput)
    if (!parsed.success) throw new PlatformError('INVALID_INPUT', 'Provide a leakage-pass evaluation with bounded, unique metrics.', 422)
    return this.idempotent(context, 'model-dataset.evaluations.record', idempotencyKey, { trainingRunId, ...parsed.data }, async (tx) => {
      const training = await tx.$queryRaw<TrainingRunRow[]>`
        SELECT id, model_version_id AS "modelVersionId", split_manifest_hash AS "splitManifestHash", configuration_hash AS "configurationHash", status
        FROM v2_training_runs WHERE id = ${trainingRunId} AND organization_id = ${context.organizationId}
      `
      if (!training[0]) throw new PlatformError('TRAINING_RUN_NOT_FOUND', 'The requested training run is not available in this workspace.', 404)
      const partitions = await tx.$queryRaw<Array<{ datasetVersionId: string; splitRole: string; groupSetHash: string }>>`
        SELECT dataset_version_id AS "datasetVersionId", split_role AS "splitRole", group_set_hash AS "groupSetHash"
        FROM v2_training_dataset_relations WHERE training_run_id = ${trainingRunId} AND organization_id = ${context.organizationId}
      `
      const roles = new Set(partitions.map((item) => item.splitRole))
      const groupHashes = partitions.map((item) => item.groupSetHash)
      const test = partitions.find((item) => item.splitRole === 'TEST')
      if (roles.size !== 3 || groupHashes.length !== 3 || new Set(groupHashes).size !== 3 || !test || test.datasetVersionId !== parsed.data.datasetVersionId) {
        await this.audit(tx, context, 'model_dataset.evaluation.record', 'blocked', 'training_run', trainingRunId, { reason: 'LEAKAGE_PROOF_INVALID' })
        throw new PlatformError('TRAINING_DATA_LEAKAGE_UNRESOLVED', 'A verified, disjoint test partition is required before recording evaluation.', 409)
      }
      const dataset = await this.datasetVersion(tx, context, parsed.data.datasetVersionId)
      if (dataset.status !== 'APPROVED') throw new PlatformError('DATASET_VERSION_NOT_APPROVED', 'The evaluation dataset version is not approved.', 409)
      const id = identifier('evaluation')
      try {
        await tx.$executeRaw`
          INSERT INTO v2_evaluation_runs (id, organization_id, model_version_id, training_run_id, dataset_version_id, protocol_version, status, leakage_status, created_by)
          VALUES (${id}, ${context.organizationId}, ${training[0].modelVersionId}, ${trainingRunId}, ${parsed.data.datasetVersionId}, ${parsed.data.protocolVersion}, 'REVIEW_REQUIRED', 'PASS', ${context.userId})
        `
      } catch {
        throw new PlatformError('EVALUATION_CONFLICT', 'This evaluation protocol has already been recorded for the selected test set.', 409)
      }
      for (const metric of parsed.data.metrics) {
        await tx.$executeRaw`
          INSERT INTO v2_model_metrics (id, organization_id, evaluation_run_id, metric_key, metric_value, unit)
          VALUES (${identifier('metric')}, ${context.organizationId}, ${id}, ${metric.key}, ${metric.value}, ${metric.unit ?? null})
        `
      }
      await tx.$executeRaw`UPDATE v2_training_runs SET status = 'SUCCEEDED', leakage_status = 'PASS', completed_at = now() WHERE id = ${trainingRunId} AND organization_id = ${context.organizationId}`
      await this.audit(tx, context, 'model_dataset.evaluation.record', 'allowed', 'evaluation_run', id, { trainingRunId, datasetVersionId: parsed.data.datasetVersionId, protocol: parsed.data.protocolVersion, metricKeys: parsed.data.metrics.map((item) => item.key) })
      return { id, trainingRunId, modelVersionId: training[0].modelVersionId, status: 'REVIEW_REQUIRED', leakageStatus: 'PASS', metricCount: parsed.data.metrics.length }
    })
  }

  async listDatasets(context: PlatformContext) {
    await this.requireView(context)
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<DatasetRow & { versionCount: bigint }>>`
        SELECT dataset.id, dataset.dataset_key AS "datasetKey", dataset.name, dataset.task, dataset.status, count(version.id) AS "versionCount"
        FROM v2_datasets dataset LEFT JOIN v2_dataset_versions version ON version.dataset_id = dataset.id AND version.organization_id = dataset.organization_id
        WHERE dataset.organization_id = ${context.organizationId}
        GROUP BY dataset.id ORDER BY dataset.created_at DESC, dataset.id DESC
      `
      return rows.map((row) => ({ ...row, versionCount: Number(row.versionCount) }))
    })
  }

  async datasetDetail(context: PlatformContext, datasetId: string) {
    await this.requireView(context)
    return this.scoped(context, async (tx) => {
      const dataset = await this.dataset(tx, context, datasetId)
      const versions = await tx.$queryRaw<Array<DatasetVersionRow & { sourceRepository: string; sourceCommit: string; rowCount: number; license: string | null }>>`
        SELECT version.id, version.dataset_id AS "datasetId", version.version, version.status, version.content_checksum AS "contentChecksum", version.material_universe_hash AS "materialUniverseHash", version.source_repository AS "sourceRepository", version.source_commit AS "sourceCommit", version.row_count AS "rowCount", license.spdx_id AS license
        FROM v2_dataset_versions version LEFT JOIN v2_dataset_licenses license ON license.dataset_version_id = version.id AND license.organization_id = version.organization_id
        WHERE version.dataset_id = ${datasetId} AND version.organization_id = ${context.organizationId}
        ORDER BY version.created_at DESC, version.id DESC
      `
      return { ...dataset, versions }
    })
  }

  async listModels(context: PlatformContext) {
    await this.requireView(context)
    return this.scoped(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<ModelRow & { versionCount: bigint }>>`
        SELECT model.id, model.model_key AS "modelKey", model.name, model.intended_use AS "intendedUse", model.status, count(version.id) AS "versionCount"
        FROM v2_models model LEFT JOIN v2_model_versions version ON version.model_id = model.id AND version.organization_id = model.organization_id
        WHERE model.organization_id = ${context.organizationId}
        GROUP BY model.id ORDER BY model.created_at DESC, model.id DESC
      `
      return rows.map((row) => ({ ...row, versionCount: Number(row.versionCount) }))
    })
  }

  async listResearchReadyModels(context: PlatformContext) {
    await this.requireView(context)
    return this.scoped(context, async (tx) => {
      return tx.$queryRaw<Array<{ id: string; modelId: string; name: string; version: string; stage: 'RESEARCH'; trainingMode: string; datasetVersion: string; evaluationStatus: string }>>`
        SELECT version.id, version.model_id AS "modelId", model.name, version.version, version.stage,
          coalesce(version.model_card->>'trainingMode', 'FINE_TUNE_FROZEN_PRETRAINED_ENCODER') AS "trainingMode",
          evidence."datasetVersion", evidence."evaluationStatus"
        FROM v2_model_versions version
        JOIN v2_models model ON model.id = version.model_id AND model.organization_id = version.organization_id
        JOIN v2_model_architectures architecture ON architecture.id = version.architecture_id AND architecture.organization_id = version.organization_id AND architecture.component_key = 'TRANSFORMER_CNN'
        JOIN LATERAL (
          SELECT dataset.version AS "datasetVersion", evaluation.status AS "evaluationStatus", evaluation.leakage_status AS "evaluationLeakageStatus"
          FROM v2_training_runs training
          JOIN v2_evaluation_runs evaluation ON evaluation.training_run_id = training.id AND evaluation.organization_id = training.organization_id
          JOIN v2_dataset_versions dataset ON dataset.id = evaluation.dataset_version_id AND dataset.organization_id = training.organization_id AND dataset.status = 'APPROVED'
          WHERE training.model_version_id = version.id AND training.organization_id = version.organization_id AND training.status = 'SUCCEEDED' AND training.leakage_status = 'PASS'
          ORDER BY evaluation.created_at DESC, evaluation.id DESC LIMIT 1
        ) evidence ON true
        WHERE version.organization_id = ${context.organizationId} AND version.stage = 'RESEARCH' AND version.status NOT IN ('ARCHIVED','BLOCKED')
          AND evidence."evaluationLeakageStatus" = 'PASS' AND evidence."evaluationStatus" IN (${Prisma.join([...researchEligibleEvaluationStatuses])})
          AND EXISTS (SELECT 1 FROM v2_model_checkpoints checkpoint WHERE checkpoint.model_version_id = version.id AND checkpoint.organization_id = version.organization_id AND checkpoint.status = 'VERIFIED')
        ORDER BY version.created_at DESC, version.id DESC
        LIMIT 20
      `
    })
  }

  async runtimeStatus(context: PlatformContext, modelVersionId: string) {
    await this.requireView(context)
    return this.scoped(context, async (tx) => {
      const version = await this.modelVersion(tx, context, modelVersionId)
      const checkpoints = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM v2_model_checkpoints WHERE model_version_id = ${modelVersionId} AND organization_id = ${context.organizationId}
      `
      return {
        modelVersionId: version.id,
        status: 'NOT_CONFIGURED' as const,
        code: 'MODEL_RUNTIME_NOT_CONFIGURED' as const,
        message: checkpoints.some((item) => item.status === 'VERIFIED')
          ? 'A verified checkpoint is registered, but the isolated model runtime is not configured.'
          : 'A checkpoint must be verified and an isolated model runtime configured before inference is available.',
      }
    })
  }
}
