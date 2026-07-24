import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '../shared/http-error.js'
import { createCipheriv, createDecipheriv, createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'
import { internalPhases } from '../data/internal-phases.js'
import {
  auditEvents,
  auditExportJobs,
  apiKeys,
  analyticsBurnRate,
  analyticsDashboardReport,
  authSessions,
  billingInvoices,
  billingPlans,
  billingSubscriptions,
  brandingConfig,
  brands,
  batchCostReport,
  canDownloadDocument,
  commercialSkus,
  createDefaultFormulaWorkspacePreferences,
  costRanking,
  costingOverview,
  createDocumentShareLink,
  customFields,
  customers,
  createSignedDocumentUrl,
  documentComplianceDashboard,
  documentRequiredPermissions,
  documents,
  domains,
  expiryRisk,
  featureFlags,
  formulaCostReport,
  diffFormulaVersions,
  evaluateFormulaIfra,
  evaporationCurve,
  formulaComposition,
  formulaSnapshotMetadata,
  scaleFormula,
  formatSequenceValue,
  formulaTotals,
  formulaVersions,
  formulas as initialFormulas,
  formatGrams,
  initialLots,
  initialMovements,
  inventoryAnalytics,
  inventoryValuationReport,
  isLotEligibleForInventory,
  lowStockForecast,
  materials,
  memberships,
  moleculeComponents,
  numberingSequences,
  organizations,
  orderDocuments,
  orderRequiredGrams,
  permissionCatalog,
  planLabUsage,
  priceLists,
  priceHistory,
  productionBatches,
  purchaseOrders,
  quotes,
  resolveFormulaWithCatalog,
  normalizeFormulaWorkspacePreferences,
  rolePolicies,
  sampleRequests,
  salesOrders,
  scheduledReports,
  shipments,
  skuMarginReports,
  skuAvailability,
  ssoConfig,
  stockTakeRecords,
  stockSummary,
  storageLocations,
  suppliers,
  tenantScopeAllows,
  tenantSecurityPolicy,
  tenantSettings,
  userSettings,
  webhooks,
  webhookDeliveries,
  type Allocation,
  type ApiKeyRecord,
  type AppNotificationRecord,
  type AuditEvent,
  type AuditExportJobRecord,
  type AuthSession,
  type BillingActionResponse,
  type BillingConsoleResponse,
  type BillingInvoiceRecord,
  type BillingLimitCheck,
  type BillingPlanRecord,
  type BillingSubscriptionRecord,
  type BillingUsageMeterRecord,
  type BrandRecord,
  type BrandingConfig,
  type CommercialSkuRecord,
  type CustomerAddress,
  type CustomerRecord,
  type SaasCustomDomainRecord,
  type DataImportIssue,
  type DataImportJobRecord,
  type CustomFieldDefinition,
  type DocumentRecord,
  type DocumentShareLink,
  type DocumentType,
  type FeatureFlagRecord,
  type Formula,
  type FormulaLine,
  type FormulaEvaluationRecord,
  type FormulaType,
  type FormulaVersionRecord,
  type InventoryLot,
  type InventoryMovement,
  type InventoryReorderSuggestion,
  type LegalAcceptanceRecord,
  type LegalDocumentKind,
  type LabUsagePurpose,
  type LabUsageRecord,
  type LabWeighingSession,
  type LotLabelPayload,
  type LotQualityStatus,
  type Material,
  type MaterialIngestionRecord,
  type MaterialProvenance,
  type MembershipRecord,
  type MoleculeComponent,
  type NumberingSequenceRecord,
  type OrganizationRecord,
  type PriceHistoryRecord,
  type RfqComparison,
  type PriceListRecord,
  type PrivacyRequestRecord,
  type ProductionBatchRecord,
  type PurchaseOrderRecord,
  type QuoteRecord,
  type RolePolicy,
  type SampleRequestRecord,
  type SalesOrderRecord,
  type ScheduledReportRecord,
  type ShipmentRecord,
  type OrderDocumentRecord,
  type SsoConfigRecord,
  type StockTakeRecord,
  type StorageLocation,
  type SupplierRecord,
  type TenantSettingsRecord,
  type UserSettingsRecord,
  type GlobalSearchResult,
  type WebhookRecord,
  type WebhookDeliveryRecord,
} from '../../../src/data/northStar.js'

const seededAdminEmail = 'admin@labofscents.org'
const passwordHashAlgorithm = 'sha256'
const passwordHashIterations = 100_000
const passwordHashKeyLength = 32
const passwordHashSaltBytes = 16
const mfaEncryptionMinimumKeyBytes = 32
const mfaTotpDigits = 6
const mfaTotpPeriodSeconds = 30
const mfaTotpSecretBytes = 20
const mfaRecoveryCodeCount = 8
const mfaRecoveryCodeBytes = 8
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const sensitiveApprovalFieldNames = new Set([
  'password',
  'currentpassword',
  'secret',
  'secretkey',
  'token',
  'accesstoken',
  'refreshtoken',
  'signature',
  'credential',
  'credentials',
  'authorization',
  'recoverycode',
  'recoverycodes',
  'otp',
  'totp',
  'mfacode',
])

type WeighingActualInput = {
  materialId?: string
  lotId: string
  actualGrams: number
}

type LabWeighingOptions = {
  actuals?: WeighingActualInput[]
  tolerancePercent?: number
  operator?: string
  purpose?: LabUsagePurpose
  projectCode?: string
  sampleCode?: string
  qcLink?: string
}

type LabUsageReverseOptions = {
  reason?: string
  actor?: string
  allocations?: Array<{
    lotId: string
    materialId: string
    grams: number
  }>
}

type RfqComparisonBody = {
  materialId?: string
  quantityGrams?: number
}

type RfqAwardBody = RfqComparisonBody & {
  supplierId?: string
  unitCost?: number
  currency?: string
  expectedDate?: string
}

type GenerateDocumentBody = {
  type?: DocumentType | string
  linkedTo?: string
  actor?: string
}

type SignupBody = {
  organizationName?: string
  workspaceSlug?: string
  email?: string
  name?: string
  password?: string
  customDomain?: string
}

type AuthCredentialRecord = {
  email: string
  passwordHash: string
  passwordSetAt: string
}

export type PasswordResetRecord = {
  id: string
  email: string
  tokenHash: string
  createdAt: string
  expiresAt: string
  usedAt?: string
}

export type MfaEnrollmentRecord = {
  userId: string
  organizationId: string
  encryptedSecret: string
  recoveryCodeHashes: string[]
  createdAt: string
  verifiedAt?: string
  updatedAt: string
}

type NorthStarServiceOptions = {
  authCredentials?: AuthCredentialRecord[]
  mfaEncryptionKey?: string
}

type CreatePurchaseOrderBody = {
  supplierId?: string
  materialId?: string
  quantityGrams?: number
  unitCost?: number
  currency?: string
  expectedDate?: string
}

type CreateSupplierBody = {
  name?: string
  country?: string
  leadTimeDays?: number
  contactEmail?: string
  paymentTerms?: string
  preferredMaterialIds?: string[]
}

type CreateCatalogSkuBody = {
  materialId?: string
  name?: string
  description?: string
  packSizeGrams?: number
  price?: number
  currency?: string
  tier?: CommercialSkuRecord['tier']
  moqPacks?: number
  labelTemplate?: string
}

type CreatePriceListBody = {
  name?: string
  customerGroup?: PriceListRecord['customerGroup']
  currency?: string
  multiplier?: number
  sampleEligible?: boolean
}

type CreateQuoteBody = {
  skuId?: string
  customerId?: string
  customer?: string
  customerGroup?: PriceListRecord['customerGroup']
  quantityPacks?: number
  lines?: Array<{ skuId?: string; quantityPacks?: number }>
}

type CreateSampleRequestBody = {
  skuId?: string
  customer?: string
  packs?: number
}

type CreateCustomerBody = {
  name?: string
  group?: PriceListRecord['customerGroup']
  creditLimit?: number
  paymentTerms?: CustomerRecord['paymentTerms']
  contactEmail?: string
  billingAddress?: Partial<CustomerAddress>
  shippingAddress?: Partial<CustomerAddress>
}

type CreateSalesOrderBody = {
  skuId?: string
  customerId?: string
  quantity?: number
  lines?: Array<{ skuId?: string; quantity?: number }>
  discountPercent?: number
  taxPercent?: number
  shippingCost?: number
  currency?: string
}

type PackOrderBody = {
  weightGrams?: number
}

type ShipOrderBody = {
  carrier?: ShipmentRecord['carrier']
  trackingNumber?: string
}

type BillingLimitKey = keyof BillingPlanRecord['limits']

type InventoryAdjustmentBody = {
  lotId?: string
  direction?: 'IN' | 'OUT'
  quantityGrams?: number
  reason?: string
}

type InventoryTransferBody = {
  lotId?: string
  toLocation?: string
}

type InventoryReceiptBody = {
  materialId?: string
  lotNumber?: string
  quantityGrams?: number
  expiryDate?: string
  qualityStatus?: LotQualityStatus
  location?: string
  supplierLotRef?: string
  currency?: string
  retestDate?: string
  openedDate?: string
  shelfLifeAfterOpeningDays?: number
  container?: string
  packaging?: string
  documents?: Array<{
    type?: 'SDS' | 'CoA'
    fileName?: string
    fileSizeKb?: number
    mimeType?: string
  }>
}

type InventoryStockTakeBody = {
  lotId?: string
  countedGrams?: number
  reason?: string
}

type InventoryQualityBody = {
  lotId?: string
  qualityStatus?: LotQualityStatus
  reason?: string
}

type InventoryApprovalAction =
  | 'inventory.adjust'
  | 'inventory.transfer'
  | 'inventory.receive'
  | 'inventory.stockTake'
  | 'inventory.quality'
type InventoryApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type InventoryApprovalPayload =
  | InventoryAdjustmentBody
  | InventoryTransferBody
  | InventoryReceiptBody
  | InventoryStockTakeBody
  | InventoryQualityBody
type NormalizedInventoryApprovalRequest = {
  action: InventoryApprovalAction
  requiredPermission: 'inventory.adjust' | 'inventory.receive'
  payload: InventoryApprovalPayload
  targetLabel: string
  defaultReason: string
}

type InventoryApprovalRequestRecord = {
  id: string
  organizationId: string
  requestedBy: string
  requestedByEmail: string
  action: InventoryApprovalAction
  requiredPermission: 'inventory.adjust' | 'inventory.receive'
  payload: InventoryApprovalPayload
  reason: string
  targetLabel: string
  status: InventoryApprovalStatus
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
  resultRef?: string
}

type OperationApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type OperationApprovalRequestRecord = {
  id: string
  organizationId: string
  requestedBy: string
  requestedByEmail: string
  action: string
  method: string
  path: string
  requiredPermission: string
  viewPermission?: string
  payload: Record<string, unknown>
  params: Record<string, string>
  reason: string
  targetLabel: string
  status: OperationApprovalStatus
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
  resultRef?: string
}

type NormalizedOperationApprovalRequest = {
  action: string
  method: string
  path: string
  requiredPermission: string
  viewPermission?: string
  payload: Record<string, unknown>
  params: Record<string, string>
  targetLabel: string
  defaultReason: string
}

type SsoUpdateBody = {
  provider?: SsoConfigRecord['provider']
  domain?: string
  issuerUrl?: string
  metadataUrl?: string
  clientId?: string
  roleMapping?: Record<string, unknown>
  jitProvisioning?: boolean
  enforceSso?: boolean
  scim?: {
    enabled?: boolean
    baseUrl?: string
    deprovisionAction?: SsoConfigRecord['scim']['deprovisionAction']
  }
}

type ApiKeyCreateBody = {
  label?: string
  scopes?: string[]
  expiresAt?: string
}

type WebhookMutationBody = {
  url?: string
  events?: string[]
  status?: WebhookRecord['status']
}

const productionLifecycleStatuses: ProductionBatchRecord['status'][] = [
  'PLANNED',
  'WEIGHING',
  'MACERATION',
  'FILTRATION',
  'QC',
  'BOTTLING',
  'RELEASED',
  'HOLD',
]

type RolePermissionMatrix = {
  role: string
  scope: RolePolicy['scope']
  mfaRequired: boolean
  allowedPermissions: string[]
  deniedPermissions: string[]
  highRiskPermissions: string[]
}

type SessionRevokeReason =
  | 'ADMIN_REVOKE'
  | 'AUTH_LOGOUT'
  | 'CONCURRENT_LIMIT'
  | 'IDLE_TIMEOUT'
  | 'ABSOLUTE_TIMEOUT'
  | 'MEMBERSHIP_DEACTIVATED'
  | 'REVOKE_ALL'

type MaterialMutationBody = Partial<Omit<Material, 'id' | 'provenance'>> & {
  source?: string
  version?: string
}

type MaterialNumericFields = Partial<
  Pick<Material, 'density' | 'vaporPressure' | 'mw' | 'logP' | 'ifraLimit' | 'costPerGram'>
>

type MaterialIngestionBody = {
  documentType?: 'SDS' | 'CoA'
  source?: string
  version?: string
  approved?: boolean
  fields?: MaterialNumericFields
  odor?: string[]
}

type FormulaLineMutationBody = {
  materialId?: string
  childFormulaId?: string
  grams?: number
  label?: string
  dilution?: number
  concentration?: number
  pyramidNote?: FormulaLine['pyramidNote']
  odorType?: string
  accord?: string
  tags?: unknown
  notes?: string
  sourceLotId?: string
  sourceLotNumber?: string
  sourceLocation?: string
  sourceAvailableGrams?: number
  sourceSupplierLotRef?: string
  inventoryConsumptionMode?: 'LINKED' | 'CONSUMED'
}


type FormulaDraftMutationBody = {
  expectedRevision?: number
  name?: string
  targetGrams?: number
  concentrationType?: Formula['concentrationType']
  finalProductConcentrationPercent?: number
  targetMarkets?: unknown
  brief?: string
  inspiration?: string
  pyramidSummary?: string
  tags?: unknown
  project?: string
  collection?: string
  density?: number
  bottleVolumeMl?: number
  bottleCount?: number
  ifraCategory?: string
  assignedReviewer?: string
  lines?: FormulaLine[]
}

type FormulaReviewBody = {
  reviewer?: string
  comment?: string
}

type FormulaEvaluationBody = {
  day?: number
  observation?: string
  stability?: FormulaEvaluationRecord['stability']
  rating?: number
}

function readFormulaPyramidNote(value: unknown, fallback?: FormulaLine['pyramidNote']) {
  if (value === 'Top' || value === 'Middle' || value === 'Base' || value === 'Solvent') {
    return value
  }
  return fallback
}

function readFormulaTags(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) {
    return fallback
  }
  return value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function readFormulaLineText(value: unknown, fallback?: string) {
  if (typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  return trimmed || fallback
}

function normalizeFormulaLineMetadata(body: FormulaLineMutationBody, fallback?: FormulaLine): Partial<FormulaLine> {
  const concentration = Number(body.concentration ?? body.dilution ?? fallback?.concentration ?? fallback?.dilution ?? 100)
  const safeConcentration = Number.isFinite(concentration) ? Math.min(100, Math.max(0.01, concentration)) : 100
  return {
    concentration: safeConcentration,
    pyramidNote: readFormulaPyramidNote(body.pyramidNote, fallback?.pyramidNote),
    odorType: readFormulaLineText(body.odorType, fallback?.odorType),
    accord: readFormulaLineText(body.accord, fallback?.accord),
    tags: readFormulaTags(body.tags, fallback?.tags),
    notes: readFormulaLineText(body.notes, fallback?.notes),
  }
}

@Injectable()
export class NorthStarService {
  private materialRecords: Material[] = structuredClone(materials)
  private moleculeRecords: MoleculeComponent[] = structuredClone(moleculeComponents)
  private lots: InventoryLot[] = structuredClone(initialLots)
  private movements: InventoryMovement[] = structuredClone(initialMovements)
  private locationRecords: StorageLocation[] = structuredClone(storageLocations)
  private stockTakeRecords: StockTakeRecord[] = structuredClone(stockTakeRecords)
  private formulaRecords: Formula[] = structuredClone(initialFormulas)
  private formulaVersionRecords: FormulaVersionRecord[] = structuredClone(formulaVersions)
  private usageHistory: LabUsageRecord[] = []
  private documentRecords: DocumentRecord[] = structuredClone(documents)
  private auditEvents: AuditEvent[] = structuredClone(auditEvents)
  private organizationRecords: OrganizationRecord[] = structuredClone(organizations)
  private brandRecords: BrandRecord[] = structuredClone(brands)
  private membershipRecords: MembershipRecord[] = structuredClone(memberships)
  private authCredentialRecords: AuthCredentialRecord[] = []
  private passwordResetRecords: PasswordResetRecord[] = []
  private mfaEnrollmentRecords: MfaEnrollmentRecord[] = []
  private readonly mfaEncryptionKey?: Buffer
  private sessions: AuthSession[] = structuredClone(authSessions)
  private userSettingsRecords: UserSettingsRecord[] = structuredClone(userSettings)
  private rolePolicyRecords: RolePolicy[] = structuredClone(rolePolicies)
  private settingsRecord: TenantSettingsRecord = structuredClone(tenantSettings)
  private flagRecords: FeatureFlagRecord[] = structuredClone(featureFlags)
  private sequences: NumberingSequenceRecord[] = structuredClone(numberingSequences)
  private customFieldRecords: CustomFieldDefinition[] = structuredClone(customFields)
  private brandingRecord: BrandingConfig = structuredClone(brandingConfig)
  private productionBatchRecords: ProductionBatchRecord[] = structuredClone(productionBatches)
  private supplierRecords: SupplierRecord[] = structuredClone(suppliers)
  private purchaseOrderRecords: PurchaseOrderRecord[] = structuredClone(purchaseOrders)
  private priceHistoryRecords: PriceHistoryRecord[] = structuredClone(priceHistory)
  private commercialSkuRecords: CommercialSkuRecord[] = structuredClone(commercialSkus)
  private priceListRecords: PriceListRecord[] = structuredClone(priceLists)
  private quoteRecords: QuoteRecord[] = structuredClone(quotes)
  private sampleRequestRecords: SampleRequestRecord[] = structuredClone(sampleRequests)
  private customerRecords: CustomerRecord[] = structuredClone(customers)
  private salesOrderRecords: SalesOrderRecord[] = structuredClone(salesOrders)
  private shipmentRecords: ShipmentRecord[] = structuredClone(shipments)
  private orderDocumentRecords: OrderDocumentRecord[] = structuredClone(orderDocuments)
  private scheduledReportRecords: ScheduledReportRecord[] = structuredClone(scheduledReports)
  private subscriptionRecords: BillingSubscriptionRecord[] = structuredClone(billingSubscriptions)
  private invoiceRecords: BillingInvoiceRecord[] = structuredClone(billingInvoices)
  private ssoConfigRecords: SsoConfigRecord[] = [structuredClone(ssoConfig)]
  private apiKeyRecords: ApiKeyRecord[] = structuredClone(apiKeys)
  private webhookRecords: WebhookRecord[] = structuredClone(webhooks)
  private webhookDeliveryRecords: WebhookDeliveryRecord[] = structuredClone(webhookDeliveries)
  private auditExportRecords: AuditExportJobRecord[] = structuredClone(auditExportJobs)
  private notificationRecords: AppNotificationRecord[] = []
  private importJobRecords: DataImportJobRecord[] = []
  private legalAcceptanceRecords: LegalAcceptanceRecord[] = []
  private privacyRequestRecords: PrivacyRequestRecord[] = []
  private customDomainRecords: SaasCustomDomainRecord[] = []
  private inventoryApprovalRequestRecords: InventoryApprovalRequestRecord[] = []
  private operationApprovalRequestRecords: OperationApprovalRequestRecord[] = []
  private auditCounter = auditEvents.length
  private activeSessionId: string | null = null
  private securityStateDirty = false

  constructor(options: NorthStarServiceOptions = {}) {
    if (options.authCredentials) {
      this.authCredentialRecords = structuredClone(options.authCredentials)
    }
    const configuredMfaKey = options.mfaEncryptionKey?.trim()
    if (configuredMfaKey && Buffer.byteLength(configuredMfaKey, 'utf8') < mfaEncryptionMinimumKeyBytes) {
      throw new Error('MFA_ENCRYPTION_KEY must contain at least 32 bytes')
    }
    this.mfaEncryptionKey = configuredMfaKey
      ? createHash('sha256').update(`olfactoryops:mfa-encryption:v1:${configuredMfaKey}`).digest()
      : undefined
  }

  phases() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'platform.view')
    return { data: internalPhases }
  }

  domains() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'platform.view')
    return { data: domains }
  }

  persistenceStatus(status: { adapter: string; snapshotKeys: number; snapshotTable: string; normalizedTables: string[] }) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'platform.view')
    return { data: status }
  }

  materials() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.view')
    return { data: this.materialCatalogForSession(session) }
  }

  materialDedupe(cas = '') {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.view')
    const normalizedCas = cas.trim().toLowerCase()
    const matches = normalizedCas
      ? this.materialCatalogForSession(session).filter((material) => material.cas.toLowerCase() === normalizedCas)
      : []
    return {
      data: {
        cas,
        matches,
        duplicate: matches.length > 0,
        invariant: 'CAS duplicate checks run before material creation',
      },
    }
  }

  createMaterial(body: MaterialMutationBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.create')
    const name = body.name?.trim()
    const cas = body.cas?.trim()
    if (!name) {
      throw new UnprocessableEntityException('Material name is required')
    }
    if (!cas || !/^[0-9-]+$/.test(cas)) {
      throw new UnprocessableEntityException('CAS must contain digits and hyphens')
    }
    if (this.materialCatalogForSession(session).some((material) => material.cas.toLowerCase() === cas.toLowerCase())) {
      throw new UnprocessableEntityException('Material CAS already exists')
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `material-${Date.now()}`
    const materialId = session.organizationId === 'org-nxl' ? `mat-${slug}` : `mat-${slug}-${this.shortId().toLowerCase()}`
    const material: Material = {
      id: materialId,
      organizationId: session.organizationId,
      name,
      cas,
      family: body.family?.trim() || 'Unclassified',
      tier: body.tier === 'Top' || body.tier === 'Heart' || body.tier === 'Base' ? body.tier : 'Base',
      vaporPressure: this.safeMaterialNumber(body.vaporPressure, 0.01),
      density: this.safeMaterialNumber(body.density, 1),
      mw: this.safeMaterialNumber(body.mw, 100),
      logP: this.safeMaterialNumber(body.logP, 1),
      substantivityHours: this.safeMaterialNumber(body.substantivityHours, 24),
      ifraLimit: this.safeMaterialNumber(body.ifraLimit, 100),
      costPerGram: this.safeMaterialNumber(body.costPerGram, 0.05),
      odor: body.odor?.filter(Boolean) ?? [],
      provenance: [
        {
          field: 'Material',
          source: body.source?.trim() || 'Manual material create',
          version: body.version?.trim() || 'v1',
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    }
    this.materialRecords = [material, ...this.materialRecords]
    const audit = this.recordAudit('material.create', material.id, session.userId, 'allowed')
    return { data: { material, audit, invariant: 'material master create does not create stock' } }
  }

  formulas() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.viewSensitive')
    return {
      data: this.formulaCatalogForSession(session),
      invariant: 'formula records are scoped to the active workspace',
    }
  }

  createFormulaDraft(body: FormulaDraftMutationBody & { formulaType?: FormulaType }) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const targetGrams = Number(body.targetGrams ?? 100)
    if (!Number.isFinite(targetGrams) || targetGrams <= 0) {
      throw new UnprocessableEntityException('Formula targetGrams must be greater than 0')
    }

    const formulaType: FormulaType = body.formulaType === 'ACCORD' ? 'ACCORD' : 'FINE_FRAGRANCE'
    const sequence = this.consumeSequenceNumber('formula', session.userId).data
    const code = formulaType === 'ACCORD' ? sequence.value.replace(/^FRM-/, 'ACC-') : sequence.value
    const defaultName = formulaType === 'ACCORD' ? 'Untitled Accord' : 'Untitled Fine Fragrance'
    const now = new Date().toISOString()
    const concentrationType =
      body.concentrationType === 'PARFUM' ||
      body.concentrationType === 'EDP' ||
      body.concentrationType === 'EDT' ||
      body.concentrationType === 'EDC' ||
      body.concentrationType === 'COLOGNE' ||
      body.concentrationType === 'OTHER'
        ? body.concentrationType
        : formulaType === 'ACCORD' ? 'OTHER' : 'EDP'
    const formula: Formula = {
      id: code.toLowerCase(),
      code,
      name: body.name?.trim() || defaultName,
      formulaType,
      version: 'v1',
      organizationId: session.organizationId,
      brandId: session.brandId,
      concentrationType,
      finalProductConcentrationPercent: Math.min(100, Math.max(0.01, Number(body.finalProductConcentrationPercent ?? (formulaType === 'ACCORD' ? 100 : 20)))),
      targetMarkets: readFormulaTags(body.targetMarkets, formulaType === 'ACCORD' ? ['GLOBAL'] : ['EU', 'US']),
      brief: body.brief?.trim() || '',
      inspiration: body.inspiration?.trim() || '',
      pyramidSummary: body.pyramidSummary?.trim() || '',
      tags: readFormulaTags(body.tags),
      project: body.project?.trim() || '',
      collection: body.collection?.trim() || '',
      density: Math.max(0.01, Number(body.density ?? 1)),
      bottleVolumeMl: Math.max(0.01, Number(body.bottleVolumeMl ?? 50)),
      bottleCount: Math.max(1, Math.round(Number(body.bottleCount ?? 1))),
      ifraCategory: body.ifraCategory?.trim() || '4',
      workflowStatus: 'DRAFT',
      draftRevision: 1,
      updatedAt: now,
      updatedBy: session.email,
      assignedReviewer: body.assignedReviewer?.trim() || undefined,
      approvalHistory: [],
      status: 'draft',
      targetGrams,
      owner: session.email,
      lines: [],
    }

    this.formulaRecords = [formula, ...this.formulaRecords]
    this.recordAudit('formula.create', formula.code, session.userId, 'allowed')
    return { data: { formula, invariant: 'formula draft creation does not create inventory movement' } }
  }

  updateFormulaDraft(id: string, body: FormulaDraftMutationBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const formula = this.formulaForSession(id, session)
    this.requireEditableFormula(formula)
    if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== formula.draftRevision) {
      throw new UnprocessableEntityException({
        message: 'Formula draft changed in another session; refresh before saving',
        expectedRevision: body.expectedRevision,
        currentRevision: formula.draftRevision,
      })
    }

    const bounded = (value: unknown, fallback: number, minimum: number, maximum: number) => {
      const next = Number(value)
      return Number.isFinite(next) ? Math.min(maximum, Math.max(minimum, next)) : fallback
    }
    const targetGrams = bounded(body.targetGrams, formula.targetGrams, 0.01, 1_000_000)
    let lines = formula.lines
    if (body.lines !== undefined) {
      if (!Array.isArray(body.lines) || body.lines.length > 500) {
        throw new UnprocessableEntityException('Formula lines must be an array with at most 500 entries')
      }
      lines = body.lines.map((candidate, index) => {
        const lineBody: FormulaLineMutationBody = { ...candidate, tags: candidate.tags }
        const { grams, material, childFormula } = this.validateFormulaLineMutation(id, lineBody, session)
        return {
          id: candidate.id?.trim() || `${id}-line-${index + 1}-${Date.now()}`,
          label: candidate.label?.trim() || material?.name || childFormula?.name || `Formula line ${index + 1}`,
          grams,
          ...(material ? { materialId: material.id } : {}),
          ...(childFormula ? { childFormulaId: childFormula.id } : {}),
          ...normalizeFormulaLineMetadata(lineBody, candidate),
          ...this.normalizeFormulaInventorySource(lineBody, material, grams, session, candidate),
        }
      })
      if (new Set(lines.map((line) => line.id)).size !== lines.length) {
        throw new UnprocessableEntityException('Formula line identifiers must be unique')
      }
    }

    const updatedFormula = this.touchFormula(formula, session, {
      name: body.name === undefined ? formula.name : body.name.trim() || formula.name,
      targetGrams,
      concentrationType: body.concentrationType ?? formula.concentrationType,
      finalProductConcentrationPercent: bounded(body.finalProductConcentrationPercent, formula.finalProductConcentrationPercent, 0.01, 100),
      targetMarkets: body.targetMarkets === undefined ? formula.targetMarkets : readFormulaTags(body.targetMarkets),
      brief: body.brief === undefined ? formula.brief : body.brief.trim(),
      inspiration: body.inspiration === undefined ? formula.inspiration : body.inspiration.trim(),
      pyramidSummary: body.pyramidSummary === undefined ? formula.pyramidSummary : body.pyramidSummary.trim(),
      tags: body.tags === undefined ? formula.tags : readFormulaTags(body.tags),
      project: body.project === undefined ? formula.project : body.project.trim(),
      collection: body.collection === undefined ? formula.collection : body.collection.trim(),
      density: bounded(body.density, formula.density, 0.01, 10),
      bottleVolumeMl: bounded(body.bottleVolumeMl, formula.bottleVolumeMl, 0.1, 100_000),
      bottleCount: Math.round(bounded(body.bottleCount, formula.bottleCount, 1, 1_000_000)),
      ifraCategory: body.ifraCategory === undefined ? formula.ifraCategory : body.ifraCategory.trim() || formula.ifraCategory,
      assignedReviewer: body.assignedReviewer === undefined ? formula.assignedReviewer : body.assignedReviewer.trim() || undefined,
      workflowStatus: 'DRAFT',
      status: 'draft',
      lines,
    })
    this.replaceFormula(updatedFormula)
    const evidence = this.formulaEvidence(updatedFormula, session)
    const audit = this.recordAudit('formula.update', updatedFormula.code, session.userId, 'allowed')
    return {
      data: {
        formula: updatedFormula,
        ...evidence,
        audit,
        invariant: 'draft autosave is revision-checked and never creates inventory movement',
      },
    }
  }

  forkFormula(id: string, body: { name?: string; comment?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const source = this.formulaForSession(id, session)
    const sequence = this.consumeSequenceNumber('formula', session.userId).data
    const code = source.formulaType === 'ACCORD' ? sequence.value.replace(/^FRM-/, 'ACC-') : sequence.value
    const now = new Date().toISOString()
    const forked: Formula = {
      ...structuredClone(source),
      id: code.toLowerCase(),
      code,
      name: body.name?.trim() || `${source.name} Working Copy`,
      version: 'v1',
      status: 'draft',
      workflowStatus: 'DRAFT',
      draftRevision: 1,
      updatedAt: now,
      updatedBy: session.email,
      lockedVersion: undefined,
      parentFormulaId: source.id,
      parentVersion: source.version,
      assignedReviewer: undefined,
      owner: session.email,
      approvalHistory: [
        {
          id: `APR-${code}-FORK`,
          action: 'FORKED',
          actor: session.email,
          comment: body.comment?.trim() || `Forked from ${source.code} ${source.version}`,
          at: now,
        },
      ],
      lines: source.lines.map((line, index) => ({ ...structuredClone(line), id: `${code.toLowerCase()}-line-${index + 1}` })),
    }
    this.formulaRecords = [forked, ...this.formulaRecords]
    const audit = this.recordAudit('formula.fork', `${source.code}:${forked.code}`, session.userId, 'allowed')
    return {
      data: {
        formula: forked,
        audit,
        invariant: 'approved compositions remain immutable while forked drafts preserve lineage',
      },
    }
  }


  private normalizeFormulaInventorySource(
    body: FormulaLineMutationBody,
    material: Material | undefined,
    grams: number,
    session: AuthSession,
    fallback?: FormulaLine,
  ): Partial<FormulaLine> {
    const sourceLotId = body.sourceLotId?.trim() || fallback?.sourceLotId
    if (!sourceLotId || !material) {
      return {}
    }

    const lot = this.lotsForSession(session).find((item) => item.id === sourceLotId)
    if (!lot) {
      throw new NotFoundException(`Inventory lot ${sourceLotId} was not found`)
    }
    if (lot.materialId !== material.id) {
      throw new UnprocessableEntityException('Inventory lot does not match the formula material')
    }
    if (!isLotEligibleForInventory(lot)) {
      throw new UnprocessableEntityException('Formula source lot must be approved and not expired')
    }

    const availableGrams = Math.max(0, lot.quantityGrams - lot.reservedGrams)
    const inventoryConsumptionMode =
      body.inventoryConsumptionMode === 'CONSUMED' || body.inventoryConsumptionMode === 'LINKED'
        ? body.inventoryConsumptionMode
        : fallback?.inventoryConsumptionMode ?? 'LINKED'
    const previouslyConsumedGrams = Math.max(0, Number(fallback?.inventoryConsumedGrams ?? 0))
    const isSameLot = fallback?.sourceLotId === lot.id
    const requiredAvailableGrams =
      inventoryConsumptionMode === 'CONSUMED'
        ? isSameLot
          ? Math.max(0, grams - previouslyConsumedGrams)
          : grams
        : fallback
          ? 0
          : grams
    if (requiredAvailableGrams - availableGrams > 0.0001) {
      throw new UnprocessableEntityException({
        message: 'Formula line grams exceed available source lot stock',
        materialId: material.id,
        lotId: lot.id,
        requestedGrams: requiredAvailableGrams,
        availableGrams,
      })
    }

    return {
      sourceLotId: lot.id,
      sourceLotNumber: lot.lotNumber,
      sourceLocation: lot.location,
      sourceAvailableGrams: availableGrams,
      sourceSupplierLotRef: lot.supplierLotRef,
      inventoryConsumptionMode,
      ...(inventoryConsumptionMode === 'CONSUMED' && previouslyConsumedGrams > 0
        ? { inventoryConsumedGrams: previouslyConsumedGrams }
        : {}),
    }
  }

  private syncFormulaLineInventory(
    formula: Formula,
    previousLine: FormulaLine | undefined,
    nextLine: FormulaLine | undefined,
    session: AuthSession,
  ) {
    const previousConsumedGrams = Math.max(0, Number(previousLine?.inventoryConsumedGrams ?? 0))
    const nextConsumesInventory =
      nextLine?.inventoryConsumptionMode === 'CONSUMED' && Boolean(nextLine.materialId && nextLine.sourceLotId)
    const nextConsumedGrams = nextConsumesInventory ? Math.max(0, Number(nextLine?.grams ?? 0)) : 0
    if (previousConsumedGrams <= 0 && nextConsumedGrams <= 0) {
      return { line: nextLine, movements: [] as InventoryMovement[] }
    }

    this.requirePermission(session.role, 'inventory.commitLabUsage')
    const lotMap = new Map(this.lotsForSession(session).map((lot) => [lot.id, { ...lot }]))
    const timestamp = new Date().toISOString()
    const movements: InventoryMovement[] = []
    const lineReference = nextLine ?? previousLine
    const ref = `${formula.code}:${lineReference?.id ?? 'line'}`

    const recordMovement = (
      lot: InventoryLot,
      materialId: string,
      quantityGrams: number,
      direction: 'IN' | 'OUT',
      type: 'LAB_CONSUMPTION' | 'REVERSAL',
    ) => {
      if (quantityGrams <= 0.0001) {
        return
      }
      lot.quantityGrams = direction === 'OUT'
        ? Number((lot.quantityGrams - quantityGrams).toFixed(4))
        : Number((lot.quantityGrams + quantityGrams).toFixed(4))
      movements.push({
        id: `MOV-FRM-${formula.id}-${Date.now()}-${this.movements.length + movements.length + 1}`,
        at: timestamp,
        type,
        direction,
        materialId,
        lotId: lot.id,
        quantityGrams,
        balanceAfter: lot.quantityGrams,
        ref,
        actor: session.email,
      })
    }

    const previousLotId = previousLine?.sourceLotId
    const previousMaterialId = previousLine?.materialId
    const nextLotId = nextLine?.sourceLotId
    const nextMaterialId = nextLine?.materialId
    const sameSource = Boolean(previousLotId && previousLotId === nextLotId && previousMaterialId === nextMaterialId)

    if (previousConsumedGrams > 0 && (!nextConsumesInventory || !sameSource)) {
      const previousLot = previousLotId ? lotMap.get(previousLotId) : undefined
      if (!previousLot || !previousMaterialId) {
        throw new NotFoundException('The source lot for this consumed formula line is no longer available')
      }
      recordMovement(previousLot, previousMaterialId, previousConsumedGrams, 'IN', 'REVERSAL')
    }

    if (nextConsumesInventory && nextLotId && nextMaterialId) {
      const nextLot = lotMap.get(nextLotId)
      if (!nextLot) {
        throw new NotFoundException(`Inventory lot ${nextLotId} was not found`)
      }
      const requiredGrams = sameSource ? nextConsumedGrams - previousConsumedGrams : nextConsumedGrams
      if (requiredGrams > 0) {
        const availableGrams = Math.max(0, nextLot.quantityGrams - nextLot.reservedGrams)
        if (requiredGrams - availableGrams > 0.0001) {
          throw new UnprocessableEntityException({
            message: 'Formula line change exceeds available source lot stock',
            materialId: nextMaterialId,
            lotId: nextLotId,
            requestedGrams: requiredGrams,
            availableGrams,
          })
        }
        recordMovement(nextLot, nextMaterialId, requiredGrams, 'OUT', 'LAB_CONSUMPTION')
      } else if (requiredGrams < 0) {
        recordMovement(nextLot, nextMaterialId, Math.abs(requiredGrams), 'IN', 'REVERSAL')
      }
    }

    if (movements.length > 0) {
      this.replaceLotsForSession(session, Array.from(lotMap.values()))
      this.movements = [...movements, ...this.movements]
    }

    return {
      line: nextLine
        ? {
            ...nextLine,
            ...(nextConsumesInventory ? { inventoryConsumedGrams: nextConsumedGrams } : {}),
          }
        : undefined,
      movements,
    }
  }

  addFormulaLine(
    id: string,
    body: FormulaLineMutationBody,
  ) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const formula = this.formulaForSession(id, session)
    this.requireEditableFormula(formula)

    const { grams, material, childFormula } = this.validateFormulaLineMutation(id, body, session)

    const line: FormulaLine = {
      id: `${id}-line-${formula.lines.length + 1}-${Date.now()}`,
      label: body.label?.trim() || material?.name || childFormula?.name || 'Formula line',
      grams,
      ...(material ? { materialId: material.id } : {}),
      ...(childFormula ? { childFormulaId: childFormula.id } : {}),
      ...normalizeFormulaLineMetadata(body),
      ...this.normalizeFormulaInventorySource(body, material, grams, session),
    }
    const synchronized = this.syncFormulaLineInventory(formula, undefined, line, session)
    const updatedFormula = this.touchFormula(formula, session, {
      status: 'draft',
      workflowStatus: 'DRAFT',
      lines: [...formula.lines, synchronized.line ?? line],
    })
    this.replaceFormula(updatedFormula)
    const leaves = this.formulaEvidence(updatedFormula, session).leaves

    this.recordAudit('formula.line.create', updatedFormula.code, session.userId, 'allowed')
    return {
      data: {
        formula: updatedFormula,
        line: synchronized.line ?? line,
        leaves,
        totals: formulaTotals(leaves),
        movements: synchronized.movements,
        invariant: synchronized.movements.length > 0
          ? 'inventory-sourced formula line created immutable LAB_CONSUMPTION movement'
          : 'formula line save does not create inventory movement',
      },
    }
  }

  updateFormulaLine(id: string, lineId: string, body: FormulaLineMutationBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const formula = this.formulaForSession(id, session)
    this.requireEditableFormula(formula)
    const line = formula.lines.find((item) => item.id === lineId)
    if (!line) {
      throw new NotFoundException(`Formula line ${lineId} was not found`)
    }

    const mutationBody: FormulaLineMutationBody = {
      grams: body.grams ?? line.grams,
      label: body.label ?? line.label,
      materialId: body.materialId ?? (body.childFormulaId ? undefined : line.materialId),
      childFormulaId: body.childFormulaId ?? (body.materialId ? undefined : line.childFormulaId),
      concentration: body.concentration ?? line.concentration,
      dilution: body.dilution ?? line.dilution,
      pyramidNote: body.pyramidNote ?? line.pyramidNote,
      odorType: body.odorType ?? line.odorType,
      accord: body.accord ?? line.accord,
      tags: body.tags ?? line.tags,
      notes: body.notes ?? line.notes,
      sourceLotId: body.sourceLotId ?? line.sourceLotId,
      sourceLotNumber: body.sourceLotNumber ?? line.sourceLotNumber,
      sourceLocation: body.sourceLocation ?? line.sourceLocation,
      sourceAvailableGrams: body.sourceAvailableGrams ?? line.sourceAvailableGrams,
      sourceSupplierLotRef: body.sourceSupplierLotRef ?? line.sourceSupplierLotRef,
    }
    const { grams, material, childFormula } = this.validateFormulaLineMutation(id, mutationBody, session)
    const updatedLine: FormulaLine = {
      id: line.id,
      label: mutationBody.label?.trim() || material?.name || childFormula?.name || line.label,
      grams,
      ...(material ? { materialId: material.id } : {}),
      ...(childFormula ? { childFormulaId: childFormula.id } : {}),
      ...(line.dilution ? { dilution: line.dilution } : {}),
      ...normalizeFormulaLineMetadata(mutationBody, line),
      ...this.normalizeFormulaInventorySource(mutationBody, material, grams, session, line),
    }
    const synchronized = this.syncFormulaLineInventory(formula, line, updatedLine, session)
    const updatedFormula = this.touchFormula(formula, session, {
      status: 'draft',
      workflowStatus: 'DRAFT',
      lines: formula.lines.map((item) => (item.id === lineId ? synchronized.line ?? updatedLine : item)),
    })
    this.replaceFormula(updatedFormula)
    const leaves = this.formulaEvidence(updatedFormula, session).leaves
    const audit = this.recordAudit('formula.line.update', updatedFormula.code, session.userId, 'allowed')
    return {
      data: {
        formula: updatedFormula,
        line: synchronized.line ?? updatedLine,
        leaves,
        totals: formulaTotals(leaves),
        movements: synchronized.movements,
        audit,
        invariant: synchronized.movements.length > 0
          ? 'inventory-sourced formula line adjustment recorded immutable compensation movements'
          : 'formula line update does not create inventory movement',
      },
    }
  }

  deleteFormulaLine(id: string, lineId: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const formula = this.formulaForSession(id, session)
    this.requireEditableFormula(formula)
    const line = formula.lines.find((item) => item.id === lineId)
    if (!line) {
      throw new NotFoundException(`Formula line ${lineId} was not found`)
    }

    const synchronized = this.syncFormulaLineInventory(formula, line, undefined, session)
    const updatedFormula = this.touchFormula(formula, session, {
      status: 'draft',
      workflowStatus: 'DRAFT',
      lines: formula.lines.filter((line) => line.id !== lineId),
    })
    this.replaceFormula(updatedFormula)
    const leaves = this.formulaEvidence(updatedFormula, session).leaves
    const audit = this.recordAudit('formula.line.delete', updatedFormula.code, session.userId, 'allowed')
    return {
      data: {
        formula: updatedFormula,
        leaves,
        totals: formulaTotals(leaves),
        movements: synchronized.movements,
        audit,
        invariant: synchronized.movements.length > 0
          ? 'removed inventory-sourced formula line was restored with an immutable reversal movement'
          : 'formula line delete does not create inventory movement',
      },
    }
  }

  moveFormulaLine(id: string, lineId: string, body: { direction?: 'up' | 'down' }) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const formula = this.formulaForSession(id, session)
    this.requireEditableFormula(formula)
    const index = formula.lines.findIndex((line) => line.id === lineId)
    if (index === -1) {
      throw new NotFoundException(`Formula line ${lineId} was not found`)
    }
    const direction = body.direction === 'down' ? 'down' : 'up'
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= formula.lines.length) {
      return {
        data: {
          formula,
          invariant: 'formula line order unchanged at boundary and no inventory movement was created',
        },
      }
    }

    const lines = [...formula.lines]
    const currentLine = lines[index]
    const swapLine = lines[swapIndex]
    if (!currentLine || !swapLine) {
      throw new NotFoundException(`Formula line ${lineId} was not found`)
    }
    lines[index] = swapLine
    lines[swapIndex] = currentLine
    const updatedFormula = this.touchFormula(formula, session, {
      status: 'draft',
      workflowStatus: 'DRAFT',
      lines,
    })
    this.replaceFormula(updatedFormula)
    const audit = this.recordAudit('formula.line.reorder', updatedFormula.code, session.userId, 'allowed')
    return {
      data: {
        formula: updatedFormula,
        audit,
        invariant: 'formula line reorder does not create inventory movement',
      },
    }
  }

  material(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.view')
    const material = this.materialForSession(id, session)
    const summary = stockSummary(this.lotsForSession(session), this.materialCatalogForSession(session)).find((item) => item.material.id === id)
    return { data: { ...material, stock: summary } }
  }

  updateMaterial(id: string, body: MaterialMutationBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.update')
    const material = this.materialForSession(id, session)
    const updated = this.mergeMaterial(material, body, body.source?.trim() || 'Manual material update', body.version?.trim() || 'v1')
    this.materialRecords = this.materialRecords.map((item) => (item.id === id ? updated : item))
    const audit = this.recordAudit('material.update', id, session.userId, 'allowed')
    return { data: { material: updated, audit, invariant: 'material edits preserve field provenance' } }
  }

  ingestMaterialDocument(id: string, body: MaterialIngestionBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.update')
    const material = this.materialForSession(id, session)
    const documentType = body.documentType === 'CoA' ? 'CoA' : 'SDS'
    const source = body.source?.trim() || `${material.name} ${documentType}`
    const version = body.version?.trim() || 'v1'
    const fallbackFields =
      documentType === 'CoA'
        ? { costPerGram: Number((material.costPerGram * 0.98).toFixed(4)) }
        : {
            density: Number((material.density + 0.01).toFixed(3)),
            vaporPressure: Number((material.vaporPressure * 1.08).toFixed(4)),
            mw: material.mw,
            logP: Number((material.logP + 0.05).toFixed(2)),
          }
    const fields = this.sanitizeMaterialFields({ ...fallbackFields, ...body.fields })
    const ingestion: MaterialIngestionRecord = {
      id: `ING-${String(this.auditCounter + 1).padStart(5, '0')}`,
      materialId: id,
      documentType,
      source,
      version,
      status: body.approved === true ? 'APPROVED' : 'REVIEW_REQUIRED',
      extractedFields: Object.keys(fields),
    }
    const audit = this.recordAudit(
      body.approved === true ? 'material.ingest.approve' : 'material.ingest.review',
      id,
      session.userId,
      body.approved === true ? 'allowed' : 'review',
    )

    if (body.approved !== true) {
      return {
        data: {
          material,
          ingestion,
          audit,
          invariant: 'SDS/CoA extraction is staged for human review before write',
        },
      }
    }

    const updated = this.mergeMaterial(
      material,
      { ...fields, odor: body.odor },
      `${source} ${documentType} review`,
      version,
    )
    this.materialRecords = this.materialRecords.map((item) => (item.id === id ? updated : item))
    return {
      data: {
        material: updated,
        ingestion,
        audit,
        invariant: 'SDS/CoA ingestion writes only after explicit approval',
      },
    }
  }

  pubchemFill(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.update')
    const material = this.materialForSession(id, session)
    const profile = this.pubchemProfile(material)
    const updated = this.mergeMaterial(material, profile.fields, 'PubChem curated fill', '2026-07')
    const nextMolecules = profile.molecules.map((molecule, index) => ({
      ...molecule,
      id: `mol-${id}-${index + 1}`,
      materialId: id,
      source: 'PubChem curated fill',
      status: 'REVIEW' as const,
    }))
    this.materialRecords = this.materialRecords.map((item) => (item.id === id ? updated : item))
    this.moleculeRecords = [
      ...nextMolecules,
      ...this.moleculeRecords.filter((molecule) => molecule.materialId !== id || molecule.status === 'VERIFIED'),
    ]
    const audit = this.recordAudit('material.pubchemFill', id, session.userId, 'allowed')
    return {
      data: {
        material: updated,
        molecules: this.moleculeRecords.filter((molecule) => molecule.materialId === id),
        audit,
        invariant: 'PubChem fill is curated tenant data, not tenant-crossing scraping',
      },
    }
  }

  materialMolecules(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.view')
    this.materialForSession(id, session)
    const molecules = this.moleculeRecords.filter((molecule) => molecule.materialId === id)
    return {
      data: {
        materialId: id,
        molecules,
        totalPercent: molecules.reduce((sum, molecule) => sum + molecule.percent, 0),
        invariant: 'molecule split is linked to a tenant material record',
      },
    }
  }

  materialProvenance(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'materials.view')
    const material = this.materialForSession(id, session)
    return {
      data: {
        materialId: id,
        provenance: material.provenance,
        documents: this.documentRecords.filter((document) => document.linkedTo === id),
        invariant: 'every sourced material field keeps provenance evidence',
      },
    }
  }

  resolveFormula(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.viewSensitive')
    const formula = this.formulaForSession(id, session)
    const evidence = this.formulaEvidence(formula, session)
    return {
      data: {
        formula,
        ...evidence,
        composition: formulaComposition(formula),
        invariant: 'nested accords and dilution are resolved before cost, IFRA, and evaporation',
      },
    }
  }

  formulaCost(id: string) {
    const resolved = this.resolveFormula(id).data
    return {
      data: {
        formula: resolved.formula,
        totals: resolved.totals,
        invariant: 'cost is derived from resolved formula leaves',
      },
    }
  }

  formulaVersions(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.viewSensitive')
    const formula = this.formulaForSession(id, session)
    const versions = this.formulaVersionRecords
      .filter((version) => version.formulaId === id && (version.organizationId || 'org-nxl') === session.organizationId)
      .map((version) => this.normalizeFormulaVersionRecord(version, formula, session))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    return {
      data: {
        formula,
        versions,
        invariant: 'version history is immutable workspace-scoped evidence for formula approval',
      },
    }
  }

  createFormulaVersion(id: string, body: { note?: string; actor?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const formula = this.formulaForSession(id, session)
    this.requireEditableFormula(formula)
    if (formula.lines.length === 0) {
      throw new UnprocessableEntityException('Formula must have at least one line before snapshot')
    }

    const version = this.nextFormulaVersionValue(formula.version)
    const updatedFormula = this.touchFormula(formula, session, {
      version,
      status: 'review',
      workflowStatus: 'DRAFT',
    })
    const evidence = this.formulaEvidence(updatedFormula, session)
    const snapshot: FormulaVersionRecord = {
      id: `${updatedFormula.code}-${version}`,
      formulaId: id,
      formulaCode: updatedFormula.code,
      organizationId: session.organizationId,
      version,
      status: 'SNAPSHOT',
      createdAt: new Date().toISOString(),
      createdBy: session.email,
      note: body.note?.trim() || `Snapshot ${updatedFormula.code} ${version}`,
      lineCount: updatedFormula.lines.length,
      totalGrams: evidence.totals.totalGrams,
      totalCost: evidence.totals.totalCost,
      checksum: this.formulaVersionChecksum(updatedFormula),
      metadata: formulaSnapshotMetadata(updatedFormula),
      evaluations: [],
      resolvedLeaves: structuredClone(evidence.leaves),
      ifraEvaluation: structuredClone(evidence.ifra),
      evaporation: structuredClone(evidence.evaporation),
      lines: structuredClone(updatedFormula.lines),
    }

    this.replaceFormula(updatedFormula)
    this.formulaVersionRecords = [
      snapshot,
      ...this.formulaVersionRecords.filter((item) => item.id !== snapshot.id),
    ]
    const audit = this.recordAudit('formula.version.snapshot', updatedFormula.code, session.userId, 'allowed')
    return {
      data: {
        formula: updatedFormula,
        version: snapshot,
        audit,
        invariant: 'immutable composition and compliance evidence is captured without inventory movement',
      },
    }
  }


  submitFormulaForReview(id: string, body: FormulaReviewBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const formula = this.formulaForSession(id, session)
    this.requireEditableFormula(formula)
    const reviewer = body.reviewer?.trim() || formula.assignedReviewer?.trim()
    if (!reviewer) {
      throw new UnprocessableEntityException('Assign a reviewer before submitting the formula')
    }
    const evidence = this.formulaEvidence(formula, session)
    if (!formulaComposition(formula).ready) {
      throw new UnprocessableEntityException('Formula composition must total 100% before review')
    }
    if (formula.targetMarkets.length === 0) {
      throw new UnprocessableEntityException('Select at least one target market before review')
    }
    if (formula.finalProductConcentrationPercent <= 0) {
      throw new UnprocessableEntityException('Final-product concentration is required before review')
    }

    const snapshotResult = this.createFormulaVersion(id, { note: body.comment || `Submitted to ${reviewer}` }).data
    const now = new Date().toISOString()
    const submitted = this.touchFormula(snapshotResult.formula, session, {
      status: 'review',
      workflowStatus: 'IN_REVIEW',
      assignedReviewer: reviewer,
      approvalHistory: [
        ...snapshotResult.formula.approvalHistory,
        {
          id: `APR-${snapshotResult.formula.code}-${Date.now()}`,
          action: 'SUBMITTED',
          actor: session.email,
          reviewer,
          comment: body.comment?.trim() || 'Submitted for formula approval',
          at: now,
        },
      ],
    })
    this.replaceFormula(submitted)
    const audit = this.recordAudit('formula.review.submit', submitted.code, session.userId, evidence.ifra.blockerCount > 0 ? 'review' : 'allowed')
    return {
      data: {
        formula: submitted,
        version: snapshotResult.version,
        ifra: evidence.ifra,
        audit,
        invariant: 'review submission captures immutable evidence and creates no stock movement',
      },
    }
  }

  rejectFormula(id: string, body: FormulaReviewBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.approve')
    const formula = this.formulaForSession(id, session)
    if (formula.workflowStatus !== 'IN_REVIEW') {
      throw new UnprocessableEntityException('Only formulas in review can be returned for changes')
    }
    const comment = body.comment?.trim()
    if (!comment) {
      throw new UnprocessableEntityException('A rejection comment is required')
    }
    const now = new Date().toISOString()
    const rejected = this.touchFormula(formula, session, {
      status: 'review',
      workflowStatus: 'CHANGES_REQUESTED',
      approvalHistory: [
        ...formula.approvalHistory,
        {
          id: `APR-${formula.code}-${Date.now()}`,
          action: 'REJECTED',
          actor: session.email,
          reviewer: session.email,
          comment,
          at: now,
        },
      ],
    })
    this.replaceFormula(rejected)
    const audit = this.recordAudit('formula.review.reject', rejected.code, session.userId, 'review')
    return {
      data: {
        formula: rejected,
        audit,
        invariant: 'rejection reopens a controlled draft without changing inventory',
      },
    }
  }

  formulaIfra(id: string) {
    const resolved = this.resolveFormula(id).data
    return {
      data: {
        formula: resolved.formula,
        ifra: resolved.ifra,
        invariant: 'IFRA is evaluated against final-product concentration after nested active resolve',
      },
    }
  }

  formulaEvaporation(id: string) {
    const resolved = this.resolveFormula(id).data
    return {
      data: {
        formula: resolved.formula,
        leaves: resolved.leaves,
        evaporation: resolved.evaporation,
        invariant: 'evaporation uses resolved raw active leaves rather than parent accord labels',
      },
    }
  }

  applyFormulaScale(id: string, body: { targetGrams?: number; targetVolumeMl?: number; bottleCount?: number; incrementGrams?: number } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const formula = this.formulaForSession(id, session)
    this.requireEditableFormula(formula)
    const currentTotalGrams = formula.lines.reduce((total, line) => total + line.grams, 0)
    if (formula.lines.length === 0 || currentTotalGrams <= 0) {
      throw new UnprocessableEntityException('Add at least one formula line before applying a scale')
    }

    const targetGrams =
      Number.isFinite(Number(body.targetGrams)) && Number(body.targetGrams) > 0
        ? Number(body.targetGrams)
        : Number.isFinite(Number(body.targetVolumeMl)) && Number(body.targetVolumeMl) > 0
          ? Number(body.targetVolumeMl) * formula.density
          : Number.isFinite(Number(body.bottleCount)) && Number(body.bottleCount) > 0
            ? Number(body.bottleCount) * formula.bottleVolumeMl * formula.density
            : formula.targetGrams
    const incrementGrams = Math.min(100, Math.max(0.0001, Number(body.incrementGrams ?? 0.01)))
    const roundToIncrement = (value: number) => Number((Math.round(value / incrementGrams) * incrementGrams).toFixed(4))
    const scaledLines = formula.lines.map((line) => ({
      ...line,
      grams: roundToIncrement((line.grams / currentTotalGrams) * targetGrams),
    }))
    const roundedTotal = scaledLines.reduce((total, line) => total + line.grams, 0)
    const roundingDelta = Number((targetGrams - roundedTotal).toFixed(4))
    if (Math.abs(roundingDelta) > 0.0001) {
      const largestLine = scaledLines.reduce((largestIndex, line, index, lines) =>
        line.grams > (lines[largestIndex]?.grams ?? 0) ? index : largestIndex,
      0)
      const line = scaledLines[largestLine]
      if (!line || line.grams + roundingDelta <= 0) {
        throw new UnprocessableEntityException('Scale rounding would create an invalid formula line')
      }
      line.grams = Number((line.grams + roundingDelta).toFixed(4))
    }

    const movements: InventoryMovement[] = []
    const synchronizedLines = scaledLines.map((nextLine) => {
      const previousLine = formula.lines.find((line) => line.id === nextLine.id)
      const synchronized = this.syncFormulaLineInventory(formula, previousLine, nextLine, session)
      movements.push(...synchronized.movements)
      return synchronized.line ?? nextLine
    })
    const updatedFormula = this.touchFormula(formula, session, {
      status: 'draft',
      workflowStatus: 'DRAFT',
      targetGrams: Number(targetGrams.toFixed(4)),
      lines: synchronizedLines,
    })
    this.replaceFormula(updatedFormula)
    const audit = this.recordAudit('formula.scale.apply', updatedFormula.code, session.userId, 'allowed')
    return {
      data: {
        formula: updatedFormula,
        movements,
        audit,
        invariant: movements.length > 0
          ? 'formula scale updates source-lot consumption through immutable delta movements'
          : 'formula scale updates the draft composition without inventory movement',
      },
    }
  }

  formulaScale(id: string, body: { targetGrams?: number; targetVolumeMl?: number; bottleCount?: number; incrementGrams?: number } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.viewSensitive')
    const formula = this.formulaForSession(id, session)
    const currentTotalGrams = formula.lines.reduce((total, line) => total + line.grams, 0)
    const requestedGrams =
      Number.isFinite(Number(body.targetGrams)) && Number(body.targetGrams) > 0
        ? Number(body.targetGrams)
        : Number.isFinite(Number(body.targetVolumeMl)) && Number(body.targetVolumeMl) > 0
          ? Number(body.targetVolumeMl) * formula.density
          : Number.isFinite(Number(body.bottleCount)) && Number(body.bottleCount) > 0
            ? Number(body.bottleCount) * formula.bottleVolumeMl * formula.density
            : formula.targetGrams
    const compositionBasis = currentTotalGrams > 0 ? { ...formula, targetGrams: currentTotalGrams } : formula
    const plan = scaleFormula(compositionBasis, requestedGrams, Number(body.incrementGrams ?? 0.01))
    return {
      data: {
        formula,
        plan,
        invariant: 'scale preview uses the current composition as its basis and does not change inventory',
      },
    }
  }

  formulaVersionDiff(id: string, fromVersion?: string, toVersion?: string) {
    const { formula, versions } = this.formulaVersions(id).data
    const before = fromVersion ? versions.find((version) => version.version === fromVersion) : versions[1]
    const after = toVersion ? versions.find((version) => version.version === toVersion) : versions[0]
    if (!before || !after || before.id === after.id) {
      throw new UnprocessableEntityException('Select two different formula versions to compare')
    }
    return {
      data: {
        formula,
        before,
        after,
        diff: diffFormulaVersions(before, after),
        invariant: 'version comparison uses immutable snapshots, not the current draft',
      },
    }
  }

  addFormulaEvaluation(id: string, versionValue: string, body: FormulaEvaluationBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.edit')
    const formula = this.formulaForSession(id, session)
    const versionIndex = this.formulaVersionRecords.findIndex(
      (version) =>
        version.formulaId === id &&
        version.version === versionValue &&
        (version.organizationId || 'org-nxl') === session.organizationId,
    )
    if (versionIndex === -1) {
      throw new NotFoundException(`Formula version ${versionValue} was not found`)
    }
    const day = Number(body.day)
    if (day !== 1 && day !== 7 && day !== 30) {
      throw new UnprocessableEntityException('Evaluation day must be 1, 7, or 30')
    }
    const observation = body.observation?.trim()
    if (!observation) {
      throw new UnprocessableEntityException('Evaluation observation is required')
    }
    const stability = body.stability === 'FAIL' || body.stability === 'WATCH' ? body.stability : 'PASS'
    const rating = Math.min(5, Math.max(1, Math.round(Number(body.rating ?? 3))))
    const existing = this.normalizeFormulaVersionRecord(this.formulaVersionRecords[versionIndex]!, formula, session)
    const evaluation: FormulaEvaluationRecord = {
      id: `EVAL-${formula.code}-${versionValue}-${Date.now()}`,
      day,
      observation,
      stability,
      rating,
      evaluator: session.email,
      evaluatedAt: new Date().toISOString(),
    }
    const updated = { ...existing, evaluations: [...existing.evaluations, evaluation] }
    this.formulaVersionRecords = this.formulaVersionRecords.map((version, index) => index === versionIndex ? updated : version)
    const audit = this.recordAudit('formula.evaluation.create', `${formula.code}:${versionValue}`, session.userId, stability === 'FAIL' ? 'review' : 'allowed')
    return {
      data: {
        formula,
        version: updated,
        evaluation,
        audit,
        invariant: 'aging notebook observations are version-scoped evidence',
      },
    }
  }

  approveFormula(id: string, body: FormulaReviewBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.approve')
    this.requireFormulaApproverRole(session)
    const formula = this.formulaForSession(id, session)
    if (formula.workflowStatus !== 'IN_REVIEW') {
      throw new UnprocessableEntityException('Formula must be submitted for review before approval')
    }
    const evidence = this.formulaEvidence(formula, session)
    const composition = formulaComposition(formula)
    if (!composition.ready) {
      throw new UnprocessableEntityException('Formula composition must total 100% before approval')
    }
    if (evidence.ifra.blockerCount > 0) {
      throw new UnprocessableEntityException({
        message: 'Formula exceeds final-product IFRA limits',
        blockerCount: evidence.ifra.blockerCount,
        blockers: evidence.ifra.rows.filter((row) => row.status === 'BLOCKER'),
      })
    }
    const rawVersion = this.formulaVersionRecords.find(
      (item) =>
        item.formulaId === id &&
        item.version === formula.version &&
        (item.organizationId || 'org-nxl') === session.organizationId,
    )
    if (!rawVersion) {
      throw new UnprocessableEntityException('Formula must have an immutable version snapshot before approval')
    }

    const version = this.normalizeFormulaVersionRecord(rawVersion, formula, session)
    const approvedVersion: FormulaVersionRecord = {
      ...version,
      status: 'APPROVED',
      metadata: formulaSnapshotMetadata(formula),
      resolvedLeaves: structuredClone(evidence.leaves),
      ifraEvaluation: structuredClone(evidence.ifra),
      evaporation: structuredClone(evidence.evaporation),
    }
    const now = new Date().toISOString()
    const approvedFormula = this.touchFormula(formula, session, {
      status: 'stable',
      workflowStatus: 'APPROVED',
      lockedVersion: formula.version,
      approvalHistory: [
        ...formula.approvalHistory,
        {
          id: `APR-${formula.code}-${Date.now()}`,
          action: 'APPROVED',
          actor: session.email,
          reviewer: session.email,
          comment: body.comment?.trim() || 'Formula approved for controlled use',
          at: now,
        },
      ],
    })
    this.replaceFormula(approvedFormula)
    this.formulaVersionRecords = this.formulaVersionRecords.map((item) =>
      item.id === version.id && (item.organizationId || 'org-nxl') === session.organizationId ? approvedVersion : item,
    )
    const audit = this.recordAudit('formula.approve', approvedFormula.code, session.userId, 'allowed')
    return {
      data: {
        formula: approvedFormula,
        version: approvedVersion,
        ifra: evidence.ifra,
        audit,
        invariant: 'server-side composition, IFRA, permission, and snapshot gates passed without stock consumption',
      },
    }
  }

  exportFormula(id: string, _body: { actor?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'formulas.export')
    const formula = this.formulaForSession(id, session)
    if (formula.lines.length === 0) {
      throw new UnprocessableEntityException('Formula must have at least one line before export')
    }

    const actor = session.userId
    const document: DocumentRecord = {
      id: `DOC-FRM-${formula.code.replace(/[^A-Z0-9]/g, '')}-${formula.version.toUpperCase()}`,
      type: 'Formula Export',
      title: `${formula.code} ${formula.version} Export`,
      linkedTo: formula.id,
      version: formula.version,
      sensitivity: 'Highly Confidential',
      status: 'APPROVED',
      issueDate: new Date().toISOString().slice(0, 10),
      lastAccessed: new Date().toISOString(),
      downloads: 0,
      storageKey: `${session.organizationId}/formulas/${formula.id}/export-${formula.version}.pdf`,
      mimeType: 'application/pdf',
      sizeKb: Math.max(32, Math.round(JSON.stringify(formula.lines).length / 8)),
      checksum: this.formulaVersionChecksum(formula),
      owner: 'Compliance',
    }
    this.documentRecords = [
      document,
      ...this.documentRecords.filter((item) => item.id !== document.id),
    ]
    const audit = this.recordAudit('formula.export', formula.code, actor, 'allowed')
    return {
      data: {
        formula,
        document,
        audit,
        invariant: 'formula export is audited and creates no inventory movement',
      },
    }
  }

  lotsList() {
    const session = this.currentSession()
    return { data: this.lotsForSession(session) }
  }

  inventorySummary() {
    const session = this.currentSession()
    return { data: stockSummary(this.lotsForSession(session), this.materialCatalogForSession(session)) }
  }

  inventoryMovements() {
    const session = this.currentSession()
    return { data: this.movementsForLots(this.lotsForSession(session)) }
  }

  inventoryConsole() {
    const session = this.currentSession()
    const lots = this.lotsForSession(session)
    const movements = this.movementsForLots(lots)
    const lotIds = new Set(lots.map((lot) => lot.id))
    return {
      data: {
        lots,
        movements,
        locations: this.locationRecords,
        stockTakes: this.stockTakeRecords.filter((stockTake) => lotIds.has(stockTake.lotId)),
        summary: stockSummary(lots, this.materialCatalogForSession(session)),
        reorderSuggestions: this.inventoryReorderSuggestions().data.suggestions,
        invariant: 'inventory console reads tenant lots, locations, stock takes, and immutable movement evidence together',
      },
    }
  }

  storageLocationsList() {
    return { data: this.locationRecords }
  }

  createStorageLocation(body: {
    name?: string
    zone?: string
    condition?: string
    capacityGrams?: number
    parentId?: string
    kind?: StorageLocation['kind']
    light?: StorageLocation['light']
    temperatureRange?: string
  }) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'inventory.receive')
    const name = body.name?.trim()
    if (!name) {
      throw new UnprocessableEntityException('Storage location name is required')
    }
    if (this.locationRecords.some((location) => location.name.toLowerCase() === name.toLowerCase())) {
      throw new UnprocessableEntityException(`Storage location ${name} already exists`)
    }

    const capacityGrams = Number(body.capacityGrams ?? 0)
    if (!Number.isFinite(capacityGrams) || capacityGrams <= 0) {
      throw new UnprocessableEntityException('Storage location capacityGrams must be greater than 0')
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `loc-${Date.now()}`
    const location: StorageLocation = {
      id: `loc-${slug}`,
      name,
      zone: body.zone?.trim() || 'Warehouse',
      condition: body.condition?.trim() || 'Controlled ambient',
      capacityGrams,
      parentId: body.parentId?.trim() || undefined,
      kind: body.kind ?? 'Bin',
      light: body.light ?? 'Ambient',
      temperatureRange: body.temperatureRange?.trim() || '18-22C',
      status: 'ACTIVE',
    }

    this.locationRecords = [location, ...this.locationRecords]
    this.recordAudit('inventory.location.create', location.name, session.userId, 'allowed')
    return {
      data: {
        location,
        invariant: 'storage location creation changes master data only, not stock quantity',
      },
    }
  }

  inventoryReorderSuggestions() {
    const session = this.currentSession()
    const lots = this.lotsForSession(session)
    const reorderPoints = new Map<string, number>([
      ['mat-iso', 180],
      ['mat-hedione', 120],
      ['mat-bergamot', 60],
      ['mat-ambroxan', 45],
      ['mat-muscenone', 20],
      ['mat-roseoxide', 18],
      ['mat-vanillin', 100],
      ['mat-ethanol', 1500],
    ])
    const suggestions: InventoryReorderSuggestion[] = stockSummary(lots, this.materialCatalogForSession(session))
      .flatMap((item) => {
        const reorderPointGrams = reorderPoints.get(item.material.id) ?? 0
        if (reorderPointGrams <= 0 || item.available >= reorderPointGrams) {
          return []
        }
        return [
          {
            materialId: item.material.id,
            materialName: item.material.name,
            availableGrams: item.available,
            reorderPointGrams,
            suggestedOrderGrams: Math.max(25, Math.ceil((reorderPointGrams * 1.6 - item.available) / 5) * 5),
            reason: `${formatGrams(item.available)} available is below ${formatGrams(reorderPointGrams)} reorder point`,
          },
        ]
      })
      .sort((a, b) => a.availableGrams - b.availableGrams)

    return {
      data: {
        suggestions,
        invariant: 'shopping list is generated from available approved non-expired stock without reserving or moving inventory',
      },
    }
  }

  changeLotQuality(id: string, body: { qualityStatus?: LotQualityStatus; reason?: string }) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'inventory.receive')
    const lot = this.lotForSession(id, session)

    const qualityStatus = body.qualityStatus
    if (!this.isLotQualityStatus(qualityStatus)) {
      throw new UnprocessableEntityException('Lot qualityStatus must be APPROVED, QUARANTINE, ON_HOLD, REJECTED, or EXPIRED')
    }

    const updatedLot: InventoryLot = { ...lot, qualityStatus }
    const movementCount = this.movements.length
    this.lots = this.lots.map((item) => (item.id === lot.id ? updatedLot : item))
    const audit = this.recordAudit(
      'inventory.quality.update',
      `${lot.lotNumber}:${qualityStatus}`,
      session.userId,
      qualityStatus === 'APPROVED' ? 'allowed' : 'review',
    )

    return {
      data: {
        lot: updatedLot,
        audit,
        summary: stockSummary(this.lotsForSession(session), this.materialCatalogForSession(session)).find((item) => item.material.id === lot.materialId),
        movementCount,
        reason: body.reason?.trim() || 'QC status workflow',
        invariant: 'quality status changes lot eligibility but creates no inventory movement',
      },
    }
  }

  performStockTake(body: {
    lotId?: string
    countedGrams?: number
    reason?: string
    actor?: string
  }) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'inventory.adjust')
    const lot = this.lotForSession(body.lotId, session)

    const countedGrams = Number(body.countedGrams ?? Number.NaN)
    if (!Number.isFinite(countedGrams) || countedGrams < 0) {
      throw new UnprocessableEntityException('Stock take countedGrams must be 0 or greater')
    }
    if (countedGrams < lot.reservedGrams) {
      throw new UnprocessableEntityException({
        message: 'Stock take count cannot be lower than reserved stock',
        lotId: lot.id,
        reservedGrams: lot.reservedGrams,
        countedGrams,
      })
    }

    const expectedGrams = lot.quantityGrams
    const varianceGrams = Number((countedGrams - expectedGrams).toFixed(3))
    const timestamp = new Date().toISOString()
    const actor = session.userId
    let movement: InventoryMovement | undefined
    let updatedLot = lot

    if (Math.abs(varianceGrams) > 0.0001) {
      updatedLot = { ...lot, quantityGrams: countedGrams }
      movement = {
        id: `MOV-STK-${String(this.movements.length + 1029).padStart(4, '0')}`,
        at: timestamp,
        type: 'ADJUSTMENT',
        direction: varianceGrams > 0 ? 'IN' : 'OUT',
        materialId: lot.materialId,
        lotId: lot.id,
        quantityGrams: Math.abs(varianceGrams),
        balanceAfter: countedGrams,
        ref: body.reason?.trim() || 'Stock take variance',
        actor,
      }
      this.lots = this.lots.map((item) => (item.id === lot.id ? updatedLot : item))
      this.movements = [movement, ...this.movements]
    }

    const record: StockTakeRecord = {
      id: `STK-${new Date().getFullYear()}-${String(this.stockTakeRecords.length + 22).padStart(3, '0')}`,
      at: timestamp,
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      expectedGrams,
      countedGrams,
      varianceGrams,
      reason: body.reason?.trim() || 'Cycle count',
      actor,
      status: movement ? 'ADJUSTED' : 'MATCHED',
      movementId: movement?.id,
    }

    this.stockTakeRecords = [record, ...this.stockTakeRecords]
    this.recordAudit('inventory.stockTake', lot.lotNumber, actor, movement ? 'review' : 'allowed')
    return {
      data: {
        lot: updatedLot,
        movement,
        stockTake: record,
        summary: stockSummary(this.lotsForSession(session), this.materialCatalogForSession(session)).find((item) => item.material.id === lot.materialId),
        invariant: movement
          ? 'stock take variance updates stock through immutable ADJUSTMENT movement'
          : 'stock take match records evidence without changing stock quantity',
      },
    }
  }

  lotLabel(id: string) {
    const session = this.currentSession()
    const lot = this.lotForSession(id, session)
    const material = this.materialForSession(lot.materialId, session)

    const label: LotLabelPayload = {
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      materialName: material.name,
      storageText: `${lot.location} / ${lot.container ?? 'container not set'}`,
      qualityStatus: lot.qualityStatus,
      expiryDate: lot.expiryDate,
      qrValue: `OLFOPS|LOT|${lot.id}|${lot.lotNumber}|${lot.qualityStatus}|${lot.expiryDate}`,
    }

    return {
      data: {
        label,
        invariant: 'lot label generation is read-only and does not create stock movement',
      },
    }
  }

  lotGenealogy(id: string) {
    const session = this.currentSession()
    const lot = this.lotForSession(id, session)
    const material = this.materialForSession(lot.materialId, session)

    const receivedAt = new Date(`${lot.receivedDate}T00:00:00.000Z`).getTime()
    const agingDays = Math.max(0, Math.round((Date.now() - receivedAt) / 86_400_000))
    const movements = this.movements.filter((movement) => movement.lotId === lot.id)
    const documents = this.documentRecords.filter((document) => document.linkedTo === lot.id || document.linkedTo === lot.materialId)
    const downstreamRefs = movements
      .filter((movement) => movement.direction === 'OUT' || movement.direction === 'MOVE')
      .map((movement) => ({
        ref: movement.ref,
        type: movement.type,
        quantityGrams: movement.quantityGrams,
        at: movement.at,
      }))

    return {
      data: {
        lot,
        material,
        agingDays,
        movements,
        documents,
        downstreamRefs,
        eligibility: isLotEligibleForInventory(lot) ? 'ELIGIBLE' : 'BLOCKED',
        invariant: 'lot genealogy is reconstructed from movement ledger, documents, and lot metadata',
      },
    }
  }

  inventoryApprovalRequests() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'inventory.view')
    const canReview =
      this.roleHasPermission(session.role, 'inventory.adjust') ||
      this.roleHasPermission(session.role, 'inventory.receive') ||
      this.roleHasPermission(session.role, 'security.manageUsers')
    const requests = this.inventoryApprovalRequestRecords.filter(
      (request) =>
        request.organizationId === session.organizationId &&
        (canReview || request.requestedBy === session.userId),
    )
    return {
      data: {
        requests,
        invariant: canReview
          ? 'inventory approvers see tenant-scoped requests for review'
          : 'normal users only see their own tenant-scoped inventory requests',
      },
    }
  }

  requestInventoryApproval(body: { action?: string; payload?: unknown; reason?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'inventory.view')
    const normalized = this.normalizeInventoryApprovalRequest(body.action, body.payload)
    const timestamp = new Date().toISOString()
    const request: InventoryApprovalRequestRecord = {
      id: `INV-REQ-${this.shortId()}`,
      organizationId: session.organizationId,
      requestedBy: session.userId,
      requestedByEmail: session.email,
      action: normalized.action,
      requiredPermission: normalized.requiredPermission,
      payload: normalized.payload,
      reason: body.reason?.trim().slice(0, 160) || normalized.defaultReason,
      targetLabel: normalized.targetLabel,
      status: 'PENDING',
      createdAt: timestamp,
    }
    this.inventoryApprovalRequestRecords = [request, ...this.inventoryApprovalRequestRecords]
    const audit = this.recordAudit('inventory.approval.request', request.id, session.userId, 'review')
    return {
      data: {
        request,
        audit,
        invariant: 'normal users can request inventory changes, but stock is unchanged until an authorized approver approves',
      },
    }
  }

  approveInventoryApprovalRequest(id: string, body: { note?: string } = {}) {
    const session = this.currentSession()
    const request = this.inventoryApprovalRequestForTenant(id, session.organizationId)
    this.requirePermission(session.role, request.requiredPermission)
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException('Inventory approval request has already been reviewed')
    }

    const result =
      request.action === 'inventory.receive'
        ? this.receiveInventoryReceipt(request.payload as InventoryReceiptBody).data
        : request.action === 'inventory.transfer'
          ? this.transferInventory(request.payload as InventoryTransferBody).data
          : request.action === 'inventory.stockTake'
            ? this.performStockTake(request.payload as InventoryStockTakeBody).data
            : request.action === 'inventory.quality'
              ? this.changeLotQuality(
                  (request.payload as InventoryQualityBody).lotId ?? '',
                  request.payload as InventoryQualityBody,
                ).data
              : this.adjustInventory(request.payload as InventoryAdjustmentBody).data
    const resultRecord = result as { movement?: InventoryMovement; lot: InventoryLot }
    const resultRef = resultRecord.movement?.id ?? resultRecord.lot.id
    const updated: InventoryApprovalRequestRecord = {
      ...request,
      status: 'APPROVED',
      reviewedBy: session.userId,
      reviewedAt: new Date().toISOString(),
      reviewNote: body.note?.trim().slice(0, 200) || undefined,
      resultRef,
    }
    this.upsertInventoryApprovalRequest(updated)
    const audit = this.recordAudit('inventory.approval.approve', request.id, session.userId, 'allowed')
    return {
      data: {
        request: updated,
        result,
        audit,
        invariant: 'approved inventory requests execute through the same immutable movement path as direct inventory updates',
      },
    }
  }

  rejectInventoryApprovalRequest(id: string, body: { note?: string } = {}) {
    const session = this.currentSession()
    const request = this.inventoryApprovalRequestForTenant(id, session.organizationId)
    this.requirePermission(session.role, request.requiredPermission)
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException('Inventory approval request has already been reviewed')
    }

    const updated: InventoryApprovalRequestRecord = {
      ...request,
      status: 'REJECTED',
      reviewedBy: session.userId,
      reviewedAt: new Date().toISOString(),
      reviewNote: body.note?.trim().slice(0, 200) || 'Rejected by approver',
    }
    this.upsertInventoryApprovalRequest(updated)
    const audit = this.recordAudit('inventory.approval.reject', request.id, session.userId, 'blocked')
    return {
      data: {
        request: updated,
        audit,
        invariant: 'rejected inventory requests leave stock and movement ledger unchanged',
      },
    }
  }

  operationApprovalRequests() {
    const session = this.currentSession()
    const requests = this.operationApprovalRequestRecords.filter((request) => {
      if (request.organizationId !== session.organizationId) {
        return false
      }
      return (
        request.requestedBy === session.userId ||
        this.roleHasPermission(session.role, request.requiredPermission) ||
        this.roleHasPermission(session.role, 'security.manageUsers')
      )
    })
    return {
      data: {
        requests,
        invariant: 'operation approval queue is tenant-scoped and filtered to requester or eligible approver',
      },
    }
  }

  requestOperationApproval(body: { method?: string; path?: string; payload?: unknown; reason?: string } = {}) {
    const session = this.currentSession()
    const normalized = this.normalizeOperationApprovalRequest(body.method, body.path, body.payload)
    if (normalized.viewPermission && !this.roleHasPermission(session.role, normalized.viewPermission)) {
      throw new ForbiddenException(`Role ${session.role} cannot request ${normalized.action}`)
    }

    const timestamp = new Date().toISOString()
    const request: OperationApprovalRequestRecord = {
      id: `OP-REQ-${this.shortId()}`,
      organizationId: session.organizationId,
      requestedBy: session.userId,
      requestedByEmail: session.email,
      action: normalized.action,
      method: normalized.method,
      path: normalized.path,
      requiredPermission: normalized.requiredPermission,
      viewPermission: normalized.viewPermission,
      payload: normalized.payload,
      params: normalized.params,
      reason: body.reason?.trim().slice(0, 180) || normalized.defaultReason,
      targetLabel: normalized.targetLabel,
      status: 'PENDING',
      createdAt: timestamp,
    }
    this.operationApprovalRequestRecords = [request, ...this.operationApprovalRequestRecords]
    const audit = this.recordAudit('operation.approval.request', request.id, session.userId, 'review')
    return {
      data: {
        request,
        audit,
        invariant: 'non-inventory writes can be requested by normal users but execute only after authorized approval',
      },
    }
  }

  approveOperationApprovalRequest(id: string, body: { note?: string } = {}) {
    const session = this.currentSession()
    const request = this.operationApprovalRequestForTenant(id, session.organizationId)
    this.requirePermission(session.role, request.requiredPermission)
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException('Operation approval request has already been reviewed')
    }

    const result = this.executeOperationApprovalRequest(request)
    const updated: OperationApprovalRequestRecord = {
      ...request,
      status: 'APPROVED',
      reviewedBy: session.userId,
      reviewedAt: new Date().toISOString(),
      reviewNote: body.note?.trim().slice(0, 200) || undefined,
      resultRef: this.operationResultRef(result) ?? request.targetLabel,
    }
    this.upsertOperationApprovalRequest(updated)
    const audit = this.recordAudit('operation.approval.approve', request.id, session.userId, 'allowed')
    return {
      data: {
        request: updated,
        result,
        audit,
        invariant: 'approved operation requests execute through the same guarded service path as direct writes',
      },
    }
  }

  rejectOperationApprovalRequest(id: string, body: { note?: string } = {}) {
    const session = this.currentSession()
    const request = this.operationApprovalRequestForTenant(id, session.organizationId)
    this.requirePermission(session.role, request.requiredPermission)
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException('Operation approval request has already been reviewed')
    }

    const updated: OperationApprovalRequestRecord = {
      ...request,
      status: 'REJECTED',
      reviewedBy: session.userId,
      reviewedAt: new Date().toISOString(),
      reviewNote: body.note?.trim().slice(0, 200) || 'Rejected by approver',
    }
    this.upsertOperationApprovalRequest(updated)
    const audit = this.recordAudit('operation.approval.reject', request.id, session.userId, 'blocked')
    return {
      data: {
        request: updated,
        audit,
        invariant: 'rejected operation requests leave tenant records unchanged',
      },
    }
  }

  adjustInventory(body: InventoryAdjustmentBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'inventory.adjust')
    const lot = this.lotForSession(body.lotId, session)

    const quantityGrams = Number(body.quantityGrams ?? 0)
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new UnprocessableEntityException('Adjustment quantityGrams must be greater than 0')
    }

    const direction = body.direction ?? 'OUT'
    if (direction !== 'IN' && direction !== 'OUT') {
      throw new UnprocessableEntityException('Adjustment direction must be IN or OUT')
    }

    const nextQuantity =
      direction === 'IN' ? lot.quantityGrams + quantityGrams : lot.quantityGrams - quantityGrams
    if (nextQuantity < lot.reservedGrams) {
      throw new UnprocessableEntityException({
        message: 'Adjustment would create negative available stock',
        lotId: lot.id,
        reservedGrams: lot.reservedGrams,
        requestedQuantityGrams: quantityGrams,
      })
    }

    const timestamp = new Date().toISOString()
    const updatedLot = { ...lot, quantityGrams: nextQuantity }
    const movement: InventoryMovement = {
      id: `MOV-ADJ-${String(this.movements.length + 1029).padStart(4, '0')}`,
      at: timestamp,
      type: 'ADJUSTMENT',
      direction,
      materialId: lot.materialId,
      lotId: lot.id,
      quantityGrams,
      balanceAfter: nextQuantity,
      ref: body.reason?.trim() || 'Cycle count adjustment',
      actor: session.userId,
    }

    this.lots = this.lots.map((item) => (item.id === lot.id ? updatedLot : item))
    this.movements = [movement, ...this.movements]
    this.recordAudit('inventory.adjust', lot.lotNumber, session.userId, 'allowed')

    return {
      data: {
        lot: updatedLot,
        movement,
        summary: stockSummary(this.lotsForSession(session), this.materialCatalogForSession(session)).find((item) => item.material.id === lot.materialId),
        invariant: 'inventory adjustment changes stock only through immutable movement',
      },
    }
  }

  transferInventory(body: InventoryTransferBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'inventory.adjust')
    const lot = this.lotForSession(body.lotId, session)

    const toLocation = body.toLocation?.trim()
    if (!toLocation) {
      throw new UnprocessableEntityException('Transfer toLocation is required')
    }
    if (toLocation === lot.location) {
      throw new UnprocessableEntityException('Transfer target location must be different from current location')
    }

    const timestamp = new Date().toISOString()
    const updatedLot = { ...lot, location: toLocation }
    const movement: InventoryMovement = {
      id: `MOV-XFER-${String(this.movements.length + 1029).padStart(4, '0')}`,
      at: timestamp,
      type: 'TRANSFER',
      direction: 'MOVE',
      materialId: lot.materialId,
      lotId: lot.id,
      quantityGrams: lot.quantityGrams,
      balanceAfter: lot.quantityGrams,
      ref: `${lot.location} -> ${toLocation}`,
      actor: session.userId,
    }

    this.lots = this.lots.map((item) => (item.id === lot.id ? updatedLot : item))
    this.movements = [movement, ...this.movements]
    this.recordAudit('inventory.transfer', lot.lotNumber, session.userId, 'allowed')

    return {
      data: {
        lot: updatedLot,
        movement,
        summary: stockSummary(this.lotsForSession(session), this.materialCatalogForSession(session)).find((item) => item.material.id === lot.materialId),
        invariant: 'inventory transfer records movement evidence without changing stock quantity',
      },
    }
  }

  receiveInventoryReceipt(body: InventoryReceiptBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'inventory.receive')
    const materialId = body.materialId?.trim() || this.materialCatalogForSession(session)[0]?.id
    if (!materialId) {
      throw new NotFoundException('No material is available in this workspace')
    }
    const material = this.materialForSession(materialId, session)

    const quantityGrams = Number(body.quantityGrams ?? 0)
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new UnprocessableEntityException('Inventory receipt quantityGrams must be greater than 0')
    }
    const qualityStatus = this.isLotQualityStatus(body.qualityStatus) ? body.qualityStatus : 'APPROVED'

    const timestamp = new Date().toISOString()
    const lot: InventoryLot = {
      id: `lot-api-${Date.now()}`,
      organizationId: session.organizationId,
      materialId: material.id,
      lotNumber: body.lotNumber?.trim() || `L-${material.cas.replaceAll('-', '')}`,
      quantityGrams,
      reservedGrams: 0,
      receivedDate: timestamp.slice(0, 10),
      expiryDate: body.expiryDate ?? '2028-12-31',
      qualityStatus,
      location: body.location?.trim() || 'Receiving Bay',
      unitCost: material.costPerGram,
      supplierLotRef: body.supplierLotRef?.trim() || undefined,
      currency: body.currency?.trim() || 'USD',
      retestDate: body.retestDate?.trim() || undefined,
      openedDate: body.openedDate?.trim() || undefined,
      shelfLifeAfterOpeningDays: Number.isFinite(Number(body.shelfLifeAfterOpeningDays))
        ? Number(body.shelfLifeAfterOpeningDays)
        : undefined,
      container: body.container?.trim() || 'Receiving container',
      packaging: body.packaging?.trim() || undefined,
    }
    const movement: InventoryMovement = {
      id: `MOV-REC-${String(this.movements.length + 1029).padStart(4, '0')}`,
      at: timestamp,
      type: 'RECEIPT',
      direction: 'IN',
      materialId: material.id,
      lotId: lot.id,
      quantityGrams,
      balanceAfter: lot.quantityGrams,
      ref: `GR-API-${String(this.lots.length + 42).padStart(3, '0')}`,
      actor: session.userId,
    }

    this.lots = [lot, ...this.lots]
    this.movements = [movement, ...this.movements]
    const receiptDocuments = (body.documents ?? [])
      .filter((item) => item && (item.type === 'SDS' || item.type === 'CoA') && item.fileName?.trim())
      .slice(0, 2)
      .map((item, index): DocumentRecord => {
        const type = item.type as 'SDS' | 'CoA'
        const fileName = item.fileName!.trim().slice(0, 160)
        const sizeKb = Math.max(1, Math.min(51_200, Math.round(Number(item.fileSizeKb) || 1)))
        const linkedTo = type === 'SDS' ? material.id : lot.id
        const id = `DOC-RCV-${String(this.documentRecords.length + index + 1).padStart(5, '0')}`
        const safeName = fileName.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '') || `${type}.pdf`
        return {
          id,
          type,
          title: `${material.name} ${type} / ${lot.lotNumber}`,
          linkedTo,
          version: 'v1',
          sensitivity: 'Internal',
          status: 'REVIEW_REQUIRED',
          issueDate: timestamp.slice(0, 10),
          lastAccessed: timestamp,
          downloads: 0,
          storageKey: `${session.organizationId}/inventory/${lot.id}/${type.toLowerCase()}-${safeName}`,
          mimeType: item.mimeType?.trim().slice(0, 100) || 'application/octet-stream',
          sizeKb,
          checksum: this.documentChecksum(`${lot.id}:${type}:${fileName}:${sizeKb}`),
          owner: session.userId,
        }
      })
    if (receiptDocuments.length > 0) {
      this.documentRecords = [...receiptDocuments, ...this.documentRecords]
      receiptDocuments.forEach((document) => this.recordAudit('inventory.document.attach', document.id, session.userId, 'review'))
    }
    this.recordAudit('inventory.receive', lot.lotNumber, session.userId, 'allowed')

    return {
      data: {
        lot,
        movement,
        documents: receiptDocuments,
        summary: stockSummary(this.lotsForSession(session), this.materialCatalogForSession(session)).find((item) => item.material.id === material.id),
        invariant: 'inventory receipt creates a lot, immutable IN movement, and reviewable SDS/CoA evidence when attached',
      },
    }
  }

  login(email = seededAdminEmail, password?: string) {
    const normalizedEmail = email.trim().toLowerCase()
    const membership = this.membershipRecords.find((item) => item.email.toLowerCase() === normalizedEmail)
    if (!membership || membership.status !== 'ACTIVE') {
      this.recordAudit('auth.login', normalizedEmail, 'api:auth', 'blocked')
      throw new ForbiddenException('Tenant membership must be active before login')
    }
    const credential = this.authCredentialRecords.find((item) => item.email === normalizedEmail)
    const passwordVerification = credential
      ? this.verifyPasswordCredential(credential, normalizedEmail, password ?? '')
      : { valid: false, needsRehash: false }
    if (!credential || !passwordVerification.valid) {
      this.recordAudit('auth.login', normalizedEmail, 'api:auth', 'blocked')
      throw new ForbiddenException('Email or password is invalid')
    }
    if (passwordVerification.needsRehash) {
      this.upgradePasswordCredential(credential, normalizedEmail, password ?? '')
    }
    const brandId = membership.brandIds[0]
    if (!brandId) {
      throw new UnprocessableEntityException('Membership must include at least one brand scope')
    }

    const issuedAt = new Date()
    const idleExpiresAt = new Date(issuedAt.getTime() + tenantSecurityPolicy.idleTimeoutMinutes * 60_000)
    const expiresAt = new Date(issuedAt.getTime() + tenantSecurityPolicy.absoluteSessionMinutes * 60_000)
    const deviceId = normalizedEmail === seededAdminEmail ? 'dev-admin-codex' : `dev-${membership.userId}`
    const knownDevice = this.sessions.some(
      (item) => item.email.toLowerCase() === normalizedEmail && item.deviceId === deviceId,
    )
    const session: AuthSession = {
      id: `SES-${String(this.sessions.length + 1).padStart(4, '0')}`,
      userId: membership.userId,
      email: membership.email,
      organizationId: membership.organizationId,
      brandId,
      role: membership.role,
      issuedAt: issuedAt.toISOString(),
      lastSeenAt: issuedAt.toISOString(),
      idleExpiresAt: idleExpiresAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'ACTIVE',
      mfaVerified: false,
      ipAddress: '203.0.113.24',
      userAgent: 'API Client',
      deviceId,
      location: 'Bangkok, TH',
      csrfToken: this.createCsrfToken(),
    }
    this.sessions = [session, ...this.sessions]
    this.activeSessionId = session.id
    const revokedForLimit = this.enforceConcurrentSessionLimit(session.email, session.id)
    this.membershipRecords = this.membershipRecords.map((item) =>
      item.id === membership.id ? { ...item, lastActiveAt: issuedAt.toISOString() } : item,
    )
    this.recordAudit('auth.login', session.userId, 'api:auth', 'allowed')
    const newDeviceAudit =
      tenantSecurityPolicy.newDeviceAlertEnabled && !knownDevice
        ? this.recordAudit('auth.newDevice', session.deviceId, session.userId, 'review')
        : null
    if (newDeviceAudit) {
      this.queueNotification(
        session.organizationId,
        session.email,
        'security',
        'New sign-in detected',
        `A new ${session.userAgent} session was created from ${session.location}.`,
        '/security',
      )
    }
    return {
      data: {
        session: this.exposeSession(session),
        csrfToken: this.requireSessionCsrfToken(session),
        permissions: this.permissionsForRole(session.role),
        revokedForLimit: this.exposeSessions(revokedForLimit),
        newDeviceAlert: Boolean(newDeviceAudit),
        securityPolicy: this.publicSecurityPolicyForSession(session),
        invariant: 'login creates bounded idle and absolute session windows',
      },
    }
  }

  authenticateSession(sessionId: string | undefined) {
    this.refreshSessionStates()
    const normalizedSessionId = sessionId?.trim()
    if (!normalizedSessionId) {
      throw new UnauthorizedException('Authentication required')
    }

    const session = this.sessions.find((item) => item.id === normalizedSessionId && item.status === 'ACTIVE')
    if (!session) {
      this.recordAudit('auth.session', normalizedSessionId, 'api:auth', 'blocked')
      throw new UnauthorizedException('Invalid or expired session')
    }

    this.activeSessionId = session.id
    this.ensureSessionCsrfToken(session.id)
    return this.currentSession()
  }

  signup(body: SignupBody = {}) {
    const email = body.email?.trim().toLowerCase()
    const organizationName = body.organizationName?.trim() || 'New Fragrance Lab'
    const workspaceSlug = this.slugify(body.workspaceSlug || organizationName)
    const name = body.name?.trim() || 'Workspace Owner'
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new UnprocessableEntityException('A valid signup email is required')
    }
    this.assertSignupPassword(password)
    if (this.membershipRecords.some((membership) => membership.email.toLowerCase() === email)) {
      throw new UnprocessableEntityException('A member with this email already exists')
    }
    if (this.organizationRecords.some((organization) => organization.slug === workspaceSlug)) {
      throw new UnprocessableEntityException('Workspace slug is already taken')
    }
    const customDomain = this.normalizeSignupDomain(body.customDomain, this.defaultTenantDomain(workspaceSlug))
    const normalizedDomain = customDomain.toLowerCase()
    const domainAlreadyTaken =
      this.organizationRecords.some((organization) => organization.customDomain?.toLowerCase() === normalizedDomain) ||
      this.ssoConfigRecords.some((config) => config.domain.toLowerCase() === normalizedDomain)
    if (domainAlreadyTaken) {
      throw new UnprocessableEntityException('Workspace domain is already taken')
    }

    const createdAt = new Date().toISOString()
    const organizationId = `org-${workspaceSlug}`
    const brandId = `brand-${workspaceSlug}`
    const userId = `usr-${workspaceSlug}-owner`
    const organization: OrganizationRecord = {
      id: organizationId,
      name: organizationName,
      slug: workspaceSlug,
      customDomain,
      plan: 'Free',
      status: 'ACTIVE',
      primaryContact: email,
      createdAt,
    }
    const brand: BrandRecord = {
      id: brandId,
      organizationId,
      name: organizationName,
      status: 'ACTIVE',
      defaultCurrency: this.settingsRecord.currency,
    }
    const membership: MembershipRecord = {
      id: `MBR-${workspaceSlug.toUpperCase()}`,
      userId,
      email,
      name,
      organizationId,
      brandIds: [brandId],
      role: 'Owner',
      status: 'ACTIVE',
      mfaEnabled: false,
      lastActiveAt: createdAt,
      invitedAt: createdAt,
    }

    this.organizationRecords = [organization, ...this.organizationRecords]
    this.brandRecords = [brand, ...this.brandRecords]
    this.membershipRecords = [membership, ...this.membershipRecords]
    this.authCredentialRecords = [
      { email, passwordHash: this.passwordHashForEmail(email, password), passwordSetAt: createdAt },
      ...this.authCredentialRecords.filter((credential) => credential.email !== email),
    ]
    this.upsertUserSettings(this.defaultUserSettingsForMembership(membership, createdAt))
    const subscription = this.createSubscriptionRecord(organization.id, 'PLAN-APPRENTICE', createdAt)
    this.upsertSubscription(subscription)
    const sso = this.ssoConfigForOrganization(organization.id)
    const loginResult = this.login(email, password).data
    const session = loginResult.session
    const audit = this.recordAudit('auth.signup', organization.id, session.userId, 'allowed')

    return {
      data: {
        organization,
        brand,
        membership,
        subscription,
        sso: this.publicSsoConfig(sso),
        session,
        csrfToken: loginResult.csrfToken,
        permissions: loginResult.permissions,
        audit,
        invariant: 'signup provisions a password-protected tenant, generated domain, and owner session before app access',
      },
    }
  }

  mfaStatus() {
    const session = this.currentSession()
    const enrollment = this.mfaEnrollmentForSession(session)
    return {
      data: {
        enrolled: Boolean(enrollment),
        enabled: Boolean(enrollment?.verifiedAt),
        sessionVerified: session.mfaVerified,
        verifiedAt: enrollment?.verifiedAt,
        remainingRecoveryCodes: enrollment?.recoveryCodeHashes.length ?? 0,
        invariant: 'MFA status exposes no secret, recovery code, or encrypted credential material',
      },
    }
  }

  beginMfaEnrollment(body: { password?: string } = {}) {
    const session = this.currentSession()
    const existing = this.mfaEnrollmentForSession(session)
    if (existing?.verifiedAt) {
      throw new UnprocessableEntityException('MFA is already enrolled; verify this session with your authenticator code')
    }

    const credential = this.authCredentialRecords.find(
      (item) => item.email === session.email.trim().toLowerCase(),
    )
    const password = typeof body.password === 'string' ? body.password : ''
    const verification = credential
      ? this.verifyPasswordCredential(credential, session.email, password)
      : { valid: false, needsRehash: false }
    if (!credential || !verification.valid) {
      this.recordAudit('auth.mfa.enroll', session.userId, session.userId, 'blocked')
      throw new ForbiddenException('Current password is invalid')
    }
    if (verification.needsRehash) {
      this.upgradePasswordCredential(credential, session.email, password)
    }

    this.requireMfaEncryptionKey()
    const secret = this.base32Encode(randomBytes(mfaTotpSecretBytes))
    const recoveryCodes = Array.from({ length: mfaRecoveryCodeCount }, () => this.createMfaRecoveryCode())
    const now = new Date().toISOString()
    const enrollment: MfaEnrollmentRecord = {
      userId: session.userId,
      organizationId: session.organizationId,
      encryptedSecret: this.encryptMfaSecret(secret, session),
      recoveryCodeHashes: recoveryCodes.map((code) => this.hashMfaRecoveryCode(code, session)),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.upsertMfaEnrollment(enrollment)
    this.securityStateDirty = true
    const audit = this.recordAudit('auth.mfa.enroll', session.userId, session.userId, 'allowed')
    const accountName = session.email.trim().toLowerCase()
    const issuer = 'OlfactoryOps'
    const label = encodeURIComponent(`${issuer}:${accountName}`)
    const otpauthUri =
      `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}` +
      `&algorithm=SHA1&digits=${mfaTotpDigits}&period=${mfaTotpPeriodSeconds}`

    return {
      data: {
        issuer,
        accountName,
        secret,
        manualEntryKey: secret.match(/.{1,4}/g)?.join(' ') ?? secret,
        otpauthUri,
        recoveryCodes,
        audit,
        invariant: 'the TOTP secret and recovery codes are revealed once; only encrypted/hash forms are persisted',
      },
    }
  }

  verifyMfa(body: { code?: string } = {}) {
    const session = this.currentSession()
    const enrollment = this.mfaEnrollmentForSession(session)
    if (!enrollment) {
      throw new UnprocessableEntityException('Start MFA setup before verifying an authenticator code')
    }
    const rawCode = typeof body.code === 'string' ? body.code.trim() : ''
    const totpCode = rawCode.replace(/[\s-]/g, '')
    const recoveryCode = rawCode.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const isTotpCode = /^\d{6}$/.test(totpCode)
    const isRecoveryCode = new RegExp(`^[A-F0-9]{${mfaRecoveryCodeBytes * 2}}$`).test(recoveryCode)
    if (!isTotpCode && !isRecoveryCode) {
      throw new UnprocessableEntityException('Enter a 6-digit authenticator code or a recovery code')
    }

    let method: 'totp' | 'recovery' = 'totp'
    let recoveryCodeIndex = -1
    if (isTotpCode) {
      const secret = this.decryptMfaSecret(enrollment, session)
      if (!this.verifyTotpCode(secret, totpCode, Date.now())) {
        this.recordAudit('auth.mfa.verify', session.userId, session.userId, 'blocked')
        throw new ForbiddenException('MFA code is invalid or expired')
      }
    } else {
      if (!enrollment.verifiedAt) {
        throw new UnprocessableEntityException('Complete MFA setup with an authenticator code before using a recovery code')
      }
      method = 'recovery'
      const candidateHash = this.hashMfaRecoveryCode(recoveryCode, session)
      enrollment.recoveryCodeHashes.forEach((storedHash, index) => {
        if (this.constantTimeStringEquals(storedHash, candidateHash) && recoveryCodeIndex === -1) {
          recoveryCodeIndex = index
        }
      })
      if (recoveryCodeIndex === -1) {
        this.recordAudit('auth.mfa.verify', session.userId, session.userId, 'blocked')
        throw new ForbiddenException('MFA code is invalid or expired')
      }
    }

    const remainingRecoveryCodeHashes =
      recoveryCodeIndex === -1
        ? enrollment.recoveryCodeHashes
        : enrollment.recoveryCodeHashes.filter((_, index) => index !== recoveryCodeIndex)
    const verifiedAt = new Date().toISOString()
    this.upsertMfaEnrollment({
      ...enrollment,
      recoveryCodeHashes: remainingRecoveryCodeHashes,
      verifiedAt: enrollment.verifiedAt ?? verifiedAt,
      updatedAt: verifiedAt,
    })
    this.membershipRecords = this.membershipRecords.map((membership) =>
      membership.userId === session.userId && membership.organizationId === session.organizationId
        ? { ...membership, mfaEnabled: true }
        : membership,
    )
    this.sessions = this.sessions.map((item) =>
      item.id === session.id ? { ...item, mfaVerified: true, lastSeenAt: verifiedAt } : item,
    )
    this.securityStateDirty = true
    const verifiedSession = this.currentSession()
    const audit = this.recordAudit('auth.mfa.verify', session.userId, session.userId, 'allowed')
    return {
      data: {
        session: this.exposeSession(verifiedSession),
        csrfToken: this.requireSessionCsrfToken(verifiedSession),
        permissions: this.permissionsForRole(verifiedSession.role),
        enabled: true,
        sessionVerified: true,
        verifiedAt,
        method,
        remainingRecoveryCodes: remainingRecoveryCodeHashes.length,
        audit,
        invariant:
          method === 'recovery'
            ? 'a recovery code verifies only the current bounded session and is consumed exactly once'
            : 'a valid TOTP code step-up verifies only the current bounded session',
      },
    }
  }

  me() {
    const session = this.currentSession()
    const csrfToken = this.requireSessionCsrfToken(session)
    return {
      data: {
        session: this.exposeSession(session),
        csrfToken,
        permissions: this.permissionsForRole(session.role),
        securityPolicy: this.publicSecurityPolicyForSession(session),
        userSettings: this.settingsForSession(session),
      },
    }
  }

  userSettings() {
    return { data: this.settingsForSession(this.currentSession()) }
  }

  updateUserSettings(patch: Record<string, unknown> = {}) {
    const session = this.currentSession()
    const current = this.settingsForSession(session)
    const displayName =
      typeof patch.displayName === 'string' && patch.displayName.trim()
        ? patch.displayName.trim().slice(0, 80)
        : current.displayName
    const preferredLanding = this.normalizePreferredLanding(patch.preferredLanding, current.preferredLanding)
    const uiDensity = patch.uiDensity === 'compact' ? 'compact' : patch.uiDensity === 'comfortable' ? 'comfortable' : current.uiDensity
    const sidebarMode = patch.sidebarMode === 'rail' ? 'rail' : patch.sidebarMode === 'expanded' ? 'expanded' : current.sidebarMode
    const emailDigest =
      patch.emailDigest === 'off' || patch.emailDigest === 'daily' || patch.emailDigest === 'weekly'
        ? patch.emailDigest
        : current.emailDigest
    const accentColor = this.normalizeAccentColor(patch.accentColor, current.accentColor)
    const updated: UserSettingsRecord = {
      ...current,
      displayName,
      preferredLanding,
      uiDensity,
      sidebarMode,
      reduceMotion: typeof patch.reduceMotion === 'boolean' ? patch.reduceMotion : current.reduceMotion,
      emailDigest,
      accentColor,
      formulaWorkspace: normalizeFormulaWorkspacePreferences(patch.formulaWorkspace, current.formulaWorkspace),
      updatedAt: new Date().toISOString(),
    }
    this.upsertUserSettings(updated)
    this.membershipRecords = this.membershipRecords.map((membership) =>
      membership.userId === session.userId && membership.organizationId === session.organizationId
        ? { ...membership, name: displayName }
        : membership,
    )
    const audit = this.recordAudit('user.settings.update', session.userId, session.userId, 'allowed')
    return {
      data: {
        settings: updated,
        audit,
        invariant: 'user settings are scoped to the authenticated user and cannot update tenant-wide config',
      },
    }
  }

  assertValidCsrfToken(token: string | null | undefined) {
    const session = this.currentSession()
    const expected = this.requireSessionCsrfToken(session)
    if (!token || token !== expected) {
      this.recordAudit('auth.csrf', session.userId, 'api:auth', 'blocked')
      throw new ForbiddenException('CSRF token is required for cookie-authenticated writes')
    }
    return { data: { invariant: 'cookie-authenticated writes require a session-bound CSRF token' } }
  }

  hasSecurityStateChanges() {
    return this.securityStateDirty
  }

  auditLogs() {
    const session = this.currentSession()
    if (!this.roleHasPermission(session.role, 'audit.view') && !this.roleHasPermission(session.role, 'security.viewAuditLog')) {
      throw new ForbiddenException(`Role ${session.role} cannot perform audit.view`)
    }
    return { data: this.auditEventsForSession(session) }
  }

  securityPolicy() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.policy.manage')
    return { data: this.fullSecurityPolicyForSession(session) }
  }

  tenantConsole() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const organization = this.organizationRecords.find((item) => item.id === session.organizationId)
    if (!organization) {
      throw new NotFoundException(`Organization ${session.organizationId} was not found`)
    }

    return {
      data: {
        organization,
        brands: this.brandRecords.filter((item) => item.organizationId === session.organizationId),
        memberships: this.membershipRecords.filter((item) => item.organizationId === session.organizationId),
        sessions: this.exposeSessions(this.sessions.filter((item) => item.organizationId === session.organizationId)),
        rolePolicies: this.organizationRolePolicies(),
        permissionCatalog: this.organizationPermissionCatalog(),
        permissionMatrix: this.buildPermissionMatrix(this.organizationRolePolicies()),
        securityPolicy: this.fullSecurityPolicyForSession(session),
        audit: this.auditEvents
          .filter((event) =>
            ['auth.login', 'auth.logout', 'auth.newDevice', 'membership.invite', 'membership.status.update', 'session.revoke', 'session.revokeAll', 'session.touch', 'session.expire', 'security.tenantProbe', 'security.permissionProbe', 'role.permissions.update'].includes(
              event.action,
            ),
          )
          .slice(0, 8),
        invariant: 'tenant console reads only the organization bound to the active session',
      },
    }
  }

  beginPasswordReset(email?: string) {
    const normalizedEmail = email?.trim().toLowerCase() ?? ''
    const credential = this.authCredentialRecords.find((item) => item.email === normalizedEmail)
    if (!credential || !normalizedEmail) {
      return { data: { accepted: true } }
    }

    const now = new Date()
    const token = randomBytes(32).toString('base64url')
    const reset: PasswordResetRecord = {
      id: `RESET-${this.shortId()}`,
      email: normalizedEmail,
      tokenHash: this.hashSecret(`password-reset:${token}`),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    }
    this.passwordResetRecords = [
      reset,
      ...this.passwordResetRecords.filter((item) => item.email !== normalizedEmail || Boolean(item.usedAt)),
    ].slice(0, 500)
    const membership = this.membershipRecords.find((item) => item.email === normalizedEmail && item.status === 'ACTIVE')
    const notification = membership
      ? this.queueNotification(
        membership.organizationId,
        normalizedEmail,
        'security',
        'Password reset requested',
        'A password reset link was requested for this account. If this was not you, no further action is needed.',
        '/login',
        false,
      )
      : undefined
    const audit = this.recordAudit('auth.passwordReset.request', normalizedEmail, 'api:auth', 'allowed')
    return {
      data: { accepted: true, audit },
      delivery: { recipientEmail: normalizedEmail, token, notificationId: notification?.id },
    }
  }

  completePasswordReset(body: { token?: string; password?: string } = {}) {
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    this.assertSignupPassword(password)
    const tokenHash = this.hashSecret(`password-reset:${token}`)
    const reset = this.passwordResetRecords.find((item) =>
      item.tokenHash === tokenHash && !item.usedAt && item.expiresAt > new Date().toISOString(),
    )
    if (!token || !reset) {
      throw new ForbiddenException('Password reset link is invalid or expired')
    }
    const updatedAt = new Date().toISOString()
    const credential = this.authCredentialRecords.find((item) => item.email === reset.email)
    if (!credential) {
      throw new ForbiddenException('Password reset link is invalid or expired')
    }
    this.authCredentialRecords = this.authCredentialRecords.map((item) =>
      item.email === reset.email
        ? { ...item, passwordHash: this.passwordHashForEmail(reset.email, password), passwordSetAt: updatedAt }
        : item,
    )
    this.passwordResetRecords = this.passwordResetRecords.map((item) =>
      item.id === reset.id ? { ...item, usedAt: updatedAt } : item,
    )
    this.sessions = this.sessions.map((session) =>
      session.email === reset.email && session.status === 'ACTIVE'
        ? { ...session, status: 'REVOKED', revokedAt: updatedAt, revokedReason: 'password reset' }
        : session,
    )
    const audit = this.recordAudit('auth.passwordReset.complete', reset.email, 'api:auth', 'allowed')
    return {
      data: {
        accepted: true,
        audit,
        invariant: 'password reset token is single-use, expires after 30 minutes, and revokes active sessions for the account',
      },
    }
  }

  memberSummary() {
    const session = this.currentSession()
    if (!this.roleHasPermission(session.role, 'security.viewMembers') && !this.roleHasPermission(session.role, 'security.manageUsers')) {
      throw new ForbiddenException(`Role ${session.role} cannot perform security.viewMembers`)
    }

    const memberships = this.membershipRecords.filter((item) => item.organizationId === session.organizationId)
    const roleCounts = Array.from(
      memberships.reduce((counts, membership) => counts.set(membership.role, (counts.get(membership.role) ?? 0) + 1), new Map<string, number>()),
    )
      .sort(([leftRole], [rightRole]) => leftRole.localeCompare(rightRole))
      .map(([role, count]) => ({ role, count }))

    return {
      data: {
        totalMembers: memberships.length,
        activeMembers: memberships.filter((membership) => membership.status === 'ACTIVE').length,
        invitedMembers: memberships.filter((membership) => membership.status === 'INVITED').length,
        deactivatedMembers: memberships.filter((membership) => membership.status === 'DEACTIVATED').length,
        activeSessions: this.sessions.filter(
          (candidate) => candidate.organizationId === session.organizationId && candidate.status === 'ACTIVE',
        ).length,
        roleCounts,
        invariant: 'member summary is tenant-scoped and omits member identities',
      },
    }
  }

  inviteMember(body: { email?: string; name?: string; role?: string; brandIds?: string[] }) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const email = body.email?.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new UnprocessableEntityException('Invite email must be valid')
    }

    const role = body.role?.trim() || 'Viewer'
    const rolePolicy = this.rolePolicyRecords.find((item) => item.role === role && item.scope === 'organization')
    if (!rolePolicy) {
      throw new UnprocessableEntityException('Invite role must be an organization role')
    }

    const existing = this.membershipRecords.find(
      (item) => item.organizationId === session.organizationId && item.email.toLowerCase() === email,
    )
    if (existing && existing.status !== 'DEACTIVATED') {
      throw new UnprocessableEntityException('Member is already active or invited in this tenant')
    }

    const tenantBrandIds = new Set(
      this.brandRecords.filter((item) => item.organizationId === session.organizationId).map((item) => item.id),
    )
    const brandIds = body.brandIds?.length ? body.brandIds : [session.brandId]
    if (brandIds.some((brandId) => !tenantBrandIds.has(brandId))) {
      throw new ForbiddenException('Invite cannot grant access to another tenant brand')
    }

    const timestamp = new Date().toISOString()
    const membership: MembershipRecord = {
      id: `MBR-${String(this.membershipRecords.length + 1).padStart(4, '0')}`,
      userId: `usr-${email.split('@')[0].replace(/[^a-z0-9-]/gi, '').toLowerCase()}`,
      email,
      name: body.name?.trim() || email,
      organizationId: session.organizationId,
      brandIds,
      role,
      status: 'INVITED',
      mfaEnabled: false,
      lastActiveAt: 'never',
      invitedAt: timestamp,
    }

    this.membershipRecords = existing
      ? this.membershipRecords.map((item) => (item.id === existing.id ? membership : item))
      : [membership, ...this.membershipRecords]
    this.queueNotification(
      session.organizationId,
      membership.email,
      'workspace',
      'You were invited to a workspace',
      `${session.email} invited you as ${membership.role}. Set your password to activate access.`,
      '/login',
    )
    const audit = this.recordAudit('membership.invite', email, session.userId, 'allowed')
    return {
      data: {
        membership,
        audit,
        invariant: 'admin invite creates membership only; invitee sets password and MFA later',
      },
    }
  }

  setMembershipStatus(id: string, status: MembershipRecord['status']) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    if (status !== 'ACTIVE' && status !== 'DEACTIVATED') {
      throw new UnprocessableEntityException('Membership status can only be ACTIVE or DEACTIVATED here')
    }

    const membership = this.membershipRecords.find(
      (item) => item.id === id && item.organizationId === session.organizationId,
    )
    if (!membership) {
      throw new NotFoundException(`Membership ${id} was not found`)
    }
    if (membership.role === 'Owner' && status === 'DEACTIVATED') {
      const activeOwners = this.membershipRecords.filter(
        (item) =>
          item.organizationId === session.organizationId &&
          item.role === 'Owner' &&
          item.status === 'ACTIVE' &&
          item.id !== membership.id,
      )
      if (activeOwners.length === 0) {
        throw new UnprocessableEntityException('Cannot deactivate the last active Owner')
      }
    }

    const updatedMembership = { ...membership, status }
    this.membershipRecords = this.membershipRecords.map((item) =>
      item.id === id ? updatedMembership : item,
    )
    let revokedSessions: AuthSession[] = []
    if (status === 'DEACTIVATED') {
      revokedSessions = this.revokeSessionsForEmail(membership.email)
    }
    const audit = this.recordAudit('membership.status.update', membership.email, session.userId, 'allowed')

    return {
      data: {
        membership: updatedMembership,
        revokedSessions: this.exposeSessions(revokedSessions),
        audit,
        invariant: 'deactivated memberships revoke active sessions inside the same tenant',
      },
    }
  }

  revokeSession(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const target = this.sessions.find((item) => item.id === id && item.organizationId === session.organizationId)
    if (!target) {
      throw new NotFoundException(`Session ${id} was not found`)
    }
    const revoked = this.revokeSessionRecord(target, 'ADMIN_REVOKE')
    const audit = this.recordAudit('session.revoke', target.userId, session.userId, 'allowed')

    return {
      data: {
        session: this.exposeSession(revoked),
        audit,
        invariant: 'session revocation is tenant-scoped and audited',
      },
    }
  }

  revokeAllSessions(body: { email?: string; keepCurrent?: boolean } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const email = body.email?.trim().toLowerCase()
    if (!email) {
      throw new UnprocessableEntityException('Email is required for revoke-all')
    }
    const keepCurrent = body.keepCurrent ?? true
    const revokedSessions: AuthSession[] = []
    this.sessions = this.sessions.map((item) => {
      const shouldKeepCurrent = keepCurrent && item.id === session.id
      if (
        item.organizationId !== session.organizationId ||
        item.email.toLowerCase() !== email ||
        item.status !== 'ACTIVE' ||
        shouldKeepCurrent
      ) {
        return item
      }
      const revoked = this.revokeSessionShape(item, 'REVOKE_ALL')
      revokedSessions.push(revoked)
      return revoked
    })
    const audit = this.recordAudit('session.revokeAll', email, session.userId, 'allowed')
    return {
      data: {
        revokedSessions: this.exposeSessions(revokedSessions),
        audit,
        invariant: 'revoke-all is tenant-scoped and can keep the current admin session active',
      },
    }
  }

  touchSession(id: string) {
    const session = this.currentSession()
    const target = this.sessions.find((item) => item.id === id && item.organizationId === session.organizationId)
    if (!target) {
      throw new NotFoundException(`Session ${id} was not found`)
    }
    if (target.email !== session.email) {
      this.requirePermission(session.role, 'security.sessions.manage')
    }
    if (target.status !== 'ACTIVE') {
      throw new UnprocessableEntityException('Only active sessions can extend idle timeout')
    }

    const now = new Date()
    const touched = {
      ...target,
      lastSeenAt: now.toISOString(),
      idleExpiresAt: new Date(now.getTime() + tenantSecurityPolicy.idleTimeoutMinutes * 60_000).toISOString(),
    }
    this.sessions = this.sessions.map((item) => (item.id === id ? touched : item))
    const audit = this.recordAudit('session.touch', target.userId, session.userId, 'allowed')
    return {
      data: {
        session: this.exposeSession(touched),
        audit,
        invariant: 'session activity only extends idle timeout, never absolute expiry',
      },
    }
  }

  logout() {
    const session = this.currentSession()
    const revoked = this.revokeSessionRecord(session, 'AUTH_LOGOUT')
    const audit = this.recordAudit('auth.logout', session.userId, 'api:auth', 'allowed')
    return {
      data: {
        session: this.exposeSession(revoked),
        audit,
        invariant: 'logout revokes the current active session',
      },
    }
  }

  permissionMatrix() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const rolePolicyRows = this.organizationRolePolicies()
    return {
      data: {
        permissionCatalog: this.organizationPermissionCatalog(),
        rolePolicies: rolePolicyRows,
        matrix: this.buildPermissionMatrix(rolePolicyRows),
        invariant: 'permission decisions are evaluated server-side from role policy records',
      },
    }
  }

  setRolePermissions(role: string, permissions: string[]) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.manageUsers')
    const normalizedRole = decodeURIComponent(role).trim()
    const target = this.rolePolicyRecords.find(
      (item) => item.role === normalizedRole && item.scope === 'organization',
    )
    if (!target) {
      throw new NotFoundException(`Role ${normalizedRole} was not found`)
    }

    const allowedPermissionKeys = new Set(this.organizationPermissionCatalog().map((permission) => permission.key))
    const requested = new Set(permissions)
    const unknownPermissions = [...requested].filter((permission) => !allowedPermissionKeys.has(permission))
    if (unknownPermissions.length > 0) {
      throw new UnprocessableEntityException(`Unknown organization permissions: ${unknownPermissions.join(', ')}`)
    }

    const mandatoryAdminPermissions = ['security.manageUsers', 'security.viewAuditLog', 'security.sessions.manage']
    if (target.role === 'Admin' && mandatoryAdminPermissions.some((permission) => !requested.has(permission))) {
      throw new UnprocessableEntityException('Admin role must keep core security administration permissions')
    }
    if (target.role === session.role && !requested.has('security.manageUsers')) {
      throw new UnprocessableEntityException('Current administrator cannot remove their own manage-users permission')
    }

    const orderedPermissions = this.organizationPermissionCatalog()
      .map((permission) => permission.key)
      .filter((permission) => requested.has(permission))
    const updatedPolicy = { ...target, permissions: orderedPermissions }
    this.rolePolicyRecords = this.rolePolicyRecords.map((policy) =>
      policy.role === target.role && policy.scope === target.scope ? updatedPolicy : policy,
    )
    const audit = this.recordAudit('role.permissions.update', target.role, session.userId, 'allowed')

    return {
      data: {
        rolePolicy: updatedPolicy,
        permissionCatalog: this.organizationPermissionCatalog(),
        matrix: this.buildPermissionMatrix(this.organizationRolePolicies()),
        audit,
        invariant: 'role permission updates are tenant-scoped, validated against catalog, and audited',
      },
    }
  }

  tenantProbe(resourceOrganizationId: string) {
    const session = this.currentSession()
    const allowed = tenantScopeAllows(session.organizationId, resourceOrganizationId)
    this.recordAudit('security.tenantProbe', resourceOrganizationId, session.userId, allowed ? 'allowed' : 'blocked')
    if (!allowed) {
      throw new ForbiddenException('Tenant guard blocked cross-organization access')
    }
    return { data: { allowed, organizationId: session.organizationId, resourceOrganizationId } }
  }

  permissionProbe(permission: string, role = 'Viewer') {
    const decision = this.permissionDecision(role, permission)
    this.recordAudit('security.permissionProbe', permission, role, decision.allowed ? 'allowed' : 'blocked')
    if (!decision.knownRole) {
      throw new NotFoundException(`Role ${role} was not found`)
    }
    if (!decision.knownPermission) {
      throw new UnprocessableEntityException(`Permission ${permission} is not in the catalog`)
    }
    if (!decision.allowed) {
      throw new ForbiddenException(`Role ${role} cannot perform ${permission}`)
    }
    return { data: decision }
  }

  settings() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    return { data: this.settingsRecord }
  }

  updateSettings(patch: Partial<TenantSettingsRecord>) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    this.settingsRecord = {
      ...this.settingsRecord,
      ...patch,
      organizationId: this.settingsRecord.organizationId,
    }
    const audit = this.recordAudit('customization.settings.update', this.settingsRecord.organizationId, session.userId, 'allowed')
    return { data: { settings: this.settingsRecord, audit, invariant: 'tenant settings update by config, not forked code' } }
  }

  customizationConsole() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    return {
      data: {
        settings: this.settingsRecord,
        featureFlags: this.flagRecords,
        numberingSequences: this.sequences,
        customFields: this.customFieldRecords,
        branding: this.workspaceBrandingForOrganization(session.organizationId),
        audit: this.auditEvents
          .filter((event) => event.action.startsWith('customization.'))
          .slice(0, 8),
        invariant: 'tenant customization is config-driven and audit logged',
      },
    }
  }

  workspaceBranding() {
    const session = this.currentSession()
    return { data: this.workspaceBrandingForOrganization(session.organizationId) }
  }

  updateFeatureFlag(key: string, enabled: boolean) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    const flag = this.flagRecords.find((item) => item.key === key)
    if (!flag) {
      throw new NotFoundException(`Feature flag ${key} was not found`)
    }
    const updated = { ...flag, enabled }
    this.flagRecords = this.flagRecords.map((item) => (item.key === key ? updated : item))
    const audit = this.recordAudit('customization.featureFlag.update', key, session.userId, 'allowed')
    return { data: { featureFlag: updated, audit, invariant: 'feature flags change tenant behavior without code forks' } }
  }

  updateNumberingSequence(key: string, patch: Partial<NumberingSequenceRecord>) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    const sequence = this.sequences.find((item) => item.key === key)
    if (!sequence) {
      throw new NotFoundException(`Numbering sequence ${key} was not found`)
    }
    const pattern = typeof patch.pattern === 'string' && patch.pattern.trim() ? patch.pattern.trim() : sequence.pattern
    if (!pattern.includes('#')) {
      throw new UnprocessableEntityException('Numbering pattern must include at least one # placeholder')
    }
    const nextValue = Number.isFinite(Number(patch.nextValue)) ? Number(patch.nextValue) : sequence.nextValue
    if (nextValue < sequence.nextValue) {
      throw new UnprocessableEntityException('Numbering next value cannot move backwards')
    }
    const updated = {
      ...sequence,
      pattern,
      nextValue: Math.floor(nextValue),
      scope: patch.scope === 'organization' || patch.scope === 'brand' ? patch.scope : sequence.scope,
    }
    this.sequences = this.sequences.map((item) => (item.key === key ? updated : item))
    const audit = this.recordAudit('customization.sequence.update', key, session.userId, 'allowed')
    return {
      data: {
        sequence: updated,
        preview: formatSequenceValue(updated),
        audit,
        invariant: 'numbering sequence updates preserve monotonic next values',
      },
    }
  }

  previewNumber(key: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    const sequence = this.sequences.find((item) => item.key === key)
    if (!sequence) {
      throw new NotFoundException(`Numbering sequence ${key} was not found`)
    }
    return { data: { key, value: formatSequenceValue(sequence), nextValue: sequence.nextValue } }
  }

  createCustomField(body: Partial<CustomFieldDefinition>) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    const entity = body.entity ?? 'material'
    if (!['material', 'formula', 'lot', 'document', 'supplier', 'order'].includes(entity)) {
      throw new UnprocessableEntityException('Custom field entity is not supported')
    }
    const label = body.label?.trim()
    if (!label) {
      throw new UnprocessableEntityException('Custom field label is required')
    }
    const key = (body.key?.trim() || label)
      .replace(/[^a-z0-9 ]/gi, '')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase()
    if (!key) {
      throw new UnprocessableEntityException('Custom field key is required')
    }
    const duplicate = this.customFieldRecords.some(
      (item) => item.entity === entity && item.key.toLowerCase() === key.toLowerCase(),
    )
    if (duplicate) {
      throw new UnprocessableEntityException('Custom field key already exists on this entity')
    }
    const fieldType = ['text', 'number', 'select', 'date', 'boolean'].includes(body.fieldType ?? '')
      ? body.fieldType!
      : 'text'
    const field: CustomFieldDefinition = {
      id: `CF-${entity.toUpperCase()}-${String(this.customFieldRecords.length + 1).padStart(4, '0')}`,
      entity,
      key,
      label,
      fieldType,
      required: Boolean(body.required),
      options: fieldType === 'select' ? body.options?.filter(Boolean) ?? [] : [],
      status: 'ACTIVE',
    }
    this.customFieldRecords = [field, ...this.customFieldRecords]
    const audit = this.recordAudit('customization.customField.create', field.id, session.userId, 'allowed')
    return { data: { customField: field, audit, invariant: 'custom fields extend tenant data without schema forks' } }
  }

  updateBranding(patch: Partial<BrandingConfig>) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    const currentBranding = this.workspaceBrandingForOrganization(session.organizationId)
    const displayName = patch.displayName?.trim() ?? currentBranding.displayName
    if (displayName.length < 2 || displayName.length > 64) {
      throw new UnprocessableEntityException('Workspace branding name must be between 2 and 64 characters')
    }
    const accentColor = patch.accentColor?.trim() ?? currentBranding.accentColor
    if (!/^#[0-9a-f]{6}$/i.test(accentColor)) {
      throw new UnprocessableEntityException('Accent color must be a hex color like #0f766e')
    }
    const logoMode =
      patch.logoMode === 'monogram' || patch.logoMode === 'wordmark' || patch.logoMode === 'image'
        ? patch.logoMode
        : currentBranding.logoMode
    const logoImageUrl = this.normalizeOptionalBrandLogoUrl(patch.logoImageUrl, currentBranding.logoImageUrl)
    if (logoMode === 'image' && !logoImageUrl) {
      throw new UnprocessableEntityException('Logo image mode requires a valid HTTPS image URL')
    }
    this.brandingRecord = {
      ...currentBranding,
      ...patch,
      organizationId: session.organizationId,
      displayName,
      accentColor,
      logoMode,
      logoImageUrl,
    }
    const audit = this.recordAudit('customization.branding.update', this.brandingRecord.organizationId, session.userId, 'allowed')
    return { data: { branding: this.brandingRecord, audit, invariant: 'branding changes are tenant config only' } }
  }

  featureFlags() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    return { data: this.flagRecords }
  }

  numberingSequences() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    return { data: this.sequences }
  }

  nextNumber(key: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'customization.manage')
    return this.consumeSequenceNumber(key, session.userId)
  }

  private consumeSequenceNumber(key: string, actor: string) {
    const sequence = this.sequences.find((item) => item.key === key)
    if (!sequence) {
      throw new NotFoundException(`Numbering sequence ${key} was not found`)
    }
    const value = formatSequenceValue(sequence)
    this.sequences = this.sequences.map((item) =>
      item.key === key ? { ...item, nextValue: item.nextValue + 1 } : item,
    )
    this.recordAudit('customization.sequence.next', key, actor, 'allowed')
    return { data: { key, value, invariant: 'numbering increments through a single sequence service' } }
  }

  documents() {
    return { data: this.documentRecords }
  }

  documentComplianceDashboard() {
    return {
      data: documentComplianceDashboard(
        this.documentRecords,
        this.materialRecords,
        this.lots,
        this.formulaRecords,
      ),
    }
  }

  generateDocument(body: GenerateDocumentBody) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'documents.manage')
    const type = this.normalizeGeneratedDocumentType(body.type)
    const linkedTo = body.linkedTo?.trim()
    if (!linkedTo) {
      throw new UnprocessableEntityException('Document linkedTo target is required')
    }

    const target = this.documentGenerationTarget(type, linkedTo, session)
    const existingCount = this.documentRecords.filter(
      (document) => document.type === type && document.linkedTo === linkedTo,
    ).length
    const timestamp = new Date()
    const issueDate = timestamp.toISOString().slice(0, 10)
    const expiresAt =
      type === 'CoA' || type === 'Finished Product SDS'
        ? new Date(timestamp.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : undefined
    const id = `DOC-GEN-${String(this.documentRecords.length + existingCount + 1).padStart(4, '0')}`
    const storageType = type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const document: DocumentRecord = {
      id,
      type,
      title: `${target.label} ${type}`,
      linkedTo,
      version: `v${existingCount + 1}`,
      sensitivity: target.sensitivity,
      status: 'REVIEW_REQUIRED',
      issueDate,
      expiresAt,
      lastAccessed: timestamp.toISOString(),
      downloads: 0,
      storageKey: `${session.organizationId}/generated/${target.scope}/${linkedTo}/${storageType}-v${existingCount + 1}.pdf`,
      mimeType: 'application/pdf',
      sizeKb: target.sizeKb,
      checksum: this.documentChecksum(`${type}:${linkedTo}:${existingCount + 1}:${issueDate}`),
      owner: 'Compliance',
      generatedFrom: target.generatedFrom,
    }
    this.documentRecords = [document, ...this.documentRecords]
    const audit = this.recordAudit('document.generate', document.id, body.actor?.trim() || session.userId, 'review')

    return {
      data: {
        document,
        audit,
        dashboard: documentComplianceDashboard(
          this.documentRecords,
          this.materialRecords,
          this.lots,
          this.formulaRecords,
        ),
        invariant: 'generated documents enter review and stay in the private document workflow',
      },
    }
  }

  approveDocument(id: string, body: { actor?: string; note?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'documents.manage')
    const document = this.documentRecords.find((item) => item.id === id)
    if (!document) {
      throw new NotFoundException(`Document ${id} was not found`)
    }
    if (document.status !== 'REVIEW_REQUIRED') {
      throw new UnprocessableEntityException('Only review-required documents can be approved')
    }

    const approvedDocument: DocumentRecord = {
      ...document,
      status: 'APPROVED',
      lastAccessed: new Date().toISOString(),
    }
    this.documentRecords = this.documentRecords.map((item) => (item.id === id ? approvedDocument : item))
    const audit = this.recordAudit('document.approve', id, body.actor?.trim() || session.userId, 'allowed')

    return {
      data: {
        document: approvedDocument,
        audit,
        dashboard: documentComplianceDashboard(
          this.documentRecords,
          this.materialRecords,
          this.lots,
          this.formulaRecords,
        ),
        invariant: 'approval moves generated documents out of review before external share',
      },
    }
  }

  shareDocument(id: string, body: { recipient?: string; actor?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'documents.manage')
    const document = this.documentRecords.find((item) => item.id === id)
    if (!document) {
      throw new NotFoundException(`Document ${id} was not found`)
    }
    if (document.status === 'REVIEW_REQUIRED') {
      throw new UnprocessableEntityException('Review-required documents must be approved before external sharing')
    }
    const recipient = body.recipient?.trim().toLowerCase()
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      throw new UnprocessableEntityException('A valid external recipient email is required')
    }

    const shareLink: DocumentShareLink = createDocumentShareLink(document, recipient)
    const sharedDocument: DocumentRecord = {
      ...document,
      status: 'SHARED',
      lastAccessed: new Date().toISOString(),
    }
    this.documentRecords = this.documentRecords.map((item) => (item.id === id ? sharedDocument : item))
    const audit = this.recordAudit('document.externalShare', id, body.actor?.trim() || session.userId, 'review')

    return {
      data: {
        document: sharedDocument,
        shareLink,
        audit,
        dashboard: documentComplianceDashboard(
          this.documentRecords,
          this.materialRecords,
          this.lots,
          this.formulaRecords,
        ),
        invariant: 'external share link is tenant-scoped, time-boxed, and audit-reviewed',
      },
    }
  }

  documentDownloadAudit() {
    return {
      data: this.auditEvents.filter((event) =>
        ['document.download', 'document.generate', 'document.approve', 'document.externalShare'].includes(event.action),
      ),
    }
  }

  requestDocumentSignedUrl(
    id: string,
    context: { actor?: string; permissions?: string[]; ip?: string } = {},
  ) {
    const session = this.currentSession()
    const document = this.documentRecords.find((item) => item.id === id)
    if (!document) {
      throw new NotFoundException(`Document ${id} was not found`)
    }

    const actor = context.actor ?? session.userId
    const permissions = context.permissions ?? this.permissionsForRole(session.role)
    const allowed = canDownloadDocument(document, permissions)
    const audit = this.recordDocumentDownloadAudit(document, actor, allowed ? 'allowed' : 'blocked')

    if (!allowed) {
      throw new ForbiddenException({
        message: 'Document download permission denied',
        requiredPermissions: documentRequiredPermissions(document),
        audit,
      })
    }

    const signedUrl = createSignedDocumentUrl(document)
    const updatedDocument = {
      ...document,
      downloads: document.downloads + 1,
      lastAccessed: new Date().toISOString(),
    }
    this.documentRecords = this.documentRecords.map((item) => (item.id === id ? updatedDocument : item))

    return {
      data: {
        document: updatedDocument,
        signedUrl,
        audit,
        invariant: 'permission checked before signing; private object URL never exposed',
      },
    }
  }

  labUsagePlan(formulaId: string, grams: number) {
    const session = this.currentSession()
    const formula = this.publishedFormulaForLabUsage(formulaId, session)
    if (!Number.isFinite(grams) || grams <= 0) {
      throw new UnprocessableEntityException('Lab usage grams must be greater than 0')
    }
    const leaves = resolveFormulaWithCatalog(formulaId, this.formulaCatalogForSession(session), this.materialRecords)
    const plan = planLabUsage(leaves, this.lotsForSession(session), grams, formula.targetGrams)
    return {
      data: {
        formulaId,
        formulaCode: formula.code,
        grams,
        allocations: plan.allocations,
        shortfalls: plan.shortfalls,
        canCommit: plan.shortfalls.length === 0,
      },
    }
  }

  labUsageHistory() {
    const session = this.currentSession()
    const formulaIds = new Set(this.formulaCatalogForSession(session).map((formula) => formula.id))
    return {
      data: {
        usages: this.usageHistory.filter((usage) => formulaIds.has(usage.formulaId)),
        invariant: 'lab usage history links formula, actual weighing evidence, lots, movements, and reversal evidence',
      },
    }
  }

  labUsageDetail(id: string) {
    const session = this.currentSession()
    const usage = this.usageHistory.find((item) => item.id === id)
    if (!usage) {
      throw new NotFoundException(`Lab usage ${id} was not found`)
    }
    this.formulaForSession(usage.formulaId, session)

    return {
      data: {
        usage,
        movements: this.movements.filter((movement) => movement.ref === usage.id),
        invariant: 'lab usage detail is audit-critical and keeps original OUT movements visible after reversal',
      },
    }
  }

  recordLabWeighingSession(formulaId: string, grams: number, options: LabWeighingOptions = {}) {
    const session = this.currentSession()
    const formula = this.publishedFormulaForLabUsage(formulaId, session)
    const plan = this.labUsagePlan(formulaId, grams).data
    if (!plan.canCommit) {
      throw new UnprocessableEntityException({
        message: 'Lab usage cannot be committed while shortfalls exist',
        shortfalls: plan.shortfalls,
      })
    }

    const tolerancePercent = Number(options.tolerancePercent ?? 2)
    if (!Number.isFinite(tolerancePercent) || tolerancePercent < 0) {
      throw new UnprocessableEntityException('Weighing tolerancePercent must be 0 or greater')
    }

    const remainingAvailableByLot = new Map(
      this.lotsForSession(session).map((lot) => [lot.id, Math.max(0, lot.quantityGrams - lot.reservedGrams)]),
    )
    const timestamp = new Date().toISOString()
    const lines = plan.allocations.map((allocation) => {
      const actualInput = options.actuals?.find(
        (item) =>
          item.lotId === allocation.lotId &&
          (item.materialId === undefined || item.materialId === allocation.materialId),
      )
      const actualGrams = Number(actualInput?.actualGrams ?? allocation.allocatedGrams)
      if (!Number.isFinite(actualGrams) || actualGrams <= 0) {
        throw new UnprocessableEntityException('Actual weighed grams must be greater than 0')
      }

      const available = remainingAvailableByLot.get(allocation.lotId) ?? 0
      if (actualGrams - available > 0.0001) {
        throw new UnprocessableEntityException({
          message: 'Actual weighed grams exceed available lot stock',
          lotId: allocation.lotId,
          availableGrams: available,
          actualGrams,
        })
      }
      remainingAvailableByLot.set(allocation.lotId, available - actualGrams)

      const deviationGrams = actualGrams - allocation.allocatedGrams
      const deviationPercent =
        allocation.allocatedGrams > 0 ? Math.abs(deviationGrams / allocation.allocatedGrams) * 100 : 0

      return {
        materialId: allocation.materialId,
        materialName: allocation.materialName,
        lotId: allocation.lotId,
        lotNumber: allocation.lotNumber,
        targetGrams: allocation.allocatedGrams,
        actualGrams,
        deviationGrams,
        deviationPercent,
        withinTolerance: deviationPercent <= tolerancePercent + 0.0001,
      }
    })
    const weighingSession: LabWeighingSession = {
      id: `WGH-API-${String(this.usageHistory.length + 1).padStart(4, '0')}`,
      formulaId,
      formulaCode: formula.code,
      targetBatchGrams: grams,
      tolerancePercent,
      operator: options.operator?.trim() || 'api:perfumer',
      status: lines.every((line) => line.withinTolerance) ? 'READY' : 'NEEDS_REVIEW',
      lines,
      createdAt: timestamp,
    }

    return {
      data: {
        weighingSession,
        canCommit: weighingSession.status === 'READY',
        invariant: 'weighing session validates actual grams before movement creation',
      },
    }
  }

  commitLabUsage(formulaId: string, grams: number, options: LabWeighingOptions = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'inventory.commitLabUsage')
    const formula = this.publishedFormulaForLabUsage(formulaId, session)
    const plan = this.labUsagePlan(formulaId, grams).data
    const weighingSession = this.recordLabWeighingSession(formulaId, grams, options).data.weighingSession
    if (weighingSession.status !== 'READY') {
      throw new UnprocessableEntityException({
        message: 'Lab usage cannot be committed while actual weights need review',
        weighingSession,
      })
    }

    const usageId = `LAB-API-${String(this.usageHistory.length + 1).padStart(4, '0')}`
    const timestamp = new Date().toISOString()
    const lotMap = new Map(this.lotsForSession(session).map((lot) => [lot.id, { ...lot }]))
    const createdMovements: InventoryMovement[] = []
    const actualAllocations: Allocation[] = []

    plan.allocations.forEach((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      const line = weighingSession.lines[index]
      if (!lot) {
        return
      }
      const actualGrams = line?.actualGrams ?? allocation.allocatedGrams
      lot.quantityGrams = Math.max(0, lot.quantityGrams - actualGrams)
      actualAllocations.push({
        ...allocation,
        allocatedGrams: actualGrams,
        balanceAfter: lot.quantityGrams,
      })
      createdMovements.push({
        id: `MOV-API-${usageId}-${index + 1}`,
        at: timestamp,
        type: 'LAB_CONSUMPTION',
        direction: 'OUT',
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: actualGrams,
        balanceAfter: lot.quantityGrams,
        ref: usageId,
        actor: weighingSession.operator,
      })
    })

    this.replaceLotsForSession(session, Array.from(lotMap.values()))
    this.movements = [...createdMovements, ...this.movements]
    const usage: LabUsageRecord = {
      id: usageId,
      formulaId,
      formulaCode: formula.code,
      grams,
      batchGrams: grams,
      status: 'COMMITTED',
      purpose: this.normalizeLabUsagePurpose(options.purpose),
      projectCode: options.projectCode?.trim() || undefined,
      sampleCode: options.sampleCode?.trim() || undefined,
      qcLink: options.qcLink?.trim() || undefined,
      allocations: actualAllocations,
      weighingSession: { ...weighingSession, id: `WGH-${usageId}`, createdAt: timestamp },
      createdAt: timestamp,
    }
    this.usageHistory = [usage, ...this.usageHistory]

    return {
      data: {
        usage,
        movements: createdMovements,
        lots: this.lotsForSession(session),
        usageHistory: this.labUsageHistory().data.usages,
        message: `${usageId} committed ${formatGrams(
          weighingSession.lines.reduce((sum, line) => sum + line.actualGrams, 0),
        )} actual lab usage using immutable OUT movements`,
        invariant: 'commit creates immutable OUT movements and stores actual weighing evidence',
      },
    }
  }

  reverseLabUsage(id: string, options: LabUsageReverseOptions = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'inventory.reverseLabUsage')
    const usage = this.usageHistory.find((item) => item.id === id)
    if (!usage) {
      throw new NotFoundException(`Lab usage ${id} was not found`)
    }
    this.formulaForSession(usage.formulaId, session)
    if (usage.status === 'REVERSED') {
      throw new UnprocessableEntityException(`Lab usage ${id} is already reversed`)
    }

    const timestamp = new Date().toISOString()
    const actor = options.actor?.trim() || session.userId
    const reason = options.reason?.trim() || 'Compensation reversal'
    const lotMap = new Map(this.lotsForSession(session).map((lot) => [lot.id, { ...lot }]))
    const reversals: InventoryMovement[] = []
    const reversalKey = (lotId: string, materialId: string) => `${lotId}:${materialId}`
    const reversedByLot = new Map<string, number>()
    usage.reversalMovements?.forEach((movement) => {
      const key = reversalKey(movement.lotId, movement.materialId)
      reversedByLot.set(key, (reversedByLot.get(key) ?? 0) + movement.quantityGrams)
    })
    const requestedByLot = new Map<string, number>()
    options.allocations?.forEach((allocation) => {
      if (!allocation?.lotId || !allocation.materialId || !Number.isFinite(allocation.grams) || allocation.grams <= 0) {
        throw new UnprocessableEntityException('Partial reversal allocations require a material, lot, and grams greater than 0')
      }
      const original = usage.allocations.find(
        (item) => item.lotId === allocation.lotId && item.materialId === allocation.materialId,
      )
      if (!original) {
        throw new UnprocessableEntityException(`Lot ${allocation.lotId} is not part of ${usage.id}`)
      }
      const key = reversalKey(allocation.lotId, allocation.materialId)
      requestedByLot.set(key, (requestedByLot.get(key) ?? 0) + allocation.grams)
    })

    usage.allocations.forEach((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        return
      }
      const allocationKey = reversalKey(allocation.lotId, allocation.materialId)
      const alreadyReversed = reversedByLot.get(allocationKey) ?? 0
      const remainingGrams = Math.max(0, allocation.allocatedGrams - alreadyReversed)
      const requestedGrams = requestedByLot.size > 0 ? requestedByLot.get(allocationKey) ?? 0 : remainingGrams
      if (requestedGrams - remainingGrams > 0.0001) {
        throw new UnprocessableEntityException({
          message: `Reversal exceeds the remaining consumed amount for lot ${allocation.lotNumber}`,
          lotId: allocation.lotId,
          remainingGrams,
          requestedGrams,
        })
      }
      if (requestedGrams <= 0) {
        return
      }
      lot.quantityGrams += requestedGrams
      reversals.push({
        id: `MOV-API-REV-${usage.id}-${(usage.reversalMovements?.length ?? 0) + index + 1}`,
        at: timestamp,
        type: 'REVERSAL',
        direction: 'IN',
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: requestedGrams,
        balanceAfter: lot.quantityGrams,
        ref: usage.id,
        actor,
      })
    })

    if (reversals.length === 0) {
      throw new UnprocessableEntityException('No remaining consumed grams are available to reverse')
    }

    this.replaceLotsForSession(session, Array.from(lotMap.values()))
    this.movements = [...reversals, ...this.movements]
    const allReversals = [...(usage.reversalMovements ?? []), ...reversals]
    const reversedTotal = allReversals.reduce((total, movement) => total + movement.quantityGrams, 0)
    const consumedTotal = usage.allocations.reduce((total, allocation) => total + allocation.allocatedGrams, 0)
    const fullyReversed = reversedTotal >= consumedTotal - 0.0001
    let reversedUsage: LabUsageRecord | undefined
    this.usageHistory = this.usageHistory.map((item) =>
      item.id === usage.id
        ? (reversedUsage = {
            ...item,
            status: fullyReversed ? 'REVERSED' : 'PARTIALLY_REVERSED',
            reversedAt: timestamp,
            reversalMovements: allReversals,
          })
        : item,
    )

    return {
      data: {
        usageId: usage.id,
        usage: reversedUsage ?? {
          ...usage,
          status: fullyReversed ? 'REVERSED' : 'PARTIALLY_REVERSED',
          reversedAt: timestamp,
          reversalMovements: allReversals,
        },
        movements: reversals,
        lots: this.lotsForSession(session),
        usageHistory: this.labUsageHistory().data.usages,
        reason,
        invariant: 'partial or full reverse by compensation creates only IN movements; original OUT remains immutable',
      },
    }
  }

  reverseLatestLabUsage(options: LabUsageReverseOptions = {}) {
    const session = this.currentSession()
    const formulaIds = new Set(this.formulaCatalogForSession(session).map((formula) => formula.id))
    const usage = this.usageHistory.find(
      (item) => (item.status === 'COMMITTED' || item.status === 'PARTIALLY_REVERSED') && formulaIds.has(item.formulaId),
    )
    if (!usage) {
      throw new UnprocessableEntityException('No committed lab usage exists to reverse')
    }

    return this.reverseLabUsage(usage.id, options)
  }

  productionBatches() {
    const session = this.currentSession()
    const formulaIds = new Set(this.formulaCatalogForSession(session).map((formula) => formula.id))
    this.normalizeProductionBatches()
    return { data: this.productionBatchRecords.filter((batch) => formulaIds.has(batch.formulaId)) }
  }

  createProductionBatch(formulaId = 'frm-0421', targetGrams = 25) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'production.consume')
    const formula = this.formulaForSession(formulaId, session)
    const approvedVersion = this.formulaVersionRecords.some(
      (version) =>
        version.formulaId === formulaId &&
        (version.organizationId || 'org-nxl') === session.organizationId &&
        version.status === 'APPROVED',
    )
    if (!approvedVersion) {
      throw new UnprocessableEntityException(`Formula ${formula.code} must be approved before production`)
    }
    const id = this.consumeSequenceNumber('batch', session.userId).data.value
    const timestamp = new Date()
    const batch: ProductionBatchRecord = {
      id,
      formulaId,
      formulaCode: formula.code,
      status: 'WEIGHING',
      targetGrams,
      consumedGrams: 0,
      qcStatus: 'PENDING',
      owner: 'Manufacturing',
      workOrder: this.createProductionWorkOrder(id, timestamp),
      qcChecks: this.createProductionQcChecks(id),
      genealogy: {
        inputLotIds: [],
        inputMovementIds: [],
      },
    }
    this.productionBatchRecords = [batch, ...this.productionBatchRecords]
    this.recordAudit('production.batch.create', id, session.userId, 'allowed')
    return { data: batch }
  }

  consumeProductionBatch(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'production.consume')
    this.normalizeProductionBatches()
    const batch = this.productionBatchRecords.find((item) => item.id === id)
    if (!batch) {
      throw new NotFoundException(`Production batch ${id} was not found`)
    }
    if (batch.consumedGrams > 0) {
      throw new UnprocessableEntityException(`Production batch ${id} has already consumed inventory`)
    }
    if (batch.status !== 'WEIGHING') {
      throw new UnprocessableEntityException(`Production batch ${id} must be at WEIGHING before inventory consumption`)
    }
    const formula = this.formulaForSession(batch.formulaId, session)
    const leaves = resolveFormulaWithCatalog(
      batch.formulaId,
      this.formulaCatalogForSession(session),
      this.materialRecords,
    )
    const plan = planLabUsage(leaves, this.lotsForSession(session), batch.targetGrams, formula.targetGrams)
    if (plan.shortfalls.length > 0) {
      throw new UnprocessableEntityException({ message: 'Production cannot consume while shortfalls exist', shortfalls: plan.shortfalls })
    }

    const lotMap = new Map(this.lotsForSession(session).map((lot) => [lot.id, { ...lot }]))
    const timestamp = new Date().toISOString()
    const movements = plan.allocations.map((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        throw new NotFoundException(`Lot ${allocation.lotId} was not found`)
      }
      lot.quantityGrams = Math.max(0, lot.quantityGrams - allocation.allocatedGrams)
      return {
        id: `MOV-PROD-${id}-${index + 1}`,
        at: timestamp,
        type: 'PRODUCTION_CONSUMPTION' as const,
        direction: 'OUT' as const,
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: allocation.allocatedGrams,
        balanceAfter: lot.quantityGrams,
        ref: id,
        actor: session.userId,
      }
    })

    this.replaceLotsForSession(session, Array.from(lotMap.values()))
    this.movements = [...movements, ...this.movements]
    this.productionBatchRecords = this.productionBatchRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            consumedGrams: batch.targetGrams,
            status: 'MACERATION',
            workOrder: this.updateWorkOrderStep(item.workOrder, 'Weigh raw materials', 'DONE', `${movements.length} input movement(s)`),
            genealogy: {
              ...item.genealogy,
              inputLotIds: movements.map((movement) => movement.lotId),
              inputMovementIds: movements.map((movement) => movement.id),
            },
          }
        : item,
    )
    this.recordAudit('production.batch.consume', id, session.userId, 'allowed')
    return { data: { batchId: id, movements, invariant: 'production consumption is separate from lab usage' } }
  }

  qcProductionBatch(id: string, result: 'PASSED' | 'FAILED' = 'PASSED') {
    const session = this.currentSession()
    this.requirePermission(session.role, 'production.qc')
    this.normalizeProductionBatches()
    const batch = this.productionBatchRecords.find((item) => item.id === id)
    if (!batch) {
      throw new NotFoundException(`Production batch ${id} was not found`)
    }
    if (batch.consumedGrams <= 0) {
      throw new UnprocessableEntityException(`Production batch ${id} must consume inventory before QC`)
    }
    if (batch.status !== 'QC') {
      throw new UnprocessableEntityException(`Production batch ${id} must enter QC before recording a QC result`)
    }
    const timestamp = new Date().toISOString()
    const status = result === 'PASSED' ? 'BOTTLING' : 'HOLD'
    this.productionBatchRecords = this.productionBatchRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            qcStatus: result,
            status,
            qcChecks: item.qcChecks.map((check) => ({
              ...check,
              result,
              recordedAt: timestamp,
              note: result === 'PASSED' ? 'Within production release tolerance' : 'Deviation review required',
            })),
            workOrder:
              result === 'PASSED'
                ? this.updateWorkOrderStep(item.workOrder, 'Filter and bottle', 'READY', 'QC passed')
                : item.workOrder,
          }
        : item,
    )
    this.recordAudit('production.batch.qc', id, session.userId, result === 'PASSED' ? 'allowed' : 'review')
    return { data: this.productionBatchRecords.find((item) => item.id === id)! }
  }

  updateProductionBatchStatus(id: string, status: ProductionBatchRecord['status']) {
    const session = this.currentSession()
    this.requirePermission(session.role, status === 'QC' || status === 'RELEASED' ? 'production.qc' : 'production.consume')
    this.normalizeProductionBatches()
    const batch = this.productionBatchRecords.find((item) => item.id === id)
    if (!batch) {
      throw new NotFoundException(`Production batch ${id} was not found`)
    }
    if (!productionLifecycleStatuses.includes(status)) {
      throw new UnprocessableEntityException(`Production batch status ${status} is not supported`)
    }
    if (status === batch.status) {
      return {
        data: {
          batch,
          invariant: 'production lifecycle is already at the requested gate',
        },
      }
    }
    if (['MACERATION', 'FILTRATION', 'QC', 'BOTTLING', 'RELEASED'].includes(status) && batch.consumedGrams <= 0) {
      throw new UnprocessableEntityException(`Production batch ${id} must consume inventory before ${status}`)
    }
    const nextStatus: Partial<Record<ProductionBatchRecord['status'], ProductionBatchRecord['status'][]>> = {
      PLANNED: ['WEIGHING'],
      WEIGHING: ['MACERATION', 'HOLD'],
      MACERATION: ['FILTRATION', 'HOLD'],
      FILTRATION: ['QC', 'HOLD'],
      QC: ['BOTTLING', 'HOLD'],
      BOTTLING: ['RELEASED', 'HOLD'],
      HOLD: [batch.consumedGrams > 0 ? 'MACERATION' : 'WEIGHING'],
    }
    if (!nextStatus[batch.status]?.includes(status)) {
      throw new UnprocessableEntityException(
        `Production batch ${id} must progress through the next lifecycle gate from ${batch.status}`,
      )
    }
    if (status === 'RELEASED' && batch.qcStatus !== 'PASSED') {
      throw new UnprocessableEntityException(`Production batch ${id} must pass QC before release`)
    }
    if (status === 'BOTTLING' && batch.qcStatus !== 'PASSED') {
      throw new UnprocessableEntityException(`Production batch ${id} must pass QC before bottling`)
    }
    if (status === 'WEIGHING' && batch.consumedGrams > 0) {
      throw new UnprocessableEntityException(`Production batch ${id} cannot return to weighing after consumption`)
    }

    this.productionBatchRecords = this.productionBatchRecords.map((item) => {
      if (item.id !== id) {
        return item
      }
      const released = status === 'RELEASED' ? this.releaseProductionOutputLot(item) : item
      return { ...released, status }
    })
    this.recordAudit('production.batch.status', id, session.userId, status === 'HOLD' ? 'review' : 'allowed')
    return {
      data: {
        batch: this.productionBatchRecords.find((item) => item.id === id)!,
        invariant: 'production lifecycle transitions are audited and gated by consumption and QC state',
      },
    }
  }

  suppliers() {
    return { data: this.supplierRecords }
  }

  createSupplier(body: CreateSupplierBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'procurement.manage')
    const name = body.name?.trim()
    const country = body.country?.trim().toUpperCase()
    const contactEmail = body.contactEmail?.trim().toLowerCase()

    if (!name) {
      throw new UnprocessableEntityException('Supplier name is required')
    }
    if (!country || country.length !== 2) {
      throw new UnprocessableEntityException('Supplier country must be a two-letter code')
    }
    if (!contactEmail || !contactEmail.includes('@')) {
      throw new UnprocessableEntityException('Supplier contactEmail is required')
    }
    if (this.supplierRecords.some((supplier) => supplier.name.toLowerCase() === name.toLowerCase())) {
      throw new UnprocessableEntityException(`Supplier ${name} already exists`)
    }
    const leadTimeDays = Math.round(Number(body.leadTimeDays ?? 14))
    if (!Number.isFinite(leadTimeDays) || leadTimeDays <= 0) {
      throw new UnprocessableEntityException('Supplier leadTimeDays must be greater than 0')
    }

    const supplier: SupplierRecord = {
      id: `SUP-${String(this.supplierRecords.length + 8).padStart(3, '0')}`,
      name,
      status: 'review',
      country,
      leadTimeDays,
      contactEmail,
      paymentTerms: body.paymentTerms?.trim() || 'Net 30',
      preferredMaterialIds: (body.preferredMaterialIds ?? []).filter((materialId) =>
        this.materialCatalogForSession(session).some((material) => material.id === materialId),
      ),
    }

    this.supplierRecords = [supplier, ...this.supplierRecords]
    const audit = this.recordAudit('procurement.supplier.create', supplier.id, session.userId, 'allowed')
    return {
      data: {
        supplier,
        audit,
        invariant: 'supplier master changes are audited and do not create inventory movement',
      },
    }
  }

  purchaseOrders() {
    return { data: this.purchaseOrderRecords }
  }

  createPurchaseOrder(body: CreatePurchaseOrderBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'procurement.manage')
    const supplier = this.supplierRecords.find((item) => item.id === body.supplierId)
    if (!supplier) {
      throw new NotFoundException(`Supplier ${body.supplierId ?? 'unknown'} was not found`)
    }
    const materialId = body.materialId?.trim()
    if (!materialId) {
      throw new NotFoundException('Material unknown was not found')
    }
    const material = this.materialForSession(materialId, session)
    const quantityGrams = Number(body.quantityGrams ?? 0)
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new UnprocessableEntityException('Purchase order quantityGrams must be greater than 0')
    }
    const unitCost = Number(body.unitCost ?? material.costPerGram)
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new UnprocessableEntityException('Purchase order unitCost must be greater than 0')
    }

    const id = this.consumeSequenceNumber('purchaseOrder', session.userId).data.value
    const expectedDate =
      body.expectedDate?.trim() ||
      new Date(Date.now() + supplier.leadTimeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const purchaseOrder: PurchaseOrderRecord = {
      id,
      supplierId: supplier.id,
      materialId: material.id,
      quantityGrams,
      receivedGrams: 0,
      status: 'DRAFT',
      expectedDate,
      unitCost,
      currency: body.currency?.trim().toUpperCase() || 'USD',
      createdAt: new Date().toISOString(),
    }

    this.purchaseOrderRecords = [purchaseOrder, ...this.purchaseOrderRecords]
    const audit = this.recordAudit('procurement.po.create', id, session.userId, 'allowed')
    return {
      data: {
        purchaseOrder,
        audit,
        invariant: 'purchase order draft creation does not reserve or move inventory',
      },
    }
  }

  updatePurchaseOrderStatus(id: string, status: PurchaseOrderRecord['status'] = 'SENT') {
    const session = this.currentSession()
    this.requirePermission(session.role, 'procurement.manage')
    const order = this.purchaseOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Purchase order ${id} was not found`)
    }
    if (!['DRAFT', 'SENT', 'PARTIAL', 'RECEIVED'].includes(status)) {
      throw new UnprocessableEntityException(`Purchase order status ${status} is not supported`)
    }
    if (order.status === 'RECEIVED' && status !== 'RECEIVED') {
      throw new UnprocessableEntityException(`Purchase order ${id} is already received`)
    }
    if (status === 'RECEIVED' && order.receivedGrams < order.quantityGrams) {
      throw new UnprocessableEntityException(`Purchase order ${id} must be fully received through goods receipt`)
    }
    if (status === 'DRAFT' && order.receivedGrams > 0) {
      throw new UnprocessableEntityException(`Purchase order ${id} cannot return to draft after receipt`)
    }

    this.purchaseOrderRecords = this.purchaseOrderRecords.map((item) => (item.id === id ? { ...item, status } : item))
    const audit = this.recordAudit('procurement.po.status', id, session.userId, status === 'PARTIAL' ? 'review' : 'allowed')
    return {
      data: {
        purchaseOrder: this.purchaseOrderRecords.find((item) => item.id === id)!,
        audit,
        invariant: 'purchase order state transitions are audited and separated from stock receipt',
      },
    }
  }

  receivePurchaseOrder(id: string, body: { receivedGrams?: number } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'procurement.manage')
    const order = this.purchaseOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Purchase order ${id} was not found`)
    }
    const material = this.materialRecords.find((item) => item.id === order.materialId)
    if (!material) {
      throw new NotFoundException(`Material ${order.materialId} was not found`)
    }
    if (order.status === 'RECEIVED') {
      throw new UnprocessableEntityException(`Purchase order ${id} has already been received`)
    }
    if (order.status === 'DRAFT') {
      throw new UnprocessableEntityException(`Purchase order ${id} must be sent before receiving goods`)
    }
    const remainingGrams = order.quantityGrams - order.receivedGrams
    const receivedGrams = Number(body.receivedGrams ?? remainingGrams)
    if (!Number.isFinite(receivedGrams) || receivedGrams <= 0) {
      throw new UnprocessableEntityException('receivedGrams must be greater than 0')
    }
    if (receivedGrams > remainingGrams) {
      throw new UnprocessableEntityException(`receivedGrams exceeds remaining quantity for ${id}`)
    }

    const totalReceived = order.receivedGrams + receivedGrams
    const receiptIndex = this.movements.filter((movement) => movement.ref === id && movement.type === 'RECEIPT').length + 1
    const lot: InventoryLot = {
      id: `lot-${order.id.toLowerCase()}-${receiptIndex}`,
      organizationId: session.organizationId,
      materialId: order.materialId,
      lotNumber: `L-${order.id}-${String(receiptIndex).padStart(2, '0')}`,
      quantityGrams: receivedGrams,
      reservedGrams: 0,
      receivedDate: new Date().toISOString().slice(0, 10),
      expiryDate: '2028-12-31',
      qualityStatus: 'APPROVED',
      location: 'Receiving Bay',
      unitCost: order.unitCost,
      supplierLotRef: order.id,
      currency: order.currency,
    }
    const movement: InventoryMovement = {
      id: `MOV-PO-${id}-${receiptIndex}`,
      at: new Date().toISOString(),
      type: 'RECEIPT',
      direction: 'IN',
      materialId: order.materialId,
      lotId: lot.id,
      quantityGrams: receivedGrams,
      balanceAfter: lot.quantityGrams,
      ref: id,
      actor: session.userId,
    }
    const priceSnapshot: PriceHistoryRecord = {
      id: `PRICE-${id}-${receiptIndex}`,
      materialId: order.materialId,
      supplierId: order.supplierId,
      purchaseOrderId: id,
      unitCost: order.unitCost,
      currency: order.currency,
      quantityGrams: receivedGrams,
      capturedAt: movement.at,
      source: 'PO_RECEIPT',
    }
    this.lots = [lot, ...this.lots]
    this.movements = [movement, ...this.movements]
    this.priceHistoryRecords = [priceSnapshot, ...this.priceHistoryRecords]
    this.purchaseOrderRecords = this.purchaseOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            receivedGrams: totalReceived,
            status: totalReceived >= item.quantityGrams ? 'RECEIVED' : 'PARTIAL',
          }
        : item,
    )
    const audit = this.recordAudit('procurement.po.receive', id, session.userId, 'allowed')
    return {
      data: {
        lot,
        movement,
        purchaseOrder: this.purchaseOrderRecords.find((item) => item.id === id)!,
        priceHistory: priceSnapshot,
        audit,
        invariant: 'goods receipt creates lot and IN movement plus immutable price history snapshot',
      },
    }
  }

  materialPriceHistory(materialId: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'procurement.view')
    this.materialForSession(materialId, session)
    return {
      data: this.priceHistoryRecords.filter((record) => record.materialId === materialId),
    }
  }

  catalogSkus() {
    return {
      data: skuAvailability(this.commercialSkuRecords, this.lots, this.materialRecords),
    }
  }

  createCatalogSku(body: CreateCatalogSkuBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'commerce.manage')
    const materialId = body.materialId?.trim()
    if (!materialId) {
      throw new NotFoundException('Material unknown was not found')
    }
    const material = this.materialForSession(materialId, session)
    const name = body.name?.trim()
    if (!name) {
      throw new UnprocessableEntityException('SKU name is required')
    }
    if (this.commercialSkuRecords.some((sku) => sku.name.toLowerCase() === name.toLowerCase())) {
      throw new UnprocessableEntityException(`SKU ${name} already exists`)
    }
    const packSizeGrams = Number(body.packSizeGrams ?? 0)
    if (!Number.isFinite(packSizeGrams) || packSizeGrams <= 0) {
      throw new UnprocessableEntityException('SKU packSizeGrams must be greater than 0')
    }
    const price = Number(body.price ?? 0)
    if (!Number.isFinite(price) || price <= 0) {
      throw new UnprocessableEntityException('SKU price must be greater than 0')
    }
    const moqPacks = Math.round(Number(body.moqPacks ?? 1))
    if (!Number.isFinite(moqPacks) || moqPacks <= 0) {
      throw new UnprocessableEntityException('SKU moqPacks must be greater than 0')
    }
    const tier = body.tier ?? 'Studio'
    if (!['Studio', 'Lab', 'Bulk'].includes(tier)) {
      throw new UnprocessableEntityException(`SKU tier ${tier} is not supported`)
    }

    const sku: CommercialSkuRecord = {
      id: `SKU-${material.id.replace('mat-', '').slice(0, 3).toUpperCase()}-${String(this.commercialSkuRecords.length + 51).padStart(3, '0')}`,
      materialId: material.id,
      name,
      description: body.description?.trim() || `${material.name} commercial pack`,
      packSizeGrams,
      price,
      currency: body.currency?.trim().toUpperCase() || 'USD',
      tier,
      status: 'ACTIVE',
      moqPacks,
      labelTemplate: body.labelTemplate?.trim() || `${this.brandingRecord.displayName} Neutral Pack`,
    }
    this.commercialSkuRecords = [sku, ...this.commercialSkuRecords]
    const audit = this.recordAudit('commerce.sku.create', sku.id, session.userId, 'allowed')
    return {
      data: {
        sku: skuAvailability([sku], this.lots, this.materialRecords)[0],
        audit,
        invariant: 'commerce SKU creation stores no stock; availability is derived from Inventory lots',
      },
    }
  }

  priceLists() {
    return { data: this.priceListRecords }
  }

  createPriceList(body: CreatePriceListBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'commerce.manage')
    const name = body.name?.trim()
    if (!name) {
      throw new UnprocessableEntityException('Price list name is required')
    }
    const customerGroup = body.customerGroup ?? 'Studio'
    if (!['Studio', 'Lab', 'Bulk', 'Contract'].includes(customerGroup)) {
      throw new UnprocessableEntityException(`Customer group ${customerGroup} is not supported`)
    }
    const multiplier = Number(body.multiplier ?? 1)
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new UnprocessableEntityException('Price list multiplier must be greater than 0')
    }

    const priceList: PriceListRecord = {
      id: `PL-${customerGroup.toUpperCase()}-${String(this.priceListRecords.length + 1).padStart(3, '0')}`,
      name,
      customerGroup,
      currency: body.currency?.trim().toUpperCase() || 'USD',
      multiplier,
      sampleEligible: body.sampleEligible ?? customerGroup !== 'Bulk',
      status: 'ACTIVE',
    }
    this.priceListRecords = [priceList, ...this.priceListRecords]
    const audit = this.recordAudit('commerce.price-list.create', priceList.id, session.userId, 'allowed')
    return {
      data: {
        priceList,
        audit,
        invariant: 'price list changes affect quote pricing without mutating inventory',
      },
    }
  }

  quotes() {
    return { data: this.quoteRecords }
  }

  createQuote(body: CreateQuoteBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'commerce.manage')
    const requestedLines = body.lines?.length
      ? body.lines
      : [{ skuId: body.skuId, quantityPacks: body.quantityPacks }]
    if (requestedLines.length === 0 || requestedLines.length > 25) {
      throw new UnprocessableEntityException('Quote must contain between 1 and 25 SKU lines')
    }
    const customerRecord = body.customerId ? this.customerRecords.find((item) => item.id === body.customerId) : undefined
    if (body.customerId && !customerRecord) {
      throw new NotFoundException(`Customer ${body.customerId} was not found`)
    }
    const customer = customerRecord?.name ?? body.customer?.trim()
    if (!customer) {
      throw new UnprocessableEntityException('Select an existing customer or provide a customer name')
    }
    const customerGroup = customerRecord?.group ?? body.customerGroup ?? 'Studio'
    const priceList =
      this.priceListRecords.find((item) => item.customerGroup === customerGroup && item.status === 'ACTIVE') ??
      this.priceListRecords.find((item) => item.customerGroup === 'Studio' && item.status === 'ACTIVE')
    if (!priceList) {
      throw new NotFoundException(`Active price list for ${customerGroup} was not found`)
    }
    const seenSkuIds = new Set<string>()
    const lines = requestedLines.map((line) => {
      const skuId = line.skuId?.trim()
      if (!skuId || seenSkuIds.has(skuId)) {
        throw new UnprocessableEntityException('Each quote SKU line must be unique')
      }
      seenSkuIds.add(skuId)
      const sku = this.commercialSkuRecords.find((item) => item.id === skuId)
      if (!sku) {
        throw new NotFoundException(`SKU ${skuId} was not found`)
      }
      if (sku.status !== 'ACTIVE') {
        throw new UnprocessableEntityException(`SKU ${sku.id} is not active`)
      }
      const quantityPacks = Math.round(Number(line.quantityPacks ?? 1))
      if (!Number.isFinite(quantityPacks) || quantityPacks <= 0) {
        throw new UnprocessableEntityException(`Quote quantity for ${sku.id} must be greater than 0`)
      }
      const unitPrice = Number((sku.price * priceList.multiplier).toFixed(2))
      return {
        skuId: sku.id,
        quantityPacks,
        unitPrice,
        lineTotal: Number((unitPrice * quantityPacks).toFixed(2)),
      }
    })
    const availability = skuAvailability(
      lines.map((line) => this.commercialSkuRecords.find((item) => item.id === line.skuId)!),
      this.lots,
      this.materialRecords,
    )
    const primaryLine = lines[0]
    const quote: QuoteRecord = {
      id: `QTE-2026-${String(this.quoteRecords.length + 34).padStart(3, '0')}`,
      skuId: primaryLine.skuId,
      customer,
      customerGroup,
      quantityPacks: primaryLine.quantityPacks,
      unitPrice: primaryLine.unitPrice,
      total: Number(lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2)),
      currency: priceList.currency,
      status: lines.every((line) => line.quantityPacks <= (availability.find((item) => item.id === line.skuId)?.canSellPacks ?? 0)) ? 'SENT' : 'REVIEW',
      createdAt: new Date().toISOString(),
      lines,
    }
    this.quoteRecords = [quote, ...this.quoteRecords]
    const audit = this.recordAudit('commerce.quote.create', quote.id, session.userId, quote.status === 'REVIEW' ? 'review' : 'allowed')
    return {
      data: {
        quote,
        availability,
        audit,
        invariant: 'quote creation reads SKU availability from inventory and creates no reservation or movement',
      },
    }
  }

  samples() {
    return { data: this.sampleRequestRecords }
  }

  requestSample(body: CreateSampleRequestBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'commerce.manage')
    const sku = this.commercialSkuRecords.find((item) => item.id === body.skuId)
    if (!sku) {
      throw new NotFoundException(`SKU ${body.skuId ?? 'unknown'} was not found`)
    }
    const customer = body.customer?.trim()
    if (!customer) {
      throw new UnprocessableEntityException('Sample customer is required')
    }
    const packs = Math.round(Number(body.packs ?? 1))
    if (!Number.isFinite(packs) || packs <= 0 || packs > 2) {
      throw new UnprocessableEntityException('Sample packs must be between 1 and 2')
    }
    const priceList = this.priceListRecords.find((item) => item.customerGroup === sku.tier && item.status === 'ACTIVE')
    if (priceList && !priceList.sampleEligible) {
      throw new UnprocessableEntityException(`Samples are not enabled for ${sku.tier} price list`)
    }
    const availability = skuAvailability([sku], this.lots, this.materialRecords)[0]
    if (packs > availability.canSellPacks) {
      throw new UnprocessableEntityException(`Sample request exceeds available packs for ${sku.id}`)
    }

    const sample: SampleRequestRecord = {
      id: `SMP-2026-${String(this.sampleRequestRecords.length + 18).padStart(3, '0')}`,
      skuId: sku.id,
      customer,
      packs,
      status: 'REQUESTED',
      createdAt: new Date().toISOString(),
    }
    this.sampleRequestRecords = [sample, ...this.sampleRequestRecords]
    const audit = this.recordAudit('commerce.sample.request', sample.id, session.userId, 'allowed')
    return {
      data: {
        sample,
        availability,
        audit,
        invariant: 'sample request validates inventory-derived availability but does not reserve or move stock',
      },
    }
  }

  orders() {
    return { data: this.salesOrderRecords }
  }

  customers() {
    return { data: this.customerRecords }
  }

  createCustomer(body: CreateCustomerBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'orders.reserve')
    const name = body.name?.trim()
    if (!name) {
      throw new UnprocessableEntityException('Customer name is required')
    }
    const group = body.group ?? 'Studio'
    if (!['Studio', 'Lab', 'Bulk', 'Contract'].includes(group)) {
      throw new UnprocessableEntityException(`Customer group ${group} is not supported`)
    }
    const creditLimit = Number(body.creditLimit ?? 250)
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      throw new UnprocessableEntityException('Customer creditLimit must be zero or greater')
    }
    const paymentTerms = body.paymentTerms ?? 'NET_15'
    if (!['NET_15', 'NET_30', 'PREPAID'].includes(paymentTerms)) {
      throw new UnprocessableEntityException(`Payment terms ${paymentTerms} are not supported`)
    }

    const id = `CUS-${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 18).toUpperCase()}`
    const billingAddress: CustomerAddress = {
      id: `ADDR-${id}-BILL`,
      label: body.billingAddress?.label?.trim() || 'Billing',
      line1: body.billingAddress?.line1?.trim() || 'Billing address pending',
      city: body.billingAddress?.city?.trim() || 'TBD',
      country: body.billingAddress?.country?.trim().toUpperCase() || 'US',
    }
    const shippingAddress: CustomerAddress = {
      id: `ADDR-${id}-SHIP`,
      label: body.shippingAddress?.label?.trim() || 'Shipping',
      line1: body.shippingAddress?.line1?.trim() || billingAddress.line1,
      city: body.shippingAddress?.city?.trim() || billingAddress.city,
      country: body.shippingAddress?.country?.trim().toUpperCase() || billingAddress.country,
    }
    const customer: CustomerRecord = {
      id: this.customerRecords.some((record) => record.id === id) ? `${id}-${this.customerRecords.length + 1}` : id,
      name,
      group,
      creditLimit,
      paymentTerms,
      contactEmail: body.contactEmail?.trim() || `orders+${id.toLowerCase()}@example.com`,
      billingAddress,
      shippingAddress,
      status: 'ACTIVE',
    }
    this.customerRecords = [customer, ...this.customerRecords]
    const audit = this.recordAudit('orders.customer.create', customer.id, session.userId, 'allowed')
    return {
      data: {
        customer,
        audit,
        invariant: 'customer profile stores credit, terms, addresses, and contacts without touching inventory',
      },
    }
  }

  createOrder(body: CreateSalesOrderBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'orders.reserve')
    const customer = this.customerRecords.find((item) => item.id === body.customerId)
    if (!customer) {
      throw new NotFoundException(`Customer ${body.customerId ?? 'unknown'} was not found`)
    }
    const requestedLines = body.lines?.length ? body.lines : [{ skuId: body.skuId, quantity: body.quantity }]
    if (requestedLines.length === 0 || requestedLines.length > 25) {
      throw new UnprocessableEntityException('Order must contain between 1 and 25 SKU lines')
    }
    const discountPercent = Math.max(0, Math.min(90, Number(body.discountPercent ?? 0)))
    const taxPercent = Math.max(0, Math.min(30, Number(body.taxPercent ?? 0)))
    const shippingCost = Math.max(0, Number(body.shippingCost ?? 0))
    const priceList = this.priceListRecords.find(
      (item) => item.customerGroup === customer.group && item.status === 'ACTIVE',
    )
    const seenSkuIds = new Set<string>()
    const lines = requestedLines.map((line) => {
      const skuId = line.skuId?.trim()
      if (!skuId || seenSkuIds.has(skuId)) {
        throw new UnprocessableEntityException('Each order SKU line must be unique')
      }
      seenSkuIds.add(skuId)
      const sku = this.commercialSkuRecords.find((item) => item.id === skuId)
      if (!sku) {
        throw new NotFoundException(`SKU ${skuId} was not found`)
      }
      if (sku.status !== 'ACTIVE') {
        throw new UnprocessableEntityException(`SKU ${sku.id} is not active`)
      }
      const quantity = Math.round(Number(line.quantity ?? 1))
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new UnprocessableEntityException(`Order quantity for ${sku.id} must be greater than 0`)
      }
      const unitPrice = Number((sku.price * (priceList?.multiplier ?? 1)).toFixed(2))
      return { skuId: sku.id, quantity, unitPrice, lineTotal: Number((unitPrice * quantity).toFixed(2)) }
    })
    const primaryLine = lines[0]
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
    const discounted = subtotal * (1 - discountPercent / 100)
    const taxed = discounted * (1 + taxPercent / 100)
    const total = Number((taxed + shippingCost).toFixed(2))
    const order: SalesOrderRecord = {
      id: `SO-2026-${String(this.salesOrderRecords.length + 93).padStart(3, '0')}`,
      skuId: primaryLine.skuId,
      customerId: customer.id,
      customer: customer.name,
      quantity: primaryLine.quantity,
      unitPrice: primaryLine.unitPrice,
      discountPercent,
      taxPercent,
      shippingCost,
      total,
      currency: body.currency?.trim().toUpperCase() || priceList?.currency || 'USD',
      reservedGrams: 0,
      fulfilledGrams: 0,
      status: customer.status === 'CREDIT_HOLD' || total > customer.creditLimit ? 'HOLD' : 'CONFIRMED',
      reservationAllocations: [],
      documentIds: [],
      createdAt: new Date().toISOString(),
      lines,
    }
    this.salesOrderRecords = [order, ...this.salesOrderRecords]
    const audit = this.recordAudit('orders.create', order.id, session.userId, order.status === 'HOLD' ? 'review' : 'allowed')
    return {
      data: {
        order,
        audit,
        invariant: 'order creation prices SKU packs and performs credit hold checks without reserving or moving stock',
      },
    }
  }

  reserveOrder(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'orders.reserve')
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (!['DRAFT', 'CONFIRMED', 'BACKORDER'].includes(order.status)) {
      throw new UnprocessableEntityException(`Sales order ${id} cannot be reserved from ${order.status}`)
    }
    const requiredGrams = orderRequiredGrams(order, this.commercialSkuRecords)
    const orderLines = order.lines?.length
      ? order.lines
      : [{ skuId: order.skuId, quantity: order.quantity, unitPrice: order.unitPrice, lineTotal: order.unitPrice * order.quantity }]
    const allocations = orderLines.flatMap((line) => {
      const sku = this.commercialSkuRecords.find((item) => item.id === line.skuId)
      if (!sku) {
        throw new NotFoundException(`SKU ${line.skuId} was not found`)
      }
      return this.pickLotsForMaterial(sku.materialId, sku.packSizeGrams * line.quantity, session)
    })
    const lotMap = new Map(this.lotsForSession(session).map((lot) => [lot.id, { ...lot }]))
    allocations.forEach((allocation) => {
      const lot = lotMap.get(allocation.lotId)
      if (lot) {
        lot.reservedGrams += allocation.allocatedGrams
      }
    })
    this.replaceLotsForSession(session, Array.from(lotMap.values()))
    const pickList = this.createOrderDocument(id, 'PICK_LIST', 'READY')
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            reservedGrams: requiredGrams,
            status: 'RESERVED',
            reservationAllocations: allocations,
            documentIds: [...(item.documentIds ?? []), pickList.id],
          }
        : item,
    )
    this.recordAudit('orders.reserve', id, session.userId, 'allowed')
    return {
      data: {
        orderId: id,
        allocations,
        document: pickList,
        invariant: 'reservation changes reserved stock but creates no InventoryMovement',
      },
    }
  }

  cancelOrder(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'orders.reserve')
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (['FULFILLED', 'SHIPPED', 'DELIVERED', 'INVOICED', 'CLOSED'].includes(order.status)) {
      throw new UnprocessableEntityException(`Sales order ${id} cannot be cancelled from ${order.status}`)
    }
    const allocations = order.reservationAllocations ?? []
    if (allocations.length > 0) {
      const lotMap = new Map(this.lotsForSession(session).map((lot) => [lot.id, { ...lot }]))
      allocations.forEach((allocation) => {
        const lot = lotMap.get(allocation.lotId)
        if (lot) {
          lot.reservedGrams = Math.max(0, lot.reservedGrams - allocation.allocatedGrams)
        }
      })
      this.replaceLotsForSession(session, Array.from(lotMap.values()))
    }
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            reservedGrams: 0,
            status: 'CANCELLED',
            reservationAllocations: [],
          }
        : item,
    )
    const audit = this.recordAudit('orders.cancel', id, session.userId, 'allowed')
    return {
      data: {
        orderId: id,
        releasedAllocations: allocations,
        audit,
        invariant: 'cancellation releases reservation without creating InventoryMovement',
      },
    }
  }

  packOrder(id: string, body: PackOrderBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'orders.fulfill')
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (order.status !== 'RESERVED') {
      throw new UnprocessableEntityException(`Sales order ${id} must be reserved before pack`)
    }
    const allocations = order.reservationAllocations ?? []
    if (allocations.length === 0) {
      throw new UnprocessableEntityException(`Sales order ${id} has no reservation allocation trace`)
    }
    const packingSlip = this.createOrderDocument(id, 'PACKING_SLIP', 'READY')
    const shipment: ShipmentRecord = {
      id: `SHP-2026-${String(this.shipmentRecords.length + 41).padStart(3, '0')}`,
      orderId: id,
      carrier: order.carrier ?? 'DHL',
      trackingNumber: order.trackingNumber ?? 'Pending',
      status: 'PACKED',
      weightGrams: Number(body.weightGrams ?? order.reservedGrams),
      allocations,
    }
    this.shipmentRecords = [shipment, ...this.shipmentRecords]
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'PACKED',
            shipmentId: shipment.id,
            documentIds: [...(item.documentIds ?? []), packingSlip.id],
          }
        : item,
    )
    const audit = this.recordAudit('orders.pack', id, session.userId, 'allowed')
    return {
      data: {
        orderId: id,
        shipment,
        document: packingSlip,
        audit,
        invariant: 'pack creates shipment trace and packing slip without moving stock',
      },
    }
  }

  shipOrder(id: string, body: ShipOrderBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'orders.fulfill')
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (order.status !== 'PACKED') {
      throw new UnprocessableEntityException(`Sales order ${id} must be packed before ship`)
    }
    const carrier = body.carrier ?? order.carrier ?? 'DHL'
    if (!['DHL', 'FedEx', 'UPS', 'Pickup'].includes(carrier)) {
      throw new UnprocessableEntityException(`Carrier ${carrier} is not supported`)
    }
    const trackingNumber = body.trackingNumber?.trim() || `${carrier.toUpperCase()}-${id.replace(/\W/g, '')}`
    const shippedAt = new Date().toISOString()
    this.shipmentRecords = this.shipmentRecords.map((shipment) =>
      shipment.id === order.shipmentId
        ? {
            ...shipment,
            carrier,
            trackingNumber,
            status: 'SHIPPED',
            shippedAt,
          }
        : shipment,
    )
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'SHIPPED',
            carrier,
            trackingNumber,
          }
        : item,
    )
    const audit = this.recordAudit('orders.ship', id, session.userId, 'allowed')
    return {
      data: {
        orderId: id,
        shipment: this.shipmentRecords.find((shipment) => shipment.id === order.shipmentId),
        audit,
        invariant: 'shipment records carrier and tracking while reserved stock remains untouched until fulfillment',
      },
    }
  }

  fulfillOrder(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'orders.fulfill')
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (!['RESERVED', 'PACKED', 'SHIPPED'].includes(order.status)) {
      throw new UnprocessableEntityException(`Sales order ${id} must be reserved before fulfillment`)
    }
    const allocations =
      order.reservationAllocations && order.reservationAllocations.length > 0
        ? order.reservationAllocations
        : (() => {
            const orderLines = order.lines?.length
              ? order.lines
              : [{ skuId: order.skuId, quantity: order.quantity, unitPrice: order.unitPrice, lineTotal: order.unitPrice * order.quantity }]
            return orderLines.flatMap((line) => {
              const sku = this.commercialSkuRecords.find((item) => item.id === line.skuId)
              if (!sku) {
                throw new NotFoundException(`SKU ${line.skuId} was not found`)
              }
              return this.pickLotsForMaterial(sku.materialId, sku.packSizeGrams * line.quantity, session, true)
            })
          })()
    const lotMap = new Map(this.lotsForSession(session).map((lot) => [lot.id, { ...lot }]))
    const movements: InventoryMovement[] = allocations.map((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        throw new NotFoundException(`Lot ${allocation.lotId} was not found`)
      }
      if (lot.reservedGrams + 0.0001 < allocation.allocatedGrams) {
        throw new UnprocessableEntityException(`Lot ${allocation.lotNumber} reservation is below fulfillment allocation`)
      }
      lot.quantityGrams = Math.max(0, lot.quantityGrams - allocation.allocatedGrams)
      lot.reservedGrams = Math.max(0, lot.reservedGrams - allocation.allocatedGrams)
      return {
        id: `MOV-FUL-${id}-${index + 1}`,
        at: new Date().toISOString(),
        type: 'FULFILLMENT',
        direction: 'OUT',
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: allocation.allocatedGrams,
        balanceAfter: lot.quantityGrams,
        ref: id,
        actor: session.userId,
      }
    })
    this.replaceLotsForSession(session, Array.from(lotMap.values()))
    this.movements = [...movements, ...this.movements]
    const invoice = this.createOrderDocument(id, 'INVOICE', 'READY')
    const coa = this.createOrderDocument(id, 'COA', 'READY')
    if (order.shipmentId) {
      this.shipmentRecords = this.shipmentRecords.map((shipment) =>
        shipment.id === order.shipmentId
          ? {
              ...shipment,
              status: 'SHIPPED',
              shippedAt: shipment.shippedAt ?? new Date().toISOString(),
              allocations,
            }
          : shipment,
      )
    }
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id
        ? {
            ...item,
            fulfilledGrams: order.reservedGrams,
            reservedGrams: 0,
            status: 'FULFILLED',
            reservationAllocations: allocations,
            documentIds: [...(item.documentIds ?? []), invoice.id, coa.id],
          }
        : item,
    )
    this.recordAudit('orders.fulfill', id, session.userId, 'allowed')
    return {
      data: {
        orderId: id,
        movements,
        documents: [invoice, coa],
        shipment: order.shipmentId ? this.shipmentRecords.find((shipment) => shipment.id === order.shipmentId) : undefined,
        invariant: 'fulfillment creates OUT movement after reservation and preserves lot traceability on shipment',
      },
    }
  }

  shipments() {
    return { data: this.shipmentRecords }
  }

  orderDocuments() {
    return { data: this.orderDocumentRecords }
  }

  costingOverview() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'costing.view')
    const formulas = this.formulaCatalogForSession(session)
    const formula = formulas.find((item) => item.id === 'frm-0421') ?? formulas[0]
    if (!formula) {
      throw new NotFoundException('No formula is available in this workspace')
    }
    return {
      data: costingOverview(
        formula.id,
        this.lots,
        this.movements,
        formulas,
        this.materialRecords,
        this.commercialSkuRecords,
        this.priceHistoryRecords,
      ),
    }
  }

  costingFormula(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'costing.view')
    const formula = this.formulaForSession(id, session)
    const formulas = this.formulaCatalogForSession(session)
    return {
      data: formulaCostReport(formula.id, formulas, this.materialRecords, this.lots, this.priceHistoryRecords),
    }
  }

  costingBatch(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'costing.view')
    const batch = this.productionBatchRecords.find((item) => item.id === id)
    if (!batch) {
      throw new NotFoundException(`Production batch ${id} was not found`)
    }
    if (batch.status !== 'RELEASED' || !batch.outputLot) {
      throw new UnprocessableEntityException(`Production batch ${id} must be released before a finished-product cost sheet is available`)
    }
    this.formulaForSession(batch.formulaId, session)
    const formulas = this.formulaCatalogForSession(session)
    return {
      data: batchCostReport(
        id,
        this.productionBatchRecords,
        formulas,
        this.materialRecords,
        this.lots,
        this.priceHistoryRecords,
        this.movements,
      ),
    }
  }

  compareSupplierRfq(body: RfqComparisonBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'procurement.view')
    const comparison = this.buildRfqComparison(body, session)
    const audit = this.recordAudit('procurement.rfq.compare', comparison.materialId, session.userId, 'review')
    return { data: { ...comparison, audit } }
  }

  awardSupplierRfq(body: RfqAwardBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'procurement.manage')
    const comparison = this.buildRfqComparison(body, session)
    const supplierId = body.supplierId?.trim() || comparison.recommendedSupplierId
    const option = comparison.options.find((item) => item.supplierId === supplierId)
    if (!option) {
      throw new UnprocessableEntityException('Select a supplier returned by the RFQ comparison before awarding')
    }
    const unitCost = Number(body.unitCost ?? option.unitCost)
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new UnprocessableEntityException('Awarded RFQ unitCost must be greater than 0')
    }
    const created = this.createPurchaseOrder({
      supplierId: option.supplierId,
      materialId: comparison.materialId,
      quantityGrams: comparison.quantityGrams,
      unitCost,
      currency: body.currency?.trim().toUpperCase() || option.currency,
      expectedDate: body.expectedDate,
    }).data
    const audit = this.recordAudit('procurement.rfq.award', created.purchaseOrder.id, session.userId, 'allowed')
    return {
      data: {
        purchaseOrder: created.purchaseOrder,
        option,
        audit,
        invariant: 'awarding an RFQ creates only a PO draft; inventory changes exclusively through goods receipt',
      },
    }
  }

  costingSku(id: string) {
    const report = skuMarginReports(
      this.commercialSkuRecords,
      this.materialRecords,
      this.lots,
      this.priceHistoryRecords,
    ).find((item) => item.skuId === id)
    if (!report) {
      throw new NotFoundException(`SKU ${id} was not found`)
    }
    return { data: report }
  }

  costingValuation() {
    return { data: inventoryValuationReport(this.lots, this.materialRecords, this.priceHistoryRecords) }
  }

  analyticsDashboard() {
    return {
      data: analyticsDashboardReport(
        this.lots,
        this.movements,
        this.materialRecords,
        this.priceHistoryRecords,
        this.scheduledReportRecords,
      ),
    }
  }

  analyticsBurnRate() {
    return { data: analyticsBurnRate(this.movements, this.materialRecords) }
  }

  analyticsLowStockForecast() {
    return { data: lowStockForecast(this.lots, this.movements, this.materialRecords) }
  }

  analyticsExpiryRisk() {
    return { data: expiryRisk(this.lots, this.materialRecords) }
  }

  analyticsCostRanking() {
    return { data: costRanking(this.movements, this.lots, this.materialRecords, this.priceHistoryRecords) }
  }

  analyticsInventory() {
    return { data: inventoryAnalytics(this.lots, this.movements, this.materialRecords, this.priceHistoryRecords) }
  }

  analyticsReports() {
    return { data: this.scheduledReportRecords }
  }

  runAnalyticsReport(id: string) {
    const report = this.scheduledReportRecords.find((item) => item.id === id)
    if (!report) {
      throw new NotFoundException(`Scheduled report ${id} was not found`)
    }
    const nextReport: ScheduledReportRecord = {
      ...report,
      lastRunAt: new Date().toISOString(),
    }
    this.scheduledReportRecords = this.scheduledReportRecords.map((item) =>
      item.id === id ? nextReport : item,
    )
    const audit = this.recordAudit('analytics.report.run', id, 'api:insights', 'allowed')
    return {
      data: {
        report: nextReport,
        audit,
        invariant: 'scheduled analytics report run updates report evidence only and does not mutate inventory or orders',
      },
    }
  }

  globalSearch(query = '') {
    const session = this.currentSession()
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery.length < 2) {
      return { data: { query: query.trim(), results: [] satisfies GlobalSearchResult[] } }
    }

    const matches = (values: Array<string | undefined>) =>
      values.some((value) => value?.toLowerCase().includes(normalizedQuery))
    const results: GlobalSearchResult[] = []
    const canView = (permission: string) => this.permissionDecision(session.role, permission).allowed

    if (canView('materials.view')) {
      this.materialRecords
        .filter((material) => (material.organizationId || 'org-nxl') === session.organizationId)
        .filter((material) => matches([material.name, material.cas, material.family, ...material.odor]))
        .forEach((material) => results.push({
          id: material.id,
          kind: 'material',
          title: material.name,
          subtitle: `${material.cas} / ${material.family}`,
          href: '/materials',
        }))
    }
    if (canView('formulas.view')) {
      this.formulaCatalogForSession(session)
        .filter((formula) => matches([formula.name, formula.code, formula.project, formula.collection, ...formula.tags]))
        .forEach((formula) => results.push({
          id: formula.id,
          kind: 'formula',
          title: formula.name,
          subtitle: `${formula.code} / ${formula.workflowStatus}`,
          href: '/formulas',
        }))
    }
    if (canView('inventory.view')) {
      this.lotsForSession(session)
        .filter((lot) => matches([lot.lotNumber, lot.location, lot.supplierLotRef]))
        .forEach((lot) => results.push({
          id: lot.id,
          kind: 'lot',
          title: lot.lotNumber,
          subtitle: `${lot.location} / ${lot.qualityStatus}`,
          href: '/inventory',
        }))
    }
    if (canView('documents.view')) {
      this.documentRecords
        .filter((document) => matches([document.title, document.type, document.linkedTo]))
        .forEach((document) => results.push({
          id: document.id,
          kind: 'document',
          title: document.title,
          subtitle: `${document.type} / ${document.status}`,
          href: '/inventory',
        }))
    }
    if (canView('procurement.view')) {
      this.supplierRecords
        .filter((supplier) => matches([supplier.name, supplier.id, supplier.contactEmail]))
        .forEach((supplier) => results.push({
          id: supplier.id,
          kind: 'supplier',
          title: supplier.name,
          subtitle: `${supplier.country} / ${supplier.status}`,
          href: '/procurement',
        }))
    }

    return { data: { query: query.trim(), results: results.slice(0, 40) } }
  }

  notifications() {
    const session = this.currentSession()
    const notifications = this.notificationRecords
      .filter((item) => item.organizationId === session.organizationId && item.recipientEmail === session.email)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    return {
      data: {
        notifications,
        unreadCount: notifications.filter((item) => !item.readAt).length,
        invariant: 'notification inbox is scoped to the authenticated member and never exposes another workspace activity',
      },
    }
  }

  refreshOperationalNotifications() {
    const session = this.currentSession()
    if (!this.permissionDecision(session.role, 'inventory.view').allowed) {
      return { data: { created: 0, invariant: 'inventory alerts are not generated for roles without inventory visibility' } }
    }
    const now = new Date()
    const since = now.getTime() - 24 * 60 * 60 * 1000
    const recipient = session.email.toLowerCase()
    const shouldEmail = this.settingsForSession(session).emailDigest !== 'off'
    const isRecent = (key: string) => this.notificationRecords.some((notification) =>
      notification.organizationId === session.organizationId &&
      notification.recipientEmail === recipient &&
      notification.href === `/inventory#${key}` &&
      new Date(notification.createdAt).getTime() >= since,
    )
    let created = 0
    this.inventoryReorderSuggestions().data.suggestions.slice(0, 10).forEach((suggestion) => {
      const key = `low-stock-${suggestion.materialId}`
      if (isRecent(key)) return
      this.queueNotification(
        session.organizationId,
        recipient,
        'inventory',
        `Low stock: ${suggestion.materialName}`,
        suggestion.reason,
        `/inventory#${key}`,
        shouldEmail,
      )
      created += 1
    })
    expiryRisk(this.lotsForSession(session), this.materialRecords, now.toISOString().slice(0, 10))
      .filter((risk) => risk.status === 'HIGH')
      .slice(0, 10)
      .forEach((risk) => {
        const key = `expiry-${risk.lotId}`
        if (isRecent(key)) return
        this.queueNotification(
          session.organizationId,
          recipient,
          'inventory',
          `Expiry attention: ${risk.materialName}`,
          `${risk.lotNumber} expires in ${risk.daysUntilExpiry} day(s); ${formatGrams(risk.gramsAtRisk)} is at risk.`,
          `/inventory#${key}`,
          shouldEmail,
        )
        created += 1
      })
    const audit = this.recordAudit('notification.operational.refresh', session.organizationId, session.userId, 'allowed')
    return {
      data: {
        created,
        audit,
        invariant: 'low-stock and expiry alerts are tenant-scoped, deduplicated for 24 hours, and never change inventory',
      },
    }
  }

  markNotificationRead(id: string) {
    const session = this.currentSession()
    const notification = this.notificationRecords.find(
      (item) => item.id === id && item.organizationId === session.organizationId && item.recipientEmail === session.email,
    )
    if (!notification) {
      throw new NotFoundException(`Notification ${id} was not found`)
    }
    const readAt = notification.readAt || new Date().toISOString()
    this.notificationRecords = this.notificationRecords.map((item) => item.id === id ? { ...item, readAt } : item)
    return { data: { notification: { ...notification, readAt }, audit: this.recordAudit('notification.read', id, session.userId, 'allowed') } }
  }

  markAllNotificationsRead() {
    const session = this.currentSession()
    const readAt = new Date().toISOString()
    let updated = 0
    this.notificationRecords = this.notificationRecords.map((item) => {
      if (item.organizationId === session.organizationId && item.recipientEmail === session.email && !item.readAt) {
        updated += 1
        return { ...item, readAt }
      }
      return item
    })
    return { data: { updated, audit: this.recordAudit('notification.readAll', session.userId, session.userId, 'allowed') } }
  }

  notificationEmailOutbox(limit = 10) {
    return this.notificationRecords
      .filter((item) => item.emailStatus === 'queued')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, Math.max(1, Math.min(limit, 25)))
  }

  setNotificationEmailStatus(id: string, status: 'sent' | 'failed', error?: string) {
    this.notificationRecords = this.notificationRecords.map((item) =>
      item.id === id
        ? { ...item, emailStatus: status, emailError: error?.slice(0, 180) }
        : item,
    )
  }

  legalStatus() {
    const session = this.currentSession()
    const records = this.legalAcceptanceRecords
      .filter((item) => item.organizationId === session.organizationId && item.userId === session.userId)
      .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))
    return {
      data: {
        currentVersions: { terms: '2026-07-22', privacy: '2026-07-22', cookies: '2026-07-22' },
        acceptances: records,
        invariant: 'legal consent is versioned, user-scoped, and auditable rather than inferred from browser state',
      },
    }
  }

  acceptLegal(body: { document?: LegalDocumentKind; version?: string } = {}) {
    const session = this.currentSession()
    const document = body.document
    if (document !== 'terms' && document !== 'privacy' && document !== 'cookies') {
      throw new UnprocessableEntityException('A legal document type is required')
    }
    const version = body.version?.trim().slice(0, 32) || '2026-07-22'
    const existing = this.legalAcceptanceRecords.find(
      (item) => item.organizationId === session.organizationId && item.userId === session.userId && item.document === document && item.version === version,
    )
    if (existing) {
      return { data: { acceptance: existing, idempotent: true } }
    }
    const acceptance: LegalAcceptanceRecord = {
      id: `LEGAL-${this.shortId()}`,
      organizationId: session.organizationId,
      userId: session.userId,
      email: session.email,
      document,
      version,
      acceptedAt: new Date().toISOString(),
    }
    this.legalAcceptanceRecords = [acceptance, ...this.legalAcceptanceRecords]
    const audit = this.recordAudit(`legal.${document}.accept`, version, session.userId, 'allowed')
    return { data: { acceptance, audit, idempotent: false } }
  }

  privacyRequests() {
    const session = this.currentSession()
    const mayManage = this.permissionDecision(session.role, 'platform.view').allowed
    const requests = this.privacyRequestRecords.filter((item) =>
      item.organizationId === session.organizationId && (mayManage || item.requestedBy === session.userId),
    )
    return { data: { requests } }
  }

  requestPrivacyData(body: { type?: 'EXPORT' | 'ERASURE' } = {}) {
    const session = this.currentSession()
    const type = body.type === 'ERASURE' ? 'ERASURE' : 'EXPORT'
    const existing = this.privacyRequestRecords.find(
      (item) => item.organizationId === session.organizationId && item.requestedBy === session.userId && item.type === type && item.status === 'REQUESTED',
    )
    if (existing) {
      return { data: { request: existing, idempotent: true } }
    }
    const request: PrivacyRequestRecord = {
      id: `DSR-${this.shortId()}`,
      organizationId: session.organizationId,
      requestedBy: session.userId,
      subjectEmail: session.email,
      type,
      status: 'REQUESTED',
      createdAt: new Date().toISOString(),
    }
    this.privacyRequestRecords = [request, ...this.privacyRequestRecords]
    this.queueNotification(session.organizationId, session.email, 'system', `${type === 'EXPORT' ? 'Data export' : 'Account erasure'} request received`, 'Your privacy request is queued for review.', '/settings', false)
    const audit = this.recordAudit(`privacy.${type.toLowerCase()}.request`, request.id, session.userId, 'review')
    return { data: { request, audit, idempotent: false } }
  }

  exportPrivacyData(id: string) {
    const session = this.currentSession()
    const mayManage = this.permissionDecision(session.role, 'platform.view').allowed
    const request = this.privacyRequestRecords.find((item) =>
      item.id === id && item.organizationId === session.organizationId && (item.requestedBy === session.userId || mayManage),
    )
    if (!request || request.type !== 'EXPORT') {
      throw new NotFoundException(`Privacy export ${id} was not found`)
    }
    const completedAt = new Date().toISOString()
    const completed = { ...request, status: 'COMPLETED' as const, completedAt }
    this.privacyRequestRecords = this.privacyRequestRecords.map((item) => item.id === id ? completed : item)
    const membership = this.membershipRecords.find((item) =>
      item.organizationId === request.organizationId && item.userId === request.requestedBy,
    )
    const exportData = {
      generatedAt: completedAt,
      subject: {
        email: request.subjectEmail,
        membership: membership
          ? {
            name: membership.name,
            role: membership.role,
            status: membership.status,
            lastActiveAt: membership.lastActiveAt,
          }
          : null,
      },
      userSettings: this.userSettingsRecords.filter((item) => item.organizationId === request.organizationId && item.userId === request.requestedBy),
      legalAcceptances: this.legalAcceptanceRecords.filter((item) => item.organizationId === request.organizationId && item.userId === request.requestedBy),
      notifications: this.notificationRecords.filter((item) => item.organizationId === request.organizationId && item.recipientEmail === request.subjectEmail),
      sessions: this.sessions
        .filter((item) => item.organizationId === request.organizationId && item.userId === request.requestedBy)
        .map((item) => this.exposeSession(item)),
    }
    const audit = this.recordAudit('privacy.export.generate', id, session.userId, 'allowed')
    return {
      data: {
        request: completed,
        export: exportData,
        audit,
        invariant: 'privacy export contains only the requested subject data in the current workspace and excludes passwords, tokens, MFA secrets, and other members',
      },
    }
  }

  previewImport(body: {
    entity?: 'materials' | 'lots'
    fileName?: string
    idempotencyKey?: string
    rows?: Array<Record<string, unknown>>
  } = {}) {
    const session = this.currentSession()
    const entity = body.entity === 'lots' ? 'lots' : 'materials'
    this.requirePermission(session.role, entity === 'materials' ? 'materials.create' : 'inventory.receive')
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500).map((row) => ({ ...row })) : []
    if (rows.length === 0) {
      throw new UnprocessableEntityException('Import must contain at least one mapped row')
    }
    if ((body.rows?.length ?? 0) > 500) {
      throw new UnprocessableEntityException('Import is limited to 500 rows per job')
    }
    const fileName = body.fileName?.trim().slice(0, 160) || `${entity}.csv`
    const idempotencyKey = body.idempotencyKey?.trim().slice(0, 160) || this.importChecksum(entity, rows)
    const existing = this.importJobRecords.find(
      (item) => item.organizationId === session.organizationId && item.idempotencyKey === idempotencyKey,
    )
    if (existing) {
      return { data: { job: existing, idempotent: true } }
    }
    const errors = entity === 'materials'
      ? this.materialImportIssues(rows, session.organizationId)
      : this.lotImportIssues(rows, session)
    const invalidRows = new Set(errors.map((issue) => issue.row)).size
    const now = new Date().toISOString()
    const job: DataImportJobRecord = {
      id: `IMP-${this.shortId()}`,
      organizationId: session.organizationId,
      requestedBy: session.userId,
      entity,
      fileName,
      idempotencyKey,
      status: errors.length > 0 ? 'DRAFT' : 'VALIDATED',
      totalRows: rows.length,
      validRows: rows.length - invalidRows,
      invalidRows,
      errors,
      rows,
      createdAt: now,
    }
    this.importJobRecords = [job, ...this.importJobRecords]
    const audit = this.recordAudit('import.preview', `${entity}:${job.id}`, session.userId, errors.length ? 'review' : 'allowed')
    return { data: { job, audit, idempotent: false } }
  }

  commitImport(id: string) {
    const session = this.currentSession()
    const job = this.importJobRecords.find((item) => item.id === id && item.organizationId === session.organizationId)
    if (!job) {
      throw new NotFoundException(`Import job ${id} was not found`)
    }
    this.requirePermission(session.role, job.entity === 'materials' ? 'materials.create' : 'inventory.receive')
    if (job.status === 'COMPLETED') {
      return { data: { job, created: 0, idempotent: true } }
    }
    const errors = job.entity === 'materials'
      ? this.materialImportIssues(job.rows, session.organizationId)
      : this.lotImportIssues(job.rows, session)
    if (errors.length > 0) {
      const failed = { ...job, status: 'FAILED' as const, errors, invalidRows: new Set(errors.map((issue) => issue.row)).size }
      this.upsertImportJob(failed)
      throw new UnprocessableEntityException({ message: 'Import data changed since preview', errors })
    }
    let created = 0
    for (const row of job.rows) {
      if (job.entity === 'materials') {
        this.createMaterial({
          name: this.importString(row.name),
          cas: this.importString(row.cas),
          family: this.importString(row.family),
          tier: this.importTier(row.tier),
          ifraLimit: this.importNumber(row.ifraLimit, 100),
          costPerGram: this.importNumber(row.costPerGram, 0.05),
          odor: this.importString(row.odor).split(',').map((value) => value.trim()).filter(Boolean),
          source: `Import ${job.fileName}`,
          version: 'import-v1',
        })
      } else {
        const material = this.importMaterialForLot(row, session.organizationId)
        if (!material) {
          throw new UnprocessableEntityException('Imported lot material could not be matched')
        }
        this.receiveInventoryReceipt({
          materialId: material.id,
          lotNumber: this.importString(row.lotNumber),
          quantityGrams: this.importNumber(row.quantityGrams, 0),
          expiryDate: this.importString(row.expiryDate),
          location: this.importString(row.location) || 'Lab A',
          qualityStatus: this.importLotQualityStatus(row.qualityStatus),
          supplierLotRef: this.importString(row.supplierLotRef),
        })
      }
      created += 1
    }
    const completed = { ...job, status: 'COMPLETED' as const, committedAt: new Date().toISOString() }
    this.upsertImportJob(completed)
    this.queueNotification(session.organizationId, session.email, 'workspace', `${created} ${job.entity} imported`, `${job.fileName} was committed without duplicate rows.`, job.entity === 'materials' ? '/materials' : '/inventory', false)
    const audit = this.recordAudit('import.commit', `${job.entity}:${job.id}`, session.userId, 'allowed')
    return { data: { job: completed, created, audit, idempotent: false } }
  }

  private queueNotification(
    organizationId: string,
    recipientEmail: string,
    category: AppNotificationRecord['category'],
    title: string,
    body: string,
    href?: string,
    shouldEmail = true,
  ) {
    const notification: AppNotificationRecord = {
      id: `NTF-${this.shortId()}`,
      organizationId,
      recipientEmail: recipientEmail.toLowerCase(),
      category,
      title: title.slice(0, 140),
      body: body.slice(0, 500),
      href,
      createdAt: new Date().toISOString(),
      emailStatus: shouldEmail ? 'queued' : 'in_app',
    }
    this.notificationRecords = [notification, ...this.notificationRecords]
    return notification
  }

  private materialImportIssues(rows: Array<Record<string, unknown>>, organizationId: string) {
    const errors: DataImportIssue[] = []
    const seenCas = new Set<string>()
    rows.forEach((row, index) => {
      const line = index + 2
      const name = this.importString(row.name)
      const cas = this.importString(row.cas)
      if (!name) errors.push({ row: line, field: 'name', message: 'Material name is required' })
      if (!cas || !/^[0-9-]+$/.test(cas)) errors.push({ row: line, field: 'cas', message: 'CAS must contain digits and hyphens' })
      const normalizedCas = cas.toLowerCase()
      if (normalizedCas && seenCas.has(normalizedCas)) errors.push({ row: line, field: 'cas', message: 'CAS is duplicated in this file' })
      seenCas.add(normalizedCas)
      if (this.materialRecords.some((material) => (material.organizationId || 'org-nxl') === organizationId && material.cas.toLowerCase() === normalizedCas)) {
        errors.push({ row: line, field: 'cas', message: 'CAS already exists in this workspace' })
      }
      if (this.importNumber(row.costPerGram, -1) < 0) errors.push({ row: line, field: 'costPerGram', message: 'Cost per gram cannot be negative' })
      if (this.importNumber(row.ifraLimit, 100) < 0 || this.importNumber(row.ifraLimit, 100) > 100) errors.push({ row: line, field: 'ifraLimit', message: 'IFRA limit must be between 0 and 100' })
    })
    return errors
  }

  private lotImportIssues(rows: Array<Record<string, unknown>>, session: AuthSession) {
    const errors: DataImportIssue[] = []
    const seenLots = new Set<string>()
    rows.forEach((row, index) => {
      const line = index + 2
      const lotNumber = this.importString(row.lotNumber)
      if (!lotNumber) errors.push({ row: line, field: 'lotNumber', message: 'Lot number is required' })
      if (lotNumber && seenLots.has(lotNumber.toLowerCase())) errors.push({ row: line, field: 'lotNumber', message: 'Lot number is duplicated in this file' })
      seenLots.add(lotNumber.toLowerCase())
      if (this.lotsForSession(session).some((lot) => lot.lotNumber.toLowerCase() === lotNumber.toLowerCase())) errors.push({ row: line, field: 'lotNumber', message: 'Lot number already exists in this workspace' })
      if (!this.importMaterialForLot(row, session.organizationId, false)) errors.push({ row: line, field: 'material', message: 'Material ID, CAS, or name could not be matched' })
      if (this.importNumber(row.quantityGrams, 0) <= 0) errors.push({ row: line, field: 'quantityGrams', message: 'Quantity grams must be greater than 0' })
      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.importString(row.expiryDate))) errors.push({ row: line, field: 'expiryDate', message: 'Expiry date must use YYYY-MM-DD' })
    })
    return errors
  }

  private importMaterialForLot(row: Record<string, unknown>, organizationId: string, throwIfMissing = true) {
    const materialId = this.importString(row.materialId)
    const materialCas = this.importString(row.materialCas || row.cas)
    const materialName = this.importString(row.materialName || row.material)
    const material = this.materialRecords.find((candidate) =>
      (candidate.organizationId || 'org-nxl') === organizationId &&
      (candidate.id === materialId || candidate.cas.toLowerCase() === materialCas.toLowerCase() || candidate.name.toLowerCase() === materialName.toLowerCase()),
    )
    if (!material && throwIfMissing) throw new UnprocessableEntityException('Imported lot material could not be matched')
    return material
  }

  private importString(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
  }

  private importNumber(value: unknown, fallback: number) {
    const number = Number(value)
    return Number.isFinite(number) ? number : fallback
  }

  private importTier(value: unknown): Material['tier'] {
    return value === 'Top' || value === 'Heart' || value === 'Base' ? value : 'Base'
  }

  private importLotQualityStatus(value: unknown): LotQualityStatus {
    return value === 'QUARANTINE' || value === 'REJECTED' || value === 'APPROVED' ? value : 'QUARANTINE'
  }

  private importChecksum(entity: string, rows: Array<Record<string, unknown>>) {
    return createHash('sha256').update(JSON.stringify({ entity, rows })).digest('hex')
  }

  private upsertImportJob(job: DataImportJobRecord) {
    this.importJobRecords = [job, ...this.importJobRecords.filter((item) => item.id !== job.id)]
  }

  billingPlan() {
    return { data: this.planForSubscription(this.currentSubscription()) }
  }

  billingPlans() {
    return { data: billingPlans }
  }

  billingConsole(): { data: BillingConsoleResponse } {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const subscription = this.currentSubscription()
    const plan = this.planForSubscription(subscription)
    const usage = this.billingUsageRecord(subscription)
    const limitChecks = this.billingLimitChecks(usage, plan)
    const invoices = this.invoicesForSubscription(subscription.id)
    return {
      data: {
        plans: billingPlans,
        plan,
        subscription,
        usage,
        limitChecks,
        invoices,
        sso: this.publicSsoConfig(this.ssoConfigForOrganization(subscription.organizationId)),
        apiKeys: this.publicApiKeysForOrganization(subscription.organizationId),
        webhooks: this.webhooksForOrganization(subscription.organizationId),
        webhookDeliveries: this.webhookDeliveriesForOrganization(subscription.organizationId),
        auditExports: this.auditExportsForOrganization(subscription.organizationId),
        readiness: this.commercialReadinessChecks(limitChecks, subscription, invoices),
        invariant: 'subscription status and plan limits are enforced server-side before commercial writes',
      },
    }
  }

  billingSubscription() {
    return { data: this.currentSubscription() }
  }

  billingUsage() {
    return { data: this.billingUsageRecord(this.currentSubscription()) }
  }

  billingInvoices() {
    const subscription = this.currentSubscription()
    return { data: this.invoicesForSubscription(subscription.id) }
  }

  stripeCheckoutContext(body: { planId?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const subscription = this.currentSubscription()
    const plan = this.billingPlanForId(body.planId?.trim() || subscription.planId)
    if (plan.monthlyPrice <= 0) {
      throw new UnprocessableEntityException('Free plans do not require Stripe checkout')
    }
    const organization = this.organizationRecords.find((item) => item.id === session.organizationId)
    const audit = this.recordAudit('billing.stripe.checkout.start', plan.id, session.userId, 'allowed')
    return {
      data: {
        subscription,
        plan,
        organizationId: session.organizationId,
        organizationName: organization?.name || session.organizationId,
        customerEmail: session.email,
        audit,
      },
    }
  }

  stripePortalContext() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const subscription = this.currentSubscription()
    if (!subscription.providerCustomerId) {
      throw new UnprocessableEntityException('A Stripe customer is required before opening the billing portal')
    }
    const audit = this.recordAudit('billing.stripe.portal.open', subscription.id, session.userId, 'allowed')
    return { data: { subscription, audit } }
  }

  cloudflareSaasProvisioningContext(body: { hostname?: string } = {}) {
    const session = this.currentSession()
    if (session.role !== 'Owner' && session.role !== 'Admin') {
      throw new ForbiddenException('Only workspace owners and admins can provision a custom domain')
    }
    const hostname = this.normalizeDomain(body.hostname, '')
    if (!hostname) {
      throw new UnprocessableEntityException('Custom domain hostname is required')
    }
    const collision = this.organizationRecords.find(
      (organization) => organization.customDomain?.toLowerCase() === hostname && organization.id !== session.organizationId,
    ) || this.customDomainRecords.find(
      (domain) => domain.hostname.toLowerCase() === hostname && domain.organizationId !== session.organizationId,
    )
    if (collision) {
      throw new UnprocessableEntityException('Custom domain is already assigned to another workspace')
    }
    return { data: { hostname, organizationId: session.organizationId, requestedBy: session.userId } }
  }

  completeCloudflareSaasProvisioning(hostname: string, providerId: string, validation: Record<string, string>) {
    const session = this.currentSession()
    if (session.role !== 'Owner' && session.role !== 'Admin') {
      throw new ForbiddenException('Only workspace owners and admins can provision a custom domain')
    }
    const organization = this.organizationRecords.find((item) => item.id === session.organizationId)
    if (!organization) {
      throw new NotFoundException('Workspace organization was not found')
    }
    const now = new Date().toISOString()
    const existing = this.customDomainRecords.find(
      (domain) => domain.organizationId === session.organizationId && domain.providerId === providerId,
    )
    const domain: SaasCustomDomainRecord = {
      id: existing?.id ?? `DOM-${this.shortId()}`,
      organizationId: session.organizationId,
      hostname,
      providerId,
      status: 'pending_validation',
      providerStatus: 'pending',
      validation,
      verificationErrors: [],
      requestedBy: session.userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.customDomainRecords = [domain, ...this.customDomainRecords.filter((item) => item.id !== domain.id)]
    this.queueNotification(
      session.organizationId,
      session.email,
      'workspace',
      'Custom domain provisioning started',
      `Cloudflare accepted ${hostname}. Complete DNS validation before the hostname becomes active.`,
      '/customization',
    )
    const audit = this.recordAudit('saas.customDomain.provision', `${hostname}:${providerId}`, session.userId, 'review')
    return {
      data: {
        organization,
        domain,
        audit,
        invariant: 'the workspace domain changes only after Cloudflare reports the hostname active',
      },
    }
  }

  customDomains() {
    const session = this.currentSession()
    if (session.role !== 'Owner' && session.role !== 'Admin') {
      throw new ForbiddenException('Only workspace owners and admins can view custom domain provisioning')
    }
    return {
      data: {
        domains: this.customDomainRecords
          .filter((domain) => domain.organizationId === session.organizationId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      },
    }
  }

  cloudflareSaasRefreshContext(id: string) {
    const session = this.currentSession()
    if (session.role !== 'Owner' && session.role !== 'Admin') {
      throw new ForbiddenException('Only workspace owners and admins can refresh custom domain provisioning')
    }
    const domain = this.customDomainRecords.find((candidate) => candidate.id === id && candidate.organizationId === session.organizationId)
    if (!domain) {
      throw new NotFoundException(`Custom domain ${id} was not found`)
    }
    return { data: { domain } }
  }

  applyCloudflareSaasRefresh(id: string, provider: {
    providerStatus?: string
    sslStatus?: string
    validation?: Record<string, string>
    verificationErrors?: string[]
  }) {
    const session = this.currentSession()
    if (session.role !== 'Owner' && session.role !== 'Admin') {
      throw new ForbiddenException('Only workspace owners and admins can refresh custom domain provisioning')
    }
    const existing = this.customDomainRecords.find((candidate) => candidate.id === id && candidate.organizationId === session.organizationId)
    if (!existing) {
      throw new NotFoundException(`Custom domain ${id} was not found`)
    }
    const now = new Date().toISOString()
    const status = this.cloudflareDomainStatus(provider.providerStatus, provider.sslStatus, provider.verificationErrors)
    const domain: SaasCustomDomainRecord = {
      ...existing,
      status,
      providerStatus: provider.providerStatus || existing.providerStatus,
      sslStatus: provider.sslStatus || existing.sslStatus,
      validation: Object.keys(provider.validation ?? {}).length > 0 ? provider.validation ?? {} : existing.validation,
      verificationErrors: provider.verificationErrors ?? [],
      updatedAt: now,
      lastCheckedAt: now,
      activatedAt: status === 'active' ? existing.activatedAt ?? now : existing.activatedAt,
    }
    this.customDomainRecords = [domain, ...this.customDomainRecords.filter((candidate) => candidate.id !== domain.id)]
    let organization = this.organizationRecords.find((candidate) => candidate.id === session.organizationId)
    if (!organization) {
      throw new NotFoundException('Workspace organization was not found')
    }
    if (status === 'active' && organization.customDomain !== domain.hostname) {
      organization = { ...organization, customDomain: domain.hostname }
      this.organizationRecords = [organization, ...this.organizationRecords.filter((candidate) => candidate.id !== organization?.id)]
      this.queueNotification(
        session.organizationId,
        session.email,
        'workspace',
        'Custom domain is active',
        `${domain.hostname} is validated by Cloudflare and is now the workspace hostname.`,
        '/customization',
      )
    }
    const audit = this.recordAudit('saas.customDomain.refresh', `${domain.hostname}:${domain.providerId}:${status}`, session.userId, status === 'failed' ? 'review' : 'allowed')
    return { data: { domain, organization, audit } }
  }

  private cloudflareDomainStatus(providerStatus?: string, sslStatus?: string, verificationErrors: string[] = []): SaasCustomDomainRecord['status'] {
    if (providerStatus === 'active' && (!sslStatus || sslStatus === 'active')) {
      return 'active'
    }
    const terminalFailure = new Set(['blocked', 'deleted', 'expired', 'test_failed', 'validation_timed_out', 'issuance_timed_out', 'deployment_timed_out'])
    return verificationErrors.length > 0 || terminalFailure.has(providerStatus || '') || terminalFailure.has(sslStatus || '')
      ? 'failed'
      : 'pending_validation'
  }

  applyStripeWebhook(event: Record<string, unknown>) {
    const eventType = typeof event.type === 'string' ? event.type : 'unknown'
    const eventId = typeof event.id === 'string' ? event.id : this.shortId()
    const eventData = event.data
    const object = eventData && typeof eventData === 'object' && !Array.isArray(eventData)
      ? (eventData as Record<string, unknown>).object
      : undefined
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
      const audit = this.recordAudit('billing.stripe.webhook.ignored', eventId, 'api:stripe', 'review')
      return { data: { eventId, eventType, applied: false, audit } }
    }
    const payload = object as Record<string, unknown>
    const metadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? payload.metadata as Record<string, unknown>
      : {}
    const organizationId = typeof metadata.organizationId === 'string' ? metadata.organizationId : ''
    const providerSubscriptionId = this.stripeString(payload.subscription) || this.stripeString(payload.id)
    const subscription = this.subscriptionRecords.find((item) =>
      (organizationId && item.organizationId === organizationId) ||
      (providerSubscriptionId && item.providerSubscriptionId === providerSubscriptionId),
    )
    if (!subscription) {
      const audit = this.recordAudit('billing.stripe.webhook.unmatched', eventId, 'api:stripe', 'review')
      return { data: { eventId, eventType, applied: false, audit } }
    }

    const now = new Date().toISOString()
    const providerStatus = this.stripeString(payload.status)
    const nextStatus = this.mapStripeSubscriptionStatus(providerStatus, subscription.status)
    const customerId = this.stripeString(payload.customer) || subscription.providerCustomerId
    const requestedPlanId = this.stripeString(metadata.planId)
    const planId = billingPlans.some((plan) => plan.id === requestedPlanId) ? requestedPlanId : subscription.planId
    const nextSubscriptionId = eventType.startsWith('customer.subscription.')
      ? this.stripeString(payload.id) || subscription.providerSubscriptionId
      : subscription.providerSubscriptionId
    const updated: BillingSubscriptionRecord = {
      ...subscription,
      provider: 'stripe',
      collectionMode: 'hosted_checkout',
      planId,
      providerCustomerId: customerId,
      providerSubscriptionId: nextSubscriptionId,
      status: nextStatus,
      currentPeriodStart: this.stripeTimestamp(payload.current_period_start) || subscription.currentPeriodStart,
      currentPeriodEnd: this.stripeTimestamp(payload.current_period_end) || subscription.currentPeriodEnd,
      canWrite: nextStatus === 'active' || nextStatus === 'trialing',
      canExport: nextStatus !== 'canceled',
      updatedAt: now,
    }
    this.upsertSubscription(updated)

    if (eventType.startsWith('invoice.')) {
      const invoiceId = this.stripeString(payload.id)
      if (invoiceId) {
        const invoiceStatus = this.mapStripeInvoiceStatus(this.stripeString(payload.status), eventType)
        const amountDue = Number(payload.amount_due)
        const invoice: BillingInvoiceRecord = {
          id: `INV-STRIPE-${invoiceId}`,
          subscriptionId: updated.id,
          number: this.stripeString(payload.number) || invoiceId,
          status: invoiceStatus,
          amountDue: Number.isFinite(amountDue) ? amountDue / 100 : 0,
          currency: this.stripeString(payload.currency).toUpperCase() || 'USD',
          dueAt: this.stripeTimestamp(payload.due_date) || now,
          paidAt: invoiceStatus === 'paid' ? now : undefined,
          hostedInvoiceUrl: this.stripeString(payload.hosted_invoice_url),
          providerInvoiceId: invoiceId,
        }
        this.invoiceRecords = [invoice, ...this.invoiceRecords.filter((item) => item.providerInvoiceId !== invoiceId)]
      }
    }
    if (nextStatus === 'past_due') {
      const organization = this.organizationRecords.find((item) => item.id === updated.organizationId)
      if (organization?.primaryContact) {
        this.queueNotification(updated.organizationId, organization.primaryContact, 'billing', 'Subscription payment needs attention', 'Your subscription is past due. Update the payment method to keep workspace writes available.', '/saas')
      }
    }
    const audit = this.recordAudit('billing.stripe.webhook.apply', `${eventType}:${eventId}`, 'api:stripe', nextStatus === 'past_due' ? 'review' : 'allowed')
    return { data: { eventId, eventType, applied: true, subscription: updated, audit } }
  }

  private stripeString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
  }

  private stripeTimestamp(value: unknown) {
    const seconds = Number(value)
    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : ''
  }

  private mapStripeSubscriptionStatus(value: string, fallback: BillingSubscriptionRecord['status']) {
    if (value === 'active' || value === 'trialing' || value === 'past_due' || value === 'canceled') return value
    if (value === 'unpaid') return 'grace'
    return fallback
  }

  private mapStripeInvoiceStatus(value: string, eventType: string): BillingInvoiceRecord['status'] {
    if (eventType === 'invoice.paid' || value === 'paid') return 'paid'
    if (eventType === 'invoice.payment_failed' || value === 'uncollectible') return 'uncollectible'
    if (value === 'void') return 'void'
    if (value === 'draft') return 'draft'
    return 'open'
  }

  selectBillingPlan(body: { planId?: string; billingCycle?: 'monthly' | 'annual' } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const plan = this.billingPlanForId(body.planId?.trim() || 'PLAN-APPRENTICE')
    const subscription = this.activatePlanForOrganization(session.organizationId, plan)
    const audit = this.recordAudit('billing.plan.select', plan.id, session.userId, 'allowed')
    return {
      data: {
        id: `BILL-ACT-${audit.id}`,
        mode: 'plan_selected',
        status: 'completed',
        url:
          plan.monthlyPrice > 0
            ? `https://billing.labofscents.org/checkout/${subscription.id}?plan=${encodeURIComponent(plan.id)}`
            : undefined,
        audit,
        invariant: 'plan selection is tenant-scoped; paid plans start a no-card trial before hosted checkout collection',
      } satisfies BillingActionResponse,
    }
  }

  startBillingCheckout(body: { planId?: string; mode?: 'checkout' | 'manual_sales' } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const subscription = this.currentSubscription()
    const mode = body.mode === 'checkout' ? 'checkout' : 'manual_sales'
    const plan = this.billingPlanForId(body.planId?.trim() || subscription.planId)
    const audit = this.recordAudit('billing.checkout.start', plan.id, session.userId, 'allowed')
    const response: BillingActionResponse = {
      id: `BILL-ACT-${audit.id}`,
      mode,
      status: 'ready',
      url:
        mode === 'checkout'
          ? `https://billing.labofscents.org/checkout/${subscription.id}?plan=${encodeURIComponent(plan.id)}`
          : `mailto:sales@labofscents.org?subject=OlfactoryOps%20${encodeURIComponent(plan.name)}%20plan`,
      audit,
      invariant: 'checkout intent is tenant-scoped and auditable; payment provider webhooks must be idempotent',
    }
    return { data: response }
  }

  openBillingPortal() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const subscription = this.currentSubscription()
    const audit = this.recordAudit('billing.portal.open', subscription.id, session.userId, 'allowed')
    const response: BillingActionResponse = {
      id: `BILL-ACT-${audit.id}`,
      mode: 'portal',
      status: 'ready',
      url: `https://billing.labofscents.org/portal/${subscription.id}`,
      audit,
      invariant: 'billing portal action never trusts tenant identity from the browser',
    }
    return { data: response }
  }

  freezeSubscription(body: { reason?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const reason = body.reason?.trim() || 'Manual billing freeze'
    const subscription = {
      ...this.currentSubscription(),
      status: 'frozen',
      canWrite: false,
      canExport: true,
      freezeReason: reason,
      updatedAt: new Date().toISOString(),
    } satisfies BillingSubscriptionRecord
    this.upsertSubscription(subscription)
    const audit = this.recordAudit('billing.subscription.freeze', subscription.id, session.userId, 'allowed')
    return {
      data: {
        id: `BILL-ACT-${audit.id}`,
        mode: 'freeze',
        status: 'completed',
        audit,
        invariant: 'frozen tenants keep read and export access but cannot create commercial writes',
      } satisfies BillingActionResponse,
    }
  }

  reactivateSubscription() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'billing.manage')
    const subscription = {
      ...this.currentSubscription(),
      status: 'active',
      canWrite: true,
      canExport: true,
      freezeReason: undefined,
      graceEndsAt: undefined,
      updatedAt: new Date().toISOString(),
    } satisfies BillingSubscriptionRecord
    this.upsertSubscription(subscription)
    const audit = this.recordAudit('billing.subscription.reactivate', subscription.id, session.userId, 'allowed')
    return {
      data: {
        id: `BILL-ACT-${audit.id}`,
        mode: 'reactivate',
        status: 'completed',
        audit,
        invariant: 'reactivation restores write access only after an audited billing action',
      } satisfies BillingActionResponse,
    }
  }

  retryWebhookDelivery(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.webhooks.manage')
    const delivery = this.webhookDeliveryRecords.find((item) => item.id === id)
    if (!delivery) {
      throw new NotFoundException(`Webhook delivery ${id} was not found`)
    }
    const tenantWebhookIds = new Set(this.webhooksForOrganization(session.organizationId).map((webhook) => webhook.id))
    if (!tenantWebhookIds.has(delivery.webhookId)) {
      throw new ForbiddenException('Webhook delivery is outside the active tenant')
    }
    const nextDelivery: WebhookDeliveryRecord = {
      ...delivery,
      status: 'delivered',
      attempts: delivery.attempts + 1,
      lastAttemptAt: new Date().toISOString(),
      nextRetryAt: undefined,
      responseCode: 200,
    }
    this.webhookDeliveryRecords = this.webhookDeliveryRecords.map((item) => (item.id === id ? nextDelivery : item))
    const audit = this.recordAudit('webhook.delivery.retry', id, session.userId, 'allowed')
    return {
      data: {
        delivery: nextDelivery,
        audit,
        invariant: 'webhook retry preserves idempotency key and appends audit evidence',
      },
    }
  }

  assertCommercialWriteAllowed(action = 'commercial.write') {
    const subscription = this.currentSubscription()
    if (!subscription.canWrite || subscription.status === 'frozen' || subscription.status === 'canceled') {
      throw new ForbiddenException({
        message: 'Tenant writes are frozen by subscription state',
        action,
        subscriptionStatus: subscription.status,
        freezeReason: subscription.freezeReason,
      })
    }
  }

  assertPlanCapacity(limitKey: BillingLimitKey, increment = 1) {
    const subscription = this.currentSubscription()
    const plan = this.planForSubscription(subscription)
    const usage = this.billingUsageRecord(subscription)
    const current = this.usageValueForLimit(usage, limitKey)
    const limit = plan.limits[limitKey]
    if (current + increment > limit) {
      throw new UnprocessableEntityException({
        message: `Plan limit exceeded for ${limitKey}`,
        limitKey,
        current,
        increment,
        limit,
      })
    }
  }

  ssoConfig() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.sso.manage')
    return { data: this.publicSsoConfig(this.ssoConfigForOrganization(session.organizationId)) }
  }

  updateSsoConfig(body: SsoUpdateBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.sso.manage')
    const current = this.ssoConfigForOrganization(session.organizationId)
    const provider = body.provider === 'SAML' ? 'SAML' : body.provider === 'OIDC' ? 'OIDC' : current.provider
    const domain = this.normalizeDomain(body.domain, current.domain)
    const issuerUrl = this.normalizeHttpsUrl(body.issuerUrl, current.issuerUrl, 'Issuer URL')
    const metadataUrl =
      body.metadataUrl === undefined || body.metadataUrl === ''
        ? current.metadataUrl
        : this.normalizeHttpsUrl(body.metadataUrl, current.metadataUrl ?? issuerUrl, 'Metadata URL')
    const roleMapping = this.normalizeRoleMapping(body.roleMapping, current.roleMapping)
    const enforceSso = typeof body.enforceSso === 'boolean' ? body.enforceSso : current.enforceSso
    const scimEnabled = typeof body.scim?.enabled === 'boolean' ? body.scim.enabled : current.scim.enabled
    if (enforceSso || scimEnabled) {
      this.requireEnterpriseIdentityPlan()
    }
    const now = new Date().toISOString()
    const updated: SsoConfigRecord = {
      ...current,
      provider,
      domain,
      issuerUrl,
      metadataUrl,
      clientId:
        typeof body.clientId === 'string' && body.clientId.trim()
          ? body.clientId.trim().slice(0, 120)
          : current.clientId,
      acsUrl: `https://api.labofscents.org/api/v1/auth/sso/callback/${session.organizationId}`,
      entityId: `urn:olfactoryops:${session.organizationId}`,
      domainVerifiedAt: current.domain === domain ? current.domainVerifiedAt : now,
      jitProvisioning: typeof body.jitProvisioning === 'boolean' ? body.jitProvisioning : current.jitProvisioning,
      enforceSso,
      scim: {
        ...current.scim,
        enabled: scimEnabled,
        baseUrl:
          typeof body.scim?.baseUrl === 'string' && body.scim.baseUrl.trim()
            ? this.normalizeHttpsUrl(body.scim.baseUrl, current.scim.baseUrl, 'SCIM base URL')
            : current.scim.baseUrl,
        deprovisionAction:
          body.scim?.deprovisionAction === 'disable_user' ? 'disable_user' : current.scim.deprovisionAction,
        status: scimEnabled ? 'enabled' : 'disabled',
      },
      roleMapping,
      status: enforceSso ? 'enforced' : 'verified',
      updatedAt: now,
    }
    this.upsertSsoConfig(updated)
    const audit = this.recordAudit('sso.update', updated.id, session.userId, 'allowed')
    return {
      data: {
        config: this.publicSsoConfig(updated),
        audit,
        invariant: 'SSO and SCIM configuration is tenant-scoped, plan-gated, and audited',
      },
    }
  }

  rotateScimToken() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.sso.manage')
    this.requireEnterpriseIdentityPlan()
    const current = this.ssoConfigForOrganization(session.organizationId)
    const token = this.createSecret('scim_oo')
    const updated: SsoConfigRecord = {
      ...current,
      scim: {
        ...current.scim,
        enabled: true,
        status: 'enabled',
        tokenLastFour: this.lastFour(token),
        tokenRotatedAt: new Date().toISOString(),
        tokenHash: this.hashSecret(token),
      },
      status: current.enforceSso ? 'enforced' : 'verified',
      updatedAt: new Date().toISOString(),
    }
    this.upsertSsoConfig(updated)
    const audit = this.recordAudit('scim.token.rotate', updated.id, session.userId, 'allowed')
    return {
      data: {
        config: this.publicSsoConfig(updated),
        secret: token,
        audit,
        invariant: 'SCIM token is revealed once and only the rotation metadata is retained',
      },
    }
  }

  apiKeys() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.apiKeys.manage')
    return { data: this.publicApiKeysForOrganization(session.organizationId) }
  }

  createApiKey(body: ApiKeyCreateBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.apiKeys.manage')
    this.requireApiAccessPlan()
    const label = body.label?.trim().slice(0, 80) || 'Tenant integration key'
    const scopes = this.normalizeApiKeyScopes(body.scopes)
    const secret = this.createSecret('oo_live')
    const now = new Date().toISOString()
    const key: ApiKeyRecord = {
      id: `KEY-${this.shortId()}`,
      organizationId: session.organizationId,
      label,
      prefix: secret.slice(0, 12),
      lastFour: this.lastFour(secret),
      scopes,
      createdAt: now,
      createdBy: session.userId,
      rotatedAt: now,
      expiresAt: this.normalizeOptionalIsoDate(body.expiresAt),
      status: 'active',
      secretHash: this.hashSecret(secret),
    }
    this.apiKeyRecords = [key, ...this.apiKeyRecords]
    const audit = this.recordAudit('apiKey.create', key.id, session.userId, 'allowed')
    return {
      data: {
        apiKey: this.publicApiKey(key),
        secret,
        audit,
        invariant: 'API key secret is revealed once; only a server-side hash is persisted',
      },
    }
  }

  rotateApiKey(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.apiKeys.manage')
    const key = this.apiKeyForTenant(id, session.organizationId)
    if (key.status !== 'active') {
      throw new UnprocessableEntityException('Only active API keys can be rotated')
    }
    const secret = this.createSecret('oo_live')
    const updated: ApiKeyRecord = {
      ...key,
      prefix: secret.slice(0, 12),
      lastFour: this.lastFour(secret),
      rotatedAt: new Date().toISOString(),
      secretHash: this.hashSecret(secret),
    }
    this.upsertApiKey(updated)
    const audit = this.recordAudit('apiKey.rotate', updated.id, session.userId, 'allowed')
    return {
      data: {
        apiKey: this.publicApiKey(updated),
        secret,
        audit,
        invariant: 'API key rotation invalidates the previous secret hash and records audit evidence',
      },
    }
  }

  revokeApiKey(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.apiKeys.manage')
    const key = this.apiKeyForTenant(id, session.organizationId)
    const updated: ApiKeyRecord = {
      ...key,
      status: 'revoked',
      secretHash: undefined,
    }
    this.upsertApiKey(updated)
    const audit = this.recordAudit('apiKey.revoke', updated.id, session.userId, 'allowed')
    return {
      data: {
        apiKey: this.publicApiKey(updated),
        audit,
        invariant: 'revoked API keys cannot authenticate future integration traffic',
      },
    }
  }

  webhooks() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.webhooks.manage')
    return { data: this.webhooksForOrganization(session.organizationId) }
  }

  createWebhook(body: WebhookMutationBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.webhooks.manage')
    this.requireWebhookCapacity()
    const secret = this.createSecret('whsec')
    const now = new Date().toISOString()
    const webhook: WebhookRecord = {
      id: `WH-${this.shortId()}`,
      organizationId: session.organizationId,
      url: this.normalizeHttpsUrl(body.url, '', 'Webhook URL'),
      events: this.normalizeWebhookEvents(body.events),
      status: 'active',
      lastDelivery: now,
      createdAt: now,
      owner: session.userId,
      signingSecretLastFour: this.lastFour(secret),
      signingSecretRotatedAt: now,
      failureCount: 0,
    }
    this.webhookRecords = [webhook, ...this.webhookRecords]
    const audit = this.recordAudit('webhook.create', webhook.id, session.userId, 'allowed')
    return {
      data: {
        webhook,
        secret,
        audit,
        invariant: 'webhook endpoint is tenant-scoped and signing secret is revealed once',
      },
    }
  }

  updateWebhook(id: string, body: WebhookMutationBody = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.webhooks.manage')
    const webhook = this.webhookForTenant(id, session.organizationId)
    const updated: WebhookRecord = {
      ...webhook,
      url: body.url === undefined ? webhook.url : this.normalizeHttpsUrl(body.url, webhook.url, 'Webhook URL'),
      events: body.events === undefined ? webhook.events : this.normalizeWebhookEvents(body.events),
      status: body.status === 'paused' || body.status === 'active' ? body.status : webhook.status,
    }
    this.upsertWebhook(updated)
    const audit = this.recordAudit('webhook.update', updated.id, session.userId, 'allowed')
    return {
      data: {
        webhook: updated,
        audit,
        invariant: 'webhook updates are tenant-scoped and signed delivery metadata is preserved',
      },
    }
  }

  rotateWebhookSecret(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.webhooks.manage')
    const webhook = this.webhookForTenant(id, session.organizationId)
    const secret = this.createSecret('whsec')
    const updated: WebhookRecord = {
      ...webhook,
      signingSecretLastFour: this.lastFour(secret),
      signingSecretRotatedAt: new Date().toISOString(),
    }
    this.upsertWebhook(updated)
    const audit = this.recordAudit('webhook.secret.rotate', updated.id, session.userId, 'allowed')
    return {
      data: {
        webhook: updated,
        secret,
        audit,
        invariant: 'webhook signing secret rotation reveals the new secret once and audits the event',
      },
    }
  }

  deleteWebhook(id: string) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'security.webhooks.manage')
    const webhook = this.webhookForTenant(id, session.organizationId)
    const updated: WebhookRecord = {
      ...webhook,
      status: 'paused',
    }
    this.upsertWebhook(updated)
    const audit = this.recordAudit('webhook.delete', webhook.id, session.userId, 'allowed')
    return {
      data: {
        webhook: updated,
        audit,
        invariant: 'webhook removal is a tenant-scoped soft disable so delivery evidence is retained',
      },
    }
  }

  auditExports() {
    const session = this.currentSession()
    this.requirePermission(session.role, 'audit.export')
    return { data: this.auditExportsForOrganization(session.organizationId) }
  }

  auditExport(body: { format?: 'JSON' | 'CSV'; scope?: string } = {}) {
    const session = this.currentSession()
    this.requirePermission(session.role, 'audit.export')
    const subscription = this.currentSubscription()
    if (!subscription.canExport) {
      throw new ForbiddenException('Audit export is disabled for the current subscription')
    }
    const format = body.format === 'CSV' ? 'CSV' : 'JSON'
    const scope = body.scope?.trim().slice(0, 80) || session.organizationId
    const tenantEvents = this.auditEvents.filter((event) => event.entity.includes(session.organizationId) || event.actor === session.userId || event.actor === 'api:auth' || event.actor === 'api:owner')
    const audit = this.recordAudit('audit.export', session.organizationId, session.userId, 'allowed')
    const createdAt = new Date().toISOString()
    const completedAt = new Date(Date.now() + 1500).toISOString()
    const job: AuditExportJobRecord = {
      id: `AUD-EXP-${this.shortId()}`,
      organizationId: session.organizationId,
      requestedBy: session.userId,
      format,
      scope,
      status: 'READY',
      eventCount: tenantEvents.length + 1,
      checksum: this.hashSecret(`${session.organizationId}:${createdAt}:${tenantEvents.length}:${audit.id}`),
      downloadUrl: `https://api.labofscents.org/api/v1/audit/exports/${audit.id}/download`,
      createdAt,
      completedAt,
      expiresAt: this.addDays(createdAt, 30),
      auditEventId: audit.id,
    }
    this.auditExportRecords = [job, ...this.auditExportRecords]
    return {
      data: {
        ...job,
        audit,
        invariant: 'audit export job is tenant-scoped, checksummed, and retained as evidence',
      },
    }
  }

  private settingsForSession(session: AuthSession) {
    const existing = this.userSettingsRecords.find(
      (settings) => settings.userId === session.userId && settings.organizationId === session.organizationId,
    )
    if (existing) {
      return existing
    }
    const membership = this.membershipRecords.find(
      (item) => item.userId === session.userId && item.organizationId === session.organizationId,
    )
    const settings = this.defaultUserSettingsForMembership(
      membership ?? {
        id: `MBR-${session.userId}`,
        userId: session.userId,
        email: session.email,
        name: session.email,
        organizationId: session.organizationId,
        brandIds: [session.brandId],
        role: session.role,
        status: 'ACTIVE',
        mfaEnabled: session.mfaVerified,
        lastActiveAt: session.lastSeenAt,
      },
      new Date().toISOString(),
    )
    this.upsertUserSettings(settings)
    return settings
  }

  private defaultUserSettingsForMembership(membership: MembershipRecord, updatedAt: string): UserSettingsRecord {
    return {
      userId: membership.userId,
      organizationId: membership.organizationId,
      email: membership.email,
      displayName: membership.name || membership.email,
      preferredLanding: membership.role === 'Lab Manager' ? 'labUsage' : 'dashboard',
      uiDensity: membership.role === 'Lab Manager' ? 'compact' : 'comfortable',
      sidebarMode: membership.role === 'Lab Manager' ? 'rail' : 'expanded',
      reduceMotion: false,
      emailDigest: membership.role === 'Owner' ? 'weekly' : 'daily',
      accentColor: membership.role === 'Lab Manager' ? '#15803d' : '#0f766e',
      formulaWorkspace: createDefaultFormulaWorkspacePreferences(),
      updatedAt,
    }
  }

  private upsertUserSettings(settings: UserSettingsRecord) {
    this.userSettingsRecords = [
      settings,
      ...this.userSettingsRecords.filter(
        (item) => !(item.userId === settings.userId && item.organizationId === settings.organizationId),
      ),
    ]
  }

  private normalizePreferredLanding(
    value: unknown,
    fallback: UserSettingsRecord['preferredLanding'],
  ): UserSettingsRecord['preferredLanding'] {
    if (value === 'dashboard') {
      return value
    }
    if (typeof value === 'string' && domains.some((domain) => domain.key === value)) {
      return value as UserSettingsRecord['preferredLanding']
    }
    return fallback
  }

  private normalizeAccentColor(value: unknown, fallback: string) {
    if (typeof value !== 'string') {
      return fallback
    }
    const trimmed = value.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toLowerCase()
    }
    const shortMatch = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(trimmed)
    if (shortMatch) {
      return `#${shortMatch[1]}${shortMatch[1]}${shortMatch[2]}${shortMatch[2]}${shortMatch[3]}${shortMatch[3]}`.toLowerCase()
    }
    return fallback
  }

  private currentSubscription() {
    const session = this.currentSession()
    return this.subscriptionForOrganization(session.organizationId)
  }

  private subscriptionForOrganization(organizationId: string) {
    const existing = this.subscriptionRecords.find((subscription) => subscription.organizationId === organizationId)
    if (existing) {
      return existing
    }
    const subscription = this.createSubscriptionRecord(organizationId, 'PLAN-APPRENTICE', new Date().toISOString())
    this.upsertSubscription(subscription)
    return subscription
  }

  private createSubscriptionRecord(organizationId: string, planId: string, createdAt: string): BillingSubscriptionRecord {
    const periodEnd = this.addMonths(createdAt, 1)
    return {
      id: `SUB-${organizationId.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40)}`,
      organizationId,
      planId,
      provider: 'manual',
      collectionMode: 'manual_invoice',
      status: 'active',
      currentPeriodStart: createdAt,
      currentPeriodEnd: periodEnd,
      canWrite: true,
      canExport: true,
      nextInvoiceAt: periodEnd,
      updatedAt: createdAt,
    }
  }

  private activatePlanForOrganization(organizationId: string, plan: BillingPlanRecord) {
    const now = new Date().toISOString()
    const previous = this.subscriptionForOrganization(organizationId)
    const trialEndsAt = plan.monthlyPrice > 0 ? this.addDays(now, 14) : undefined
    const nextInvoiceAt = trialEndsAt ?? this.addMonths(now, 1)
    const subscription: BillingSubscriptionRecord = {
      ...previous,
      planId: plan.id,
      provider: 'manual',
      collectionMode: 'manual_invoice',
      status: plan.monthlyPrice > 0 ? 'trialing' : 'active',
      currentPeriodStart: now,
      currentPeriodEnd: this.addMonths(now, 1),
      trialEndsAt,
      graceEndsAt: undefined,
      freezeReason: undefined,
      canWrite: true,
      canExport: true,
      nextInvoiceAt,
      updatedAt: now,
    }
    this.upsertSubscription(subscription)
    this.organizationRecords = this.organizationRecords.map((organization) =>
      organization.id === organizationId
        ? { ...organization, plan: this.organizationPlanForBillingPlan(plan.id) }
        : organization,
    )
    if (plan.monthlyPrice > 0) {
      this.upsertInvoice({
        id: `INV-${subscription.id}-${plan.id}`,
        subscriptionId: subscription.id,
        number: `OO-${now.slice(0, 10).replace(/-/g, '')}-${plan.id.replace('PLAN-', '')}`,
        status: 'draft',
        amountDue: plan.monthlyPrice,
        currency: plan.currency,
        dueAt: nextInvoiceAt,
        hostedInvoiceUrl: `https://billing.labofscents.org/invoices/${subscription.id}-${plan.id}`,
        providerInvoiceId: `manual:${subscription.id}:${plan.id}`,
      })
    }
    return subscription
  }

  private upsertSubscription(subscription: BillingSubscriptionRecord) {
    this.subscriptionRecords = [
      subscription,
      ...this.subscriptionRecords.filter((item) => item.id !== subscription.id),
    ]
  }

  private upsertInvoice(invoice: BillingInvoiceRecord) {
    this.invoiceRecords = [
      invoice,
      ...this.invoiceRecords.filter((item) => item.id !== invoice.id),
    ]
  }

  private normalizeOperationApprovalRequest(
    methodValue: unknown,
    pathValue: unknown,
    payloadValue: unknown,
  ): NormalizedOperationApprovalRequest {
    const method = typeof methodValue === 'string' ? methodValue.trim().toUpperCase() : ''
    const path = this.normalizeOperationApprovalPath(pathValue)
    const payload = this.operationPayloadObject(payloadValue)
    const route = this.matchOperationApprovalRoute(method, path, payload)
    if (!route) {
      throw new UnprocessableEntityException(`Operation approval is not supported for ${method || 'UNKNOWN'} ${path || 'UNKNOWN'}`)
    }
    return route
  }

  private matchOperationApprovalRoute(
    method: string,
    path: string,
    payload: Record<string, unknown>,
  ): NormalizedOperationApprovalRequest | null {
    const match = (expectedMethod: string, pattern: string) =>
      method === expectedMethod ? this.matchOperationPath(path, pattern) : null
    const build = (
      action: string,
      requiredPermission: string,
      viewPermission: string | undefined,
      params: Record<string, string>,
      targetLabel: string,
      defaultReason: string,
    ): NormalizedOperationApprovalRequest => ({
      action,
      method,
      path,
      requiredPermission,
      viewPermission,
      payload,
      params,
      targetLabel,
      defaultReason,
    })

    if (method === 'POST' && path === '/materials') {
      return build('material.create', 'materials.create', 'materials.view', {}, this.optionalString(payload.name) || 'New material', 'Material creation requires approval')
    }
    let params = match('PATCH', '/materials/:id')
    if (params) return build('material.update', 'materials.update', 'materials.view', params, params.id, 'Material update requires approval')
    params = match('POST', '/materials/:id/ingest')
    if (params) return build('material.ingest', 'materials.update', 'materials.view', params, params.id, 'Material ingestion approval required')
    params = match('POST', '/materials/:id/pubchem-fill')
    if (params) return build('material.pubchemFill', 'materials.update', 'materials.view', params, params.id, 'PubChem fill requires approval')

    if (method === 'POST' && path === '/formulas') {
      return build('formula.create', 'formulas.edit', 'formulas.view', {}, this.optionalString(payload.name) || 'New formula', 'Formula draft creation requires approval')
    }
    params = match('PATCH', '/formulas/:id')
    if (params) return build('formula.update', 'formulas.edit', 'formulas.view', params, params.id, 'Formula draft update requires approval')
    params = match('POST', '/formulas/:id/fork')
    if (params) return build('formula.fork', 'formulas.edit', 'formulas.view', params, params.id, 'Formula fork requires approval')
    params = match('POST', '/formulas/:id/lines')
    if (params) return build('formula.line.create', 'formulas.edit', 'formulas.view', params, params.id, 'Formula line addition requires approval')
    params = match('PATCH', '/formulas/:id/lines/:lineId')
    if (params) return build('formula.line.update', 'formulas.edit', 'formulas.view', params, params.lineId, 'Formula line update requires approval')
    params = match('DELETE', '/formulas/:id/lines/:lineId')
    if (params) return build('formula.line.delete', 'formulas.edit', 'formulas.view', params, params.lineId, 'Formula line deletion requires approval')
    params = match('POST', '/formulas/:id/lines/:lineId/move')
    if (params) return build('formula.line.move', 'formulas.edit', 'formulas.view', params, params.lineId, 'Formula line reorder requires approval')
    params = match('POST', '/formulas/:id/versions')
    if (params) return build('formula.version.snapshot', 'formulas.edit', 'formulas.view', params, params.id, 'Formula version snapshot requires approval')
    params = match('POST', '/formulas/:id/review')
    if (params) return build('formula.review.submit', 'formulas.edit', 'formulas.view', params, params.id, 'Formula review submission requires approval')
    params = match('POST', '/formulas/:id/reject')
    if (params) return build('formula.review.reject', 'formulas.approve', 'formulas.view', params, params.id, 'Formula rejection requires approver review')
    params = match('POST', '/formulas/:id/versions/:version/evaluations')
    if (params) return build('formula.evaluation.create', 'formulas.edit', 'formulas.view', params, `${params.id}:${params.version}`, 'Formula evaluation requires approval')
    params = match('POST', '/formulas/:id/export')
    if (params) return build('formula.export', 'formulas.export', 'formulas.view', params, params.id, 'Formula export requires approval')

    if (method === 'POST' && path === '/documents/generate') {
      return build('document.generate', 'documents.manage', 'documents.view', {}, this.optionalString(payload.linkedTo) || 'Document generation', 'Document generation requires approval')
    }
    params = match('POST', '/documents/:id/approve')
    if (params) return build('document.approve', 'documents.manage', 'documents.view', params, params.id, 'Document approval requires approver review')
    params = match('POST', '/documents/:id/share')
    if (params) return build('document.share', 'documents.manage', 'documents.view', params, params.id, 'External document share requires approval')
    params = match('POST', '/documents/:id/signed-url')
    if (params) return build('document.download', 'documents.download', 'documents.view', params, params.id, 'Document download requires approval')

    if (method === 'POST' && path === '/lab-usage/commit') {
      return build('labUsage.commit', 'inventory.commitLabUsage', 'inventory.view', {}, this.optionalString(payload.formulaId) || 'Lab usage commit', 'Lab usage stock movement requires approval')
    }
    params = match('POST', '/lab-usage/:id/reverse')
    if (params) return build('labUsage.reverse', 'inventory.reverseLabUsage', 'inventory.view', params, params.id, 'Lab usage reversal requires approval')
    if (method === 'POST' && path === '/lab-usage/reverse-latest') {
      return build('labUsage.reverseLatest', 'inventory.reverseLabUsage', 'inventory.view', {}, 'Latest lab usage', 'Lab usage reversal requires approval')
    }

    if (method === 'POST' && path === '/storage-locations') {
      return build('inventory.location.create', 'inventory.receive', 'inventory.view', {}, this.optionalString(payload.name) || 'Storage location', 'Storage location creation requires approval')
    }

    if (method === 'POST' && path === '/production/batches') {
      return build('production.batch.create', 'production.consume', 'production.view', {}, this.optionalString(payload.formulaId) || 'Production batch', 'Production batch creation requires approval')
    }
    params = match('POST', '/production/batches/:id/consume')
    if (params) return build('production.batch.consume', 'production.consume', 'production.view', params, params.id, 'Production stock consumption requires approval')
    params = match('POST', '/production/batches/:id/qc')
    if (params) return build('production.batch.qc', 'production.qc', 'production.view', params, params.id, 'Production QC requires approval')
    params = match('PATCH', '/production/batches/:id/status')
    if (params) return build('production.batch.status', 'production.consume', 'production.view', params, params.id, 'Production status transition requires approval')

    if (method === 'POST' && path === '/suppliers') {
      return build('procurement.supplier.create', 'procurement.manage', 'procurement.view', {}, this.optionalString(payload.name) || 'Supplier', 'Supplier creation requires approval')
    }
    if (method === 'POST' && path === '/purchase-orders') {
      return build('procurement.po.create', 'procurement.manage', 'procurement.view', {}, this.optionalString(payload.supplierId) || 'Purchase order', 'Purchase order creation requires approval')
    }
    params = match('PATCH', '/purchase-orders/:id/status')
    if (params) return build('procurement.po.status', 'procurement.manage', 'procurement.view', params, params.id, 'Purchase order status change requires approval')
    params = match('POST', '/purchase-orders/:id/receive')
    if (params) return build('procurement.po.receive', 'procurement.manage', 'procurement.view', params, params.id, 'Goods receipt requires procurement approval')

    if (method === 'POST' && path === '/catalog/skus') {
      return build('commerce.sku.create', 'commerce.manage', 'commerce.view', {}, this.optionalString(payload.name) || 'SKU', 'SKU creation requires approval')
    }
    if (method === 'POST' && path === '/price-lists') {
      return build('commerce.priceList.create', 'commerce.manage', 'commerce.view', {}, this.optionalString(payload.name) || 'Price list', 'Price list creation requires approval')
    }
    if (method === 'POST' && path === '/quotes') {
      return build('commerce.quote.create', 'commerce.manage', 'commerce.view', {}, this.optionalString(payload.customer) || 'Quote', 'Quote creation requires approval')
    }
    if (method === 'POST' && path === '/samples') {
      return build('commerce.sample.create', 'commerce.manage', 'commerce.view', {}, this.optionalString(payload.customer) || 'Sample request', 'Sample request requires approval')
    }

    if (method === 'POST' && path === '/customers') {
      return build('orders.customer.create', 'orders.reserve', 'orders.view', {}, this.optionalString(payload.name) || 'Customer', 'Customer creation requires order approval')
    }
    if (method === 'POST' && path === '/orders') {
      return build('orders.create', 'orders.reserve', 'orders.view', {}, this.optionalString(payload.customerId) || 'Sales order', 'Order creation requires approval')
    }
    params = match('POST', '/orders/:id/reserve')
    if (params) return build('orders.reserve', 'orders.reserve', 'orders.view', params, params.id, 'Order reservation requires approval')
    params = match('POST', '/orders/:id/cancel')
    if (params) return build('orders.cancel', 'orders.reserve', 'orders.view', params, params.id, 'Order cancellation requires approval')
    params = match('POST', '/orders/:id/pack')
    if (params) return build('orders.pack', 'orders.fulfill', 'orders.view', params, params.id, 'Order packing requires fulfillment approval')
    params = match('POST', '/orders/:id/ship')
    if (params) return build('orders.ship', 'orders.fulfill', 'orders.view', params, params.id, 'Order shipping requires fulfillment approval')
    params = match('POST', '/orders/:id/fulfill')
    if (params) return build('orders.fulfill', 'orders.fulfill', 'orders.view', params, params.id, 'Order fulfillment requires approval')

    if (method === 'PATCH' && path === '/settings') {
      return build('customization.settings.update', 'customization.manage', 'platform.view', {}, 'Tenant settings', 'Tenant settings update requires approval')
    }
    params = match('PATCH', '/feature-flags/:key')
    if (params) return build('customization.featureFlag.update', 'customization.manage', 'platform.view', params, params.key, 'Feature flag update requires approval')
    params = match('PATCH', '/numbering-sequences/:key')
    if (params) return build('customization.sequence.update', 'customization.manage', 'platform.view', params, params.key, 'Numbering sequence update requires approval')
    if (method === 'POST' && path === '/custom-fields') {
      return build('customization.customField.create', 'customization.manage', 'platform.view', {}, this.optionalString(payload.label) || 'Custom field', 'Custom field creation requires approval')
    }
    if (method === 'PATCH' && path === '/branding') {
      return build('customization.branding.update', 'customization.manage', 'platform.view', {}, 'Tenant branding', 'Branding update requires approval')
    }

    params = match('POST', '/security/members/invite')
    if (method === 'POST' && path === '/security/members/invite') {
      return build('security.member.invite', 'security.manageUsers', 'platform.view', {}, this.optionalString(payload.email) || 'Member invite', 'Member invite requires admin approval')
    }
    params = match('PATCH', '/security/members/:id/status')
    if (params) return build('security.member.status', 'security.manageUsers', 'platform.view', params, params.id, 'Member status change requires admin approval')
    params = match('POST', '/security/sessions/:id/revoke')
    if (params) return build('security.session.revoke', 'security.manageUsers', 'platform.view', params, params.id, 'Session revoke requires admin approval')
    if (method === 'POST' && path === '/security/sessions/revoke-all') {
      return build('security.session.revokeAll', 'security.manageUsers', 'platform.view', {}, this.optionalString(payload.email) || 'Tenant sessions', 'Bulk session revoke requires admin approval')
    }
    params = match('POST', '/security/sessions/:id/touch')
    if (params) return build('security.session.touch', 'security.sessions.manage', 'platform.view', params, params.id, 'Session extension requires approval')
    params = match('PATCH', '/security/roles/:role/permissions')
    if (params) return build('security.role.permission', 'security.manageUsers', 'platform.view', params, params.role, 'Role permission update requires admin approval')

    if (method === 'POST' && path === '/billing/subscription/select-plan') {
      return build('billing.plan.select', 'billing.manage', 'platform.view', {}, this.optionalString(payload.planId) || 'Billing plan', 'Billing plan change requires billing approval')
    }
    if (method === 'POST' && path === '/billing/checkout') {
      return build('billing.checkout', 'billing.manage', 'platform.view', {}, this.optionalString(payload.planId) || 'Checkout', 'Checkout start requires billing approval')
    }
    if (method === 'POST' && path === '/billing/portal') {
      return build('billing.portal', 'billing.manage', 'platform.view', {}, 'Billing portal', 'Billing portal access requires billing approval')
    }
    if (method === 'POST' && path === '/billing/subscription/freeze') {
      return build('billing.subscription.freeze', 'billing.manage', 'platform.view', {}, 'Subscription freeze', 'Subscription freeze requires billing approval')
    }
    if (method === 'POST' && path === '/billing/subscription/reactivate') {
      return build('billing.subscription.reactivate', 'billing.manage', 'platform.view', {}, 'Subscription reactivate', 'Subscription reactivation requires billing approval')
    }

    if (method === 'PATCH' && path === '/sso-config') {
      return build('security.sso.update', 'security.sso.manage', 'platform.view', {}, 'SSO configuration', 'SSO configuration requires security approval')
    }
    if (method === 'POST' && path === '/sso-config/scim-token/rotate') {
      return build('security.scim.rotate', 'security.sso.manage', 'platform.view', {}, 'SCIM token', 'SCIM rotation requires security approval')
    }
    if (method === 'POST' && path === '/api-keys') {
      return build('security.apiKey.create', 'security.apiKeys.manage', 'platform.view', {}, this.optionalString(payload.label) || 'API key', 'API key creation requires security approval')
    }
    params = match('POST', '/api-keys/:id/rotate')
    if (params) return build('security.apiKey.rotate', 'security.apiKeys.manage', 'platform.view', params, params.id, 'API key rotation requires security approval')
    params = match('POST', '/api-keys/:id/revoke')
    if (params) return build('security.apiKey.revoke', 'security.apiKeys.manage', 'platform.view', params, params.id, 'API key revoke requires security approval')
    if (method === 'POST' && path === '/webhooks') {
      return build('security.webhook.create', 'security.webhooks.manage', 'platform.view', {}, this.optionalString(payload.url) || 'Webhook', 'Webhook creation requires security approval')
    }
    params = match('PATCH', '/webhooks/:id')
    if (params) return build('security.webhook.update', 'security.webhooks.manage', 'platform.view', params, params.id, 'Webhook update requires security approval')
    params = match('POST', '/webhooks/:id/rotate-secret')
    if (params) return build('security.webhook.rotateSecret', 'security.webhooks.manage', 'platform.view', params, params.id, 'Webhook secret rotation requires security approval')
    params = match('DELETE', '/webhooks/:id')
    if (params) return build('security.webhook.delete', 'security.webhooks.manage', 'platform.view', params, params.id, 'Webhook delete requires security approval')
    params = match('POST', '/webhooks/deliveries/:id/retry')
    if (params) return build('security.webhook.retryDelivery', 'security.webhooks.manage', 'platform.view', params, params.id, 'Webhook delivery retry requires security approval')

    if (method === 'POST' && path === '/audit/export') {
      return build('audit.export', 'audit.export', 'audit.view', {}, 'Audit export', 'Audit export requires approval')
    }
    return null
  }

  private executeOperationApprovalRequest(request: OperationApprovalRequestRecord) {
    const payload = request.payload
    const params = request.params
    const actorPayload = { ...payload, actor: this.currentSession().userId }

    switch (request.action) {
      case 'material.create':
        return this.createMaterial(payload as MaterialMutationBody).data
      case 'material.update':
        return this.updateMaterial(params.id, payload as MaterialMutationBody).data
      case 'material.ingest':
        return this.ingestMaterialDocument(params.id, payload as MaterialIngestionBody).data
      case 'material.pubchemFill':
        return this.pubchemFill(params.id).data
      case 'formula.create':
        return this.createFormulaDraft(actorPayload as FormulaDraftMutationBody & { formulaType?: FormulaType }).data
      case 'formula.update':
        return this.updateFormulaDraft(params.id, payload as FormulaDraftMutationBody).data
      case 'formula.fork':
        return this.forkFormula(params.id, payload as { name?: string; comment?: string }).data
      case 'formula.line.create':
        return this.addFormulaLine(params.id, payload as FormulaLineMutationBody).data
      case 'formula.line.update':
        return this.updateFormulaLine(params.id, params.lineId, payload as FormulaLineMutationBody).data
      case 'formula.line.delete':
        return this.deleteFormulaLine(params.id, params.lineId).data
      case 'formula.line.move':
        return this.moveFormulaLine(params.id, params.lineId, payload as { direction?: 'up' | 'down' }).data
      case 'formula.version.snapshot':
        return this.createFormulaVersion(params.id, actorPayload as { note?: string; actor?: string }).data
      case 'formula.review.submit':
        return this.submitFormulaForReview(params.id, payload as FormulaReviewBody).data
      case 'formula.review.reject':
        return this.rejectFormula(params.id, payload as FormulaReviewBody).data
      case 'formula.export':
        return this.exportFormula(params.id, actorPayload as { actor?: string }).data
      case 'formula.evaluation.create':
        return this.addFormulaEvaluation(params.id, params.version, payload as FormulaEvaluationBody).data
      case 'document.generate':
        return this.generateDocument(actorPayload as GenerateDocumentBody).data
      case 'document.approve':
        return this.approveDocument(params.id, actorPayload as { actor?: string; note?: string }).data
      case 'document.share':
        return this.shareDocument(params.id, actorPayload as { recipient?: string; actor?: string }).data
      case 'document.download':
        return this.requestDocumentSignedUrl(params.id).data
      case 'labUsage.commit':
        return this.commitLabUsage(String(payload.formulaId ?? ''), Number(payload.grams ?? 0), {
          actuals: Array.isArray(payload.actuals) ? payload.actuals as WeighingActualInput[] : undefined,
          tolerancePercent: Number(payload.tolerancePercent ?? 2),
          operator: this.currentSession().userId,
          purpose: payload.purpose as LabUsagePurpose,
          projectCode: this.optionalString(payload.projectCode) || undefined,
          sampleCode: this.optionalString(payload.sampleCode) || undefined,
        }).data
      case 'labUsage.reverse':
        return this.reverseLabUsage(params.id, actorPayload as LabUsageReverseOptions).data
      case 'labUsage.reverseLatest':
        return this.reverseLatestLabUsage(actorPayload as LabUsageReverseOptions).data
      case 'inventory.location.create':
        return this.createStorageLocation(payload as Parameters<NorthStarService['createStorageLocation']>[0]).data
      case 'production.batch.create':
        return this.createProductionBatch(
          this.optionalString(payload.formulaId) || undefined,
          Number(payload.targetGrams ?? 25),
        ).data
      case 'production.batch.consume':
        return this.consumeProductionBatch(params.id).data
      case 'production.batch.qc':
        return this.qcProductionBatch(params.id, payload.result === 'FAILED' ? 'FAILED' : 'PASSED').data
      case 'production.batch.status':
        return this.updateProductionBatchStatus(params.id, payload.status as ProductionBatchRecord['status']).data
      case 'procurement.supplier.create':
        return this.createSupplier(payload as CreateSupplierBody).data
      case 'procurement.po.create':
        return this.createPurchaseOrder(payload as CreatePurchaseOrderBody).data
      case 'procurement.po.status':
        return this.updatePurchaseOrderStatus(params.id, payload.status as PurchaseOrderRecord['status']).data
      case 'procurement.po.receive':
        return this.receivePurchaseOrder(params.id, payload as { receivedGrams?: number }).data
      case 'commerce.sku.create':
        return this.createCatalogSku(payload as CreateCatalogSkuBody).data
      case 'commerce.priceList.create':
        return this.createPriceList(payload as CreatePriceListBody).data
      case 'commerce.quote.create':
        return this.createQuote(payload as CreateQuoteBody).data
      case 'commerce.sample.create':
        return this.requestSample(payload as CreateSampleRequestBody).data
      case 'orders.customer.create':
        return this.createCustomer(payload as CreateCustomerBody).data
      case 'orders.create':
        return this.createOrder(payload as CreateSalesOrderBody).data
      case 'orders.reserve':
        return this.reserveOrder(params.id).data
      case 'orders.cancel':
        return this.cancelOrder(params.id).data
      case 'orders.pack':
        return this.packOrder(params.id, payload as PackOrderBody).data
      case 'orders.ship':
        return this.shipOrder(params.id, payload as ShipOrderBody).data
      case 'orders.fulfill':
        return this.fulfillOrder(params.id).data
      case 'customization.settings.update':
        return this.updateSettings(payload).data
      case 'customization.featureFlag.update':
        return this.updateFeatureFlag(params.key, Boolean(payload.enabled)).data
      case 'customization.sequence.update':
        return this.updateNumberingSequence(params.key, payload as Parameters<NorthStarService['updateNumberingSequence']>[1]).data
      case 'customization.customField.create':
        return this.createCustomField(payload as Parameters<NorthStarService['createCustomField']>[0]).data
      case 'customization.branding.update':
        return this.updateBranding(payload as Parameters<NorthStarService['updateBranding']>[0]).data
      case 'security.member.invite':
        return this.inviteMember(payload as { email?: string; name?: string; role?: string; brandIds?: string[] }).data
      case 'security.member.status':
        return this.setMembershipStatus(params.id, payload.status as MembershipRecord['status']).data
      case 'security.session.revoke':
        return this.revokeSession(params.id).data
      case 'security.session.revokeAll':
        return this.revokeAllSessions({ email: this.optionalString(payload.email) }).data
      case 'security.session.touch':
        return this.touchSession(params.id).data
      case 'security.role.permission':
        return this.setRolePermissions(
          params.role,
          Array.isArray(payload.permissions) ? payload.permissions.filter((item): item is string => typeof item === 'string') : [],
        ).data
      case 'billing.plan.select':
        return this.selectBillingPlan(payload as { planId?: string }).data
      case 'billing.checkout':
        return this.startBillingCheckout(payload as { planId?: string; mode?: 'checkout' | 'manual_sales' }).data
      case 'billing.portal':
        return this.openBillingPortal().data
      case 'billing.subscription.freeze':
        return this.freezeSubscription().data
      case 'billing.subscription.reactivate':
        return this.reactivateSubscription().data
      case 'security.sso.update':
        return this.updateSsoConfig(payload).data
      case 'security.scim.rotate':
        return this.rotateScimToken().data
      case 'security.apiKey.create':
        return this.createApiKey(payload as { label?: string; scopes?: string[]; expiresAt?: string }).data
      case 'security.apiKey.rotate':
        return this.rotateApiKey(params.id).data
      case 'security.apiKey.revoke':
        return this.revokeApiKey(params.id).data
      case 'security.webhook.create':
        return this.createWebhook(payload as { url?: string; events?: string[] }).data
      case 'security.webhook.update':
        return this.updateWebhook(params.id, payload as { url?: string; events?: string[]; status?: 'active' | 'paused' }).data
      case 'security.webhook.rotateSecret':
        return this.rotateWebhookSecret(params.id).data
      case 'security.webhook.delete':
        return this.deleteWebhook(params.id).data
      case 'security.webhook.retryDelivery':
        return this.retryWebhookDelivery(params.id).data
      case 'audit.export':
        return this.auditExport(payload as { format?: 'JSON' | 'CSV'; scope?: string }).data
      default:
        throw new UnprocessableEntityException(`Operation approval action ${request.action} is not executable`)
    }
  }

  private normalizeOperationApprovalPath(value: unknown) {
    if (typeof value !== 'string') {
      return ''
    }
    const raw = value.trim()
    if (!raw) {
      return ''
    }
    let pathname = raw
    try {
      pathname = new URL(raw, 'http://olfactoryops.local').pathname
    } catch {
      pathname = raw.split('?')[0] ?? raw
    }
    pathname = pathname.replace(/^\/api\/v1(?=\/|$)/, '')
    return pathname.startsWith('/') ? pathname : `/${pathname}`
  }

  private matchOperationPath(path: string, pattern: string) {
    const pathParts = path.split('/').filter(Boolean)
    const patternParts = pattern.split('/').filter(Boolean)
    if (pathParts.length !== patternParts.length) {
      return null
    }
    const params: Record<string, string> = {}
    for (let index = 0; index < patternParts.length; index += 1) {
      const expected = patternParts[index]
      const actual = pathParts[index]
      if (!expected || !actual) {
        return null
      }
      if (expected.startsWith(':')) {
        params[expected.slice(1)] = decodeURIComponent(actual)
      } else if (expected !== actual) {
        return null
      }
    }
    return params
  }

  private operationPayloadObject(value: unknown) {
    if (value === undefined || value === null) {
      return {}
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new UnprocessableEntityException('Operation approval payload must be an object')
    }
    const payload = value as Record<string, unknown>
    if (this.containsSensitiveApprovalField(payload)) {
      throw new UnprocessableEntityException('Sensitive credentials cannot be stored in an operation approval request')
    }
    return payload
  }

  private containsSensitiveApprovalField(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.some((item) => this.containsSensitiveApprovalField(item))
    }
    if (!value || typeof value !== 'object') {
      return false
    }
    return Object.entries(value as Record<string, unknown>).some(([key, nestedValue]) => {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
      return sensitiveApprovalFieldNames.has(normalizedKey) || this.containsSensitiveApprovalField(nestedValue)
    })
  }

  private operationApprovalRequestForTenant(id: string, organizationId: string) {
    const request = this.operationApprovalRequestRecords.find(
      (item) => item.id === id && item.organizationId === organizationId,
    )
    if (!request) {
      throw new NotFoundException(`Operation approval request ${id} was not found`)
    }
    return request
  }

  private upsertOperationApprovalRequest(request: OperationApprovalRequestRecord) {
    this.operationApprovalRequestRecords = [
      request,
      ...this.operationApprovalRequestRecords.filter((item) => item.id !== request.id),
    ]
  }

  private operationResultRef(result: unknown) {
    if (!result || typeof result !== 'object') {
      return undefined
    }
    const record = result as Record<string, unknown>
    if (typeof record.id === 'string') {
      return record.id
    }
    for (const key of ['formula', 'line', 'version', 'document', 'lot', 'movement', 'batch', 'supplier', 'purchaseOrder', 'sku', 'priceList', 'quote', 'sample', 'customer', 'order', 'membership', 'session', 'subscription', 'apiKey', 'webhook', 'job']) {
      const nested = record[key]
      if (nested && typeof nested === 'object' && typeof (nested as { id?: unknown }).id === 'string') {
        return (nested as { id: string }).id
      }
    }
    for (const key of ['batchId', 'orderId']) {
      if (typeof record[key] === 'string') {
        return record[key] as string
      }
    }
    return undefined
  }

  private normalizeInventoryApprovalRequest(action: unknown, payloadValue: unknown): NormalizedInventoryApprovalRequest {
    const session = this.currentSession()
    if (
      action !== 'inventory.adjust' &&
      action !== 'inventory.transfer' &&
      action !== 'inventory.receive' &&
      action !== 'inventory.stockTake' &&
      action !== 'inventory.quality'
    ) {
      throw new UnprocessableEntityException(
        'Inventory approval action must be inventory.adjust, inventory.transfer, inventory.receive, inventory.stockTake, or inventory.quality',
      )
    }
    const payload = this.approvalPayloadObject(payloadValue)

    if (action === 'inventory.adjust') {
      const lotId = this.optionalString(payload.lotId)
      const lot = this.lotForSession(lotId, session)
      const quantityGrams = Number(payload.quantityGrams ?? 0)
      if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
        throw new UnprocessableEntityException('Adjustment quantityGrams must be greater than 0')
      }
      if (payload.direction !== undefined && payload.direction !== 'IN' && payload.direction !== 'OUT') {
        throw new UnprocessableEntityException('Adjustment direction must be IN or OUT')
      }
      const direction = payload.direction === 'IN' ? 'IN' : 'OUT'
      const nextQuantity = direction === 'IN' ? lot.quantityGrams + quantityGrams : lot.quantityGrams - quantityGrams
      if (nextQuantity < lot.reservedGrams) {
        throw new UnprocessableEntityException({
          message: 'Adjustment would create negative available stock',
          lotId: lot.id,
          reservedGrams: lot.reservedGrams,
          requestedQuantityGrams: quantityGrams,
        })
      }
      return {
        action,
        requiredPermission: 'inventory.adjust' as const,
        payload: {
          lotId: lot.id,
          direction,
          quantityGrams,
          reason: this.optionalString(payload.reason) || 'Approval-requested stock adjustment',
        } satisfies InventoryAdjustmentBody,
        targetLabel: lot.lotNumber,
        defaultReason: 'Inventory adjustment requires approver review',
      }
    }

    if (action === 'inventory.transfer') {
      const lotId = this.optionalString(payload.lotId)
      const lot = this.lotForSession(lotId, session)
      const toLocation = this.optionalString(payload.toLocation)
      if (!toLocation) {
        throw new UnprocessableEntityException('Transfer toLocation is required')
      }
      if (toLocation === lot.location) {
        throw new UnprocessableEntityException('Transfer target location must be different from current location')
      }
      return {
        action,
        requiredPermission: 'inventory.adjust' as const,
        payload: {
          lotId: lot.id,
          toLocation,
        } satisfies InventoryTransferBody,
        targetLabel: lot.lotNumber,
        defaultReason: 'Inventory transfer requires approver review',
      }
    }

    if (action === 'inventory.stockTake') {
      const lotId = this.optionalString(payload.lotId)
      const lot = this.lotForSession(lotId, session)
      const countedGrams = Number(payload.countedGrams ?? Number.NaN)
      if (!Number.isFinite(countedGrams) || countedGrams < 0) {
        throw new UnprocessableEntityException('Stock take countedGrams must be 0 or greater')
      }
      if (countedGrams < lot.reservedGrams) {
        throw new UnprocessableEntityException({
          message: 'Stock take count cannot be lower than reserved stock',
          lotId: lot.id,
          reservedGrams: lot.reservedGrams,
          countedGrams,
        })
      }
      return {
        action,
        requiredPermission: 'inventory.adjust' as const,
        payload: {
          lotId: lot.id,
          countedGrams,
          reason: this.optionalString(payload.reason) || 'Approval-requested stock take',
        } satisfies InventoryStockTakeBody,
        targetLabel: lot.lotNumber,
        defaultReason: 'Stock take reconciliation requires approver review',
      }
    }

    if (action === 'inventory.quality') {
      const lotId = this.optionalString(payload.lotId)
      const lot = this.lotForSession(lotId, session)
      const qualityStatus = payload.qualityStatus
      if (!this.isLotQualityStatus(qualityStatus)) {
        throw new UnprocessableEntityException('Lot qualityStatus must be APPROVED, QUARANTINE, ON_HOLD, REJECTED, or EXPIRED')
      }
      return {
        action,
        requiredPermission: 'inventory.receive' as const,
        payload: {
          lotId: lot.id,
          qualityStatus,
          reason: this.optionalString(payload.reason) || 'Approval-requested QC status update',
        } satisfies InventoryQualityBody,
        targetLabel: lot.lotNumber,
        defaultReason: 'Lot QC status update requires approver review',
      }
    }

    const materialId = this.optionalString(payload.materialId) || this.materialCatalogForSession(session)[0]?.id
    if (!materialId) {
      throw new NotFoundException('No material is available in this workspace')
    }
    const material = this.materialForSession(materialId, session)
    const quantityGrams = Number(payload.quantityGrams ?? 0)
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new UnprocessableEntityException('Inventory receipt quantityGrams must be greater than 0')
    }
    const qualityStatus = this.isLotQualityStatus(payload.qualityStatus) ? payload.qualityStatus : 'APPROVED'
    const lotNumber = this.optionalString(payload.lotNumber) || `L-${material.cas.replaceAll('-', '')}`
    return {
      action,
      requiredPermission: 'inventory.receive' as const,
      payload: {
        materialId: material.id,
        lotNumber,
        quantityGrams,
        expiryDate: this.optionalString(payload.expiryDate) || '2028-12-31',
        qualityStatus,
        location: this.optionalString(payload.location) || 'Receiving Bay',
        supplierLotRef: this.optionalString(payload.supplierLotRef) || undefined,
        currency: this.optionalString(payload.currency) || 'USD',
        retestDate: this.optionalString(payload.retestDate) || undefined,
        openedDate: this.optionalString(payload.openedDate) || undefined,
        shelfLifeAfterOpeningDays: Number.isFinite(Number(payload.shelfLifeAfterOpeningDays))
          ? Number(payload.shelfLifeAfterOpeningDays)
          : undefined,
        container: this.optionalString(payload.container) || 'Receiving container',
        packaging: this.optionalString(payload.packaging) || undefined,
      } satisfies InventoryReceiptBody,
      targetLabel: lotNumber,
      defaultReason: 'Inventory receipt requires approver review',
    }
  }

  private approvalPayloadObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new UnprocessableEntityException('Inventory approval payload must be an object')
    }
    return value as Record<string, unknown>
  }

  private optionalString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
  }

  private inventoryApprovalRequestForTenant(id: string, organizationId: string) {
    const request = this.inventoryApprovalRequestRecords.find(
      (item) => item.id === id && item.organizationId === organizationId,
    )
    if (!request) {
      throw new NotFoundException(`Inventory approval request ${id} was not found`)
    }
    return request
  }

  private upsertInventoryApprovalRequest(request: InventoryApprovalRequestRecord) {
    this.inventoryApprovalRequestRecords = [
      request,
      ...this.inventoryApprovalRequestRecords.filter((item) => item.id !== request.id),
    ]
  }

  private ssoConfigForOrganization(organizationId: string) {
    const existing = this.ssoConfigRecords.find((config) => config.organizationId === organizationId)
    if (existing) {
      return existing
    }
    const config = this.defaultSsoConfigForOrganization(organizationId)
    this.upsertSsoConfig(config)
    return config
  }

  private defaultSsoConfigForOrganization(organizationId: string): SsoConfigRecord {
    const organization = this.organizationRecords.find((item) => item.id === organizationId)
    const slug = organization?.slug || organizationId.replace(/^org-/, '')
    const domain = organization?.customDomain || this.defaultTenantDomain(slug)
    const now = new Date().toISOString()
    return {
      id: `SSO-${organizationId.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 36)}`,
      organizationId,
      provider: 'OIDC',
      domain,
      status: 'verified',
      issuerUrl: `https://idp.${domain}/oauth2/default`,
      metadataUrl: `https://idp.${domain}/.well-known/openid-configuration`,
      clientId: undefined,
      acsUrl: `https://api.labofscents.org/api/v1/auth/sso/callback/${organizationId}`,
      entityId: `urn:olfactoryops:${organizationId}`,
      domainVerifiedAt: now,
      jitProvisioning: true,
      enforceSso: false,
      scim: {
        enabled: false,
        baseUrl: `https://api.labofscents.org/api/v1/scim/v2/${organizationId}`,
        deprovisionAction: 'revoke_sessions',
        status: 'disabled',
      },
      roleMapping: {
        [`${slug}-admins`]: 'Owner',
        [`${slug}-lab`]: 'Lab Manager',
        [`${slug}-viewers`]: 'Viewer',
      },
      updatedAt: now,
    }
  }

  private upsertSsoConfig(config: SsoConfigRecord) {
    this.ssoConfigRecords = [
      config,
      ...this.ssoConfigRecords.filter((item) => item.organizationId !== config.organizationId),
    ]
  }

  private publicSsoConfig(config: SsoConfigRecord): SsoConfigRecord {
    const { tokenHash: _tokenHash, ...safeScim } = config.scim
    return {
      ...config,
      scim: safeScim,
    }
  }

  private publicApiKeysForOrganization(organizationId: string) {
    return this.apiKeyRecords
      .filter((key) => key.organizationId === organizationId)
      .map((key) => this.publicApiKey(key))
  }

  private publicApiKey(key: ApiKeyRecord): ApiKeyRecord {
    const { secretHash: _secretHash, ...safeKey } = key
    return safeKey
  }

  private apiKeyForTenant(id: string, organizationId: string) {
    const key = this.apiKeyRecords.find((item) => item.id === id && item.organizationId === organizationId)
    if (!key) {
      throw new NotFoundException(`API key ${id} was not found`)
    }
    return key
  }

  private upsertApiKey(key: ApiKeyRecord) {
    this.apiKeyRecords = [key, ...this.apiKeyRecords.filter((item) => item.id !== key.id)]
  }

  private webhooksForOrganization(organizationId: string) {
    return this.webhookRecords.filter((webhook) => webhook.organizationId === organizationId)
  }

  private webhookForTenant(id: string, organizationId: string) {
    const webhook = this.webhookRecords.find((item) => item.id === id && item.organizationId === organizationId)
    if (!webhook) {
      throw new NotFoundException(`Webhook ${id} was not found`)
    }
    return webhook
  }

  private upsertWebhook(webhook: WebhookRecord) {
    this.webhookRecords = [webhook, ...this.webhookRecords.filter((item) => item.id !== webhook.id)]
  }

  private webhookDeliveriesForOrganization(organizationId: string) {
    const webhookIds = new Set(this.webhooksForOrganization(organizationId).map((webhook) => webhook.id))
    return this.webhookDeliveryRecords.filter((delivery) => webhookIds.has(delivery.webhookId))
  }

  private auditExportsForOrganization(organizationId: string) {
    return this.auditExportRecords.filter((job) => job.organizationId === organizationId)
  }

  private requireApiAccessPlan() {
    const plan = this.planForSubscription(this.currentSubscription())
    if (plan.limits.apiCalls <= 0) {
      throw new ForbiddenException('API keys require a paid plan with API access')
    }
  }

  private requireWebhookCapacity() {
    const subscription = this.currentSubscription()
    const plan = this.planForSubscription(subscription)
    const activeWebhooks = this.webhooksForOrganization(subscription.organizationId).filter(
      (webhook) => webhook.status === 'active',
    ).length
    if (activeWebhooks + 1 > plan.limits.webhooks) {
      throw new UnprocessableEntityException({
        message: 'Webhook limit exceeded for current plan',
        limitKey: 'webhooks',
        current: activeWebhooks,
        increment: 1,
        limit: plan.limits.webhooks,
      })
    }
  }

  private requireEnterpriseIdentityPlan() {
    const plan = this.planForSubscription(this.currentSubscription())
    if (plan.id !== 'PLAN-MAISON') {
      throw new ForbiddenException('SSO enforcement and SCIM token rotation require the Maison enterprise plan')
    }
  }

  private defaultTenantDomain(slug: string) {
    return `${slug}.labofscents.org`
  }

  private normalizeSignupDomain(value: unknown, fallback: string) {
    return this.normalizeDomain(value, fallback)
  }

  private assertSignupPassword(password: string) {
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new UnprocessableEntityException('Signup password must be at least 12 characters and include letters and numbers')
    }
  }

  private normalizeDomain(value: unknown, fallback: string) {
    if (typeof value !== 'string' || !value.trim()) {
      return fallback
    }
    const domain = value.trim().toLowerCase()
    if (!/^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(domain)) {
      throw new UnprocessableEntityException('SSO domain must be a valid DNS domain')
    }
    return domain
  }

  private normalizeHttpsUrl(value: unknown, fallback: string, label: string) {
    if (typeof value !== 'string' || !value.trim()) {
      if (fallback) {
        return fallback
      }
      throw new UnprocessableEntityException(`${label} is required`)
    }
    try {
      const url = new URL(value.trim())
      if (url.protocol !== 'https:') {
        throw new Error('non-https')
      }
      return url.toString()
    } catch {
      throw new UnprocessableEntityException(`${label} must be a valid HTTPS URL`)
    }
  }

  private normalizeRoleMapping(value: unknown, fallback: Record<string, string>) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fallback
    }
    const allowedRoles = new Set(this.organizationRolePolicies().map((policy) => policy.role))
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([group, role]) => [group.trim().slice(0, 80), typeof role === 'string' ? role.trim() : ''] as const)
      .filter(([group, role]) => group && allowedRoles.has(role))
      .slice(0, 25)
    if (entries.length === 0) {
      return fallback
    }
    return Object.fromEntries(entries)
  }

  private normalizeApiKeyScopes(value: unknown) {
    const allowedScopes = new Set([
      'materials.read',
      'formulas.read',
      'orders.write',
      'documents.read',
      'webhooks.read',
      'audit.read',
    ])
    const scopes = Array.isArray(value)
      ? value.filter((scope): scope is string => typeof scope === 'string' && allowedScopes.has(scope))
      : []
    return [...new Set(scopes.length > 0 ? scopes : ['materials.read'])].slice(0, 8)
  }

  private normalizeWebhookEvents(value: unknown) {
    const allowedEvents = new Set([
      'order.reserved',
      'order.fulfilled',
      'document.downloaded',
      'audit.export.ready',
      'inventory.low_stock',
      'formula.approved',
    ])
    const events = Array.isArray(value)
      ? value.filter((event): event is string => typeof event === 'string' && allowedEvents.has(event))
      : []
    if (events.length === 0) {
      throw new UnprocessableEntityException('Webhook must subscribe to at least one supported event')
    }
    return [...new Set(events)].slice(0, 12)
  }

  private normalizeOptionalIsoDate(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
      return undefined
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new UnprocessableEntityException('Expiration date must be a valid ISO date')
    }
    return date.toISOString()
  }

  private createSecret(prefix: 'oo_live' | 'whsec' | 'scim_oo') {
    return `${prefix}_${randomBytes(24).toString('base64url')}`
  }

  private mfaEnrollmentForSession(session: Pick<AuthSession, 'userId' | 'organizationId'>) {
    return this.mfaEnrollmentRecords.find(
      (record) => record.userId === session.userId && record.organizationId === session.organizationId,
    )
  }

  private upsertMfaEnrollment(enrollment: MfaEnrollmentRecord) {
    this.mfaEnrollmentRecords = [
      enrollment,
      ...this.mfaEnrollmentRecords.filter(
        (record) =>
          record.userId !== enrollment.userId || record.organizationId !== enrollment.organizationId,
      ),
    ]
  }

  private requireMfaEncryptionKey() {
    if (!this.mfaEncryptionKey) {
      throw new UnprocessableEntityException('MFA enrollment is temporarily unavailable')
    }
    return this.mfaEncryptionKey
  }

  private mfaEncryptionAad(session: Pick<AuthSession, 'userId' | 'organizationId'>) {
    return Buffer.from(
      `olfactoryops:mfa:v1:${session.organizationId}:${session.userId}`,
      'utf8',
    )
  }

  private encryptMfaSecret(secret: string, session: Pick<AuthSession, 'userId' | 'organizationId'>) {
    const key = this.requireMfaEncryptionKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(this.mfaEncryptionAad(session))
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [
      'aes256gcm',
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':')
  }

  private decryptMfaSecret(
    enrollment: MfaEnrollmentRecord,
    session: Pick<AuthSession, 'userId' | 'organizationId'>,
  ) {
    const [algorithm, version, ivValue, tagValue, ciphertextValue] = enrollment.encryptedSecret.split(':')
    if (algorithm !== 'aes256gcm' || version !== 'v1' || !ivValue || !tagValue || !ciphertextValue) {
      throw new UnprocessableEntityException('Stored MFA enrollment cannot be verified')
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.requireMfaEncryptionKey(),
        Buffer.from(ivValue, 'base64url'),
      )
      decipher.setAAD(this.mfaEncryptionAad(session))
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    } catch {
      throw new UnprocessableEntityException('Stored MFA enrollment cannot be verified')
    }
  }

  private base32Encode(value: Buffer) {
    let bits = 0
    let accumulator = 0
    let output = ''
    for (const byte of value) {
      accumulator = (accumulator << 8) | byte
      bits += 8
      while (bits >= 5) {
        output += base32Alphabet[(accumulator >>> (bits - 5)) & 31]
        bits -= 5
      }
    }
    if (bits > 0) {
      output += base32Alphabet[(accumulator << (5 - bits)) & 31]
    }
    return output
  }

  private base32Decode(value: string) {
    let bits = 0
    let accumulator = 0
    const bytes: number[] = []
    for (const character of value.toUpperCase().replace(/=+$/g, '')) {
      const index = base32Alphabet.indexOf(character)
      if (index < 0) {
        throw new UnprocessableEntityException('Stored MFA enrollment cannot be verified')
      }
      accumulator = (accumulator << 5) | index
      bits += 5
      if (bits >= 8) {
        bytes.push((accumulator >>> (bits - 8)) & 255)
        bits -= 8
      }
    }
    return Buffer.from(bytes)
  }

  private totpCode(secret: string, timestampMs: number) {
    const counter = Math.floor(timestampMs / 1000 / mfaTotpPeriodSeconds)
    const counterBuffer = Buffer.alloc(8)
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0)
    counterBuffer.writeUInt32BE(counter >>> 0, 4)
    const digest = createHmac('sha1', this.base32Decode(secret)).update(counterBuffer).digest()
    const offset = digest[digest.length - 1] & 0x0f
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)
    return String(binary % 10 ** mfaTotpDigits).padStart(mfaTotpDigits, '0')
  }

  private verifyTotpCode(secret: string, code: string, timestampMs: number) {
    for (const offset of [-1, 0, 1]) {
      const candidate = this.totpCode(secret, timestampMs + offset * mfaTotpPeriodSeconds * 1000)
      if (this.constantTimeStringEquals(candidate, code)) {
        return true
      }
    }
    return false
  }

  private createMfaRecoveryCode() {
    const compact = randomBytes(mfaRecoveryCodeBytes).toString('hex').toUpperCase()
    return compact.match(/.{1,4}/g)?.join('-') ?? compact
  }

  private hashMfaRecoveryCode(
    code: string,
    session: Pick<AuthSession, 'userId' | 'organizationId'>,
  ) {
    return this.hashSecret(
      `mfa-recovery:v1:${session.organizationId}:${session.userId}:${code.replace(/[^A-Z0-9]/gi, '').toUpperCase()}`,
    )
  }

  private hashSecret(secret: string) {
    return `sha256:${createHash('sha256').update(secret).digest('hex')}`
  }

  private passwordHashForEmail(email: string, password: string) {
    const salt = randomBytes(passwordHashSaltBytes).toString('base64url')
    const digest = this.pbkdf2PasswordDigest(email, password, salt, passwordHashIterations, passwordHashKeyLength)
    return `pbkdf2:v1:${passwordHashAlgorithm}:${passwordHashIterations}:${salt}:${digest}`
  }

  private verifyPasswordCredential(credential: AuthCredentialRecord, email: string, password: string) {
    if (credential.passwordHash.startsWith('pbkdf2:v1:')) {
      return { valid: this.verifyPbkdf2PasswordHash(credential.passwordHash, email, password), needsRehash: false }
    }

    const legacyHash = this.legacyPasswordHashForEmail(email, password)
    return {
      valid: this.constantTimeStringEquals(credential.passwordHash, legacyHash),
      needsRehash: credential.passwordHash.startsWith('sha256:'),
    }
  }

  private verifyPbkdf2PasswordHash(storedHash: string, email: string, password: string) {
    const [, version, algorithm, iterationsValue, salt, digest] = storedHash.split(':')
    const iterations = Number(iterationsValue)
    if (
      version !== 'v1' ||
      algorithm !== passwordHashAlgorithm ||
      !Number.isInteger(iterations) ||
      iterations < 100_000 ||
      !salt ||
      iterations > passwordHashIterations ||
      !digest
    ) {
      return false
    }
    const keyLength = Buffer.from(digest, 'base64url').length
    if (keyLength <= 0) {
      return false
    }
    const candidate = this.pbkdf2PasswordDigest(email, password, salt, iterations, keyLength)
    return this.constantTimeStringEquals(candidate, digest)
  }

  private pbkdf2PasswordDigest(
    email: string,
    password: string,
    salt: string,
    iterations: number,
    keyLength: number,
  ) {
    return pbkdf2Sync(
      `auth:v2:${email.trim().toLowerCase()}:${password}`,
      salt,
      iterations,
      keyLength,
      passwordHashAlgorithm,
    ).toString('base64url')
  }

  private legacyPasswordHashForEmail(email: string, password: string) {
    return this.hashSecret(`auth:v1:${email.trim().toLowerCase()}:${password}`)
  }

  private upgradePasswordCredential(credential: AuthCredentialRecord, email: string, password: string) {
    const upgraded: AuthCredentialRecord = {
      ...credential,
      passwordHash: this.passwordHashForEmail(email, password),
      passwordSetAt: new Date().toISOString(),
    }
    this.authCredentialRecords = this.authCredentialRecords.map((item) =>
      item.email === credential.email ? upgraded : item,
    )
    this.securityStateDirty = true
  }

  private constantTimeStringEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    if (leftBuffer.length !== rightBuffer.length) {
      return false
    }
    return timingSafeEqual(leftBuffer, rightBuffer)
  }

  private lastFour(secret: string) {
    return secret.slice(-4).toUpperCase()
  }

  private shortId() {
    return randomBytes(5).toString('hex').toUpperCase()
  }

  private invoicesForSubscription(subscriptionId: string) {
    return this.invoiceRecords.filter((invoice) => invoice.subscriptionId === subscriptionId)
  }

  private billingPlanForId(planId: string) {
    const plan = billingPlans.find((item) => item.id === planId)
    if (!plan) {
      throw new UnprocessableEntityException(`Plan ${planId} is not available`)
    }
    return plan
  }

  private planForSubscription(subscription: BillingSubscriptionRecord) {
    return this.billingPlanForId(subscription.planId)
  }

  private organizationPlanForBillingPlan(planId: string): OrganizationRecord['plan'] {
    if (planId === 'PLAN-APPRENTICE') return 'Free'
    if (planId === 'PLAN-ARTISAN') return 'Pro'
    if (planId === 'PLAN-MAISON') return 'Enterprise'
    return 'Team'
  }

  private addDays(value: string, days: number) {
    const date = new Date(value)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString()
  }

  private addMonths(value: string, months: number) {
    const date = new Date(value)
    date.setUTCMonth(date.getUTCMonth() + months)
    return date.toISOString()
  }

  private billingUsageRecord(subscription: BillingSubscriptionRecord): BillingUsageMeterRecord {
    const organizationId = subscription.organizationId
    const materials = this.materialRecords.filter(
      (material) => (material.organizationId || 'org-nxl') === organizationId,
    )
    const formulas = this.formulaRecords.filter(
      (formula) => (formula.organizationId || 'org-nxl') === organizationId,
    )
    const lots = this.lots.filter((lot) => (lot.organizationId || 'org-nxl') === organizationId)
    const batches = this.productionBatchRecords.filter((batch) =>
      formulas.some((formula) => formula.id === batch.formulaId),
    )
    const tenantRecordIds = new Set([
      ...materials.map((material) => material.id),
      ...formulas.map((formula) => formula.id),
      ...lots.map((lot) => lot.id),
      ...batches.map((batch) => batch.id),
    ])
    const documents = this.documentRecords.filter((document) => tenantRecordIds.has(document.linkedTo))
    const tenantActors = new Set(
      this.membershipRecords
        .filter((membership) => membership.organizationId === organizationId)
        .flatMap((membership) => [membership.userId, membership.email]),
    )
    const auditEvents = this.auditEvents.filter(
      (event) => event.entity.includes(organizationId) || tenantActors.has(event.actor),
    )
    const documentStorageGb = documents.reduce((total, document) => total + document.sizeKb, 0) / 1024 / 1024
    return {
      id: `USG-${subscription.organizationId}-${subscription.currentPeriodStart.slice(0, 7)}`,
      organizationId: subscription.organizationId,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      activeSeats: this.membershipRecords.filter(
        (membership) => membership.organizationId === subscription.organizationId && membership.status === 'ACTIVE',
      ).length,
      materials: materials.length,
      formulas: formulas.length,
      lots: lots.length,
      documents: documents.length,
      storageGb: Number(documentStorageGb.toFixed(6)),
      apiCalls: auditEvents.length,
      webhooks: this.webhooksForOrganization(subscription.organizationId).filter((webhook) => webhook.status === 'active').length,
      auditEvents: auditEvents.length,
      lastCalculatedAt: new Date().toISOString(),
    }
  }

  private billingLimitChecks(usage: BillingUsageMeterRecord, plan: BillingPlanRecord): BillingLimitCheck[] {
    const rows: { key: BillingLimitKey; label: string; used: number }[] = [
      { key: 'seats', label: 'Active seats', used: usage.activeSeats },
      { key: 'materials', label: 'Materials', used: usage.materials },
      { key: 'formulas', label: 'Formulas', used: usage.formulas },
      { key: 'lots', label: 'Lots', used: usage.lots },
      { key: 'documents', label: 'Documents', used: usage.documents },
      { key: 'storageGb', label: 'Document storage GB', used: usage.storageGb },
      { key: 'apiCalls', label: 'Audited API activity', used: usage.apiCalls },
      { key: 'webhooks', label: 'Active webhooks', used: usage.webhooks },
    ]

    return rows.map(({ key, label, used }) => {
      const limit = plan.limits[key]
      const percent = limit === 0 ? 100 : Math.round((used / limit) * 100)
      return {
        key,
        label,
        used,
        limit,
        percent,
        status: used > limit ? 'blocked' : percent >= 80 ? 'warning' : 'pass',
      }
    })
  }

  private commercialReadinessChecks(
    limitChecks: BillingLimitCheck[],
    subscription: BillingSubscriptionRecord,
    invoices: BillingInvoiceRecord[],
  ) {
    const hasBlockedLimit = limitChecks.some((check) => check.status === 'blocked')
    const sso = this.ssoConfigForOrganization(subscription.organizationId)
    const apiKeys = this.publicApiKeysForOrganization(subscription.organizationId)
    const webhooks = this.webhooksForOrganization(subscription.organizationId)
    const deliveries = this.webhookDeliveriesForOrganization(subscription.organizationId)
    const exports = this.auditExportsForOrganization(subscription.organizationId)
    const retryingDelivery = deliveries.some((delivery) => delivery.status === 'retrying')
    const plan = this.planForSubscription(subscription)
    return [
      {
        key: 'subscription-state',
        label: 'Subscription state gates writes',
        status: subscription.canWrite ? 'pass' : 'blocked',
        detail: `${subscription.status} subscription; write access is ${subscription.canWrite ? 'enabled' : 'frozen'}`,
      },
      {
        key: 'plan-limit-enforcement',
        label: 'Plan limits enforced server-side',
        status: hasBlockedLimit ? 'blocked' : 'pass',
        detail: hasBlockedLimit ? 'At least one limit is exceeded' : 'All tracked usage is within plan limits',
      },
      {
        key: 'invoice-lifecycle',
        label: 'Invoice lifecycle present',
        status: subscription.status === 'active' || invoices.length > 0 ? 'pass' : 'warning',
        detail: `${invoices.length} invoice record(s) linked to subscription ${subscription.id}`,
      },
      {
        key: 'webhook-idempotency',
        label: 'Webhook retry/idempotency evidence',
        status: webhooks.length === 0 ? 'warning' : retryingDelivery ? 'warning' : 'pass',
        detail:
          webhooks.length === 0
            ? 'No signed webhook endpoint has been configured'
            : retryingDelivery
              ? 'A delivery is retrying with preserved idempotency key'
              : 'Webhook deliveries are healthy',
      },
      {
        key: 'enterprise-identity',
        label: 'SSO/SCIM readiness',
        status: sso.status === 'enforced' || (sso.status === 'verified' && sso.scim.enabled) ? 'pass' : 'warning',
        detail:
          plan.id === 'PLAN-MAISON'
            ? `${sso.provider} for ${sso.domain} is ${sso.status}; SCIM is ${sso.scim.status}`
            : 'Maison plan required before SSO enforcement or SCIM token rotation',
      },
      {
        key: 'api-key-lifecycle',
        label: 'API key lifecycle',
        status: apiKeys.some((key) => key.status === 'active') ? 'pass' : 'warning',
        detail: `${apiKeys.filter((key) => key.status === 'active').length} active API key(s); rotation is reveal-once`,
      },
      {
        key: 'audit-export-evidence',
        label: 'Audit export evidence',
        status: exports.some((job) => job.status === 'READY') ? 'pass' : 'warning',
        detail: `${exports.length} tenant-scoped audit export job(s) retained with checksum`,
      },
    ] satisfies BillingConsoleResponse['readiness']
  }

  private usageValueForLimit(usage: BillingUsageMeterRecord, limitKey: BillingLimitKey) {
    if (limitKey === 'seats') return usage.activeSeats
    if (limitKey === 'apiCalls') return usage.apiCalls
    if (limitKey === 'storageGb') return usage.storageGb
    if (limitKey === 'auditRetentionDays') return 0
    return usage[limitKey]
  }

  private recordDocumentDownloadAudit(
    document: DocumentRecord,
    actor: string,
    outcome: AuditEvent['outcome'],
  ) {
    this.auditCounter += 1
    const event: AuditEvent = {
      id: `AUD-DOC-${String(this.auditCounter).padStart(4, '0')}`,
      at: new Date().toISOString(),
      actor,
      action: 'document.download',
      entity: document.id,
      requestId: `req_doc_${String(this.auditCounter).padStart(4, '0')}`,
      outcome,
    }
    this.auditEvents = [event, ...this.auditEvents]
    return event
  }

  private currentSession() {
    this.refreshSessionStates()
    if (!this.activeSessionId) {
      throw new UnauthorizedException('Authentication required')
    }
    const activeSession = this.sessions.find((item) => item.id === this.activeSessionId && item.status === 'ACTIVE')
    if (!activeSession) {
      throw new UnauthorizedException('Invalid or expired session')
    }
    this.ensureSessionCsrfToken(activeSession.id)
    const securedSession = this.sessions.find((item) => item.id === activeSession.id && item.status === 'ACTIVE')
    if (!securedSession) {
      throw new UnauthorizedException('Invalid or expired session')
    }
    return securedSession
  }

  private normalizeOptionalBrandLogoUrl(value: unknown, fallback?: string) {
    if (value === undefined) {
      return fallback
    }
    if (typeof value !== 'string' || !value.trim()) {
      return undefined
    }
    if (value.length > 2048) {
      throw new UnprocessableEntityException('Logo image URL must be 2048 characters or fewer')
    }
    try {
      const url = new URL(value.trim())
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('unsafe-logo-url')
      }
      return url.toString()
    } catch {
      throw new UnprocessableEntityException('Logo image URL must be a valid HTTPS URL')
    }
  }

  private workspaceBrandingForOrganization(organizationId: string): BrandingConfig {
    if (this.brandingRecord.organizationId === organizationId) {
      return this.brandingRecord
    }

    return {
      organizationId,
      displayName: 'OlfactoryOps',
      accentColor: '#0f766e',
      documentFooter: 'Confidential workspace record',
      labelTemplate: 'OLF-{sequence}',
      logoMode: 'wordmark',
    }
  }

  private publicSecurityPolicyForSession(session: AuthSession) {
    return {
      ...tenantSecurityPolicy,
      organizationId: session.organizationId,
      ipAllowlist: [],
    }
  }

  private fullSecurityPolicyForSession(session: AuthSession) {
    return {
      ...tenantSecurityPolicy,
      organizationId: session.organizationId,
    }
  }

  private auditEventsForSession(session: AuthSession) {
    return this.auditEvents.filter(
      (event) =>
        event.entity.includes(session.organizationId) ||
        event.actor === session.userId ||
        event.actor === session.email ||
        event.actor === session.role ||
        event.actor === 'api:auth',
    )
  }

  private exposeSession(session: AuthSession) {
    const { csrfToken: _csrfToken, ...safeSession } = session
    return safeSession
  }

  private exposeSessions(sessions: AuthSession[]) {
    return sessions.map((session) => this.exposeSession(session))
  }

  private requireSessionCsrfToken(session: AuthSession) {
    const csrfToken = this.ensureSessionCsrfToken(session.id)
    if (!csrfToken) {
      throw new UnauthorizedException('Session security token is unavailable')
    }
    return csrfToken
  }

  private ensureSessionCsrfToken(sessionId: string) {
    const session = this.sessions.find((item) => item.id === sessionId)
    if (!session) {
      return undefined
    }
    if (session.csrfToken) {
      return session.csrfToken
    }
    const csrfToken = this.createCsrfToken()
    this.sessions = this.sessions.map((item) => (item.id === sessionId ? { ...item, csrfToken } : item))
    this.securityStateDirty = true
    return csrfToken
  }

  private createCsrfToken() {
    const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return `csrf_${randomId.replace(/[^a-zA-Z0-9-]/g, '')}`
  }

  private requireFormulaApproverRole(session: AuthSession) {
    const effectiveRole = this.normalizeRoleForPermission(session.role)
    if (effectiveRole !== 'Admin' && effectiveRole !== 'Lab Manager' && effectiveRole !== 'Manager') {
      throw new ForbiddenException('Formula approval requires Admin or Manager role')
    }
  }

  private requirePermission(role: string, permission: string) {
    if (!this.roleHasPermission(role, permission)) {
      throw new ForbiddenException(`Role ${role} cannot perform ${permission}`)
    }
  }

  private roleHasPermission(role: string, permission: string) {
    role = this.normalizeRoleForPermission(role)
    return this.rolePolicyRecords.some(
      (policy) => policy.role === role && policy.permissions.includes(permission),
    )
  }

  private normalizeRoleForPermission(role: string) {
    return role.trim()
  }

  private organizationRolePolicies() {
    return this.rolePolicyRecords.filter((item) => item.scope === 'organization')
  }

  private organizationPermissionCatalog() {
    return permissionCatalog.filter((permission) => permission.scope === 'organization')
  }

  private buildPermissionMatrix(rolePolicyRows: RolePolicy[]): RolePermissionMatrix[] {
    const catalog = this.organizationPermissionCatalog()
    const highRiskPermissionKeys = new Set(
      catalog
        .filter((permission) => permission.risk === 'high' || permission.risk === 'critical')
        .map((permission) => permission.key),
    )

    return rolePolicyRows.map((policy) => {
      const allowedSet = new Set(policy.permissions)
      const allowedPermissions = catalog
        .map((permission) => permission.key)
        .filter((permission) => allowedSet.has(permission))
      return {
        role: policy.role,
        scope: policy.scope,
        mfaRequired: policy.mfaRequired,
        allowedPermissions,
        deniedPermissions: catalog
          .map((permission) => permission.key)
          .filter((permission) => !allowedSet.has(permission)),
        highRiskPermissions: allowedPermissions.filter((permission) => highRiskPermissionKeys.has(permission)),
      }
    })
  }

  private permissionDecision(role: string, permission: string) {
    const rolePolicy = this.rolePolicyRecords.find((policy) => policy.role === role)
    const permissionDefinition = permissionCatalog.find((item) => item.key === permission)
    const allowed = Boolean(rolePolicy?.permissions.includes(permission))
    return {
      allowed,
      role,
      permission,
      knownRole: Boolean(rolePolicy),
      knownPermission: Boolean(permissionDefinition),
      mfaRequired: Boolean(rolePolicy?.mfaRequired),
      risk: permissionDefinition?.risk ?? 'medium',
      category: permissionDefinition?.category ?? 'Unknown',
      reason: allowed
        ? `${role} includes ${permission} in the server-side role policy`
        : `${role} does not include ${permission} in the server-side role policy`,
    }
  }

  private createProductionWorkOrder(batchId: string, now: Date): ProductionBatchRecord['workOrder'] {
    return {
      id: `WO-${batchId}`,
      scheduledStartAt: now.toISOString(),
      dueAt: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      equipment: 'Pilot kettle PK-02',
      steps: [
        {
          id: `WO-${batchId}-01`,
          label: 'Weigh raw materials',
          status: 'READY',
          equipment: 'Balance A-12',
          plannedMinutes: 45,
        },
        {
          id: `WO-${batchId}-02`,
          label: 'Maceration hold',
          status: 'PENDING',
          equipment: 'Amber vessel AV-04',
          plannedMinutes: 2880,
        },
        {
          id: `WO-${batchId}-03`,
          label: 'Filter and bottle',
          status: 'PENDING',
          equipment: 'Filter skid FS-01',
          plannedMinutes: 90,
        },
      ],
    }
  }

  private createProductionQcChecks(batchId: string): ProductionBatchRecord['qcChecks'] {
    return [
      { id: `QC-${batchId}-ODOR`, label: 'Organoleptic match', result: 'PENDING' },
      { id: `QC-${batchId}-CLARITY`, label: 'Clarity after filtration', result: 'PENDING' },
      { id: `QC-${batchId}-DENSITY`, label: 'Density check', result: 'PENDING' },
    ]
  }

  private normalizeProductionBatches() {
    this.productionBatchRecords = this.productionBatchRecords.map((batch) => {
      const legacy = batch as ProductionBatchRecord & {
        workOrder?: ProductionBatchRecord['workOrder']
        qcChecks?: ProductionBatchRecord['qcChecks']
        genealogy?: ProductionBatchRecord['genealogy']
      }

      return {
        ...batch,
        workOrder: legacy.workOrder ?? this.createProductionWorkOrder(batch.id, new Date()),
        qcChecks: legacy.qcChecks ?? this.createProductionQcChecks(batch.id),
        genealogy: legacy.genealogy ?? {
          inputLotIds: [],
          inputMovementIds: [],
          outputLotId: legacy.outputLot?.id,
        },
      }
    })
  }

  private updateWorkOrderStep(
    workOrder: ProductionBatchRecord['workOrder'],
    label: string,
    status: ProductionBatchRecord['workOrder']['steps'][number]['status'],
    evidence: string,
  ): ProductionBatchRecord['workOrder'] {
    return {
      ...workOrder,
      steps: workOrder.steps.map((step) =>
        step.label === label
          ? {
              ...step,
              status,
              evidence,
            }
          : step,
      ),
    }
  }

  private releaseProductionOutputLot(batch: ProductionBatchRecord): ProductionBatchRecord {
    if (batch.outputLot) {
      return batch
    }

    const releasedAt = new Date().toISOString()
    const yieldGrams = Number((batch.consumedGrams * 0.985).toFixed(3))
    const yieldVariancePercent = Number((((yieldGrams - batch.targetGrams) / batch.targetGrams) * 100).toFixed(2))
    const outputLot = {
      id: `FG-${batch.id}`,
      lotNumber: `FG-${batch.id}`,
      formulaId: batch.formulaId,
      quantityGrams: yieldGrams,
      qualityStatus: 'RELEASED' as const,
      releasedAt,
    }

    return {
      ...batch,
      yieldGrams,
      yieldVariancePercent,
      outputLot,
      genealogy: {
        ...batch.genealogy,
        outputLotId: outputLot.id,
      },
      workOrder: this.updateWorkOrderStep(batch.workOrder, 'Filter and bottle', 'DONE', outputLot.id),
    }
  }

  private revokeSessionsForEmail(email: string) {
    const normalizedEmail = email.toLowerCase()
    const revokedSessions: AuthSession[] = []
    this.sessions = this.sessions.map((session) => {
      if (session.email.toLowerCase() !== normalizedEmail || session.status !== 'ACTIVE') {
        return session
      }
      const revoked = this.revokeSessionShape(session, 'MEMBERSHIP_DEACTIVATED')
      revokedSessions.push(revoked)
      return revoked
    })
    return revokedSessions
  }

  private revokeSessionRecord(session: AuthSession, reason: SessionRevokeReason) {
    const revoked = this.revokeSessionShape(session, reason)
    this.sessions = this.sessions.map((item) => (item.id === session.id ? revoked : item))
    return revoked
  }

  private revokeSessionShape(session: AuthSession, reason: SessionRevokeReason) {
    const now = new Date().toISOString()
    return {
      ...session,
      status: 'REVOKED' as const,
      revokedAt: now,
      revokedReason: reason,
    }
  }

  private enforceConcurrentSessionLimit(email: string, currentSessionId: string) {
    const normalizedEmail = email.toLowerCase()
    const activeSessions = this.sessions
      .filter((session) => session.email.toLowerCase() === normalizedEmail && session.status === 'ACTIVE')
      .sort((left, right) => new Date(left.issuedAt).getTime() - new Date(right.issuedAt).getTime())
    const overflow = activeSessions.length - tenantSecurityPolicy.concurrentSessionLimit
    if (overflow <= 0) {
      return []
    }

    const revokedSessions: AuthSession[] = []
    const revokeIds = new Set(
      activeSessions
        .filter((session) => session.id !== currentSessionId)
        .slice(0, overflow)
        .map((session) => session.id),
    )
    this.sessions = this.sessions.map((session) => {
      if (!revokeIds.has(session.id)) {
        return session
      }
      const revoked = this.revokeSessionShape(session, 'CONCURRENT_LIMIT')
      revokedSessions.push(revoked)
      this.recordAudit('session.revoke', session.userId, 'api:auth', 'review')
      return revoked
    })
    return revokedSessions
  }

  private refreshSessionStates(now = new Date()) {
    this.sessions = this.sessions.map((session) => {
      if (session.status !== 'ACTIVE') {
        return session
      }
      const absoluteExpired = new Date(session.expiresAt).getTime() <= now.getTime()
      const idleExpired = new Date(session.idleExpiresAt).getTime() <= now.getTime()
      if (!absoluteExpired && !idleExpired) {
        return session
      }
      this.recordAudit('session.expire', session.userId, 'api:auth', 'review')
      return {
        ...session,
        status: 'EXPIRED' as const,
        revokedAt: now.toISOString(),
        revokedReason: absoluteExpired ? 'ABSOLUTE_TIMEOUT' : 'IDLE_TIMEOUT',
      }
    })
  }

  private permissionsForRole(role: string) {
    return this.rolePolicyRecords.find((policy) => policy.role === role)?.permissions ?? []
  }

  private safeMaterialNumber(value: unknown, fallback: number) {
    const next = Number(value)
    return Number.isFinite(next) && next >= 0 ? next : fallback
  }

  private isLotQualityStatus(value: unknown): value is LotQualityStatus {
    return (
      value === 'APPROVED' ||
      value === 'QUARANTINE' ||
      value === 'ON_HOLD' ||
      value === 'REJECTED' ||
      value === 'EXPIRED'
    )
  }

  private sanitizeMaterialFields(fields: MaterialNumericFields = {}): MaterialNumericFields {
    return Object.fromEntries(
      Object.entries(fields)
        .map(([field, value]) => [field, Number(value)] as const)
        .filter(([, value]) => Number.isFinite(value) && value >= 0),
    ) as MaterialNumericFields
  }

  private mergeMaterial(material: Material, body: MaterialMutationBody, source: string, version: string): Material {
    const date = new Date().toISOString().slice(0, 10)
    const next: Material = {
      ...material,
      name: body.name?.trim() || material.name,
      family: body.family?.trim() || material.family,
      tier: body.tier === 'Top' || body.tier === 'Heart' || body.tier === 'Base' ? body.tier : material.tier,
      vaporPressure:
        body.vaporPressure === undefined ? material.vaporPressure : this.safeMaterialNumber(body.vaporPressure, material.vaporPressure),
      density: body.density === undefined ? material.density : this.safeMaterialNumber(body.density, material.density),
      mw: body.mw === undefined ? material.mw : this.safeMaterialNumber(body.mw, material.mw),
      logP: body.logP === undefined ? material.logP : this.safeMaterialNumber(body.logP, material.logP),
      substantivityHours:
        body.substantivityHours === undefined
          ? material.substantivityHours
          : this.safeMaterialNumber(body.substantivityHours, material.substantivityHours),
      ifraLimit: body.ifraLimit === undefined ? material.ifraLimit : this.safeMaterialNumber(body.ifraLimit, material.ifraLimit),
      costPerGram:
        body.costPerGram === undefined ? material.costPerGram : this.safeMaterialNumber(body.costPerGram, material.costPerGram),
      odor: body.odor ? body.odor.filter(Boolean) : material.odor,
    }
    const trackedFields = [
      'name',
      'family',
      'tier',
      'vaporPressure',
      'density',
      'mw',
      'logP',
      'substantivityHours',
      'ifraLimit',
      'costPerGram',
      'odor',
    ] as const
    const provenance: MaterialProvenance[] = trackedFields
      .filter((field) => body[field] !== undefined && JSON.stringify(next[field]) !== JSON.stringify(material[field]))
      .map((field) => ({ field: String(field), source, version, date }))
    return {
      ...next,
      provenance: [...provenance, ...material.provenance],
    }
  }

  private pubchemProfile(material: Material) {
    if (material.cas === '54464-57-2') {
      return {
        fields: { mw: 234.38, logP: 4.72, vaporPressure: 0.0049 },
        molecules: [
          { name: 'Iso E Super isomer A', cas: '54464-57-2', percent: 72 },
          { name: 'Iso E Super isomer B', cas: '54464-59-4', percent: 28 },
        ],
      }
    }
    if (material.cas === '24851-98-7') {
      return {
        fields: { mw: 226.31, logP: 3.12, vaporPressure: 0.011 },
        molecules: [{ name: 'Methyl dihydrojasmonate', cas: '24851-98-7', percent: 94 }],
      }
    }
    return {
      fields: { mw: material.mw, logP: material.logP, vaporPressure: material.vaporPressure },
      molecules: [{ name: `${material.name} primary component`, cas: material.cas, percent: 100 }],
    }
  }

  private normalizeFormulaRecord(formula: Formula, fallbackOrganizationId = 'org-nxl'): Formula {
    const formulaType = formula.formulaType === 'ACCORD' ? 'ACCORD' : 'FINE_FRAGRANCE'
    return {
      ...formula,
      formulaType,
      organizationId: formula.organizationId || fallbackOrganizationId,
      brandId: formula.brandId || (fallbackOrganizationId === 'org-nxl' ? 'brand-nxl' : `brand-${fallbackOrganizationId}`),
      concentrationType: formula.concentrationType || (formulaType === 'ACCORD' ? 'OTHER' : 'EDP'),
      finalProductConcentrationPercent: Number.isFinite(formula.finalProductConcentrationPercent)
        ? Math.min(100, Math.max(0.01, formula.finalProductConcentrationPercent))
        : formulaType === 'ACCORD' ? 100 : 20,
      targetMarkets: Array.isArray(formula.targetMarkets) ? formula.targetMarkets : [],
      brief: formula.brief || '',
      inspiration: formula.inspiration || '',
      pyramidSummary: formula.pyramidSummary || '',
      tags: Array.isArray(formula.tags) ? formula.tags : [],
      project: formula.project || '',
      collection: formula.collection || '',
      density: Number.isFinite(formula.density) && formula.density > 0 ? formula.density : 1,
      bottleVolumeMl: Number.isFinite(formula.bottleVolumeMl) && formula.bottleVolumeMl > 0 ? formula.bottleVolumeMl : 50,
      bottleCount: Number.isFinite(formula.bottleCount) && formula.bottleCount > 0 ? Math.round(formula.bottleCount) : 1,
      ifraCategory: formula.ifraCategory || '4',
      workflowStatus: formula.workflowStatus || (formula.status === 'stable' ? 'APPROVED' : 'DRAFT'),
      draftRevision: Number.isFinite(formula.draftRevision) && formula.draftRevision > 0 ? Math.round(formula.draftRevision) : 1,
      updatedAt: formula.updatedAt || new Date().toISOString(),
      updatedBy: formula.updatedBy || formula.owner,
      approvalHistory: Array.isArray(formula.approvalHistory) ? formula.approvalHistory : [],
    }
  }

  private lotsForSession(session: AuthSession) {
    return this.lots
      .filter((lot) => (lot.organizationId || 'org-nxl') === session.organizationId)
      .map((lot) => ({ ...lot, organizationId: lot.organizationId || 'org-nxl' }))
  }

  private lotForSession(id: string | undefined, session: AuthSession) {
    const lot = this.lotsForSession(session).find((item) => item.id === id)
    if (!lot) {
      throw new NotFoundException(`Lot ${id} was not found`)
    }
    return lot
  }

  private movementsForLots(lots: InventoryLot[]) {
    const lotIds = new Set(lots.map((lot) => lot.id))
    return this.movements.filter((movement) => lotIds.has(movement.lotId))
  }

  private replaceLotsForSession(session: AuthSession, lots: InventoryLot[]) {
    this.lots = [
      ...lots.map((lot) => ({ ...lot, organizationId: session.organizationId })),
      ...this.lots.filter((lot) => (lot.organizationId || 'org-nxl') !== session.organizationId),
    ]
  }

  private formulaCatalogForSession(session: AuthSession) {
    return this.formulaRecords
      .filter((formula) => {
        const organizationId = formula.organizationId || 'org-nxl'
        return organizationId === session.organizationId
      })
      .map((formula) => this.normalizeFormulaRecord(formula, session.organizationId))
  }

  private materialCatalogForSession(session: AuthSession) {
    return this.materialRecords.filter((material) => !material.organizationId || material.organizationId === session.organizationId)
  }

  private materialForSession(id: string, session: AuthSession) {
    const material = this.materialCatalogForSession(session).find((item) => item.id === id)
    if (!material) {
      throw new NotFoundException(`Material ${id} was not found`)
    }
    return material
  }

  private formulaForSession(id: string, session: AuthSession) {
    const formula = this.formulaCatalogForSession(session).find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    return formula
  }

  private publishedFormulaForLabUsage(id: string, session: AuthSession) {
    if (!id.trim()) {
      throw new UnprocessableEntityException('Select a published formula before recording lab usage')
    }
    const formula = this.formulaForSession(id, session)
    const hasApprovedSnapshot = this.formulaVersionRecords.some(
      (version) =>
        version.formulaId === formula.id &&
        (version.organizationId || 'org-nxl') === session.organizationId &&
        version.status === 'APPROVED',
    )
    if (formula.workflowStatus !== 'APPROVED' || !hasApprovedSnapshot) {
      throw new UnprocessableEntityException(`Formula ${formula.code} must be published before lab inventory usage`)
    }
    return formula
  }

  private requireEditableFormula(formula: Formula) {
    if (formula.workflowStatus === 'APPROVED') {
      throw new UnprocessableEntityException('Approved formulas are immutable; fork a new working draft to continue')
    }
    if (formula.workflowStatus === 'IN_REVIEW') {
      throw new UnprocessableEntityException('Formula is in review; an approver must request changes before editing')
    }
  }

  private replaceFormula(formula: Formula) {
    this.formulaRecords = this.formulaRecords.map((item) =>
      item.id === formula.id && (item.organizationId || 'org-nxl') === formula.organizationId ? formula : item,
    )
  }

  private touchFormula(formula: Formula, session: AuthSession, updates: Partial<Formula>): Formula {
    return {
      ...formula,
      ...updates,
      draftRevision: formula.draftRevision + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: session.email,
    }
  }

  private formulaEvidence(formula: Formula, session: AuthSession) {
    const catalog = this.formulaCatalogForSession(session).map((item) => (item.id === formula.id ? formula : item))
    const materials = this.materialCatalogForSession(session)
    const leaves = resolveFormulaWithCatalog(formula.id, catalog, materials)
    return {
      leaves,
      totals: formulaTotals(leaves),
      ifra: evaluateFormulaIfra(formula, leaves, materials),
      evaporation: evaporationCurve(leaves),
    }
  }

  private normalizeFormulaVersionRecord(version: FormulaVersionRecord, formula: Formula, session: AuthSession): FormulaVersionRecord {
    const evidence = this.formulaEvidence({ ...formula, lines: structuredClone(version.lines) }, session)
    return {
      ...version,
      organizationId: version.organizationId || formula.organizationId,
      metadata: version.metadata || formulaSnapshotMetadata(formula),
      evaluations: Array.isArray(version.evaluations) ? version.evaluations : [],
      resolvedLeaves: Array.isArray(version.resolvedLeaves) ? version.resolvedLeaves : evidence.leaves,
      ifraEvaluation: version.ifraEvaluation || evidence.ifra,
      evaporation:
        Array.isArray(version.evaporation) && version.evaporation.every((point) => Array.isArray(point?.materials))
          ? version.evaporation
          : evidence.evaporation,
    }
  }

  private validateFormulaLineMutation(formulaId: string, body: FormulaLineMutationBody, session: AuthSession) {
    const grams = Number(body.grams ?? 0)
    if (!Number.isFinite(grams) || grams <= 0) {
      throw new UnprocessableEntityException('Formula line grams must be greater than 0')
    }

    const materialId = body.materialId?.trim()
    const childFormulaId = body.childFormulaId?.trim()
    if (Boolean(materialId) === Boolean(childFormulaId)) {
      throw new UnprocessableEntityException('Formula line must reference exactly one material or child formula')
    }

    const material = materialId ? this.materialForSession(materialId, session) : undefined

    const childFormula = childFormulaId
      ? this.formulaCatalogForSession(session).find((item) => item.id === childFormulaId)
      : undefined
    if (childFormulaId && !childFormula) {
      throw new NotFoundException(`Child formula ${childFormulaId} was not found`)
    }
    if (childFormulaId === formulaId || (childFormulaId && this.formulaContainsFormula(childFormulaId, formulaId, session.organizationId))) {
      throw new UnprocessableEntityException('Nested formula would create a cycle')
    }

    return { grams, material, childFormula }
  }

  private formulaContainsFormula(
    rootFormulaId: string,
    targetFormulaId: string,
    organizationId: string,
    trail = new Set<string>(),
  ): boolean {
    if (rootFormulaId === targetFormulaId) {
      return true
    }
    if (trail.has(rootFormulaId)) {
      return false
    }
    const formula = this.formulaRecords.find(
      (item) => item.id === rootFormulaId && (item.organizationId || 'org-nxl') === organizationId,
    )
    if (!formula) {
      return false
    }
    const nextTrail = new Set(trail).add(rootFormulaId)
    return formula.lines.some((line) => {
      if (!line.childFormulaId) {
        return false
      }
      return (
        line.childFormulaId === targetFormulaId ||
        this.formulaContainsFormula(line.childFormulaId, targetFormulaId, organizationId, nextTrail)
      )
    })
  }

  private nextFormulaVersionValue(version: string) {
    const match = /^v(\d+)$/i.exec(version.trim())
    const current = match ? Number(match[1]) : 0
    return `v${current + 1}`
  }

  private formulaVersionChecksum(formula: Formula) {
    const payload = `${formula.id}:${formula.version}:${formula.lines
      .map((line) => `${line.id}:${line.materialId ?? line.childFormulaId}:${line.grams}`)
      .join('|')}`
    let hash = 0
    for (let index = 0; index < payload.length; index += 1) {
      hash = (hash * 31 + payload.charCodeAt(index)) >>> 0
    }
    return `sha256:${hash.toString(16).padStart(8, '0')}`
  }

  private pickLotsForMaterial(materialId: string, requiredGrams: number, session: AuthSession, reservedOnly = false) {
    const material = this.materialForSession(materialId, session)
    const allocations: Allocation[] = []
    let remaining = requiredGrams
    const eligibleLots = this.lotsForSession(session)
      .filter((lot) => lot.materialId === materialId && lot.qualityStatus === 'APPROVED')
      .sort((a, b) => {
        const expirySort = a.expiryDate.localeCompare(b.expiryDate)
        return expirySort || a.receivedDate.localeCompare(b.receivedDate)
      })

    eligibleLots.forEach((lot) => {
      if (remaining <= 0) {
        return
      }
      const available = reservedOnly ? lot.reservedGrams : Math.max(0, lot.quantityGrams - lot.reservedGrams)
      const allocatedGrams = Math.min(available, remaining)
      if (allocatedGrams <= 0) {
        return
      }
      remaining -= allocatedGrams
      allocations.push({
        materialId,
        materialName: material.name,
        requiredGrams,
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        allocatedGrams,
        balanceAfter: lot.quantityGrams - allocatedGrams,
      })
    })

    if (remaining > 0.0001) {
      throw new UnprocessableEntityException({
        message: 'Insufficient eligible inventory',
        materialId,
        requiredGrams,
        availableGrams: requiredGrams - remaining,
      })
    }

    return allocations
  }

  private createOrderDocument(
    orderId: string,
    type: OrderDocumentRecord['type'],
    status: OrderDocumentRecord['status'] = 'READY',
  ) {
    const existing = this.orderDocumentRecords.find((document) => document.orderId === orderId && document.type === type)
    if (existing) {
      return existing
    }
    const document: OrderDocumentRecord = {
      id: `ORD-DOC-${String(this.orderDocumentRecords.length + 1).padStart(3, '0')}`,
      orderId,
      type,
      status,
      url: `/documents/orders/${orderId}/${type.toLowerCase().replace('_', '-')}.pdf`,
      createdAt: new Date().toISOString(),
    }
    this.orderDocumentRecords = [document, ...this.orderDocumentRecords]
    return document
  }

  private buildRfqComparison(body: RfqComparisonBody, session: AuthSession): RfqComparison {
    const materialId = body.materialId?.trim()
    if (!materialId) {
      throw new NotFoundException('Material unknown was not found')
    }
    const material = this.materialForSession(materialId, session)
    const quantityGrams = Number(body.quantityGrams ?? 0)
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new UnprocessableEntityException('RFQ quantityGrams must be greater than 0')
    }
    const options = this.supplierRecords
      .filter((supplier) => supplier.status !== 'alert')
      .map((supplier) => {
        const history = this.priceHistoryRecords
          .filter((record) => record.materialId === material.id && record.supplierId === supplier.id)
          .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0]
        const unitCost = history?.unitCost ?? material.costPerGram
        const currency = history?.currency ?? 'USD'
        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          country: supplier.country,
          leadTimeDays: supplier.leadTimeDays,
          unitCost,
          currency,
          totalCost: Number((unitCost * quantityGrams).toFixed(2)),
          source: history ? 'PRICE_HISTORY' as const : 'MATERIAL_REFERENCE' as const,
          isRecommended: false,
        }
      })
      .sort((left, right) => left.totalCost - right.totalCost || left.leadTimeDays - right.leadTimeDays || left.supplierName.localeCompare(right.supplierName))
    if (options.length === 0) {
      throw new UnprocessableEntityException(`No active suppliers are available to compare for ${material.name}`)
    }
    const recommendedSupplierId = options[0]?.supplierId
    return {
      materialId: material.id,
      materialName: material.name,
      quantityGrams,
      options: options.map((option) => ({ ...option, isRecommended: option.supplierId === recommendedSupplierId })),
      recommendedSupplierId,
      invariant: 'RFQ comparison reads supplier lead time and point-in-time cost evidence; award creates a draft PO without inventory movement',
    }
  }

  private normalizeLabUsagePurpose(value?: LabUsagePurpose): LabUsagePurpose {
    if (value === 'sample' || value === 'production-prep' || value === 'qc' || value === 'waste') {
      return value
    }
    return 'trial'
  }

  private normalizeGeneratedDocumentType(value?: DocumentType | string): DocumentType {
    if (
      value === 'CoA' ||
      value === 'Allergen Declaration' ||
      value === 'GHS Label' ||
      value === 'Formula Spec Sheet' ||
      value === 'Finished Product SDS' ||
      value === 'Invoice'
    ) {
      return value
    }
    throw new UnprocessableEntityException('Unsupported generated document type')
  }

  private documentGenerationTarget(type: DocumentType, linkedTo: string, session: AuthSession) {
    if (type === 'CoA') {
      const lot = this.lotForSession(linkedTo, session)
      const material = this.materialForSession(lot.materialId, session)
      return {
        label: `${lot.lotNumber} ${material.name}`,
        scope: 'lots',
        sensitivity: 'Confidential' as const,
        sizeKb: 168,
        generatedFrom: `lot:${lot.id}`,
      }
    }

    if (type === 'Invoice') {
      const order = this.salesOrderRecords.find((item) => item.id === linkedTo)
      if (!order) {
        throw new NotFoundException(`Sales order ${linkedTo} was not found`)
      }
      return {
        label: order.id,
        scope: 'orders',
        sensitivity: 'Confidential' as const,
        sizeKb: 144,
        generatedFrom: `sales-order:${order.id}`,
      }
    }

    const formula = this.formulaForSession(linkedTo, session)
    return {
      label: `${formula.code} ${formula.version}`,
      scope: 'formulas',
      sensitivity: type === 'Formula Spec Sheet' || type === 'Finished Product SDS' ? ('Highly Confidential' as const) : ('Confidential' as const),
      sizeKb: type === 'Finished Product SDS' ? 320 : 128,
      generatedFrom: `formula:${formula.id}:${formula.version}`,
    }
  }

  private documentChecksum(value: string) {
    let hash = 0
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 33 + value.charCodeAt(index)) >>> 0
    }
    return `sha256:${hash.toString(16).padStart(8, '0')}`
  }

  private slugify(value: string) {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    return slug || `tenant-${Date.now()}`
  }

  private recordAudit(
    action: string,
    entity: string,
    actor: string,
    outcome: AuditEvent['outcome'],
  ) {
    this.auditCounter += 1
    const event: AuditEvent = {
      id: `AUD-GEN-${String(this.auditCounter).padStart(4, '0')}`,
      at: new Date().toISOString(),
      actor,
      action,
      entity,
      requestId: `req_gen_${String(this.auditCounter).padStart(4, '0')}`,
      outcome,
    }
    this.auditEvents = [event, ...this.auditEvents]
    return event
  }
}
