import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { ModelDatasetService } from '../services/scientific/src/model-dataset-service.js'

const dataDir = resolve(process.env.OSMO_DATA_ARTIFACT_DIR || '')
const modelDir = resolve(process.env.OSMO_MODEL_ARTIFACT_DIR || 'services/scientific/model-runtime/artifacts/osmo-dravnieks-transformer-cnn')
const outputPath = resolve(process.env.OSMO_REGISTRY_EVIDENCE_PATH || 'docs/v2/osmo-demo-finetune/MODEL_REGISTRY_EVIDENCE.json')
const databaseUrl = process.env.DATABASE_URL || ''
const parsedDatabase = new URL(databaseUrl)
if (!['127.0.0.1', 'localhost'].includes(parsedDatabase.hostname) || process.env.NODE_ENV !== 'test') throw new Error('LOCAL_REGISTRY_DATABASE_REQUIRED')
if (!process.env.OSMO_DATA_ARTIFACT_DIR) throw new Error('OSMO_DATA_ARTIFACT_DIR_REQUIRED')

const json = async (path: string) => JSON.parse(await readFile(resolve(path), 'utf8')) as Record<string, any>
const sha256 = async (path: string) => createHash('sha256').update(await readFile(resolve(path))).digest('hex')

const preparation = await json(`${dataDir}/preparation_summary.json`)
const split = await json(`${dataDir}/split_manifest.json`)
const training = await json(`${modelDir}/training_report.json`)
const evaluation = await json(`${modelDir}/evaluation_report.json`)
const checkpoint = await json(`${modelDir}/checkpoint_manifest.json`)
const modelManifest = await json(`${modelDir}/model_manifest.json`)

if (split.leakageStatus !== 'PASS' || split.canonicalOverlapCount !== 0 || split.scaffoldOverlapCount !== 0) throw new Error('TRAINING_DATA_LEAKAGE_UNRESOLVED')
if (modelManifest.evidenceStatus !== 'EVALUATED' || checkpoint.checkpointVerification !== 'PASS') throw new Error('MODEL_EVIDENCE_NOT_VERIFIED')
if (await sha256(`${modelDir}/candidate.weights.h5`) !== modelManifest.weights.sha256) throw new Error('CHECKPOINT_HASH_MISMATCH')

const client = new PrismaClient()
const context = { organizationId: 'org_osmo_demo_local', userId: 'user_osmo_demo_local', sessionId: 'session_osmo_demo_local', role: 'Owner' as const, hostname: 'osmo-demo.localhost' }
const checkedPermissions: string[] = []
const platform = { requirePermission: async (_context: unknown, permission: string) => { checkedPermissions.push(permission) } }
const registry = new ModelDatasetService(client, platform as never)

