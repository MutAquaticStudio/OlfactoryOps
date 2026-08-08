import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { PrismaPlatformRepository } from '../services/platform/src/prisma-repository.js'
import { PlatformService } from '../services/platform/src/service.js'
import { LabOperationsService } from '../services/lab-ops/src/service.js'
import { ScientificFeatureService, type ScientificRuntime } from '../services/scientific/src/service.js'
import { ModelDatasetService } from '../services/scientific/src/model-dataset-service.js'
import { OlfactoryIntelligenceService } from '../services/scientific/src/olfactory-intelligence-service.js'
import { ConsumerIntelligenceService } from '../services/sentiment/src/consumer-intelligence-service.js'

class RlsScientificRuntime implements ScientificRuntime {
  private structure(smiles: string) {
    const canonicalSmiles = smiles === 'OCC' ? 'CCO' : smiles
    const structureHash = 'a'.repeat(64)
    const inputHash = 'b'.repeat(64)
    const outputHash = 'c'.repeat(64)
    return { canonicalSmiles, inchi: null, inchiKey: null, structureHash, inputHash, outputHash, molecularGraph: { atoms: [{ index: 0, symbol: 'C', atomicNumber: 6 }], bonds: [] }, rdkitVersion: 'fixture-rdkit', standardizationVersion: 'fixture-standardization' }
  }
  async normalize(input: { smiles: string }) { return { runtimeVersion: 'rls-science-fixture/1', structure: this.structure(input.smiles), artifacts: [] } }
  async generateFeatures(input: { canonicalSmiles: string; featureKinds: Array<'ECFP' | 'BCFP' | 'MOLFTP' | 'OSMORDRED'> }) {
    const structure = this.structure(input.canonicalSmiles)
    return {
      runtimeVersion: 'rls-science-fixture/1', structure,
      artifacts: input.featureKinds.map((kind) => ({
        kind, status: kind === 'MOLFTP' ? 'NOT_EVALUATED' as const : 'VERIFIED' as const, schemaVersion: `${kind.toLowerCase()}/fixture`, componentKey: kind === 'ECFP' ? 'RDKIT' : kind, componentVersion: 'fixture/1', inputHash: structure.outputHash, contentHash: kind === 'ECFP' ? 'd'.repeat(64) : 'e'.repeat(64),
        payload: kind === 'MOLFTP' ? { reason: 'No target dataset is registered.' } : { onBits: [1, 5, 9], bitLength: 2048, onBitCount: 3 }, provenance: [{ kind: 'component', id: kind === 'ECFP' ? 'RDKIT' : kind, version: 'fixture/1' }],
      })),
    }
  }
}

const localTestDatabaseUrl = 'postgresql://olfactoryops:olfactoryops@127.0.0.1:5432/olfactoryops'
const databaseUrl = process.env.V2_QA_DATABASE_URL || process.env.V2_DATABASE_URL || process.env.DATABASE_URL || (process.env.V2_QA_ENVIRONMENT === 'test' ? localTestDatabaseUrl : undefined)

if (!databaseUrl) throw new Error('V2_RLS=BLOCKED configure V2_QA_DATABASE_URL for a disposable PostgreSQL instance.')
if (process.env.V2_QA_ENVIRONMENT !== 'test') throw new Error('V2_RLS=BLOCKED V2_QA_ENVIRONMENT=test is required.')

const parsedDatabaseUrl = new URL(databaseUrl)
if (!['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname)) throw new Error('V2_RLS=FAIL refusing a non-loopback PostgreSQL instance.')

const prismaCli = path.resolve('node_modules/prisma/build/index.js')

function executePrisma(url: string, statement?: string, migration?: string) {
  const args = [prismaCli, 'db', 'execute', '--url', url]
  if (migration) args.push('--file', migration)
  else args.push('--stdin')
  execFileSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    input: statement,
    stdio: 'inherit',
  })
}

function applyMigrations() {
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0001_platform_security_core.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0002_phase1_members_notifications.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0003_phase2_lab_operations.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0004_phase3_scientific_features.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0005_phase4_model_dataset_platform.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0006_phase5_olfactory_intelligence.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0007_phase5b_consumer_intelligence.sql')
}

const applicationUrl = new URL(databaseUrl)
applicationUrl.username = 'v2_app'
applicationUrl.password = 'v2_app'

let adminClient: PrismaClient | undefined
let appClient: PrismaClient | undefined
let firstOrganizationId: string | undefined
let secondOrganizationId: string | undefined
let firstUserId: string | undefined
let secondUserId: string | undefined
let restrictedUserId: string | undefined