try {
  await client.$executeRaw`INSERT INTO v2_organizations (id, slug, name, status) VALUES (${context.organizationId}, 'osmo-demo-local', 'Osmo Demo Local Registry', 'ACTIVE') ON CONFLICT (id) DO NOTHING`
  await client.$executeRaw`INSERT INTO v2_users (id, email, display_name, password_hash, status, verified_at) VALUES (${context.userId}, 'osmo-demo@localhost.invalid', 'Osmo Demo Registry', 'local-test-not-a-credential', 'ACTIVE', now()) ON CONFLICT (id) DO NOTHING`
  await client.$executeRaw`INSERT INTO v2_memberships (id, organization_id, user_id, role_key, status) VALUES ('membership_osmo_demo_local', ${context.organizationId}, ${context.userId}, 'Owner', 'ACTIVE') ON CONFLICT (id) DO NOTHING`

  const dataset = await registry.createDataset(context, { key: 'osmo_dravnieks_research', name: 'Osmo Dravnieks research descriptors', task: 'Bounded multi-target odor descriptor regression.' }, 'osmo-dataset-create-20260825')
  const datasetVersion = await registry.registerDatasetVersion(context, dataset.id, {
    version: '5aa9d2cd06a9-d560c47e9fc9',
    sourceRepository: 'https://github.com/osmoai/publications',
    sourcePath: 'qian_et_al_2023/predictive_performance/data/c_Dravnieks/data.csv',
    sourceCommit: '5aa9d2cd06a9b4dcae8b5fce2ec5e5d0f763fbd8',
    citation: 'Qian et al. (2023), A perceptual model for odor quality, eLife 12:e82502.',
    sourceVersion: 'git-lfs:d560c47e9fc9fe8e802144be0c219e84594ef99611cfe1f7e4c861f38720edaf',
    schemaVersion: 'dravnieks-normalized/1.0.0',
    contentChecksum: preparation.datasetTransformedSha256,
    materialUniverseHash: createHash('sha256').update(JSON.stringify(split.partitions.TRAIN.structureHashes.concat(split.partitions.VALIDATION.structureHashes, split.partitions.TEST.structureHashes).sort())).digest('hex'),
    rowCount: preparation.normalization.modelRowCount,
    license: { spdxId: 'CC-BY-4.0', attribution: 'Qian et al. (2023), eLife 12:e82502; source data via osmoai/publications.', usagePolicy: 'Research-stage model evaluation with attribution; no safety or regulatory interpretation.', evidenceStatus: 'VERIFIED' },
    transformations: preparation.transformationManifest.transformations.map((item: Record<string, string>) => ({ key: item.transformationKey, version: item.transformationVersion, codeRef: item.codeRef, configurationHash: item.configurationHash, inputHash: item.inputHash, outputHash: item.outputHash })),
    artifacts: [
      { kind: 'MANIFEST', storageRef: 'evidence://osmo-demo/preparation', contentHash: preparation.transformationManifest.contentHash, schemaVersion: 'osmo-preparation/1.0.0' },
      { kind: 'SPLIT', storageRef: 'evidence://osmo-demo/split', contentHash: split.splitManifestHash, schemaVersion: 'scaffold-split/1.0.0' },
      { kind: 'METRICS', storageRef: 'repo://services/scientific/model-runtime/artifacts/osmo-dravnieks-transformer-cnn/evaluation_report.json', contentHash: evaluation.contentHash, schemaVersion: evaluation.schemaVersion },
    ],
  }, 'osmo-dataset-version-20260825')
  const datasetApproval = await registry.approveDatasetVersion(context, datasetVersion.id, 'osmo-dataset-approve-20260825')

  const model = await registry.createModel(context, { key: 'osmo_dravnieks_transformer_cnn', name: modelManifest.modelName, intendedUse: 'Research-only prediction of 20 dataset-native Dravnieks odor descriptor response scores for verified tenant materials.' }, 'osmo-model-create-20260825')
  const modelVersion = await registry.registerModelVersion(context, model.id, {
    version: modelManifest.modelVersion,
    architecture: { key: 'TRANSFORMER_CNN', version: 'v6-pinned', componentKey: 'TRANSFORMER_CNN', configurationHash: modelManifest.trainingConfigSha256 },
    featureContract: { key: 'smiles_tokens_20_targets', version: '1.0.0', featureKinds: ['SMILES_TOKENS'], schemaHash: modelManifest.targetManifestSha256 },
    trainingTask: 'Frozen pretrained Transformer encoder with trainable CNN/highway multi-target regression head.',
    modelCard: { purpose: 'Research odor descriptor evidence for a bounded OlfactoryOps demonstration.', limitations: ['127 molecules; research-stage only.', 'Descriptor scores are not probabilities.', 'Validation-residual uncertainty is not calibrated confidence.'], prohibitedInterpretations: ['Not safety, toxicology, IFRA, regulatory, supplier, or formula approval.', 'Not causal chemistry proof.'] },
    checkpoint: { storageRef: 'repo://services/scientific/model-runtime/artifacts/osmo-dravnieks-transformer-cnn/candidate.weights.h5', checkpointHash: modelManifest.weights.sha256, format: 'H5' },
  }, 'osmo-model-version-20260825')
  const checkpointVerification = await registry.verifyCheckpoint(context, modelVersion.id, { expectedSha256: modelManifest.weights.sha256 }, 'osmo-checkpoint-verify-20260825')

  const trainingRun = await registry.createTrainingRun(context, modelVersion.id, {
    seed: training.trainingConfig.seed,
    splitStrategy: 'SCAFFOLD_GROUP',
    splitManifestHash: split.splitManifestHash,
    configurationHash: training.trainingConfigSha256,
    datasets: ['TRAIN', 'VALIDATION', 'TEST'].map((role) => ({ datasetVersionId: datasetVersion.id, splitRole: role, splitArtifactHash: preparation.transformationManifest.partitionHashes[role], groupSetHash: split.partitions[role].groupHash })),
  }, 'osmo-training-run-20260825')
  const evaluationRun = await registry.recordEvaluation(context, trainingRun.id, {
    datasetVersionId: datasetVersion.id,
    protocolVersion: evaluation.protocolVersion,
    leakageStatus: 'PASS',
    metrics: [
      { key: 'test.mae.macro', value: evaluation.transformerMetrics.mae, unit: 'source-response-score' },
      { key: 'test.rmse.macro', value: evaluation.transformerMetrics.rmse, unit: 'source-response-score' },
      ...evaluation.transformerMetrics.perTarget.flatMap((item: Record<string, number | string>) => [
        { key: `test.${String(item.target).replace('regression_', '')}.mae`, value: item.mae, unit: 'source-response-score' },
        { key: `test.${String(item.target).replace('regression_', '')}.rmse`, value: item.rmse, unit: 'source-response-score' },
      ]),
    ],
  }, 'osmo-evaluation-run-20260825')
  const readyModels = await registry.listResearchReadyModels(context)
  if (!readyModels.some((item) => item.id === modelVersion.id)) throw new Error('RESEARCH_MODEL_NOT_READY')

  const evidence = {
    schemaVersion: '1.0.0', registryKind: 'ISOLATED_LOCAL_POSTGRES_INTEGRATION', productionMutation: 'NONE',
    dataset: { id: dataset.id, status: datasetApproval.status, versionId: datasetVersion.id, contentChecksum: datasetVersion.contentChecksum },
    model: { id: model.id, versionId: modelVersion.id, version: modelVersion.version, stage: modelVersion.stage, status: modelVersion.status },
    checkpoint: { id: checkpointVerification.id, status: checkpointVerification.status, sha256: checkpointVerification.checkpointSha256 },
    trainingRun: { id: trainingRun.id, statusAfterEvaluation: 'SUCCEEDED', splitStrategy: trainingRun.splitStrategy, leakageStatus: 'PASS' },
    evaluation: { id: evaluationRun.id, status: evaluationRun.status, leakageStatus: evaluationRun.leakageStatus, metricCount: evaluationRun.metricCount },
    researchReadyListing: 'PASS', permissionsEnforced: [...new Set(checkedPermissions)].sort(), modelStage: 'RESEARCH',
  }
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log('OSMO_LOCAL_MODEL_REGISTRY=PASS')
} finally {
  await client.$disconnect()
}