async function configureApplicationRole() {
  if (!adminClient) throw new Error('V2_RLS=FAIL disposable database was not initialized.')
  await adminClient.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
        CREATE ROLE v2_app LOGIN PASSWORD 'v2_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      ELSE
        ALTER ROLE v2_app LOGIN PASSWORD 'v2_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
    END
    $$;
  `)
  await adminClient.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO v2_app')
  await adminClient.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app')
  await adminClient.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO v2_app')
  const roles = await adminClient.$queryRawUnsafe<Array<{ rolbypassrls: boolean; rolsuper: boolean }>>("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'v2_app'")
  if (roles.length !== 1 || roles[0].rolbypassrls || roles[0].rolsuper) throw new Error('V2_RLS=FAIL application role is not constrained by RLS.')
}

async function scopedMembershipCount(organizationId?: string, userId?: string) {
  if (!appClient) throw new Error('V2_RLS=FAIL application client was not initialized.')
  return appClient.$transaction(async (tx) => {
    if (organizationId) await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", organizationId)
    if (userId) await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", userId)
    return tx.membership.count()
  })
}

async function removeTestFixtures() {
  if (!adminClient) return
  await adminClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE v2_audit_events DISABLE TRIGGER v2_audit_append_only')
    try {
      if (secondOrganizationId) await tx.organization.deleteMany({ where: { id: secondOrganizationId } })
      if (firstOrganizationId) await tx.organization.deleteMany({ where: { id: firstOrganizationId } })
      const userIds = [firstUserId, secondUserId, restrictedUserId].filter((value): value is string => Boolean(value))
      if (userIds.length) await tx.user.deleteMany({ where: { id: { in: userIds } } })
    } finally {
      await tx.$executeRawUnsafe('ALTER TABLE v2_audit_events ENABLE TRIGGER v2_audit_append_only')
    }
  })
}

try {
  applyMigrations()
  adminClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  appClient = new PrismaClient({ datasources: { db: { url: applicationUrl.toString() } } })
  await configureApplicationRole()
  const repository = new PrismaPlatformRepository(appClient)
  const service = new PlatformService(repository, { baseDomain: 'olfactoryops.com', sessionPepper: 'rls-session', passwordPepper: 'rls-password' })
  const lab = new LabOperationsService(appClient, service)
  const scientific = new ScientificFeatureService(appClient, service, new RlsScientificRuntime())
  const modelDataset = new ModelDatasetService(appClient, service)
  const olfactory = new OlfactoryIntelligenceService(appClient, service)
  const consumer = new ConsumerIntelligenceService(appClient, service)
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const slug = `rls-${suffix}`
  const secondSlug = `rls-second-${suffix}`
  const result = await service.signup({ organizationName: 'RLS Verification', workspaceSlug: slug, email: `${slug}@example.test`, displayName: 'RLS Verification', password: 'Correct Horse Battery 12!' })
  firstOrganizationId = result.membership.organizationId
  firstUserId = result.user.id
  await service.verifyEmail(result.verificationToken)
  const login = await service.login({ email: `${slug}@example.test`, password: 'Correct Horse Battery 12!', hostname: `${slug}.olfactoryops.com` })
  const context = await service.contextFromToken(login.rawSessionToken, `${slug}.olfactoryops.com`)
  const second = await service.signup({ organizationName: 'RLS Second', workspaceSlug: secondSlug, email: `${secondSlug}@example.test`, displayName: 'RLS Second', password: 'Correct Horse Battery 12!' })
  secondOrganizationId = second.membership.organizationId
  secondUserId = second.user.id
  await service.verifyEmail(second.verificationToken)

  let crossTenantDenied = false
  try {
    await service.contextFromToken(login.rawSessionToken, `${secondSlug}.olfactoryops.com`)
  } catch (error) {
    crossTenantDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'TENANT_ACCESS_DENIED'
  }

  const unscopedMemberships = await scopedMembershipCount()
  const firstTenantMemberships = await scopedMembershipCount(firstOrganizationId, context.user.id)
  const secondTenantVisibleFromFirstContext = await appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", context.user.id)
    return tx.membership.count({ where: { organizationId: secondOrganizationId! } })
  })

  const material = await lab.createMaterial(context.context, { name: 'RLS test material', internalCode: `RLS-${suffix}`, sensoryMetadata: { source: 'test' }, identifiers: [] }, `rls-material-${suffix}`)
  const duplicateMaterial = await lab.createMaterial(context.context, { name: 'RLS test material', internalCode: `RLS-${suffix}`, sensoryMetadata: { source: 'test' }, identifiers: [] }, `rls-material-${suffix}`)
  await lab.changeMaterialStatus(context.context, material.id, 'ACTIVE', `rls-material-status-${suffix}`)
  const structureJob = await scientific.normalizeMaterial(context.context, material.id, { smiles: 'OCC' }, `rls-science-structure-${suffix}`)
  const duplicateStructureJob = await scientific.normalizeMaterial(context.context, material.id, { smiles: 'OCC' }, `rls-science-structure-${suffix}`)
  const featureJob = await scientific.generateFeatures(context.context, material.id, { featureKinds: ['ECFP', 'MOLFTP'] }, `rls-science-features-${suffix}`)
  const scienceArtifacts = await scientific.materialArtifacts(context.context, material.id)
  const dataset = await modelDataset.createDataset(context.context, { key: `qa-dataset-${suffix.replace(/[^a-z0-9]/gi, '').slice(-20)}`, name: 'Isolated scaffold benchmark', task: 'Bounded fragrance research benchmark' }, `rls-dataset-create-${suffix}`)
  const duplicateDataset = await modelDataset.createDataset(context.context, { key: dataset.key, name: 'Isolated scaffold benchmark', task: 'Bounded fragrance research benchmark' }, `rls-dataset-create-${suffix}`)
  const datasetVersion = await modelDataset.registerDatasetVersion(context.context, dataset.id, {
    version: 'qa-1', sourceRepository: 'https://github.com/osmoai/publications', sourcePath: 'tests/fixture.csv', sourceCommit: '5aa9d2cd06a9b4dcae8b5fce2ec5e5d0f763fbd8', citation: 'Osmo Publications isolated fixture', sourceVersion: 'qa-source-1', schemaVersion: 'dataset/1', contentChecksum: '1'.repeat(64), materialUniverseHash: '2'.repeat(64), rowCount: 3,
    license: { spdxId: 'CC-BY-4.0', attribution: 'Osmo Publications dataset attribution preserved in fixture.', usagePolicy: 'Isolated QA benchmark only.', evidenceUrl: 'https://github.com/osmoai/publications', evidenceStatus: 'VERIFIED' },
    transformations: [{ key: 'scaffold-split', version: '1', codeRef: 'tests/fixture', configurationHash: '3'.repeat(64), inputHash: '1'.repeat(64), outputHash: '4'.repeat(64) }],
    artifacts: [{ kind: 'MANIFEST', storageRef: 'test://dataset/manifest', contentHash: '5'.repeat(64), schemaVersion: 'manifest/1' }],
  }, `rls-dataset-version-${suffix}`)
  const approvedDatasetVersion = await modelDataset.approveDatasetVersion(context.context, datasetVersion.id, `rls-dataset-approve-${suffix}`)
  const model = await modelDataset.createModel(context.context, { key: `qa-model-${suffix.replace(/[^a-z0-9]/gi, '').slice(-20)}`, name: 'Isolated KGCNN benchmark', intendedUse: 'Research-only architecture and provenance verification.' }, `rls-model-create-${suffix}`)
  const modelVersion = await modelDataset.registerModelVersion(context.context, model.id, {
    version: 'qa-1', architecture: { key: 'KGCNN', version: '2025.1', componentKey: 'KGCNN_KERAS_UNLOCKED', configurationHash: '6'.repeat(64) },
    featureContract: { key: 'qa-graph', version: '1', featureKinds: ['MOLECULAR_GRAPH'], schemaHash: '7'.repeat(64) }, trainingTask: 'Research-only binary fixture',
    modelCard: { purpose: 'Verify model registry provenance.', limitations: ['No scientific claim is made from this fixture.'], prohibitedInterpretations: ['Do not use as a production prediction.'] },
    checkpoint: { storageRef: 'test://checkpoint/qa', checkpointHash: '8'.repeat(64), format: 'KERAS' },
  }, `rls-model-version-${suffix}`)
  const trainingRun = await modelDataset.createTrainingRun(context.context, modelVersion.id, {
    seed: 42, splitStrategy: 'SCAFFOLD_GROUP', splitManifestHash: '9'.repeat(64), configurationHash: 'a'.repeat(64),
    datasets: [
      { datasetVersionId: datasetVersion.id, splitRole: 'TRAIN', splitArtifactHash: 'b'.repeat(64), groupSetHash: 'c'.repeat(64) },
      { datasetVersionId: datasetVersion.id, splitRole: 'VALIDATION', splitArtifactHash: 'd'.repeat(64), groupSetHash: 'e'.repeat(64) },
      { datasetVersionId: datasetVersion.id, splitRole: 'TEST', splitArtifactHash: 'f'.repeat(64), groupSetHash: '0'.repeat(64) },
    ],
  }, `rls-training-run-${suffix}`)
  const evaluation = await modelDataset.recordEvaluation(context.context, trainingRun.id, { datasetVersionId: datasetVersion.id, protocolVersion: 'qa-eval-1', leakageStatus: 'PASS', metrics: [{ key: 'accuracy', value: 0.75, unit: 'fraction' }] }, `rls-evaluation-${suffix}`)
  const modelRuntime = await modelDataset.runtimeStatus(context.context, modelVersion.id)
  const comparisonMaterial = await lab.createMaterial(context.context, { name: 'RLS similarity material', internalCode: `SIM-${suffix}`, sensoryMetadata: { source: 'test' }, identifiers: [] }, `rls-sim-material-${suffix}`)
  await lab.changeMaterialStatus(context.context, comparisonMaterial.id, 'ACTIVE', `rls-sim-material-status-${suffix}`)
  await scientific.normalizeMaterial(context.context, comparisonMaterial.id, { smiles: 'CCO' }, `rls-sim-structure-${suffix}`)
  await scientific.generateFeatures(context.context, comparisonMaterial.id, { featureKinds: ['ECFP'] }, `rls-sim-features-${suffix}`)
  const molecularEmbedding = await olfactory.createMolecularEmbedding(context.context, material.id, { featureKinds: ['ECFP'], method: 'FINGERPRINT_BINARY_VECTOR', normalization: 'L2', indexVersion: 'qa-index/1' }, `rls-embedding-${suffix}`)
  const molecularSimilarity = await olfactory.compareMolecularSimilarity(context.context, material.id, { candidateMaterialId: comparisonMaterial.id, featureKind: 'ECFP', indexVersion: 'qa-index/1' }, `rls-similarity-${suffix}`)
  const odorPrediction = await olfactory.recordOdorPredictionNotEvaluated(context.context, material.id, { modelVersionId: modelVersion.id, requestedTask: 'odor-descriptor' }, `rls-odor-prediction-${suffix}`)
  const explainability = await olfactory.explain(context.context, material.id, { featureKind: 'MOLFTP', requestedTask: 'odor-descriptor' }, `rls-explain-${suffix}`)
  const sentimentSource = await consumer.createSource(context.context, { key: `sentiment-${suffix.replace(/[^a-z0-9]/gi, '').slice(-20)}`, type: 'SURVEY', sourceScope: 'qa-project', storageRef: 'test://consumer-feedback', purpose: 'Isolated consumer preference verification.', consentRequired: true, retentionDays: 30 }, `rls-sentiment-source-${suffix}`)
  const sentimentFeedback = await consumer.ingestFeedback(context.context, { sourceId: sentimentSource.id, externalRefHash: '1'.repeat(64), contentHash: '2'.repeat(64), privateContentRef: 'private://qa-feedback/1', consentProofHash: '3'.repeat(64), languageHint: 'EN', collectedAt: new Date().toISOString() }, `rls-sentiment-feedback-${suffix}`)
  const sentimentAnalysis = await consumer.recordAnalysis(context.context, { feedbackItemId: sentimentFeedback.id, extractionVersion: 'manual-v1', provider: 'manual-review', modelVersion: 'manual-v1', language: 'EN', languageConfidence: 1, overall: { label: 'POSITIVE', score: 0.5, confidence: 0.8 }, descriptors: [{ id: 'woody', value: 0.6, confidence: 0.8 }], evidenceStatus: 'VERIFIED' }, `rls-sentiment-analysis-${suffix}`)
  const preference = await consumer.createPreferenceVector(context.context, { sourceIds: [sentimentSource.id], sourceScope: 'qa-project', vocabularyVersion: 'v1', aggregationVersion: 'v1' }, `rls-sentiment-preference-${suffix}`)
  const materialDocument = await lab.addMaterialDocument(context.context, material.id, { kind: 'SDS', objectRef: `test://material/${suffix}`, contentHash: `hash-${suffix}` }, `rls-material-document-${suffix}`)
  const supplier = await lab.createSupplier(context.context, { legalName: `RLS Supplier ${suffix}`, currency: 'USD', paymentTerms: {} }, `rls-supplier-${suffix}`)
  await lab.changeSupplierStatus(context.context, supplier.id, 'ACTIVE', `rls-supplier-status-${suffix}`)
  const supplierDocument = await lab.addSupplierDocument(context.context, supplier.id, { kind: 'CERTIFICATE', objectRef: `test://supplier/${suffix}`, contentHash: `hash-${suffix}` }, `rls-supplier-document-${suffix}`)
  const offer = await lab.createSupplierOffer(context.context, { supplierId: supplier.id, materialId: material.id, productCode: `RLS-OFFER-${suffix}`, minimumOrderQuantity: 1, unit: 'G', unitPrice: 0.02, currency: 'USD' }, `rls-offer-${suffix}`)
  await lab.changeSupplierOfferStatus(context.context, offer.id, 'ACTIVE', `rls-offer-status-${suffix}`)
  const priceRevision = await lab.reviseSupplierOfferPrice(context.context, offer.id, { unitPrice: 0.021, currency: 'USD', reason: 'isolated price evidence' }, `rls-offer-price-${suffix}`)
  const purchaseRequest = await lab.createPurchaseRequest(context.context, { notes: 'isolated phase 2 verification', lines: [{ materialId: material.id, requestedGrams: 1000, preferredSupplierId: supplier.id }] }, `rls-pr-${suffix}`)
  await lab.changePurchaseRequestStatus(context.context, purchaseRequest.id, 'SUBMITTED', `rls-pr-submit-${suffix}`)
  await lab.changePurchaseRequestStatus(context.context, purchaseRequest.id, 'APPROVED', `rls-pr-approve-${suffix}`)
  const purchaseOrder = await lab.createPurchaseOrder(context.context, { supplierId: supplier.id, purchaseRequestId: purchaseRequest.id, currency: 'USD', lines: [{ materialId: material.id, supplierOfferId: offer.id, orderedGrams: 1000, unitPrice: 0.02 }] }, `rls-po-${suffix}`)
  await lab.changePurchaseOrderStatus(context.context, purchaseOrder.id, 'PENDING_APPROVAL', `rls-po-submit-${suffix}`)
  await lab.changePurchaseOrderStatus(context.context, purchaseOrder.id, 'APPROVED', `rls-po-approve-${suffix}`)
  const shipment = await lab.createShipment(context.context, { purchaseOrderId: purchaseOrder.id, carrier: 'QA Carrier', shippedAt: new Date().toISOString() }, `rls-shipment-${suffix}`)
  const receipt = await lab.receiveGoods(context.context, {
    purchaseOrderId: purchaseOrder.id, shipmentId: shipment.id, freightCost: 10, dutyCost: 5, insuranceCost: 0, currency: 'USD',
    lines: [{ materialId: material.id, supplierOfferId: offer.id, quantity: 1, unit: 'KG', location: 'QA quarantine', unitPrice: 0.02 }],
  }, `rls-receipt-${suffix}`)
  let quarantineRejected = false
  try { await lab.fefo(context.context, material.id, 50) } catch (error) { quarantineRejected = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'LOT_NOT_ELIGIBLE' }
  const inspections = await Promise.allSettled([
    lab.inspectReceiptLine(context.context, receipt.id, receipt.lines[0].id, { disposition: 'ACCEPT', findings: { qa: 'pass' } }, `rls-inspection-a-${suffix}`),
    lab.inspectReceiptLine(context.context, receipt.id, receipt.lines[0].id, { disposition: 'ACCEPT', findings: { qa: 'pass' } }, `rls-inspection-b-${suffix}`),
  ])
  const accepted = inspections.find((result): result is PromiseFulfilledResult<{ id: string; disposition: 'ACCEPT' | 'REJECT' | 'RETURN'; lotStatus: string; qualityStatus: string }> => result.status === 'fulfilled')?.value
  const concurrentInspectionDenied = inspections.some((result) => result.status === 'rejected' && result.reason instanceof Error && 'code' in result.reason && (result.reason as { code?: string }).code === 'INSPECTION_ALREADY_DECIDED')
  if (!accepted) throw new Error('V2_RLS=FAIL concurrent receipt inspection did not produce an accepted disposition')
  const transfer = await lab.transferLot(context.context, receipt.lines[0].lotId, { location: 'QA available shelf', reason: 'inspection release location' }, `rls-transfer-${suffix}`)
  const fefo = await lab.fefo(context.context, material.id, 150)
  const weighing = await lab.createWeighingSession(context.context, { contextType: 'AD_HOC', lines: [{ materialId: material.id, requestedGrams: 100, toleranceGrams: 0 }] }, `rls-weigh-${suffix}`)
  const confirmed = await lab.confirmWeighing(context.context, weighing.id, [{ lineId: weighing.lines[0].id, lotId: receipt.lines[0].lotId, actualGrams: 100 }], `rls-weigh-confirm-${suffix}`)
  const duplicateConfirmation = await lab.confirmWeighing(context.context, weighing.id, [{ lineId: weighing.lines[0].id, lotId: receipt.lines[0].lotId, actualGrams: 100 }], `rls-weigh-confirm-${suffix}`)
  const consumption = await appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM v2_inventory_movements WHERE organization_id = $1 AND reference_id = $2 AND movement_type = $3 LIMIT 1', firstOrganizationId!, weighing.id, 'CONSUMPTION')
  })
  const reversal = await lab.reverseMovement(context.context, consumption[0]!.id, `rls-reverse-${suffix}`)
  const reservation = await lab.reserve(context.context, { materialId: material.id, quantityGrams: 200, contextType: 'PRODUCTION_OUTPUT', contextId: `qa-${suffix}` }, `rls-reserve-${suffix}`)
  const reservedLots = await lab.listLots(context.context)
  const reservedWeighing = await lab.createWeighingSession(context.context, { contextType: 'AD_HOC', lines: [{ materialId: material.id, lotId: receipt.lines[0].lotId, reservationId: reservation.reservations[0]!.id, requestedGrams: 25, toleranceGrams: 0 }] }, `rls-reserved-weigh-${suffix}`)
  const reservedConfirmation = await lab.confirmWeighing(context.context, reservedWeighing.id, [{ lineId: reservedWeighing.lines[0].id, lotId: receipt.lines[0].lotId, actualGrams: 25 }], `rls-reserved-weigh-confirm-${suffix}`)
  const receiptMovement = await appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM v2_inventory_movements WHERE organization_id = $1 AND reference_id = $2 AND movement_type = $3 LIMIT 1', firstOrganizationId!, receipt.id, 'RECEIPT')
  })
  let unsafeReversalDenied = false
  try { await lab.reverseMovement(context.context, receiptMovement[0]!.id, `rls-unsafe-reverse-${suffix}`) } catch (error) { unsafeReversalDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'MOVEMENT_REVERSAL_WOULD_BREAK_STOCK' }
  const release = await lab.releaseReservation(context.context, reservation.reservations[0]!.id, `rls-release-${suffix}`)
  const reservedConsumption = await appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    return tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM v2_inventory_movements WHERE organization_id = $1 AND reference_id = $2 AND movement_type = $3 LIMIT 1', firstOrganizationId!, reservedWeighing.id, 'CONSUMPTION')
  })
  const reservedCorrection = await lab.reverseMovement(context.context, reservedConsumption[0]!.id, `rls-reserved-weigh-reverse-${suffix}`)
  const waste = await lab.adjustInventory(context.context, { lotId: receipt.lines[0].lotId, quantityDeltaGrams: -10, kind: 'WASTE', reason: 'isolated verification waste' }, `rls-waste-${suffix}`)
  const wasteReversal = await lab.reverseMovement(context.context, waste.id, `rls-waste-reverse-${suffix}`)
  const landedAttempts = await Promise.allSettled([
    lab.postLandedCost(context.context, receipt.id, `rls-landed-a-${suffix}`),
    lab.postLandedCost(context.context, receipt.id, `rls-landed-b-${suffix}`),
  ])
  const landed = landedAttempts.find((result): result is PromiseFulfilledResult<{ receiptId: string; totalCost: number; allocations: Array<{ id: string }> }> => result.status === 'fulfilled')?.value
  const concurrentLandedCostDenied = landedAttempts.some((result) => result.status === 'rejected' && result.reason instanceof Error && 'code' in result.reason && (result.reason as { code?: string }).code === 'LANDED_COST_ALREADY_POSTED')
  if (!landed) throw new Error('V2_RLS=FAIL concurrent landed-cost post did not produce an allocation')
  const returnedReceipt = await lab.receiveGoods(context.context, { freightCost: 0, dutyCost: 0, insuranceCost: 0, currency: 'USD', lines: [{ materialId: material.id, supplierOfferId: offer.id, quantity: 100, unit: 'G', location: 'QA return', unitPrice: 0.02 }] }, `rls-return-receipt-${suffix}`)
  const returned = await lab.inspectReceiptLine(context.context, returnedReceipt.id, returnedReceipt.lines[0].id, { disposition: 'RETURN', findings: { qa: 'return' }, reason: 'isolated return' }, `rls-return-inspection-${suffix}`)
  const reviewReceipt = await lab.receiveGoods(context.context, { freightCost: 0, dutyCost: 0, insuranceCost: 0, currency: 'USD', lines: [{ materialId: material.id, supplierOfferId: offer.id, quantity: 10, unit: 'G', location: 'QA review', unitPrice: 0.02 }] }, `rls-review-receipt-${suffix}`)
  const held = await lab.inspectReceiptLine(context.context, reviewReceipt.id, reviewReceipt.lines[0].id, { disposition: 'HOLD', findings: { qa: 'awaiting evidence' }, reason: 'open discrepancy' }, `rls-hold-${suffix}`)
  const resolvedReview = await lab.inspectReceiptLine(context.context, reviewReceipt.id, reviewReceipt.lines[0].id, { disposition: 'ACCEPT', findings: { qa: 'evidence accepted' } }, `rls-review-accept-${suffix}`)
  const blockedMaterial = await lab.createMaterial(context.context, { name: 'Blocked compliance material', internalCode: `BLOCK-${suffix}`, sensoryMetadata: {}, identifiers: [] }, `rls-blocked-material-${suffix}`)
  await lab.changeMaterialStatus(context.context, blockedMaterial.id, 'ACTIVE', `rls-blocked-material-status-${suffix}`)
  await lab.saveCompliance(context.context, blockedMaterial.id, { jurisdiction: 'QA', category: 'TEST', status: 'BLOCKED', source: 'isolated test', sourceVersion: '1', limits: {} }, `rls-blocked-compliance-${suffix}`)
  let blockedComplianceDenied = false
  try { await lab.receiveGoods(context.context, { freightCost: 0, dutyCost: 0, insuranceCost: 0, currency: 'USD', lines: [{ materialId: blockedMaterial.id, quantity: 1, unit: 'G', location: 'denied' }] }, `rls-blocked-receipt-${suffix}`) } catch (error) { blockedComplianceDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'MATERIAL_COMPLIANCE_BLOCKED' }
  const firstLots = await lab.listLots(context.context)
  const secondContext = await service.contextFromToken(second.rawSessionToken, `${secondSlug}.olfactoryops.com`)
  const secondMaterials = await lab.listMaterials(secondContext.context)
  const secondOffers = await lab.listSupplierOffers(secondContext.context)
  const deniedCode = async (action: () => Promise<unknown>, expected: string) => {
    try { await action(); return false } catch (error) { return error instanceof Error && 'code' in error && (error as { code?: string }).code === expected }
  }
  const crossTenantLotDenied = await deniedCode(() => lab.lotDetail(secondContext.context, receipt.lines[0].lotId), 'LOT_NOT_FOUND')
  const crossTenantReceiptDenied = await deniedCode(() => lab.postLandedCost(secondContext.context, receipt.id, `rls-cross-receipt-${suffix}`), 'RECEIPT_NOT_FOUND')
  const crossTenantShipmentDenied = await deniedCode(() => lab.changeShipmentStatus(secondContext.context, shipment.id, 'CANCELLED', undefined, `rls-cross-shipment-${suffix}`), 'SHIPMENT_NOT_FOUND')
  const crossTenantWeighingDenied = await deniedCode(() => lab.confirmWeighing(secondContext.context, weighing.id, [], `rls-cross-weigh-${suffix}`), 'WEIGHING_NOT_FOUND')
  const crossTenantSupplierDenied = await deniedCode(() => lab.createPurchaseOrder(secondContext.context, { supplierId: supplier.id, currency: 'USD', lines: [{ materialId: material.id, orderedGrams: 1 }] }, `rls-cross-order-${suffix}`), 'SUPPLIER_NOT_FOUND')
  const crossTenantScientificDenied = await deniedCode(() => scientific.materialArtifacts(secondContext.context, material.id), 'MATERIAL_NOT_FOUND')
  const crossTenantDatasetDenied = await deniedCode(() => modelDataset.datasetDetail(secondContext.context, dataset.id), 'DATASET_NOT_FOUND')
  const crossTenantModelDenied = await deniedCode(() => modelDataset.runtimeStatus(secondContext.context, modelVersion.id), 'MODEL_VERSION_NOT_FOUND')
  const crossTenantEmbeddingDenied = await deniedCode(() => olfactory.createMolecularEmbedding(secondContext.context, material.id, { featureKinds: ['ECFP'] }, `rls-cross-embedding-${suffix}`), 'MATERIAL_NOT_FOUND')
  const crossTenantSentimentDenied = await deniedCode(() => consumer.invalidateSource(secondContext.context, sentimentSource.id, { reasonCode: 'CROSS_TENANT' }, `rls-cross-sentiment-${suffix}`), 'FEEDBACK_SOURCE_NOT_FOUND')
  const invalidation = await consumer.invalidateSource(context.context, sentimentSource.id, { reasonCode: 'CONSENT_REVOKED' }, `rls-sentiment-invalidate-${suffix}`)
  const invalidatedPreference = await consumer.latestPreference(context.context, 'qa-project')
  const secondDataset = await modelDataset.createDataset(secondContext.context, { key: `qa-other-${suffix.replace(/[^a-z0-9]/gi, '').slice(-20)}`, name: 'Second tenant dataset', task: 'Composite foreign-key isolation check' }, `rls-other-dataset-${suffix}`)
  const compositeCrossTenantDatasetDenied = await appClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", firstUserId)
    try {
      await tx.$executeRawUnsafe(
        'INSERT INTO v2_dataset_versions (id, organization_id, dataset_id, version, source_repository, source_commit, citation, source_version, schema_version, content_checksum, material_universe_hash, row_count, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
        `datasetver_cross_${suffix.replace(/[^a-z0-9]/gi, '')}`,
        firstOrganizationId!,
        secondDataset.id,
        'cross-tenant-attempt',
        'https://example.test/source',
        'fixture',
        'Cross-tenant relationship attempt',
        'fixture',
        'dataset/1',
        'a'.repeat(64),
        'b'.repeat(64),
        0,
        firstUserId!,
      )
      return false
    } catch {
      return true
    }
  })

  restrictedUserId = `usr_restricted_${suffix.replace(/[^a-z0-9]/gi, '')}`
  await adminClient!.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('INSERT INTO v2_users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)', restrictedUserId!, `${restrictedUserId}@example.test`, 'Restricted QA', 'not-a-login')
    await tx.$executeRawUnsafe('INSERT INTO v2_memberships (id, organization_id, user_id, role_key, status) VALUES ($1, $2, $3, $4, $5)', `mem_${restrictedUserId}`, firstOrganizationId!, restrictedUserId!, 'Perfumer', 'ACTIVE')
  })
  let permissionDenied = false
  try {
    await lab.receiveGoods({ ...context.context, userId: restrictedUserId, role: 'Perfumer', sessionId: `ses_${restrictedUserId}` }, { freightCost: 0, dutyCost: 0, insuranceCost: 0, currency: 'USD', lines: [{ materialId: material.id, quantity: 1, unit: 'G', location: 'denied' }] }, `rls-denied-${suffix}`)
  } catch (error) { permissionDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'TENANT_ACCESS_DENIED' }
  const scientificPermissionDenied = await deniedCode(() => scientific.materialArtifacts({ ...context.context, userId: restrictedUserId!, role: 'Perfumer', sessionId: `ses_science_${restrictedUserId}` }, material.id), 'TENANT_ACCESS_DENIED')
  const modelRegistryPermissionDenied = await deniedCode(() => modelDataset.createDataset({ ...context.context, userId: restrictedUserId!, role: 'Perfumer', sessionId: `ses_model_${restrictedUserId}` }, { key: `denied-${suffix.replace(/[^a-z0-9]/gi, '').slice(-20)}`, name: 'Denied', task: 'Denied' }, `rls-model-denied-${suffix}`), 'TENANT_ACCESS_DENIED')
  const sentimentPermissionDenied = await deniedCode(() => consumer.createSource({ ...context.context, userId: restrictedUserId!, role: 'Perfumer', sessionId: `ses_sentiment_${restrictedUserId}` }, { key: `denied-sentiment-${suffix.replace(/[^a-z0-9]/gi, '').slice(-12)}`, type: 'SURVEY', sourceScope: 'qa-project', storageRef: 'test://denied', purpose: 'Denied fixture', consentRequired: false, retentionDays: 30 }, `rls-sentiment-denied-${suffix}`), 'TENANT_ACCESS_DENIED')

  const projection = firstLots.find((lot) => lot.id === receipt.lines[0].lotId)?.projection
  const reservedProjection = reservedLots.find((lot) => lot.id === receipt.lines[0].lotId)?.projection
  const returnedProjection = firstLots.find((lot) => lot.id === returnedReceipt.lines[0].lotId)?.projection
  const phase2Pass = duplicateMaterial.id === material.id
    && quarantineRejected
    && accepted.lotStatus === 'AVAILABLE'
    && materialDocument.status === 'REVIEW_REQUIRED'
    && supplierDocument.status === 'REVIEW_REQUIRED'
    && Boolean(priceRevision.priceHistoryId)
    && concurrentInspectionDenied
    && shipment.status === 'IN_TRANSIT'
    && transfer.location === 'QA available shelf'
    && fefo[0]?.allocatedGrams === 150
    && confirmed.status === 'CONFIRMED'
    && duplicateConfirmation.status === 'CONFIRMED'
    && reversal.reversalOfId === consumption[0]?.id
    && reservation.reservations.length === 1
    && reservedProjection?.availableGrams === 800
    && reservedConfirmation.status === 'CONFIRMED'
    && release.status === 'RELEASED'
    && reservedCorrection.reversalOfId === reservedConsumption[0]?.id
    && unsafeReversalDenied
    && waste.movementType === 'WASTE'
    && wasteReversal.reversalOfId === waste.id
    && landed.allocations.length === 1
    && concurrentLandedCostDenied
    && projection?.onHandGrams === 1000
    && projection.availableGrams === 1000
    && returned.lotStatus === 'REJECTED'
    && returnedProjection?.onHandGrams === 0
    && held.lotStatus === 'HOLD'
    && resolvedReview.lotStatus === 'AVAILABLE'
    && blockedComplianceDenied
    && secondMaterials.length === 0
    && secondOffers.length === 0
    && crossTenantLotDenied
    && crossTenantReceiptDenied
    && crossTenantShipmentDenied
    && crossTenantWeighingDenied
    && crossTenantSupplierDenied
    && permissionDenied
  const phase3Pass = structureJob.status === 'SUCCEEDED'
    && duplicateStructureJob.id === structureJob.id
    && featureJob.status === 'SUCCEEDED'
    && scienceArtifacts.some((artifact) => artifact.artifactKind === 'STRUCTURE' && artifact.evidenceStatus === 'VERIFIED')
    && scienceArtifacts.some((artifact) => artifact.artifactKind === 'ECFP' && artifact.evidenceStatus === 'VERIFIED')
    && scienceArtifacts.some((artifact) => artifact.artifactKind === 'MOLFTP' && artifact.evidenceStatus === 'NOT_EVALUATED')
    && crossTenantScientificDenied
    && scientificPermissionDenied
  const phase4Pass = duplicateDataset.id === dataset.id
    && approvedDatasetVersion.status === 'APPROVED'
    && trainingRun.status === 'PLANNED'
    && evaluation.leakageStatus === 'PASS'
    && modelRuntime.status === 'NOT_CONFIGURED'
    && crossTenantDatasetDenied
    && crossTenantModelDenied
    && compositeCrossTenantDatasetDenied
    && modelRegistryPermissionDenied
    && molecularEmbedding.status === 'VERIFIED'
    && molecularSimilarity.status === 'VERIFIED'
    && odorPrediction.status === 'NOT_EVALUATED'
    && explainability.status === 'NOT_EVALUATED'
    && crossTenantEmbeddingDenied
  const phase5bPass = sentimentAnalysis.evidenceStatus === 'VERIFIED'
    && preference.evidenceStatus === 'NOT_ENOUGH_EVIDENCE'
    && crossTenantSentimentDenied
    && sentimentPermissionDenied
    && invalidation.status === 'INVALIDATED'
    && invalidatedPreference.status === 'NOT_ENOUGH_EVIDENCE'

  if (!crossTenantDenied || unscopedMemberships !== 0 || firstTenantMemberships !== 1 || secondTenantVisibleFromFirstContext !== 0 || !phase2Pass || !phase3Pass || !phase4Pass || !phase5bPass) {
    throw new Error(`V2_RLS=FAIL unexpected isolation result: ${JSON.stringify({ crossTenantDenied, unscopedMemberships, firstTenantMemberships, secondTenantVisibleFromFirstContext, phase2: { duplicateMaterial: duplicateMaterial.id === material.id, quarantineRejected, accepted: accepted.lotStatus, concurrentInspectionDenied, fefoAllocated: fefo[0]?.allocatedGrams, weighing: confirmed.status, duplicateWeighing: duplicateConfirmation.status, reservationCount: reservation.reservations.length, unsafeReversalDenied, concurrentLandedCostDenied, landedAllocationCount: landed.allocations.length, projection, secondTenantMaterials: secondMaterials.length, secondOffers: secondOffers.length, crossTenantLotDenied, crossTenantReceiptDenied, crossTenantShipmentDenied, crossTenantWeighingDenied, crossTenantSupplierDenied, permissionDenied }, phase3: { structure: structureJob.status, duplicate: duplicateStructureJob.id === structureJob.id, features: featureJob.status, artifactKinds: scienceArtifacts.map((artifact) => `${artifact.artifactKind}:${artifact.evidenceStatus}`), crossTenantScientificDenied, scientificPermissionDenied }, phase4: { duplicateDataset: duplicateDataset.id === dataset.id, approvedDatasetVersion: approvedDatasetVersion.status, trainingRun: trainingRun.status, evaluation: evaluation.leakageStatus, modelRuntime: modelRuntime.status, crossTenantDatasetDenied, crossTenantModelDenied, compositeCrossTenantDatasetDenied, modelRegistryPermissionDenied }, phase5: { molecularEmbedding: molecularEmbedding.status, molecularSimilarity: molecularSimilarity.status, odorPrediction: odorPrediction.status, explainability: explainability.status, crossTenantEmbeddingDenied } })}`)
  }

  console.log(JSON.stringify({
    applicationRole: 'v2_app',
    roleBypassesRls: false,
    signup: result.membership.role,
    login: login.membership.role,
    organizationId: context.context.organizationId,
    crossTenantDenied,
    unscopedMemberships,
    firstTenantMemberships,
    secondTenantVisibleFromFirstContext,
    phase2: {
      duplicateMaterial: duplicateMaterial.id === material.id,
      quarantineRejected,
      accepted: accepted.lotStatus,
      materialDocument: materialDocument.status,
      supplierDocument: supplierDocument.status,
      priceRevision: Boolean(priceRevision.priceHistoryId),
      concurrentInspectionDenied,
      purchaseRequest: purchaseRequest.id,
      purchaseOrder: purchaseOrder.id,
      shipment: shipment.id,
      transfer: transfer.location,
      fefoAllocated: fefo[0]?.allocatedGrams,
      weighing: confirmed.status,
      reversal: reversal.reversalOfId,
      reservationCount: reservation.reservations.length,
      reservationAvailable: reservedProjection?.availableGrams,
      reservedConsumption: reservedConfirmation.status,
      released: release.status,
      reservedCorrection: reservedCorrection.reversalOfId,
      unsafeReversalDenied,
      waste: waste.movementType,
      landedAllocationCount: landed.allocations.length,
      concurrentLandedCostDenied,
      projection,
      returned: { lotStatus: returned.lotStatus, projection: returnedProjection },
      held: held.lotStatus,
      resolvedReview: resolvedReview.lotStatus,
      blockedComplianceDenied,
      secondTenantMaterials: secondMaterials.length,
      secondOffers: secondOffers.length,
      crossTenantLotDenied,
      crossTenantReceiptDenied,
      crossTenantShipmentDenied,
      crossTenantWeighingDenied,
      crossTenantSupplierDenied,
      permissionDenied,
    },
    phase3: {
      structure: structureJob.status,
      duplicateStructure: duplicateStructureJob.id === structureJob.id,
      featureJob: featureJob.status,
      artifacts: scienceArtifacts.map((artifact) => `${artifact.artifactKind}:${artifact.evidenceStatus}`),
      crossTenantScientificDenied,
      scientificPermissionDenied,
    },
    phase4: {
      duplicateDataset: duplicateDataset.id === dataset.id,
      approvedDatasetVersion: approvedDatasetVersion.status,
      trainingRun: trainingRun.status,
      evaluation: evaluation.leakageStatus,
      modelRuntime: modelRuntime.status,
      crossTenantDatasetDenied,
      crossTenantModelDenied,
      compositeCrossTenantDatasetDenied,
      modelRegistryPermissionDenied,
    },
    phase5: {
      molecularEmbedding: molecularEmbedding.status,
      molecularSimilarity: molecularSimilarity.status,
      odorPrediction: odorPrediction.status,
      explainability: explainability.status,
      crossTenantEmbeddingDenied,
    },
    phase5b: {
      sentimentAnalysis: sentimentAnalysis.evidenceStatus,
      preference: preference.evidenceStatus,
      crossTenantSentimentDenied,
      sentimentPermissionDenied,
      invalidation: invalidation.status,
      invalidatedPreference: invalidatedPreference.status,
    },
  }))
} finally {
  await appClient?.$disconnect()
  await removeTestFixtures()
  await adminClient?.$disconnect()
}
