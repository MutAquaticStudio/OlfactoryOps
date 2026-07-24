import { AnimatePresence, motion } from 'framer-motion'
import QRCode from 'qrcode'
import {
  Activity,
  Atom,
  BadgeDollarSign,
  BarChart3,
  Beaker,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Command,
  Database,
  FileLock2,
  FlaskConical,
  Gauge,
  Globe2,
  Library,
  KeyRound,
  Layers3,
  LockKeyhole,
  Menu,
  NotebookTabs,
  PackageCheck,
  PackageSearch,
  Plus,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  Undo2,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  memo,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  auditEvents,
  commercialSkus,
  createDefaultFormulaWorkspacePreferences,
  domains,
  evaporationCurve,
  formatCurrency,
  formatGrams,
  formatSequenceValue,
  formulaTotals,
  formulas,
  initialLots,
  isLotEligibleForInventory,
  materials,
  moleculeComponents,
  normalizeFormulaWorkspacePreferences,
  orderRequiredGrams,
  permissionCatalog,
  planLabUsage,
  priceLists,
  priceHistory,
  purchaseOrders,
  quotes,
  readinessStats,
  records,
  resolveFormulaWithCatalog,
  rolePolicies,
  sampleRequests,
  statusMeta,
  storageLocations,
  stockSummary,
  suppliers,
  type Allocation,
  type ApiKeyRecord,
  type AppNotificationRecord,
  type AuditEvent,
  type AuditExportJobRecord,
  type AuthSession,
  type AnalyticsDashboardReport,
  type BatchCostReport,
  type BrandRecord,
  type BrandingConfig,
  type BillingActionResponse,
  type BillingConsoleResponse,
  type BillingPlanRecord,
  type BillingSubscriptionRecord,
  type CommercialSkuRecord,
  type CostingOverview,
  type CustomerRecord,
  type DataImportJobRecord,
  type CustomFieldDefinition,
  type DocumentRecord,
  type FormulaEvaluationRecord,
  type FormulaIfraEvaluation,
  type FormulaCostReport,
  type FormulaScalePlan,
  type FormulaVersionDiff,
  type DocumentComplianceDashboard,
  type DocumentShareLink,
  type DocumentType,
  type DomainKey,
  type DomainModule,
  type DomainStatus,
  type FeatureFlagRecord,
  type Formula,
  type FormulaLine,
  type FormulaPyramidNote,
  type FormulaType,
  type FormulaVersionRecord,
  type FormulaWorkspacePreferences,
  type GlobalSearchResult,
  type InventoryAgingRecord,
  type InventoryReorderSuggestion,
  type InventoryLot,
  type InventoryMovement,
  type LabWeighingSession,
  type LegalAcceptanceRecord,
  type PrivacyRequestRecord,
  type LabUsagePurpose,
  type LabUsageRecord,
  type LotLabelPayload,
  type LotQualityStatus,
  type Material,
  type MembershipRecord,
  type MoleculeComponent,
  type NumberingSequenceRecord,
  type OrganizationRecord,
  type PermissionDefinition,
  type PriceHistoryRecord,
  type PriceListRecord,
  type ProductionBatchRecord,
  type PurchaseOrderLineItem,
  type PurchaseOrderRecord,
  type QuoteRecord,
  type RfqComparison,
  type ResolvedLeaf,
  type RolePolicy,
  type SaasCustomDomainRecord,
  type SampleRequestRecord,
  type SalesOrderRecord,
  type ScheduledReportRecord,
  type ShipmentRecord,
  type OrderDocumentRecord,
  type SsoConfigRecord,
  type SignedDocumentUrl,
  type StockTakeRecord,
  type StorageLocation,
  type SupplierRecord,
  type TenantSettingsRecord,
  type TenantSecurityPolicy,
  type UserSettingsRecord,
  type WebhookRecord,
} from './data/northStar'

type UsageRecord = LabUsageRecord

type LabUsageReversalAllocation = {
  materialId: string
  lotId: string
  grams: number
}

type ModalKind =
  | 'commit'
  | 'auditExport'
  | 'ssoPolicy'
  | 'newFormula'
  | 'formulaLine'
  | 'receiveStock'
  | 'inventoryAdjustment'
  | 'inventoryTransfer'
  | 'userSettings'
  | null

type ApiEnvelope<T> = {
  data: T
}

type AnalyticsReportRunResponse = {
  report: ScheduledReportRecord
  audit: AuditEvent
  invariant: string
}

type StockRows = ReturnType<typeof stockSummary>

const clientFallbackOrganization: OrganizationRecord = {
  id: 'org-client-fallback',
  name: 'API-backed tenant',
  slug: 'api-backed-tenant',
  customDomain: 'api-backed-tenant.labofscents.org',
  plan: 'Enterprise',
  status: 'ACTIVE',
  primaryContact: 'admin@labofscents.org',
  createdAt: 'client-fallback',
}

const clientFallbackSecurityPolicy: TenantSecurityPolicy = {
  organizationId: clientFallbackOrganization.id,
  mfaRequiredForOwnerAdmin: true,
  sessionTimeoutMinutes: 60,
  idleTimeoutMinutes: 15,
  absoluteSessionMinutes: 480,
  concurrentSessionLimit: 2,
  newDeviceAlertEnabled: true,
  ipAllowlist: [],
  passwordPolicy: 'server-managed',
}

const defaultAccentColor = '#0f766e'
const showMoleculeSplitPanel = false
const showInventoryLotComplianceReview = false

const accentColorPresets = ['#0f766e', '#0369a1', '#15803d', '#9a6700', '#b42318', '#7c3aed']

const clientFallbackUserSettings: UserSettingsRecord = {
  userId: 'client-fallback',
  organizationId: clientFallbackOrganization.id,
  email: clientFallbackOrganization.primaryContact,
  displayName: 'Workspace Owner',
  preferredLanding: 'dashboard',
  uiDensity: 'comfortable',
  sidebarMode: 'expanded',
  reduceMotion: false,
  emailDigest: 'weekly',
  accentColor: defaultAccentColor,
  formulaWorkspace: createDefaultFormulaWorkspacePreferences(),
  updatedAt: 'client-fallback',
}

const clientFallbackDocumentDashboard: DocumentComplianceDashboard = {
  coveragePercent: 0,
  totalRequired: 0,
  metCount: 0,
  missingCount: 0,
  expiringCount: 0,
  reviewCount: 0,
  generatedCount: 0,
  requirements: [],
  expiringDocuments: [],
  invariant: 'client fallback contains no document seed; API is source of truth',
}

const clientFallbackPlan: BillingPlanRecord = {
  id: 'PLAN-CLIENT-FALLBACK',
  name: 'API managed',
  seats: 0,
  storageGb: 0,
  apiQuota: 0,
  monthlyPrice: 0,
  currency: 'USD',
  limits: {
    seats: 0,
    materials: 0,
    formulas: 0,
    lots: 0,
    documents: 0,
    storageGb: 0,
    apiCalls: 0,
    webhooks: 0,
    auditRetentionDays: 0,
  },
  features: [],
}

const clientFallbackSso: SsoConfigRecord = {
  id: 'SSO-CLIENT-FALLBACK',
  organizationId: clientFallbackOrganization.id,
  provider: 'OIDC',
  domain: 'example.test',
  status: 'draft',
  issuerUrl: 'https://idp.example.test/oauth2/default',
  metadataUrl: 'https://idp.example.test/.well-known/openid-configuration',
  acsUrl: 'https://api.labofscents.org/api/v1/auth/sso/callback',
  entityId: `urn:olfactoryops:${clientFallbackOrganization.id}`,
  jitProvisioning: true,
  enforceSso: false,
  scim: {
    enabled: false,
    baseUrl: `https://api.labofscents.org/api/v1/scim/v2/${clientFallbackOrganization.id}`,
    deprovisionAction: 'revoke_sessions',
    status: 'disabled',
  },
  roleMapping: {},
  updatedAt: 'client-fallback',
}

const clientFallbackTenantSettings: TenantSettingsRecord = {
  organizationId: clientFallbackOrganization.id,
  locale: 'en-US',
  timezone: 'UTC',
  currency: 'USD',
  defaultUnit: 'g',
  defaultDilutionPercent: 10,
}

const clientFallbackBranding: BrandingConfig = {
  organizationId: clientFallbackOrganization.id,
  displayName: 'OlfactoryOps',
  accentColor: '#0f766e',
  documentFooter: 'API managed branding',
  labelTemplate: 'OLF-{sequence}',
  logoMode: 'wordmark',
}

function workspaceBrandingFallback(organizationId?: string): BrandingConfig {
  return {
    ...clientFallbackBranding,
    organizationId: organizationId ?? clientFallbackBranding.organizationId,
  }
}

const clientFallbackCosting: CostingOverview = {
  valuation: {
    asOf: 'client-fallback',
    totalValue: 0,
    reservedValue: 0,
    availableValue: 0,
    lines: [],
    invariant: 'client fallback contains no costing seed; API is source of truth',
  },
  formula: {
    formulaId: '',
    formulaCode: 'API',
    method: 'MIXED_POLICY',
    totalGrams: 0,
    totalCost: 0,
    costPerGram: 0,
    costPerBottle: 0,
    mostExpensiveMaterial: 'API pending',
    lines: [],
    trace: [],
    invariant: 'client fallback contains no formula cost seed',
  },
  skuMargins: [],
  cogs: [],
  methodPolicies: [],
  landedCosts: [],
  invariant: 'client fallback contains no costing seed; API is source of truth',
}

const clientFallbackBatchCost: BatchCostReport = {
  batchId: 'API',
  formulaId: '',
  targetGrams: 0,
  outputGrams: 0,
  yieldVariancePercent: 0,
  costingBasis: 'TARGET_ESTIMATE',
  materialCostBasis: 'FORMULA_ESTIMATE',
  materialCost: 0,
  laborCost: 0,
  overheadCost: 0,
  totalCost: 0,
  costPerGram: 0,
  sourceFormulaCost: clientFallbackCosting.formula,
  invariant: 'client fallback contains no batch cost seed; API is source of truth',
}

const clientFallbackAnalytics: AnalyticsDashboardReport = {
  burnRate: [],
  lowStockForecast: [],
  expiryRisk: [],
  costRanking: [],
  inventoryAnalytics: [],
  roleWidgets: [],
  scheduledReports: [],
  invariant: 'client fallback contains no analytics seed; API is source of truth',
}

type CatalogSkuAvailability = CommercialSkuRecord & {
  availableGrams: number
  canSellPacks: number
}

function buildStockByMaterialId(stock: StockRows) {
  return new Map(stock.map((row) => [row.material.id, row]))
}

function buildSkuAvailabilityRows(skus: CommercialSkuRecord[], stock: StockRows): CatalogSkuAvailability[] {
  const stockByMaterialId = buildStockByMaterialId(stock)
  return skus.map((sku) => {
    const summary = stockByMaterialId.get(sku.materialId)
    const availableGrams = summary?.available ?? 0
    return {
      ...sku,
      availableGrams,
      canSellPacks: Math.floor(availableGrams / sku.packSizeGrams),
    }
  })
}

function syncSkuAvailabilityRows(skus: CatalogSkuAvailability[], stock: StockRows) {
  const stockByMaterialId = buildStockByMaterialId(stock)
  return skus.map((sku) => {
    const summary = stockByMaterialId.get(sku.materialId)
    const availableGrams = summary?.available ?? sku.availableGrams
    return {
      ...sku,
      availableGrams,
      canSellPacks: Math.floor(availableGrams / sku.packSizeGrams),
    }
  })
}

type DocumentDownloadResponse = {
  document: DocumentRecord
  signedUrl: SignedDocumentUrl
  audit: AuditEvent
  invariant: string
}

type DocumentGenerationResponse = {
  document: DocumentRecord
  audit: AuditEvent
  dashboard: DocumentComplianceDashboard
  invariant: string
}

type DocumentApprovalResponse = DocumentGenerationResponse

type DocumentShareResponse = {
  document: DocumentRecord
  shareLink: DocumentShareLink
  audit: AuditEvent
  dashboard: DocumentComplianceDashboard
  invariant: string
}

type LoginResponse = {
  session: AuthSession
  csrfToken: string
  permissions: string[]
  revokedForLimit: AuthSession[]
  newDeviceAlert: boolean
  securityPolicy: TenantSecurityPolicy
  invariant: string
}

type SignupResponse = {
  organization: OrganizationRecord
  brand: BrandRecord
  membership: MembershipRecord
  subscription: BillingSubscriptionRecord
  sso: SsoConfigRecord
  session: AuthSession
  csrfToken: string
  permissions: string[]
  audit: AuditEvent
  invariant: string
}

type MeResponse = {
  session: AuthSession
  csrfToken: string
  permissions: string[]
  securityPolicy: TenantSecurityPolicy
  userSettings: UserSettingsRecord
}
type SaasConsoleResponse = BillingConsoleResponse
type SaasHealthStatus = BillingConsoleResponse['readiness'][number]['status']
type SaasHealthFactor = {
  key: string
  label: string
  status: SaasHealthStatus
  detail: string
}
type SaasHealthSummary = {
  score: number
  status: SaasHealthStatus
  factors: SaasHealthFactor[]
  passCount: number
  warningCount: number
  blockedCount: number
}

type UserSettingsUpdateResponse = {
  settings: UserSettingsRecord
  audit: AuditEvent
  invariant: string
}

type AuditExportResponse = AuditExportJobRecord & {
  audit: AuditEvent
  invariant: string
}

type ApiKeyMutationResponse = {
  apiKey: ApiKeyRecord
  secret?: string
  audit: AuditEvent
  invariant: string
}

type WebhookMutationResponse = {
  webhook: WebhookRecord
  secret?: string
  audit: AuditEvent
  invariant: string
}

type SsoMutationResponse = {
  config: SsoConfigRecord
  secret?: string
  audit: AuditEvent
  invariant: string
}

type ProductionConsumeResponse = {
  batchId: string
  movements: InventoryMovement[]
  invariant: string
}

type ProductionStatusResponse = {
  batch: ProductionBatchRecord
  invariant: string
}

type SupplierCreateResponse = {
  supplier: SupplierRecord
  audit: AuditEvent
  invariant: string
}

type PurchaseOrderCreateResponse = {
  purchaseOrder: PurchaseOrderRecord
  audit: AuditEvent
  invariant: string
}

type PurchaseOrderStatusResponse = PurchaseOrderCreateResponse

type RfqComparisonResponse = RfqComparison & {
  audit: AuditEvent
}

type RfqAwardResponse = {
  purchaseOrder: PurchaseOrderRecord
  option: RfqComparison['options'][number]
  audit: AuditEvent
  invariant: string
}

type DocumentSearchResponse = {
  documents: DocumentRecord[]
  invariant: string
}

type DocumentVersionsResponse = {
  current: DocumentRecord
  versions: DocumentRecord[]
  invariant: string
}

type PurchaseOrderReceiptResponse = {
  lot: InventoryLot
  movement: InventoryMovement
  purchaseOrder: PurchaseOrderRecord
  priceHistory: PriceHistoryRecord
  lots?: InventoryLot[]
  movements?: InventoryMovement[]
  priceHistoryRecords?: PriceHistoryRecord[]
  audit: AuditEvent
  invariant: string
}

type CatalogSkuCreateResponse = {
  sku: CatalogSkuAvailability
  audit: AuditEvent
  invariant: string
}

type PriceListCreateResponse = {
  priceList: PriceListRecord
  audit: AuditEvent
  invariant: string
}

type QuoteCreateResponse = {
  quote: QuoteRecord
  availability: CatalogSkuAvailability
  audit: AuditEvent
  invariant: string
}

type SampleRequestCreateResponse = {
  sample: SampleRequestRecord
  availability: CatalogSkuAvailability
  audit: AuditEvent
  invariant: string
}

type CustomerCreateResponse = {
  customer: CustomerRecord
  audit: AuditEvent
  invariant: string
}

type SalesOrderCreateResponse = {
  order: SalesOrderRecord
  audit: AuditEvent
  invariant: string
}

type OrderReservationResponse = {
  orderId: string
  allocations: Allocation[]
  document: OrderDocumentRecord
  invariant: string
}

type OrderCancellationResponse = {
  orderId: string
  releasedAllocations: Allocation[]
  audit: AuditEvent
  invariant: string
}

type OrderPackResponse = {
  orderId: string
  shipment: ShipmentRecord
  document: OrderDocumentRecord
  audit: AuditEvent
  invariant: string
}

type OrderShipResponse = {
  orderId: string
  shipment?: ShipmentRecord
  audit: AuditEvent
  invariant: string
}

type OrderFulfillmentResponse = {
  orderId: string
  movements: InventoryMovement[]
  documents: OrderDocumentRecord[]
  shipment?: ShipmentRecord
  invariant: string
}

type TenantConsoleResponse = {
  organization: OrganizationRecord
  brands: BrandRecord[]
  memberships: MembershipRecord[]
  sessions: AuthSession[]
  rolePolicies: RolePolicy[]
  permissionCatalog: PermissionDefinition[]
  permissionMatrix: RolePermissionMatrix[]
  securityPolicy: TenantSecurityPolicy
  audit: AuditEvent[]
  invariant: string
}

type TenantInviteResponse = {
  membership: MembershipRecord
  audit: AuditEvent
  invariant: string
}

type MembershipStatusResponse = {
  membership: MembershipRecord
  revokedSessions: AuthSession[]
  audit: AuditEvent
  invariant: string
}

type SessionMutationResponse = {
  session: AuthSession
  audit: AuditEvent
  invariant: string
}

type SessionRevokeAllResponse = {
  revokedSessions: AuthSession[]
  audit: AuditEvent
  invariant: string
}

type PermissionMatrixResponse = {
  rolePolicy: RolePolicy
  permissionCatalog: PermissionDefinition[]
  matrix: RolePermissionMatrix[]
  audit: AuditEvent
  invariant: string
}

type CustomizationConsoleResponse = {
  settings: TenantSettingsRecord
  featureFlags: FeatureFlagRecord[]
  numberingSequences: NumberingSequenceRecord[]
  customFields: CustomFieldDefinition[]
  branding: BrandingConfig
  audit: AuditEvent[]
  invariant: string
}

type SettingsUpdateResponse = {
  settings: TenantSettingsRecord
  audit: AuditEvent
  invariant: string
}

type FeatureFlagUpdateResponse = {
  featureFlag: FeatureFlagRecord
  audit: AuditEvent
  invariant: string
}

type NumberingUpdateResponse = {
  sequence: NumberingSequenceRecord
  preview: string
  audit: AuditEvent
  invariant: string
}

type NumberingPreviewResponse = {
  key: string
  value: string
  nextValue: number
}

type CustomFieldCreateResponse = {
  customField: CustomFieldDefinition
  audit: AuditEvent
  invariant: string
}

type BrandingUpdateResponse = {
  branding: BrandingConfig
  audit: AuditEvent
  invariant: string
}

type MaterialDedupeResponse = {
  cas: string
  matches: Material[]
  duplicate: boolean
  invariant: string
}

type MaterialMutationResponse = {
  material: Material
  audit: AuditEvent
  invariant: string
}

type MaterialMoleculesResponse = {
  materialId: string
  molecules: MoleculeComponent[]
  totalPercent: number
  invariant: string
}

type PubChemFillResponse = MaterialMutationResponse & {
  molecules: MoleculeComponent[]
}

type FormulaCreateResponse = {
  formula: Formula
  invariant: string
}

type FormulaMutationResponse = {
  formula: Formula
  line?: FormulaLine
  leaves?: ResolvedLeaf[]
  totals?: ReturnType<typeof formulaTotals>
  movements?: InventoryMovement[]
  audit?: AuditEvent
  invariant: string
}

type MemberSummaryResponse = {
  totalMembers: number
  activeMembers: number
  invitedMembers: number
  deactivatedMembers: number
  activeSessions: number
  roleCounts: Array<{ role: string; count: number }>
  invariant: string
}

type FormulaVersionListResponse = {
  formula: Formula
  versions: FormulaVersionRecord[]
  invariant: string
}

type FormulaVersionResponse = {
  formula: Formula
  version: FormulaVersionRecord
  audit: AuditEvent
  invariant: string
}

type FormulaExportResponse = {
  formula: Formula
  document: DocumentRecord
  audit: AuditEvent
  invariant: string
}

type FormulaReviewResponse = FormulaVersionResponse & {
  ifra?: FormulaIfraEvaluation
}

type FormulaScaleResponse = {
  formula: Formula
  plan: FormulaScalePlan
  invariant: string
}

type FormulaDiffResponse = {
  formula: Formula
  before: FormulaVersionRecord
  after: FormulaVersionRecord
  diff: FormulaVersionDiff
  invariant: string
}

type FormulaEvaluationResponse = {
  formula: Formula
  version: FormulaVersionRecord
  evaluation: FormulaEvaluationRecord
  audit: AuditEvent
  invariant: string
}

type InventoryReceiptResponse = {
  lot: InventoryLot
  movement: InventoryMovement
  summary?: ReturnType<typeof stockSummary>[number]
  invariant: string
}

type InventoryAdjustmentResponse = InventoryReceiptResponse

type InventoryTransferResponse = InventoryReceiptResponse

type InventoryWriteOffResponse = InventoryReceiptResponse & {
  audit: AuditEvent
}

type InventoryAgingResponse = {
  records: InventoryAgingRecord[]
  summary: {
    deadStockGrams: number
    expiringOrExpiredGrams: number
  }
  invariant: string
}

type InventoryExpiryResponse = {
  expiredLotIds: string[]
  audit: AuditEvent
  invariant: string
}

type InventoryApprovalAction =
  | 'inventory.adjust'
  | 'inventory.transfer'
  | 'inventory.receive'
  | 'inventory.stockTake'
  | 'inventory.quality'

type InventoryApprovalRequestRecord = {
  id: string
  action: InventoryApprovalAction
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  targetLabel: string
  reason: string
  requiredPermission?: string
}

type InventoryApprovalRequestResponse = {
  request: InventoryApprovalRequestRecord
  audit: AuditEvent
  invariant: string
}

type OperationApprovalRequestRecord = {
  id: string
  action: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  targetLabel: string
  reason: string
  requiredPermission: string
}

type OperationApprovalRequestResponse = {
  request: OperationApprovalRequestRecord
  audit: AuditEvent
  invariant: string
}

type ApprovalQueueItem = {
  id: string
  source: 'inventory' | 'operation'
  action: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  targetLabel: string
  reason: string
  requiredPermission?: string
}

type InventoryConsoleResponse = {
  lots: InventoryLot[]
  movements: InventoryMovement[]
  locations: StorageLocation[]
  stockTakes: StockTakeRecord[]
  summary: ReturnType<typeof stockSummary>
  reorderSuggestions: InventoryReorderSuggestion[]
  invariant: string
}

type LotQualityResponse = {
  lot: InventoryLot
  audit: AuditEvent
  summary?: ReturnType<typeof stockSummary>[number]
  movementCount: number
  reason: string
  invariant: string
}

type StockTakeResponse = {
  lot: InventoryLot
  movement?: InventoryMovement
  stockTake: StockTakeRecord
  summary?: ReturnType<typeof stockSummary>[number]
  invariant: string
}

type LotLabelResponse = {
  label: LotLabelPayload
  invariant: string
}

type LotGenealogyResponse = {
  lot: InventoryLot
  material: Material
  agingDays: number
  movements: InventoryMovement[]
  documents: DocumentRecord[]
  downstreamRefs: {
    ref: string
    type: InventoryMovement['type']
    quantityGrams: number
    at: string
  }[]
  eligibility: 'ELIGIBLE' | 'BLOCKED'
  invariant: string
}

type InventoryReorderResponse = {
  suggestions: InventoryReorderSuggestion[]
  invariant: string
}

type StorageLocationCreateResponse = {
  location: StorageLocation
  invariant: string
}

type LabUsageHistoryResponse = {
  usages: UsageRecord[]
  invariant: string
}

type LabUsageCommitResponse = {
  usage: UsageRecord
  movements: InventoryMovement[]
  lots: InventoryLot[]
  usageHistory: UsageRecord[]
  message: string
  invariant: string
}

type LabUsageReverseResponse = {
  usageId: string
  usage: UsageRecord
  movements: InventoryMovement[]
  lots: InventoryLot[]
  usageHistory: UsageRecord[]
  reason: string
  invariant: string
}

type RolePermissionMatrix = {
  role: string
  scope: RolePolicy['scope']
  mfaRequired: boolean
  allowedPermissions: string[]
  deniedPermissions: string[]
  highRiskPermissions: string[]
}

type SecurityProbeResult = {
  status: 'allowed' | 'blocked' | 'review'
  title: string
  detail: string
}

const domainIcons: Record<DomainKey, LucideIcon> = {
  dashboard: Gauge,
  platform: Building2,
  identity: LockKeyhole,
  customization: Settings,
  materials: Atom,
  formulas: FlaskConical,
  inventory: Boxes,
  labUsage: Beaker,
  documents: FileLock2,
  production: PackageCheck,
  procurement: Truck,
  commerce: BadgeDollarSign,
  orders: ShoppingCart,
  costing: Database,
  analytics: BarChart3,
  saas: ShieldCheck,
}

const navGroups: { title: string; keys: DomainKey[] }[] = [
  { title: 'Command', keys: ['dashboard', 'platform', 'identity', 'customization'] },
  { title: 'R&D Spine', keys: ['materials', 'formulas', 'inventory', 'labUsage'] },
  { title: 'Operations', keys: ['production', 'procurement', 'commerce', 'orders'] },
  { title: 'Enterprise', keys: ['costing', 'analytics', 'saas'] },
]

const customerNavGroupTitles: Record<string, string> = {
  Command: 'Home',
  'R&D Spine': 'Lab',
  Enterprise: 'Account',
}

const workflowNodes: { key: DomainKey; label: string; detail: string }[] = [
  { key: 'materials', label: 'Material', detail: 'SDS, CoA, provenance' },
  { key: 'formulas', label: 'Formula', detail: 'Accord resolve engine' },
  { key: 'inventory', label: 'Inventory', detail: 'Lot and movement ledger' },
  { key: 'labUsage', label: 'Lab Usage', detail: 'Commit and reverse' },
  { key: 'production', label: 'Production', detail: 'Batch and QC' },
  { key: 'orders', label: 'Orders', detail: 'Reserve then fulfill' },
  { key: 'analytics', label: 'Analytics', detail: 'Read-only intelligence' },
]

const generatedDocumentTypes: { value: DocumentType; label: string; targetScope: 'lot' | 'formula' | 'order' }[] = [
  { value: 'CoA', label: 'CoA lot certificate', targetScope: 'lot' },
  { value: 'Formula Spec Sheet', label: 'Formula spec sheet', targetScope: 'formula' },
  { value: 'Allergen Declaration', label: 'Allergen declaration', targetScope: 'formula' },
  { value: 'GHS Label', label: 'GHS label', targetScope: 'formula' },
  { value: 'Finished Product SDS', label: 'Finished product SDS', targetScope: 'formula' },
  { value: 'Invoice', label: 'Invoice', targetScope: 'order' },
]

const shellMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35 },
}

const reducedShellMotion = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0 },
}

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.PROD ? '/api/v1' : 'http://127.0.0.1:4000/api/v1')
const authStorageKey = 'olfactoryops.auth.v1'
const authSessionMarkerKey = 'olfactoryops.has_session.v1'
const authExpiredEvent = 'olfactoryops.auth.expired'
const operationApprovalRequestedEvent = 'olfactoryops.operation.approval.requested'
const internalAdminEmails = new Set(['admin@labofscents.org', 'admin@labofscents.com'])
const internalOnlyDomainKeys = new Set<DomainKey>(['platform', 'identity', 'customization'])
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

function escapePrintHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function openPrintDocument(title: string, content: string) {
  const printWindow = window.open('', '_blank', 'popup,width=860,height=760,noopener,noreferrer')
  if (!printWindow) {
    return false
  }
  printWindow.document.open()
  printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${escapePrintHtml(title)}</title>
<style>
  @page { size: auto; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #102033; background: #fff; font: 12px/1.45 Arial, sans-serif; }
  .sheet { max-width: 760px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; gap: 18px; border-bottom: 2px solid #102033; padding-bottom: 12px; margin-bottom: 18px; }
  .brand { font-size: 20px; font-weight: 700; letter-spacing: .4px; }
  .muted { color: #566579; }
  .tag { border: 1px solid #102033; border-radius: 4px; padding: 4px 8px; font-weight: 700; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  th, td { border: 1px solid #aab6c4; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #edf3f8; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; }
  .field { border-bottom: 1px solid #aab6c4; min-height: 32px; padding: 3px 0; }
  .field strong { display: block; font-size: 10px; text-transform: uppercase; color: #566579; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 42px; }
  .signature { border-top: 1px solid #102033; padding-top: 6px; min-height: 38px; }
  .label { width: 100mm; min-height: 60mm; border: 1.5px solid #102033; padding: 8mm; display: grid; grid-template-columns: 1fr 38mm; gap: 6mm; }
  .label h1 { font-size: 15px; margin: 0 0 4px; }
  .label p { margin: 2px 0; }
  .label code { display: block; margin-top: 8px; word-break: break-all; font-size: 8px; }
  .qr svg { width: 34mm; height: 34mm; display: block; }
  @media print { body { print-color-adjust: exact; } .sheet { max-width: none; } }
</style></head><body>${content}</body></html>`)
  printWindow.document.close()
  printWindow.setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 180)
  return true
}

const materialImportFields = [
  { key: 'name', label: 'Material name' },
  { key: 'cas', label: 'CAS' },
  { key: 'family', label: 'Family' },
  { key: 'tier', label: 'Tier' },
  { key: 'ifraLimit', label: 'IFRA limit %' },
  { key: 'costPerGram', label: 'Cost / gram' },
  { key: 'odor', label: 'Odor tags' },
] as const

const lotImportFields = [
  { key: 'materialId', label: 'Material ID' },
  { key: 'materialCas', label: 'Material CAS' },
  { key: 'materialName', label: 'Material name' },
  { key: 'lotNumber', label: 'Lot number' },
  { key: 'quantityGrams', label: 'Quantity (g)' },
  { key: 'expiryDate', label: 'Expiry date' },
  { key: 'location', label: 'Storage location' },
  { key: 'qualityStatus', label: 'QC status' },
  { key: 'supplierLotRef', label: 'Supplier lot ref.' },
] as const

function buildMaterialImportMapping(headers: string[]) {
  const mapping: Record<string, string> = {}
  for (const field of materialImportFields) {
    const header = headers.find((candidate) => {
      const value = candidate.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (field.key === 'name') return value === 'name' || value === 'materialname'
      if (field.key === 'cas') return value === 'cas' || value === 'casnumber'
      if (field.key === 'family') return value === 'family' || value === 'olfactoryfamily'
      if (field.key === 'tier') return value === 'tier' || value === 'note' || value === 'pyramidnote'
      if (field.key === 'ifraLimit') return value === 'ifralimit' || value === 'ifralimitpercent' || value === 'ifra'
      if (field.key === 'costPerGram') return value === 'costpergram' || value === 'costg' || value === 'unitcost'
      return value === 'odor' || value === 'odortags' || value === 'tags'
    })
    if (header) mapping[field.key] = header
  }
  return mapping
}

function buildLotImportMapping(headers: string[]) {
  const mapping: Record<string, string> = {}
  for (const field of lotImportFields) {
    const header = headers.find((candidate) => {
      const value = candidate.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (field.key === 'materialId') return value === 'materialid' || value === 'id'
      if (field.key === 'materialCas') return value === 'materialcas' || value === 'cas' || value === 'casnumber'
      if (field.key === 'materialName') return value === 'materialname' || value === 'material' || value === 'name'
      if (field.key === 'lotNumber') return value === 'lotnumber' || value === 'lot' || value === 'batchnumber'
      if (field.key === 'quantityGrams') return value === 'quantitygrams' || value === 'quantityg' || value === 'quantity' || value === 'grams'
      if (field.key === 'expiryDate') return value === 'expirydate' || value === 'expiry' || value === 'expirationdate'
      if (field.key === 'location') return value === 'location' || value === 'storagelocation' || value === 'warehouse'
      if (field.key === 'qualityStatus') return value === 'qualitystatus' || value === 'qcstatus' || value === 'status'
      return value === 'supplierlotref' || value === 'supplierlot' || value === 'supplierbatch'
    })
    if (header) mapping[field.key] = header
  }
  return mapping
}

function importCellText(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value === null || value === undefined ? '' : String(value).trim()
}

function parseCsvCells(source: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]
    if (character === '"' && quoted && next === '"') {
      value += '"'
      index += 1
      continue
    }
    if (character === '"') {
      quoted = !quoted
      continue
    }
    if (character === ',' && !quoted) {
      row.push(value.trim())
      value = ''
      continue
    }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1
      row.push(value.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      value = ''
      continue
    }
    value += character
  }
  row.push(value.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

async function digestImportRows(rows: Array<Record<string, unknown>>) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rows)))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

let csrfToken: string | null = null

async function requestApi<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (csrfToken && isMutatingRequest(init)) {
    headers.set('X-CSRF-Token', csrfToken)
  }
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: 'include', headers })
  if (response.status === 401) {
    writeStoredAuthSession(null)
    window.dispatchEvent(new Event(authExpiredEvent))
  }
  if (!response.ok) {
    let message = `API request failed with ${response.status}`
    const retryAfterHeader = response.headers.get('Retry-After')
    let retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN
    try {
      const payload = (await response.json()) as { message?: unknown; retryAfterSeconds?: unknown }
      if (typeof payload.message === 'string') {
        message = payload.message
      }
      if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
        retryAfterSeconds = Number(payload.retryAfterSeconds)
      }
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    if (response.status === 429 && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      const waitLabel = retryAfterSeconds >= 60
        ? `${Math.ceil(retryAfterSeconds / 60)} minute${Math.ceil(retryAfterSeconds / 60) === 1 ? '' : 's'}`
        : `${Math.ceil(retryAfterSeconds)} seconds`
      message = `${message}. Try again in ${waitLabel}.`
    }
    if (response.status === 403 && isMutatingRequest(init) && isOperationPermissionDenial(message) && shouldRequestOperationApproval(path)) {
      const approval = await tryRequestOperationApproval(path, init, message)
      if (approval) {
        window.dispatchEvent(new CustomEvent(operationApprovalRequestedEvent, { detail: approval.request }))
        throw new Error(`${approval.request.id} is pending approval for ${approval.request.targetLabel}.`)
      }
    }
    throw new Error(message)
  }
  const payload = (await response.json()) as ApiEnvelope<T>
  return payload.data
}

function isMutatingRequest(init?: RequestInit) {
  const method = init?.method?.toUpperCase() ?? 'GET'
  return method !== 'GET' && method !== 'HEAD'
}

function shouldRequestOperationApproval(path: string) {
  return (
    !path.startsWith('/auth/') &&
    !path.startsWith('/approval-requests') &&
    !path.startsWith('/inventory/approval-requests') &&
    !path.startsWith('/user/settings') &&
    !/^\/formulas\/[^/]+\/approve$/.test(path)
  )
}

async function tryRequestOperationApproval(path: string, init: RequestInit | undefined, reason: string) {
  try {
    const payload = requestPayloadObject(init)
    if (!payload) {
      return null
    }
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken)
    }
    const response = await fetch(`${apiBaseUrl}/approval-requests`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        method: init?.method?.toUpperCase() ?? 'GET',
        path,
        payload,
        reason,
      }),
    })
    if (!response.ok) {
      return null
    }
    const envelope = (await response.json()) as ApiEnvelope<OperationApprovalRequestResponse>
    return envelope.data
  } catch {
    return null
  }
}

function requestPayloadObject(init?: RequestInit): Record<string, unknown> | null {
  const body = init?.body
  if (typeof body !== 'string' || body.trim() === '') {
    return {}
  }
  try {
    const parsed = JSON.parse(body) as unknown
    const payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
    return containsSensitiveApprovalField(payload) ? null : payload
  } catch {
    return {}
  }
}

function isOperationPermissionDenial(message: string) {
  return /^Role .+ cannot perform [A-Za-z0-9._:-]+$/.test(message.trim())
}

function containsSensitiveApprovalField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSensitiveApprovalField)
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  return Object.entries(value as Record<string, unknown>).some(([key, nestedValue]) => {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
    return sensitiveApprovalFieldNames.has(normalizedKey) || containsSensitiveApprovalField(nestedValue)
  })
}


function readStoredAuthSession() {
  window.localStorage.removeItem(authStorageKey)
  return null
}

function hasStoredAuthMarker() {
  return window.localStorage.getItem(authSessionMarkerKey) === '1'
}

function writeStoredAuthSession(session: AuthSession | null) {
  window.localStorage.removeItem(authStorageKey)
  if (!session) {
    csrfToken = null
    window.localStorage.removeItem(authSessionMarkerKey)
    return
  }
  window.localStorage.setItem(authSessionMarkerKey, '1')
}

function acceptCsrfToken(token?: string) {
  csrfToken = token?.trim() || null
}

function tenantDisplayForSession(session: AuthSession, tenantDomain?: string) {
  const fallbackName = tenantDomain || session.email.split('@')[1] || 'Lab workspace'

  return {
    scope: session.organizationId,
    label: `${session.organizationId.toUpperCase()} / ${fallbackName}`,
  }
}

function isInternalAdminSession(session?: Pick<AuthSession, 'email' | 'role'> | null) {
  return Boolean(
    session &&
      (session.role === 'Platform Admin' || internalAdminEmails.has(session.email.trim().toLowerCase())),
  )
}

function permissionsForSession(session: AuthSession) {
  const sessionPermissions = (session as AuthSession & { permissions?: string[] }).permissions
  if (Array.isArray(sessionPermissions)) {
    return sessionPermissions
  }
  return rolePolicies.find((policy) => policy.role === session.role)?.permissions ?? []
}

function withSessionPermissions(session: AuthSession, permissions?: string[]) {
  return {
    ...session,
    permissions: permissions ?? permissionsForSession(session),
  }
}

function sessionHasPermission(session: AuthSession, permission: string) {
  return permissionsForSession(session).includes(permission)
}

function isFormulaApproverRole(role: string) {
  return role === 'Admin' || role === 'Lab Manager' || role === 'Manager'
}

function sessionHasAnyPermission(session: AuthSession, permissions: string[]) {
  return permissions.some((permission) => sessionHasPermission(session, permission))
}

function domainDisplayForSession(domain: DomainModule, session: AuthSession) {
  if (domain.key !== 'saas' || isInternalAdminSession(session)) {
    return localizeDomainDisplay(domain)
  }

  return localizeDomainDisplay({
    ...domain,
    name: 'Billing & Trust',
    shortName: 'Billing',
    responsibility: 'Plans, invoices, usage limits, SSO/SCIM, API keys, webhooks, and audit exports for this workspace',
    risk: 'Plan limits, invoices, credentials, signed webhooks, and workspace-scoped audit exports are active',
    owner: 'Billing',
    screens: ['Billing', 'Plan usage', 'API keys', 'Webhooks', 'Audit exports'],
    activity:
      'Billing console enforces plan limits, queues invoices/actions, rotates credentials, retries webhooks, and exports workspace-scoped evidence',
  })
}

function domainVisibleForSession(key: DomainKey, session: AuthSession) {
  if (key === 'dashboard') {
    return true
  }

  if (key === 'documents') {
    return false
  }

  if (key === 'costing') {
    return isInternalAdminSession(session) || session.role === 'Finance'
  }

  const domain = domains.find((item) => item.key === key)
  if (!domain) {
    return false
  }

  const internalAdminView = isInternalAdminSession(session)
  if (internalOnlyDomainKeys.has(key) && !internalAdminView) {
    return false
  }

  if (key === 'platform') {
    return (
      internalAdminView &&
      (sessionHasAnyPermission(session, domain.permissions) ||
        sessionHasAnyPermission(session, [
          'platform.tenants.manage',
          'platform.flags.manage',
          'platform.impersonation.audit',
        ]))
    )
  }

  return sessionHasAnyPermission(session, domain.permissions)
}

function visibleDomainsForSession(session: AuthSession) {
  return domains.filter((domain) => domainVisibleForSession(domain.key, session))
}

function visibleNavGroupsForSession(session: AuthSession) {
  const internalAdminView = isInternalAdminSession(session)

  return navGroups
    .map((group) => ({
      ...group,
      title: internalAdminView ? group.title : (customerNavGroupTitles[group.title] ?? group.title),
      keys: group.keys.filter((key) => domainVisibleForSession(key, session)),
    }))
    .filter((group) => group.keys.length > 0)
}

function safeLandingForSession(key: DomainKey, session: AuthSession) {
  return domainVisibleForSession(key, session) ? key : 'dashboard'
}

function visibleWorkflowNodesForSession(session: AuthSession) {
  return workflowNodes.filter((node) => domainVisibleForSession(node.key, session))
}

const formulaTypeMeta: Record<FormulaType, { label: string; shortLabel: string; defaultName: string; tone: 'green' | 'blue' }> = {
  ACCORD: {
    label: 'Accord',
    shortLabel: 'ACC',
    defaultName: 'Untitled Accord',
    tone: 'green',
  },
  FINE_FRAGRANCE: {
    label: 'Fine Fragrance',
    shortLabel: 'FRM',
    defaultName: 'Untitled Fine Fragrance',
    tone: 'blue',
  },
}

const emptyFormulaPlaceholder: Formula = {
  id: '__empty-formula__',
  code: 'NEW',
  name: 'No formula selected',
  formulaType: 'FINE_FRAGRANCE',
  organizationId: '',
  brandId: '',
  concentrationType: 'EDP',
  finalProductConcentrationPercent: 20,
  targetMarkets: [],
  brief: '',
  inspiration: '',
  pyramidSummary: '',
  tags: [],
  project: '',
  collection: '',
  density: 1,
  bottleVolumeMl: 50,
  bottleCount: 1,
  ifraCategory: '4',
  workflowStatus: 'DRAFT',
  draftRevision: 1,
  updatedAt: '',
  updatedBy: '',
  approvalHistory: [],
  version: 'v0',
  status: 'draft',
  targetGrams: 100,
  owner: '',
  lines: [],
}

function formulaTypeForFormula(formula: Pick<Formula, 'code' | 'formulaType'>): FormulaType {
  if (formula.formulaType === 'ACCORD' || formula.formulaType === 'FINE_FRAGRANCE') {
    return formula.formulaType
  }
  return formula.code.startsWith('ACC-') ? 'ACCORD' : 'FINE_FRAGRANCE'
}

function userSettingsForSession(session: AuthSession | null): UserSettingsRecord {
  if (!session) {
    return clientFallbackUserSettings
  }
  return {
    ...clientFallbackUserSettings,
    userId: session.userId,
    organizationId: session.organizationId,
    email: session.email,
    displayName: session.email.split('@')[0] || clientFallbackUserSettings.displayName,
  }
}

function normalizeHexColor(value: string | undefined | null) {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  const shortMatch = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(trimmed)
  if (shortMatch) {
    return `#${shortMatch[1]}${shortMatch[1]}${shortMatch[2]}${shortMatch[2]}${shortMatch[3]}${shortMatch[3]}`.toLowerCase()
  }
  return null
}

function normalizeBrandLogoImageUrl(value: string | undefined) {
  if (!value || value.length > 2048) {
    return undefined
  }
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password) {
      return undefined
    }
    return url.toString()
  } catch {
    return undefined
  }
}

function hexToRgb(hexColor: string) {
  const normalized = normalizeHexColor(hexColor) ?? defaultAccentColor
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

function mixHexColor(hexColor: string, targetHexColor: string, weight: number) {
  const source = hexToRgb(hexColor)
  const target = hexToRgb(targetHexColor)
  const mixChannel = (sourceValue: number, targetValue: number) =>
    Math.round(sourceValue + (targetValue - sourceValue) * weight)
      .toString(16)
      .padStart(2, '0')
  return `#${mixChannel(source.r, target.r)}${mixChannel(source.g, target.g)}${mixChannel(source.b, target.b)}`
}

function accentStyleForColor(value: string | undefined | null): CSSProperties {
  const accentColor = normalizeHexColor(value) ?? defaultAccentColor
  const { r, g, b } = hexToRgb(accentColor)
  return {
    '--blue': accentColor,
    '--blue-bright': mixHexColor(accentColor, '#ffffff', 0.24),
    '--blue-deep': mixHexColor(accentColor, '#000000', 0.24),
    '--accent-rgb': `${r} ${g} ${b}`,
  } as CSSProperties
}

function mergeMovements(newMovements: InventoryMovement[], currentMovements: InventoryMovement[]) {
  const incomingIds = new Set(newMovements.map((movement) => movement.id))
  return [...newMovements, ...currentMovements.filter((movement) => !incomingIds.has(movement.id))]
}

function allocationKey(allocation: Pick<Allocation, 'materialId' | 'lotId'>) {
  return `${allocation.materialId}:${allocation.lotId}`
}

function buildWeighingSessionPreview({
  formula,
  plan,
  lots,
  batchGrams,
  actualWeights,
  tolerancePercent,
  operator,
}: {
  formula: Formula
  plan: ReturnType<typeof planLabUsage>
  lots: InventoryLot[]
  batchGrams: number
  actualWeights: Record<string, number>
  tolerancePercent: number
  operator: string
}): LabWeighingSession {
  const safeTolerance = Number.isFinite(tolerancePercent) && tolerancePercent >= 0 ? tolerancePercent : 0
  const remainingAvailableByLot = new Map(
    lots.map((lot) => [lot.id, Math.max(0, lot.quantityGrams - lot.reservedGrams)]),
  )
  const lines = plan.allocations.map((allocation) => {
    const actualGrams = Number(actualWeights[allocationKey(allocation)] ?? allocation.allocatedGrams)
    const available = remainingAvailableByLot.get(allocation.lotId) ?? 0
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
      withinTolerance:
        Number.isFinite(actualGrams) &&
        actualGrams > 0 &&
        actualGrams <= available + 0.0001 &&
        deviationPercent <= safeTolerance + 0.0001,
    }
  })

  return {
    id: 'WGH-UI-PREVIEW',
    formulaId: formula.id,
    formulaCode: formula.code,
    targetBatchGrams: batchGrams,
    tolerancePercent: safeTolerance,
    operator: operator.trim() || 'Perfumer',
    status:
      plan.shortfalls.length === 0 && lines.length > 0 && lines.every((line) => line.withinTolerance)
        ? 'READY'
        : 'NEEDS_REVIEW',
    lines,
    createdAt: 'preview',
  }
}

function WeighingEvidence({ session, compact = false }: { session: LabWeighingSession; compact?: boolean }) {
  const actualTotal = session.lines.reduce((sum, line) => sum + line.actualGrams, 0)
  const maxDeviation = session.lines.reduce((max, line) => Math.max(max, line.deviationPercent), 0)

  return (
    <div className={`weighing-evidence ${compact ? 'is-compact' : ''}`}>
      <div className="weighing-evidence-head">
        <div>
          <strong>Actual weighing evidence</strong>
          <span>
            {session.operator} / {session.status}
          </span>
        </div>
        <DataTag label="Actual" value={formatGrams(actualTotal)} tone="blue" />
        <DataTag label="Deviation" value={`${maxDeviation.toFixed(2)}%`} tone={session.status === 'READY' ? 'green' : 'amber'} />
      </div>
      {session.lines.map((line) => (
        <div className="weighing-evidence-row" key={allocationKey(line)}>
          <div>
            <strong>{line.materialName}</strong>
            <span>{line.lotNumber}</span>
          </div>
          <span className="mono-value">{formatGrams(line.actualGrams)}</span>
          <span className={`deviation-pill ${line.withinTolerance ? 'is-ok' : 'is-alert'}`}>
            {line.deviationPercent.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  )
}

function App() {
  const [activeKey, setActiveKey] = useState<DomainKey>('dashboard')
  const [currentSession, setCurrentSession] = useState<AuthSession | null>(() => readStoredAuthSession())
  const currentSessionId = currentSession?.id
  const currentOrganizationId = currentSession?.organizationId
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [resumeKey, setResumeKey] = useState<DomainKey | null>(null)
  const [userSettingsRecord, setUserSettingsRecord] = useState<UserSettingsRecord | null>(null)
  const [workspaceBranding, setWorkspaceBranding] = useState<BrandingConfig>(() => workspaceBrandingFallback())
  const [tenantDomains, setTenantDomains] = useState<Record<string, string>>({})
  const [billingOnboarding, setBillingOnboarding] = useState(false)
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false)
  const [, setLocaleVersion] = useState(0)
  const [modal, setModal] = useState<ModalKind>(null)
  const [auditExporting, setAuditExporting] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [selectedMaterialId, setSelectedMaterialId] = useState('mat-iso')
  const [materialRecords, setMaterialRecords] = useState<Material[]>(() => structuredClone(materials))
  const [formulaRecords, setFormulaRecords] = useState<Formula[]>([])
  const [activeFormulaId, setActiveFormulaId] = useState('')
  const [labUsageFormulaId, setLabUsageFormulaId] = useState('')
  const [lots, setLots] = useState<InventoryLot[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [storageLocationRecords, setStorageLocationRecords] = useState<StorageLocation[]>(storageLocations)
  const [usageHistory, setUsageHistory] = useState<UsageRecord[]>([])
  const [batchGrams, setBatchGrams] = useState(12.5)
  const [actualWeights, setActualWeights] = useState<Record<string, number>>({})
  const [weighingTolerancePercent, setWeighingTolerancePercent] = useState(2)
  const [weighingOperator, setWeighingOperator] = useState('')
  const [labUsagePurpose, setLabUsagePurpose] = useState<LabUsagePurpose>('trial')
  const [labUsageProjectCode, setLabUsageProjectCode] = useState('RND-PROJECT-001')
  const [labUsageSampleCode, setLabUsageSampleCode] = useState('SAMPLE-001')
  const [labUsageStatusMessage, setLabUsageStatusMessage] = useState('Live API sync pending')
  const [labUsageBusy, setLabUsageBusy] = useState(false)
  const [newFormulaType, setNewFormulaType] = useState<FormulaType>('ACCORD')
  const [newFormulaName, setNewFormulaName] = useState('Untitled Accord')
  const [newFormulaTargetGrams, setNewFormulaTargetGrams] = useState(100)
  const [newLineMaterialId, setNewLineMaterialId] = useState(materials[0]?.id ?? '')
  const [newLineGrams, setNewLineGrams] = useState(5)
  const [receiveMaterialId, setReceiveMaterialId] = useState(materials[0]?.id ?? '')
  const [receiveLotNumber, setReceiveLotNumber] = useState('L-NEW-001')
  const [receiveQuantityGrams, setReceiveQuantityGrams] = useState(25)
  const [receiveExpiryDate, setReceiveExpiryDate] = useState('2028-12-31')
  const [receiveSdsFile, setReceiveSdsFile] = useState<File | null>(null)
  const [receiveCoaFile, setReceiveCoaFile] = useState<File | null>(null)
  const [adjustmentLotId, setAdjustmentLotId] = useState('')
  const [adjustmentDirection, setAdjustmentDirection] = useState<'IN' | 'OUT'>('OUT')
  const [adjustmentQuantityGrams, setAdjustmentQuantityGrams] = useState(5)
  const [adjustmentReason, setAdjustmentReason] = useState('Cycle count correction')
  const [transferLotId, setTransferLotId] = useState('')
  const [transferLocation, setTransferLocation] = useState(storageLocations[1]?.name ?? 'Amber Shelf 2')
  const [transferViaTransit, setTransferViaTransit] = useState(false)

  useEffect(() => {
    const applyLocale = (candidate?: string) => {
      const locale: UiLocale = candidate === 'vi-VN' ? 'vi-VN' : 'en-US'
      window.localStorage.setItem(localeStorageKey, locale)
      document.documentElement.lang = locale
      setLocaleVersion((current) => current + 1)
    }
    applyLocale(window.localStorage.getItem(localeStorageKey) ?? undefined)
    const handleLocaleChange = (event: Event) => applyLocale((event as CustomEvent<UiLocale>).detail)
    const handleStorage = (event: StorageEvent) => {
      if (event.key === localeStorageKey) applyLocale(event.newValue ?? undefined)
    }
    window.addEventListener(localeChangeEvent, handleLocaleChange)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(localeChangeEvent, handleLocaleChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const activeUserSettings = userSettingsRecord ?? userSettingsForSession(currentSession)
  const shellAccentStyle = useMemo(
    () => accentStyleForColor(activeUserSettings.accentColor),
    [activeUserSettings.accentColor],
  )
  const shellMotionPreset = activeUserSettings.reduceMotion ? reducedShellMotion : shellMotion

  const visibleDomains = useMemo(
    () => (currentSession ? visibleDomainsForSession(currentSession) : domains),
    [currentSession],
  )
  const selectedDomain = visibleDomains.find((domain) => domain.key === activeKey)
  const scopedFormulaRecords = useMemo(
    () =>
      currentSession
        ? formulaRecords.filter((formula) => formula.organizationId === currentSession.organizationId)
        : [],
    [currentSession, formulaRecords],
  )
  const selectedFormula = useMemo(() => {
    return scopedFormulaRecords.find((formula) => formula.id === activeFormulaId) ?? scopedFormulaRecords[0] ?? emptyFormulaPlaceholder
  }, [activeFormulaId, scopedFormulaRecords])
  const publishedLabUsageFormulas = useMemo(
    () =>
      scopedFormulaRecords.filter(
        (formula) => formula.workflowStatus === 'APPROVED' && Boolean(formula.lockedVersion),
      ),
    [scopedFormulaRecords],
  )
  const selectedLabUsageFormula = useMemo(
    () =>
      publishedLabUsageFormulas.find((formula) => formula.id === labUsageFormulaId) ??
      publishedLabUsageFormulas[0] ??
      emptyFormulaPlaceholder,
    [labUsageFormulaId, publishedLabUsageFormulas],
  )
  const hasPublishedLabUsageFormula = publishedLabUsageFormulas.length > 0
  const resolvedLeaves = useMemo(
    () =>
      resolveFormulaWithCatalog(
        selectedFormula.id,
        scopedFormulaRecords.length > 0 ? scopedFormulaRecords : [selectedFormula],
        materialRecords,
      ),
    [materialRecords, scopedFormulaRecords, selectedFormula],
  )
  const totals = useMemo(() => formulaTotals(resolvedLeaves), [resolvedLeaves])
  const curve = useMemo(() => evaporationCurve(resolvedLeaves), [resolvedLeaves])
  const labUsageResolvedLeaves = useMemo(
    () =>
      hasPublishedLabUsageFormula
        ? resolveFormulaWithCatalog(selectedLabUsageFormula.id, scopedFormulaRecords, materialRecords)
        : [],
    [hasPublishedLabUsageFormula, materialRecords, scopedFormulaRecords, selectedLabUsageFormula.id],
  )
  const labPlan = useMemo(
    () => planLabUsage(labUsageResolvedLeaves, lots, batchGrams, selectedLabUsageFormula.targetGrams),
    [labUsageResolvedLeaves, lots, batchGrams, selectedLabUsageFormula.targetGrams],
  )
  const weighingSessionPreview = useMemo(
    () =>
      buildWeighingSessionPreview({
        formula: selectedLabUsageFormula,
        plan: labPlan,
        lots,
        batchGrams,
        actualWeights,
        tolerancePercent: weighingTolerancePercent,
        operator: weighingOperator,
      }),
    [actualWeights, batchGrams, labPlan, lots, selectedLabUsageFormula, weighingOperator, weighingTolerancePercent],
  )
  const weighingReady = weighingSessionPreview.status === 'READY'
  const stock = useMemo(() => stockSummary(lots, materialRecords), [lots, materialRecords])
  const stats = useMemo(() => readinessStats(), [])
  const selectedAdjustmentLot = lots.find((lot) => lot.id === adjustmentLotId)
  const selectedTransferLot = lots.find((lot) => lot.id === transferLotId)
  const adjustmentWouldGoNegative =
    adjustmentDirection === 'OUT' &&
    selectedAdjustmentLot !== undefined &&
    selectedAdjustmentLot.quantityGrams - adjustmentQuantityGrams < selectedAdjustmentLot.reservedGrams
  const canReceiveInventory = currentSession ? sessionHasPermission(currentSession, 'inventory.receive') : false
  const canAdjustInventory = currentSession ? sessionHasPermission(currentSession, 'inventory.adjust') : false

  useEffect(() => {
    setLabUsageFormulaId((current) =>
      publishedLabUsageFormulas.some((formula) => formula.id === current)
        ? current
        : (publishedLabUsageFormulas[0]?.id ?? ''),
    )
  }, [publishedLabUsageFormulas])

  useEffect(() => {
    setActualWeights({})
  }, [labUsageFormulaId])
  const navigateToDomain = useCallback(
    (key: DomainKey) => {
      setActiveKey(currentSession ? safeLandingForSession(key, currentSession) : key)
      setMobileNavOpen(false)
    },
    [currentSession],
  )
  const applyUserSettings = useCallback((settings: UserSettingsRecord | null) => {
    setUserSettingsRecord(settings)
    if (settings) {
      setSidebarCollapsed(settings.sidebarMode === 'rail')
    }
  }, [])
  const openCommandPalette = useCallback(() => {
    setCommandOpen(true)
  }, [])
  const closeCommandPalette = useCallback(() => {
    setCommandOpen(false)
  }, [])
  const closeCurrentModal = useCallback(() => {
    setModal(null)
  }, [])
  const openUserSettingsModal = useCallback(() => {
    setModal('userSettings')
  }, [])
  const toggleSidebar = useCallback(() => {
    if (mobileNavOpen) {
      setMobileNavOpen(false)
      return
    }
    setSidebarCollapsed((value) => !value)
  }, [mobileNavOpen])
  const closeBillingGate = useCallback(() => {
    if (!currentSession) {
      return
    }
    setBillingOnboarding(false)
    setActiveKey(
      safeLandingForSession(
        (userSettingsRecord ?? userSettingsForSession(currentSession)).preferredLanding,
        currentSession,
      ),
    )
  }, [currentSession, userSettingsRecord])

  useEffect(() => {
    const nextWeights: Record<string, number> = {}
    labPlan.allocations.forEach((allocation) => {
      nextWeights[allocationKey(allocation)] = Number(allocation.allocatedGrams.toFixed(3))
    })
    setActualWeights(nextWeights)
  }, [labPlan.allocations])

  useEffect(() => {
    if (currentSession && !domainVisibleForSession(activeKey, currentSession)) {
      setActiveKey('dashboard')
    }
  }, [activeKey, currentSession])

  useEffect(() => {
    function handleAuthExpired() {
      setResumeKey((current) => current ?? activeKey)
      setAuthNotice('Your session expired or was revoked. Sign in again to continue where you left off.')
      setCurrentSession(null)
      applyUserSettings(null)
      setSidebarCollapsed(false)
    }

    window.addEventListener(authExpiredEvent, handleAuthExpired)
    return () => window.removeEventListener(authExpiredEvent, handleAuthExpired)
  }, [activeKey, applyUserSettings])

  useEffect(() => {
    function handleOperationApprovalRequested(event: Event) {
      const request = (event as CustomEvent<OperationApprovalRequestRecord>).detail
      if (!request?.id) {
        return
      }
      setApprovalNotice(`${request.id} is pending approval for ${request.targetLabel}.`)
    }

    window.addEventListener(operationApprovalRequestedEvent, handleOperationApprovalRequested)
    return () => window.removeEventListener(operationApprovalRequestedEvent, handleOperationApprovalRequested)
  }, [])

  useEffect(() => {
    if (!hasStoredAuthMarker()) {
      return
    }

    let active = true

    async function restoreSession() {
      try {
        const payload = await requestApi<MeResponse>('/me')
        if (active) {
          acceptCsrfToken(payload.csrfToken)
          const session = withSessionPermissions(payload.session, payload.permissions)
          setCurrentSession(session)
          const settings = payload.userSettings ?? userSettingsForSession(payload.session)
          applyUserSettings(settings)
          setActiveKey(safeLandingForSession(settings.preferredLanding, session))
        }
      } catch {
        if (active) {
          acceptCsrfToken()
          setCurrentSession(null)
          applyUserSettings(null)
          setSidebarCollapsed(false)
        }
      }
    }

    void restoreSession()

    return () => {
      active = false
    }
  }, [applyUserSettings])

  useEffect(() => {
    if (!currentSessionId || !currentOrganizationId) {
      setUsageHistory([])
      setLabUsageStatusMessage('Login to sync Lab Usage API')
      return
    }

    const controller = new AbortController()

    async function loadLabUsageHistory() {
      try {
        const payload = await requestApi<LabUsageHistoryResponse>('/lab-usage', { signal: controller.signal })
        setUsageHistory(payload.usages)
        setLabUsageStatusMessage('Synced from live Lab Usage API')
      } catch {
        if (!controller.signal.aborted) {
          setLabUsageStatusMessage('Using local Lab Usage state until API is reachable')
        }
      }
    }

    void loadLabUsageHistory()

    return () => controller.abort()
  }, [currentOrganizationId, currentSessionId])

  useEffect(() => {
    setWeighingOperator(currentSession?.email ?? '')
  }, [currentSession?.email])

  useEffect(() => {
    setFormulaRecords([])
    setActiveFormulaId('')
    if (!currentSessionId || !currentOrganizationId) {
      return
    }

    const controller = new AbortController()

    async function loadFormulaCatalog() {
      try {
        const payload = await requestApi<Formula[]>('/formulas', { signal: controller.signal })
        setFormulaRecords(payload)
        setActiveFormulaId((current) => (payload.some((formula) => formula.id === current) ? current : payload[0]?.id ?? ''))
      } catch {
        setFormulaRecords([])
        setActiveFormulaId('')
      }
    }

    void loadFormulaCatalog()

    return () => controller.abort()
  }, [currentOrganizationId, currentSessionId])

  useEffect(() => {
    setLots([])
    setMovements([])
    setStorageLocationRecords([])
    setAdjustmentLotId('')
    setTransferLotId('')
    if (!currentSessionId || !currentOrganizationId) {
      return
    }

    const controller = new AbortController()

    async function loadInventoryConsole() {
      try {
        const payload = await requestApi<InventoryConsoleResponse>('/inventory/console', {
          signal: controller.signal,
        })
        setLots(payload.lots)
        setMovements(payload.movements)
        setStorageLocationRecords(payload.locations)
        setAdjustmentLotId(payload.lots[0]?.id ?? '')
        setTransferLotId(payload.lots[0]?.id ?? '')
      } catch {
        if (!controller.signal.aborted) {
          setLots([])
          setMovements([])
          setStorageLocationRecords([])
        }
      }
    }

    void loadInventoryConsole()

    return () => controller.abort()
  }, [currentOrganizationId, currentSessionId])

  useEffect(() => {
    function handleKeys(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
      if (event.key === 'Escape') {
        setCommandOpen(false)
        setModal(null)
      }
    }

    window.addEventListener('keydown', handleKeys)
    return () => window.removeEventListener('keydown', handleKeys)
  }, [])

  const setTargetWeights = useCallback(() => {
    const nextWeights: Record<string, number> = {}
    labPlan.allocations.forEach((allocation) => {
      nextWeights[allocationKey(allocation)] = Number(allocation.allocatedGrams.toFixed(3))
    })
    setActualWeights(nextWeights)
  }, [labPlan.allocations])

  const commitLabUsage = useCallback(async () => {
    if (!hasPublishedLabUsageFormula) {
      setLabUsageStatusMessage('Publish a formula before recording lab inventory usage')
      return
    }
    if (!weighingReady || labUsageResolvedLeaves.length === 0) {
      return
    }

    setLabUsageBusy(true)
    try {
      const actualsDifferFromTargets = weighingSessionPreview.lines.some(
        (line) => Math.abs(line.actualGrams - line.targetGrams) > 0.0001,
      )
      const payload = await requestApi<LabUsageCommitResponse>('/lab-usage/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formulaId: selectedLabUsageFormula.id,
          grams: batchGrams,
          ...(actualsDifferFromTargets
            ? {
                actuals: weighingSessionPreview.lines.map((line) => ({
                  materialId: line.materialId,
                  lotId: line.lotId,
                  actualGrams: line.actualGrams,
                })),
              }
            : {}),
          tolerancePercent: weighingTolerancePercent,
          operator: weighingOperator,
          purpose: labUsagePurpose,
          projectCode: labUsageProjectCode,
          sampleCode: labUsageSampleCode,
        }),
      })

      setLots(payload.lots)
      setMovements((current) => mergeMovements(payload.movements, current))
      setUsageHistory(payload.usageHistory)
      setLabUsageStatusMessage(payload.message)
      setActiveKey('labUsage')
      setModal(null)
    } catch (error) {
      setLabUsageStatusMessage(error instanceof Error ? error.message : 'Lab Usage commit failed')
    } finally {
      setLabUsageBusy(false)
    }
  }, [
    batchGrams,
    labUsageProjectCode,
    labUsagePurpose,
    labUsageSampleCode,
    hasPublishedLabUsageFormula,
    labUsageResolvedLeaves.length,
    selectedLabUsageFormula.id,
    weighingOperator,
    weighingSessionPreview.lines,
    weighingTolerancePercent,
    weighingReady,
  ])

  const reverseLatestUsage = useCallback(async (usageId?: string, allocations?: LabUsageReversalAllocation[]) => {
    const usage = usageHistory.find((item) => item.id === usageId) ?? usageHistory.find(
      (item) => item.status === 'COMMITTED' || item.status === 'PARTIALLY_REVERSED',
    )
    if (!usage) {
      return
    }

    setLabUsageBusy(true)
    try {
      const payload = await requestApi<LabUsageReverseResponse>(`/lab-usage/${encodeURIComponent(usage.id)}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: weighingOperator || 'Lab Manager',
          reason: 'Compensation reversal from Lab Usage workspace',
          ...(allocations?.length ? { allocations } : {}),
        }),
      })

      setLots(payload.lots)
      setMovements((current) => mergeMovements(payload.movements, current))
      setUsageHistory(payload.usageHistory)
      setLabUsageStatusMessage(
        `${payload.usageId} ${payload.usage.status === 'REVERSED' ? 'fully' : 'partially'} reversed by compensation`,
      )
    } catch (error) {
      setLabUsageStatusMessage(error instanceof Error ? error.message : 'Lab Usage reverse failed')
    } finally {
      setLabUsageBusy(false)
    }
  }, [usageHistory, weighingOperator])

  const selectNewFormulaType = useCallback((type: FormulaType) => {
    const previousDefault = formulaTypeMeta[newFormulaType].defaultName
    const nextDefault = formulaTypeMeta[type].defaultName
    setNewFormulaType(type)
    setNewFormulaName((current) => {
      const trimmed = current.trim()
      if (!trimmed || trimmed === previousDefault || trimmed.startsWith('Untitled ')) {
        return nextDefault
      }
      return current
    })
  }, [newFormulaType])

  const createFormulaDraft = useCallback(async () => {
    const targetGrams = Math.max(1, Number(newFormulaTargetGrams) || 100)
    try {
      const payload = await requestApi<FormulaCreateResponse>('/formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFormulaName.trim() || 'Untitled Formula',
          formulaType: newFormulaType,
          targetGrams,
        }),
      })
      setFormulaRecords((current) => [
        payload.formula,
        ...current.filter((formula) => formula.id !== payload.formula.id),
      ])
      setActiveFormulaId(payload.formula.id)
      setNewFormulaName(formulaTypeMeta[newFormulaType].defaultName)
      setNewFormulaTargetGrams(100)
      setActiveKey('formulas')
      setModal(null)
    } catch (error) {
      if (error instanceof Error) {
        setApprovalNotice(error.message)
      }
      setActiveKey('formulas')
      setModal(null)
    }
  }, [newFormulaName, newFormulaTargetGrams, newFormulaType])

  const addFormulaMaterialLine = useCallback(async () => {
    const material = materialRecords.find((item) => item.id === newLineMaterialId)
    const formula = formulaRecords.find((item) => item.id === activeFormulaId)
    const grams = Number(newLineGrams)

    if (!material || !formula || !Number.isFinite(grams) || grams <= 0) {
      return
    }

    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: material.id, grams }),
      })
      setFormulaRecords((current) =>
        current.map((item) => (item.id === formula.id ? payload.formula : item)),
      )
      setSelectedMaterialId(material.id)
      setNewLineGrams(5)
      setActiveKey('formulas')
      setModal(null)
    } catch (error) {
      if (error instanceof Error) {
        setApprovalNotice(error.message)
      }
      setActiveKey('formulas')
      setModal(null)
    }
  }, [activeFormulaId, formulaRecords, materialRecords, newLineGrams, newLineMaterialId])

  const isPermissionError = useCallback((error: unknown, permission: string) => {
    return error instanceof Error && error.message.includes(`cannot perform ${permission}`)
  }, [])

  const submitInventoryApprovalRequest = useCallback(
    async (action: InventoryApprovalAction, payload: Record<string, unknown>, reason: string) => {
      const response = await requestApi<InventoryApprovalRequestResponse>('/inventory/approval-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, reason }),
      })

      setApprovalNotice(`${response.request.id} is pending admin approval for ${response.request.targetLabel}.`)
      setActiveKey('inventory')
      setModal(null)
      return response
    },
    [],
  )

  const receiveStockLot = useCallback(async () => {
    const material = materialRecords.find((item) => item.id === receiveMaterialId)
    const quantityGrams = Number(receiveQuantityGrams)

    if (!material || !Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      return
    }

    const receiptPayload = {
      materialId: material.id,
      lotNumber: receiveLotNumber.trim() || `L-${material.cas.replaceAll('-', '')}`,
      quantityGrams,
      expiryDate: receiveExpiryDate || '2028-12-31',
      location: 'Receiving Bay',
      qualityStatus: 'APPROVED',
      container: 'Receiving container',
    }

    try {
      if (!canReceiveInventory) {
        await submitInventoryApprovalRequest(
          'inventory.receive',
          receiptPayload,
          `Receive ${formatGrams(quantityGrams)} of ${material.name}`,
        )
        return
      }

      const response = await requestApi<InventoryReceiptResponse>('/inventory/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receiptPayload),
      })

      const uploads = [
        receiveSdsFile ? { file: receiveSdsFile, type: 'SDS' as const, linkedTo: material.id } : null,
        receiveCoaFile ? { file: receiveCoaFile, type: 'CoA' as const, linkedTo: response.lot.id } : null,
      ].filter((upload): upload is { file: File; type: 'SDS' | 'CoA'; linkedTo: string } => upload !== null)
      const uploadFailures: string[] = []
      for (const upload of uploads) {
        const formData = new FormData()
        formData.set('file', upload.file)
        formData.set('type', upload.type)
        formData.set('linkedTo', upload.linkedTo)
        formData.set('title', `${material.name} ${upload.type} / ${response.lot.lotNumber}`)
        formData.set('tags', `inventory-receipt,${upload.type.toLowerCase()}`)
        formData.set('sensitivity', 'Internal')
        try {
          await requestApi<DocumentGenerationResponse>('/documents/upload', { method: 'POST', body: formData })
        } catch (error) {
          uploadFailures.push(`${upload.type}: ${error instanceof Error ? error.message : 'upload failed'}`)
        }
      }

      setLots((current) => [response.lot, ...current.filter((lot) => lot.id !== response.lot.id)])
      setMovements((current) => [response.movement, ...current.filter((movement) => movement.id !== response.movement.id)])
      setReceiveLotNumber(`L-NEW-${String(lots.length + 2).padStart(3, '0')}`)
      setReceiveQuantityGrams(25)
      setReceiveSdsFile(null)
      setReceiveCoaFile(null)
      setActiveKey('inventory')
      setModal(null)
      if (uploadFailures.length > 0) {
        setApprovalNotice(`Lot ${response.lot.lotNumber} was received. ${uploadFailures.join(' ')}`)
      }
    } catch (error) {
      if (isPermissionError(error, 'inventory.receive')) {
        await submitInventoryApprovalRequest(
          'inventory.receive',
          receiptPayload,
          `Receive ${formatGrams(quantityGrams)} of ${material.name}`,
        )
        return
      }
      setApprovalNotice(error instanceof Error ? error.message : 'Inventory receipt failed')
      setActiveKey('inventory')
    }
  }, [
    canReceiveInventory,
    isPermissionError,
    materialRecords,
    receiveExpiryDate,
    receiveLotNumber,
    receiveMaterialId,
    receiveQuantityGrams,
    receiveCoaFile,
    receiveSdsFile,
    lots.length,
    submitInventoryApprovalRequest,
  ])

  const adjustInventoryLot = useCallback(async () => {
    const lot = lots.find((item) => item.id === adjustmentLotId)
    const quantityGrams = Number(adjustmentQuantityGrams)

    if (!lot || !Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      return
    }

    const nextQuantity =
      adjustmentDirection === 'IN' ? lot.quantityGrams + quantityGrams : lot.quantityGrams - quantityGrams
    if (nextQuantity < lot.reservedGrams) {
      return
    }

    const adjustmentPayload = {
      lotId: lot.id,
      direction: adjustmentDirection,
      quantityGrams,
      reason: adjustmentReason.trim() || 'Cycle count correction',
    }

    try {
      if (!canAdjustInventory) {
        await submitInventoryApprovalRequest(
          'inventory.adjust',
          adjustmentPayload,
          `${adjustmentDirection} ${formatGrams(quantityGrams)} for ${lot.lotNumber}`,
        )
        return
      }

      const response = await requestApi<InventoryAdjustmentResponse>('/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adjustmentPayload),
      })

      setLots((current) => current.map((item) => (item.id === response.lot.id ? response.lot : item)))
      setMovements((current) => [response.movement, ...current.filter((movement) => movement.id !== response.movement.id)])
      setAdjustmentQuantityGrams(5)
      setActiveKey('inventory')
      setModal(null)
    } catch (error) {
      if (isPermissionError(error, 'inventory.adjust')) {
        await submitInventoryApprovalRequest(
          'inventory.adjust',
          adjustmentPayload,
          `${adjustmentDirection} ${formatGrams(quantityGrams)} for ${lot.lotNumber}`,
        )
        return
      }
      setApprovalNotice(error instanceof Error ? error.message : 'Inventory adjustment failed')
      setActiveKey('inventory')
    }
  }, [
    adjustmentDirection,
    adjustmentLotId,
    adjustmentQuantityGrams,
    adjustmentReason,
    canAdjustInventory,
    isPermissionError,
    lots,
    submitInventoryApprovalRequest,
  ])

  const transferInventoryLot = useCallback(async () => {
    const lot = lots.find((item) => item.id === transferLotId)
    const toLocation = transferLocation.trim()

    if (!lot || !toLocation || lot.location === toLocation) {
      return
    }

    const transferPayload = { lotId: lot.id, toLocation, viaTransit: transferViaTransit }

    try {
      if (!canAdjustInventory) {
        await submitInventoryApprovalRequest(
          'inventory.transfer',
          transferPayload,
          `Move ${lot.lotNumber} to ${toLocation}`,
        )
        return
      }

      const response = await requestApi<InventoryTransferResponse>('/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transferPayload),
      })

      setLots((current) => current.map((item) => (item.id === response.lot.id ? response.lot : item)))
      setMovements((current) => [response.movement, ...current.filter((movement) => movement.id !== response.movement.id)])
      setActiveKey('inventory')
      setModal(null)
    } catch (error) {
      if (isPermissionError(error, 'inventory.adjust')) {
        await submitInventoryApprovalRequest(
          'inventory.transfer',
          transferPayload,
          `Move ${lot.lotNumber} to ${toLocation}`,
        )
        return
      }
      setApprovalNotice(error instanceof Error ? error.message : 'Inventory transfer failed')
      setActiveKey('inventory')
    }
  }, [
    canAdjustInventory,
    isPermissionError,
    lots,
    submitInventoryApprovalRequest,
    transferLotId,
    transferLocation,
    transferViaTransit,
  ])

  async function queueTenantAuditExport() {
    if (!currentSession) {
      setApprovalNotice('Login is required before queueing audit export.')
      return
    }

    setAuditExporting(true)
    try {
      const exportJob = await requestApi<AuditExportResponse>('/audit/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'JSON', scope: currentSession.organizationId }),
      })
      setApprovalNotice(
        `${exportJob.id} audit export is ready for ${exportJob.scope} with ${exportJob.eventCount} events.`,
      )
      setModal(null)
    } catch (error) {
      setApprovalNotice(error instanceof Error ? error.message : 'Audit export failed')
    } finally {
      setAuditExporting(false)
    }
  }

  function prepareAuthSession(session: AuthSession, token: string, permissions?: string[]) {
    const sessionWithPermissions = withSessionPermissions(session, permissions)
    acceptCsrfToken(token)

    writeStoredAuthSession(sessionWithPermissions)
    return sessionWithPermissions
  }

  function rememberTenantDomain(organizationId: string, domain?: string) {
    if (!domain?.trim()) {
      return
    }
    setTenantDomains((current) => ({ ...current, [organizationId]: domain.trim() }))
  }

  async function syncTenantDomain(organizationId: string) {
    try {
      const payload = await requestApi<SaasConsoleResponse>('/billing/console')
      rememberTenantDomain(organizationId, payload.sso.domain)
    } catch {
      // Domain display is cosmetic; tenant guards still come from the API session.
    }
  }

  useEffect(() => {
    if (!currentOrganizationId) {
      return
    }
    void syncTenantDomain(currentOrganizationId)
  }, [currentOrganizationId])

  useEffect(() => {
    if (!currentSession || !currentOrganizationId) {
      setWorkspaceBranding(workspaceBrandingFallback())
      return
    }

    let cancelled = false
    setWorkspaceBranding(workspaceBrandingFallback(currentOrganizationId))
    void requestApi<BrandingConfig>('/branding')
      .then((branding) => {
        if (!cancelled) {
          setWorkspaceBranding(branding)
        }
      })
      .catch(() => {
        // Keep the system default when a workspace does not have a saved brand yet.
      })

    return () => {
      cancelled = true
    }
  }, [currentOrganizationId, currentSession, currentSessionId])

  async function syncUserSettings(session: AuthSession) {
    try {
      const settings = await requestApi<UserSettingsRecord>('/user/settings')
      applyUserSettings(settings)
      return settings
    } catch {
      const fallback = userSettingsForSession(session)
      applyUserSettings(fallback)
      return fallback
    }
  }

  async function loginToWorkspace(email: string, password?: string) {
    const payload = await requestApi<LoginResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: password || undefined }),
    })
    const session = prepareAuthSession(payload.session, payload.csrfToken, payload.permissions)
    const settings = await syncUserSettings(session)
    void syncTenantDomain(session.organizationId)
    setActiveKey(safeLandingForSession(resumeKey ?? settings.preferredLanding, session))
    setResumeKey(null)
    setAuthNotice(null)
    setCurrentSession(session)
    return payload
  }

  async function signupWorkspace(input: {
    organizationName: string
    workspaceSlug: string
    email: string
    name: string
    password: string
    customDomain: string
  }) {
    const payload = await requestApi<SignupResponse>('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationName: input.organizationName.trim(),
        workspaceSlug: toWorkspaceSlug(input.workspaceSlug),
        customDomain: input.customDomain,
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        password: input.password,
      }),
    })
    const session = prepareAuthSession(payload.session, payload.csrfToken, payload.permissions)
    setCurrentSession(session)
    setResumeKey(null)
    setAuthNotice(null)
    rememberTenantDomain(payload.session.organizationId, payload.organization.customDomain ?? payload.sso.domain)
    void syncUserSettings(session)
    setBillingOnboarding(true)
    return payload
  }

  async function requestPasswordReset(email: string) {
    await requestApi<{ accepted: boolean }>('/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
  }

  async function completePasswordReset(token: string, password: string) {
    await requestApi<{ accepted: boolean }>('/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
  }

  async function logoutWorkspace() {
    try {
      await requestApi<{ session: AuthSession; audit: AuditEvent; invariant: string }>('/auth/logout', { method: 'POST' })
    } catch {
      // The local session must still be cleared if the demo API is unavailable.
    } finally {
      setCurrentSession(null)
      applyUserSettings(null)
      setSidebarCollapsed(false)
      setBillingOnboarding(false)
      setAuthNotice(null)
      setResumeKey(null)
      acceptCsrfToken()
      writeStoredAuthSession(null)
      setCommandOpen(false)
      setModal(null)
      setActiveKey('dashboard')
    }
  }

  if (!currentSession) {
    return (
        <AuthGateway
          notice={authNotice}
          onLogin={loginToWorkspace}
          onSignup={signupWorkspace}
          onRequestPasswordReset={requestPasswordReset}
          onCompletePasswordReset={completePasswordReset}
        />
    )
  }

  if (billingOnboarding) {
    return (
      <PostSignupWorkspaceReady
        session={currentSession}
        onComplete={closeBillingGate}
      />
    )
  }

  return (
    <div className="min-h-screen bg-lab-bg text-[var(--text)]" style={shellAccentStyle}>
      <LabBackdrop />
      <div
        className={`app-shell density-${activeUserSettings.uiDensity} ${activeUserSettings.reduceMotion ? 'is-reduced-motion' : ''} ${
          sidebarCollapsed ? 'is-rail' : ''
        } ${mobileNavOpen ? 'is-mobile-nav-open' : ''}`}
      >
        {mobileNavOpen ? (
          <button
            className="mobile-nav-scrim"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}
        <Sidebar
          activeKey={activeKey}
          branding={workspaceBranding}
          collapsed={sidebarCollapsed && !mobileNavOpen}
          mobileOpen={mobileNavOpen}
          session={currentSession}
          onNavigate={navigateToDomain}
          onToggle={toggleSidebar}
        />
        <main className="workspace">
          <Topbar
            activeDomain={selectedDomain}
            session={currentSession}
            tenantDomain={tenantDomains[currentSession.organizationId]}
            userSettings={activeUserSettings}
            mobileNavOpen={mobileNavOpen}
            onCommand={openCommandPalette}
            onLogout={() => void logoutWorkspace()}
            onMenu={() => setMobileNavOpen((value) => !value)}
            onOpenUserSettings={openUserSettingsModal}
            onToggleNotifications={() => setNotificationCenterOpen((value) => !value)}
          />
          {approvalNotice ? (
            <div className="approval-notice glass">
              <ShieldCheck size={16} />
              <span>{approvalNotice}</span>
              <button className="ghost-button small" type="button" onClick={() => setApprovalNotice(null)}>
                Dismiss
              </button>
            </div>
          ) : null}
          <AnimatePresence mode="wait" initial={!activeUserSettings.reduceMotion}>
            {activeKey === 'dashboard' ? (
              <motion.div key="dashboard" {...shellMotionPreset}>
                <Dashboard
                  stats={stats}
                  movements={movements}
                  activeKey={activeKey}
                  session={currentSession}
                  onNavigate={navigateToDomain}
                  onOpenModal={setModal}
                />
              </motion.div>
            ) : selectedDomain ? (
              <motion.div key={activeKey} {...shellMotionPreset}>
        <DomainWorkspace
          domain={selectedDomain}
          session={currentSession}
          lots={lots}
                  movements={movements}
                  storageLocations={storageLocationRecords}
                  stock={stock}
                  materialRecords={materialRecords}
                  onLotsChange={setLots}
                  onMovementsChange={setMovements}
                  onStorageLocationsChange={setStorageLocationRecords}
                  setMaterialRecords={setMaterialRecords}
                  formulaRecords={scopedFormulaRecords}
                  setFormulaRecords={setFormulaRecords}
                  activeFormulaId={activeFormulaId}
                  setActiveFormulaId={setActiveFormulaId}
                  labUsageFormulaRecords={publishedLabUsageFormulas}
                  labUsageFormulaId={labUsageFormulaId}
                  setLabUsageFormulaId={setLabUsageFormulaId}
                  selectedLabUsageFormula={selectedLabUsageFormula}
                  hasPublishedLabUsageFormula={hasPublishedLabUsageFormula}
                  resolvedLeaves={resolvedLeaves}
                  totals={totals}
                  curve={curve}
                  selectedMaterialId={selectedMaterialId}
                  setSelectedMaterialId={setSelectedMaterialId}
                  labPlan={labPlan}
                  batchGrams={batchGrams}
                  setBatchGrams={setBatchGrams}
                  usageHistory={usageHistory}
                  weighingSession={weighingSessionPreview}
                  actualWeights={actualWeights}
                  onActualWeightChange={(key, value) =>
                    setActualWeights((current) => ({
                      ...current,
                      [key]: value,
                    }))
                  }
                  weighingTolerancePercent={weighingTolerancePercent}
                  setWeighingTolerancePercent={setWeighingTolerancePercent}
                  weighingOperator={weighingOperator}
                  setWeighingOperator={setWeighingOperator}
                  labUsagePurpose={labUsagePurpose}
                  setLabUsagePurpose={setLabUsagePurpose}
                  labUsageProjectCode={labUsageProjectCode}
                  setLabUsageProjectCode={setLabUsageProjectCode}
                  labUsageSampleCode={labUsageSampleCode}
                  setLabUsageSampleCode={setLabUsageSampleCode}
                  labUsageStatusMessage={labUsageStatusMessage}
                  labUsageBusy={labUsageBusy}
                  weighingReady={weighingReady}
                  onUseTargetWeights={setTargetWeights}
                  onCommit={() => setModal('commit')}
                  onReverse={reverseLatestUsage}
                  onOpenModal={setModal}
                  onNewFormula={(type = 'ACCORD') => {
                    selectNewFormulaType(type)
                    setModal('newFormula')
                  }}
                  onAddFormulaLine={() => setModal('formulaLine')}
                  onReceiveStock={() => setModal('receiveStock')}
                  onAdjustStock={() => setModal('inventoryAdjustment')}
                  onTransferStock={() => setModal('inventoryTransfer')}
                  onRequestInventoryApproval={submitInventoryApprovalRequest}
                  userSettings={activeUserSettings}
                  onUserSettingsChange={applyUserSettings}
                  onWorkspaceBrandingChange={setWorkspaceBranding}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>
      </div>

        <CommandPalette
          open={commandOpen}
          session={currentSession}
          onClose={closeCommandPalette}
          onNavigate={navigateToDomain}
          onCommit={() => setModal('commit')}
        />

        <NotificationCenter
          open={notificationCenterOpen}
          onClose={() => setNotificationCenterOpen(false)}
          onNavigate={(key) => {
            navigateToDomain(key)
            setNotificationCenterOpen(false)
          }}
        />

        <BlackPopup
          open={modal === 'userSettings'}
          title="User Settings"
          description="Personal preferences for this signed-in user. Workspace admins can also manage the shared navigation brand."
          actionLabel="Close"
          onClose={closeCurrentModal}
          onAction={closeCurrentModal}
        >
        <UserSettingsForm
          settings={activeUserSettings}
          session={currentSession}
          onSaved={(settings) => {
            applyUserSettings(settings)
            setActiveKey(safeLandingForSession(settings.preferredLanding, currentSession))
            setModal(null)
          }}
        />
      </BlackPopup>

      <BlackPopup
        open={modal === 'commit'}
        title="Commit lab usage"
        description="This creates immutable OUT movements for eligible lots. Formula save/review stays non-consuming."
        actionLabel="Create movements"
        onClose={() => setModal(null)}
        onAction={commitLabUsage}
        actionDisabled={!hasPublishedLabUsageFormula || !weighingReady || labUsageBusy}
      >
        <UsagePreview allocations={labPlan.allocations} shortfalls={labPlan.shortfalls} compact />
        <WeighingEvidence session={weighingSessionPreview} compact />
      </BlackPopup>

      <BlackPopup
        open={modal === 'newFormula'}
        title="New formula draft"
        description="Creates a draft formula shell. Saving a formula never consumes inventory; only lab usage or production movements do."
        actionLabel="Create Formula"
        onClose={() => setModal(null)}
        onAction={createFormulaDraft}
        actionDisabled={!newFormulaName.trim() || newFormulaTargetGrams <= 0}
      >
        <div className="form-grid">
          <div className="formula-type-grid" role="group" aria-label="Formula type">
            {(['ACCORD', 'FINE_FRAGRANCE'] as FormulaType[]).map((type) => {
              const meta = formulaTypeMeta[type]
              return (
                <button
                  className={`formula-type-option ${newFormulaType === type ? 'is-active' : ''}`}
                  key={type}
                  type="button"
                  onClick={() => selectNewFormulaType(type)}
                >
                  <span>{meta.shortLabel}</span>
                  <strong>{meta.label}</strong>
                </button>
              )
            })}
          </div>
          <label className="field-row">
            <span>Formula name</span>
            <input
              aria-label="Formula name"
              value={newFormulaName}
              onChange={(event) => setNewFormulaName(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Target grams</span>
            <input
              aria-label="Formula target grams"
              min={1}
              step={1}
              type="number"
              value={newFormulaTargetGrams}
              onChange={(event) => setNewFormulaTargetGrams(Number(event.target.value))}
            />
          </label>
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'formulaLine'}
        title="Add formula ingredient"
        description="Adds a raw material line to the active formula. This recalculates resolve, cost, and evaporation without touching stock."
        actionLabel="Add Ingredient"
        onClose={() => setModal(null)}
        onAction={addFormulaMaterialLine}
        actionDisabled={!newLineMaterialId || newLineGrams <= 0}
      >
        <div className="form-grid">
          <label className="field-row">
            <span>Material</span>
            <select
              aria-label="Formula line material"
              value={newLineMaterialId}
              onChange={(event) => setNewLineMaterialId(event.target.value)}
            >
              {materialRecords.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Line grams</span>
            <input
              aria-label="Formula line grams"
              min={0.01}
              step={0.01}
              type="number"
              value={newLineGrams}
              onChange={(event) => setNewLineGrams(Number(event.target.value))}
            />
          </label>
          <div className="popup-grid">
            <Metric label="Active formula" value={selectedFormula.code} />
            <Metric label="Target" value={formatGrams(selectedFormula.targetGrams)} />
          </div>
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'receiveStock'}
        title="Receive stock / create lot"
        description={
          canReceiveInventory
            ? 'Creates an approved inventory lot and a matching immutable RECEIPT movement.'
            : 'Submits a stock receipt request for an admin to approve before stock changes.'
        }
        actionLabel={canReceiveInventory ? 'Create Lot' : 'Request Approval'}
        onClose={() => setModal(null)}
        onAction={receiveStockLot}
        actionDisabled={!receiveMaterialId || receiveQuantityGrams <= 0}
      >
        <div className="form-grid">
          <label className="field-row">
            <span>Material</span>
            <select
              aria-label="Receipt material"
              value={receiveMaterialId}
              onChange={(event) => setReceiveMaterialId(event.target.value)}
            >
              {materialRecords.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Lot number</span>
            <input
              aria-label="Receipt lot number"
              value={receiveLotNumber}
              onChange={(event) => setReceiveLotNumber(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Quantity grams</span>
            <input
              aria-label="Receipt quantity grams"
              min={0.1}
              step={0.1}
              type="number"
              value={receiveQuantityGrams}
              onChange={(event) => setReceiveQuantityGrams(Number(event.target.value))}
            />
          </label>
          <label className="field-row">
            <span>Expiry date</span>
            <input
              aria-label="Receipt expiry date"
              type="date"
              value={receiveExpiryDate}
              onChange={(event) => setReceiveExpiryDate(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>SDS file</span>
            <input
              aria-label="Receipt SDS file"
              accept="application/pdf,image/png,image/jpeg"
              type="file"
              onChange={(event) => setReceiveSdsFile(event.target.files?.[0] ?? null)}
            />
            <small>{receiveSdsFile ? `${receiveSdsFile.name} attached for review` : 'Optional PDF or image'}</small>
          </label>
          <label className="field-row">
            <span>CoA file</span>
            <input
              aria-label="Receipt CoA file"
              accept="application/pdf,image/png,image/jpeg"
              type="file"
              onChange={(event) => setReceiveCoaFile(event.target.files?.[0] ?? null)}
            />
            <small>{receiveCoaFile ? `${receiveCoaFile.name} attached for review` : 'Optional PDF or image'}</small>
          </label>
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'inventoryAdjustment'}
        title="Adjust stock"
        description={
          canAdjustInventory
            ? 'Creates an immutable ADJUSTMENT movement. Available stock cannot go negative.'
            : 'Submits an inventory adjustment request for an admin to approve before stock changes.'
        }
        actionLabel={canAdjustInventory ? 'Create Adjustment' : 'Request Approval'}
        onClose={() => setModal(null)}
        onAction={adjustInventoryLot}
        actionDisabled={!adjustmentLotId || adjustmentQuantityGrams <= 0 || adjustmentWouldGoNegative}
      >
        <div className="form-grid">
          <label className="field-row">
            <span>Lot</span>
            <select
              aria-label="Adjustment lot"
              value={adjustmentLotId}
              onChange={(event) => setAdjustmentLotId(event.target.value)}
            >
              {lots.map((lot) => {
                const material = materialRecords.find((item) => item.id === lot.materialId)
                return (
                  <option key={lot.id} value={lot.id}>
                    {lot.lotNumber} / {material?.name} / {formatGrams(lot.quantityGrams)}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="field-row">
            <span>Direction</span>
            <select
              aria-label="Adjustment direction"
              value={adjustmentDirection}
              onChange={(event) => setAdjustmentDirection(event.target.value as 'IN' | 'OUT')}
            >
              <option value="OUT">OUT - write down</option>
              <option value="IN">IN - correction gain</option>
            </select>
          </label>
          <label className="field-row">
            <span>Quantity grams</span>
            <input
              aria-label="Adjustment quantity grams"
              min={0.1}
              step={0.1}
              type="number"
              value={adjustmentQuantityGrams}
              onChange={(event) => setAdjustmentQuantityGrams(Number(event.target.value))}
            />
          </label>
          <label className="field-row">
            <span>Reason</span>
            <input
              aria-label="Adjustment reason"
              value={adjustmentReason}
              onChange={(event) => setAdjustmentReason(event.target.value)}
            />
          </label>
          {adjustmentWouldGoNegative && (
            <div className="empty-state compact">
              <strong>Blocked by INV-005 no negative stock.</strong>
              <span>Reduce the write-down or release reservations first.</span>
            </div>
          )}
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'inventoryTransfer'}
        title="Transfer lot"
        description={
          canAdjustInventory
            ? 'Moves a lot between storage locations and records TRANSFER / MOVE evidence without changing stock.'
            : 'Submits a lot transfer request for an admin to approve before the location changes.'
        }
        actionLabel={canAdjustInventory ? 'Confirm Transfer' : 'Request Approval'}
        onClose={() => setModal(null)}
        onAction={transferInventoryLot}
        actionDisabled={!transferLotId || !transferLocation.trim() || selectedTransferLot?.location === transferLocation}
      >
        <div className="form-grid">
          <label className="field-row">
            <span>Lot</span>
            <select
              aria-label="Transfer lot"
              value={transferLotId}
              onChange={(event) => setTransferLotId(event.target.value)}
            >
              {lots.map((lot) => {
                const material = materialRecords.find((item) => item.id === lot.materialId)
                return (
                  <option key={lot.id} value={lot.id}>
                    {lot.lotNumber} / {material?.name} / {lot.location}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="field-row">
            <span>To location</span>
            <select
              aria-label="Transfer location"
              value={transferLocation}
              onChange={(event) => setTransferLocation(event.target.value)}
            >
              {storageLocationRecords.map((location) => (
                <option key={location.id} value={location.name}>
                  {location.name} / {location.condition}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              aria-label="Transfer via transit"
              checked={transferViaTransit}
              type="checkbox"
              onChange={(event) => setTransferViaTransit(event.target.checked)}
            />
            <span>Route through Transit and complete receipt at the destination later</span>
          </label>
          <div className="popup-grid">
            <Metric label="Movement type" value="TRANSFER" />
            <Metric label="Quantity effect" value={transferViaTransit ? 'Two MOVE events / no stock delta' : 'No stock delta'} />
          </div>
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'auditExport'}
        title="Audit export"
        description="Enterprise export is scoped to the current workspace and every download is logged."
        actionLabel={auditExporting ? 'Queueing export' : 'Queue JSON export'}
        onClose={() => setModal(null)}
        onAction={queueTenantAuditExport}
        actionDisabled={auditExporting}
      >
        <div className="popup-grid">
          <Metric label="Events" value="9,144" />
          <Metric label="Format" value="JSON" />
          <Metric label="Scope" value={currentSession.organizationId} />
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'ssoPolicy'}
        title="SSO and workspace security"
        description="Owner/Admin actions require MFA. SSO group mapping never bypasses workspace scope."
        actionLabel="Mark reviewed"
        onClose={() => setModal(null)}
        onAction={() => setModal(null)}
      >
        <ul className="policy-list">
          <li>OIDC domain verified for noxelis.lab</li>
          <li>SCIM deprovisioning revokes sessions immediately</li>
          <li>API key rotation raises a security alert</li>
        </ul>
      </BlackPopup>
    </div>
  )
}

function Sidebar({
  activeKey,
  branding,
  collapsed,
  mobileOpen,
  session,
  onNavigate,
  onToggle,
}: {
  activeKey: DomainKey
  branding: BrandingConfig
  collapsed: boolean
  mobileOpen: boolean
  session: AuthSession
  onNavigate: (key: DomainKey) => void
  onToggle: () => void
}) {
  const brandName = branding.displayName.trim() || 'OlfactoryOps'
  const brandInitials = brandName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('')
  const isSystemBrand = brandName === 'OlfactoryOps'
  const logoImageUrl = branding.logoMode === 'image' ? normalizeBrandLogoImageUrl(branding.logoImageUrl) : undefined
  const showImageLockup = Boolean(logoImageUrl && !collapsed)

  return (
    <aside className="sidebar glass" style={mobileOpen ? { left: 10, transform: 'none' } : undefined}>
      <div className="brand-row">
        {showImageLockup ? (
          <div className="brand-image-lockup" style={{ borderColor: `${branding.accentColor}66` }} title={`${brandName} workspace brand`}>
            <span aria-hidden="true">{brandName}</span>
            <img alt={`${brandName} logo`} src={logoImageUrl} onError={(event) => { event.currentTarget.hidden = true }} />
          </div>
        ) : (
          <>
            <div
              className={`brand-mark ${branding.logoMode === 'monogram' ? 'is-monogram' : ''} ${logoImageUrl ? 'is-image' : ''}`}
              style={{ background: branding.accentColor }}
              title={`${brandName} workspace brand`}
            >
              {logoImageUrl ? (
                <>
                  <span aria-hidden="true">{brandInitials || 'O'}</span>
                  <img alt="" src={logoImageUrl} onError={(event) => { event.currentTarget.hidden = true }} />
                </>
              ) : branding.logoMode === 'monogram' ? (
                brandInitials || 'O'
              ) : (
                <Sparkles size={18} />
              )}
            </div>
            {!collapsed && (
              <div>
                <div className="wordmark">{brandName}</div>
                <div className="mono-small">{isSystemBrand ? 'OlfactoryOps OS' : uiText('Powered by OlfactoryOps')}</div>
              </div>
            )}
          </>
        )}
        <button
          className="icon-button sidebar-toggle"
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? uiText('Expand sidebar') : uiText('Collapse sidebar')}
          aria-pressed={!collapsed}
          title={collapsed ? uiText('Expand sidebar') : uiText('Collapse sidebar')}
        >
          <Menu size={18} />
        </button>
      </div>

      <nav className="nav-stack" id="primary-navigation" aria-label={uiText('Main modules')}>
        {visibleNavGroupsForSession(session).map((group) => (
          <div className="nav-group" key={group.title}>
            {!collapsed && <div className="nav-title">{uiText(group.title)}</div>}
            {group.keys.map((key) => {
              const domain = key === 'dashboard' ? undefined : domains.find((item) => item.key === key)
              const displayDomain = domain ? domainDisplayForSession(domain, session) : undefined
              const Icon = domainIcons[key]
              const label = key === 'dashboard' ? uiText('OlfactoryOps Console') : displayDomain?.shortName ?? key
              const isActive = activeKey === key
              return (
                <button
                  key={key}
                  className={`nav-item ${isActive ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => onNavigate(key)}
                  title={label}
                >
                  <Icon size={18} />
                  {!collapsed && <span>{label}</span>}
                  {!collapsed && displayDomain && isInternalAdminSession(session) && (
                    <StatusDot status={displayDomain.status} />
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}

function Topbar({
  activeDomain,
  session,
  tenantDomain,
  userSettings,
  mobileNavOpen,
  onCommand,
  onLogout,
  onMenu,
  onOpenUserSettings,
  onToggleNotifications,
}: {
  activeDomain?: DomainModule
  session: AuthSession
  tenantDomain?: string
  userSettings: UserSettingsRecord
  mobileNavOpen: boolean
  onCommand: () => void
  onLogout: () => void
  onMenu: () => void
  onOpenUserSettings: () => void
  onToggleNotifications: () => void
}) {
  const tenantDisplay = tenantDisplayForSession(session, tenantDomain)
  const displayDomain = activeDomain ? domainDisplayForSession(activeDomain, session) : undefined

  return (
    <header className="topbar glass">
      <button
        className="icon-button mobile-menu"
        type="button"
        onClick={onMenu}
        aria-label={mobileNavOpen ? uiText('Close navigation') : uiText('Open navigation')}
        aria-controls="primary-navigation"
        aria-expanded={mobileNavOpen}
      >
        <Menu size={18} />
      </button>
      <div className="topbar-title-block">
        <div className="mono-small">{tenantDisplay.label}</div>
        <h1>{displayDomain ? displayDomain.name : uiText('OlfactoryOps Console')}</h1>
      </div>
      <button className="command-button" type="button" onClick={onCommand}>
        <Search size={17} />
        <span>{uiText('Search modules, records, actions')}</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="topbar-actions">
        {isInternalAdminSession(session) ? (
          <DataTag icon={ShieldCheck} label="Workspace guard" value="On" tone="green" />
        ) : null}
        <button className="user-chip" type="button" onClick={onOpenUserSettings} aria-label={uiText('Open user settings')}>
          <span className="user-avatar">{userSettings.displayName.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{userSettings.displayName}</strong>
            <small>
              {session.role} / {session.email}
            </small>
          </span>
        </button>
        <button className="icon-button" type="button" aria-label={uiText('User settings')} onClick={onOpenUserSettings}>
          <Settings size={18} />
        </button>
        <button className="icon-button" type="button" aria-label={uiText('Notifications')} onClick={onToggleNotifications}>
          <Bell size={18} />
        </button>
        <button className="ghost-button small" type="button" onClick={onLogout}>
          {uiText('Logout')}
        </button>
      </div>
    </header>
  )
}

function LegalPrivacyControls() {
  const [acceptances, setAcceptances] = useState<LegalAcceptanceRecord[]>([])
  const [requests, setRequests] = useState<PrivacyRequestRecord[]>([])
  const [status, setStatus] = useState('Loading legal status...')

  const load = useCallback(async () => {
    try {
      const [legal, privacy] = await Promise.all([
        requestApi<{ acceptances: LegalAcceptanceRecord[] }>('/legal/status'),
        requestApi<{ requests: PrivacyRequestRecord[] }>('/privacy/requests'),
      ])
      setAcceptances(legal.acceptances)
      setRequests(privacy.requests)
      setStatus('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Legal status could not be loaded')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function accept(document: 'terms' | 'privacy' | 'cookies') {
    try {
      const payload = await requestApi<{ acceptance: LegalAcceptanceRecord }>('/legal/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document, version: '2026-07-22' }),
      })
      setAcceptances((current) => [payload.acceptance, ...current.filter((item) => item.id !== payload.acceptance.id)])
      setStatus(`${document} acceptance recorded.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Acceptance could not be recorded')
    }
  }

  async function requestData(type: 'EXPORT' | 'ERASURE') {
    try {
      const payload = await requestApi<{ request: PrivacyRequestRecord }>('/privacy/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      setRequests((current) => [payload.request, ...current.filter((item) => item.id !== payload.request.id)])
      setStatus(`${type === 'EXPORT' ? 'Data export' : 'Erasure'} request submitted for review.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Privacy request could not be submitted')
    }
  }

  async function downloadPrivacyExport(request: PrivacyRequestRecord) {
    try {
      const payload = await requestApi<{ request: PrivacyRequestRecord; export: Record<string, unknown> }>(
        `/privacy/requests/${encodeURIComponent(request.id)}/export`,
        { method: 'POST' },
      )
      const blob = new Blob([JSON.stringify(payload.export, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `olfactoryops-data-export-${request.id}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setRequests((current) => current.map((item) => item.id === payload.request.id ? payload.request : item))
      setStatus('Personal data export downloaded.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Data export could not be generated')
    }
  }

  const accepted = (document: LegalAcceptanceRecord['document']) =>
    acceptances.some((item) => item.document === document && item.version === '2026-07-22')
  const latestExportRequest = requests.find((item) => item.type === 'EXPORT')

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <strong>Legal & Privacy</strong>
        <span>Versioned consent and data-subject requests for this account.</span>
      </div>
      <div className="legal-actions">
        {(['terms', 'privacy', 'cookies'] as const).map((document) => (
          <button
            className="ghost-button small"
            key={document}
            type="button"
            onClick={() => void accept(document)}
            disabled={accepted(document)}
          >
            {accepted(document) ? `${document} accepted` : `Accept ${document}`}
          </button>
        ))}
      </div>
      <div className="legal-actions">
        <button className="ghost-button small" type="button" onClick={() => void requestData('EXPORT')}>Request data export</button>
        <button className="ghost-button small" type="button" onClick={() => void requestData('ERASURE')}>Request erasure review</button>
        {latestExportRequest ? (
          <button className="ghost-button small" type="button" onClick={() => void downloadPrivacyExport(latestExportRequest)}>
            Download data export
          </button>
        ) : null}
      </div>
      {requests.length > 0 ? <span className="mono-small">Latest request: {requests[0]?.type} / {requests[0]?.status}</span> : null}
      {status ? <span className="mono-small">{status}</span> : null}
    </section>
  )
}

function UserSettingsForm({
  settings,
  session,
  onSaved,
}: {
  settings: UserSettingsRecord
  session: AuthSession
  onSaved: (settings: UserSettingsRecord) => void
}) {
  const [draft, setDraft] = useState<UserSettingsRecord>(settings)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Changes apply to your account only.')
  const normalizedDraftAccentColor = normalizeHexColor(draft.accentColor ?? defaultAccentColor)
  const safeDraftAccentColor = normalizedDraftAccentColor ?? defaultAccentColor
  const accentPreviewStyle = useMemo(() => accentStyleForColor(safeDraftAccentColor), [safeDraftAccentColor])
  const landingDomains = useMemo(() => visibleDomainsForSession(session), [session])
  const draftPreferredLanding = safeLandingForSession(draft.preferredLanding, session)

  useEffect(() => {
    setDraft({ ...settings, preferredLanding: safeLandingForSession(settings.preferredLanding, session) })
    setStatus('Changes apply to your account only.')
  }, [settings, session])

  async function saveSettings() {
    setBusy(true)
    setStatus('Saving preferences...')
    try {
      const payload = await requestApi<UserSettingsUpdateResponse>('/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: draft.displayName,
          preferredLanding: draftPreferredLanding,
          uiDensity: draft.uiDensity,
          sidebarMode: draft.sidebarMode,
          reduceMotion: draft.reduceMotion,
          emailDigest: draft.emailDigest,
          accentColor: safeDraftAccentColor,
          formulaWorkspace: draft.formulaWorkspace,
        }),
      })
      setStatus('Preferences saved.')
      onSaved(payload.settings)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save user settings')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="user-settings-form">
      <div className="settings-identity-card" style={accentPreviewStyle}>
        <span className="user-avatar large">{draft.displayName.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{session.email}</strong>
          <span>
            {session.role} / {session.organizationId}
          </span>
        </div>
      </div>

      <section className="settings-section">
        <div className="settings-section-heading">
          <strong>Profile</strong>
          <span>Personal identity shown in the workspace.</span>
        </div>
        <div className="settings-form-grid">
          <label className="field-row">
            <span>Display name</span>
            <input
              aria-label="Display name"
              value={draft.displayName}
              onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Email</span>
            <input aria-label="User email" readOnly value={session.email} />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <strong>Appearance</strong>
          <span>Color, density, and motion preferences for this account.</span>
        </div>
        <div className="settings-form-grid">
          <div className="field-row color-field">
            <span>Interface color</span>
            <div className="color-control">
              <input
                aria-label="Interface color picker"
                type="color"
                value={safeDraftAccentColor}
                onChange={(event) => setDraft((current) => ({ ...current, accentColor: event.target.value }))}
              />
              <input
                aria-label="Interface color hex"
                value={draft.accentColor ?? ''}
                onBlur={() =>
                  setDraft((current) => ({
                    ...current,
                    accentColor: normalizeHexColor(current.accentColor) ?? current.accentColor,
                  }))
                }
                onChange={(event) => setDraft((current) => ({ ...current, accentColor: event.target.value }))}
              />
            </div>
            <div className="accent-swatch-row" aria-label="Accent color presets">
              {accentColorPresets.map((color) => (
                <button
                  aria-label={`Use ${color} interface color`}
                  className={`accent-swatch ${safeDraftAccentColor === color ? 'is-active' : ''}`}
                  key={color}
                  style={{ background: color }}
                  title={color}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, accentColor: color }))}
                />
              ))}
            </div>
            {!normalizedDraftAccentColor ? <small className="field-hint is-danger">Use #RRGGBB or #RGB.</small> : null}
          </div>
          <label className="field-row">
            <span>Layout density</span>
            <select
              aria-label="Layout density"
              value={draft.uiDensity}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  uiDensity: event.target.value === 'compact' ? 'compact' : 'comfortable',
                }))
              }
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className="field-row">
            <span>Default sidebar</span>
            <select
              aria-label="Default sidebar"
              value={draft.sidebarMode}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sidebarMode: event.target.value === 'rail' ? 'rail' : 'expanded',
                }))
              }
            >
              <option value="expanded">Expanded navigation</option>
              <option value="rail">Compact rail</option>
            </select>
          </label>
        </div>
        <label className="toggle-row">
          <input
            checked={draft.reduceMotion}
            type="checkbox"
            onChange={(event) => setDraft((current) => ({ ...current, reduceMotion: event.target.checked }))}
          />
          <span>
            <strong>Reduce motion</strong>
            <small>Minimize page transitions and decorative motion.</small>
          </span>
        </label>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <strong>Workspace Defaults</strong>
          <span>Where this user lands and how often they receive summaries.</span>
        </div>
        <div className="settings-form-grid">
          <label className="field-row">
            <span>Preferred landing</span>
            <select
              aria-label="Preferred landing"
              value={draftPreferredLanding}
              onChange={(event) =>
                setDraft((current) => ({ ...current, preferredLanding: event.target.value as DomainKey }))
              }
            >
              <option value="dashboard">OlfactoryOps Console</option>
              {landingDomains.map((domain) => {
                const displayDomain = domainDisplayForSession(domain, session)
                return (
                  <option key={domain.key} value={domain.key}>
                    {displayDomain.name}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="field-row">
            <span>Email digest</span>
            <select
              aria-label="Email digest"
              value={draft.emailDigest}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  emailDigest:
                    event.target.value === 'off' || event.target.value === 'daily' ? event.target.value : 'weekly',
                }))
              }
            >
              <option value="off">Off</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
        </div>
      </section>

      <LegalPrivacyControls />

      <div className="settings-save-row">
        <span className="mono-small">{status}</span>
        <button
          className="primary-button"
          type="button"
          onClick={() => void saveSettings()}
          disabled={busy || !draft.displayName.trim() || !normalizedDraftAccentColor}
        >
          {busy ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

function toWorkspaceSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48)
}

function toWorkspaceDomain(slug: string) {
  return `${toWorkspaceSlug(slug) || 'workspace'}.labofscents.org`
}

function saasHealthTone(status: SaasHealthStatus): DomainStatus {
  if (status === 'blocked') return 'alert'
  if (status === 'warning') return 'review'
  return 'stable'
}

function worstSaasHealthStatus(statuses: SaasHealthStatus[], fallback: SaasHealthStatus = 'warning'): SaasHealthStatus {
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('warning')) return 'warning'
  return statuses.length > 0 ? 'pass' : fallback
}

function buildSaasHealthSummary(data: SaasConsoleResponse): SaasHealthSummary {
  const activeApiKeys = data.apiKeys.filter((key) => key.status === 'active').length
  const activeWebhooks = data.webhooks.filter((webhook) => webhook.status === 'active').length
  const failedDeliveries = data.webhookDeliveries.filter((delivery) => delivery.status === 'failed').length
  const retryingDeliveries = data.webhookDeliveries.filter((delivery) => delivery.status === 'retrying').length
  const readyAuditExports = data.auditExports.filter((job) => job.status === 'READY').length
  const openInvoices = data.invoices.filter((invoice) => invoice.status === 'open' || invoice.status === 'paid').length
  const limitStatus = worstSaasHealthStatus(data.limitChecks.map((check) => check.status))
  const readinessStatus = worstSaasHealthStatus(data.readiness.map((check) => check.status))
  const ssoReady = data.sso.status === 'enforced' || (data.sso.status === 'verified' && data.sso.scim.enabled)

  const factors: SaasHealthFactor[] = [
    {
      key: 'subscription-write-gate',
      label: 'Subscription write gate',
      status: data.subscription.canWrite ? 'pass' : 'blocked',
      detail: `${data.subscription.status} subscription; write access is ${data.subscription.canWrite ? 'enabled' : 'blocked'}.`,
    },
    {
      key: 'plan-limits',
      label: 'Plan limit enforcement',
      status: limitStatus,
      detail:
        data.limitChecks.length > 0
          ? `${data.limitChecks.filter((check) => check.status === 'pass').length}/${data.limitChecks.length} usage checks are inside limits.`
          : 'Usage limits are waiting for live API data.',
    },
    {
      key: 'invoice-lifecycle',
      label: 'Invoice lifecycle',
      status: openInvoices > 0 || data.subscription.status === 'trialing' ? 'pass' : 'warning',
      detail: `${data.invoices.length} invoice record(s); ${openInvoices} payable or paid invoice(s).`,
    },
    {
      key: 'sso-scim',
      label: 'SSO / SCIM readiness',
      status: ssoReady ? 'pass' : 'warning',
      detail: `${data.sso.provider} ${data.sso.status}; SCIM ${data.sso.scim.status}.`,
    },
    {
      key: 'api-keys',
      label: 'API key lifecycle',
      status: activeApiKeys > 0 ? 'pass' : 'warning',
      detail: `${activeApiKeys} active key(s); secrets are reveal-once and stored server-side as hashes.`,
    },
    {
      key: 'webhooks',
      label: 'Webhook endpoints',
      status: activeWebhooks > 0 ? 'pass' : 'warning',
      detail: `${activeWebhooks} active signed endpoint(s) out of ${data.plan.limits.webhooks} allowed.`,
    },
    {
      key: 'delivery-retry',
      label: 'Webhook delivery retry',
      status: failedDeliveries > 0 ? 'blocked' : retryingDeliveries > 0 ? 'warning' : 'pass',
      detail: `${failedDeliveries} failed and ${retryingDeliveries} retrying delivery record(s).`,
    },
    {
      key: 'audit-export',
      label: 'Audit export evidence',
      status: readyAuditExports > 0 ? 'pass' : 'warning',
      detail: `${readyAuditExports} ready workspace-scoped export(s) with checksum evidence.`,
    },
    {
      key: 'readiness-gate',
      label: 'Commercial readiness gate',
      status: readinessStatus,
      detail:
        data.readiness.length > 0
          ? `${data.readiness.filter((check) => check.status === 'pass').length}/${data.readiness.length} readiness controls pass.`
          : 'Readiness checks are waiting for live API data.',
    },
  ]
  const passCount = factors.filter((factor) => factor.status === 'pass').length
  const warningCount = factors.filter((factor) => factor.status === 'warning').length
  const blockedCount = factors.filter((factor) => factor.status === 'blocked').length
  const score = Math.round(
    factors.reduce((sum, factor) => sum + (factor.status === 'pass' ? 100 : factor.status === 'warning' ? 70 : 30), 0) /
      Math.max(1, factors.length),
  )

  return {
    score,
    status: blockedCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'pass',
    factors,
    passCount,
    warningCount,
    blockedCount,
  }
}

function PostSignupWorkspaceReady({
  session,
  onComplete,
}: {
  session: AuthSession
  onComplete: () => void
}) {
  return (
    <div className="min-h-screen bg-lab-bg text-[var(--text)]">
      <LabBackdrop />
      <main className="auth-shell">
        <section className="billing-onboarding glass">
          <div className="billing-onboarding-copy">
            <div className="brand-row">
              <div className="brand-mark">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="wordmark">Workspace ready</div>
                <div className="mono-small">{session.organizationId}</div>
              </div>
            </div>
            <h1>Your beta workspace is ready.</h1>
            <p className="lead">
              Start building with your team now. Subscription options are temporarily hidden while beta access is managed directly by OlfactoryOps.
            </p>
            <div className="tag-row">
              <DataTag icon={ShieldCheck} label="Workspace" value="Ready" tone="green" />
              <DataTag icon={UsersRound} label="Owner" value={session.email} tone="blue" />
            </div>
          </div>
          <div className="action-row">
            <button className="primary-button" type="button" onClick={onComplete}>
              Open workspace
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

function AuthGateway({
  notice,
  onLogin,
  onSignup,
  onRequestPasswordReset,
  onCompletePasswordReset,
}: {
  notice?: string | null
  onLogin: (email: string, password?: string) => Promise<LoginResponse>
  onSignup: (input: {
    organizationName: string
    workspaceSlug: string
    email: string
    name: string
    password: string
    customDomain: string
  }) => Promise<SignupResponse>
  onRequestPasswordReset: (email: string) => Promise<void>
  onCompletePasswordReset: (token: string, password: string) => Promise<void>
}) {
  const resetToken = new URLSearchParams(window.location.search).get('reset')?.trim() ?? ''
  const [mode, setMode] = useState<'login' | 'signup' | 'reset-request' | 'reset-confirm'>(
    resetToken ? 'reset-confirm' : 'login',
  )
  const [email, setEmail] = useState('admin@labofscents.org')
  const [name, setName] = useState('Thuan Le Minh')
  const [organizationName, setOrganizationName] = useState('NOXELIS Lab')
  const [workspaceSlug, setWorkspaceSlug] = useState('noxelis-live')
  const [workspaceSlugTouched, setWorkspaceSlugTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(
    notice ?? 'Login with an active workspace account, or sign up a new workspace.',
  )
  const workspaceDomain = toWorkspaceDomain(workspaceSlug)
  const signupPasswordReady = password.length >= 12 && /[A-Za-z]/.test(password) && /\d/.test(password)
  const signupReady = Boolean(
    organizationName.trim() &&
      workspaceSlug.trim() &&
      email.trim() &&
      name.trim() &&
      signupPasswordReady &&
      password === confirmPassword,
  )

  async function submitAuth() {
    setBusy(true)
    setStatus(
      mode === 'login'
        ? 'Checking workspace account'
        : mode === 'signup'
          ? 'Creating your lab workspace'
          : mode === 'reset-request'
            ? 'Requesting password reset'
            : 'Resetting password',
    )
    try {
      if (mode === 'login') {
        const result = await onLogin(email, password)
        setStatus(`${result.session.email} signed in with ${result.session.role} role`)
      } else if (mode === 'signup') {
        if (!signupPasswordReady) {
          setStatus('Password must be at least 12 characters and include letters and numbers.')
          return
        }
        if (password !== confirmPassword) {
          setStatus('Passwords must match before creating the workspace.')
          return
        }
        const result = await onSignup({ organizationName, workspaceSlug, email, name, password, customDomain: workspaceDomain })
        setStatus(`${result.organization.name} provisioned at ${result.organization.customDomain ?? result.sso.domain}`)
      } else if (mode === 'reset-request') {
        await onRequestPasswordReset(email)
        setStatus('If the account exists, a one-time reset link has been sent. Check your inbox.')
        setMode('login')
      } else {
        if (!signupPasswordReady || password !== confirmPassword) {
          setStatus('Use a matching password with at least 12 characters, letters, and numbers.')
          return
        }
        await onCompletePasswordReset(resetToken, password)
        window.history.replaceState({}, document.title, window.location.pathname)
        setPassword('')
        setConfirmPassword('')
        setMode('login')
        setStatus('Password reset complete. Sign in with your new password.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(nextMode: 'login' | 'signup') {
    setMode(nextMode)
    setStatus(nextMode === 'login' ? 'Use admin@labofscents.org with the admin test password.' : 'Create a new lab workspace and owner account.')
    setWorkspaceSlugTouched(false)
    if (nextMode === 'signup') {
      const defaultOrganizationName = 'New Fragrance Lab'
      setEmail('owner@newlab.test')
      setName('Workspace Owner')
      setOrganizationName(defaultOrganizationName)
      setWorkspaceSlug(toWorkspaceSlug(defaultOrganizationName))
      setPassword('')
      setConfirmPassword('')
    } else {
      setEmail('admin@labofscents.org')
      setName('Thuan Le Minh')
      setOrganizationName('NOXELIS Lab')
      setWorkspaceSlug('noxelis-live')
      setPassword('')
      setConfirmPassword('')
    }
  }

  function updateOrganizationName(value: string) {
    setOrganizationName(value)
    if (!workspaceSlugTouched) {
      setWorkspaceSlug(toWorkspaceSlug(value))
    }
  }

  function updateWorkspaceSlug(value: string) {
    setWorkspaceSlug(toWorkspaceSlug(value))
    setWorkspaceSlugTouched(true)
  }

  return (
    <div className="min-h-screen bg-lab-bg text-[var(--text)]">
      <LabBackdrop />
      <main className="auth-shell">
        <section className="auth-panel glass">
          <div className="auth-copy">
            <div className="brand-row">
              <div className="brand-mark">
                <Sparkles size={18} />
              </div>
              <div>
                <div className="wordmark">OlfactoryOps</div>
                <div className="mono-small">OlfactoryOps OS</div>
              </div>
            </div>
            <h1>
              {uiText(mode === 'login'
                ? 'Sign in to your lab workspace'
                : mode === 'signup'
                  ? 'Create your lab workspace'
                  : mode === 'reset-request'
                    ? 'Reset your password'
                    : 'Choose a new password')}
            </h1>
            <p className="lead">
              Secure access starts here. We confirm your account, role, and workspace settings before opening OlfactoryOps.
            </p>
            {mode === 'login' || mode === 'signup' ? (
              <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
                <button className={mode === 'login' ? 'is-active' : ''} type="button" onClick={() => switchMode('login')}>
                  {uiText('Login')}
                </button>
                <button className={mode === 'signup' ? 'is-active' : ''} type="button" onClick={() => switchMode('signup')}>
                  {uiText('Sign up')}
                </button>
              </div>
            ) : (
              <button className="ghost-button small" type="button" onClick={() => switchMode('login')}>
                {uiText('Back to login')}
              </button>
            )}
          </div>

          <div className="auth-form">
            {mode === 'signup' && (
              <>
                <label className="field-row">
                  <span>Organization</span>
                  <input
                    aria-label="Signup organization"
                    value={organizationName}
                    onChange={(event) => updateOrganizationName(event.target.value)}
                  />
                </label>
                <label className="field-row">
                  <span>Workspace slug</span>
                  <input
                    aria-label="Signup workspace slug"
                    value={workspaceSlug}
                    onChange={(event) => updateWorkspaceSlug(event.target.value)}
                  />
                </label>
                <label className="field-row">
                  <span>Workspace domain</span>
                  <input aria-label="Signup workspace domain" value={workspaceDomain} readOnly />
                  <small className="field-hint">Auto-created for this workspace; map a customer-owned domain in Cloudflare later.</small>
                </label>
                <label className="field-row">
                  <span>Owner name</span>
                  <input
                    aria-label="Signup owner name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              </>
            )}
            {mode !== 'reset-confirm' ? (
              <label className="field-row">
                <span>Email</span>
                <input
                  aria-label={mode === 'login' ? 'Login email' : mode === 'signup' ? 'Signup email' : 'Password reset email'}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            ) : null}
            {mode !== 'reset-request' ? (
              <label className="field-row">
              <span>{mode === 'reset-confirm' ? 'New password' : 'Password'}</span>
              <input
                aria-label={mode === 'login' ? 'Login password' : mode === 'signup' ? 'Signup password' : 'New password'}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                placeholder={mode === 'login' ? 'Required for admin and workspace accounts' : 'At least 12 chars, letters and numbers'}
                onChange={(event) => setPassword(event.target.value)}
              />
              {mode === 'login' ? <small className="field-hint">Admin and workspace accounts require a password.</small> : null}
              </label>
            ) : null}
            {(mode === 'signup' || mode === 'reset-confirm') && (
              <label className="field-row">
                <span>Confirm new password</span>
                <input
                  aria-label="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                {!signupPasswordReady ? <small className="field-hint is-danger">Use at least 12 characters with letters and numbers.</small> : null}
                {signupPasswordReady && password !== confirmPassword ? (
                  <small className="field-hint is-danger">Passwords must match.</small>
                ) : null}
              </label>
            )}
            <button
              className="primary-button full"
              type="button"
              onClick={() => void submitAuth()}
              disabled={
                busy ||
                (mode === 'reset-confirm'
                  ? !resetToken || !signupPasswordReady || password !== confirmPassword
                  : !email.trim() || (mode === 'signup' && !signupReady))
              }
            >
              {busy
                ? 'Working'
                : mode === 'login'
                  ? 'Login'
                  : mode === 'signup'
                    ? 'Create workspace'
                    : mode === 'reset-request'
                      ? uiText('Send reset link')
                      : uiText('Reset password')}
            </button>
            {mode === 'login' ? (
              <button className="ghost-button small" type="button" onClick={() => setMode('reset-request')}>
                {uiText('Forgot password?')}
              </button>
            ) : null}
            <div className="auth-status">
              <ShieldCheck size={16} />
              <span>{status}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

const Dashboard = memo(function Dashboard({
  stats,
  movements,
  session,
  onNavigate,
  onOpenModal,
}: {
  stats: { done: number; avgCoverage: number; risks: number }
  movements: InventoryMovement[]
  activeKey: DomainKey
  session: AuthSession
  onNavigate: (key: DomainKey) => void
  onOpenModal: (modal: ModalKind) => void
}) {
  const internalAdminView = isInternalAdminSession(session)
  const visibleDomains = visibleDomainsForSession(session)
  const visibleModuleCount = visibleDomains.length
  const primaryDomain = visibleDomains.find((domain) => domain.key === 'formulas') ?? visibleDomains[0]
  const primaryDomainDisplay = primaryDomain ? domainDisplayForSession(primaryDomain, session) : undefined
  const canExportAudit = internalAdminView && sessionHasPermission(session, 'audit.export')
  const canViewAudit = internalAdminView && sessionHasAnyPermission(session, ['audit.view', 'security.viewAuditLog', 'audit.export'])
  const canViewMovementLedger = domainVisibleForSession('inventory', session)
  const canViewEnterpriseReadiness = internalAdminView && domainVisibleForSession('saas', session)
  const canViewUserOverview =
    (internalAdminView || session.role === 'Owner') &&
    sessionHasAnyPermission(session, ['security.viewMembers', 'security.manageUsers'])
  const visibleWorkflowNodes = visibleWorkflowNodesForSession(session)

  return (
    <div className={`dashboard-grid${canViewUserOverview ? ' has-owner-user-overview' : ''}`}>
      <Panel
        className="hero-panel"
        title="OlfactoryOps Console"
        icon={Gauge}
        right={internalAdminView ? <StatusBadge status="active" /> : undefined}
      >
        <div className="hero-content">
          <div>
            <p className="lead">
              {internalAdminView
                ? 'Full SaaS operating layer across the operating domains, with the core R&D value stream live inside the broader enterprise product surface.'
                : 'Full OlfactoryOps operating layer across the operating domains, with the core R&D value stream live inside the broader business product surface.'}
            </p>
            <div className="hero-actions">
              {primaryDomain ? (
                <button className="primary-button" type="button" onClick={() => onNavigate(primaryDomain.key)}>
                  Open {primaryDomainDisplay?.shortName ?? primaryDomain.name}
                  <ChevronRight size={16} />
                </button>
              ) : null}
              {canExportAudit ? (
                <button className="ghost-button" type="button" onClick={() => onOpenModal('auditExport')}>
                  Audit export
                </button>
              ) : null}
            </div>
          </div>
          <div className="hero-metrics">
            {internalAdminView ? (
              <>
                <Metric label="Modules live" value={`${stats.done}/16`} />
                <Metric label="Avg coverage" value={`${stats.avgCoverage}%`} />
                <Metric label="Risk flags" value={String(stats.risks)} />
              </>
            ) : (
              <Metric label="Modules" value={String(visibleModuleCount)} />
            )}
          </div>
        </div>
      </Panel>

      {canViewUserOverview ? <OwnerUserOverview session={session} onNavigate={onNavigate} /> : null}

      {visibleWorkflowNodes.length > 0 ? (
        <Panel className="workflow-panel" title="Operating Value Stream" icon={Activity}>
          <WorkflowGraph nodes={visibleWorkflowNodes} onNavigate={onNavigate} />
        </Panel>
      ) : null}

      <Panel className="matrix-panel" title={internalAdminView ? 'Domain Health Matrix' : 'Workspace Modules'} icon={Database}>
        <DomainMatrix session={session} onNavigate={onNavigate} />
      </Panel>

      {canViewEnterpriseReadiness ? <EnterpriseReadiness session={session} onOpenModal={onOpenModal} /> : null}

      {canViewMovementLedger ? (
        <Panel className="ledger-panel" title="Movement Ledger" icon={Boxes}>
          <MovementTable movements={movements.slice(0, 6)} />
        </Panel>
      ) : null}

      {canViewAudit ? (
        <Panel className="audit-panel" title="Audit Trail" icon={KeyRound}>
          <AuditList events={auditEvents} />
        </Panel>
      ) : null}
    </div>
  )
})

function OwnerUserOverview({
  session,
  onNavigate,
}: {
  session: AuthSession
  onNavigate: (key: DomainKey) => void
}) {
  const [memberSummary, setMemberSummary] = useState<MemberSummaryResponse | null>(null)
  const [status, setStatus] = useState('Syncing workspace members')
  const canManageUsers = sessionHasPermission(session, 'security.manageUsers')

  useEffect(() => {
    const controller = new AbortController()

    void requestApi<MemberSummaryResponse>('/security/member-summary', {
      signal: controller.signal,
    })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setMemberSummary(payload)
          setStatus('Live workspace data')
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setStatus(error instanceof Error ? error.message : 'Member data is temporarily unavailable')
        }
      })

    return () => controller.abort()
  }, [session.id, session.organizationId])

  const roleCounts = memberSummary?.roleCounts ?? []

  return (
    <Panel
      className="owner-users-panel"
      title="User Overview"
      icon={UsersRound}
      right={<StatusBadge status={memberSummary ? 'active' : 'review'} label={canManageUsers ? 'Admin' : 'Owner'} />}
    >
      <div className="owner-user-summary">
        <div className="owner-user-metrics">
          <Metric label="Total users" value={String(memberSummary?.totalMembers ?? 0)} />
          <Metric label="Active" value={String(memberSummary?.activeMembers ?? 0)} />
          <Metric label="Pending invites" value={String(memberSummary?.invitedMembers ?? 0)} />
          <Metric label="Active sessions" value={String(memberSummary?.activeSessions ?? 0)} />
        </div>
        <div className="owner-user-roles">
          <span className="mono-small">Role distribution</span>
          {roleCounts.length > 0 ? (
            <div className="tag-row">
              {roleCounts.map(({ role, count }) => (
                <DataTag key={role} label={role} value={String(count)} tone="blue" />
              ))}
              {(memberSummary?.deactivatedMembers ?? 0) > 0 ? (
                <DataTag label="Deactivated" value={String(memberSummary?.deactivatedMembers)} tone="amber" />
              ) : null}
            </div>
          ) : (
            <span className="muted-copy">No member records available yet.</span>
          )}
        </div>
      </div>
      <div className="action-row owner-user-actions">
        <span className="mono-small">{status}</span>
        {canManageUsers ? (
          <button className="ghost-button small" type="button" onClick={() => onNavigate('identity')}>
            Manage users
          </button>
        ) : null}
      </div>
    </Panel>
  )
}

const DomainWorkspace = memo(function DomainWorkspace({
  domain,
  session,
  lots,
  movements,
  storageLocations,
  stock,
  materialRecords,
  onLotsChange,
  onMovementsChange,
  onStorageLocationsChange,
  setMaterialRecords,
  formulaRecords,
  setFormulaRecords,
  activeFormulaId,
  setActiveFormulaId,
  labUsageFormulaRecords,
  labUsageFormulaId,
  setLabUsageFormulaId,
  selectedLabUsageFormula,
  hasPublishedLabUsageFormula,
  resolvedLeaves,
  totals,
  curve,
  selectedMaterialId,
  setSelectedMaterialId,
  labPlan,
  batchGrams,
  setBatchGrams,
  usageHistory,
  weighingSession,
  actualWeights,
  onActualWeightChange,
  weighingTolerancePercent,
  setWeighingTolerancePercent,
  weighingOperator,
  setWeighingOperator,
  labUsagePurpose,
  setLabUsagePurpose,
  labUsageProjectCode,
  setLabUsageProjectCode,
  labUsageSampleCode,
  setLabUsageSampleCode,
  labUsageStatusMessage,
  labUsageBusy,
  weighingReady,
  onUseTargetWeights,
  onCommit,
  onReverse,
  onOpenModal,
  onNewFormula,
  onAddFormulaLine,
  onReceiveStock,
  onAdjustStock,
  onTransferStock,
  onRequestInventoryApproval,
  userSettings,
  onUserSettingsChange,
  onWorkspaceBrandingChange,
}: {
  domain: DomainModule
  session: AuthSession
  lots: InventoryLot[]
  movements: InventoryMovement[]
  storageLocations: StorageLocation[]
  stock: ReturnType<typeof stockSummary>
  materialRecords: Material[]
  onLotsChange: Dispatch<SetStateAction<InventoryLot[]>>
  onMovementsChange: Dispatch<SetStateAction<InventoryMovement[]>>
  onStorageLocationsChange: Dispatch<SetStateAction<StorageLocation[]>>
  setMaterialRecords: (materials: Material[]) => void
  formulaRecords: Formula[]
  setFormulaRecords: Dispatch<SetStateAction<Formula[]>>
  activeFormulaId: string
  setActiveFormulaId: (id: string) => void
  labUsageFormulaRecords: Formula[]
  labUsageFormulaId: string
  setLabUsageFormulaId: (id: string) => void
  selectedLabUsageFormula: Formula
  hasPublishedLabUsageFormula: boolean
  resolvedLeaves: ResolvedLeaf[]
  totals: ReturnType<typeof formulaTotals>
  curve: ReturnType<typeof evaporationCurve>
  selectedMaterialId: string
  setSelectedMaterialId: (id: string) => void
  labPlan: ReturnType<typeof planLabUsage>
  batchGrams: number
  setBatchGrams: (value: number) => void
  usageHistory: UsageRecord[]
  weighingSession: LabWeighingSession
  actualWeights: Record<string, number>
  onActualWeightChange: (key: string, value: number) => void
  weighingTolerancePercent: number
  setWeighingTolerancePercent: (value: number) => void
  weighingOperator: string
  setWeighingOperator: (value: string) => void
  labUsagePurpose: LabUsagePurpose
  setLabUsagePurpose: (value: LabUsagePurpose) => void
  labUsageProjectCode: string
  setLabUsageProjectCode: (value: string) => void
  labUsageSampleCode: string
  setLabUsageSampleCode: (value: string) => void
  labUsageStatusMessage: string
  labUsageBusy: boolean
  weighingReady: boolean
  onUseTargetWeights: () => void
  onCommit: () => void
  onReverse: () => void
  onOpenModal: (modal: ModalKind) => void
  onNewFormula: (type?: FormulaType) => void
  onAddFormulaLine: () => void
  onReceiveStock: () => void
  onAdjustStock: () => void
  onTransferStock: () => void
  onRequestInventoryApproval: (
    action: InventoryApprovalAction,
    payload: Record<string, unknown>,
    reason: string,
  ) => Promise<InventoryApprovalRequestResponse>
  userSettings: UserSettingsRecord
  onUserSettingsChange: (settings: UserSettingsRecord) => void
  onWorkspaceBrandingChange: (branding: BrandingConfig) => void
}) {
  const displayDomain = domainDisplayForSession(domain, session)

  return (
    <div className="domain-page">
      <DomainHeader domain={displayDomain} session={session} />

      {domain.key === 'materials' && (
        <MaterialWorkspace
          materialRecords={materialRecords}
          onMaterialsChange={setMaterialRecords}
          selectedMaterialId={selectedMaterialId}
          onSelectMaterial={setSelectedMaterialId}
          session={session}
          stock={stock}
        />
      )}
      {domain.key === 'formulas' && (
        <FormulaWorkspace
          session={session}
          formulaRecords={formulaRecords}
          materialRecords={materialRecords}
          lots={lots}
          stock={stock}
          activeFormulaId={activeFormulaId}
          onSelectFormula={setActiveFormulaId}
          onFormulaRecordsChange={setFormulaRecords}
          resolvedLeaves={resolvedLeaves}
          totals={totals}
          curve={curve}
          onSelectMaterial={setSelectedMaterialId}
          onNewFormula={onNewFormula}
          onAddLine={onAddFormulaLine}
          userSettings={userSettings}
          onUserSettingsChange={onUserSettingsChange}
        />
      )}
      {domain.key === 'inventory' && (
        <InventoryWorkspace
          session={session}
          lots={lots}
          movements={movements}
          storageLocations={storageLocations}
          stock={stock}
          materialRecords={materialRecords}
          onLotsChange={onLotsChange}
          onMovementsChange={onMovementsChange}
          onStorageLocationsChange={onStorageLocationsChange}
          onReceiveStock={onReceiveStock}
          onAdjustStock={onAdjustStock}
          onTransferStock={onTransferStock}
          onRequestInventoryApproval={onRequestInventoryApproval}
        />
      )}
      {domain.key === 'labUsage' && (
        <LabUsageWorkspace
          publishedFormulas={labUsageFormulaRecords}
          selectedFormulaId={labUsageFormulaId}
          setSelectedFormulaId={setLabUsageFormulaId}
          selectedFormula={selectedLabUsageFormula}
          hasPublishedFormula={hasPublishedLabUsageFormula}
          labPlan={labPlan}
          batchGrams={batchGrams}
          setBatchGrams={setBatchGrams}
          usageHistory={usageHistory}
          weighingSession={weighingSession}
          actualWeights={actualWeights}
          onActualWeightChange={onActualWeightChange}
          weighingTolerancePercent={weighingTolerancePercent}
          setWeighingTolerancePercent={setWeighingTolerancePercent}
          weighingOperator={weighingOperator}
          setWeighingOperator={setWeighingOperator}
          labUsagePurpose={labUsagePurpose}
          setLabUsagePurpose={setLabUsagePurpose}
          labUsageProjectCode={labUsageProjectCode}
          setLabUsageProjectCode={setLabUsageProjectCode}
          labUsageSampleCode={labUsageSampleCode}
          setLabUsageSampleCode={setLabUsageSampleCode}
          statusMessage={labUsageStatusMessage}
          busy={labUsageBusy}
          weighingReady={weighingReady}
          onUseTargetWeights={onUseTargetWeights}
          onCommit={onCommit}
          onReverse={onReverse}
        />
      )}
      {domain.key === 'documents' && <DocumentsWorkspace />}
      {domain.key === 'production' && (
        <ProductionWorkspace formulaRecords={formulaRecords} materialRecords={materialRecords} session={session} />
      )}
      {domain.key === 'procurement' && (
        <ProcurementWorkspace
          stock={stock}
          materialRecords={materialRecords}
          onLotsChange={onLotsChange}
          onMovementsChange={onMovementsChange}
        />
      )}
      {domain.key === 'commerce' && <CommerceWorkspace stock={stock} materialRecords={materialRecords} session={session} />}
      {domain.key === 'orders' && <OrdersWorkspace stock={stock} />}
      {domain.key === 'costing' && <CostingWorkspace />}
      {domain.key === 'analytics' && <AnalyticsWorkspace />}
      {domain.key === 'saas' && <SaasWorkspace session={session} />}
      {domain.key === 'identity' && <IdentityWorkspace />}
      {domain.key === 'customization' && <CustomizationWorkspace onBrandingSaved={onWorkspaceBrandingChange} />}
      {![
        'identity',
        'customization',
        'materials',
        'formulas',
        'inventory',
        'labUsage',
        'documents',
        'production',
        'procurement',
        'commerce',
        'orders',
        'costing',
        'analytics',
        'saas',
      ].includes(domain.key) && (
        <GenericDomainWorkspace domain={displayDomain} session={session} onOpenModal={onOpenModal} />
      )}
    </div>
  )
})

function DomainHeader({
  domain,
  session,
}: {
  domain: DomainModule
  session: AuthSession
}) {
  const Icon = domainIcons[domain.key]
  const internalAdminView = isInternalAdminSession(session)
  return (
    <Panel
      className="domain-header"
      title={domain.name}
      icon={Icon}
      right={internalAdminView ? <StatusBadge status={domain.status} /> : undefined}
    >
      <div className="domain-header-summary">
        <p>{domain.responsibility}</p>
      </div>
    </Panel>
  )
}

function MaterialWorkspace({
  materialRecords,
  onMaterialsChange,
  selectedMaterialId,
  onSelectMaterial,
  session,
  stock,
}: {
  materialRecords: Material[]
  onMaterialsChange: (materials: Material[]) => void
  selectedMaterialId: string
  onSelectMaterial: (id: string) => void
  session: AuthSession
  stock: ReturnType<typeof stockSummary>
}) {
  const selected = materialRecords.find((material) => material.id === selectedMaterialId) ?? materialRecords[0] ?? materials[0]!
  const stockByMaterialId = useMemo(() => buildStockByMaterialId(stock), [stock])
  const selectedStock = stockByMaterialId.get(selected.id)
  const [materialStatus, setMaterialStatus] = useState('Loading material intelligence')
  const [materialSaving, setMaterialSaving] = useState(false)
  const [pubChemSaving, setPubChemSaving] = useState(false)
  const canCreateMaterials = sessionHasPermission(session, 'materials.create')
  const canUpdateMaterials = sessionHasPermission(session, 'materials.update')
  const [createName, setCreateName] = useState('Vetiveryl Acetate')
  const [createCas, setCreateCas] = useState('68917-34-0')
  const [createFamily, setCreateFamily] = useState('Woody vetiver')
  const [createTier, setCreateTier] = useState<Material['tier']>('Base')
  const [editDraft, setEditDraft] = useState({
    family: selected.family,
    tier: selected.tier,
    density: selected.density,
    vaporPressure: selected.vaporPressure,
    costPerGram: selected.costPerGram,
    ifraLimit: selected.ifraLimit,
    odor: selected.odor.join(', '),
  })
  const [moleculeRows, setMoleculeRows] = useState<MoleculeComponent[]>(() =>
    moleculeComponents.filter((molecule) => molecule.materialId === selected.id),
  )
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importRows, setImportRows] = useState<Array<Record<string, unknown>>>([])
  const [importMapping, setImportMapping] = useState<Record<string, string>>({})
  const [importEntity, setImportEntity] = useState<'materials' | 'lots'>('materials')
  const [importJob, setImportJob] = useState<DataImportJobRecord | null>(null)
  const [importStatus, setImportStatus] = useState('Choose a CSV or XLSX file to start a dry-run.')
  const [importBusy, setImportBusy] = useState(false)
  const canReceiveInventory = sessionHasPermission(session, 'inventory.receive')
  const canRunImport = importEntity === 'materials' ? canCreateMaterials : canReceiveInventory
  const activeImportFields = importEntity === 'materials' ? materialImportFields : lotImportFields

  const mappedImportRows = useMemo(
    () => importRows.map((row) => Object.fromEntries(
      Object.entries(importMapping)
        .filter(([, source]) => source)
        .map(([field, source]) => [field, row[source]]),
    )),
    [importMapping, importRows],
  )

  useEffect(() => {
    async function loadMaterials() {
      try {
        const payload = await requestApi<Material[]>('/materials')
        onMaterialsChange(payload)
        if (!payload.some((material) => material.id === selectedMaterialId) && payload[0]) {
          onSelectMaterial(payload[0].id)
        }
        setMaterialStatus('Material catalog synced from API')
      } catch {
        setMaterialStatus('Using local material seed until API is reachable')
      }
    }
    void loadMaterials()
  }, [onMaterialsChange, onSelectMaterial, selectedMaterialId])

  useEffect(() => {
    let active = true
    setEditDraft({
      family: selected.family,
      tier: selected.tier,
      density: selected.density,
      vaporPressure: selected.vaporPressure,
      costPerGram: selected.costPerGram,
      ifraLimit: selected.ifraLimit,
      odor: selected.odor.join(', '),
    })
    setMoleculeRows(moleculeComponents.filter((molecule) => molecule.materialId === selected.id))

    async function loadIntelligence() {
      try {
        const moleculePayload = await requestApi<MaterialMoleculesResponse>(
          `/materials/${encodeURIComponent(selected.id)}/molecules`,
        )
        if (!active) {
          return
        }
        setMoleculeRows(moleculePayload.molecules)
      } catch {
        if (active) {
          setMaterialStatus('Using local molecule seed until API is reachable')
        }
      }
    }

    void loadIntelligence()
    return () => {
      active = false
    }
  }, [selected])

  function upsertMaterial(nextMaterial: Material) {
    const exists = materialRecords.some((material) => material.id === nextMaterial.id)
    onMaterialsChange(
      exists
        ? materialRecords.map((material) => (material.id === nextMaterial.id ? nextMaterial : material))
        : [nextMaterial, ...materialRecords],
    )
    onSelectMaterial(nextMaterial.id)
  }

  async function checkCasDuplicate() {
    try {
      const payload = await requestApi<MaterialDedupeResponse>(`/materials/dedupe?cas=${encodeURIComponent(createCas)}`)
      setMaterialStatus(
        payload.duplicate
          ? `${payload.matches.length} duplicate candidate found for ${payload.cas}`
          : `No CAS duplicate found for ${payload.cas}`,
      )
    } catch {
      setMaterialStatus('CAS duplicate check unavailable')
    }
  }

  async function createMaterialRecord() {
    if (!canCreateMaterials) {
      setMaterialStatus('Current role is not authorized to create materials.')
      return
    }
    try {
      const payload = await requestApi<MaterialMutationResponse>('/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          cas: createCas,
          family: createFamily,
          tier: createTier,
          density: 1,
          vaporPressure: 0.01,
          mw: 100,
          logP: 1,
          substantivityHours: 24,
          ifraLimit: 100,
          costPerGram: 0.05,
          odor: createFamily.split(' ').filter(Boolean),
          source: 'Material intelligence console',
          version: 'v1',
        }),
      })
      upsertMaterial(payload.material)
      setCreateName('')
      setMaterialStatus(`${payload.material.name} created without stock movement`)
    } catch (error) {
      setMaterialStatus(
        error instanceof Error ? error.message : 'Material create blocked; check required fields or duplicate CAS',
      )
    }
  }

  function selectImportEntity(entity: 'materials' | 'lots') {
    if (entity === importEntity) return
    setImportEntity(entity)
    setImportHeaders([])
    setImportRows([])
    setImportMapping({})
    setImportJob(null)
    setImportStatus(`Choose a CSV or XLSX file to dry-run ${entity === 'materials' ? 'materials' : 'inventory lots'}.`)
  }

  async function loadDataImport(file: File | null) {
    if (!file) {
      return
    }
    setImportBusy(true)
    setImportStatus(`Reading ${file.name}...`)
    try {
      const cells = file.name.toLowerCase().endsWith('.csv')
        ? parseCsvCells(await file.text())
        : await (await import('read-excel-file/browser')).readSheet(file)
      const [headerRow, ...dataRows] = cells
      const headers = (headerRow ?? []).map((value) => importCellText(value)).filter(Boolean)
      if (headers.length === 0) {
        throw new Error('The selected sheet has no header row or data rows')
      }
      const rows = dataRows
        .filter((row) => row.some((value) => importCellText(value)))
        .slice(0, 500)
        .map((row) => Object.fromEntries(headers.map((header, index) => [header, importCellText(row[index])])) as Record<string, unknown>)
      const defaultMapping = importEntity === 'materials' ? buildMaterialImportMapping(headers) : buildLotImportMapping(headers)
      setImportHeaders(headers)
      setImportRows(rows)
      setImportMapping(defaultMapping)
      setImportJob(null)
      setImportStatus(`${rows.length} ${importEntity === 'materials' ? 'material' : 'lot'} row(s) loaded. Confirm column mapping, then run dry-run.`)
    } catch (error) {
      setImportHeaders([])
      setImportRows([])
      setImportMapping({})
      setImportStatus(error instanceof Error ? error.message : 'Could not parse the import file')
    } finally {
      setImportBusy(false)
    }
  }

  async function previewDataImport() {
    if (!canRunImport || mappedImportRows.length === 0) {
      return
    }
    setImportBusy(true)
    try {
      const payload = await requestApi<{ job: DataImportJobRecord; idempotent: boolean }>('/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: importEntity,
          fileName: `${importEntity}-import`,
          idempotencyKey: await digestImportRows([{ entity: importEntity }, ...mappedImportRows]),
          rows: mappedImportRows,
        }),
      })
      setImportJob(payload.job)
      setImportStatus(
        payload.job.invalidRows > 0
          ? `Dry-run found ${payload.job.errors.length} issue(s) across ${payload.job.invalidRows} row(s).`
          : `Dry-run passed for ${payload.job.validRows} ${importEntity === 'materials' ? 'material' : 'lot'} row(s).`,
      )
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : 'Import dry-run failed')
    } finally {
      setImportBusy(false)
    }
  }

  async function commitDataImport() {
    if (!importJob || importJob.status !== 'VALIDATED') {
      return
    }
    setImportBusy(true)
    try {
      const payload = await requestApi<{ job: DataImportJobRecord; created: number }>(`/imports/${encodeURIComponent(importJob.id)}/commit`, {
        method: 'POST',
      })
      const refreshed = await requestApi<Material[]>('/materials')
      onMaterialsChange(refreshed)
      setImportJob(payload.job)
      setImportStatus(`Imported ${payload.created} ${importEntity === 'materials' ? 'material' : 'inventory lot'} record(s).`)
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : 'Import commit failed')
    } finally {
      setImportBusy(false)
    }
  }

  async function saveMaterialUpdate() {
    if (!canUpdateMaterials) {
      setMaterialStatus('Current role is not authorized to edit materials.')
      return
    }
    const materialId = selected.id?.trim()
    if (!materialId) {
      setMaterialStatus('No material is currently selected.')
      return
    }
    const parsedDensity = Number(editDraft.density)
    const parsedVaporPressure = Number(editDraft.vaporPressure)
    const parsedCostPerGram = Number(editDraft.costPerGram)
    const parsedIfraLimit = Number(editDraft.ifraLimit)
    if (
      !Number.isFinite(parsedDensity) ||
      !Number.isFinite(parsedVaporPressure) ||
      !Number.isFinite(parsedCostPerGram) ||
      !Number.isFinite(parsedIfraLimit)
    ) {
      setMaterialStatus('Invalid material values. Please review density, vapor pressure, cost, and IFRA limit.')
      return
    }
    const normalizedDraft = {
      family: editDraft.family.trim(),
      tier: editDraft.tier,
      density: parsedDensity,
      vaporPressure: parsedVaporPressure,
      costPerGram: parsedCostPerGram,
      ifraLimit: parsedIfraLimit,
      odor: editDraft.odor
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    }
    if (
      normalizedDraft.family === selected.family &&
      normalizedDraft.tier === selected.tier &&
      normalizedDraft.density === selected.density &&
      normalizedDraft.vaporPressure === selected.vaporPressure &&
      normalizedDraft.costPerGram === selected.costPerGram &&
      normalizedDraft.ifraLimit === selected.ifraLimit &&
      JSON.stringify(normalizedDraft.odor) === JSON.stringify(selected.odor)
    ) {
      setMaterialStatus('No material metadata changes to save.')
      return
    }
    setMaterialSaving(true)
    setMaterialStatus(`Saving metadata for ${selected.name}...`)
    try {
      const payload = await requestApi<MaterialMutationResponse>(`/materials/${encodeURIComponent(materialId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family: normalizedDraft.family,
          tier: normalizedDraft.tier,
          density: normalizedDraft.density,
          vaporPressure: normalizedDraft.vaporPressure,
          costPerGram: normalizedDraft.costPerGram,
          ifraLimit: normalizedDraft.ifraLimit,
          odor: normalizedDraft.odor,
          source: 'Material inspector update',
          version: 'manual-ui',
        }),
      })
      upsertMaterial(payload.material)
      setMaterialStatus(`${payload.material.name} metadata saved with provenance`)
    } catch (error) {
      setMaterialStatus(error instanceof Error ? error.message : 'Material update blocked by validation or permission')
    } finally {
      setMaterialSaving(false)
    }
  }

  async function fillFromPubChem() {
    if (!canUpdateMaterials) {
      setMaterialStatus('Current role is not authorized to enrich data from PubChem.')
      return
    }
    setPubChemSaving(true)
    try {
      const payload = await requestApi<PubChemFillResponse>(`/materials/${encodeURIComponent(selected.id)}/pubchem-fill`, {
        method: 'POST',
      })
      upsertMaterial(payload.material)
      setMoleculeRows(payload.molecules)
      setMaterialStatus(`${payload.material.name} enriched from curated PubChem profile`)
    } catch (error) {
      setMaterialStatus(error instanceof Error ? error.message : 'PubChem fill unavailable for this material')
    } finally {
      setPubChemSaving(false)
    }
  }

  return (
    <div className="workspace-grid material-intelligence-grid">
      <Panel title="Material Library" icon={Atom}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Name</span>
            <input aria-label="New material name" value={createName} onChange={(event) => setCreateName(event.target.value)} />
          </label>
          <label className="field-row">
            <span>CAS</span>
            <input aria-label="New material CAS" value={createCas} onChange={(event) => setCreateCas(event.target.value)} />
          </label>
          <label className="field-row">
            <span>Family</span>
            <input
              aria-label="New material family"
              value={createFamily}
              onChange={(event) => setCreateFamily(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Tier</span>
            <select
              aria-label="New material tier"
              value={createTier}
              onChange={(event) => setCreateTier(event.target.value as Material['tier'])}
            >
              <option value="Top">Top</option>
              <option value="Heart">Heart</option>
              <option value="Base">Base</option>
            </select>
          </label>
          <button className="ghost-button" type="button" onClick={() => void checkCasDuplicate()} disabled={!canCreateMaterials}>
            Check CAS
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void createMaterialRecord()}
            disabled={!canCreateMaterials || !createName.trim() || !createCas.trim()}
          >
            <Plus size={16} />
            Create material
          </button>
        </div>
        <section className="import-panel" aria-label="Data import">
          <div className="section-heading compact-heading">
            <div>
              <span className="eyebrow">Data import</span>
              <strong>CSV / XLSX import</strong>
            </div>
            <DataTag label="Rows" value={String(importRows.length)} tone="blue" />
          </div>
          <div className="segmented-control" aria-label="Import data type">
            <button className={importEntity === 'materials' ? 'is-active' : ''} type="button" onClick={() => selectImportEntity('materials')}>
              Materials
            </button>
            <button className={importEntity === 'lots' ? 'is-active' : ''} type="button" onClick={() => selectImportEntity('lots')}>
              Inventory lots
            </button>
          </div>
          <label className="field-row wide-field">
            <span>Source file</span>
            <input
              accept=".csv,.xlsx,.xls"
              aria-label="Import source file"
              type="file"
              disabled={!canRunImport || importBusy}
              onChange={(event) => void loadDataImport(event.target.files?.[0] ?? null)}
            />
          </label>
          {importHeaders.length > 0 ? (
            <div className="import-mapping-grid">
              {activeImportFields.map((field) => (
                <label className="field-row" key={field.key}>
                  <span>{field.label}</span>
                  <select
                    aria-label={`Map ${field.label}`}
                    value={importMapping[field.key] ?? ''}
                    onChange={(event) => setImportMapping((current) => ({ ...current, [field.key]: event.target.value }))}
                  >
                    <option value="">Do not import</option>
                    {importHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
          <div className="action-row">
            <button className="ghost-button small" type="button" disabled={!canRunImport || importBusy || mappedImportRows.length === 0} onClick={() => void previewDataImport()}>
              {importBusy ? 'Working...' : 'Dry-run import'}
            </button>
            <button className="primary-button small" type="button" disabled={importBusy || importJob?.status !== 'VALIDATED'} onClick={() => void commitDataImport()}>
              Commit valid rows
            </button>
          </div>
          <p className="muted-copy">{importStatus}</p>
          {importEntity === 'lots' ? <p className="muted-copy">Map one material identifier: Material ID, CAS, or material name. Expiry must be YYYY-MM-DD; QC status defaults to QUARANTINE.</p> : null}
          {importJob?.errors.length ? (
            <div className="import-errors" role="status">
              {importJob.errors.slice(0, 6).map((issue, index) => (
                <span key={`${issue.row}-${issue.field ?? 'row'}-${index}`}>Row {issue.row}{issue.field ? ` / ${issue.field}` : ''}: {issue.message}</span>
              ))}
            </div>
          ) : null}
        </section>
        <ul className="policy-list">
          <li>{materialStatus}</li>
          <li>Material master changes do not create stock. Lots and movements stay in Inventory.</li>
        </ul>
        <div className="material-list">
          {materialRecords.map((material) => {
            const summary = stockByMaterialId.get(material.id)
            return (
              <button
                key={material.id}
                className={`material-row ${selected.id === material.id ? 'is-active' : ''}`}
                type="button"
                onClick={() => onSelectMaterial(material.id)}
              >
                <div>
                  <strong>{material.name}</strong>
                  <span>{material.family}</span>
                </div>
                <DataTag label={material.tier} value={material.cas} tone="blue" />
                <div className="mono-value">{summary ? formatGrams(summary.available) : '0g'}</div>
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel title="Material Inspector" icon={PackageSearch} right={<DataTag label="CAS" value={selected.cas} />}>
        <div className="tag-row">
          <DataTag label="Available" value={selectedStock ? formatGrams(selectedStock.available) : '0g'} tone="green" />
          <DataTag label="Provenance" value={String(selected.provenance.length)} tone="blue" />
          <DataTag label="Molecules" value={String(moleculeRows.length)} />
        </div>
        <div className="inspector-grid">
          <Metric label="Vapor pressure" value={`${selected.vaporPressure}`} />
          <Metric label="Density" value={`${selected.density} g/ml`} />
          <Metric label="MW" value={String(selected.mw)} />
          <Metric label="LogP" value={String(selected.logP)} />
          <Metric label="IFRA ref" value={`${selected.ifraLimit}%`} />
          <Metric label="Available" value={selectedStock ? formatGrams(selectedStock.available) : '0g'} />
        </div>
        <div className="odor-row">
          {selected.odor.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Family</span>
            <input
              aria-label="Material family"
              value={editDraft.family}
              onChange={(event) => setEditDraft((current) => ({ ...current, family: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Tier</span>
            <select
              aria-label="Material tier"
              value={editDraft.tier}
              onChange={(event) => setEditDraft((current) => ({ ...current, tier: event.target.value as Material['tier'] }))}
            >
              <option value="Top">Top</option>
              <option value="Heart">Heart</option>
              <option value="Base">Base</option>
            </select>
          </label>
          <label className="field-row">
            <span>Density</span>
            <input
              aria-label="Material density"
              step={0.001}
              type="number"
              value={editDraft.density}
              onChange={(event) => setEditDraft((current) => ({ ...current, density: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>Vapor pressure</span>
            <input
              aria-label="Material vapor pressure"
              step={0.0001}
              type="number"
              value={editDraft.vaporPressure}
              onChange={(event) => setEditDraft((current) => ({ ...current, vaporPressure: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>Cost / gram</span>
            <input
              aria-label="Material cost per gram"
              step={0.001}
              type="number"
              value={editDraft.costPerGram}
              onChange={(event) => setEditDraft((current) => ({ ...current, costPerGram: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>IFRA limit %</span>
            <input
              aria-label="Material IFRA limit"
              step={0.1}
              type="number"
              value={editDraft.ifraLimit}
              onChange={(event) => setEditDraft((current) => ({ ...current, ifraLimit: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row wide-field">
            <span>Odor tags</span>
            <input
              aria-label="Material odor tags"
              value={editDraft.odor}
              onChange={(event) => setEditDraft((current) => ({ ...current, odor: event.target.value }))}
            />
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => void saveMaterialUpdate()}
            disabled={!canUpdateMaterials || materialSaving}
            aria-label="Save material metadata"
          >
            {materialSaving ? 'Saving...' : 'Save metadata'}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => void fillFromPubChem()}
            disabled={!canUpdateMaterials || pubChemSaving}
          >
            {pubChemSaving ? 'Filling...' : 'PubChem fill'}
          </button>
        </div>
      </Panel>

      {showMoleculeSplitPanel ? (
        <Panel title="Molecule Split" icon={Layers3}>
          <div className="tag-row">
            <DataTag label="Components" value={String(moleculeRows.length)} />
            <DataTag label="Total" value={`${moleculeRows.reduce((sum, molecule) => sum + molecule.percent, 0).toFixed(1)}%`} tone="blue" />
          </div>
          <div className="provenance-list">
            {moleculeRows.length > 0 ? (
              moleculeRows.map((molecule) => (
                <div className="provenance-item" key={molecule.id}>
                  <div>
                    <strong>{molecule.name}</strong>
                    <span>{molecule.cas} / {molecule.source}</span>
                  </div>
                  <DataTag label="Pct" value={`${molecule.percent}%`} tone="green" />
                  <StatusBadge status={molecule.status === 'VERIFIED' ? 'stable' : 'review'} label={molecule.status} />
                </div>
              ))
            ) : (
              <div className="empty-state">
                <strong>No molecule split yet.</strong>
                <span>Run PubChem fill or approve SDS section 3 extraction to seed components.</span>
              </div>
            )}
          </div>
        </Panel>
      ) : null}

    </div>
  )
}

type FormulaWorkspaceProps = {
  session: AuthSession
  formulaRecords: Formula[]
  materialRecords: Material[]
  lots: InventoryLot[]
  stock: ReturnType<typeof stockSummary>
  activeFormulaId: string
  onSelectFormula: (id: string) => void
  onFormulaRecordsChange: Dispatch<SetStateAction<Formula[]>>
  resolvedLeaves: ResolvedLeaf[]
  totals: ReturnType<typeof formulaTotals>
  curve: ReturnType<typeof evaporationCurve>
  onSelectMaterial: (id: string) => void
  onNewFormula: (type?: FormulaType) => void
  onAddLine: () => void
  userSettings: UserSettingsRecord
  onUserSettingsChange: (settings: UserSettingsRecord) => void
}

type FormulaLabTab = 'sketch' | 'material' | 'details'
type FormulaPickerMode = 'materials' | 'formulas'
type FormulaPickerSource = 'library' | 'inventory'

type FormulaInventoryOption = {
  material: Material
  lot: InventoryLot
  availableGrams: number
}

type FormulaIfraRow = {
  material: Material
  activePercent: number
  finalProductPercent: number
  ifraLimit: number
  usageOfLimit: number
  marginPercent: number
  sourcePath: string
  status: 'pass' | 'fail'
}

type FormulaLineDraft = {
  grams: number
  concentration: number
  activeGrams: number
  pyramidNote: FormulaPyramidNote
  odorType: string
  accord: string
  tags: string
  notes: string
}

type FormulaMetadataDraft = {
  name: string
  targetGrams: number
  concentrationType: Formula['concentrationType']
  finalProductConcentrationPercent: number
  targetMarkets: string
  brief: string
  inspiration: string
  pyramidSummary: string
  tags: string
  project: string
  collection: string
  density: number
  bottleVolumeMl: number
  bottleCount: number
  ifraCategory: string
  assignedReviewer: string
}

type FormulaWorkflowDialog = 'review' | 'approve' | 'reject' | null

const formulaPyramidNotes: FormulaPyramidNote[] = ['Top', 'Middle', 'Base', 'Solvent']

const formulaNoteMeta: Record<FormulaPyramidNote, { label: string; className: string }> = {
  Top: { label: 'Top', className: 'note-top' },
  Middle: { label: 'Middle', className: 'note-middle' },
  Base: { label: 'Base', className: 'note-base' },
  Solvent: { label: 'Solvent', className: 'note-solvent' },
}

function clampPositiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function inferFormulaPyramidNote(line?: FormulaLine, material?: Material): FormulaPyramidNote {
  if (line?.pyramidNote) {
    return line.pyramidNote
  }
  const family = material?.family.toLowerCase() ?? ''
  const name = material?.name.toLowerCase() ?? ''
  if (family.includes('carrier') || family.includes('solvent') || name.includes('ethanol')) {
    return 'Solvent'
  }
  if (material?.tier === 'Heart') {
    return 'Middle'
  }
  return material?.tier ?? 'Middle'
}

function inferFormulaOdorType(line?: FormulaLine, material?: Material) {
  if (line?.odorType) {
    return line.odorType
  }
  if (!material) {
    return line?.childFormulaId ? 'Accord' : 'Unclassified'
  }
  return material.family.split(/\s+/)[0] || material.family || 'Unclassified'
}

function inferFormulaAccord(line?: FormulaLine, material?: Material) {
  if (line?.accord) {
    return line.accord
  }
  return material?.odor[0] ?? material?.family.toLowerCase() ?? ''
}

function parseFormulaTags(value: string) {
  return value
    .split(/[,#]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function buildFormulaLineDraft(line: FormulaLine, material?: Material): FormulaLineDraft {
  const grams = clampPositiveNumber(Number(line.grams), 0.01)
  const concentration = Math.min(100, Math.max(0.01, Number(line.concentration ?? line.dilution ?? 100)))
  const tags = line.tags?.length ? line.tags : material?.odor.slice(0, 2) ?? []
  return {
    grams,
    concentration,
    activeGrams: Number(((grams * concentration) / 100).toFixed(4)),
    pyramidNote: inferFormulaPyramidNote(line, material),
    odorType: inferFormulaOdorType(line, material),
    accord: inferFormulaAccord(line, material),
    tags: tags.join(', '),
    notes: line.notes ?? '',
  }
}

function formatFormulaPercent(grams: number, targetGrams: number) {
  if (!Number.isFinite(targetGrams) || targetGrams <= 0) {
    return '0.00%'
  }
  return `${((grams / targetGrams) * 100).toFixed(2)}%`
}

function availableLotGrams(lot: InventoryLot) {
  return Math.max(0, lot.quantityGrams - lot.reservedGrams)
}

function formulaFinalPercent(totalLineGrams: number, targetGrams: number) {
  if (!Number.isFinite(targetGrams) || targetGrams <= 0) {
    return 0
  }
  return (totalLineGrams / targetGrams) * 100
}

function formulaIsFinalized(finalPercent: number) {
  return Math.abs(finalPercent - 100) <= 0.05
}

function formulaLineConcentrationFraction(line: FormulaLine) {
  const concentration = Number(line.concentration ?? line.dilution ?? 100)
  if (!Number.isFinite(concentration)) {
    return 1
  }
  return Math.min(100, Math.max(0, concentration)) / 100
}

function buildFormulaIfraRows(
  formula: Formula,
  formulaById: Map<string, Formula>,
  materialById: Map<string, Material>,
) {
  const rows = new Map<string, FormulaIfraRow>()
  const rootTargetGrams = formula.targetGrams
  const finalConcentrationFraction = Math.min(100, Math.max(0, formula.finalProductConcentrationPercent)) / 100

  function upsertMaterial(material: Material, activeGrams: number, sourcePath: string) {
    const activePercent = rootTargetGrams > 0 ? (activeGrams / rootTargetGrams) * 100 : 0
    const finalProductPercent = activePercent * finalConcentrationFraction
    const existing = rows.get(material.id)
    if (existing) {
      const nextActivePercent = existing.activePercent + activePercent
      const nextFinalProductPercent = existing.finalProductPercent + finalProductPercent
      const marginPercent = material.ifraLimit - nextFinalProductPercent
      rows.set(material.id, {
        ...existing,
        activePercent: nextActivePercent,
        finalProductPercent: nextFinalProductPercent,
        usageOfLimit: material.ifraLimit > 0 ? (nextFinalProductPercent / material.ifraLimit) * 100 : 0,
        marginPercent,
        sourcePath: `${existing.sourcePath}; ${sourcePath}`,
        status: marginPercent >= -0.0001 ? 'pass' : 'fail',
      })
      return
    }

    const marginPercent = material.ifraLimit - finalProductPercent
    rows.set(material.id, {
      material,
      activePercent,
      ifraLimit: material.ifraLimit,
      finalProductPercent,
      usageOfLimit: material.ifraLimit > 0 ? (finalProductPercent / material.ifraLimit) * 100 : 0,
      marginPercent,
      sourcePath,
      status: marginPercent >= -0.0001 ? 'pass' : 'fail',
    })
  }

  function walk(currentFormula: Formula, scale: number, path: string[], trail: Set<string>) {
    if (trail.has(currentFormula.id)) {
      return
    }
    const nextTrail = new Set(trail).add(currentFormula.id)

    currentFormula.lines.forEach((line) => {
      const lineGrams = line.grams * scale
      const activeLineGrams = lineGrams * formulaLineConcentrationFraction(line)
      const linePath = [...path, line.label]
      if (line.materialId) {
        const material = materialById.get(line.materialId)
        if (material) {
          upsertMaterial(material, activeLineGrams, linePath.join(' / '))
        }
        return
      }

      if (line.childFormulaId) {
        const childFormula = formulaById.get(line.childFormulaId)
        if (childFormula && childFormula.targetGrams > 0) {
          walk(childFormula, activeLineGrams / childFormula.targetGrams, linePath, nextTrail)
        }
      }
    })
  }

  walk(formula, 1, [formula.code], new Set<string>())

  return Array.from(rows.values()).sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'fail' ? -1 : 1
    }
    return b.usageOfLimit - a.usageOfLimit
  })
}

function formulaMetadataDraftFromRecord(formula: Formula): FormulaMetadataDraft {
  return {
    name: formula.name,
    targetGrams: formula.targetGrams,
    concentrationType: formula.concentrationType,
    finalProductConcentrationPercent: formula.finalProductConcentrationPercent,
    targetMarkets: formula.targetMarkets.join(', '),
    brief: formula.brief,
    inspiration: formula.inspiration,
    pyramidSummary: formula.pyramidSummary,
    tags: formula.tags.join(', '),
    project: formula.project,
    collection: formula.collection,
    density: formula.density,
    bottleVolumeMl: formula.bottleVolumeMl,
    bottleCount: formula.bottleCount,
    ifraCategory: formula.ifraCategory,
    assignedReviewer: formula.assignedReviewer ?? '',
  }
}


const FormulaLabspaceWorkspace = memo(function FormulaLabspaceWorkspace({
  session,
  formulaRecords,
  materialRecords,
  lots,
  stock,
  activeFormulaId,
  onSelectFormula,
  onFormulaRecordsChange,
  resolvedLeaves,
  totals,
  curve,
  onSelectMaterial,
  onNewFormula,
  onAddLine,
  userSettings,
  onUserSettingsChange,
}: FormulaWorkspaceProps) {
  const formula = formulaRecords.find((item) => item.id === activeFormulaId) ?? formulaRecords[0]!
  const canEditFormula = sessionHasPermission(session, 'formulas.edit')
  const canApproveFormula =
    isFormulaApproverRole(session.role) && sessionHasPermission(session, 'formulas.approve')
  const canExportFormula = sessionHasPermission(session, 'formulas.export')
  const formulaEditable = formula.workflowStatus === 'DRAFT' || formula.workflowStatus === 'CHANGES_REQUESTED'
  const activeFormulaType = formulaTypeForFormula(formula)
  const activeFormulaTypeMeta = formulaTypeMeta[activeFormulaType]
  const productConcentrationLabel = `${formula.finalProductConcentrationPercent.toFixed(1)}% concentrate`
  const selectableChildFormulas = useMemo(
    () => formulaRecords.filter((item) => item.id !== formula.id),
    [formula.id, formulaRecords],
  )
  const [formulaStatus, setFormulaStatus] = useState('Formula Labspace ready')
  const [versions, setVersions] = useState<FormulaVersionRecord[]>([])
  const [versionNote, setVersionNote] = useState(`Snapshot ${formula.code} ${formula.version}`)
  const [activeLabTab, setActiveLabTab] = useState<FormulaLabTab>('details')
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<FormulaPickerMode>('materials')
  const [pickerSource, setPickerSource] = useState<FormulaPickerSource>('inventory')
  const [materialQuery, setMaterialQuery] = useState('')
  const [pickerGrams, setPickerGrams] = useState(1)
  const [nestedGrams, setNestedGrams] = useState(10)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<FormulaLineDraft | null>(null)
  const [focusedMaterialId, setFocusedMaterialId] = useState<string | null>(null)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [metadataDraft, setMetadataDraft] = useState<FormulaMetadataDraft>(() => formulaMetadataDraftFromRecord(formula))
  const [metadataDirty, setMetadataDirty] = useState(false)
  const [undoStack, setUndoStack] = useState<Formula[]>([])
  const [redoStack, setRedoStack] = useState<Formula[]>([])
  const [workflowDialog, setWorkflowDialog] = useState<FormulaWorkflowDialog>(null)
  const [workflowComment, setWorkflowComment] = useState('')
  const [workflowReviewer, setWorkflowReviewer] = useState(formula.assignedReviewer ?? session.email)
  const [scaleOpen, setScaleOpen] = useState(false)
  const [scaleTargetGrams, setScaleTargetGrams] = useState(formula.targetGrams)
  const [scaleIncrementGrams, setScaleIncrementGrams] = useState(0.01)
  const [scalePlan, setScalePlan] = useState<FormulaScalePlan | null>(null)
  const [scaleApplying, setScaleApplying] = useState(false)
  const [versionDiff, setVersionDiff] = useState<FormulaVersionDiff | null>(null)
  const [diffFromVersion, setDiffFromVersion] = useState('')
  const [diffToVersion, setDiffToVersion] = useState('')
  const [evaluationDay, setEvaluationDay] = useState<1 | 7 | 30>(7)
  const [evaluationObservation, setEvaluationObservation] = useState('')
  const [evaluationStability, setEvaluationStability] = useState<FormulaEvaluationRecord['stability']>('PASS')
  const [evaluationRating, setEvaluationRating] = useState(4)
  const [metadataSaving, setMetadataSaving] = useState(false)
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false)
  const [workspaceSettingsDraft, setWorkspaceSettingsDraft] = useState<FormulaWorkspacePreferences>(() =>
    normalizeFormulaWorkspacePreferences(userSettings.formulaWorkspace, createDefaultFormulaWorkspacePreferences()),
  )
  const [workspaceSettingsSaving, setWorkspaceSettingsSaving] = useState(false)
  const [workspaceSettingsStatus, setWorkspaceSettingsStatus] = useState('These views are saved for your account.')
  const metadataSaveInFlightRef = useRef(false)
  const metadataChangeCounterRef = useRef(0)
  const formulaDetailDockRef = useRef<HTMLElement | null>(null)
  const formulaWorkspaceViews = useMemo(
    () => normalizeFormulaWorkspacePreferences(userSettings.formulaWorkspace, createDefaultFormulaWorkspacePreferences()),
    [userSettings.formulaWorkspace],
  )
  const materialById = useMemo(
    () => new Map(materialRecords.map((material) => [material.id, material])),
    [materialRecords],
  )
  const lotById = useMemo(
    () => new Map(lots.map((lot) => [lot.id, lot])),
    [lots],
  )
  const stockByMaterialId = useMemo(
    () => new Map(stock.map((item) => [item.material.id, item])),
    [stock],
  )
  const formulaById = useMemo(
    () => new Map(formulaRecords.map((item) => [item.id, item])),
    [formulaRecords],
  )
  const filteredFormulaRecords = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase()
    if (!query) {
      return formulaRecords
    }
    return formulaRecords.filter((item) =>
      item.name.toLowerCase().includes(query) ||
      item.code.toLowerCase().includes(query) ||
      item.tags.some((tag) => tag.toLowerCase().includes(query)) ||
      item.project.toLowerCase().includes(query),
    )
  }, [formulaRecords, libraryQuery])
  const editingLine = editingLineId ? formula.lines.find((line) => line.id === editingLineId) : undefined
  const editingSourceLot = editingLine?.sourceLotId ? lotById.get(editingLine.sourceLotId) : undefined
  const editingSourceAvailableGrams = editingSourceLot
    ? availableLotGrams(editingSourceLot)
    : editingLine?.sourceAvailableGrams
  const totalLineGrams = formula.lines.reduce((sum, line) => sum + line.grams, 0)
  const formulaPercent = formulaFinalPercent(totalLineGrams, formula.targetGrams)
  const formulaFinalReady = formula.lines.length > 0 && formulaIsFinalized(formulaPercent)
  const formulaReviewBlocker =
    formula.lines.length === 0
      ? 'Add at least one material before submitting for review.'
      : !formulaFinalReady
        ? `Formula is ${formulaPercent.toFixed(2)}%. Normalize it to 100% before submitting for review.`
        : formula.targetMarkets.length === 0
          ? 'Choose at least one target market in Details before submitting for review.'
          : formula.finalProductConcentrationPercent <= 0
            ? 'Set the final-product concentration in Details before submitting for review.'
        : metadataSaving
          ? 'Wait for the current draft save to finish.'
          : undefined
  const finalPercentGap = 100 - formulaPercent
  const ifraRows = useMemo(
    () => buildFormulaIfraRows(formula, formulaById, materialById),
    [formula, formulaById, materialById],
  )
  const ifraFailCount = formulaFinalReady ? ifraRows.filter((row) => row.status === 'fail').length : 0
  const ifraStatus: DomainStatus = !formulaFinalReady ? 'review' : ifraFailCount > 0 ? 'alert' : 'stable'
  const ifraFocusRow = ifraRows[0]
  const focusedMaterial =
    (focusedMaterialId ? materialById.get(focusedMaterialId) : undefined) ?? ifraFocusRow?.material
  const focusedStock = focusedMaterial ? stockByMaterialId.get(focusedMaterial.id) : undefined
  const focusedIfraRow = focusedMaterial ? ifraRows.find((row) => row.material.id === focusedMaterial.id) : undefined
  const formulaProgressPercent = Math.max(0, Math.min(100, formulaPercent))
  const currentVersionRecord = versions.find((version) => version.version === formula.version)
  const lineViewModels = useMemo(
    () =>
      formula.lines.map((line) => {
        const material = line.materialId ? materialById.get(line.materialId) : undefined
        const childFormula = line.childFormulaId ? formulaById.get(line.childFormulaId) : undefined
        const sourceLot = line.sourceLotId ? lotById.get(line.sourceLotId) : undefined
        return {
          line,
          material,
          childFormula,
          sourceLot,
          sourceAvailableGrams: sourceLot ? availableLotGrams(sourceLot) : line.sourceAvailableGrams,
          note: inferFormulaPyramidNote(line, material),
          odorType: inferFormulaOdorType(line, material),
          tags: line.tags?.length ? line.tags : material?.odor.slice(0, 2) ?? [],
        }
      }),
    [formula.lines, formulaById, lotById, materialById],
  )
  const groupedSections = useMemo(
    () =>
      formulaPyramidNotes.map((note) => {
        const lines = lineViewModels.filter((view) => view.note === note)
        const grams = lines.reduce((sum, view) => sum + view.line.grams, 0)
        return { note, lines, grams }
      }),
    [lineViewModels],
  )
  const filteredMaterials = useMemo(() => {
    const query = materialQuery.trim().toLowerCase()
    return materialRecords
      .filter((material) => {
        if (!query) {
          return true
        }
        return (
          material.name.toLowerCase().includes(query) ||
          material.cas.toLowerCase().includes(query) ||
          material.family.toLowerCase().includes(query) ||
          material.odor.some((odor) => odor.toLowerCase().includes(query))
        )
      })
      .slice(0, 36)
  }, [materialQuery, materialRecords])
  const filteredInventoryOptions = useMemo(() => {
    const query = materialQuery.trim().toLowerCase()
    return lots
      .map((lot): FormulaInventoryOption | null => {
        const material = materialById.get(lot.materialId)
        if (!material || !isLotEligibleForInventory(lot)) {
          return null
        }
        const availableGrams = availableLotGrams(lot)
        if (availableGrams <= 0) {
          return null
        }
        if (
          query &&
          !material.name.toLowerCase().includes(query) &&
          !material.cas.toLowerCase().includes(query) &&
          !material.family.toLowerCase().includes(query) &&
          !material.odor.some((odor) => odor.toLowerCase().includes(query)) &&
          !lot.lotNumber.toLowerCase().includes(query) &&
          !lot.location.toLowerCase().includes(query)
        ) {
          return null
        }
        return { material, lot, availableGrams }
      })
      .filter((option): option is FormulaInventoryOption => Boolean(option))
      .sort((a, b) => {
        const expirySort = a.lot.expiryDate.localeCompare(b.lot.expiryDate)
        return expirySort || a.material.name.localeCompare(b.material.name)
      })
      .slice(0, 36)
  }, [lots, materialById, materialQuery])
  const filteredChildFormulas = useMemo(() => {
    const query = materialQuery.trim().toLowerCase()
    return selectableChildFormulas.filter((child) => {
      if (!query) {
        return true
      }
      return child.name.toLowerCase().includes(query) || child.code.toLowerCase().includes(query)
    })
  }, [materialQuery, selectableChildFormulas])

  const resetFormulaWorkspace = useEffectEvent(() => {
    setMetadataDraft(formulaMetadataDraftFromRecord(formula))
    setMetadataDirty(false)
    setUndoStack([])
    setRedoStack([])
    setWorkflowDialog(null)
    setWorkflowComment('')
    setWorkflowReviewer(formula.assignedReviewer ?? session.email)
    setScalePlan(null)
    setScaleTargetGrams(formula.targetGrams)
    setVersionDiff(null)
    metadataChangeCounterRef.current = 0
  })

  useEffect(() => {
    resetFormulaWorkspace()
  }, [formula.id, session.email])
  useEffect(() => {
    setVersionNote(`Snapshot ${formula.code} ${formula.version}`)
    setEditingLineId(null)
    setEditDraft(null)
    setFocusedMaterialId(null)
  }, [formula.code, formula.id, formula.version])

  useEffect(() => {
    let active = true
    async function loadVersions() {
      try {
        const payload = await requestApi<FormulaVersionListResponse>(
          `/formulas/${encodeURIComponent(formula.id)}/versions`,
        )
        if (!active) {
          return
        }
        setVersions(payload.versions)
        setDiffToVersion(payload.versions[0]?.version ?? '')
        setDiffFromVersion(payload.versions[1]?.version ?? '')
        if (payload.versions.length < 2) {
          setVersionDiff(null)
        }

      } catch {
        if (active) {
          setVersions([])
          setFormulaStatus('Formula version history unavailable until API is reachable')
        }
      }
    }
    void loadVersions()
    return () => {
      active = false
    }
  }, [formula.code, formula.id, formula.version])

  const autosaveFormulaDraft = useEffectEvent(() => {
    void saveFormulaDraft(true)
  })

  useEffect(() => {
    if (!metadataDirty || !canEditFormula || !formulaEditable || metadataSaveInFlightRef.current) {
      return
    }
    const timer = window.setTimeout(() => {
      autosaveFormulaDraft()
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [canEditFormula, formula.id, formulaEditable, metadataDirty, metadataDraft])

  function upsertFormula(nextFormula: Formula) {
    onFormulaRecordsChange((current) => {
      const exists = current.some((item) => item.id === nextFormula.id)
      return exists
        ? current.map((item) => (item.id === nextFormula.id ? nextFormula : item))
        : [nextFormula, ...current]
    })
  }

  function acceptFormulaMutation(nextFormula: Formula, recordHistory = true) {
    if (recordHistory && nextFormula.id === formula.id && nextFormula.draftRevision !== formula.draftRevision) {
      setUndoStack((current) => [...current.slice(-19), structuredClone(formula)])
      setRedoStack([])
    }
    upsertFormula(nextFormula)
  }

  function updateMetadataDraft(patch: Partial<FormulaMetadataDraft>) {
    metadataChangeCounterRef.current += 1
    setMetadataDraft((current) => ({ ...current, ...patch }))
    setMetadataDirty(true)
  }

  function formulaDraftPayload(snapshot: Formula) {
    return {
      expectedRevision: formula.draftRevision,
      name: snapshot.name,
      targetGrams: snapshot.targetGrams,
      concentrationType: snapshot.concentrationType,
      finalProductConcentrationPercent: snapshot.finalProductConcentrationPercent,
      targetMarkets: snapshot.targetMarkets,
      brief: snapshot.brief,
      inspiration: snapshot.inspiration,
      pyramidSummary: snapshot.pyramidSummary,
      tags: snapshot.tags,
      project: snapshot.project,
      collection: snapshot.collection,
      density: snapshot.density,
      bottleVolumeMl: snapshot.bottleVolumeMl,
      bottleCount: snapshot.bottleCount,
      ifraCategory: snapshot.ifraCategory,
      assignedReviewer: snapshot.assignedReviewer,
      lines: snapshot.lines,
    }
  }

  async function saveFormulaDraft(silent = false) {
    if (!canEditFormula || !formulaEditable || metadataSaveInFlightRef.current) {
      return null
    }
    const changeCounter = metadataChangeCounterRef.current
    metadataSaveInFlightRef.current = true
    setMetadataSaving(true)
    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: formula.draftRevision,
          name: metadataDraft.name,
          targetGrams: metadataDraft.targetGrams,
          concentrationType: metadataDraft.concentrationType,
          finalProductConcentrationPercent: metadataDraft.finalProductConcentrationPercent,
          targetMarkets: parseFormulaTags(metadataDraft.targetMarkets),
          brief: metadataDraft.brief,
          inspiration: metadataDraft.inspiration,
          pyramidSummary: metadataDraft.pyramidSummary,
          tags: parseFormulaTags(metadataDraft.tags),
          project: metadataDraft.project,
          collection: metadataDraft.collection,
          density: metadataDraft.density,
          bottleVolumeMl: metadataDraft.bottleVolumeMl,
          bottleCount: metadataDraft.bottleCount,
          ifraCategory: metadataDraft.ifraCategory,
          assignedReviewer: metadataDraft.assignedReviewer,
        }),
      })
      acceptFormulaMutation(payload.formula)
      if (metadataChangeCounterRef.current === changeCounter) {
        setMetadataDraft(formulaMetadataDraftFromRecord(payload.formula))
        setMetadataDirty(false)
      }
      setFormulaStatus(silent ? `Draft autosaved / revision ${payload.formula.draftRevision}` : `Draft saved / revision ${payload.formula.draftRevision}`)
      return payload.formula
    } catch (error) {
      setMetadataDirty(true)
      setFormulaStatus(error instanceof Error ? error.message : 'Formula draft save failed')
      return null
    } finally {
      metadataSaveInFlightRef.current = false
      setMetadataSaving(false)
    }
  }

  async function restoreFormulaSnapshot(snapshot: Formula) {
    if (!formulaEditable) {
      return null
    }
    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formulaDraftPayload(snapshot)),
      })
      upsertFormula(payload.formula)
      setMetadataDraft(formulaMetadataDraftFromRecord(payload.formula))
      setMetadataDirty(false)
      return payload.formula
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula history restore failed')
      return null
    }
  }

  async function undoFormulaChange() {
    const snapshot = undoStack[undoStack.length - 1]
    if (!snapshot) {
      return
    }
    const restored = await restoreFormulaSnapshot(snapshot)
    if (restored) {
      setUndoStack((current) => current.slice(0, -1))
      setRedoStack((current) => [...current.slice(-19), structuredClone(formula)])
      setFormulaStatus(`Undid change / revision ${restored.draftRevision}`)
    }
  }

  async function redoFormulaChange() {
    const snapshot = redoStack[redoStack.length - 1]
    if (!snapshot) {
      return
    }
    const restored = await restoreFormulaSnapshot(snapshot)
    if (restored) {
      setRedoStack((current) => current.slice(0, -1))
      setUndoStack((current) => [...current.slice(-19), structuredClone(formula)])
      setFormulaStatus(`Redid change / revision ${restored.draftRevision}`)
    }
  }

  function openWorkflow(mode: Exclude<FormulaWorkflowDialog, null>) {
    setWorkflowDialog(mode)
    setWorkflowComment('')
    setWorkflowReviewer(formula.assignedReviewer ?? session.email)
  }

  async function submitFormulaReview() {
    if (metadataDirty) {
      const saved = await saveFormulaDraft(false)
      if (!saved) {
        return
      }
    }
    try {
      const payload = await requestApi<FormulaReviewResponse>(`/formulas/${encodeURIComponent(formula.id)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: workflowReviewer, comment: workflowComment }),
      })
      upsertFormula(payload.formula)
      setVersions((current) => [payload.version, ...current.filter((version) => version.id !== payload.version.id)])
      setWorkflowDialog(null)
      setFormulaStatus(`${payload.formula.code} ${payload.version.version} submitted to ${workflowReviewer}`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula review submission failed')
    }
  }

  async function approveFormulaReview() {
    try {
      const payload = await requestApi<FormulaReviewResponse>(`/formulas/${encodeURIComponent(formula.id)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: workflowComment }),
      })
      upsertFormula(payload.formula)
      setVersions((current) => current.map((version) => version.id === payload.version.id ? payload.version : version))
      setWorkflowDialog(null)
      setFormulaStatus(`${payload.formula.code} ${payload.version.version} approved and locked`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula approval failed')
    }
  }

  async function rejectFormulaReview() {
    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: workflowComment }),
      })
      upsertFormula(payload.formula)
      setWorkflowDialog(null)
      setFormulaStatus(`${payload.formula.code} returned for changes`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula rejection failed')
    }
  }

  async function forkWorkingCopy() {
    try {
      const payload = await requestApi<FormulaCreateResponse>(`/formulas/${encodeURIComponent(formula.id)}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'Working copy created from approved version' }),
      })
      upsertFormula(payload.formula)
      onSelectFormula(payload.formula.id)
      setFormulaStatus(`${payload.formula.code} working copy created`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula fork failed')
    }
  }

  async function loadScalePlan(options: { targetGrams?: number; incrementGrams?: number } = {}) {
    const targetGrams = clampPositiveNumber(options.targetGrams ?? scaleTargetGrams, formula.targetGrams)
    const incrementGrams = options.incrementGrams ?? scaleIncrementGrams
    setScaleTargetGrams(targetGrams)
    setScaleIncrementGrams(incrementGrams)
    try {
      const payload = await requestApi<FormulaScaleResponse>(`/formulas/${encodeURIComponent(formula.id)}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetGrams, incrementGrams }),
      })
      setScalePlan(payload.plan)
      setScaleOpen(true)
      setFormulaStatus(`Scale plan ready for ${formatGrams(payload.plan.targetGrams)}`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula scale plan failed')
    }
  }

  function beginFormulaReview() {
    if (!formulaReviewBlocker) {
      openWorkflow('review')
      return
    }

    setFormulaStatus(formulaReviewBlocker)
    if (formula.lines.length === 0) {
      setActiveLabTab('material')
      return
    }
    if (!formulaFinalReady) {
      openScaleFormula()
      return
    }
    if (formula.targetMarkets.length === 0 || formula.finalProductConcentrationPercent <= 0) {
      setActiveLabTab('details')
    }
  }

  async function applyFormulaScale() {
    if (!formulaEditable || !canEditFormula) {
      return
    }
    setScaleApplying(true)
    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}/scale/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetGrams: scaleTargetGrams, incrementGrams: scaleIncrementGrams }),
      })
      acceptFormulaMutation(payload.formula)
      setMetadataDraft(formulaMetadataDraftFromRecord(payload.formula))
      setMetadataDirty(false)
      setScalePlan(null)
      setScaleOpen(false)
      setFormulaStatus(
        payload.movements && payload.movements.length > 0
          ? `Scaled to ${formatGrams(payload.formula.targetGrams)} and synchronized ${payload.movements.length} inventory movement(s)`
          : `Scaled and normalized to ${formatGrams(payload.formula.targetGrams)}`,
      )
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula scale apply failed')
    } finally {
      setScaleApplying(false)
    }
  }

  async function savePlannedFormulaSize() {
    if (!formulaEditable || !canEditFormula) {
      return
    }
    const targetGrams = clampPositiveNumber(scaleTargetGrams, formula.targetGrams)
    setScaleApplying(true)
    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: formula.draftRevision,
          targetGrams,
        }),
      })
      acceptFormulaMutation(payload.formula)
      setMetadataDraft(formulaMetadataDraftFromRecord(payload.formula))
      setMetadataDirty(false)
      setScalePlan(null)
      setFormulaStatus(`Planned formula size set to ${formatGrams(payload.formula.targetGrams)}. Add materials to auto-rescale the composition.`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula size update failed')
    } finally {
      setScaleApplying(false)
    }
  }

  function openNormalizeFormula() {
    void loadScalePlan({ targetGrams: formula.targetGrams, incrementGrams: 0.01 })
  }

  function openScaleFormula() {
    setScaleTargetGrams(formula.targetGrams)
    setScaleIncrementGrams(0.01)
    setScalePlan(null)
    setScaleOpen(true)
    if (formula.lines.length === 0) {
      setFormulaStatus('Set the planned size now. Add materials before auto-rescaling the composition.')
      return
    }
    void loadScalePlan({ targetGrams: formula.targetGrams, incrementGrams: 0.01 })
  }

  function showFormulaDetailTab(tab: FormulaLabTab) {
    setActiveLabTab(tab)
    window.requestAnimationFrame(() => {
      formulaDetailDockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function openWorkspaceSettings() {
    setWorkspaceSettingsDraft(formulaWorkspaceViews)
    setWorkspaceSettingsStatus('These views are saved for your account.')
    setWorkspaceSettingsOpen(true)
  }

  async function saveWorkspaceSettings() {
    setWorkspaceSettingsSaving(true)
    setWorkspaceSettingsStatus('Saving workspace…')
    try {
      const payload = await requestApi<UserSettingsUpdateResponse>('/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formulaWorkspace: workspaceSettingsDraft }),
      })
      onUserSettingsChange(payload.settings)
      setWorkspaceSettingsStatus('Workspace saved.')
      setWorkspaceSettingsOpen(false)
    } catch (error) {
      setWorkspaceSettingsStatus(error instanceof Error ? error.message : 'Could not save workspace settings')
    } finally {
      setWorkspaceSettingsSaving(false)
    }
  }

  async function loadVersionDiff() {
    if (!diffFromVersion || !diffToVersion || diffFromVersion === diffToVersion) {
      setFormulaStatus('Select two different versions to compare')
      return
    }
    try {
      const payload = await requestApi<FormulaDiffResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/versions/diff?from=${encodeURIComponent(diffFromVersion)}&to=${encodeURIComponent(diffToVersion)}`,
      )
      setVersionDiff(payload.diff)
      setFormulaStatus(`Compared ${payload.before.version} with ${payload.after.version}`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula version comparison failed')
    }
  }

  async function saveFormulaEvaluation() {
    const version = versions[0]
    if (!version || !evaluationObservation.trim()) {
      setFormulaStatus('Choose a version and enter an aging observation')
      return
    }
    try {
      const payload = await requestApi<FormulaEvaluationResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/versions/${encodeURIComponent(version.version)}/evaluations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            day: evaluationDay,
            observation: evaluationObservation,
            stability: evaluationStability,
            rating: evaluationRating,
          }),
        },
      )
      setVersions((current) => current.map((item) => item.id === payload.version.id ? payload.version : item))
      setEvaluationObservation('')
      setFormulaStatus(`${payload.version.version} day ${payload.evaluation.day} observation saved`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula evaluation save failed')
    }
  }


  function openFormulaDraftFlow(type: FormulaType) {
    setCreateSheetOpen(false)
    onNewFormula(type)
  }

  function openCustomMaterialFlow() {
    setPickerOpen(false)
    onAddLine()
  }

  function openLineEditor(line: FormulaLine) {
    const material = line.materialId ? materialById.get(line.materialId) : undefined
    if (!formulaEditable || !canEditFormula) {
      setFormulaStatus(`${formula.code} is ${formula.workflowStatus.replace('_', ' ').toLowerCase()} and cannot be edited directly`)
      setActiveLabTab(line.materialId ? 'material' : 'details')
      return
    }
    if (material) {
      setFocusedMaterialId(material.id)
      setActiveLabTab('material')
    }
    setEditingLineId(line.id)
    setEditDraft(buildFormulaLineDraft(line, material))
  }

  function updateEditDraft(next: Partial<FormulaLineDraft>) {
    setEditDraft((current) => {
      if (!current) {
        return current
      }
      const merged = { ...current, ...next }
      if ('grams' in next || 'concentration' in next) {
        merged.activeGrams = Number(((merged.grams * merged.concentration) / 100).toFixed(4))
      }
      if ('activeGrams' in next && !('grams' in next)) {
        merged.grams = Number((merged.activeGrams / Math.max(merged.concentration / 100, 0.0001)).toFixed(4))
      }
      return merged
    })
  }

  function closeLineEditor() {
    setEditingLineId(null)
    setEditDraft(null)
  }

  async function saveEditedLine() {
    if (!editingLine || !editDraft) {
      return
    }
    try {
      const payload = await requestApi<FormulaMutationResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/lines/${encodeURIComponent(editingLine.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grams: clampPositiveNumber(Number(editDraft.grams), editingLine.grams),
            label: editingLine.label,
            concentration: editDraft.concentration,
            pyramidNote: editDraft.pyramidNote,
            odorType: editDraft.odorType,
            accord: editDraft.accord,
            tags: parseFormulaTags(editDraft.tags),
            notes: editDraft.notes,
          }),
        },
      )
      acceptFormulaMutation(payload.formula)
      setFormulaStatus(
        payload.movements && payload.movements.length > 0
          ? `${editingLine.label} saved and synchronized ${payload.movements.length} inventory movement(s)`
          : `${editingLine.label} saved with labspace metadata`,
      )
      setEditingLineId(null)
      setEditDraft(null)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula line update failed')
    }
  }

  async function deleteLine(line: FormulaLine) {
    try {
      const payload = await requestApi<FormulaMutationResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/lines/${encodeURIComponent(line.id)}`,
        { method: 'DELETE' },
      )
      acceptFormulaMutation(payload.formula)
      setFormulaStatus(
        payload.movements && payload.movements.length > 0
          ? `${line.label} removed and restored ${payload.movements.length} inventory movement(s)`
          : `${line.label} removed from ${formula.code}`,
      )
      setEditingLineId(null)
      setEditDraft(null)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula line delete failed')
    }
  }

  async function addMaterialToFormula(material: Material, sourceLot?: InventoryLot) {
    const grams = clampPositiveNumber(Number(pickerGrams), 1)
    const availableGrams = sourceLot ? availableLotGrams(sourceLot) : undefined
    const sourceLotNumber = sourceLot?.lotNumber
    if (sourceLot && availableGrams !== undefined && grams - availableGrams > 0.0001) {
      setFormulaStatus(`${sourceLot.lotNumber} only has ${formatGrams(availableGrams)} available`)
      return
    }
    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialId: material.id,
          label: material.name,
          grams,
          concentration: 100,
          pyramidNote: inferFormulaPyramidNote(undefined, material),
          odorType: inferFormulaOdorType(undefined, material),
          accord: inferFormulaAccord(undefined, material),
          tags: material.odor.slice(0, 2),
          ...(sourceLot
            ? {
                sourceLotId: sourceLot.id,
                sourceLotNumber: sourceLot.lotNumber,
                sourceLocation: sourceLot.location,
                sourceAvailableGrams: availableGrams,
                sourceSupplierLotRef: sourceLot.supplierLotRef,
                inventoryConsumptionMode: 'CONSUMED',
              }
            : {}),
        }),
      })
      acceptFormulaMutation(payload.formula)
      onSelectMaterial(material.id)
      setPickerOpen(false)
      setPickerGrams(1)
      setFormulaStatus(
        sourceLotNumber
          ? `${material.name} consumed from ${sourceLotNumber} and synchronized with inventory`
          : `${material.name} added to ${formula.code}`,
      )
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula material add failed')
    }
  }

  async function addNestedFormulaLine(child: Formula) {
    const grams = clampPositiveNumber(Number(nestedGrams), 10)
    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childFormulaId: child.id,
          label: child.name,
          grams,
          concentration: 100,
          pyramidNote: 'Middle',
          odorType: 'Accord',
          accord: child.name.toLowerCase(),
          tags: ['accord'],
        }),
      })
      acceptFormulaMutation(payload.formula)
      setPickerOpen(false)
      setNestedGrams(10)
      setFormulaStatus(`${child.code} accord added and cycle guard passed`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Accord add failed')
    }
  }

  async function snapshotVersion() {
    try {
      const payload = await requestApi<FormulaVersionResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/versions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: versionNote, actor: formula.owner }),
        },
      )
      upsertFormula(payload.formula)
      setVersions((current) => [
        payload.version,
        ...current.filter((version) => version.id !== payload.version.id),
      ])
      setFormulaStatus(`${payload.formula.code} ${payload.version.version} snapshot saved`)
      return payload
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula snapshot failed')
      return null
    }
  }

  async function exportFormulaRecord() {
    try {
      const payload = await requestApi<FormulaExportResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/export`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: formula.owner }),
        },
      )
      setFormulaStatus(`${payload.document.id} exported with ${payload.audit.action} audit`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula export failed')
    }
  }

  return (
    <div
      className={`formula-labspace ${formulaWorkspaceViews.library ? '' : 'is-library-hidden'} ${
        formulaWorkspaceViews.summary ? '' : 'is-summary-hidden'
      }`}
    >
      {formulaWorkspaceViews.library ? (
      <aside className="formula-lab-library glass">
        <div className="formula-rail-head">
          <div>
            <span>Labspace</span>
            <strong>Formula Library</strong>
          </div>
          <button className="primary-button small" type="button" onClick={() => setCreateSheetOpen(true)} disabled={!canEditFormula}>
            <Plus size={14} />
            Create
          </button>
        </div>
        <div className="formula-search-box">
          <Search size={15} />
          <input
            aria-label="Search formulas"
            placeholder="Search by name, code, tag, or project..."
            type="search"
            value={libraryQuery}
            onChange={(event) => setLibraryQuery(event.target.value)}
          />
        </div>
        <div className="formula-library">
          {filteredFormulaRecords.map((item) => {
            const typeMeta = formulaTypeMeta[formulaTypeForFormula(item)]
            return (
              <button
                className={`formula-card formula-rail-card ${item.id === formula.id ? 'is-active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => onSelectFormula(item.id)}
              >
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.code} / {item.version}</span>
                </div>
                <span className={`formula-type-pill tone-${typeMeta.tone}`}>{typeMeta.shortLabel}</span>
                <StatusBadge status={item.status} />
                <span className="mono-value">{formatGrams(item.targetGrams)}</span>
              </button>
            )
          })}
        </div>
      </aside>
      ) : null}

      <main className="formula-lab-editor glass">
        <div className="formula-lab-topbar">
          <button className="ghost-button icon-only" type="button" aria-label="Open formula details" onClick={() => showFormulaDetailTab('details')}>
            <Menu size={18} />
          </button>
          <h2>{formula.name}</h2>
          <div className="formula-topbar-actions">
            <button className="ghost-button small" type="button" onClick={openWorkspaceSettings}>
              <SlidersHorizontal size={14} />
              Workspace
            </button>
            {formulaEditable && canEditFormula && (
              <button className="ghost-button small" type="button" onClick={() => void saveFormulaDraft(false)} disabled={!metadataDirty || metadataSaving}>
                <Save size={14} />
                {metadataSaving ? 'Saving...' : metadataDirty ? 'Save draft' : 'Draft saved'}
              </button>
            )}
            {formulaEditable && canEditFormula && !formulaFinalReady && formula.lines.length > 0 && (
              <button className="ghost-button small" type="button" onClick={openNormalizeFormula} disabled={metadataSaving}>
                <SlidersHorizontal size={14} />
                Normalize to 100%
              </button>
            )}
            {formulaEditable && canEditFormula && (
              <button
                className="primary-button small"
                type="button"
                onClick={beginFormulaReview}
                disabled={metadataSaving}
                title={formulaReviewBlocker}
              >
                <Share2 size={14} />
                Submit review
              </button>
            )}
            {formula.workflowStatus === 'IN_REVIEW' && canApproveFormula && (
              <>
                <button className="ghost-button small" type="button" onClick={() => openWorkflow('reject')}>Request changes</button>
                <button className="primary-button small" type="button" onClick={() => openWorkflow('approve')} disabled={!formulaFinalReady || ifraFailCount > 0}>
                  <CheckCircle2 size={14} />
                  Approve
                </button>
              </>
            )}
            {formula.workflowStatus === 'APPROVED' && canEditFormula && (
              <button className="primary-button small" type="button" onClick={() => void forkWorkingCopy()}>
                <RotateCcw size={14} />
                Fork working copy
              </button>
            )}
          </div>
        </div>

        <div className="formula-lab-breadcrumb">
          <span>Labspace</span>
          <ChevronRight size={14} />
          <span>{formula.code}</span>
          <ChevronRight size={14} />
          <strong>{formula.name}</strong>
          <span className={`formula-type-pill tone-${activeFormulaTypeMeta.tone}`}>{activeFormulaTypeMeta.label}</span>
          <StatusBadge status={formula.status} />
        </div>

        <section className="formula-lab-hero">
          <div className="formula-bottle-art">
            <FlaskConical size={28} />
          </div>
          <div>
            <h1>{formula.name}</h1>
            <p>
              {activeFormulaTypeMeta.label}
              {formula.formulaType === 'FINE_FRAGRANCE' ? ` / ${formula.concentrationType}` : ''}
              {' / '}
              {productConcentrationLabel}
              {' / '}
              {formula.brief || 'Add the creative brief in Details.'}
            </p>
          </div>
        </section>

        <div className="formula-lab-tools">
          <button className="ghost-button icon-only" type="button" aria-label="Undo last action" title="Undo" onClick={() => void undoFormulaChange()} disabled={!formulaEditable || undoStack.length === 0}>
            <Undo2 size={15} />
          </button>
          <button className="ghost-button icon-only" type="button" aria-label="Redo last action" title="Redo" onClick={() => void redoFormulaChange()} disabled={!formulaEditable || redoStack.length === 0}>
            <Redo2 size={15} />
          </button>
          <button
            className="formula-lab-stats formula-scale-summary"
            type="button"
            onClick={openScaleFormula}
            title="Adjust planned size and auto-rescale the formula"
            aria-label="Adjust and auto-rescale formula"
          >
            <span>#{formula.lines.length}</span>
            <span>{formulaPercent.toFixed(1)}%</span>
            <span>{formatGrams(totalLineGrams)}</span>
            <span>r{formula.draftRevision}</span>
            <SlidersHorizontal size={14} aria-hidden="true" />
          </button>
          <button className="ghost-button icon-only" type="button" aria-label="Edit formula tags" title="Metadata and tags" onClick={() => showFormulaDetailTab('details')}>
            <Tag size={15} />
          </button>
          <button className="ghost-button icon-only" type="button" aria-label="Export formula" title="Export with audit" onClick={() => void exportFormulaRecord()} disabled={!canExportFormula || formula.lines.length === 0}>
            <Share2 size={15} />
          </button>
          <button className="ghost-button icon-only" type="button" aria-label="Scale formula" title="Adjust planned size, auto-rescale, and print" onClick={openScaleFormula}>
            <SlidersHorizontal size={15} />
          </button>
        </div>

        <div className="formula-ledger">
          {groupedSections.map((section) => {
            const meta = formulaNoteMeta[section.note]
            return (
              <section className={`formula-ledger-section ${meta.className}`} key={section.note}>
                <div className="formula-ledger-section-head">
                  <strong>{meta.label} <span>({section.lines.length})</span></strong>
                  <span>{formatFormulaPercent(section.grams, formula.targetGrams)} / {formatGrams(section.grams)}</span>
                </div>
                {section.lines.length > 0 ? (
                  section.lines.map(({ line, material, childFormula, sourceLot, sourceAvailableGrams, odorType, tags }) => {
                    const sourceLotNumber = sourceLot?.lotNumber ?? line.sourceLotNumber
                    const sourceLocation = sourceLot?.location ?? line.sourceLocation
                    const lineConcentrationPercent = formulaLineConcentrationFraction(line) * 100
                    return (
                      <div
                        className="formula-ledger-line"
                        key={line.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openLineEditor(line)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openLineEditor(line)
                          }
                        }}
                      >
                        <div className="formula-material-avatar">
                          {(material?.name ?? childFormula?.name ?? line.label).slice(0, 1)}
                        </div>
                        <div className="formula-ledger-main">
                          <strong>{line.label}</strong>
                          <span>
                            {material?.cas ?? childFormula?.code ?? 'accord'} / {inferFormulaPyramidNote(line, material)} / {odorType}
                          </span>
                          <div className="formula-tag-row">
                            {tags.map((tag) => (
                              <span key={`${line.id}-${tag}`}>#{tag}</span>
                            ))}
                            <span className="formula-add-tag">+ Add tag</span>
                          </div>
                          {sourceLotNumber && (
                            <span className="formula-inventory-link">
                              Stock {sourceLotNumber}
                              {sourceLocation ? ` / ${sourceLocation}` : ''}
                              {sourceAvailableGrams !== undefined ? ` / ${formatGrams(sourceAvailableGrams)} available` : ''}
                            </span>
                          )}
                        </div>
                        <div className="formula-ledger-amount">
                          <strong>{formatGrams(line.grams)}</strong>
                          <span>{formatFormulaPercent(line.grams, formula.targetGrams)} of formula</span>
                          <span className="formula-ledger-concentration" title="Raw-material concentration used for this formula line">
                            Conc. {lineConcentrationPercent.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="formula-ledger-empty">No {meta.label.toLowerCase()} materials yet.</div>
                )}
              </section>
            )
          })}
        </div>

        {formula.lines.length === 0 && (
          <div className="empty-state formula-empty-state">
            <strong>Draft created. No formula lines yet.</strong>
            <span>Add a material from Library/Inventory or use the classic add-line modal.</span>
            <button className="ghost-button" type="button" onClick={onAddLine} disabled={!formulaEditable || !canEditFormula}>
              Classic Add Line
            </button>
          </div>
        )}

        <button
          className="formula-floating-add"
          type="button"
          aria-label="Add material to formula"
          disabled={!formulaEditable || !canEditFormula}
          onClick={() => {
            setPickerMode('materials')
            setPickerSource('inventory')
            setPickerOpen(true)
          }}
        >
          <Plus size={26} />
        </button>

        <div className="formula-bottom-tabs">
          {(['sketch', 'material', 'details'] as FormulaLabTab[]).map((tab) => (
            <button
              className={activeLabTab === tab ? 'is-active' : ''}
              key={tab}
              type="button"
              onClick={() => showFormulaDetailTab(tab)}
            >
              {tab === 'sketch' && <NotebookTabs size={16} />}
              {tab === 'material' && <Beaker size={16} />}
              {tab === 'details' && <ClipboardCheck size={16} />}
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </main>

      {formulaWorkspaceViews.summary ? (
      <aside className="formula-lab-inspector formula-lab-summary glass">
        <div className="formula-inspector-status">
          <span>{formulaStatus}</span>
        </div>

        <section className="formula-inspector-card">
          <div className="formula-card-head">
            <div>
              <span>Final product</span>
              <strong>{formula.name}</strong>
            </div>
            <StatusBadge
              status={formulaFinalReady ? 'stable' : 'review'}
              label={formulaFinalReady ? '100% ready' : 'Pending final %'}
            />
          </div>
          <div className="metric-grid">
            <Metric label="Final %" value={`${formulaPercent.toFixed(2)}%`} />
            <Metric label="Line total" value={`${formatGrams(totalLineGrams)} / ${formatGrams(formula.targetGrams)}`} />
            <Metric label="Type" value={activeFormulaTypeMeta.label} />
            <Metric label="Product concentration" value={`${formula.finalProductConcentrationPercent.toFixed(1)}%`} />
            <Metric label="Version" value={formula.version} />
            <Metric label="Workflow" value={formula.workflowStatus.replace('_', ' ')} />
          </div>
          <div className="formula-progress-track" aria-label="Formula final percent">
            <span style={{ width: `${formulaProgressPercent}%` }} />
          </div>
          <p className="caveat">
            {formulaFinalReady
              ? 'Final formula is normalized to 100%; IFRA can be evaluated against the finished product.'
              : finalPercentGap >= 0
                ? `${finalPercentGap.toFixed(2)}% remains before IFRA final-product limits are shown.`
                : `${Math.abs(finalPercentGap).toFixed(2)}% over target; rebalance before approval.`}
          </p>
        </section>
      </aside>
      ) : null}

      {formulaWorkspaceViews.ifra ? (
        <section className={`formula-lab-analysis-card formula-inspector-card formula-ifra-panel glass ${!formulaFinalReady ? 'is-pending' : ifraFailCount > 0 ? 'is-fail' : 'is-pass'}`}>
          <div className="formula-card-head">
            <div>
              <span>IFRA final product</span>
              <strong>
                {!formulaFinalReady
                  ? 'Waiting for final %'
                  : ifraFailCount > 0
                    ? `${ifraFailCount} limit breach${ifraFailCount === 1 ? '' : 'es'}`
                    : 'All limits pass'}
              </strong>
            </div>
            <StatusBadge status={ifraStatus} label={!formulaFinalReady ? 'Pending' : ifraFailCount > 0 ? 'Blocked' : 'Pass'} />
          </div>
          {!formulaFinalReady ? (
            <div className="empty-state compact">
              <strong>IFRA hidden until the formula totals 100%.</strong>
              <span>Current formula total is {formulaPercent.toFixed(2)}%. Finish the product concentration first.</span>
            </div>
          ) : ifraRows.length > 0 ? (
            <div className="formula-ifra-list">
              {ifraRows.slice(0, 6).map((row) => (
                <button
                  className={`formula-ifra-row ${row.status === 'fail' ? 'is-fail' : ''}`}
                  key={row.material.id}
                  type="button"
                  onClick={() => {
                    setFocusedMaterialId(row.material.id)
                    showFormulaDetailTab('material')
                    onSelectMaterial(row.material.id)
                  }}
                >
                  <div>
                    <strong>{row.material.name}</strong>
                    <span>{row.sourcePath}</span>
                  </div>
                  <span className="mono-value">{row.finalProductPercent.toFixed(3)}% final</span>
                  <span className="mono-value">Limit {row.ifraLimit.toFixed(2)}%</span>
                  <StatusBadge status={row.status === 'fail' ? 'alert' : 'stable'} label={row.status === 'fail' ? 'Fail' : 'Pass'} />
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <strong>No IFRA rows yet.</strong>
              <span>Add raw materials before final-product IFRA can be calculated.</span>
            </div>
          )}
        </section>
      ) : null}

      <section className="formula-lab-details-dock glass" ref={formulaDetailDockRef} aria-label="Formula details">
        <div className="formula-inspector-tabs">
          {(['details', 'material', 'sketch'] as FormulaLabTab[]).map((tab) => (
            <button
              className={activeLabTab === tab ? 'is-active' : ''}
              key={`inspector-${tab}`}
              type="button"
              onClick={() => showFormulaDetailTab(tab)}
            >
              {tab === 'details' ? 'Details' : tab === 'material' ? 'Material' : 'Create'}
            </button>
          ))}
        </div>

        {activeLabTab === 'sketch' && (
          <div className="formula-inspector-stack">
            <div className="metric-grid">
              <Metric label="Target" value={formatGrams(formula.targetGrams)} />
              <Metric label="Actual lines" value={formatGrams(totalLineGrams)} />
              <Metric label="Version" value={formula.version} />
              <Metric label="Owner" value={formula.owner} />
            </div>
            <div className="formula-create-options compact">
              <button type="button" onClick={() => setCreateSheetOpen(true)}>
                <NotebookTabs size={17} />
                Create Accord or Fine Fragrance
              </button>
            </div>
          </div>
        )}
        {activeLabTab === 'material' && (
          <div className="formula-inspector-stack">
            {focusedMaterial ? (
              <section className="formula-inspector-card material-detail-card">
                <div className="formula-card-head">
                  <div>
                    <span>Material detail</span>
                    <strong>{focusedMaterial.name}</strong>
                  </div>
                  <DataTag label="IFRA" value={`${focusedMaterial.ifraLimit.toFixed(2)}%`} tone={focusedMaterial.ifraLimit < 5 ? 'amber' : 'green'} />
                </div>
                <div className="metric-grid">
                  <Metric label="CAS" value={focusedMaterial.cas} />
                  <Metric label="Family" value={focusedMaterial.family} />
                  <Metric label="Final product %" value={focusedIfraRow && formulaFinalReady ? `${focusedIfraRow.finalProductPercent.toFixed(3)}%` : 'Pending'} />
                  <Metric label="Stock available" value={focusedStock ? formatGrams(focusedStock.available) : 'No stock'} />
                </div>
                <p className="caveat">{focusedMaterial.odor.join(', ')}. Source: material master and linked inventory lots.</p>
              </section>
            ) : null}
            <div className="resolved-table formula-resolved-list">
              {resolvedLeaves.length > 0 ? (
                resolvedLeaves.map((leaf) => (
                  <button
                    className={`resolved-row ${focusedMaterialId === leaf.materialId ? 'is-active' : ''}`}
                    key={leaf.materialId}
                    type="button"
                    onClick={() => {
                      setFocusedMaterialId(leaf.materialId)
                      onSelectMaterial(leaf.materialId)
                    }}
                  >
                    <div>
                      <strong>{leaf.materialName}</strong>
                      <span>{leaf.sourcePath}</span>
                    </div>
                    <span className="mono-value">{leaf.effectivePercent.toFixed(2)}%</span>
                    <span className="mono-value">{formatCurrency(leaf.cost)}</span>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <strong>No resolved leaves yet.</strong>
                  <span>Create ingredients before cost and IFRA rollups run.</span>
                </div>
              )}
            </div>
          </div>
        )}
        {activeLabTab === 'details' && (
          <div className="formula-inspector-stack formula-details-stack">
            <div className="metric-grid">
              <Metric label="Resolved grams" value={formatGrams(totals.totalGrams)} />
              <Metric label="Formula cost" value={formatCurrency(totals.totalCost)} />
              <Metric label="Cost / gram" value={formatCurrency(totals.costPerGram)} />
              <Metric label="Workflow" value={formula.workflowStatus.replace('_', ' ')} />
            </div>

            <details className="formula-detail-section" open>
              <summary>
                <span>Metadata & brief</span>
                <small>{metadataSaving ? 'Saving...' : metadataDirty ? 'Unsaved' : `Revision ${formula.draftRevision}`}</small>
              </summary>
              <div className="formula-metadata-form">
                <label className="field-row">
                  <span>Name</span>
                  <input value={metadataDraft.name} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ name: event.target.value })} />
                </label>
                <div className="formula-field-grid">
                  <label className="field-row">
                    <span>Concentration type</span>
                    <select value={metadataDraft.concentrationType} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ concentrationType: event.target.value as Formula['concentrationType'] })}>
                      <option value="PARFUM">Parfum</option>
                      <option value="EDP">Eau de Parfum</option>
                      <option value="EDT">Eau de Toilette</option>
                      <option value="EDC">Eau de Cologne</option>
                      <option value="COLOGNE">Cologne</option>
                      <option value="OTHER">Other / Accord</option>
                    </select>
                  </label>
                  <label className="field-row">
                    <span>Final product (%)</span>
                    <input type="number" min={0.01} max={100} step={0.1} value={metadataDraft.finalProductConcentrationPercent} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ finalProductConcentrationPercent: Number(event.target.value) })} />
                  </label>
                  <label className="field-row">
                    <span>Target formula (g)</span>
                    <input type="number" min={0.01} step={0.01} value={metadataDraft.targetGrams} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ targetGrams: Number(event.target.value) })} />
                  </label>
                  <label className="field-row">
                    <span>IFRA category</span>
                    <input value={metadataDraft.ifraCategory} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ ifraCategory: event.target.value })} />
                  </label>
                </div>
                <label className="field-row">
                  <span>Creative brief</span>
                  <textarea rows={3} value={metadataDraft.brief} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ brief: event.target.value })} />
                </label>
                <label className="field-row">
                  <span>Inspiration</span>
                  <textarea rows={2} value={metadataDraft.inspiration} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ inspiration: event.target.value })} />
                </label>
                <label className="field-row">
                  <span>Pyramid summary</span>
                  <textarea rows={2} value={metadataDraft.pyramidSummary} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ pyramidSummary: event.target.value })} />
                </label>
                <div className="formula-field-grid">
                  <label className="field-row">
                    <span>Project</span>
                    <input value={metadataDraft.project} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ project: event.target.value })} />
                  </label>
                  <label className="field-row">
                    <span>Collection</span>
                    <input value={metadataDraft.collection} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ collection: event.target.value })} />
                  </label>
                </div>
                <label className="field-row">
                  <span>Markets</span>
                  <input value={metadataDraft.targetMarkets} disabled={!formulaEditable || !canEditFormula} placeholder="EU, US, UK" onChange={(event) => updateMetadataDraft({ targetMarkets: event.target.value })} />
                </label>
                <label className="field-row">
                  <span>Formula tags</span>
                  <input value={metadataDraft.tags} disabled={!formulaEditable || !canEditFormula} placeholder="woody, citrus, musk" onChange={(event) => updateMetadataDraft({ tags: event.target.value })} />
                </label>
                <div className="formula-field-grid">
                  <label className="field-row">
                    <span>Density (g/ml)</span>
                    <input type="number" min={0.01} step={0.01} value={metadataDraft.density} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ density: Number(event.target.value) })} />
                  </label>
                  <label className="field-row">
                    <span>Bottle (ml)</span>
                    <input type="number" min={0.1} step={0.1} value={metadataDraft.bottleVolumeMl} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ bottleVolumeMl: Number(event.target.value) })} />
                  </label>
                  <label className="field-row">
                    <span>Bottles</span>
                    <input type="number" min={1} step={1} value={metadataDraft.bottleCount} disabled={!formulaEditable || !canEditFormula} onChange={(event) => updateMetadataDraft({ bottleCount: Number(event.target.value) })} />
                  </label>
                  <label className="field-row">
                    <span>Reviewer</span>
                    <input value={metadataDraft.assignedReviewer} disabled={!formulaEditable || !canEditFormula} placeholder="Reviewer email or role" onChange={(event) => updateMetadataDraft({ assignedReviewer: event.target.value })} />
                  </label>
                </div>
                {formulaEditable && canEditFormula && (
                  <button className="primary-button" type="button" onClick={() => void saveFormulaDraft(false)} disabled={!metadataDirty || metadataSaving}>
                    <Save size={14} />
                    {metadataSaving ? 'Saving draft...' : 'Save draft now'}
                  </button>
                )}
              </div>
            </details>

            <details className="formula-detail-section">
              <summary>
                <span>Version control</span>
                <small>{versions.length} snapshot{versions.length === 1 ? '' : 's'}</small>
              </summary>
              <div className="formula-metadata-form">
                <label className="field-row">
                  <span>Snapshot note</span>
                  <input aria-label="Formula version note" value={versionNote} disabled={!formulaEditable || !canEditFormula} onChange={(event) => setVersionNote(event.target.value)} />
                </label>
                <div className="action-row">
                  <button className="primary-button" type="button" onClick={() => void snapshotVersion()} disabled={!formulaEditable || !canEditFormula || formula.lines.length === 0}>
                    <Save size={14} />
                    Save version
                  </button>
                  <button className="ghost-button" type="button" onClick={openScaleFormula} disabled={formula.lines.length === 0}>Scale & print</button>
                  <button className="ghost-button" type="button" onClick={() => void exportFormulaRecord()} disabled={!canExportFormula || formula.lines.length === 0}>Export + audit</button>
                </div>
                <div className="formula-compare-controls">
                  <select aria-label="Compare from version" value={diffFromVersion} onChange={(event) => setDiffFromVersion(event.target.value)}>
                    <option value="">From version</option>
                    {versions.map((version) => <option key={`from-${version.id}`} value={version.version}>{version.version}</option>)}
                  </select>
                  <select aria-label="Compare to version" value={diffToVersion} onChange={(event) => setDiffToVersion(event.target.value)}>
                    <option value="">To version</option>
                    {versions.map((version) => <option key={`to-${version.id}`} value={version.version}>{version.version}</option>)}
                  </select>
                  <button className="ghost-button" type="button" onClick={() => void loadVersionDiff()} disabled={versions.length < 2}>Compare</button>
                </div>
                {versionDiff && (
                  <div className="formula-diff-summary">
                    <div className="metric-grid">
                      <Metric label="Cost delta" value={formatCurrency(versionDiff.totalCostDelta)} />
                      <Metric label="IFRA blockers" value={`${versionDiff.ifraBlockerDelta >= 0 ? '+' : ''}${versionDiff.ifraBlockerDelta}`} />
                      <Metric label="Metadata" value={String(versionDiff.metadataChanges.length)} />
                      <Metric label="Lines changed" value={String(versionDiff.lineChanges.filter((line) => line.change !== 'UNCHANGED').length)} />
                    </div>
                    {versionDiff.lineChanges.filter((line) => line.change !== 'UNCHANGED').slice(0, 8).map((line) => (
                      <div className="formula-diff-line" key={line.key}>
                        <strong>{line.label}</strong>
                        <span>{line.change}</span>
                        <span className="mono-value">{line.beforeGrams.toFixed(3)}g{' -> '}{line.afterGrams.toFixed(3)}g</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="version-list">
                  {versions.slice(0, 6).map((version) => (
                    <div className="version-row formula-version-compact" key={version.id}>
                      <div>
                        <strong>{version.formulaCode} {version.version}</strong>
                        <span>{version.note}</span>
                        <small>{version.evaluations.length} notebook entries / {version.createdBy}</small>
                      </div>
                      <StatusBadge status={version.status === 'APPROVED' ? 'stable' : 'review'} label={version.status} />
                    </div>
                  ))}
                </div>
              </div>
            </details>

            <details className="formula-detail-section">
              <summary>
                <span>Aging notebook</span>
                <small>Day 1 / 7 / 30</small>
              </summary>
              <div className="formula-metadata-form">
                <div className="formula-field-grid">
                  <label className="field-row">
                    <span>Evaluation day</span>
                    <select value={evaluationDay} disabled={!canEditFormula || versions.length === 0} onChange={(event) => setEvaluationDay(Number(event.target.value) as 1 | 7 | 30)}>
                      <option value={1}>Day 1</option>
                      <option value={7}>Day 7</option>
                      <option value={30}>Day 30</option>
                    </select>
                  </label>
                  <label className="field-row">
                    <span>Stability</span>
                    <select value={evaluationStability} disabled={!canEditFormula || versions.length === 0} onChange={(event) => setEvaluationStability(event.target.value as FormulaEvaluationRecord['stability'])}>
                      <option value="PASS">Pass</option>
                      <option value="WATCH">Watch</option>
                      <option value="FAIL">Fail</option>
                    </select>
                  </label>
                  <label className="field-row">
                    <span>Rating (1-5)</span>
                    <input type="number" min={1} max={5} value={evaluationRating} disabled={!canEditFormula || versions.length === 0} onChange={(event) => setEvaluationRating(Number(event.target.value))} />
                  </label>
                </div>
                <label className="field-row">
                  <span>Observation for {versions[0]?.version ?? 'latest version'}</span>
                  <textarea rows={3} value={evaluationObservation} disabled={!canEditFormula || versions.length === 0} onChange={(event) => setEvaluationObservation(event.target.value)} />
                </label>
                <button className="primary-button" type="button" onClick={() => void saveFormulaEvaluation()} disabled={!canEditFormula || versions.length === 0 || !evaluationObservation.trim()}>Save observation</button>
                <div className="formula-notebook-list">
                  {versions.flatMap((version) => version.evaluations.map((evaluation) => ({ version: version.version, evaluation }))).slice(0, 8).map(({ version, evaluation }) => (
                    <div className="formula-notebook-entry" key={evaluation.id}>
                      <div><strong>{version} / Day {evaluation.day}</strong><span>{evaluation.observation}</span></div>
                      <StatusBadge status={evaluation.stability === 'FAIL' ? 'alert' : evaluation.stability === 'WATCH' ? 'review' : 'stable'} label={`${evaluation.stability} / ${evaluation.rating}/5`} />
                    </div>
                  ))}
                </div>
              </div>
            </details>

            {formula.approvalHistory.length > 0 && (
              <details className="formula-detail-section">
                <summary><span>Approval history</span><small>{formula.approvalHistory.length} events</small></summary>
                <div className="formula-notebook-list">
                  {formula.approvalHistory.slice().reverse().map((event) => (
                    <div className="formula-notebook-entry" key={event.id}>
                      <div><strong>{event.action}</strong><span>{event.comment || event.at}</span></div>
                      <span className="mono-small">{event.actor}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <span className="mono-small">{currentVersionRecord ? `Current version captured ${currentVersionRecord.status}` : 'Current draft has no matching snapshot'}</span>
          </div>
        )}
      </section>

      {formulaWorkspaceViews.evaporation ? (
        <section className="formula-lab-analysis-card formula-inspector-card glass">
          <div className="formula-card-head">
            <div>
              <span>Evaporation simulation</span>
              <strong>Volatility curve</strong>
            </div>
            <DataTag label="Model" value="Raoult" tone="blue" />
          </div>
          {resolvedLeaves.length > 0 ? (
            <>
              <EvaporationChart curve={curve} />
              <p className="caveat">Directional model only; final organoleptic profile still needs lab evaluation.</p>
            </>
          ) : (
            <div className="empty-state compact">
              <strong>Curve waits for resolved ingredients.</strong>
              <span>Add materials before the evaporation simulation runs.</span>
            </div>
          )}
        </section>
      ) : null}

      {workspaceSettingsOpen && (
        <div className="formula-sheet-backdrop" role="presentation">
          <section className="formula-sheet workspace-settings-sheet glass" role="dialog" aria-modal="true" aria-label="Customize Formula Workspace">
            <div className="formula-sheet-grip" />
            <button className="sheet-close-button" type="button" aria-label="Close" onClick={() => setWorkspaceSettingsOpen(false)}>
              <X size={18} />
            </button>
            <h3>Customize Formula Workspace</h3>
            <p>Keep the panels that support your work. The formula editor always remains available.</p>
            <div className="formula-workspace-view-list">
              {([
                { key: 'library', label: 'Formula Library', detail: 'Browse, search, and create formulas.' },
                { key: 'summary', label: 'Formula Snapshot', detail: 'Scale, workflow, and finished-product summary.' },
                { key: 'ifra', label: 'IFRA Final Product', detail: 'Finished-product limits after the formula reaches 100%.' },
                { key: 'evaporation', label: 'Evaporation Simulation', detail: 'Directional volatility curve for the resolved formula.' },
              ] as const).map((view) => (
                <label className="formula-workspace-view-option" key={view.key}>
                  <input
                    checked={workspaceSettingsDraft[view.key]}
                    type="checkbox"
                    onChange={(event) =>
                      setWorkspaceSettingsDraft((current) => ({ ...current, [view.key]: event.target.checked }))
                    }
                  />
                  <span>
                    <strong>{view.label}</strong>
                    <small>{view.detail}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="settings-save-row">
              <span className="mono-small">{workspaceSettingsStatus}</span>
              <div className="action-row">
                <button className="ghost-button" type="button" onClick={() => setWorkspaceSettingsOpen(false)} disabled={workspaceSettingsSaving}>Cancel</button>
                <button className="primary-button" type="button" onClick={() => void saveWorkspaceSettings()} disabled={workspaceSettingsSaving}>
                  {workspaceSettingsSaving ? 'Saving...' : 'Save workspace'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {workflowDialog && (
        <div className="formula-sheet-backdrop" role="presentation">
          <section className="formula-sheet workflow-sheet glass" role="dialog" aria-modal="true" aria-label="Formula workflow">
            <div className="formula-sheet-grip" />
            <button className="sheet-close-button" type="button" aria-label="Close" onClick={() => setWorkflowDialog(null)}><X size={18} /></button>
            <h3>{workflowDialog === 'review' ? 'Submit for review' : workflowDialog === 'approve' ? 'Approve formula' : 'Request changes'}</h3>
            <p>
              {workflowDialog === 'review'
                ? 'A version snapshot will be captured and assigned to the reviewer.'
                : workflowDialog === 'approve'
                  ? 'Approval locks this version after server-side composition and IFRA checks.'
                  : 'Return this version to a controlled working draft with a clear reason.'}
            </p>
            {workflowDialog === 'review' && (
              <label className="field-row">
                <span>Reviewer</span>
                <input autoFocus value={workflowReviewer} onChange={(event) => setWorkflowReviewer(event.target.value)} placeholder="Reviewer email or role" />
              </label>
            )}
            <label className="field-row">
              <span>{workflowDialog === 'reject' ? 'Required change request' : 'Comment'}</span>
              <textarea rows={4} autoFocus={workflowDialog !== 'review'} value={workflowComment} onChange={(event) => setWorkflowComment(event.target.value)} />
            </label>
            {workflowDialog === 'approve' && (
              <>
                <div className="formula-workflow-evidence">
                  <DataTag label="Composition" value={formulaFinalReady ? '100% ready' : `${formulaPercent.toFixed(2)}%`} tone={formulaFinalReady ? 'green' : 'amber'} />
                  <DataTag label="IFRA" value={ifraFailCount > 0 ? `${ifraFailCount} blockers` : 'Pass'} tone={ifraFailCount > 0 ? 'amber' : 'green'} />
                  <DataTag label="Snapshot" value={formula.version} tone="blue" />
                  <DataTag label="Approval" value="Admin or Manager" tone="green" />
                </div>
                <p className="caveat">Approval uses role-gated workflow and is recorded to the formula approval trail.</p>
              </>
            )}
            <div className="action-row formula-dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setWorkflowDialog(null)}>Cancel</button>
              {workflowDialog === 'review' && (
                <button className="primary-button" type="button" onClick={() => void submitFormulaReview()} disabled={!workflowReviewer.trim() || metadataSaving}>Submit review</button>
              )}
              {workflowDialog === 'approve' && (
                <button className="primary-button" type="button" onClick={() => void approveFormulaReview()} disabled={!formulaFinalReady || ifraFailCount > 0}>Approve & lock</button>
              )}
              {workflowDialog === 'reject' && (
                <button className="primary-button" type="button" onClick={() => void rejectFormulaReview()} disabled={!workflowComment.trim()}>Request changes</button>
              )}
            </div>
          </section>
        </div>
      )}

      {scaleOpen && (
        <div className="formula-sheet-backdrop" role="presentation">
          <section className="formula-sheet scale-sheet glass" role="dialog" aria-modal="true" aria-label="Scale and print formula">
            <div className="formula-sheet-grip" />
            <button className="sheet-close-button" type="button" aria-label="Close" onClick={() => setScaleOpen(false)}><X size={18} /></button>
            <h3>Scale & weighing sheet</h3>
            <p>
              {formula.lines.length > 0
                ? 'Set a target size and apply auto-rescale to preserve the composition, including inventory-sourced lines.'
                : 'Set the planned size now. Add materials before applying auto-rescale to the composition.'}
            </p>
            <div className="formula-field-grid">
              <label className="field-row">
                <span>Target grams</span>
                <input type="number" min={0.01} step={0.01} value={scaleTargetGrams} onChange={(event) => setScaleTargetGrams(Number(event.target.value))} />
              </label>
              <label className="field-row">
                <span>Target volume (ml)</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={Number((scaleTargetGrams / Math.max(formula.density, 0.01)).toFixed(3))}
                  onChange={(event) => setScaleTargetGrams(Number(event.target.value) * Math.max(formula.density, 0.01))}
                />
              </label>
              <label className="field-row">
                <span>Scale increment (g)</span>
                <select value={scaleIncrementGrams} onChange={(event) => setScaleIncrementGrams(Number(event.target.value))}>
                  <option value={0.001}>0.001g</option>
                  <option value={0.01}>0.01g</option>
                  <option value={0.1}>0.1g</option>
                  <option value={1}>1g</option>
                </select>
              </label>
            </div>
            {formula.lines.length > 0 && (
              <button className="ghost-button" type="button" onClick={() => void loadScalePlan()} disabled={scaleApplying}>Recalculate preview</button>
            )}
            {scalePlan && (
              <>
                <div className="metric-grid formula-scale-metrics">
                  <Metric label="Target" value={formatGrams(scalePlan.targetGrams)} />
                  <Metric label="Volume" value={`${scalePlan.targetVolumeMl.toFixed(2)} ml`} />
                  <Metric label="Full bottles" value={String(scalePlan.bottleCount)} />
                  <Metric label="Rounding variance" value={formatGrams(scalePlan.varianceGrams)} />
                </div>
                <div className="formula-scale-table">
                  {scalePlan.lines.map((line) => (
                    <div className="formula-scale-row" key={line.lineId}>
                      <strong>{line.label}</strong>
                      <span className="mono-value">{line.targetGrams.toFixed(4)}g</span>
                      <span className="mono-value">Weigh {line.roundedGrams.toFixed(4)}g</span>
                    </div>
                  ))}
                </div>
                <div className="action-row formula-dialog-actions">
                  <button className="ghost-button" type="button" onClick={() => setScaleOpen(false)}>Close</button>
                  {formulaEditable && canEditFormula && (
                    <button className="primary-button" type="button" onClick={() => void applyFormulaScale()} disabled={scaleApplying}>
                      {scaleApplying ? 'Applying...' : 'Apply auto-rescale'}
                    </button>
                  )}
                  <button className="primary-button" type="button" onClick={() => window.print()}>Print weighing sheet</button>
                </div>
              </>
            )}
            {formula.lines.length === 0 && formulaEditable && canEditFormula && (
              <div className="action-row formula-dialog-actions">
                <button className="ghost-button" type="button" onClick={() => setScaleOpen(false)}>Cancel</button>
                <button className="primary-button" type="button" onClick={() => void savePlannedFormulaSize()} disabled={scaleApplying}>
                  {scaleApplying ? 'Saving...' : 'Save planned size'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {createSheetOpen && (
        <div className="formula-sheet-backdrop" role="presentation">
          <section className="formula-sheet create-sheet glass" role="dialog" aria-modal="true" aria-label="Create New Formula">
            <div className="formula-sheet-grip" />
            <button className="sheet-close-button" type="button" aria-label="Close" onClick={() => setCreateSheetOpen(false)}>
              <X size={18} />
            </button>
            <h3>Create New Formula</h3>
            <p>What are you creating?</p>
            <div className="formula-create-options formula-type-create-options">
              <button className="formula-type-option" type="button" onClick={() => openFormulaDraftFlow('ACCORD')}>
                <Library size={18} />
                <span>
                  <strong>Accord</strong>
                  <small>Reusable sub-formula for materials, bases, and building blocks.</small>
                </span>
              </button>
              <button className="formula-type-option" type="button" onClick={() => openFormulaDraftFlow('FINE_FRAGRANCE')}>
                <FlaskConical size={18} />
                <span>
                  <strong>Fine Fragrance</strong>
                  <small>Finished perfume formula with final-product IFRA and publish approval.</small>
                </span>
              </button>
            </div>
            <button className="ghost-button" type="button" onClick={() => setCreateSheetOpen(false)}>
              Maybe later
            </button>
          </section>
        </div>
      )}

      {pickerOpen && (
        <div className="formula-sheet-backdrop" role="presentation">
          <section className="formula-sheet picker-sheet glass" role="dialog" aria-modal="true" aria-label="Add to formula">
            <div className="formula-sheet-grip" />
            <button className="sheet-close-button" type="button" aria-label="Close" onClick={() => setPickerOpen(false)}>
              <X size={18} />
            </button>
            <h3>Add to formula</h3>
            <div className="formula-segmented">
              <button className={pickerMode === 'materials' ? 'is-active' : ''} type="button" onClick={() => setPickerMode('materials')}>
                Materials
              </button>
              <button className={pickerMode === 'formulas' ? 'is-active' : ''} type="button" onClick={() => setPickerMode('formulas')}>
                Formulas
              </button>
            </div>
            <div className="formula-picker-controls">
              <div className="formula-search-box">
                <Search size={15} />
                <input
                  aria-label="Search materials"
                  placeholder={pickerMode === 'materials' ? 'Search materials...' : 'Search formulas...'}
                  type="search"
                  value={materialQuery}
                  onChange={(event) => setMaterialQuery(event.target.value)}
                />
              </div>
              <label className="compact-input">
                <span>{pickerMode === 'materials' ? 'Amount (g)' : 'Accord g'}</span>
                <input
                  min={0.01}
                  step={0.01}
                  type="number"
                  value={pickerMode === 'materials' ? pickerGrams : nestedGrams}
                  onChange={(event) =>
                    pickerMode === 'materials'
                      ? setPickerGrams(Number(event.target.value))
                      : setNestedGrams(Number(event.target.value))
                  }
                />
              </label>
            </div>
            {pickerMode === 'materials' && (
              <>
                <div className="formula-picker-source-tabs">
                  <button className={pickerSource === 'library' ? 'is-active' : ''} type="button" onClick={() => setPickerSource('library')}>
                    <Library size={14} />
                    Library
                  </button>
                  <button className={pickerSource === 'inventory' ? 'is-active' : ''} type="button" onClick={() => setPickerSource('inventory')}>
                    <PackageSearch size={14} />
                    Inventory
                  </button>
                  <button type="button" onClick={openCustomMaterialFlow}>
                    <Plus size={14} />
                    Add custom material
                  </button>
                </div>
                {pickerSource === 'inventory' ? (
                  <div className="formula-picker-list">
                    <div className="formula-picker-consumption-note">
                      Choosing a lot records the entered grams as lab consumption and deducts that lot immediately. Use Library for a composition-only line.
                    </div>
                    {filteredInventoryOptions.length > 0 ? (
                      filteredInventoryOptions.map((option) => {
                        const requestedGrams = clampPositiveNumber(Number(pickerGrams), 1)
                        const insufficient = requestedGrams - option.availableGrams > 0.0001
                        const materialStock = stockByMaterialId.get(option.material.id)
                        return (
                          <button
                            className={`formula-picker-card inventory-card ${insufficient ? 'is-disabled' : ''}`}
                            type="button"
                            key={option.lot.id}
                            onClick={() => void addMaterialToFormula(option.material, option.lot)}
                            disabled={insufficient}
                          >
                            <div>
                              <strong>{option.material.name}</strong>
                              <span>
                                {option.lot.lotNumber} / {option.lot.location} / {formatGrams(option.availableGrams)} available
                              </span>
                              <p>
                                {option.material.cas} / {inferFormulaPyramidNote(undefined, option.material)} / {option.material.family}.
                                {option.lot.supplierLotRef ? ` Supplier lot ${option.lot.supplierLotRef}.` : ''}
                              </p>
                              {insufficient && (
                                <small>Need {formatGrams(requestedGrams)} but this lot has {formatGrams(option.availableGrams)} available.</small>
                              )}
                            </div>
                            <div className="formula-picker-card-tags">
                              <DataTag label="Lot" value={option.lot.qualityStatus} tone="green" />
                              <DataTag label="Total stock" value={formatGrams(materialStock?.available ?? option.availableGrams)} tone="blue" />
                              <DataTag label="IFRA" value={`${option.material.ifraLimit.toFixed(1)}%`} tone={option.material.ifraLimit < 5 ? 'amber' : 'green'} />
                            </div>
                          </button>
                        )
                      })
                    ) : (
                      <div className="empty-state compact">
                        <strong>No approved inventory lots match this search.</strong>
                        <span>Receive stock or clear the search to pick from available raw-material lots.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="formula-picker-list">
                    {filteredMaterials.map((material) => (
                      <button className="formula-picker-card" type="button" key={material.id} onClick={() => void addMaterialToFormula(material)}>
                        <div>
                          <strong>{material.name}</strong>
                          <span>{material.cas} / {inferFormulaPyramidNote(undefined, material)} / {material.family}</span>
                          <p>{material.odor.join(', ')} aroma profile. Source: global library material master.</p>
                        </div>
                        <DataTag label="IFRA" value={`${material.ifraLimit.toFixed(1)}%`} tone={material.ifraLimit < 5 ? 'amber' : 'green'} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {pickerMode === 'formulas' && (
              <div className="formula-picker-list">
                {filteredChildFormulas.map((child) => (
                  <button className="formula-picker-card" type="button" key={child.id} onClick={() => void addNestedFormulaLine(child)}>
                    <div>
                      <strong>{child.name}</strong>
                      <span>{child.code} / {child.version} / {child.lines.length} lines</span>
                      <p>Add this as an accord. Cycle guard still runs on save.</p>
                    </div>
                    <StatusBadge status={child.status} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {editingLine && editDraft && (
        <div className="formula-sheet-backdrop" role="presentation">
          <section className="formula-sheet line-sheet glass" role="dialog" aria-modal="true" aria-label={`Edit ${editingLine.label}`}>
            <div className="formula-sheet-grip" />
            <button className="sheet-close-button" type="button" aria-label="Close" onClick={closeLineEditor}>
              <X size={18} />
            </button>
            <div className="formula-sheet-head">
              <button className="ghost-button" type="button" onClick={closeLineEditor}>
                Cancel
              </button>
              <h3>{editingLine.label}</h3>
              <button className="primary-button" type="button" onClick={() => void saveEditedLine()}>
                Save
              </button>
            </div>
            <div className="line-sheet-section">
              <h4>Quantities</h4>
              <label className="field-row">
                <span>Amount (g)</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={editDraft.grams}
                  onChange={(event) => updateEditDraft({ grams: Number(event.target.value) })}
                />
              </label>
              <label className="field-row">
                <span>Concentration (%)</span>
                <input
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.1}
                  value={editDraft.concentration}
                  onChange={(event) =>
                    updateEditDraft({ concentration: Math.min(100, Math.max(0.01, Number(event.target.value))) })
                  }
                />
              </label>
              <label className="field-row">
                <span>Active Amount (g)</span>
                <input
                  type="number"
                  min={0.0001}
                  step={0.0001}
                  value={editDraft.activeGrams}
                  onChange={(event) => updateEditDraft({ activeGrams: Number(event.target.value) })}
                />
              </label>
              <p className="caveat">Editing active amount recalculates amount.</p>
            </div>
            <div className="line-sheet-section">
              <h4>Classification</h4>
              <span className="line-sheet-label">Pyramid Note</span>
              <div className="formula-note-picker">
                {formulaPyramidNotes.map((note) => (
                  <button
                    className={`${formulaNoteMeta[note].className} ${editDraft.pyramidNote === note ? 'is-active' : ''}`}
                    key={note}
                    type="button"
                    onClick={() => updateEditDraft({ pyramidNote: note })}
                  >
                    {note}
                  </button>
                ))}
              </div>
              <label className="field-row">
                <span>Odor Type (optional)</span>
                <input value={editDraft.odorType} onChange={(event) => updateEditDraft({ odorType: event.target.value })} />
              </label>
              <label className="field-row">
                <span>Accord (optional)</span>
                <input value={editDraft.accord} onChange={(event) => updateEditDraft({ accord: event.target.value })} />
              </label>
              <label className="field-row">
                <span>Tags</span>
                <input placeholder="Add tag..." value={editDraft.tags} onChange={(event) => updateEditDraft({ tags: event.target.value })} />
              </label>
            </div>
            <div className="line-sheet-section">
              <h4>Details</h4>
              {(editingSourceLot || editingLine.sourceLotNumber) && (
                <div className="formula-source-panel">
                  <span>Inventory source</span>
                  <strong>{editingSourceLot?.lotNumber ?? editingLine.sourceLotNumber}</strong>
                  <small>
                    {(editingSourceLot?.location ?? editingLine.sourceLocation) || 'Warehouse linked'}
                    {editingSourceAvailableGrams !== undefined
                      ? ` / ${formatGrams(editingSourceAvailableGrams)} available`
                      : ''}
                  </small>
                  {editingSourceLot?.supplierLotRef ?? editingLine.sourceSupplierLotRef ? (
                    <small>Supplier lot {editingSourceLot?.supplierLotRef ?? editingLine.sourceSupplierLotRef}</small>
                  ) : null}
                </div>
              )}
              <label className="field-row">
                <span>Notes (optional)</span>
                <textarea
                  placeholder="Add notes about this material..."
                  value={editDraft.notes}
                  onChange={(event) => updateEditDraft({ notes: event.target.value })}
                />
              </label>
              <Metric label="Active %" value={formatFormulaPercent(editDraft.activeGrams, formula.targetGrams)} />
              <button className="ghost-button danger" type="button" onClick={() => void deleteLine(editingLine)}>
                <Trash2 size={14} />
                Remove Material
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
})

const FormulaWorkspace = memo(function FormulaWorkspace({
  session,
  formulaRecords,
  materialRecords,
  lots,
  stock,
  activeFormulaId,
  onSelectFormula,
  onFormulaRecordsChange,
  resolvedLeaves,
  totals,
  curve,
  onSelectMaterial,
  onNewFormula,
  onAddLine,
  userSettings,
  onUserSettingsChange,
}: {
  session: AuthSession
  formulaRecords: Formula[]
  materialRecords: Material[]
  lots: InventoryLot[]
  stock: ReturnType<typeof stockSummary>
  activeFormulaId: string
  onSelectFormula: (id: string) => void
  onFormulaRecordsChange: Dispatch<SetStateAction<Formula[]>>
  resolvedLeaves: ResolvedLeaf[]
  totals: ReturnType<typeof formulaTotals>
  curve: ReturnType<typeof evaporationCurve>
  onSelectMaterial: (id: string) => void
  onNewFormula: (type?: FormulaType) => void
  onAddLine: () => void
  userSettings: UserSettingsRecord
  onUserSettingsChange: (settings: UserSettingsRecord) => void
}) {
  if (formulaRecords.length === 0) {
    return (
      <section className="panel formula-empty-state" aria-label="Empty formula library">
        <div className="formula-empty-icon">
          <FlaskConical size={24} />
        </div>
        <span className="mono-small">Formula Library</span>
        <h3>Create your first formula</h3>
        <p>Start an Accord or a Fine Fragrance in this workspace.</p>
        <div className="formula-empty-actions">
          <button className="primary-button" type="button" onClick={() => onNewFormula('ACCORD')}>
            New Accord
          </button>
          <button className="ghost-button" type="button" onClick={() => onNewFormula('FINE_FRAGRANCE')}>
            New Fine Fragrance
          </button>
        </div>
      </section>
    )
  }

  return (
    <FormulaLabspaceWorkspace
      session={session}
      formulaRecords={formulaRecords}
      materialRecords={materialRecords}
      lots={lots}
      stock={stock}
      activeFormulaId={activeFormulaId}
      onSelectFormula={onSelectFormula}
      onFormulaRecordsChange={onFormulaRecordsChange}
      resolvedLeaves={resolvedLeaves}
      totals={totals}
      curve={curve}
      onSelectMaterial={onSelectMaterial}
      onNewFormula={onNewFormula}
      onAddLine={onAddLine}
      userSettings={userSettings}
      onUserSettingsChange={onUserSettingsChange}
    />
  )
  /*
  const fallbackFormula = formulas.find((item) => item.id === 'frm-0421')!
  const formula = formulaRecords.find((item) => item.id === activeFormulaId) ?? formulaRecords[0] ?? fallbackFormula
  const activeLeaves = resolvedLeaves
  const activeTotals = totals
  const activeCurve = curve
  const selectableChildFormulas = useMemo(
    () => formulaRecords.filter((item) => item.id !== formula.id),
    [formula.id, formulaRecords],
  )
  const [formulaStatus, setFormulaStatus] = useState('Formula R&D ready')
  const [lineDrafts, setLineDrafts] = useState<Record<string, number>>({})
  const [nestedFormulaId, setNestedFormulaId] = useState(selectableChildFormulas[0]?.id ?? '')
  const [nestedGrams, setNestedGrams] = useState(10)
  const [versionNote, setVersionNote] = useState(`Snapshot ${formula.code} ${formula.version}`)
  const [versions, setVersions] = useState<FormulaVersionRecord[]>([])

  useEffect(() => {
    setLineDrafts(Object.fromEntries(formula.lines.map((line) => [line.id, line.grams])))
    setVersionNote(`Snapshot ${formula.code} ${formula.version}`)
  }, [formula.code, formula.id, formula.lines, formula.version])

  useEffect(() => {
    if (!selectableChildFormulas.some((item) => item.id === nestedFormulaId)) {
      setNestedFormulaId(selectableChildFormulas[0]?.id ?? '')
    }
  }, [nestedFormulaId, selectableChildFormulas])

  useEffect(() => {
    let active = true
    async function loadVersions() {
      try {
        const payload = await requestApi<FormulaVersionListResponse>(
          `/formulas/${encodeURIComponent(formula.id)}/versions`,
        )
        if (!active) {
          return
        }
        setVersions(payload.versions)
        setFormulaStatus(`${formula.code} version history synced`)
      } catch {
        if (active) {
          setVersions([])
          setFormulaStatus('Formula version history unavailable until API is reachable')
        }
      }
    }
    void loadVersions()
    return () => {
      active = false
    }
  }, [formula.code, formula.id, formula.version])

  function upsertFormula(nextFormula: Formula) {
    onFormulaRecordsChange((current) => {
      const exists = current.some((item) => item.id === nextFormula.id)
      return exists
        ? current.map((item) => (item.id === nextFormula.id ? nextFormula : item))
        : [nextFormula, ...current]
    })
  }

  async function saveLine(line: FormulaLine) {
    const grams = Number(lineDrafts[line.id] ?? line.grams)
    if (!Number.isFinite(grams) || grams <= 0) {
      setFormulaStatus('Line grams must be greater than 0')
      return
    }
    try {
      const payload = await requestApi<FormulaMutationResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/lines/${encodeURIComponent(line.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grams, label: line.label }),
        },
      )
      upsertFormula(payload.formula)
      setFormulaStatus(`${line.label} saved without inventory movement`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula line update failed')
    }
  }

  async function deleteLine(line: FormulaLine) {
    try {
      const payload = await requestApi<FormulaMutationResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/lines/${encodeURIComponent(line.id)}`,
        { method: 'DELETE' },
      )
      upsertFormula(payload.formula)
      setFormulaStatus(`${line.label} removed without inventory movement`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula line delete failed')
    }
  }

  async function moveLine(line: FormulaLine, direction: 'up' | 'down') {
    try {
      const payload = await requestApi<FormulaMutationResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/lines/${encodeURIComponent(line.id)}/move`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction }),
        },
      )
      upsertFormula(payload.formula)
      setFormulaStatus(`${line.label} reordered`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula line reorder failed')
    }
  }

  async function addNestedFormulaLine() {
    const grams = Number(nestedGrams)
    if (!nestedFormulaId || !Number.isFinite(grams) || grams <= 0) {
      setFormulaStatus('Choose a child formula and grams before adding accord')
      return
    }
    try {
      const payload = await requestApi<FormulaMutationResponse>(`/formulas/${encodeURIComponent(formula.id)}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childFormulaId: nestedFormulaId, grams }),
      })
      upsertFormula(payload.formula)
      setNestedGrams(10)
      setFormulaStatus('Accord added and cycle guard passed')
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Accord add failed')
    }
  }

  async function snapshotVersion() {
    try {
      const payload = await requestApi<FormulaVersionResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/versions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: versionNote, actor: formula.owner }),
        },
      )
      upsertFormula(payload.formula)
      setVersions((current) => [
        payload.version,
        ...current.filter((version) => version.id !== payload.version.id),
      ])
      setFormulaStatus(`${payload.formula.code} ${payload.version.version} snapshot saved`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula snapshot failed')
    }
  }

  async function approveFormulaVersion() {
    try {
      const payload = await requestApi<FormulaVersionResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: formula.owner }),
        },
      )
      upsertFormula(payload.formula)
      setVersions((current) =>
        current.map((version) => (version.id === payload.version.id ? payload.version : version)),
      )
      setFormulaStatus(`${payload.formula.code} ${payload.version.version} approved`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula approval failed')
    }
  }

  async function exportFormulaRecord() {
    try {
      const payload = await requestApi<FormulaExportResponse>(
        `/formulas/${encodeURIComponent(formula.id)}/export`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: formula.owner }),
        },
      )
      setFormulaStatus(`${payload.document.id} exported with ${payload.audit.action} audit`)
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Formula export failed')
    }
  }

  return (
    <div className="workspace-grid formula-grid">
      <Panel
        className="wide"
        title="Formula Library"
        icon={FlaskConical}
        right={
          <button className="primary-button" type="button" onClick={onNewFormula}>
            <Plus size={15} />
            New Formula
          </button>
        }
      >
        <div className="formula-library">
          {formulaRecords.map((item) => (
            <button
              className={`formula-card ${item.id === formula.id ? 'is-active' : ''}`}
              key={item.id}
              type="button"
              onClick={() => onSelectFormula(item.id)}
            >
              <div>
                <strong>{item.code}</strong>
                <span>{item.name}</span>
              </div>
              <StatusBadge status={item.status} />
              <span className="mono-value">{formatGrams(item.targetGrams)}</span>
              <span className="mono-value">{item.version}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        className="formula-editor"
        title={`${formula.code} ${formula.name}`}
        icon={FlaskConical}
        right={
          <div className="action-row">
            <StatusBadge status={formula.status} />
            <button className="ghost-button small" type="button" onClick={onAddLine}>
              <Plus size={14} />
              Add Line
            </button>
          </div>
        }
      >
        <div className="formula-status-row">
          <DataTag label="Version" value={formula.version} tone="blue" />
          <DataTag label="Lines" value={String(formula.lines.length)} />
          <span>{formulaStatus}</span>
        </div>
        <div className="formula-lines">
          {formula.lines.length > 0 ? (
            formula.lines.map((line, index) => (
              <div className="formula-line is-editable" key={line.id}>
                <div>
                  <strong>{line.label}</strong>
                  <span>
                    {line.childFormulaId ? 'Accord' : 'Raw material leaf'}
                    {line.materialId ? ` / ${materialRecords.find((material) => material.id === line.materialId)?.cas ?? 'material'}` : ''}
                  </span>
                </div>
                <label className="compact-input">
                  <span>g</span>
                  <input
                    aria-label={`${line.label} grams`}
                    min={0.01}
                    step={0.01}
                    type="number"
                    value={lineDrafts[line.id] ?? line.grams}
                    onChange={(event) =>
                      setLineDrafts((current) => ({ ...current, [line.id]: Number(event.target.value) }))
                    }
                  />
                </label>
                <div className="mono-value">{((Number(lineDrafts[line.id] ?? line.grams) / formula.targetGrams) * 100).toFixed(1)}%</div>
                <div className="line-actions">
                  <button className="ghost-button tiny" type="button" onClick={() => void moveLine(line, 'up')} disabled={index === 0}>
                    Up
                  </button>
                  <button className="ghost-button tiny" type="button" onClick={() => void moveLine(line, 'down')} disabled={index === formula.lines.length - 1}>
                    Down
                  </button>
                  <button className="ghost-button tiny" type="button" onClick={() => void saveLine(line)}>
                    Save
                  </button>
                  <button className="ghost-button tiny danger" type="button" onClick={() => void deleteLine(line)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>Draft created. No formula lines yet.</strong>
              <span>Use Add Line to add raw materials. Formula editing does not consume stock.</span>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Accord" icon={Layers3}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Child formula</span>
            <select
              aria-label="Accord child formula"
              value={nestedFormulaId}
              onChange={(event) => setNestedFormulaId(event.target.value)}
            >
              {selectableChildFormulas.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.code} / {child.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Accord grams</span>
            <input
              aria-label="Accord formula grams"
              min={0.01}
              step={0.01}
              type="number"
              value={nestedGrams}
              onChange={(event) => setNestedGrams(Number(event.target.value))}
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void addNestedFormulaLine()} disabled={!nestedFormulaId}>
            Add Accord
          </button>
        </div>
        <ul className="policy-list">
          <li>Cycle guard blocks parent-child loops before saving.</li>
          <li>Accord save recalculates resolve and cost but creates no stock movement.</li>
        </ul>
      </Panel>

      <Panel title="Resolved Leaves" icon={Layers3}>
        <div className="resolved-table">
          {activeLeaves.length > 0 ? (
            activeLeaves.map((leaf) => (
              <button className="resolved-row" key={leaf.materialId} type="button" onClick={() => onSelectMaterial(leaf.materialId)}>
                <div>
                  <strong>{leaf.materialName}</strong>
                  <span>{leaf.sourcePath}</span>
                </div>
                <span className="mono-value">{leaf.effectivePercent.toFixed(2)}%</span>
                <span className="mono-value">{formatCurrency(leaf.cost)}</span>
              </button>
            ))
          ) : (
            <div className="empty-state">
              <strong>No resolved leaves yet.</strong>
              <span>Create ingredients in the formula editor before cost and IFRA rollups run.</span>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Cost Roll-up" icon={BadgeDollarSign}>
        <div className="metric-grid">
          <Metric label="Target" value={formatGrams(formula.targetGrams)} />
          <Metric label="Resolved grams" value={formatGrams(activeTotals.totalGrams)} />
          <Metric label="Formula cost" value={formatCurrency(activeTotals.totalCost)} />
          <Metric label="Cost / gram" value={formatCurrency(activeTotals.costPerGram)} />
        </div>
      </Panel>

      <Panel className="wide" title="Version, Approval, Export" icon={FileLock2}>
        <div className="material-form-grid">
          <label className="field-row wide-field">
            <span>Snapshot note</span>
            <input
              aria-label="Formula version note"
              value={versionNote}
              onChange={(event) => setVersionNote(event.target.value)}
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void snapshotVersion()} disabled={formula.lines.length === 0}>
            Snapshot Version
          </button>
          <button className="ghost-button" type="button" onClick={() => void approveFormulaVersion()}>
            Approve Formula
          </button>
          <button className="ghost-button" type="button" onClick={() => void exportFormulaRecord()} disabled={formula.lines.length === 0}>
            Export + Audit
          </button>
        </div>
        <div className="version-list">
          {versions.length > 0 ? (
            versions.map((version) => (
              <div className="version-row" key={version.id}>
                <div>
                  <strong>{version.formulaCode} {version.version}</strong>
                  <span>{version.note}</span>
                </div>
                <StatusBadge status={version.status === 'APPROVED' ? 'stable' : 'review'} label={version.status} />
                <span className="mono-value">{formatGrams(version.totalGrams)}</span>
                <span className="mono-value">{formatCurrency(version.totalCost)}</span>
                <span className="mono-value">{version.checksum}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>No version snapshots loaded.</strong>
              <span>Create a snapshot before approval/export evidence review.</span>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Evaporation Curve" icon={Activity}>
        {activeLeaves.length > 0 ? (
          <>
            <EvaporationChart curve={activeCurve} />
            <p className="caveat">Raoult ideal-mix. Directional model, not lab-measured perception.</p>
          </>
        ) : (
          <div className="empty-state">
            <strong>Curve waits for resolved ingredients.</strong>
            <span>The volatility model will activate after the draft has material lines.</span>
          </div>
        )}
      </Panel>
    </div>
  )
  */
})

const InventoryWorkspace = memo(function InventoryWorkspace({
  session,
  lots,
  movements,
  storageLocations,
  stock,
  materialRecords,
  onLotsChange,
  onMovementsChange,
  onStorageLocationsChange,
  onReceiveStock,
  onAdjustStock,
  onTransferStock,
  onRequestInventoryApproval,
}: {
  session: AuthSession
  lots: InventoryLot[]
  movements: InventoryMovement[]
  storageLocations: StorageLocation[]
  stock: ReturnType<typeof stockSummary>
  materialRecords: Material[]
  onLotsChange: Dispatch<SetStateAction<InventoryLot[]>>
  onMovementsChange: Dispatch<SetStateAction<InventoryMovement[]>>
  onStorageLocationsChange: Dispatch<SetStateAction<StorageLocation[]>>
  onReceiveStock: () => void
  onAdjustStock: () => void
  onTransferStock: () => void
  onRequestInventoryApproval: (
    action: InventoryApprovalAction,
    payload: Record<string, unknown>,
    reason: string,
  ) => Promise<InventoryApprovalRequestResponse>
}) {
  const [selectedLotId, setSelectedLotId] = useState(lots[0]?.id ?? '')
  const [qualityStatus, setQualityStatus] = useState<LotQualityStatus>('APPROVED')
  const [qualityReason, setQualityReason] = useState('QC release review')
  const [stockTakeCount, setStockTakeCount] = useState(0)
  const [stockTakeReason, setStockTakeReason] = useState('Cycle count reconciliation')
  const [stockTakeRecords, setStockTakeRecords] = useState<StockTakeRecord[]>([])
  const [labelPayload, setLabelPayload] = useState<LotLabelPayload | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [genealogy, setGenealogy] = useState<LotGenealogyResponse | null>(null)
  const [reorderSuggestions, setReorderSuggestions] = useState<InventoryReorderSuggestion[]>([])
  const [newLocationName, setNewLocationName] = useState('Retest Bin 1')
  const [newLocationZone, setNewLocationZone] = useState('Quality')
  const [newLocationCapacity, setNewLocationCapacity] = useState(600)
  const [newLocationKind, setNewLocationKind] = useState<NonNullable<StorageLocation['kind']>>('Bin')
  const [newLocationParentId, setNewLocationParentId] = useState('')
  const [agingRecords, setAgingRecords] = useState<InventoryAgingRecord[]>([])
  const [agingSummary, setAgingSummary] = useState<InventoryAgingResponse['summary'] | null>(null)
  const [writeOffGrams, setWriteOffGrams] = useState(0)
  const [writeOffReason, setWriteOffReason] = useState('')
  const [inventoryStatus, setInventoryStatus] = useState('Inventory console ready')
  const [lotComplianceDocuments, setLotComplianceDocuments] = useState<DocumentRecord[]>([])
  const [lotDocumentStatus, setLotDocumentStatus] = useState('Document review queue ready')
  const [approvingLotDocumentId, setApprovingLotDocumentId] = useState<string | null>(null)
  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? lots[0]
  const selectedMaterial = selectedLot ? materialRecords.find((material) => material.id === selectedLot.materialId) : undefined
  const selectedLocation = selectedLot ? storageLocations.find((location) => location.name === selectedLot.location) : undefined
  const canReceiveInventory = sessionHasPermission(session, 'inventory.receive')
  const canAdjustInventory = sessionHasPermission(session, 'inventory.adjust')
  const canManageDocuments = sessionHasPermission(session, 'documents.manage')
  const inventoryLotComplianceDocuments = useMemo(() => {
    if (!selectedLot || !selectedMaterial) {
      return []
    }
    return lotComplianceDocuments.filter((document) => {
      if (document.type === 'SDS' && document.linkedTo === selectedMaterial.id) {
        return true
      }
      if (document.type === 'CoA' && document.linkedTo === selectedLot.id) {
        return true
      }
      return false
    })
  }, [lotComplianceDocuments, selectedMaterial, selectedLot])

  useEffect(() => {
    if (lots.length === 0) {
      setSelectedLotId('')
      return
    }
    if (!selectedLotId || !lots.some((lot) => lot.id === selectedLotId)) {
      setSelectedLotId(lots[0]?.id ?? '')
    }
  }, [lots, selectedLotId])

  useEffect(() => {
    if (!selectedLot) {
      return
    }
    setQualityStatus(selectedLot.qualityStatus)
    setStockTakeCount(Number(selectedLot.quantityGrams.toFixed(3)))
  }, [selectedLot])

  useEffect(() => {
    let active = true
    requestApi<InventoryConsoleResponse>('/inventory/console')
      .then((payload) => {
        if (!active) {
          return
        }
        onLotsChange(payload.lots)
        onMovementsChange(payload.movements)
        onStorageLocationsChange(payload.locations)
        setStockTakeRecords(payload.stockTakes)
        setReorderSuggestions(payload.reorderSuggestions)
        setInventoryStatus('Inventory console synced with API')
      })
      .catch(() => {
        if (active) {
          setInventoryStatus('Inventory API unavailable; no cached stock is displayed')
        }
      })
    return () => {
      active = false
    }
  }, [onLotsChange, onMovementsChange, onStorageLocationsChange, session.organizationId])

  useEffect(() => {
    if (!showInventoryLotComplianceReview) {
      setLotComplianceDocuments([])
      return
    }

    const controller = new AbortController()
    async function loadComplianceDocuments() {
      try {
        const payload = await requestApi<DocumentRecord[]>('/documents', { signal: controller.signal })
        setLotComplianceDocuments(payload)
        setLotDocumentStatus('Document review queue synced from Documents API')
      } catch {
        if (!controller.signal.aborted) {
          setLotDocumentStatus('Document review queue unavailable from API')
        }
      }
    }

    void loadComplianceDocuments()

    return () => {
      controller.abort()
    }
  }, [session.organizationId])

  async function approveLotComplianceDocument(documentId: string) {
    if (!canManageDocuments) {
      setLotDocumentStatus('Document approval requires documents.manage permission')
      return
    }

    setApprovingLotDocumentId(documentId)
    setLotDocumentStatus('Approving review document')
    try {
      const payload = await requestApi<DocumentApprovalResponse>(`/documents/${encodeURIComponent(documentId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: session.email,
          note: `Approved from inventory review for ${selectedLot?.lotNumber ?? 'lot'}`,
        }),
      })
      setLotComplianceDocuments((current) =>
        current.map((document) => (document.id === documentId ? payload.document : document)),
      )
      setLotDocumentStatus(`${payload.document.title} approved`)
    } catch (error) {
      setLotDocumentStatus(error instanceof Error ? error.message : 'Document approval failed')
    } finally {
      setApprovingLotDocumentId(null)
    }
  }

  async function openLotComplianceDocument(documentId: string) {
    const documentWindow = window.open('', '_blank', 'noopener,noreferrer')
    setLotDocumentStatus('Checking permission before opening document')
    try {
      const payload = await requestApi<DocumentDownloadResponse>(`/documents/${encodeURIComponent(documentId)}/signed-url`, {
        method: 'POST',
      })
      setLotComplianceDocuments((current) =>
        current.map((document) => (document.id === documentId ? payload.document : document)),
      )
      if (!documentWindow) {
        setLotDocumentStatus('Document link prepared; allow pop-ups to open the signed document')
        return
      }
      documentWindow.location.assign(payload.signedUrl.url)
      setLotDocumentStatus(`${payload.document.title} opened with a time-limited link`)
    } catch (error) {
      documentWindow?.close()
      setLotDocumentStatus(error instanceof Error ? error.message : 'Document could not be opened')
    }
  }

  function upsertLot(lot: InventoryLot) {
    onLotsChange((current) => current.map((item) => (item.id === lot.id ? lot : item)))
  }

  function prependMovement(movement?: InventoryMovement) {
    if (!movement) {
      return
    }
    onMovementsChange((current) => [movement, ...current.filter((item) => item.id !== movement.id)])
  }

  async function updateLotQuality() {
    if (!selectedLot) {
      return
    }
    const qualityPayload = {
      lotId: selectedLot.id,
      qualityStatus,
      reason: qualityReason,
    }
    try {
      if (!canReceiveInventory) {
        await onRequestInventoryApproval(
          'inventory.quality',
          qualityPayload,
          `Change ${selectedLot.lotNumber} QC status to ${qualityStatus}`,
        )
        setInventoryStatus(`${selectedLot.lotNumber} QC update is pending admin approval`)
        return
      }

      const payload = await requestApi<LotQualityResponse>(`/lots/${encodeURIComponent(selectedLot.id)}/quality`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualityStatus, reason: qualityReason }),
      })
      upsertLot(payload.lot)
      setInventoryStatus(`${payload.lot.lotNumber} moved to ${payload.lot.qualityStatus} with no stock movement`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('cannot perform inventory.receive')) {
        await onRequestInventoryApproval(
          'inventory.quality',
          qualityPayload,
          `Change ${selectedLot.lotNumber} QC status to ${qualityStatus}`,
        )
        setInventoryStatus(`${selectedLot.lotNumber} QC update is pending admin approval`)
        return
      }
      setInventoryStatus(error instanceof Error ? error.message : 'QC status update failed')
    }
  }

  async function reconcileStockTake() {
    if (!selectedLot) {
      return
    }
    const stockTakePayload = {
      lotId: selectedLot.id,
      countedGrams: stockTakeCount,
      reason: stockTakeReason,
    }
    try {
      if (!canAdjustInventory) {
        await onRequestInventoryApproval(
          'inventory.stockTake',
          stockTakePayload,
          `Reconcile ${selectedLot.lotNumber} to ${formatGrams(stockTakeCount)}`,
        )
        setInventoryStatus(`${selectedLot.lotNumber} stock take is pending admin approval`)
        return
      }

      const payload = await requestApi<StockTakeResponse>('/inventory/stock-takes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotId: selectedLot.id,
          countedGrams: stockTakeCount,
          reason: stockTakeReason,
          actor: 'Inventory Manager',
        }),
      })
      upsertLot(payload.lot)
      prependMovement(payload.movement)
      setStockTakeRecords((current) => [payload.stockTake, ...current.filter((item) => item.id !== payload.stockTake.id)])
      setInventoryStatus(payload.invariant)
    } catch (error) {
      if (error instanceof Error && error.message.includes('cannot perform inventory.adjust')) {
        await onRequestInventoryApproval(
          'inventory.stockTake',
          stockTakePayload,
          `Reconcile ${selectedLot.lotNumber} to ${formatGrams(stockTakeCount)}`,
        )
        setInventoryStatus(`${selectedLot.lotNumber} stock take is pending admin approval`)
        return
      }
      setInventoryStatus(error instanceof Error ? error.message : 'Stock take failed')
    }
  }

  async function createLocation() {
    try {
      const payload = await requestApi<StorageLocationCreateResponse>('/storage-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newLocationName,
          zone: newLocationZone,
          condition: 'Retest hold / controlled ambient',
          capacityGrams: newLocationCapacity,
          kind: newLocationKind,
          parentId: newLocationParentId || undefined,
          light: 'Amber',
          temperatureRange: '18-22C',
        }),
      })
      onStorageLocationsChange((current) => [payload.location, ...current.filter((item) => item.id !== payload.location.id)])
      setNewLocationName(`Retest Bin ${storageLocations.length + 1}`)
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Location create failed')
    }
  }

  async function printLotLabel() {
    if (!selectedLot || !selectedMaterial) {
      return
    }
    try {
      const payload = await requestApi<LotLabelResponse>(`/lots/${encodeURIComponent(selectedLot.id)}/label`, {
        method: 'POST',
      })
      setLabelPayload(payload.label)
      const qrSvg = await QRCode.toString(payload.label.qrValue, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 220,
      })
      const printed = openPrintDocument(
        `QR label ${selectedLot.lotNumber}`,
        `<main class="sheet"><section class="label">
          <div><div class="brand">OlfactoryOps</div><h1>${escapePrintHtml(selectedMaterial.name)}</h1>
          <p><strong>Lot:</strong> ${escapePrintHtml(selectedLot.lotNumber)}</p>
          <p><strong>CAS:</strong> ${escapePrintHtml(selectedMaterial.cas)}</p>
          <p><strong>Quantity:</strong> ${escapePrintHtml(formatGrams(selectedLot.quantityGrams))}</p>
          <p><strong>Expiry:</strong> ${escapePrintHtml(selectedLot.expiryDate)}</p>
          <p><strong>Storage:</strong> ${escapePrintHtml(payload.label.storageText)}</p>
          <code>${escapePrintHtml(payload.label.qrValue)}</code></div><div class="qr">${qrSvg}</div>
        </section></main>`,
      )
      if (!printed) {
        setInventoryStatus('Label generated; allow pop-ups to print the QR label')
        return
      }
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Label generation failed')
    }
  }

  const selectScannedLot = useCallback((value: string) => {
    const parts = value.split('|')
    const lotId = parts[0] === 'OLFOPS' && parts[1] === 'LOT' ? parts[2] : value.trim()
    const lot = lots.find((candidate) => candidate.id === lotId || candidate.lotNumber === lotId)
    if (!lot) {
      setInventoryStatus('This QR value does not match a lot in the current workspace')
      return
    }
    setSelectedLotId(lot.id)
    setInventoryStatus(`Scanned ${lot.lotNumber}`)
    setScannerOpen(false)
  }, [lots])

  function printWeightSheet() {
    if (!selectedLot || !selectedMaterial) {
      return
    }
    const printed = openPrintDocument(
      `Weight sheet ${selectedLot.lotNumber}`,
      `<main class="sheet"><header class="header"><div><div class="brand">OlfactoryOps</div>
        <div class="muted">Controlled material weighing record</div></div><div class="tag">WEIGHT SHEET</div></header>
        <section class="grid"><div class="field"><strong>Material</strong>${escapePrintHtml(selectedMaterial.name)}</div>
        <div class="field"><strong>CAS</strong>${escapePrintHtml(selectedMaterial.cas)}</div>
        <div class="field"><strong>Lot number</strong>${escapePrintHtml(selectedLot.lotNumber)}</div>
        <div class="field"><strong>Available at print</strong>${escapePrintHtml(formatGrams(selectedLot.quantityGrams - selectedLot.reservedGrams))}</div>
        <div class="field"><strong>Expiry</strong>${escapePrintHtml(selectedLot.expiryDate)}</div>
        <div class="field"><strong>Storage location</strong>${escapePrintHtml(selectedLot.location)}</div></section>
        <table><thead><tr><th>Line</th><th>Target g</th><th>Tare g</th><th>Actual g</th><th>Net g</th><th>Deviation</th></tr></thead>
        <tbody>${[1, 2, 3, 4].map((line) => `<tr><td>${line}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}</tbody></table>
        <section class="grid"><div class="field"><strong>Batch / formula</strong></div><div class="field"><strong>Equipment ID</strong></div>
        <div class="field"><strong>Weighed by</strong></div><div class="field"><strong>Timestamp</strong></div></section>
        <section class="signatures"><div class="signature">Prepared by</div><div class="signature">Checked by</div><div class="signature">QA release</div></section></main>`,
    )
    setInventoryStatus(printed ? `Weight sheet opened for ${selectedLot.lotNumber}` : 'Allow pop-ups to print the weight sheet')
  }

  async function loadLotGenealogy() {
    if (!selectedLot) {
      return
    }
    try {
      const payload = await requestApi<LotGenealogyResponse>(`/lots/${encodeURIComponent(selectedLot.id)}/genealogy`)
      setGenealogy(payload)
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Genealogy lookup failed')
    }
  }

  async function generateShoppingList() {
    try {
      const payload = await requestApi<InventoryReorderResponse>('/inventory/reorder-suggestions')
      setReorderSuggestions(payload.suggestions)
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Shopping list generation failed')
    }
  }

  async function loadAgingReport() {
    try {
      const payload = await requestApi<InventoryAgingResponse>('/inventory/aging-report')
      setAgingRecords(payload.records)
      setAgingSummary(payload.summary)
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Inventory aging report failed')
    }
  }

  async function refreshExpiry() {
    try {
      const payload = await requestApi<InventoryExpiryResponse>('/inventory/expiry/refresh', { method: 'POST' })
      if (payload.expiredLotIds.length > 0) {
        const expiredIds = new Set(payload.expiredLotIds)
        onLotsChange((current) => current.map((lot) => expiredIds.has(lot.id) ? { ...lot, qualityStatus: 'EXPIRED' } : lot))
      }
      setInventoryStatus(payload.invariant)
      await loadAgingReport()
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Expiry refresh failed')
    }
  }

  async function completeTransitTransfer() {
    if (!selectedLot?.inTransitToLocation) {
      return
    }
    try {
      const payload = await requestApi<InventoryTransferResponse>(`/inventory/transfers/${encodeURIComponent(selectedLot.id)}/complete`, {
        method: 'POST',
      })
      upsertLot(payload.lot)
      prependMovement(payload.movement)
      setInventoryStatus(payload.invariant)
      await loadAgingReport()
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Transfer completion failed')
    }
  }

  async function writeOffSelectedLot() {
    if (!selectedLot || writeOffGrams <= 0 || !writeOffReason.trim()) {
      return
    }
    const payloadBody = { lotId: selectedLot.id, quantityGrams: writeOffGrams, reason: writeOffReason.trim() }
    try {
      if (!canAdjustInventory) {
        await onRequestInventoryApproval(
          'inventory.adjust',
          payloadBody,
          `Write off ${formatGrams(writeOffGrams)} from ${selectedLot.lotNumber}: ${writeOffReason.trim()}`,
        )
        setInventoryStatus(`${selectedLot.lotNumber} write-off is pending admin approval`)
        return
      }
      const payload = await requestApi<InventoryWriteOffResponse>('/inventory/write-offs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
      })
      upsertLot(payload.lot)
      prependMovement(payload.movement)
      setWriteOffGrams(0)
      setWriteOffReason('')
      setInventoryStatus(payload.invariant)
      await loadAgingReport()
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Write-off failed')
    }
  }

  return (
    <div className="workspace-grid inventory-grid">
      <Panel
        title="Stock Summary"
        icon={Boxes}
        right={
          <div className="action-row">
            <button className="primary-button" type="button" onClick={onReceiveStock}>
              <Plus size={15} />
              Create New
            </button>
            <button className="ghost-button small" type="button" onClick={onAdjustStock}>
              Adjust Stock
            </button>
            <button className="ghost-button small" type="button" onClick={onTransferStock}>
              Transfer Lot
            </button>
          </div>
        }
      >
        <div className="stock-grid">
          {stock.map((item) => (
            <div className="stock-card" key={item.material.id}>
              <div>
                <strong>{item.material.name}</strong>
                <span>{item.material.family}</span>
              </div>
              <div className="mono-value">{formatGrams(item.available)}</div>
              <span>current {formatGrams(item.current)} / reserved {formatGrams(item.reserved)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Inventory Operations" icon={ClipboardCheck} right={<DataTag label="Status" value={inventoryStatus} tone="blue" />}>
        {selectedLot ? (
          <div className="inventory-ops">
            <label className="field-row wide-field">
              <span>Active lot</span>
              <select
                aria-label="Inventory active lot"
                value={selectedLot.id}
                onChange={(event) => setSelectedLotId(event.target.value)}
              >
                {lots.map((lot) => {
                  const material = materialRecords.find((item) => item.id === lot.materialId)
                  return (
                    <option key={lot.id} value={lot.id}>
                      {lot.lotNumber} / {material?.name ?? lot.materialId} / {lot.qualityStatus}
                    </option>
                  )
                })}
              </select>
            </label>
            <div className="lot-detail-card">
              <div className="lot-detail-identity">
                <strong>{selectedLot.lotNumber}</strong>
                <span>{selectedMaterial?.name ?? selectedLot.materialId}</span>
              </div>
              <div className="lot-detail-tags">
                <DataTag label="Qty" value={formatGrams(selectedLot.quantityGrams)} />
                <DataTag label="Reserved" value={formatGrams(selectedLot.reservedGrams)} />
                <DataTag label="Expiry" value={selectedLot.expiryDate} tone="amber" />
                <DataTag label="Location" value={selectedLot.location} tone="blue" />
                {selectedLot.inTransitToLocation ? (
                  <DataTag label="Transit to" value={selectedLot.inTransitToLocation} tone="amber" />
                ) : null}
                <DataTag label="Supplier" value={selectedLot.supplierLotRef ?? 'Not set'} />
                <DataTag label="Retest" value={selectedLot.retestDate ?? 'Not set'} />
              </div>
            </div>

            <div className="inventory-form-grid">
              <label className="field-row">
                <span>QC status</span>
                <select
                  aria-label="Lot quality status"
                  value={qualityStatus}
                  onChange={(event) => setQualityStatus(event.target.value as LotQualityStatus)}
                >
                  <option value="APPROVED">APPROVED - eligible</option>
                  <option value="QUARANTINE">QUARANTINE - receiving hold</option>
                  <option value="ON_HOLD">ON_HOLD - retest</option>
                  <option value="REJECTED">REJECTED - blocked</option>
                  <option value="EXPIRED">EXPIRED - blocked</option>
                </select>
              </label>
              <label className="field-row">
                <span>QC reason</span>
                <input
                  aria-label="Lot quality reason"
                  value={qualityReason}
                  onChange={(event) => setQualityReason(event.target.value)}
                />
              </label>
              <button className="primary-button" type="button" onClick={() => void updateLotQuality()}>
                {canReceiveInventory ? 'Update QC' : 'Request QC Approval'}
              </button>
            </div>

            <div className="inventory-form-grid">
              <label className="field-row">
                <span>Counted grams</span>
                <input
                  aria-label="Stock take counted grams"
                  min={0}
                  step={0.1}
                  type="number"
                  value={stockTakeCount}
                  onChange={(event) => setStockTakeCount(Number(event.target.value))}
                />
              </label>
              <label className="field-row">
                <span>Count reason</span>
                <input
                  aria-label="Stock take reason"
                  value={stockTakeReason}
                  onChange={(event) => setStockTakeReason(event.target.value)}
                />
              </label>
              <button className="primary-button" type="button" onClick={() => void reconcileStockTake()}>
                {canAdjustInventory ? 'Stock Take' : 'Request Stock Take Approval'}
              </button>
            </div>

            <div className="action-row">
              <button className="ghost-button small" type="button" onClick={() => void printLotLabel()}>
                Print QR Label
              </button>
              <button className="ghost-button small" type="button" onClick={() => setScannerOpen(true)}>
                Scan QR
              </button>
              <button className="ghost-button small" type="button" onClick={printWeightSheet}>
                Print Weight Sheet
              </button>
              <button className="ghost-button small" type="button" onClick={() => void loadLotGenealogy()}>
                View Genealogy
              </button>
              {selectedLot.inTransitToLocation ? (
                <button className="primary-button small" type="button" onClick={() => void completeTransitTransfer()}>
                  Complete Transit
                </button>
              ) : null}
            </div>

            <div className="inventory-form-grid">
              <label className="field-row">
                <span>Write-off grams</span>
                <input
                  aria-label="Inventory write-off grams"
                  min={0.001}
                  max={Math.max(0, selectedLot.quantityGrams - selectedLot.reservedGrams)}
                  step={0.001}
                  type="number"
                  value={writeOffGrams || ''}
                  onChange={(event) => setWriteOffGrams(Number(event.target.value))}
                />
              </label>
              <label className="field-row">
                <span>Disposal reason</span>
                <input
                  aria-label="Inventory write-off reason"
                  value={writeOffReason}
                  onChange={(event) => setWriteOffReason(event.target.value)}
                  placeholder="Leak, damage, sample disposal..."
                />
              </label>
              <button
                className="ghost-button small"
                type="button"
                onClick={() => void writeOffSelectedLot()}
                disabled={writeOffGrams <= 0 || !writeOffReason.trim() || writeOffGrams > selectedLot.quantityGrams - selectedLot.reservedGrams}
              >
                {canAdjustInventory ? 'Record Write-off' : 'Request Write-off Approval'}
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state">No inventory lots are available yet.</div>
        )}
      </Panel>

      <Panel title="Storage Locations" icon={PackageSearch}>
        <div className="inventory-form-grid">
          <label className="field-row">
            <span>New location</span>
            <input
              aria-label="New storage location name"
              value={newLocationName}
              onChange={(event) => setNewLocationName(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Zone</span>
            <input
              aria-label="New storage location zone"
              value={newLocationZone}
              onChange={(event) => setNewLocationZone(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Capacity grams</span>
            <input
              aria-label="New storage location capacity"
              min={1}
              type="number"
              value={newLocationCapacity}
              onChange={(event) => setNewLocationCapacity(Number(event.target.value))}
            />
          </label>
          <label className="field-row">
            <span>Location type</span>
            <select
              aria-label="New storage location type"
              value={newLocationKind}
              onChange={(event) => setNewLocationKind(event.target.value as NonNullable<StorageLocation['kind']>)}
            >
              {(['Warehouse', 'Room', 'Shelf', 'Bin', 'Transit'] as const).map((kind) => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Parent location</span>
            <select
              aria-label="New storage location parent"
              value={newLocationParentId}
              onChange={(event) => setNewLocationParentId(event.target.value)}
            >
              <option value="">No parent</option>
              {storageLocations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => void createLocation()} disabled={!newLocationName.trim() || newLocationCapacity <= 0}>
            New Location
          </button>
        </div>
        <div className="material-list">
          {storageLocations.slice(0, 8).map((location) => {
            const storedGrams = lots
              .filter((lot) => lot.location === location.name)
              .reduce((sum, lot) => sum + lot.quantityGrams, 0)
            const capacityPercent = location.capacityGrams > 0 ? Math.min(100, Math.round((storedGrams / location.capacityGrams) * 100)) : 0
            const parent = location.parentId ? storageLocations.find((candidate) => candidate.id === location.parentId) : undefined
            return (
              <div className="material-row static" key={location.id}>
                <div>
                  <strong>{location.name}</strong>
                  <span>{location.zone} / {location.kind ?? 'Location'} / {parent ? `within ${parent.name}` : 'root'}</span>
                </div>
                <div className="mono-value">{formatGrams(storedGrams)} / {capacityPercent}%</div>
                <StatusBadge status={location.status === 'IN_TRANSIT' ? 'review' : 'stable'} label={location.status ?? 'ACTIVE'} />
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel
        title="Aging, Expiry & Dead Stock"
        icon={Activity}
        right={
          <div className="action-row">
            <button className="ghost-button small" type="button" onClick={() => void loadAgingReport()}>Refresh report</button>
            <button className="ghost-button small" type="button" onClick={() => void refreshExpiry()} disabled={!canReceiveInventory}>Refresh expiry</button>
          </div>
        }
      >
        <div className="tag-row">
          <DataTag label="Dead stock" value={agingSummary ? formatGrams(agingSummary.deadStockGrams) : 'Not loaded'} tone="amber" />
          <DataTag label="Expired / retest" value={agingSummary ? formatGrams(agingSummary.expiringOrExpiredGrams) : 'Not loaded'} tone="blue" />
        </div>
        <div className="material-list">
          {agingRecords.length === 0 ? (
            <div className="empty-state compact">Run the report to review aging, retest, expiry, and in-transit exposure without changing stock.</div>
          ) : (
            agingRecords.slice(0, 8).map((record) => (
              <div className="material-row static" key={record.lotId}>
                <div>
                  <strong>{record.materialName} / {record.lotNumber}</strong>
                  <span>{record.reason}</span>
                </div>
                <div className="mono-value">{formatGrams(record.quantityGrams)} / {record.agingDays}d</div>
                <StatusBadge
                  status={record.status === 'EXPIRED' ? 'alert' : record.status === 'DEAD_STOCK' || record.status === 'RETEST_DUE' ? 'review' : 'stable'}
                  label={record.status.replace('_', ' ')}
                />
              </div>
            ))
          )}
        </div>
      </Panel>

      <QrLotScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={selectScannedLot}
      />

      {showInventoryLotComplianceReview ? (
      <Panel className="wide" title="SDS / CoA Review" icon={FileLock2}>
        {selectedLot ? (
          <>
            <div className="tag-row">
              <DataTag label="Lot" value={selectedLot.lotNumber} tone="blue" />
              <DataTag label="Material" value={selectedMaterial?.name ?? selectedLot.materialId} />
              <DataTag label="Review" value={`${inventoryLotComplianceDocuments.filter((doc) => doc.status === 'REVIEW_REQUIRED').length}`} tone="amber" />
              <DataTag label="Queued" value={`${inventoryLotComplianceDocuments.length}`} />
            </div>
            <div className="document-list compact-list">
              {inventoryLotComplianceDocuments.length === 0 ? (
                <div className="empty-state compact">
                  <strong>No SDS / CoA documents available for this lot yet.</strong>
                  <span>Attach SDS and CoA while receiving stock; this review queue is the document entry point for inventory.</span>
                </div>
              ) : (
                inventoryLotComplianceDocuments.map((document) => (
                  <div className="document-row" key={document.id}>
                    <span className="mono-value">{document.id}</span>
                      <div className="document-main">
                        <strong>{document.title}</strong>
                        <span>
                          {document.type} / {document.status} / {document.sizeKb}KB
                        </span>
                      </div>
                      <DataTag label={document.type} value={document.linkedTo} />
                      <StatusBadge
                        status={
                          document.status === 'REVIEW_REQUIRED'
                            ? 'review'
                            : document.status === 'APPROVED'
                              ? 'stable'
                              : document.status === 'EXPIRED'
                                ? 'alert'
                                : document.status === 'EXPIRING'
                                  ? 'testing'
                                  : document.status === 'SHARED'
                                    ? 'stable'
                                    : 'draft'
                        }
                        label={document.status}
                      />
                    <button
                      className="ghost-button small"
                      type="button"
                      onClick={() => void openLotComplianceDocument(document.id)}
                    >
                      View
                    </button>
                    <button
                      className="primary-button small"
                      type="button"
                      onClick={() => void approveLotComplianceDocument(document.id)}
                      disabled={document.status !== 'REVIEW_REQUIRED' || !canManageDocuments || approvingLotDocumentId === document.id}
                    >
                      {approvingLotDocumentId === document.id ? 'Approving' : 'Approve'}
                    </button>
                  </div>
                ))
              )}
            </div>
            {!canManageDocuments ? (
              <div className="empty-state compact">Document approval requires documents.manage permission.</div>
            ) : null}
            <div className="policy-list compact">
              <li>{lotDocumentStatus}</li>
            </div>
          </>
        ) : (
          <div className="empty-state compact">Select a lot to review SDS / CoA documents.</div>
        )}
      </Panel>
      ) : null}

      <Panel title="Labels, Genealogy & Shopping List" icon={ShoppingCart}>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={() => void generateShoppingList()}>
            Generate Shopping List
          </button>
          {selectedLocation && <DataTag label="Storage" value={selectedLocation.condition} tone="blue" />}
        </div>
        {labelPayload && (
          <div className="label-preview-card">
            <strong>{labelPayload.materialName}</strong>
            <span>{labelPayload.lotNumber} / {labelPayload.storageText}</span>
            <code>{labelPayload.qrValue}</code>
          </div>
        )}
        {genealogy && (
          <div className="genealogy-list">
            <div className="genealogy-row">
              <strong>{genealogy.material.name}</strong>
              <span>{genealogy.eligibility} / aging {genealogy.agingDays}d</span>
            </div>
            <div className="genealogy-row">
              <strong>Ledger events</strong>
              <span>{genealogy.movements.length} movement(s), {genealogy.documents.length} document(s)</span>
            </div>
            {genealogy.downstreamRefs.slice(0, 3).map((ref) => (
              <div className="genealogy-row" key={`${ref.ref}-${ref.at}`}>
                <strong>{ref.type}</strong>
                <span>{ref.ref} / {formatGrams(ref.quantityGrams)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="shopping-list">
          {reorderSuggestions.length === 0 ? (
            <div className="empty-state compact">No reorder suggestions generated yet.</div>
          ) : (
            reorderSuggestions.slice(0, 5).map((suggestion) => (
              <div className="shopping-row" key={suggestion.materialId}>
                <div>
                  <strong>{suggestion.materialName}</strong>
                  <span>{suggestion.reason}</span>
                </div>
                <span className="mono-value">{formatGrams(suggestion.suggestedOrderGrams)}</span>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel
        className="wide"
        title="Lots"
        icon={PackageCheck}
        right={
          <div className="action-row">
            <button className="ghost-button small" type="button" onClick={onReceiveStock}>
              Receive Stock
            </button>
            <button className="ghost-button small" type="button" onClick={onAdjustStock}>
              Adjust
            </button>
            <button className="ghost-button small" type="button" onClick={onTransferStock}>
              Transfer
            </button>
          </div>
        }
      >
        <div className="lot-table">
          {lots.map((lot) => {
            const material = materialRecords.find((item) => item.id === lot.materialId)
            return (
              <div className="lot-row" key={lot.id}>
                <div>
                  <strong>{lot.lotNumber}</strong>
                  <span>{material?.name} / {lot.location}</span>
                </div>
                <StatusBadge status={lot.qualityStatus === 'APPROVED' ? 'stable' : 'review'} label={lot.qualityStatus} />
                <span className="mono-value">{formatGrams(lot.quantityGrams)}</span>
                <span className="mono-value">reserved {formatGrams(lot.reservedGrams)}</span>
                <span className="mono-value">{lot.expiryDate}</span>
                <button className="ghost-button tiny" type="button" onClick={() => setSelectedLotId(lot.id)}>
                  Select
                </button>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel className="wide" title="Stock Take Evidence" icon={ClipboardCheck}>
        <div className="movement-table">
          {stockTakeRecords.length === 0 ? (
            <div className="empty-state">No stock take records synced yet.</div>
          ) : (
            stockTakeRecords.slice(0, 5).map((record) => (
              <div className="movement-row" key={record.id}>
                <span className="mono-value">{record.id}</span>
                <div>
                  <strong>{record.lotNumber}</strong>
                  <span>{record.reason}</span>
                </div>
                <StatusBadge status={record.status === 'MATCHED' ? 'stable' : 'review'} label={record.status} />
                <span className="mono-value">expected {formatGrams(record.expectedGrams)}</span>
                <span className="mono-value">counted {formatGrams(record.countedGrams)}</span>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel className="wide" title="Immutable Movement Ledger" icon={Database}>
        <MovementTable movements={movements} materialRecords={materialRecords} />
      </Panel>
    </div>
  )
})

const LabUsageWorkspace = memo(function LabUsageWorkspace({
  publishedFormulas,
  selectedFormulaId,
  setSelectedFormulaId,
  selectedFormula,
  hasPublishedFormula,
  labPlan,
  batchGrams,
  setBatchGrams,
  usageHistory,
  weighingSession,
  actualWeights,
  onActualWeightChange,
  weighingTolerancePercent,
  setWeighingTolerancePercent,
  weighingOperator,
  setWeighingOperator,
  labUsagePurpose,
  setLabUsagePurpose,
  labUsageProjectCode,
  setLabUsageProjectCode,
  labUsageSampleCode,
  setLabUsageSampleCode,
  statusMessage,
  busy,
  weighingReady,
  onUseTargetWeights,
  onCommit,
  onReverse,
}: {
  publishedFormulas: Formula[]
  selectedFormulaId: string
  setSelectedFormulaId: (id: string) => void
  selectedFormula: Formula
  hasPublishedFormula: boolean
  labPlan: ReturnType<typeof planLabUsage>
  batchGrams: number
  setBatchGrams: (value: number) => void
  usageHistory: UsageRecord[]
  weighingSession: LabWeighingSession
  actualWeights: Record<string, number>
  onActualWeightChange: (key: string, value: number) => void
  weighingTolerancePercent: number
  setWeighingTolerancePercent: (value: number) => void
  weighingOperator: string
  setWeighingOperator: (value: string) => void
  labUsagePurpose: LabUsagePurpose
  setLabUsagePurpose: (value: LabUsagePurpose) => void
  labUsageProjectCode: string
  setLabUsageProjectCode: (value: string) => void
  labUsageSampleCode: string
  setLabUsageSampleCode: (value: string) => void
  statusMessage: string
  busy: boolean
  weighingReady: boolean
  onUseTargetWeights: () => void
  onCommit: () => void
  onReverse: (usageId?: string, allocations?: LabUsageReversalAllocation[]) => void
}) {
  const latestCommitted = usageHistory.find(
    (usage) => usage.status === 'COMMITTED' || usage.status === 'PARTIALLY_REVERSED',
  )
  const reversalIdentity = `${latestCommitted?.id ?? 'none'}:${latestCommitted?.reversalMovements?.length ?? 0}`
  const [reversalDraft, setReversalDraft] = useState<Record<string, string>>({})
  const remainingReversalLines = useMemo(() => {
    if (!latestCommitted) {
      return []
    }
    const reversedByAllocation = new Map<string, number>()
    latestCommitted.reversalMovements?.forEach((movement) => {
      const key = `${movement.materialId}:${movement.lotId}`
      reversedByAllocation.set(key, (reversedByAllocation.get(key) ?? 0) + movement.quantityGrams)
    })
    return latestCommitted.allocations
      .map((allocation) => ({
        ...allocation,
        remainingGrams: Math.max(
          0,
          allocation.allocatedGrams - (reversedByAllocation.get(`${allocation.materialId}:${allocation.lotId}`) ?? 0),
        ),
      }))
      .filter((allocation) => allocation.remainingGrams > 0.0001)
  }, [latestCommitted])
  useEffect(() => {
    setReversalDraft(
      Object.fromEntries(
        remainingReversalLines.map((allocation) => [
          allocationKey(allocation),
          Number(allocation.remainingGrams.toFixed(3)).toString(),
        ]),
      ),
    )
  }, [reversalIdentity, remainingReversalLines])
  const selectedReversalAllocations = remainingReversalLines.flatMap((allocation) => {
    const grams = Number(reversalDraft[allocationKey(allocation)] ?? 0)
    if (!Number.isFinite(grams) || grams <= 0) {
      return []
    }
    return [{ materialId: allocation.materialId, lotId: allocation.lotId, grams }]
  })
  const actualTotal = weighingSession.lines.reduce((sum, line) => sum + line.actualGrams, 0)
  const maxDeviation = weighingSession.lines.reduce((max, line) => Math.max(max, line.deviationPercent), 0)
  const printWeighingSheet = () => {
    const rows = weighingSession.lines
      .map(
        (line) => `<tr><td>${escapePrintHtml(line.materialName)}</td><td>${escapePrintHtml(line.lotNumber)}</td><td>${formatGrams(line.targetGrams)}</td><td>${formatGrams(line.actualGrams)}</td><td>${line.deviationPercent.toFixed(2)}%</td><td></td></tr>`,
      )
      .join('')
    openPrintDocument(
      `Weighing sheet ${weighingSession.formulaCode}`,
      `<div class="sheet"><div class="header"><div><div class="brand">OlfactoryOps</div><div class="muted">Controlled lab weighing sheet</div></div><div class="tag">${escapePrintHtml(weighingSession.status)}</div></div><div class="grid"><div class="field"><strong>Formula</strong>${escapePrintHtml(selectedFormula.name)} (${escapePrintHtml(weighingSession.formulaCode)})</div><div class="field"><strong>Target batch</strong>${formatGrams(weighingSession.targetBatchGrams)}</div><div class="field"><strong>Operator</strong>${escapePrintHtml(weighingSession.operator)}</div><div class="field"><strong>Tolerance</strong>${weighingSession.tolerancePercent.toFixed(2)}%</div></div><table><thead><tr><th>Material</th><th>Lot</th><th>Target</th><th>Actual</th><th>Deviation</th><th>Initials</th></tr></thead><tbody>${rows}</tbody></table><div class="signatures"><div class="signature">Weighed by</div><div class="signature">Reviewed by</div><div class="signature">Date / time</div></div></div>`,
    )
  }

  return (
    <div className="workspace-grid lab-grid">
      <Panel
        title="Inventory Usage Preview"
        icon={ClipboardCheck}
        right={<DataTag label="Formula" value={weighingSession.formulaCode} />}
      >
        <div className="lab-usage-formula-picker">
          <label className="field-row">
            <span>Published formula</span>
            <select
              aria-label="Published formula for lab usage"
              value={selectedFormulaId}
              onChange={(event) => setSelectedFormulaId(event.target.value)}
              disabled={!hasPublishedFormula}
            >
              {!hasPublishedFormula ? <option value="">No published formulas available</option> : null}
              {publishedFormulas.map((formula) => (
                <option key={formula.id} value={formula.id}>
                  {formula.code} / {formula.name} / {formula.version}
                </option>
              ))}
            </select>
          </label>
          {hasPublishedFormula ? (
            <div className="lab-usage-formula-summary">
              <strong>{selectedFormula.name}</strong>
              <span>
                {selectedFormula.formulaType === 'ACCORD' ? 'Accord' : 'Fine fragrance'} / published{' '}
                {selectedFormula.lockedVersion ?? selectedFormula.version}
              </span>
            </div>
          ) : (
            <div className="empty-state compact">Publish and approve a formula before recording material usage.</div>
          )}
        </div>
        <label className="slider-row">
          <span>Batch grams</span>
          <input
            min={5}
            max={40}
            step={0.5}
            type="range"
            value={batchGrams}
            onChange={(event) => setBatchGrams(Number(event.target.value))}
          />
          <strong className="mono-value">{formatGrams(batchGrams)}</strong>
        </label>
        <UsagePreview allocations={labPlan.allocations} shortfalls={labPlan.shortfalls} />
        <div className="empty-state compact">
          <strong>Inventory movement log</strong>
          <span>
            Actual weights post immutable <code>LAB_CONSUMPTION</code> movements against the allocated inventory lots.
          </span>
          <span>{statusMessage}</span>
        </div>
        <div className="action-row">
          <button
            className="primary-button"
            type="button"
            onClick={onCommit}
            disabled={!hasPublishedFormula || !weighingReady || busy}
          >
            <Play size={16} />
            {busy ? 'Working' : 'Post inventory usage'}
          </button>
          <button className="ghost-button" type="button" onClick={() => onReverse(latestCommitted?.id)} disabled={!latestCommitted || busy}>
            <RotateCcw size={16} />
            Reverse latest
          </button>
        </div>
      </Panel>

      <Panel
        title="Actual Weighing Session"
        icon={Beaker}
        right={
          <StatusBadge
            status={weighingSession.status === 'READY' ? 'stable' : 'review'}
            label={weighingSession.status}
          />
        }
      >
        <div className="weighing-controls">
          <label className="field-row">
            <span>Operator</span>
            <input
              aria-label="Weighing operator"
              value={weighingOperator}
              onChange={(event) => setWeighingOperator(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Tolerance %</span>
            <input
              aria-label="Weighing tolerance percent"
              min={0}
              step={0.1}
              type="number"
              value={weighingTolerancePercent}
              onChange={(event) => setWeighingTolerancePercent(Number(event.target.value))}
            />
          </label>
          <button className="ghost-button small" type="button" onClick={onUseTargetWeights}>
            Use target weights
          </button>
          <button className="ghost-button small" type="button" onClick={printWeighingSheet} disabled={!hasPublishedFormula}>
            Print weighing sheet
          </button>
        </div>
        <div className="form-grid">
          <label className="field-row">
            <span>Purpose</span>
            <select
              aria-label="Lab usage purpose"
              value={labUsagePurpose}
              onChange={(event) => setLabUsagePurpose(event.target.value as LabUsagePurpose)}
            >
              <option value="trial">Trial</option>
              <option value="sample">Sample</option>
              <option value="production-prep">Production prep</option>
              <option value="qc">QC</option>
              <option value="waste">Waste</option>
            </select>
          </label>
          <label className="field-row">
            <span>Project code</span>
            <input
              aria-label="Lab usage project code"
              value={labUsageProjectCode}
              onChange={(event) => setLabUsageProjectCode(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Sample code</span>
            <input
              aria-label="Lab usage sample code"
              value={labUsageSampleCode}
              onChange={(event) => setLabUsageSampleCode(event.target.value)}
            />
          </label>
        </div>

        <div className="weighing-table">
          {weighingSession.lines.length === 0 ? (
            <div className="empty-state">No eligible allocations to weigh yet.</div>
          ) : (
            weighingSession.lines.map((line) => {
              const key = allocationKey(line)
              return (
                <label className="weighing-row" key={key}>
                  <div>
                    <strong>{line.materialName}</strong>
                    <span>
                      {line.lotNumber} / target {formatGrams(line.targetGrams)}
                    </span>
                  </div>
                  <input
                    aria-label={`Actual grams for ${line.materialName} ${line.lotNumber}`}
                    min={0}
                    step={0.001}
                    type="number"
                    value={actualWeights[key] ?? line.actualGrams}
                    onChange={(event) => onActualWeightChange(key, Number(event.target.value))}
                  />
                  <span className={`deviation-pill ${line.withinTolerance ? 'is-ok' : 'is-alert'}`}>
                    {line.deviationPercent.toFixed(2)}%
                  </span>
                </label>
              )
            })
          )}
        </div>

        <div className="weighing-summary">
          <DataTag label="Actual total" value={formatGrams(actualTotal)} tone="blue" />
          <DataTag label="Max deviation" value={`${maxDeviation.toFixed(2)}%`} tone={weighingReady ? 'green' : 'amber'} />
        </div>
      </Panel>

      <Panel title="Controlled Reversal" icon={RotateCcw}>
        {!latestCommitted ? (
          <div className="empty-state compact">No committed lab usage has remaining grams to reverse.</div>
        ) : (
          <>
            <div className="empty-state compact">
              <strong>{latestCommitted.id}</strong>
              <span>Return only the actual grams selected below. The original consumption remains immutable.</span>
            </div>
            <div className="weighing-table">
              {remainingReversalLines.map((allocation) => {
                const key = allocationKey(allocation)
                return (
                  <label className="weighing-row" key={key}>
                    <div>
                      <strong>{allocation.materialName}</strong>
                      <span>{allocation.lotNumber} / remaining {formatGrams(allocation.remainingGrams)}</span>
                    </div>
                    <input
                      aria-label={`Reverse grams for ${allocation.materialName} ${allocation.lotNumber}`}
                      min={0}
                      max={allocation.remainingGrams}
                      step={0.001}
                      type="number"
                      value={reversalDraft[key] ?? ''}
                      onChange={(event) => setReversalDraft((current) => ({ ...current, [key]: event.target.value }))}
                    />
                    <span className="deviation-pill">{formatGrams(allocation.remainingGrams)}</span>
                  </label>
                )
              })}
            </div>
            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={() => onReverse(latestCommitted.id, selectedReversalAllocations)}
                disabled={busy || selectedReversalAllocations.length === 0}
              >
                Reverse selected
              </button>
              <button className="ghost-button" type="button" onClick={() => onReverse(latestCommitted.id)} disabled={busy}>
                Reverse all remaining
              </button>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Inventory Movement History" icon={Activity}>
        <div className="history-list">
          {usageHistory.length === 0 ? (
            <div className="empty-state">No lab inventory movements recorded in this workspace.</div>
          ) : (
            usageHistory.map((usage) => (
              <div className="history-row" key={usage.id}>
                <div>
                  <strong>{usage.id}</strong>
                  <span>
                    {usage.formulaCode} / {formatGrams(usage.batchGrams)}
                    {' / LAB_CONSUMPTION'}
                    {usage.purpose ? ` / ${usage.purpose}` : ''}
                    {usage.sampleCode ? ` / ${usage.sampleCode}` : ''}
                    {usage.weighingSession
                      ? ` / actual ${formatGrams(
                          usage.weighingSession.lines.reduce((sum, line) => sum + line.actualGrams, 0),
                        )}`
                      : ''}
                  </span>
                </div>
                <StatusBadge status={usage.status === 'COMMITTED' ? 'stable' : 'review'} label={usage.status} />
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  )
})

function DocumentsWorkspace() {
  const [documentRows, setDocumentRows] = useState<DocumentRecord[]>([])
  const [dashboard, setDashboard] = useState<DocumentComplianceDashboard>(clientFallbackDocumentDashboard)
  const [downloadAudits, setDownloadAudits] = useState<AuditEvent[]>([])
  const [downloadResult, setDownloadResult] = useState<DocumentDownloadResponse | null>(null)
  const [shareResult, setShareResult] = useState<DocumentShareResponse | null>(null)
  const [loadingDocumentId, setLoadingDocumentId] = useState<string | null>(null)
  const [approvingDocumentId, setApprovingDocumentId] = useState<string | null>(null)
  const [sharingDocumentId, setSharingDocumentId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [documentSearch, setDocumentSearch] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadType, setUploadType] = useState<DocumentType>('SDS')
  const [uploadTarget, setUploadTarget] = useState(materials[0]?.id ?? '')
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadTags, setUploadTags] = useState('')
  const [uploadSensitivity, setUploadSensitivity] = useState<DocumentRecord['sensitivity']>('Confidential')
  const [versions, setVersions] = useState<DocumentRecord[]>([])
  const [versionsTitle, setVersionsTitle] = useState('')
  const [scanningDocumentId, setScanningDocumentId] = useState<string | null>(null)
  const [archivingDocumentId, setArchivingDocumentId] = useState<string | null>(null)
  const [generationType, setGenerationType] = useState<DocumentType>('CoA')
  const [generationTarget, setGenerationTarget] = useState(initialLots[0]?.id ?? '')
  const [shareRecipient, setShareRecipient] = useState('client@example.com')
  const [statusMessage, setStatusMessage] = useState('Live API sync pending')
  const selectedGenerationOption = generatedDocumentTypes.find((option) => option.value === generationType)
  const generationTargets = useMemo(() => {
    if (selectedGenerationOption?.targetScope === 'formula') {
      return formulas.map((formula) => ({ id: formula.id, label: `${formula.code} ${formula.name}` }))
    }
    if (selectedGenerationOption?.targetScope === 'order') {
      return []
    }
    return initialLots.map((lot) => ({ id: lot.id, label: `${lot.lotNumber} ${lot.qualityStatus}` }))
  }, [selectedGenerationOption?.targetScope])
  const uploadTargets = useMemo(
    () => [
      ...materials.map((material) => ({ id: material.id, label: `Material / ${material.name}` })),
      ...initialLots.map((lot) => ({ id: lot.id, label: `Lot / ${lot.lotNumber}` })),
      ...formulas.map((formula) => ({ id: formula.id, label: `Formula / ${formula.code} ${formula.name}` })),
    ],
    [],
  )

  useEffect(() => {
    if (!generationTargets.some((target) => target.id === generationTarget)) {
      setGenerationTarget(generationTargets[0]?.id ?? '')
    }
  }, [generationTarget, generationTargets])

  useEffect(() => {
    const controller = new AbortController()

    async function loadDocuments() {
      try {
        const [documentsPayload, auditPayload, dashboardPayload] = await Promise.all([
          requestApi<DocumentRecord[]>('/documents', { signal: controller.signal }),
          requestApi<AuditEvent[]>('/documents/download-audit', { signal: controller.signal }),
          requestApi<DocumentComplianceDashboard>('/documents/compliance-dashboard', { signal: controller.signal }),
        ])

        setDocumentRows(documentsPayload)
        setDownloadAudits(auditPayload)
        setDashboard(dashboardPayload)
        setStatusMessage('Synced from live Documents API')
      } catch {
        if (!controller.signal.aborted) {
          setStatusMessage('Using local seed until Documents API is reachable')
        }
      }
    }

    void loadDocuments()

    return () => controller.abort()
  }, [])

  async function requestSignedUrl(documentId: string) {
    setLoadingDocumentId(documentId)
    setStatusMessage('Checking permission before signing URL')

    try {
      const payload = await requestApi<DocumentDownloadResponse>(`/documents/${encodeURIComponent(documentId)}/signed-url`, {
        method: 'POST',
      })
      setDocumentRows((current) =>
        current.map((document) => (document.id === documentId ? payload.document : document)),
      )
      setDownloadAudits((current) => [payload.audit, ...current.filter((event) => event.id !== payload.audit.id)])
      setDownloadResult(payload)
      const opened = window.open(payload.signedUrl.url, '_blank', 'noopener,noreferrer')
      setStatusMessage(opened ? 'Signed URL opened and download audit recorded' : 'Signed URL issued; allow pop-ups or use the access card below')
    } catch {
      setStatusMessage('Could not sign URL from API; permission gate or server unavailable')
    } finally {
      setLoadingDocumentId(null)
    }
  }

  async function searchDocuments() {
    setStatusMessage('Searching tenant document metadata')
    try {
      const payload = await requestApi<DocumentSearchResponse>(`/documents/search?q=${encodeURIComponent(documentSearch)}`)
      setDocumentRows(payload.documents)
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Document search failed')
    }
  }

  async function uploadDocument() {
    if (!uploadFile || !uploadTarget) {
      return
    }
    setUploading(true)
    setStatusMessage('Uploading to private document storage and queuing review')
    try {
      const formData = new FormData()
      formData.set('file', uploadFile)
      formData.set('type', uploadType)
      formData.set('linkedTo', uploadTarget)
      formData.set('title', uploadTitle.trim() || uploadFile.name)
      formData.set('tags', uploadTags)
      formData.set('sensitivity', uploadSensitivity)
      const payload = await requestApi<DocumentGenerationResponse>('/documents/upload', { method: 'POST', body: formData })
      setDocumentRows((current) => [payload.document, ...current.filter((document) => document.id !== payload.document.id)])
      setDashboard(payload.dashboard)
      setDownloadAudits((current) => [payload.audit, ...current.filter((event) => event.id !== payload.audit.id)])
      setUploadFile(null)
      setUploadTitle('')
      setUploadTags('')
      setStatusMessage(`${payload.document.title} is quarantined until a scan result is recorded`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Document upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function recordCleanScan(documentId: string) {
    setScanningDocumentId(documentId)
    setStatusMessage('Recording the external scan receipt')
    try {
      const payload = await requestApi<DocumentGenerationResponse>(`/documents/${encodeURIComponent(documentId)}/scan-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLEAN', provider: 'Manual compliance scan receipt' }),
      })
      setDocumentRows((current) => current.map((document) => document.id === documentId ? payload.document : document))
      setDashboard(payload.dashboard)
      setDownloadAudits((current) => [payload.audit, ...current.filter((event) => event.id !== payload.audit.id)])
      setStatusMessage(`${payload.document.title} is ready for approval`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Scan result could not be recorded')
    } finally {
      setScanningDocumentId(null)
    }
  }

  async function archiveDocument(documentId: string) {
    setArchivingDocumentId(documentId)
    try {
      const payload = await requestApi<DocumentGenerationResponse>(`/documents/${encodeURIComponent(documentId)}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Archived from Documents workspace' }),
      })
      setDocumentRows((current) => current.map((document) => document.id === documentId ? payload.document : document))
      setDashboard(payload.dashboard)
      setDownloadAudits((current) => [payload.audit, ...current.filter((event) => event.id !== payload.audit.id)])
      setStatusMessage(`${payload.document.title} archived with its object retained privately`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Document archive failed')
    } finally {
      setArchivingDocumentId(null)
    }
  }

  async function loadVersions(documentId: string) {
    try {
      const payload = await requestApi<DocumentVersionsResponse>(`/documents/${encodeURIComponent(documentId)}/versions`)
      setVersions(payload.versions)
      setVersionsTitle(`${payload.current.title} version history`)
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Document versions could not be loaded')
    }
  }

  async function approveDocument(documentId: string) {
    setApprovingDocumentId(documentId)
    setStatusMessage('Approving generated document before external sharing')

    try {
      const payload = await requestApi<DocumentApprovalResponse>(`/documents/${encodeURIComponent(documentId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'Compliance Lead', note: 'Reviewed from Documents workspace' }),
      })
      setDocumentRows((current) =>
        current.map((document) => (document.id === documentId ? payload.document : document)),
      )
      setDashboard(payload.dashboard)
      setDownloadAudits((current) => [payload.audit, ...current.filter((event) => event.id !== payload.audit.id)])
      setStatusMessage(`${payload.document.title} approved`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Document approval failed')
    } finally {
      setApprovingDocumentId(null)
    }
  }

  async function shareDocument(documentId: string) {
    setSharingDocumentId(documentId)
    setStatusMessage('Creating workspace-scoped external share link')

    try {
      const payload = await requestApi<DocumentShareResponse>(`/documents/${encodeURIComponent(documentId)}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: shareRecipient, actor: 'Compliance Lead' }),
      })
      setDocumentRows((current) =>
        current.map((document) => (document.id === documentId ? payload.document : document)),
      )
      setDashboard(payload.dashboard)
      setDownloadAudits((current) => [payload.audit, ...current.filter((event) => event.id !== payload.audit.id)])
      setShareResult(payload)
      setStatusMessage(`${payload.document.title} shared externally with audit review`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'External share failed')
    } finally {
      setSharingDocumentId(null)
    }
  }

  async function generateDocument() {
    if (!generationTarget) {
      return
    }
    setGenerating(true)
    setStatusMessage('Generating document into private review workflow')
    try {
      const payload = await requestApi<DocumentGenerationResponse>('/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: generationType,
          linkedTo: generationTarget,
          actor: 'Compliance Lead',
        }),
      })

      setDocumentRows((current) => [payload.document, ...current.filter((document) => document.id !== payload.document.id)])
      setDashboard(payload.dashboard)
      setDownloadAudits((current) => [payload.audit, ...current.filter((event) => event.id !== payload.audit.id)])
      setStatusMessage(`${payload.document.title} generated for review`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Document generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="workspace-grid documents-grid">
      <Panel title="Document Center" icon={FileLock2}>
        <div className="document-list">
          {documentRows.map((document) => (
            <div className="document-row" key={document.id}>
              <span className="mono-value">{document.id}</span>
              <div className="document-main">
                <strong>{document.title}</strong>
                <span>
                  {document.type} / {document.linkedTo} / {document.sizeKb}KB / {document.version}
                  {document.expiresAt ? ` / expires ${document.expiresAt}` : ''}
                </span>
              </div>
              <DataTag label={document.sensitivity} value={document.status} />
              <DataTag label="Scan" value={document.scanStatus ?? 'NOT_REQUIRED'} tone={document.scanStatus === 'CLEAN' ? 'green' : document.scanStatus === 'PENDING' ? 'amber' : 'blue'} />
              <span className="mono-value">{document.downloads} downloads</span>
              <div className="document-actions">
                {document.status === 'QUARANTINED' && (
                  <button
                    className="primary-button small"
                    type="button"
                    onClick={() => void recordCleanScan(document.id)}
                    disabled={scanningDocumentId === document.id}
                  >
                    {scanningDocumentId === document.id ? 'Recording' : 'Record clean scan'}
                  </button>
                )}
                {document.status === 'REVIEW_REQUIRED' && (
                  <button
                    className="primary-button small"
                    type="button"
                    onClick={() => void approveDocument(document.id)}
                    disabled={approvingDocumentId === document.id}
                  >
                    {approvingDocumentId === document.id ? 'Approving' : 'Approve'}
                  </button>
                )}
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void requestSignedUrl(document.id)}
                  disabled={loadingDocumentId === document.id}
                >
                  <KeyRound size={14} />
                  {loadingDocumentId === document.id ? 'Signing' : 'Sign URL'}
                </button>
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void shareDocument(document.id)}
                  disabled={sharingDocumentId === document.id || document.status === 'REVIEW_REQUIRED'}
                >
                  <Globe2 size={14} />
                  {sharingDocumentId === document.id ? 'Sharing' : 'Share'}
                </button>
                <button className="ghost-button small" type="button" onClick={() => void loadVersions(document.id)}>
                  Versions
                </button>
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void archiveDocument(document.id)}
                  disabled={archivingDocumentId === document.id || document.status === 'ARCHIVED'}
                >
                  {archivingDocumentId === document.id ? 'Archiving' : document.status === 'ARCHIVED' ? 'Archived' : 'Archive'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Search & Upload" icon={Search}>
        <div className="document-generate-form">
          <label className="field-row">
            <span>Search metadata</span>
            <input
              aria-label="Search documents"
              value={documentSearch}
              onChange={(event) => setDocumentSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void searchDocuments() }}
              placeholder="Title, tag, record, or extracted text"
            />
          </label>
          <button className="ghost-button small" type="button" onClick={() => void searchDocuments()}>Search</button>
          <label className="field-row">
            <span>Private file</span>
            <input
              aria-label="Upload private document"
              accept="application/pdf,image/png,image/jpeg,text/plain"
              type="file"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="field-row">
            <span>Document type</span>
            <select aria-label="Uploaded document type" value={uploadType} onChange={(event) => setUploadType(event.target.value as DocumentType)}>
              {(['SDS', 'CoA', 'IFRA', 'Invoice', 'Formula Export', 'Batch Record', 'Allergen Declaration', 'GHS Label', 'Formula Spec Sheet', 'Finished Product SDS'] as const).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Linked record</span>
            <select aria-label="Uploaded document linked record" value={uploadTarget} onChange={(event) => setUploadTarget(event.target.value)}>
              {uploadTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
            </select>
          </label>
          <label className="field-row">
            <span>Title</span>
            <input aria-label="Uploaded document title" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder={uploadFile?.name ?? 'Controlled document title'} />
          </label>
          <label className="field-row">
            <span>Tags</span>
            <input aria-label="Uploaded document tags" value={uploadTags} onChange={(event) => setUploadTags(event.target.value)} placeholder="supplier, revision, incoming" />
          </label>
          <label className="field-row">
            <span>Sensitivity</span>
            <select aria-label="Uploaded document sensitivity" value={uploadSensitivity} onChange={(event) => setUploadSensitivity(event.target.value as DocumentRecord['sensitivity'])}>
              <option value="Internal">Internal</option>
              <option value="Confidential">Confidential</option>
              <option value="Highly Confidential">Highly Confidential</option>
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => void uploadDocument()} disabled={!uploadFile || !uploadTarget || uploading}>
            {uploading ? 'Uploading' : 'Upload for scan'}
          </button>
        </div>
        <div className="empty-state compact">Uploads stay in private R2 storage, begin in quarantine, then require a recorded scan result and approval.</div>
      </Panel>
      <Panel title="Compliance Dashboard" icon={ShieldCheck}>
        <div className="stock-grid">
          <DataTag label="Coverage" value={`${dashboard.coveragePercent}%`} tone="blue" />
          <DataTag label="Missing" value={String(dashboard.missingCount)} tone={dashboard.missingCount > 0 ? 'amber' : 'green'} />
          <DataTag label="Expiring" value={String(dashboard.expiringCount)} tone={dashboard.expiringCount > 0 ? 'amber' : 'green'} />
          <DataTag label="Review" value={String(dashboard.reviewCount)} tone={dashboard.reviewCount > 0 ? 'amber' : 'green'} />
        </div>
        <div className="document-list compact-list">
          {dashboard.requirements.slice(0, 5).map((requirement) => (
            <div className="document-row" key={requirement.id}>
              <div>
                <strong>{requirement.label}</strong>
                <span>{requirement.requiredType} / {requirement.linkedTo}</span>
              </div>
              <StatusBadge
                status={requirement.status === 'met' ? 'stable' : requirement.status === 'missing' ? 'alert' : 'review'}
                label={requirement.status.toUpperCase()}
              />
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Generate Document" icon={FileLock2}>
        <div className="document-generate-form">
          <label className="field-row">
            <span>Document type</span>
            <select
              aria-label="Generated document type"
              value={generationType}
              onChange={(event) => setGenerationType(event.target.value as DocumentType)}
            >
              {generatedDocumentTypes.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Linked object</span>
            <select
              aria-label="Generated document linked object"
              value={generationTarget}
              onChange={(event) => setGenerationTarget(event.target.value)}
            >
              {generationTargets.map((target) => (
                <option key={target.id} value={target.id}>{target.label}</option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => void generateDocument()} disabled={generating || !generationTarget}>
            {generating ? 'Generating' : 'Generate for review'}
          </button>
        </div>
        <div className="empty-state compact">
          Generated documents enter review and still require signed access for download.
        </div>
      </Panel>
      <Panel title="Signed Access" icon={KeyRound}>
        {downloadResult ? (
          <div className="signed-card">
            <div>
              <span className="mono-small">{downloadResult.document.id}</span>
              <strong>{downloadResult.document.title}</strong>
              <span>{downloadResult.invariant}</span>
            </div>
            <div className="signed-url">{downloadResult.signedUrl.url}</div>
            <div className="tag-row">
              <DataTag label="TTL" value={`${downloadResult.signedUrl.ttlSeconds}s`} tone="blue" />
              <DataTag label="Expires" value={new Date(downloadResult.signedUrl.expiresAt).toLocaleTimeString()} />
              <DataTag label="Audit" value={downloadResult.audit.requestId} tone="green" />
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No signed URL yet</strong>
            <span>Select a document to create a short-lived workspace-scoped access URL.</span>
          </div>
        )}
      </Panel>
      <Panel title="Version History" icon={Library}>
        {versions.length > 0 ? (
          <div className="document-list compact-list">
            <div className="panel-subtitle">{versionsTitle}</div>
            {versions.map((document) => (
              <div className="document-row" key={document.id}>
                <div>
                  <strong>{document.version} / {document.title}</strong>
                  <span>{document.fileName ?? document.storageKey} / {document.checksum}</span>
                </div>
                <StatusBadge
                  status={document.status === 'APPROVED' || document.status === 'SHARED' ? 'stable' : document.status === 'ARCHIVED' ? 'draft' : 'review'}
                  label={document.status}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">Choose Versions on a document to inspect its immutable version group.</div>
        )}
      </Panel>
      <Panel title="External Share" icon={Globe2}>
        <label className="field-row">
          <span>Recipient email</span>
          <input
            aria-label="External share recipient"
            type="email"
            value={shareRecipient}
            onChange={(event) => setShareRecipient(event.target.value)}
          />
        </label>
        {shareResult ? (
          <div className="signed-card share-card">
            <div>
              <span className="mono-small">{shareResult.document.id}</span>
              <strong>{shareResult.shareLink.recipient}</strong>
              <span>{shareResult.invariant}</span>
            </div>
            <div className="signed-url">{shareResult.shareLink.url}</div>
            <div className="tag-row">
              <DataTag label="TTL" value={`${Math.round(shareResult.shareLink.ttlSeconds / 3600)}h`} tone="blue" />
              <DataTag label="Permission" value={shareResult.shareLink.permission} tone="green" />
              <DataTag label="Audit" value={shareResult.audit.requestId} tone="amber" />
            </div>
          </div>
        ) : (
          <div className="empty-state compact">
            Approve review documents before issuing an external share link.
          </div>
        )}
      </Panel>
      <Panel title="Download Policy" icon={ShieldCheck}>
        <div className="policy-list">
          <li>{statusMessage}</li>
          <li>Private bucket only, no public object URL</li>
          <li>Signed URL created after permission check</li>
          <li>Generated documents require approval before external share</li>
          <li>External share links are time-boxed and audit-reviewed</li>
          <li>Formula exports are Highly Confidential</li>
          <li>DownloadAuditLog records actor, IP, requestId</li>
        </div>
      </Panel>
      <Panel title="Document Workflow Audit" icon={ClipboardCheck}>
        <AuditList events={downloadAudits.slice(0, 4)} />
      </Panel>
    </div>
  )
}

const productionStatusTone: Record<ProductionBatchRecord['status'], DomainStatus> = {
  PLANNED: 'draft',
  WEIGHING: 'active',
  MACERATION: 'testing',
  FILTRATION: 'testing',
  QC: 'review',
  BOTTLING: 'active',
  RELEASED: 'stable',
  HOLD: 'alert',
}

const productionLifecycle: ProductionBatchRecord['status'][] = [
  'WEIGHING',
  'MACERATION',
  'FILTRATION',
  'QC',
  'BOTTLING',
  'RELEASED',
]

type UiLocale = 'en-US' | 'vi-VN'

const localeChangeEvent = 'olfactoryops.locale.change'
const localeStorageKey = 'olfactoryops.locale'

const vietnameseUiText: Record<string, string> = {
  Command: 'Điều hành',
  'R&D Spine': 'Nghiên cứu',
  Operations: 'Vận hành',
  Enterprise: 'Doanh nghiệp',
  'OlfactoryOps Console': 'Bảng điều hành OlfactoryOps',
  'Search modules, records, actions': 'Tìm module, dữ liệu, thao tác',
  Logout: 'Đăng xuất',
  'Open user settings': 'Mở cài đặt người dùng',
  'User settings': 'Cài đặt người dùng',
  Notifications: 'Thông báo',
  'Workspace inbox': 'Hộp thư workspace',
  'Mark all read': 'Đánh dấu đã đọc',
  'Close notifications': 'Đóng thông báo',
  'No notifications yet.': 'Chưa có thông báo.',
  'Loading notifications...': 'Đang tải thông báo...',
  Login: 'Đăng nhập',
  'Sign up': 'Đăng ký',
  'Forgot password?': 'Quên mật khẩu?',
  'Back to login': 'Quay lại đăng nhập',
  'Send reset link': 'Gửi liên kết đặt lại',
  'Reset password': 'Đặt lại mật khẩu',
  'Reset your password': 'Đặt lại mật khẩu của bạn',
  'Choose a new password': 'Chọn mật khẩu mới',
  'Create workspace': 'Tạo workspace',
  'Create your lab workspace': 'Tạo workspace phòng thí nghiệm',
  'Sign in to your lab workspace': 'Đăng nhập vào workspace phòng thí nghiệm',
  'Powered by OlfactoryOps': 'Được vận hành bởi OlfactoryOps',
  'Expand sidebar': 'Mở thanh điều hướng',
  'Collapse sidebar': 'Thu gọn thanh điều hướng',
  'Main modules': 'Các module chính',
  'Open navigation': 'Mở điều hướng',
  'Close navigation': 'Đóng điều hướng',
}

const vietnameseDomainNames: Partial<Record<DomainKey, { name: string; shortName: string }>> = {
  dashboard: { name: 'Bảng điều hành OlfactoryOps', shortName: 'Điều hành' },
  platform: { name: 'Nền tảng', shortName: 'Nền tảng' },
  identity: { name: 'Định danh & Bảo mật', shortName: 'Bảo mật' },
  customization: { name: 'Tùy chỉnh', shortName: 'Tùy chỉnh' },
  materials: { name: 'Nguyên liệu', shortName: 'Nguyên liệu' },
  formulas: { name: 'Công thức R&D', shortName: 'Công thức' },
  inventory: { name: 'Kho phòng thí nghiệm', shortName: 'Kho' },
  labUsage: { name: 'Sử dụng phòng lab', shortName: 'Sử dụng lab' },
  production: { name: 'Sản xuất', shortName: 'Sản xuất' },
  procurement: { name: 'Thu mua', shortName: 'Thu mua' },
  commerce: { name: 'Thương mại', shortName: 'Thương mại' },
  orders: { name: 'Đơn hàng & Fulfillment', shortName: 'Đơn hàng' },
  costing: { name: 'Giá thành & Tài chính', shortName: 'Giá thành' },
  analytics: { name: 'Phân tích', shortName: 'Phân tích' },
  saas: { name: 'Thanh toán & Tin cậy', shortName: 'Thanh toán' },
}

function activeUiLocale(): UiLocale {
  if (typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('vi')) {
    return 'vi-VN'
  }

  if (typeof window !== 'undefined' && window.localStorage.getItem(localeStorageKey) === 'vi-VN') {
    return 'vi-VN'
  }
  return 'en-US'
}

function decodeVietnameseMojibake(value: string) {
  if (!/[\u00c3\u00c4\u00c6]/.test(value)) {
    return value
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(value, (character) => character.charCodeAt(0)))
  } catch {
    return value
  }
}

function uiText(value: string) {
  return activeUiLocale() === 'vi-VN' ? decodeVietnameseMojibake(vietnameseUiText[value] ?? value) : value
}

function localizeDomainDisplay(domain: DomainModule) {
  const localized = activeUiLocale() === 'vi-VN' ? vietnameseDomainNames[domain.key] : undefined
  return localized
    ? { ...domain, name: decodeVietnameseMojibake(localized.name), shortName: decodeVietnameseMojibake(localized.shortName) }
    : domain
}

const productionLifecycleLabels: Record<ProductionBatchRecord['status'], string> = {
  PLANNED: 'Planned',
  WEIGHING: 'Weighing',
  MACERATION: 'Maceration',
  FILTRATION: 'Filtration',
  QC: 'Quality control',
  BOTTLING: 'Bottling',
  RELEASED: 'Released',
  HOLD: 'On hold',
}

const productionConsumptionRequiredStatuses = new Set<ProductionBatchRecord['status']>([
  'MACERATION',
  'FILTRATION',
  'QC',
  'BOTTLING',
  'RELEASED',
])

function canMoveProductionBatch(batch: ProductionBatchRecord, status: ProductionBatchRecord['status']) {
  if (status === batch.status || batch.status === 'RELEASED') {
    return false
  }
  if (status === 'HOLD') {
    return true
  }
  const nextByStatus: Partial<Record<ProductionBatchRecord['status'], ProductionBatchRecord['status']>> = {
    PLANNED: 'WEIGHING',
    WEIGHING: 'MACERATION',
    MACERATION: 'FILTRATION',
    FILTRATION: 'QC',
    QC: 'BOTTLING',
    BOTTLING: 'RELEASED',
    HOLD: batch.consumedGrams > 0 ? 'MACERATION' : 'WEIGHING',
  }
  if (nextByStatus[batch.status] !== status) {
    return false
  }
  if (productionConsumptionRequiredStatuses.has(status) && batch.consumedGrams <= 0) {
    return false
  }
  return !(status === 'BOTTLING' || status === 'RELEASED') || batch.qcStatus === 'PASSED'
}

type ProductionLifecycleFallback = {
  batch: ProductionBatchRecord
  message: string
  changed: boolean
}

type ProductionConsumeFallback = ProductionLifecycleFallback & {
  movement?: InventoryMovement
}

function isApprovalPendingMessage(message: string) {
  return message.toLowerCase().includes('pending approval')
}

function updateProductionWorkOrderStep(
  workOrder: ProductionBatchRecord['workOrder'],
  label: string,
  status: ProductionBatchRecord['workOrder']['steps'][number]['status'],
  evidence: string,
): ProductionBatchRecord['workOrder'] {
  return {
    ...workOrder,
    steps: workOrder.steps.map((step) => (step.label === label ? { ...step, status, evidence } : step)),
  }
}

function releaseProductionBatchLocal(batch: ProductionBatchRecord): ProductionBatchRecord {
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
    workOrder: updateProductionWorkOrderStep(batch.workOrder, 'Filter and bottle', 'DONE', outputLot.id),
  }
}

function applyProductionLifecycleLocal(
  batch: ProductionBatchRecord,
  status: ProductionBatchRecord['status'],
): ProductionLifecycleFallback {
  if (!productionLifecycle.includes(status)) {
    return { batch, changed: false, message: `${status} is not a supported lifecycle gate` }
  }
  if (!canMoveProductionBatch(batch, status)) {
    return { batch, changed: false, message: `${batch.id} cannot move from ${batch.status} to ${status}` }
  }
  if (status === 'WEIGHING' && batch.consumedGrams > 0) {
    return { batch, changed: false, message: `${batch.id} cannot return to weighing after consumption` }
  }
  if (productionConsumptionRequiredStatuses.has(status) && batch.consumedGrams <= 0) {
    return { batch, changed: false, message: `${batch.id} must consume inventory before ${status}` }
  }
  if (status === 'RELEASED' && batch.qcStatus !== 'PASSED') {
    return { batch, changed: false, message: `${batch.id} must pass QC before release` }
  }

  let next: ProductionBatchRecord = { ...batch, status }
  if (status === 'MACERATION') {
    next = {
      ...next,
      workOrder: updateProductionWorkOrderStep(
        next.workOrder,
        'Weigh raw materials',
        batch.consumedGrams > 0 ? 'DONE' : 'READY',
        batch.consumedGrams > 0 ? 'Input weighed' : 'Maceration gate selected',
      ),
    }
  }
  if (status === 'FILTRATION') {
    next = {
      ...next,
      workOrder: updateProductionWorkOrderStep(next.workOrder, 'Maceration hold', 'DONE', 'Filtration gate selected'),
    }
  }
  if (status === 'QC' || status === 'BOTTLING') {
    next = {
      ...next,
      workOrder: updateProductionWorkOrderStep(next.workOrder, 'Filter and bottle', 'READY', `${status} gate selected`),
    }
  }
  if (status === 'RELEASED') {
    next = releaseProductionBatchLocal(next)
  }

  return { batch: next, changed: true, message: `${batch.id} moved to ${next.status}` }
}

function applyProductionQcLocal(batch: ProductionBatchRecord, result: 'PASSED' | 'FAILED'): ProductionLifecycleFallback {
  const timestamp = new Date().toISOString()
  const status = result === 'PASSED' ? 'QC' : 'HOLD'
  const updated: ProductionBatchRecord = {
    ...batch,
    status,
    qcStatus: result,
    qcChecks: batch.qcChecks.map((check) => ({
      ...check,
      result,
      recordedAt: timestamp,
      note: result === 'PASSED' ? 'Within production release tolerance' : 'Deviation review required',
    })),
    workOrder:
      result === 'PASSED'
        ? updateProductionWorkOrderStep(batch.workOrder, 'Filter and bottle', 'READY', 'QC passed')
        : batch.workOrder,
  }
  return { batch: updated, changed: true, message: `${batch.id} QC ${result}; status is now ${updated.status}` }
}

function applyProductionConsumeLocal(batch: ProductionBatchRecord): ProductionConsumeFallback {
  if (batch.consumedGrams > 0) {
    return { batch, changed: false, message: `${batch.id} has already consumed inventory` }
  }

  const timestamp = new Date().toISOString()
  const movement: InventoryMovement = {
    id: `MOV-PROD-${batch.id}-LOCAL`,
    at: timestamp,
    type: 'PRODUCTION_CONSUMPTION',
    direction: 'OUT',
    materialId: batch.formulaId,
    lotId: `LOCAL-${batch.id}`,
    quantityGrams: batch.targetGrams,
    balanceAfter: 0,
    ref: batch.id,
    actor: 'local-production-fallback',
  }
  const updated: ProductionBatchRecord = {
    ...batch,
    consumedGrams: batch.targetGrams,
    status: 'MACERATION',
    workOrder: updateProductionWorkOrderStep(batch.workOrder, 'Weigh raw materials', 'DONE', movement.id),
    genealogy: {
      ...batch.genealogy,
      inputLotIds: [movement.lotId],
      inputMovementIds: [movement.id],
    },
  }

  return { batch: updated, changed: true, movement, message: `${batch.id} consumed in local production preview` }
}

function ProductionWorkspace({
  formulaRecords,
  materialRecords,
  session,
}: {
  formulaRecords: Formula[]
  materialRecords: Material[]
  session: AuthSession
}) {
  const approvedFormulas = useMemo(
    () => formulaRecords.filter((formula) => formula.workflowStatus === 'APPROVED'),
    [formulaRecords],
  )
  const [batches, setBatches] = useState<ProductionBatchRecord[]>([])
  const [selectedFormulaId, setSelectedFormulaId] = useState('')
  const [targetGrams, setTargetGrams] = useState(25)
  const [statusMessage, setStatusMessage] = useState('Loading production batches')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [lastMovements, setLastMovements] = useState<InventoryMovement[]>([])
  const [activeBatchId, setActiveBatchId] = useState('')
  const activeBatch = batches.find((batch) => batch.id === activeBatchId) ?? batches[0]
  const canManageProduction = sessionHasPermission(session, 'production.consume')
  const canRecordProductionQc = sessionHasPermission(session, 'production.qc')

  const batchCostBasis = useCallback((batch: ProductionBatchRecord) => {
    const leaves = resolveFormulaWithCatalog(batch.formulaId, formulaRecords, materialRecords)
    return formulaTotals(leaves).costPerGram * batch.targetGrams
  }, [formulaRecords, materialRecords])

  const updateBatch = useCallback((updated: ProductionBatchRecord) => {
    setBatches((current) => current.map((batch) => (batch.id === updated.id ? updated : batch)))
  }, [])

  const loadBatches = useCallback(async () => {
    try {
      const payload = await requestApi<ProductionBatchRecord[]>('/production/batches')
      setBatches(payload)
      setStatusMessage('Production batches synced from live API')
    } catch (error) {
      setBatches([])
      setStatusMessage(error instanceof Error ? error.message : 'Production batches are unavailable')
    }
  }, [])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  useEffect(() => {
    setSelectedFormulaId((current) =>
      approvedFormulas.some((formula) => formula.id === current) ? current : (approvedFormulas[0]?.id ?? ''),
    )
  }, [approvedFormulas])

  useEffect(() => {
    setActiveBatchId((current) =>
      current && batches.some((batch) => batch.id === current) ? current : (batches[0]?.id ?? ''),
    )
  }, [batches])

  async function createBatch() {
    if (!selectedFormulaId) {
      setStatusMessage('Approve a formula in this workspace before creating a production batch')
      return
    }
    setCreating(true)
    setStatusMessage('Creating production batch from approved formula')
    try {
      const batch = await requestApi<ProductionBatchRecord>('/production/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formulaId: selectedFormulaId, targetGrams }),
      })
      setBatches((current) => [batch, ...current])
      setActiveBatchId(batch.id)
      setStatusMessage(`${batch.id} created from ${batch.formulaCode}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Production batch creation failed')
    } finally {
      setCreating(false)
    }
  }

  async function consumeBatch(batchId: string) {
    setBusyId(batchId)
    setStatusMessage(`Consuming inventory for ${batchId}`)
    try {
      const payload = await requestApi<ProductionConsumeResponse>(`/production/batches/${encodeURIComponent(batchId)}/consume`, {
        method: 'POST',
      })
      setLastMovements(payload.movements)
      await loadBatches()
      setStatusMessage(`${batchId} consumed through ${payload.movements.length} production movement(s)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Production consumption failed'
      const batch = batches.find((item) => item.id === batchId)
      const fallback = !isApprovalPendingMessage(message) && batch ? applyProductionConsumeLocal(batch) : null
      if (fallback?.changed && fallback.movement) {
        setBatches((current) => current.map((batch) => (batch.id === batchId ? fallback.batch : batch)))
        setLastMovements([fallback.movement])
        setStatusMessage(`${message}; local preview: ${fallback.message}`)
      } else {
        setStatusMessage(fallback?.message ?? message)
      }
    } finally {
      setBusyId(null)
    }
  }

  async function recordQc(batchId: string, result: 'PASSED' | 'FAILED') {
    setBusyId(batchId)
    setStatusMessage(`Recording ${result} QC for ${batchId}`)
    try {
      const batch = await requestApi<ProductionBatchRecord>(`/production/batches/${encodeURIComponent(batchId)}/qc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      })
      updateBatch(batch)
      setStatusMessage(`${batch.id} QC ${result}; status is now ${batch.status}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'QC update failed'
      const batch = batches.find((item) => item.id === batchId)
      const fallback = !isApprovalPendingMessage(message) && batch ? applyProductionQcLocal(batch, result) : null
      if (fallback?.changed) {
        setBatches((current) => current.map((item) => (item.id === batchId ? fallback.batch : item)))
      }
      setStatusMessage(fallback?.changed ? `${message}; local preview: ${fallback.message}` : fallback?.message ?? message)
    } finally {
      setBusyId(null)
    }
  }

  async function moveBatch(batchId: string, status: ProductionBatchRecord['status']) {
    setBusyId(batchId)
    setStatusMessage(`Moving ${batchId} to ${status}`)
    try {
      const payload = await requestApi<ProductionStatusResponse>(`/production/batches/${encodeURIComponent(batchId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      updateBatch(payload.batch)
      setStatusMessage(`${payload.batch.id} moved to ${payload.batch.status}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lifecycle update failed'
      const batch = batches.find((item) => item.id === batchId)
      const fallback = !isApprovalPendingMessage(message) && batch ? applyProductionLifecycleLocal(batch, status) : null
      if (fallback?.changed) {
        setBatches((current) => current.map((item) => (item.id === batchId ? fallback.batch : item)))
      }
      setStatusMessage(fallback?.changed ? `${message}; local preview: ${fallback.message}` : fallback?.message ?? message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="workspace-grid production-grid">
      <Panel title="Create Production Batch" icon={PackageCheck}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Approved formula</span>
            <select
              value={selectedFormulaId}
              onChange={(event) => setSelectedFormulaId(event.target.value)}
              disabled={approvedFormulas.length === 0}
            >
              {approvedFormulas.length === 0 ? <option value="">No approved formulas in this workspace</option> : null}
              {approvedFormulas.map((formula) => (
                <option value={formula.id} key={formula.id}>
                  {formula.code} / {formula.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Target grams</span>
            <input
              min={1}
              step={1}
              type="number"
              value={targetGrams}
              onChange={(event) => setTargetGrams(Number(event.target.value))}
            />
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => void createBatch()}
            disabled={creating || targetGrams <= 0 || !selectedFormulaId || !canManageProduction}
            title={canManageProduction ? undefined : 'Your role cannot create production batches'}
          >
            {creating ? 'Creating' : 'Create batch'}
          </button>
        </div>
        <ul className="policy-list">
          <li>Only formulas with an approved version snapshot can enter production.</li>
          <li>Raw materials are issued to this batch at weighing, separately from R&amp;D sample usage.</li>
          <li>{statusMessage}</li>
        </ul>
      </Panel>

      <Panel title="Lifecycle Gate" icon={ClipboardCheck}>
        {activeBatch ? (
          <>
            <div className="production-gate-picker">
              <label className="field-row">
                <span>Active batch</span>
                <select value={activeBatch.id} onChange={(event) => setActiveBatchId(event.target.value)}>
                  {batches.map((batch) => (
                    <option value={batch.id} key={batch.id}>
                      {batch.id} / {batch.formulaCode} / {productionLifecycleLabels[batch.status]}
                    </option>
                  ))}
                </select>
              </label>
              <StatusBadge status={productionStatusTone[activeBatch.status]} label={productionLifecycleLabels[activeBatch.status]} />
            </div>
            <div className="production-timeline" aria-label="Production lifecycle">
              {productionLifecycle.map((status, index) => (
                <div
                  className={`timeline-step ${activeBatch.status === status ? 'is-current' : ''} ${productionLifecycle.indexOf(activeBatch.status) > index ? 'is-done' : ''}`}
                  key={status}
                >
                  <span className="timeline-step-index">{index + 1}</span>
                  <span>{productionLifecycleLabels[status]}</span>
                </div>
              ))}
            </div>
            <div className="production-gate-action">
              <div>
                <span className="production-gate-kicker">Next required action</span>
                {activeBatch.status === 'WEIGHING' ? (
                  <>
                    <strong>Issue raw materials</strong>
                    <p>Confirm the weighing plan. Inventory is issued to this batch, then maceration begins.</p>
                  </>
                ) : null}
                {activeBatch.status === 'MACERATION' ? (
                  <>
                    <strong>Complete maceration</strong>
                    <p>Record the completed hold before moving the batch to filtration.</p>
                  </>
                ) : null}
                {activeBatch.status === 'FILTRATION' ? (
                  <>
                    <strong>Send batch to quality control</strong>
                    <p>Filtration must be completed before QC can record a pass or place the batch on hold.</p>
                  </>
                ) : null}
                {activeBatch.status === 'QC' ? (
                  <>
                    <strong>Record QC outcome</strong>
                    <p>A passed QC result unlocks bottling. A failed result places the batch on hold for review.</p>
                  </>
                ) : null}
                {activeBatch.status === 'BOTTLING' ? (
                  <>
                    <strong>Release finished batch</strong>
                    <p>Release creates the output lot and keeps its genealogy linked to the issued materials.</p>
                  </>
                ) : null}
                {activeBatch.status === 'HOLD' ? (
                  <>
                    <strong>Resume batch</strong>
                    <p>Resume returns the batch to the appropriate operational step while retaining its QC history.</p>
                  </>
                ) : null}
                {activeBatch.status === 'RELEASED' ? (
                  <>
                    <strong>Batch released</strong>
                    <p>The finished output lot is available with its production genealogy and QC evidence.</p>
                  </>
                ) : null}
                {activeBatch.status === 'PLANNED' ? (
                  <>
                    <strong>Start weighing</strong>
                    <p>Open the work order and prepare the approved formula for material issue.</p>
                  </>
                ) : null}
              </div>
              <div className="document-actions production-gate-actions">
                {activeBatch.status === 'PLANNED' ? (
                  <button
                    className="primary-button small"
                    type="button"
                    onClick={() => void moveBatch(activeBatch.id, 'WEIGHING')}
                    disabled={busyId === activeBatch.id || !canManageProduction || !canMoveProductionBatch(activeBatch, 'WEIGHING')}
                    title={canManageProduction ? undefined : 'Your role cannot progress production batches'}
                  >
                    Start weighing
                  </button>
                ) : null}
                {activeBatch.status === 'WEIGHING' ? (
                  <button
                    className="primary-button small"
                    type="button"
                    onClick={() => void consumeBatch(activeBatch.id)}
                    disabled={busyId === activeBatch.id || !canManageProduction || activeBatch.consumedGrams > 0}
                    title={canManageProduction ? undefined : 'Your role cannot issue production inventory'}
                  >
                    Issue inventory
                  </button>
                ) : null}
                {activeBatch.status === 'MACERATION' ? (
                  <button
                    className="primary-button small"
                    type="button"
                    onClick={() => void moveBatch(activeBatch.id, 'FILTRATION')}
                    disabled={busyId === activeBatch.id || !canManageProduction || !canMoveProductionBatch(activeBatch, 'FILTRATION')}
                    title={canManageProduction ? undefined : 'Your role cannot progress production batches'}
                  >
                    Complete maceration
                  </button>
                ) : null}
                {activeBatch.status === 'FILTRATION' ? (
                  <button
                    className="primary-button small"
                    type="button"
                    onClick={() => void moveBatch(activeBatch.id, 'QC')}
                    disabled={busyId === activeBatch.id || !canManageProduction || !canMoveProductionBatch(activeBatch, 'QC')}
                    title={canManageProduction ? undefined : 'Your role cannot progress production batches'}
                  >
                    Send to QC
                  </button>
                ) : null}
                {activeBatch.status === 'QC' ? (
                  <>
                    <button
                      className="primary-button small"
                      type="button"
                      onClick={() => void recordQc(activeBatch.id, 'PASSED')}
                      disabled={busyId === activeBatch.id || !canRecordProductionQc || activeBatch.qcStatus === 'PASSED'}
                      title={canRecordProductionQc ? undefined : 'Your role cannot record production QC'}
                    >
                      Pass QC
                    </button>
                    <button
                      className="ghost-button small"
                      type="button"
                      onClick={() => void recordQc(activeBatch.id, 'FAILED')}
                      disabled={busyId === activeBatch.id || !canRecordProductionQc}
                      title={canRecordProductionQc ? undefined : 'Your role cannot record production QC'}
                    >
                      Place on hold
                    </button>
                  </>
                ) : null}
                {activeBatch.status === 'BOTTLING' ? (
                  <button
                    className="primary-button small"
                    type="button"
                    onClick={() => void moveBatch(activeBatch.id, 'RELEASED')}
                    disabled={busyId === activeBatch.id || !canRecordProductionQc || !canMoveProductionBatch(activeBatch, 'RELEASED')}
                    title={canRecordProductionQc ? undefined : 'Your role cannot release production batches'}
                  >
                    Release batch
                  </button>
                ) : null}
                {activeBatch.status === 'HOLD' ? (
                  <button
                    className="primary-button small"
                    type="button"
                    onClick={() => void moveBatch(activeBatch.id, activeBatch.consumedGrams > 0 ? 'MACERATION' : 'WEIGHING')}
                    disabled={busyId === activeBatch.id || !canManageProduction}
                    title={canManageProduction ? undefined : 'Your role cannot resume production batches'}
                  >
                    Resume batch
                  </button>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state compact">No batch created yet.</div>
        )}
        {activeBatch && <div className="status-strip">{statusMessage}</div>}
        {activeBatch && (
          <div className="metric-grid production-gate-metrics">
            <Metric label="Formula" value={activeBatch.formulaCode} />
            <Metric label="Target" value={formatGrams(activeBatch.targetGrams)} />
            <Metric label="Inventory issued" value={activeBatch.consumedGrams > 0 ? formatGrams(activeBatch.consumedGrams) : 'Not issued'} />
            <Metric label="QC" value={activeBatch.qcStatus} />
            <Metric label="Cost basis" value={formatCurrency(batchCostBasis(activeBatch))} />
            <Metric label="Output lot" value={activeBatch.outputLot?.lotNumber ?? 'Pending release'} />
          </div>
        )}
      </Panel>

      <Panel title="Work Order & QC Protocol" icon={ClipboardCheck}>
        {activeBatch ? (
          <div className="document-list compact-list">
            <div className="document-row">
              <div>
                <strong>{activeBatch.workOrder.id}</strong>
                <span>{activeBatch.workOrder.equipment}</span>
                <span>Due {new Date(activeBatch.workOrder.dueAt).toLocaleDateString()}</span>
              </div>
              <StatusBadge status="active" label="WORK ORDER" />
            </div>
            {activeBatch.workOrder.steps.map((step) => (
              <div className="document-row" key={step.id}>
                <div>
                  <strong>{step.label}</strong>
                  <span>{step.equipment} / {step.plannedMinutes} min</span>
                  {step.evidence ? <span>Evidence: {step.evidence}</span> : null}
                </div>
                <StatusBadge
                  status={step.status === 'DONE' ? 'stable' : step.status === 'READY' ? 'active' : step.status === 'BLOCKED' ? 'alert' : 'draft'}
                  label={step.status}
                />
              </div>
            ))}
            {activeBatch.qcChecks.map((check) => (
              <div className="document-row" key={check.id}>
                <div>
                  <strong>{check.label}</strong>
                  <span>{check.note ?? 'Awaiting QC evidence'}</span>
                  {check.recordedAt ? <span>{new Date(check.recordedAt).toLocaleString()}</span> : null}
                </div>
                <StatusBadge
                  status={check.result === 'PASSED' ? 'stable' : check.result === 'FAILED' ? 'alert' : 'review'}
                  label={check.result}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">Create a batch to generate a work order and QC protocol.</div>
        )}
      </Panel>

      <Panel className="wide" title="Batch Board" icon={Activity}>
        <div className="document-list compact-list production-list">
          {batches.map((batch) => (
            <div className="document-row production-row" key={batch.id}>
              <div>
                <strong>{batch.id} / {batch.formulaCode}</strong>
                <span>{formatGrams(batch.targetGrams)} target / {formatGrams(batch.consumedGrams)} consumed / {batch.owner}</span>
                <span>Cost basis {formatCurrency(batchCostBasis(batch))}</span>
                {batch.outputLot ? (
                  <span>Output {batch.outputLot.lotNumber} / {formatGrams(batch.outputLot.quantityGrams)}</span>
                ) : null}
              </div>
              <StatusBadge status={productionStatusTone[batch.status]} label={batch.status} />
              <div className="document-actions">
                <button
                  className="primary-button small"
                  type="button"
                  onClick={() => setActiveBatchId(batch.id)}
                  aria-pressed={activeBatch?.id === batch.id}
                >
                  {activeBatch?.id === batch.id ? 'Viewing lifecycle' : 'Open lifecycle'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Production Movement Evidence" icon={Database}>
        {lastMovements.length > 0 ? (
          <div className="document-list compact-list">
            {lastMovements.slice(0, 5).map((movement) => (
              <div className="document-row" key={movement.id}>
                <div>
                  <strong>{movement.id}</strong>
                  <span>{movement.type} / {movement.direction} / {movement.ref}</span>
                </div>
                <div className="mono-value">{formatGrams(movement.quantityGrams)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">Consume a batch to see audit-critical production movements.</div>
        )}
      </Panel>

      <Panel title="Production Guardrails" icon={ShieldCheck}>
        <ul className="policy-list">
          <li>Release is blocked until inventory is consumed and QC passes.</li>
          <li>Release creates a finished output-lot record linked back to input lots and movement IDs.</li>
          <li>Failed QC moves the batch to HOLD for deviation review.</li>
          <li>Batch records are append/audit-oriented and not hard-deleted.</li>
          {activeBatch?.genealogy.inputLotIds.length ? (
            <li>Inputs: {activeBatch.genealogy.inputLotIds.join(', ')} / Output: {activeBatch.genealogy.outputLotId ?? 'pending'}</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  )
}

const purchaseOrderStatusTone: Record<PurchaseOrderRecord['status'], DomainStatus> = {
  DRAFT: 'draft',
  SENT: 'active',
  PARTIAL: 'review',
  RECEIVED: 'stable',
}

const reorderPointByTier: Record<Material['tier'], number> = {
  Top: 80,
  Heart: 120,
  Base: 160,
}

function ProcurementWorkspace({
  stock,
  materialRecords,
  onLotsChange,
  onMovementsChange,
}: {
  stock: ReturnType<typeof stockSummary>
  materialRecords: Material[]
  onLotsChange: Dispatch<SetStateAction<InventoryLot[]>>
  onMovementsChange: Dispatch<SetStateAction<InventoryMovement[]>>
}) {
  const materialOptions = materialRecords.length > 0 ? materialRecords : materials
  const [supplierRows, setSupplierRows] = useState<SupplierRecord[]>(suppliers)
  const [orderRows, setOrderRows] = useState<PurchaseOrderRecord[]>(purchaseOrders)
  const [historyRows, setHistoryRows] = useState<PriceHistoryRecord[]>(priceHistory)
  const [selectedMaterialId, setSelectedMaterialId] = useState(materialOptions[0]?.id ?? 'mat-bergamot')
  const [statusMessage, setStatusMessage] = useState('Loading procurement workspace')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [lastReceipt, setLastReceipt] = useState<PurchaseOrderReceiptResponse | null>(null)
  const [supplierDraft, setSupplierDraft] = useState({
    name: 'North Aroma Cooperative',
    country: 'TH',
    contactEmail: 'procurement@nortaroma.example',
    leadTimeDays: 10,
    paymentTerms: 'Net 30',
  })
  const [orderDraft, setOrderDraft] = useState({
    supplierId: suppliers[0]?.id ?? '',
    materialId: materialOptions[0]?.id ?? '',
    quantityGrams: 100,
    unitCost: materialOptions[0]?.costPerGram ?? 0.1,
    currency: 'USD',
  })
  const [purchaseOrderLines, setPurchaseOrderLines] = useState<PurchaseOrderLineItem[]>([
    {
      id: 'draft-po-line-1',
      materialId: materialOptions[0]?.id ?? '',
      quantityGrams: 100,
      receivedGrams: 0,
      unitCost: materialOptions[0]?.costPerGram ?? 0.1,
    },
  ])
  const [receiveDraft, setReceiveDraft] = useState<Record<string, number>>({})
  const [rfqQuantityGrams, setRfqQuantityGrams] = useState(100)
  const [rfqComparison, setRfqComparison] = useState<RfqComparison | null>(null)

  const materialById = useMemo(
    () => new Map(materialOptions.map((material) => [material.id, material])),
    [materialOptions],
  )
  const supplierById = useMemo(() => new Map(supplierRows.map((supplier) => [supplier.id, supplier])), [supplierRows])
  const selectedMaterial = materialById.get(selectedMaterialId) ?? materialOptions[0]
  const lowStockSuggestions = useMemo(
    () =>
      stock
        .map((item) => {
          const reorderPointGrams = reorderPointByTier[item.material.tier]
          return {
            materialId: item.material.id,
            materialName: item.material.name,
            availableGrams: item.available,
            reorderPointGrams,
            suggestedOrderGrams: Math.max(reorderPointGrams * 2 - item.available, reorderPointGrams),
            reason: `${item.material.tier} tier below ${formatGrams(reorderPointGrams)} reorder point`,
          }
        })
        .filter((item) => item.availableGrams < item.reorderPointGrams)
        .slice(0, 6),
    [stock],
  )
  const activeOrders = useMemo(
    () => orderRows.filter((order) => order.status !== 'RECEIVED').slice(0, 8),
    [orderRows],
  )

  const linesForPurchaseOrder = useCallback((order: PurchaseOrderRecord): PurchaseOrderLineItem[] => (
    order.lines?.length
      ? order.lines
      : [{
          id: `${order.id}-legacy-line`,
          materialId: order.materialId,
          quantityGrams: order.quantityGrams,
          receivedGrams: order.receivedGrams,
          unitCost: order.unitCost,
        }]
  ), [])

  const updateOrder = useCallback((updated: PurchaseOrderRecord) => {
    setOrderRows((current) => {
      if (current.some((order) => order.id === updated.id)) {
        return current.map((order) => (order.id === updated.id ? updated : order))
      }
      return [updated, ...current]
    })
  }, [])

  useEffect(() => {
    let active = true
    async function loadProcurement() {
      try {
        const [supplierPayload, orderPayload] = await Promise.all([
          requestApi<SupplierRecord[]>('/suppliers'),
          requestApi<PurchaseOrderRecord[]>('/purchase-orders'),
        ])
        if (!active) {
          return
        }
        setSupplierRows(supplierPayload)
        setOrderRows(orderPayload)
        setStatusMessage('Procurement API synced: suppliers, PO board, and receipt controls are live')
      } catch (error) {
        if (active) {
          setStatusMessage(error instanceof Error ? error.message : 'Using local procurement seed until API is reachable')
        }
      }
    }
    void loadProcurement()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!materialOptions.some((material) => material.id === selectedMaterialId) && materialOptions[0]) {
      setSelectedMaterialId(materialOptions[0].id)
    }
  }, [materialOptions, selectedMaterialId])

  useEffect(() => {
    setOrderDraft((current) => ({
      ...current,
      supplierId: supplierRows.some((supplier) => supplier.id === current.supplierId)
        ? current.supplierId
        : supplierRows[0]?.id ?? '',
      materialId: materialOptions.some((material) => material.id === current.materialId)
        ? current.materialId
        : materialOptions[0]?.id ?? '',
      unitCost: materialById.get(current.materialId)?.costPerGram ?? current.unitCost,
    }))
  }, [materialById, materialOptions, supplierRows])

  useEffect(() => {
    setPurchaseOrderLines((current) => current.map((line) => {
      const fallbackMaterial = materialOptions[0]
      const material = materialById.get(line.materialId) ?? fallbackMaterial
      return material
        ? { ...line, materialId: material.id, unitCost: materialById.has(line.materialId) ? line.unitCost : material.costPerGram }
        : line
    }))
  }, [materialById, materialOptions])

  useEffect(() => {
    let active = true
    async function loadPriceHistory() {
      try {
        const payload = await requestApi<PriceHistoryRecord[]>(
          `/materials/${encodeURIComponent(selectedMaterialId)}/price-history`,
        )
        if (active) {
          setHistoryRows(payload)
        }
      } catch {
        if (active) {
          setHistoryRows(priceHistory.filter((record) => record.materialId === selectedMaterialId))
        }
      }
    }
    void loadPriceHistory()
    return () => {
      active = false
    }
  }, [selectedMaterialId])

  async function createSupplier() {
    setBusyId('supplier-create')
    setStatusMessage('Creating supplier master record')
    try {
      const payload = await requestApi<SupplierCreateResponse>('/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...supplierDraft,
          leadTimeDays: Number(supplierDraft.leadTimeDays),
          preferredMaterialIds: selectedMaterial ? [selectedMaterial.id] : [],
        }),
      })
      setSupplierRows((current) => [payload.supplier, ...current])
      setOrderDraft((current) => ({ ...current, supplierId: payload.supplier.id }))
      setSupplierDraft((current) => ({ ...current, name: '', contactEmail: '' }))
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Supplier create failed')
    } finally {
      setBusyId(null)
    }
  }

  async function createPurchaseOrder() {
    const validLines = purchaseOrderLines.filter((line) =>
      line.materialId && Number(line.quantityGrams) > 0 && Number(line.unitCost) > 0,
    )
    if (validLines.length !== purchaseOrderLines.length || validLines.length === 0) {
      setStatusMessage('Each purchase-order line needs a material, quantity, and unit cost')
      return
    }
    setBusyId('po-create')
    setStatusMessage('Creating purchase order draft')
    try {
      const payload = await requestApi<PurchaseOrderCreateResponse>('/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: orderDraft.supplierId,
          currency: orderDraft.currency,
          lines: validLines.map((line) => ({
            materialId: line.materialId,
            quantityGrams: Number(line.quantityGrams),
            unitCost: Number(line.unitCost),
          })),
        }),
      })
      updateOrder(payload.purchaseOrder)
      setSelectedMaterialId(payload.purchaseOrder.lines?.[0]?.materialId ?? payload.purchaseOrder.materialId)
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Purchase order create failed')
    } finally {
      setBusyId(null)
    }
  }

  async function sendPurchaseOrder(orderId: string) {
    setBusyId(orderId)
    setStatusMessage(`Sending ${orderId} to supplier`)
    try {
      const payload = await requestApi<PurchaseOrderStatusResponse>(`/purchase-orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SENT' }),
      })
      updateOrder(payload.purchaseOrder)
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Purchase order send failed')
    } finally {
      setBusyId(null)
    }
  }

  async function receivePurchaseOrder(order: PurchaseOrderRecord, line: PurchaseOrderLineItem, receiveAll = false) {
    const remainingGrams = line.quantityGrams - line.receivedGrams
    const receiptKey = `${order.id}:${line.id}`
    const receivedGrams = receiveAll ? remainingGrams : Number(receiveDraft[receiptKey] ?? remainingGrams)
    setBusyId(order.id)
    setStatusMessage(`Receiving ${formatGrams(receivedGrams)} for ${order.id}`)
    try {
      const payload = await requestApi<PurchaseOrderReceiptResponse>(`/purchase-orders/${encodeURIComponent(order.id)}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: [{ materialId: line.materialId, receivedGrams }] }),
      })
      updateOrder(payload.purchaseOrder)
      const receiptLots = payload.lots?.length ? payload.lots : [payload.lot]
      const receiptMovements = payload.movements?.length ? payload.movements : [payload.movement]
      const receiptHistory = payload.priceHistoryRecords?.length ? payload.priceHistoryRecords : [payload.priceHistory]
      onLotsChange((current) => [
        ...receiptLots.filter((lot) => !current.some((candidate) => candidate.id === lot.id)),
        ...current,
      ])
      onMovementsChange((current) => [
        ...receiptMovements.filter((movement) => !current.some((candidate) => candidate.id === movement.id)),
        ...current,
      ])
      setHistoryRows((current) => [
        ...receiptHistory.filter((record) => !current.some((candidate) => candidate.id === record.id)),
        ...current,
      ])
      const receivedLine = linesForPurchaseOrder(payload.purchaseOrder).find((candidate) => candidate.materialId === line.materialId)
      setReceiveDraft((current) => ({
        ...current,
        [receiptKey]: Math.max((receivedLine?.quantityGrams ?? 0) - (receivedLine?.receivedGrams ?? 0), 0),
      }))
      setSelectedMaterialId(line.materialId)
      setLastReceipt(payload)
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Purchase order receipt failed')
    } finally {
      setBusyId(null)
    }
  }

  function updatePurchaseOrderLine(lineId: string, patch: Partial<PurchaseOrderLineItem>) {
    setPurchaseOrderLines((current) => current.map((line) => {
      if (line.id !== lineId) {
        return line
      }
      const material = patch.materialId ? materialById.get(patch.materialId) : undefined
      return {
        ...line,
        ...patch,
        unitCost: material ? material.costPerGram : patch.unitCost ?? line.unitCost,
      }
    }))
  }

  function addPurchaseOrderLine() {
    const material = materialOptions.find((candidate) => !purchaseOrderLines.some((line) => line.materialId === candidate.id)) ?? materialOptions[0]
    if (!material) {
      return
    }
    setPurchaseOrderLines((current) => [
      ...current,
      {
        id: `draft-po-line-${Date.now()}`,
        materialId: material.id,
        quantityGrams: 100,
        receivedGrams: 0,
        unitCost: material.costPerGram,
      },
    ])
  }

  function removePurchaseOrderLine(lineId: string) {
    setPurchaseOrderLines((current) => current.length > 1 ? current.filter((line) => line.id !== lineId) : current)
  }

  function prepareLowStockOrder(suggestion: InventoryReorderSuggestion) {
    const supplier = supplierRows.find((item) => item.preferredMaterialIds.includes(suggestion.materialId)) ?? supplierRows[0]
    const material = materialById.get(suggestion.materialId)
    setOrderDraft({
      supplierId: supplier?.id ?? '',
      materialId: suggestion.materialId,
      quantityGrams: suggestion.suggestedOrderGrams,
      unitCost: material?.costPerGram ?? 0.1,
      currency: 'USD',
    })
    setPurchaseOrderLines([{
      id: `draft-po-line-${Date.now()}`,
      materialId: suggestion.materialId,
      quantityGrams: suggestion.suggestedOrderGrams,
      receivedGrams: 0,
      unitCost: material?.costPerGram ?? 0.1,
    }])
    setSelectedMaterialId(suggestion.materialId)
    setStatusMessage(`${suggestion.materialName} loaded into PO draft from low-stock suggestion`)
  }

  async function compareRfq() {
    if (!selectedMaterial || rfqQuantityGrams <= 0) {
      return
    }
    setBusyId('rfq-compare')
    setStatusMessage(`Comparing supplier quotes for ${selectedMaterial.name}`)
    try {
      const payload = await requestApi<RfqComparisonResponse>('/procurement/rfq/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: selectedMaterial.id, quantityGrams: rfqQuantityGrams }),
      })
      setRfqComparison(payload)
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'RFQ comparison failed')
    } finally {
      setBusyId(null)
    }
  }

  async function awardRfq(option: RfqComparison['options'][number]) {
    if (!rfqComparison) {
      return
    }
    setBusyId(`rfq-award-${option.supplierId}`)
    setStatusMessage(`Awarding ${option.supplierName} and creating a PO draft`)
    try {
      const payload = await requestApi<RfqAwardResponse>('/procurement/rfq/award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialId: rfqComparison.materialId,
          quantityGrams: rfqComparison.quantityGrams,
          supplierId: option.supplierId,
          unitCost: option.unitCost,
          currency: option.currency,
        }),
      })
      updateOrder(payload.purchaseOrder)
      setOrderDraft((current) => ({
        ...current,
        supplierId: option.supplierId,
        materialId: rfqComparison.materialId,
        quantityGrams: rfqComparison.quantityGrams,
        unitCost: option.unitCost,
        currency: option.currency,
      }))
      setPurchaseOrderLines([{
        id: `draft-po-line-${Date.now()}`,
        materialId: rfqComparison.materialId,
        quantityGrams: rfqComparison.quantityGrams,
        receivedGrams: 0,
        unitCost: option.unitCost,
      }])
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'RFQ award failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="workspace-grid procurement-grid">
      <Panel title="Supplier Master" icon={Truck} right={<DataTag label="Status" value={statusMessage} tone="blue" />}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Supplier name</span>
            <input
              aria-label="Supplier name"
              value={supplierDraft.name}
              onChange={(event) => setSupplierDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Country</span>
            <input
              aria-label="Supplier country"
              maxLength={2}
              value={supplierDraft.country}
              onChange={(event) => setSupplierDraft((current) => ({ ...current, country: event.target.value.toUpperCase() }))}
            />
          </label>
          <label className="field-row">
            <span>Contact email</span>
            <input
              aria-label="Supplier contact email"
              value={supplierDraft.contactEmail}
              onChange={(event) => setSupplierDraft((current) => ({ ...current, contactEmail: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Lead time days</span>
            <input
              aria-label="Supplier lead time days"
              min={1}
              type="number"
              value={supplierDraft.leadTimeDays}
              onChange={(event) => setSupplierDraft((current) => ({ ...current, leadTimeDays: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>Payment terms</span>
            <input
              aria-label="Supplier payment terms"
              value={supplierDraft.paymentTerms}
              onChange={(event) => setSupplierDraft((current) => ({ ...current, paymentTerms: event.target.value }))}
            />
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => void createSupplier()}
            disabled={busyId === 'supplier-create' || !supplierDraft.name.trim() || !supplierDraft.contactEmail.trim()}
          >
            <Plus size={16} />
            Create Supplier
          </button>
        </div>
        <div className="document-list compact-list supplier-list">
          {supplierRows.slice(0, 5).map((supplier) => (
            <div className="document-row supplier-row" key={supplier.id}>
              <div>
                <strong>{supplier.name}</strong>
                <span>{supplier.country} / {supplier.contactEmail} / {supplier.paymentTerms}</span>
                <span>{supplier.leadTimeDays}d lead time</span>
              </div>
              <StatusBadge status={supplier.status} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Low-Stock to PO" icon={ShoppingCart}>
        <div className="shopping-list">
          {lowStockSuggestions.length === 0 ? (
            <div className="empty-state compact">No low-stock materials need a purchase order.</div>
          ) : (
            lowStockSuggestions.map((suggestion) => (
              <div className="shopping-row" key={suggestion.materialId}>
                <div>
                  <strong>{suggestion.materialName}</strong>
                  <span>
                    {formatGrams(suggestion.availableGrams)} available / suggest {formatGrams(suggestion.suggestedOrderGrams)}
                  </span>
                  <span>{suggestion.reason}</span>
                </div>
                <button className="ghost-button small" type="button" onClick={() => prepareLowStockOrder(suggestion)}>
                  Use in PO
                </button>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel title="RFQ Comparison" icon={BadgeDollarSign}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Material</span>
            <select
              aria-label="RFQ material"
              value={selectedMaterialId}
              onChange={(event) => {
                setSelectedMaterialId(event.target.value)
                setRfqComparison(null)
              }}
            >
              {materialOptions.map((material) => (
                <option key={material.id} value={material.id}>{material.name}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Quantity grams</span>
            <input
              aria-label="RFQ quantity grams"
              min={1}
              step={1}
              type="number"
              value={rfqQuantityGrams}
              onChange={(event) => setRfqQuantityGrams(Number(event.target.value))}
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void compareRfq()} disabled={busyId === 'rfq-compare' || !selectedMaterial || rfqQuantityGrams <= 0}>
            <BadgeDollarSign size={16} />
            {busyId === 'rfq-compare' ? 'Comparing' : 'Compare suppliers'}
          </button>
        </div>
        {rfqComparison ? (
          <div className="document-list compact-list">
            {rfqComparison.options.map((option) => (
              <div className="document-row purchase-order-row" key={option.supplierId}>
                <div>
                  <strong>{option.supplierName}</strong>
                  <span>{option.country} / {option.leadTimeDays}d lead / {option.source === 'PRICE_HISTORY' ? 'historical price' : 'material reference'}</span>
                  <span>{formatCurrency(option.totalCost)} total / {formatCurrency(option.unitCost)} per gram</span>
                </div>
                <div className="document-actions">
                  {option.isRecommended ? <DataTag label="Recommended" value="Lowest total" tone="green" /> : null}
                  <button
                    className="ghost-button small"
                    type="button"
                    onClick={() => void awardRfq(option)}
                    disabled={busyId === `rfq-award-${option.supplierId}`}
                  >
                    {busyId === `rfq-award-${option.supplierId}` ? 'Awarding' : 'Award to PO'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">Compare current supplier cost evidence before creating a purchase order.</div>
        )}
      </Panel>

      <Panel title="Create Purchase Order" icon={ClipboardCheck}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Supplier</span>
            <select
              aria-label="Purchase order supplier"
              value={orderDraft.supplierId}
              onChange={(event) => setOrderDraft((current) => ({ ...current, supplierId: event.target.value }))}
            >
              {supplierRows.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Currency</span>
            <input
              aria-label="Purchase order currency"
              maxLength={3}
              value={orderDraft.currency}
              onChange={(event) => setOrderDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
            />
          </label>
        </div>
        <div className="po-line-builder">
          {purchaseOrderLines.map((line, index) => (
            <div className="po-line-builder-row" key={line.id}>
              <strong>Line {index + 1}</strong>
              <label className="field-row">
                <span>Material</span>
                <select
                  aria-label={`Purchase order material ${index + 1}`}
                  value={line.materialId}
                  onChange={(event) => updatePurchaseOrderLine(line.id, { materialId: event.target.value })}
                >
                  {materialOptions.map((material) => (
                    <option key={material.id} value={material.id}>{material.name}</option>
                  ))}
                </select>
              </label>
              <label className="field-row">
                <span>Quantity (g)</span>
                <input
                  aria-label={`Purchase order quantity grams ${index + 1}`}
                  min={1}
                  step={1}
                  type="number"
                  value={line.quantityGrams}
                  onChange={(event) => updatePurchaseOrderLine(line.id, { quantityGrams: Number(event.target.value) })}
                />
              </label>
              <label className="field-row">
                <span>Unit cost</span>
                <input
                  aria-label={`Purchase order unit cost ${index + 1}`}
                  min={0.01}
                  step={0.01}
                  type="number"
                  value={line.unitCost}
                  onChange={(event) => updatePurchaseOrderLine(line.id, { unitCost: Number(event.target.value) })}
                />
              </label>
              <button
                className="ghost-button small"
                type="button"
                onClick={() => removePurchaseOrderLine(line.id)}
                disabled={purchaseOrderLines.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="document-actions">
          <button className="ghost-button small" type="button" onClick={addPurchaseOrderLine}>
            <Plus size={14} />
            Add material
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void createPurchaseOrder()}
            disabled={busyId === 'po-create' || !orderDraft.supplierId || purchaseOrderLines.length === 0}
          >
            Create PO
          </button>
        </div>
        <ul className="policy-list">
          <li>Draft PO creation does not reserve or move inventory.</li>
          <li>Each goods receipt line creates its own lot, RECEIPT movement, and price history evidence.</li>
        </ul>
      </Panel>

      <Panel className="wide" title="Purchase Order Board" icon={Activity}>
        <div className="document-list compact-list purchase-order-list">
          {activeOrders.length === 0 ? (
            <div className="empty-state compact">No active purchase orders.</div>
          ) : (
            activeOrders.map((order) => {
              const supplier = supplierById.get(order.supplierId)
              const orderLines = linesForPurchaseOrder(order)
              return (
                <div className="document-row purchase-order-row" key={order.id}>
                  <div>
                    <strong>{order.id} / {orderLines.length} material {orderLines.length === 1 ? 'line' : 'lines'}</strong>
                    <span>{supplier?.name ?? order.supplierId} / expected {order.expectedDate}</span>
                    <span>{formatGrams(order.receivedGrams)} received of {formatGrams(order.quantityGrams)}</span>
                    <div className="po-receipt-lines">
                      {orderLines.map((line) => {
                        const material = materialById.get(line.materialId)
                        const remainingGrams = line.quantityGrams - line.receivedGrams
                        const receiptKey = `${order.id}:${line.id}`
                        return (
                          <div className="po-receipt-line" key={line.id}>
                            <div>
                              <strong>{material?.name ?? line.materialId}</strong>
                              <span>{formatGrams(line.receivedGrams)} of {formatGrams(line.quantityGrams)} / {formatCurrency(line.unitCost)} per g</span>
                            </div>
                            <input
                              aria-label={`Receive grams for ${order.id} ${line.materialId}`}
                              min={0}
                              max={remainingGrams}
                              step={1}
                              type="number"
                              value={receiveDraft[receiptKey] ?? remainingGrams}
                              onChange={(event) => setReceiveDraft((current) => ({ ...current, [receiptKey]: Number(event.target.value) }))}
                            />
                            <button
                              className="primary-button small"
                              type="button"
                              onClick={() => void receivePurchaseOrder(order, line)}
                              disabled={busyId === order.id || order.status === 'DRAFT' || remainingGrams <= 0}
                            >
                              Receive
                            </button>
                            <button
                              className="ghost-button small"
                              type="button"
                              onClick={() => void receivePurchaseOrder(order, line, true)}
                              disabled={busyId === order.id || order.status === 'DRAFT' || remainingGrams <= 0}
                            >
                              Remaining
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <StatusBadge status={purchaseOrderStatusTone[order.status]} label={order.status} />
                  <div className="document-actions">
                    <button
                      className="ghost-button small"
                      type="button"
                      onClick={() => void sendPurchaseOrder(order.id)}
                      disabled={busyId === order.id || order.status !== 'DRAFT'}
                    >
                      Send
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Panel>

      <Panel title="Goods Receipt Evidence" icon={Database}>
        {lastReceipt ? (
          <div className="metric-grid">
            <Metric label="Lot created" value={lastReceipt.lot.lotNumber} />
            <Metric label="Movement" value={lastReceipt.movement.id} />
            <Metric label="Received" value={formatGrams(lastReceipt.movement.quantityGrams)} />
            <Metric label="Price snapshot" value={lastReceipt.priceHistory.id} />
          </div>
        ) : (
          <div className="empty-state compact">Receive a sent PO to create lot, movement, and price history evidence.</div>
        )}
      </Panel>

      <Panel title="Price History" icon={BadgeDollarSign}>
        <label className="field-row">
          <span>Material</span>
          <select value={selectedMaterialId} onChange={(event) => setSelectedMaterialId(event.target.value)}>
            {materialOptions.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
        </label>
        <div className="document-list compact-list price-history-list">
          {historyRows.length === 0 ? (
            <div className="empty-state compact">No price history captured for this material yet.</div>
          ) : (
            historyRows.slice(0, 6).map((record) => (
              <div className="document-row price-history-row" key={record.id}>
                <div>
                  <strong>{record.purchaseOrderId}</strong>
                  <span>{supplierById.get(record.supplierId)?.name ?? record.supplierId} / {record.source}</span>
                </div>
                <div className="mono-value">{formatCurrency(record.unitCost)}</div>
                <div className="mono-value">{formatGrams(record.quantityGrams)}</div>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel title="Procurement Guardrails" icon={ShieldCheck}>
        <ul className="policy-list">
          <li>Supplier master updates are audited and separate from inventory.</li>
          <li>PO state transitions are explicit: DRAFT, SENT, PARTIAL, RECEIVED.</li>
          <li>Goods receipt creates immutable price history snapshots.</li>
          <li>RFQ comparison remains the next procurement depth item.</li>
        </ul>
      </Panel>
    </div>
  )
}

const skuStatusTone: Record<CommercialSkuRecord['status'], DomainStatus> = {
  ACTIVE: 'active',
  DRAFT: 'draft',
  ARCHIVED: 'review',
}

const quoteStatusTone: Record<QuoteRecord['status'], DomainStatus> = {
  DRAFT: 'draft',
  REVIEW: 'review',
  SENT: 'stable',
  ACCEPTED: 'active',
  DECLINED: 'draft',
  EXPIRED: 'review',
  CONVERTED: 'stable',
}

const sampleStatusTone: Record<SampleRequestRecord['status'], DomainStatus> = {
  REQUESTED: 'active',
  APPROVED: 'stable',
  DECLINED: 'draft',
  CONVERTED: 'review',
}

const orderStatusTone: Record<SalesOrderRecord['status'], DomainStatus> = {
  DRAFT: 'draft',
  CONFIRMED: 'active',
  RESERVED: 'active',
  BACKORDER: 'review',
  PICKING: 'active',
  PACKED: 'testing',
  SHIPPED: 'stable',
  FULFILLED: 'stable',
  DELIVERED: 'stable',
  INVOICED: 'stable',
  CLOSED: 'stable',
  CANCELLED: 'draft',
  HOLD: 'review',
}

const shipmentStatusTone: Record<ShipmentRecord['status'], DomainStatus> = {
  PICKING: 'active',
  PACKED: 'testing',
  SHIPPED: 'stable',
  DELIVERED: 'stable',
}

function CommerceWorkspace({
  stock,
  materialRecords,
  session,
}: {
  stock: ReturnType<typeof stockSummary>
  materialRecords: Material[]
  session: AuthSession
}) {
  const materialOptions = materialRecords.length > 0 ? materialRecords : materials
  const seedSkuAvailability = useMemo<CatalogSkuAvailability[]>(
    () => buildSkuAvailabilityRows(commercialSkus, stock),
    [stock],
  )
  const [skuRows, setSkuRows] = useState<CatalogSkuAvailability[]>(() => seedSkuAvailability)
  const [priceListRows, setPriceListRows] = useState<PriceListRecord[]>(priceLists)
  const [quoteRows, setQuoteRows] = useState<QuoteRecord[]>(quotes)
  const [sampleRows, setSampleRows] = useState<SampleRequestRecord[]>(sampleRequests)
  const [customerRows, setCustomerRows] = useState<CustomerRecord[]>([])
  const [selectedSkuId, setSelectedSkuId] = useState(commercialSkus[0]?.id ?? '')
  const [statusMessage, setStatusMessage] = useState('Loading commerce workspace')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [skuDraft, setSkuDraft] = useState({
    materialId: materialOptions[0]?.id ?? '',
    name: 'Hedione HC 10g',
    description: 'White-label aroma material pack',
    packSizeGrams: 10,
    price: 9,
    currency: 'USD',
    tier: 'Studio' as CommercialSkuRecord['tier'],
    moqPacks: 1,
    labelTemplate: `${clientFallbackBranding.displayName} Neutral Pack`,
  })
  const [priceListDraft, setPriceListDraft] = useState({
    name: 'Studio Loyalty',
    customerGroup: 'Studio' as PriceListRecord['customerGroup'],
    currency: 'USD',
    multiplier: 0.9,
    sampleEligible: true,
  })
  const [quoteDraft, setQuoteDraft] = useState({
    customerId: '',
    newCustomerName: '',
    newCustomerEmail: '',
    customerGroup: 'Studio' as PriceListRecord['customerGroup'],
  })
  const [quoteLines, setQuoteLines] = useState(() => [
    { id: 'quote-line-1', skuId: commercialSkus[0]?.id ?? '', quantityPacks: 1 },
  ])
  const [sampleDraft, setSampleDraft] = useState({
    customer: 'Atelier Preview',
    packs: 1,
  })

  const materialById = useMemo(
    () => new Map(materialOptions.map((material) => [material.id, material])),
    [materialOptions],
  )
  const skuById = useMemo(() => new Map(skuRows.map((sku) => [sku.id, sku])), [skuRows])
  const customerById = useMemo(() => new Map(customerRows.map((customer) => [customer.id, customer])), [customerRows])
  const selectedQuoteCustomer = customerById.get(quoteDraft.customerId)
  const quoteCustomerGroup = selectedQuoteCustomer?.group ?? quoteDraft.customerGroup
  const activePriceListByGroup = useMemo(() => {
    const map = new Map<PriceListRecord['customerGroup'], PriceListRecord>()
    priceListRows.forEach((priceList) => {
      if (priceList.status === 'ACTIVE' && !map.has(priceList.customerGroup)) {
        map.set(priceList.customerGroup, priceList)
      }
    })
    return map
  }, [priceListRows])
  const selectedSku = useMemo(() => skuById.get(selectedSkuId) ?? skuRows[0], [selectedSkuId, skuById, skuRows])
  const selectedMaterial = selectedSku ? materialById.get(selectedSku.materialId) : undefined
  const activePriceList = useMemo(
    () =>
      activePriceListByGroup.get(quoteCustomerGroup) ??
      (selectedSku ? activePriceListByGroup.get(selectedSku.tier) : undefined) ??
      priceListRows[0],
    [activePriceListByGroup, priceListRows, quoteCustomerGroup, selectedSku],
  )
  const quoteLineRows = useMemo(
    () =>
      quoteLines.flatMap((line) => {
        const sku = skuById.get(line.skuId)
        if (!sku) {
          return []
        }
        const unitPrice = sku.price * (activePriceList?.multiplier ?? 1)
        return [{ ...line, sku, unitPrice, lineTotal: unitPrice * line.quantityPacks }]
      }),
    [activePriceList?.multiplier, quoteLines, skuById],
  )
  const quoteTotal = quoteLineRows.reduce((sum, line) => sum + line.lineTotal, 0)

  useEffect(() => {
    setSkuRows((current) => syncSkuAvailabilityRows(current, stock))
  }, [stock])

  useEffect(() => {
    let active = true
    async function loadCommerce() {
      try {
        const [skuPayload, priceListPayload, quotePayload, samplePayload, customerPayload] = await Promise.all([
          requestApi<CatalogSkuAvailability[]>('/catalog/skus'),
          requestApi<PriceListRecord[]>('/price-lists'),
          requestApi<QuoteRecord[]>('/quotes'),
          requestApi<SampleRequestRecord[]>('/samples'),
          requestApi<CustomerRecord[]>('/customers'),
        ])
        if (!active) {
          return
        }
        setSkuRows(skuPayload)
        setPriceListRows(priceListPayload)
        setQuoteRows(quotePayload)
        setSampleRows(samplePayload)
        setCustomerRows(customerPayload)
        setSelectedSkuId((current) => (skuPayload.some((sku) => sku.id === current) ? current : skuPayload[0]?.id ?? ''))
        setQuoteDraft((current) => ({
          ...current,
          customerId: customerPayload.some((customer) => customer.id === current.customerId)
            ? current.customerId
            : customerPayload[0]?.id ?? '',
        }))
        setQuoteLines((current) =>
          current.length > 0
            ? current.map((line) => ({ ...line, skuId: skuPayload.some((sku) => sku.id === line.skuId) ? line.skuId : skuPayload[0]?.id ?? '' }))
            : [{ id: 'quote-line-1', skuId: skuPayload[0]?.id ?? '', quantityPacks: 1 }],
        )
        setStatusMessage('Commerce API synced: catalog, price lists, quotes, and sample queue are live')
      } catch (error) {
        if (active) {
          setStatusMessage(error instanceof Error ? error.message : 'Using local commerce seed until API is reachable')
        }
      }
    }
    void loadCommerce()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setSkuDraft((current) => ({
      ...current,
      materialId: materialOptions.some((material) => material.id === current.materialId)
        ? current.materialId
        : materialOptions[0]?.id ?? '',
    }))
  }, [materialOptions])

  async function createSku() {
    setBusyId('sku-create')
    setStatusMessage('Creating commercial SKU without stock storage')
    try {
      const payload = await requestApi<CatalogSkuCreateResponse>('/catalog/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...skuDraft,
          packSizeGrams: Number(skuDraft.packSizeGrams),
          price: Number(skuDraft.price),
          moqPacks: Number(skuDraft.moqPacks),
        }),
      })
      setSkuRows((current) => [payload.sku, ...current])
      setSelectedSkuId(payload.sku.id)
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'SKU create failed')
    } finally {
      setBusyId(null)
    }
  }

  async function createPriceList() {
    setBusyId('price-list-create')
    setStatusMessage('Creating customer price list')
    try {
      const payload = await requestApi<PriceListCreateResponse>('/price-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...priceListDraft,
          multiplier: Number(priceListDraft.multiplier),
        }),
      })
      setPriceListRows((current) => [payload.priceList, ...current])
      setQuoteDraft((current) => ({ ...current, customerGroup: payload.priceList.customerGroup }))
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Price list create failed')
    } finally {
      setBusyId(null)
    }
  }

  async function createQuote() {
    if (!selectedQuoteCustomer || quoteLineRows.length === 0) {
      return
    }
    setBusyId('quote-create')
    setStatusMessage('Creating quote from inventory-derived SKU availability')
    try {
      const payload = await requestApi<QuoteCreateResponse>('/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedQuoteCustomer.id,
          customer: selectedQuoteCustomer.name,
          customerGroup: selectedQuoteCustomer.group,
          lines: quoteLineRows.map((line) => ({ skuId: line.sku.id, quantityPacks: Number(line.quantityPacks) })),
        }),
      })
      setQuoteRows((current) => [payload.quote, ...current])
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Quote create failed')
    } finally {
      setBusyId(null)
    }
  }
  async function createQuoteCustomer() {
    if (!quoteDraft.newCustomerName.trim()) {
      return
    }
    setBusyId('quote-customer-create')
    try {
      const payload = await requestApi<CustomerCreateResponse>('/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quoteDraft.newCustomerName.trim(),
          group: quoteDraft.customerGroup,
          contactEmail: quoteDraft.newCustomerEmail.trim() || undefined,
          creditLimit: 250,
          paymentTerms: 'NET_15',
        }),
      })
      setCustomerRows((current) => [payload.customer, ...current])
      setQuoteDraft((current) => ({
        ...current,
        customerId: payload.customer.id,
        newCustomerName: '',
        newCustomerEmail: '',
      }))
      setStatusMessage(`Customer ${payload.customer.name} created and selected for quote`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Customer create failed')
    } finally {
      setBusyId(null)
    }
  }

  function addQuoteLine() {
    const skuId = selectedSku?.id ?? skuRows[0]?.id ?? ''
    if (!skuId || quoteLines.some((line) => line.skuId === skuId)) {
      setStatusMessage('Choose a different SKU from the catalog before adding another quote line')
      return
    }
    setQuoteLines((current) => [
      ...current,
      { id: `quote-line-${Date.now()}`, skuId, quantityPacks: 1 },
    ])
  }

  function updateQuoteLine(id: string, patch: Partial<{ skuId: string; quantityPacks: number }>) {
    setQuoteLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  function removeQuoteLine(id: string) {
    setQuoteLines((current) => (current.length > 1 ? current.filter((line) => line.id !== id) : current))
  }

  function printQuote(quote: QuoteRecord) {
    const customer = customerRows.find((item) => item.name === quote.customer)
    const lines = quote.lines?.length
      ? quote.lines
      : [{ skuId: quote.skuId, quantityPacks: quote.quantityPacks, unitPrice: quote.unitPrice, lineTotal: quote.total }]
    const printableLines = lines
      .map((line) => `<tr><td>${escapePrintHtml(skuById.get(line.skuId)?.name ?? line.skuId)}</td><td>${line.quantityPacks}</td><td>${escapePrintHtml(formatCurrency(line.unitPrice))}</td><td>${escapePrintHtml(formatCurrency(line.lineTotal))}</td></tr>`)
      .join('')
    const printed = openPrintDocument(
      `Quote ${quote.id}`,
      `<main class="sheet"><header class="header"><div><div class="brand">OlfactoryOps</div><div class="muted">Fragrance materials quotation</div></div><div class="tag">${escapePrintHtml(quote.id)}</div></header>
      <section class="grid"><div class="field"><strong>Customer</strong>${escapePrintHtml(quote.customer)}</div><div class="field"><strong>Customer group</strong>${escapePrintHtml(quote.customerGroup)}</div><div class="field"><strong>Contact</strong>${escapePrintHtml(customer?.contactEmail ?? 'To be confirmed')}</div><div class="field"><strong>Issued</strong>${escapePrintHtml(new Date(quote.createdAt).toLocaleDateString())}</div></section>
      <table><thead><tr><th>SKU</th><th>Packs</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>${printableLines}</tbody></table>
      <section class="grid"><div class="field"><strong>Quote status</strong>${escapePrintHtml(quote.status)}</div><div class="field"><strong>Total</strong>${escapePrintHtml(formatCurrency(quote.total))} ${escapePrintHtml(quote.currency)}</div></section>
      <section class="signatures"><div class="signature">Prepared by</div><div class="signature">Accepted by client</div><div class="signature">Date</div></section></main>`,
    )
    setStatusMessage(printed ? `${quote.id} opened for print or Save as PDF` : 'Allow pop-ups to print or save the quote as PDF')
  }

  async function requestSample() {
    if (!selectedSku) {
      return
    }
    setBusyId('sample-create')
    setStatusMessage('Requesting sample without reservation')
    try {
      const payload = await requestApi<SampleRequestCreateResponse>('/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: selectedSku.id,
          customer: sampleDraft.customer,
          packs: Number(sampleDraft.packs),
        }),
      })
      setSampleRows((current) => [payload.sample, ...current])
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Sample request failed')
    } finally {
      setBusyId(null)
    }
  }

  async function updateQuoteStatus(quoteId: string, status: 'ACCEPTED' | 'DECLINED' | 'EXPIRED') {
    setBusyId(`quote-status:${quoteId}`)
    try {
      const payload = await requestApi<{ quote: QuoteRecord; invariant: string }>(`/quotes/${encodeURIComponent(quoteId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setQuoteRows((current) => current.map((quote) => (quote.id === quoteId ? payload.quote : quote)))
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Quote lifecycle update failed')
    } finally {
      setBusyId(null)
    }
  }

  async function convertQuoteToOrder(quoteId: string) {
    setBusyId(`quote-convert:${quoteId}`)
    try {
      const payload = await requestApi<{ quote: QuoteRecord; order: SalesOrderRecord; customer: CustomerRecord; invariant: string }>(
        `/quotes/${encodeURIComponent(quoteId)}/convert`,
        { method: 'POST' },
      )
      setQuoteRows((current) => current.map((quote) => (quote.id === quoteId ? payload.quote : quote)))
      setCustomerRows((current) =>
        current.some((customer) => customer.id === payload.customer.id) ? current : [payload.customer, ...current],
      )
      setStatusMessage(`${payload.invariant} Created ${payload.order.id}.`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Quote conversion failed')
    } finally {
      setBusyId(null)
    }
  }

  async function updateSampleStatus(sampleId: string, status: 'APPROVED' | 'DECLINED' | 'CONVERTED') {
    setBusyId(`sample-status:${sampleId}`)
    try {
      const payload = await requestApi<{ sample: SampleRequestRecord; invariant: string }>(`/samples/${encodeURIComponent(sampleId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setSampleRows((current) => current.map((sample) => (sample.id === sampleId ? payload.sample : sample)))
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Sample lifecycle update failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="workspace-grid commerce-grid">
      <Panel title="SKU Catalog" icon={BadgeDollarSign} right={<DataTag label="Status" value={statusMessage} tone="blue" />}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Material</span>
            <select
              aria-label="SKU material"
              value={skuDraft.materialId}
              onChange={(event) => setSkuDraft((current) => ({ ...current, materialId: event.target.value }))}
            >
              {materialOptions.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>SKU name</span>
            <input
              aria-label="SKU name"
              value={skuDraft.name}
              onChange={(event) => setSkuDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Pack grams</span>
            <input
              aria-label="SKU pack grams"
              min={1}
              type="number"
              value={skuDraft.packSizeGrams}
              onChange={(event) => setSkuDraft((current) => ({ ...current, packSizeGrams: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>Price</span>
            <input
              aria-label="SKU price"
              min={0.01}
              step={0.01}
              type="number"
              value={skuDraft.price}
              onChange={(event) => setSkuDraft((current) => ({ ...current, price: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>Tier</span>
            <select
              aria-label="SKU tier"
              value={skuDraft.tier}
              onChange={(event) => setSkuDraft((current) => ({ ...current, tier: event.target.value as CommercialSkuRecord['tier'] }))}
            >
              <option value="Studio">Studio</option>
              <option value="Lab">Lab</option>
              <option value="Bulk">Bulk</option>
            </select>
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => void createSku()}
            disabled={busyId === 'sku-create' || !skuDraft.name.trim() || skuDraft.packSizeGrams <= 0 || skuDraft.price <= 0}
          >
            <Plus size={16} />
            Create SKU
          </button>
        </div>
        <div className="document-list compact-list sku-list">
          {skuRows.map((sku) => {
            const material = materialById.get(sku.materialId)
            return (
              <button
                className={`document-row sku-row ${selectedSku?.id === sku.id ? 'is-active' : ''}`}
                key={sku.id}
                type="button"
                onClick={() => setSelectedSkuId(sku.id)}
              >
                <div>
                  <strong>{sku.name}</strong>
                  <span>{material?.name ?? sku.materialId} / {formatGrams(sku.packSizeGrams)} pack / {sku.tier}</span>
                  <span>{sku.description}</span>
                </div>
                <StatusBadge status={skuStatusTone[sku.status]} label={sku.status} />
                <DataTag label="Can sell" value={`${sku.canSellPacks} packs`} tone={sku.canSellPacks > 0 ? 'green' : 'amber'} />
                <div className="mono-value">{formatCurrency(sku.price)}</div>
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel title="Price Lists" icon={Database}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Name</span>
            <input
              aria-label="Price list name"
              value={priceListDraft.name}
              onChange={(event) => setPriceListDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Customer group</span>
            <select
              aria-label="Price list customer group"
              value={priceListDraft.customerGroup}
              onChange={(event) =>
                setPriceListDraft((current) => ({ ...current, customerGroup: event.target.value as PriceListRecord['customerGroup'] }))
              }
            >
              <option value="Studio">Studio</option>
              <option value="Lab">Lab</option>
              <option value="Bulk">Bulk</option>
              <option value="Contract">Contract</option>
            </select>
          </label>
          <label className="field-row">
            <span>Multiplier</span>
            <input
              aria-label="Price list multiplier"
              min={0.1}
              step={0.01}
              type="number"
              value={priceListDraft.multiplier}
              onChange={(event) => setPriceListDraft((current) => ({ ...current, multiplier: Number(event.target.value) }))}
            />
          </label>
          <label className="toggle-row">
            <input
              checked={priceListDraft.sampleEligible}
              type="checkbox"
              onChange={(event) => setPriceListDraft((current) => ({ ...current, sampleEligible: event.target.checked }))}
            />
            Sample eligible
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => void createPriceList()}
            disabled={busyId === 'price-list-create' || !priceListDraft.name.trim() || priceListDraft.multiplier <= 0}
          >
            Create Price List
          </button>
        </div>
        <div className="document-list compact-list">
          {priceListRows.slice(0, 5).map((priceList) => (
            <div className="document-row price-list-row" key={priceList.id}>
              <div>
                <strong>{priceList.name}</strong>
                <span>{priceList.customerGroup} / {priceList.currency} / multiplier {priceList.multiplier.toFixed(2)}</span>
              </div>
              <StatusBadge status={priceList.status === 'ACTIVE' ? 'active' : 'draft'} label={priceList.status} />
              <DataTag label="Samples" value={priceList.sampleEligible ? 'Yes' : 'No'} tone={priceList.sampleEligible ? 'green' : 'amber'} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Quote Builder" icon={ClipboardCheck}>
        {selectedSku ? (
          <>
            <div className="material-form-grid">
              <label className="field-row">
                <span>Customer list</span>
                <select
                  aria-label="Quote customer"
                  value={quoteDraft.customerId}
                  onChange={(event) => setQuoteDraft((current) => ({ ...current, customerId: event.target.value }))}
                >
                  {customerRows.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name} / {customer.group}</option>
                  ))}
                </select>
              </label>
              <label className="field-row">
                <span>New customer name</span>
                <input aria-label="New quote customer name" value={quoteDraft.newCustomerName} onChange={(event) => setQuoteDraft((current) => ({ ...current, newCustomerName: event.target.value }))} />
              </label>
              <label className="field-row">
                <span>New customer email</span>
                <input aria-label="New quote customer email" type="email" value={quoteDraft.newCustomerEmail} onChange={(event) => setQuoteDraft((current) => ({ ...current, newCustomerEmail: event.target.value }))} />
              </label>
              <label className="field-row">
                <span>New customer group</span>
                <select aria-label="New quote customer group" value={quoteDraft.customerGroup} onChange={(event) => setQuoteDraft((current) => ({ ...current, customerGroup: event.target.value as PriceListRecord['customerGroup'] }))}>
                  <option value="Studio">Studio</option><option value="Lab">Lab</option><option value="Bulk">Bulk</option><option value="Contract">Contract</option>
                </select>
              </label>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void createQuoteCustomer()}
                disabled={busyId === 'quote-customer-create' || !quoteDraft.newCustomerName.trim()}
              >
                Create customer
              </button>
            </div>
            <div className="document-list compact-list">
              {quoteLineRows.map((line) => (
                <div className="document-row quote-row" key={line.id}>
                  <div>
                    <strong>{line.sku.name}</strong>
                    <span>{formatGrams(line.sku.packSizeGrams)} / {line.sku.canSellPacks} packs available</span>
                  </div>
                  <label className="field-row compact-field">
                    <span>Packs</span>
                    <input aria-label={`Quote packs ${line.sku.id}`} min={1} type="number" value={line.quantityPacks} onChange={(event) => updateQuoteLine(line.id, { quantityPacks: Number(event.target.value) })} />
                  </label>
                  <div className="mono-value">{formatCurrency(line.lineTotal)}</div>
                  <button className="ghost-button tiny" type="button" onClick={() => removeQuoteLine(line.id)} disabled={quoteLines.length === 1}>Remove</button>
                </div>
              ))}
            </div>
            <div className="action-row">
              <button className="ghost-button small" type="button" onClick={addQuoteLine}>Add selected SKU</button>
              <button className="primary-button" type="button" onClick={() => void createQuote()} disabled={busyId === 'quote-create' || !selectedQuoteCustomer || quoteLineRows.length === 0 || quoteLineRows.some((line) => line.quantityPacks <= 0)}>
                Create Quote
              </button>
            </div>
            <div className="metric-grid">
              <Metric label="Customer" value={selectedQuoteCustomer?.name ?? 'Create or select customer'} />
              <Metric label="Quote lines" value={String(quoteLineRows.length)} />
              <Metric label="Price list" value={activePriceList?.name ?? 'Not available'} />
              <Metric label="Quote total" value={formatCurrency(quoteTotal)} />
            </div>
          </>
        ) : (
          <div className="empty-state compact">Create or select a SKU to build a quote.</div>
        )}
      </Panel>

      <Panel title="Sample Queue & Label" icon={PackageCheck}>
        {selectedSku ? (
          <>
            <div className="material-form-grid">
              <label className="field-row">
                <span>Customer</span>
                <input
                  aria-label="Sample customer"
                  value={sampleDraft.customer}
                  onChange={(event) => setSampleDraft((current) => ({ ...current, customer: event.target.value }))}
                />
              </label>
              <label className="field-row">
                <span>Packs</span>
                <input
                  aria-label="Sample packs"
                  min={1}
                  max={2}
                  type="number"
                  value={sampleDraft.packs}
                  onChange={(event) => setSampleDraft((current) => ({ ...current, packs: Number(event.target.value) }))}
                />
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={() => void requestSample()}
                disabled={busyId === 'sample-create' || !sampleDraft.customer.trim() || sampleDraft.packs <= 0}
              >
                Request Sample
              </button>
            </div>
            <div className="label-preview-card commerce-label-preview">
              <strong>{clientFallbackBranding.displayName}</strong>
              <span>{selectedSku.labelTemplate}</span>
              <code>{selectedSku.id} / {selectedMaterial?.cas ?? selectedSku.materialId} / {formatGrams(selectedSku.packSizeGrams)}</code>
            </div>
          </>
        ) : (
          <div className="empty-state compact">Select a SKU to preview workspace label and sample request.</div>
        )}
      </Panel>

      <Panel className="wide" title="Quote & Sample Evidence" icon={Activity}>
        <div className="commerce-evidence-grid">
          <div className="document-list compact-list">
            {quoteRows.slice(0, 5).map((quote) => (
              <div className="document-row quote-row" key={quote.id}>
                <div>
                  <strong>{quote.id} / {quote.customer}</strong>
                  <span>{quote.customerGroup} / {quote.lines?.length ?? 1} SKU line(s) / {quote.lines?.reduce((sum, line) => sum + line.quantityPacks, 0) ?? quote.quantityPacks} packs</span>
                </div>
                <StatusBadge status={quoteStatusTone[quote.status]} label={quote.status} />
                <div className="mono-value">{formatCurrency(quote.total)}</div>
                <div className="document-actions">
                  <button className="ghost-button tiny" type="button" onClick={() => printQuote(quote)}>Print / PDF</button>
                  <a className="ghost-button tiny" href={`mailto:${encodeURIComponent(customerRows.find((customer) => customer.name === quote.customer)?.contactEmail ?? '')}?subject=${encodeURIComponent(`Quotation ${quote.id}`)}&body=${encodeURIComponent(`Hello ${quote.customer},\n\nPlease find quotation ${quote.id} totaling ${formatCurrency(quote.total)} ${quote.currency}.\n\nRegards,\nOlfactoryOps`)}`}>Email</a>
                  {quote.status === 'SENT' ? <button className="ghost-button tiny" type="button" onClick={() => void updateQuoteStatus(quote.id, 'ACCEPTED')} disabled={busyId === `quote-status:${quote.id}`}>Accept</button> : null}
                  {quote.status === 'SENT' ? <button className="ghost-button tiny danger" type="button" onClick={() => void updateQuoteStatus(quote.id, 'DECLINED')} disabled={busyId === `quote-status:${quote.id}`}>Decline</button> : null}
                  {quote.status === 'ACCEPTED' ? <button className="primary-button tiny" type="button" onClick={() => void convertQuoteToOrder(quote.id)} disabled={busyId === `quote-convert:${quote.id}`}>Create Order</button> : null}
                </div>
              </div>
            ))}
          </div>
          <div className="document-list compact-list">
            {sampleRows.slice(0, 5).map((sample) => (
              <div className="document-row sample-row" key={sample.id}>
                <div>
                  <strong>{sample.id} / {skuById.get(sample.skuId)?.name ?? sample.skuId}</strong>
                  <span>{sample.customer} / {sample.packs} pack(s)</span>
                </div>
                <StatusBadge status={sampleStatusTone[sample.status]} label={sample.status} />
                <div className="document-actions">
                  {sample.status === 'REQUESTED' ? <button className="ghost-button tiny" type="button" onClick={() => void updateSampleStatus(sample.id, 'APPROVED')} disabled={busyId === `sample-status:${sample.id}`}>Approve</button> : null}
                  {sample.status === 'REQUESTED' ? <button className="ghost-button tiny danger" type="button" onClick={() => void updateSampleStatus(sample.id, 'DECLINED')} disabled={busyId === `sample-status:${sample.id}`}>Decline</button> : null}
                  {sample.status === 'APPROVED' ? <button className="ghost-button tiny" type="button" onClick={() => void updateSampleStatus(sample.id, 'CONVERTED')} disabled={busyId === `sample-status:${sample.id}`}>Mark converted</button> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {isInternalAdminSession(session) ? <Panel title="Commerce Guardrails" icon={ShieldCheck}>
        <ul className="policy-list">
          <li>SKU records store pack, price, label, and material mapping only.</li>
          <li>Available packs are derived from approved inventory lots at read time.</li>
          <li>Quotes and samples do not create reservations or InventoryMovement rows.</li>
          <li>Public storefront, customer portal, and document-per-SKU surfacing remain next gates.</li>
        </ul>
      </Panel> : null}
    </div>
  )
}

function OrdersWorkspace({ stock }: { stock: ReturnType<typeof stockSummary> }) {
  const seedSkuAvailability = useMemo<CatalogSkuAvailability[]>(
    () => buildSkuAvailabilityRows(commercialSkus, stock),
    [stock],
  )
  const [customerRows, setCustomerRows] = useState<CustomerRecord[]>([])
  const [orderRows, setOrderRows] = useState<SalesOrderRecord[]>([])
  const [shipmentRows, setShipmentRows] = useState<ShipmentRecord[]>([])
  const [documentRows, setDocumentRows] = useState<OrderDocumentRecord[]>([])
  const [skuRows, setSkuRows] = useState<CatalogSkuAvailability[]>(() => seedSkuAvailability)
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('Loading orders workspace')
  const [customerDraft, setCustomerDraft] = useState({
    name: 'OlfactoryOps Studio',
    group: 'Studio' as CustomerRecord['group'],
    creditLimit: 300,
    paymentTerms: 'NET_15' as CustomerRecord['paymentTerms'],
    contactEmail: 'orders@olfactoryops-studio.example',
    city: 'Los Angeles',
    country: 'US',
  })
  const [orderDraft, setOrderDraft] = useState({
    customerId: '',
    discountPercent: 0,
    taxPercent: 8,
    shippingCost: 12,
  })
  const [orderLines, setOrderLines] = useState(() => [
    { id: 'order-line-1', skuId: commercialSkus[0]?.id ?? '', quantity: 1 },
  ])
  const [shipDraft, setShipDraft] = useState({
    carrier: 'DHL' as ShipmentRecord['carrier'],
    trackingNumber: 'DHL-PHASE12',
  })

  const customerById = useMemo(() => new Map(customerRows.map((customer) => [customer.id, customer])), [customerRows])
  const skuById = useMemo(() => new Map(skuRows.map((sku) => [sku.id, sku])), [skuRows])
  const orderById = useMemo(() => new Map(orderRows.map((order) => [order.id, order])), [orderRows])
  const selectedOrder = useMemo(() => orderById.get(selectedOrderId) ?? orderRows[0], [orderById, orderRows, selectedOrderId])
  const selectedSku = selectedOrder ? skuById.get(selectedOrder.skuId) : undefined
  const selectedCustomer = selectedOrder ? customerById.get(selectedOrder.customerId) : undefined
  const selectedOrderKey = selectedOrder?.id ?? ''
  const selectedShipments = useMemo(
    () => shipmentRows.filter((shipment) => shipment.orderId === selectedOrderKey),
    [selectedOrderKey, shipmentRows],
  )
  const selectedDocuments = useMemo(
    () => documentRows.filter((document) => document.orderId === selectedOrderKey),
    [documentRows, selectedOrderKey],
  )
  const draftCustomer = customerById.get(orderDraft.customerId)
  const draftPriceList = priceLists.find((priceList) => priceList.customerGroup === draftCustomer?.group && priceList.status === 'ACTIVE')
  const draftLineRows = useMemo(
    () =>
      orderLines.flatMap((line) => {
        const sku = skuById.get(line.skuId)
        if (!sku) {
          return []
        }
        const unitPrice = sku.price * (draftPriceList?.multiplier ?? 1)
        return [{ ...line, sku, unitPrice, lineTotal: unitPrice * line.quantity }]
      }),
    [draftPriceList?.multiplier, orderLines, skuById],
  )
  const draftSubtotal = draftLineRows.reduce((sum, line) => sum + line.lineTotal, 0)
  const draftTotal = draftSubtotal * (1 - orderDraft.discountPercent / 100) * (1 + orderDraft.taxPercent / 100) + orderDraft.shippingCost
  const creditAvailable = draftCustomer ? draftCustomer.creditLimit - draftTotal : 0

  const refreshOrders = useCallback(async () => {
    const [customerPayload, orderPayload, shipmentPayload, documentPayload, skuPayload] = await Promise.all([
      requestApi<CustomerRecord[]>('/customers'),
      requestApi<SalesOrderRecord[]>('/orders'),
      requestApi<ShipmentRecord[]>('/shipments'),
      requestApi<OrderDocumentRecord[]>('/order-documents'),
      requestApi<CatalogSkuAvailability[]>('/catalog/skus'),
    ])
    setCustomerRows(customerPayload)
    setOrderRows(orderPayload)
    setShipmentRows(shipmentPayload)
    setDocumentRows(documentPayload)
    setSkuRows(skuPayload)
    setSelectedOrderId((current) => (orderPayload.some((order) => order.id === current) ? current : orderPayload[0]?.id ?? ''))
    return orderPayload
  }, [])

  useEffect(() => {
    let active = true
    async function loadOrders() {
      try {
        const orderPayload = await refreshOrders()
        if (!active) {
          return
        }
        setStatusMessage(`Orders API synced: ${orderPayload.length} order(s), reservation and shipment controls live`)
      } catch (error) {
        if (active) {
          setStatusMessage(error instanceof Error ? error.message : 'Using local order seed until API is reachable')
        }
      }
    }
    void loadOrders()
    return () => {
      active = false
    }
  }, [refreshOrders])

  useEffect(() => {
    setSkuRows((current) => syncSkuAvailabilityRows(current, stock))
  }, [stock])

  useEffect(() => {
    setOrderDraft((current) => ({
      ...current,
      customerId: customerById.has(current.customerId) ? current.customerId : customerRows[0]?.id ?? '',
    }))
    setOrderLines((current) =>
      current.length > 0
        ? current.map((line) => ({ ...line, skuId: skuById.has(line.skuId) ? line.skuId : skuRows[0]?.id ?? '' }))
        : [{ id: 'order-line-1', skuId: skuRows[0]?.id ?? '', quantity: 1 }],
    )
  }, [customerById, customerRows, skuById, skuRows])

  async function createCustomer() {
    setBusyId('customer-create')
    setStatusMessage('Creating customer profile without inventory impact')
    try {
      const payload = await requestApi<CustomerCreateResponse>('/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customerDraft.name,
          group: customerDraft.group,
          creditLimit: Number(customerDraft.creditLimit),
          paymentTerms: customerDraft.paymentTerms,
          contactEmail: customerDraft.contactEmail,
          billingAddress: {
            line1: 'Billing address pending',
            city: customerDraft.city,
            country: customerDraft.country,
          },
          shippingAddress: {
            line1: 'Shipping address pending',
            city: customerDraft.city,
            country: customerDraft.country,
          },
        }),
      })
      setCustomerRows((current) => [payload.customer, ...current])
      setOrderDraft((current) => ({ ...current, customerId: payload.customer.id }))
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Customer create failed')
    } finally {
      setBusyId(null)
    }
  }

  async function createOrder() {
    setBusyId('order-create')
    setStatusMessage('Creating priced sales order without reserving stock')
    try {
      const payload = await requestApi<SalesOrderCreateResponse>('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...orderDraft,
          lines: draftLineRows.map((line) => ({ skuId: line.sku.id, quantity: Number(line.quantity) })),
          discountPercent: Number(orderDraft.discountPercent),
          taxPercent: Number(orderDraft.taxPercent),
          shippingCost: Number(orderDraft.shippingCost),
        }),
      })
      setOrderRows((current) => [payload.order, ...current])
      setSelectedOrderId(payload.order.id)
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Order create failed')
    } finally {
      setBusyId(null)
    }
  }

  function addOrderLine() {
    const skuId = skuRows.find((sku) => !orderLines.some((line) => line.skuId === sku.id))?.id ?? ''
    if (!skuId) {
      setStatusMessage('Each available SKU is already in this order')
      return
    }
    setOrderLines((current) => [...current, { id: `order-line-${Date.now()}`, skuId, quantity: 1 }])
  }

  function updateOrderLine(id: string, patch: Partial<{ skuId: string; quantity: number }>) {
    setOrderLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  function removeOrderLine(id: string) {
    setOrderLines((current) => (current.length > 1 ? current.filter((line) => line.id !== id) : current))
  }

  async function runOrderAction(
    orderId: string,
    action: 'reserve' | 'cancel' | 'pack' | 'ship' | 'fulfill',
    options: { allowPartial?: boolean } = {},
  ) {
    setBusyId(`${action}:${orderId}`)
    const endpoint = `/orders/${encodeURIComponent(orderId)}/${action}`
    try {
      let invariant = ''
      if (action === 'ship') {
        const payload = await requestApi<OrderShipResponse>(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shipDraft),
        })
        invariant = payload.invariant
      } else if (action === 'pack') {
        const payload = await requestApi<OrderPackResponse>(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weightGrams: selectedOrder?.reservedGrams ?? selectedSku?.packSizeGrams ?? 0 }),
        })
        invariant = payload.invariant
      } else if (action === 'reserve') {
        const payload = await requestApi<OrderReservationResponse>(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowPartial: options.allowPartial === true }),
        })
        invariant = payload.invariant
      } else if (action === 'cancel') {
        const payload = await requestApi<OrderCancellationResponse>(endpoint, { method: 'POST' })
        invariant = payload.invariant
      } else {
        const payload = await requestApi<OrderFulfillmentResponse>(endpoint, { method: 'POST' })
        invariant = payload.invariant
      }
      await refreshOrders()
      setSelectedOrderId(orderId)
      setStatusMessage(invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : `${action} failed`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="workspace-grid orders-grid">
      <Panel title="Customer & Order Entry" icon={ShoppingCart} right={<DataTag label="Status" value={statusMessage} tone="blue" />}>
        <div className="order-entry-grid">
          <div className="entry-column">
            <h4>Create Customer</h4>
            <label className="field-row">
              <span>Name</span>
              <input
                aria-label="Customer name"
                value={customerDraft.name}
                onChange={(event) => setCustomerDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="field-row">
              <span>Group</span>
              <select
                aria-label="Customer group"
                value={customerDraft.group}
                onChange={(event) => setCustomerDraft((current) => ({ ...current, group: event.target.value as CustomerRecord['group'] }))}
              >
                <option value="Studio">Studio</option>
                <option value="Lab">Lab</option>
                <option value="Bulk">Bulk</option>
                <option value="Contract">Contract</option>
              </select>
            </label>
            <label className="field-row">
              <span>Credit limit</span>
              <input
                aria-label="Customer credit limit"
                min={0}
                type="number"
                value={customerDraft.creditLimit}
                onChange={(event) => setCustomerDraft((current) => ({ ...current, creditLimit: Number(event.target.value) }))}
              />
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={() => void createCustomer()}
              disabled={busyId === 'customer-create' || !customerDraft.name.trim()}
            >
              <Plus size={16} />
              Create Customer
            </button>
          </div>
          <div className="entry-column">
            <h4>Create Order</h4>
            <label className="field-row">
              <span>Customer</span>
              <select
                aria-label="Order customer"
                value={orderDraft.customerId}
                onChange={(event) => setOrderDraft((current) => ({ ...current, customerId: event.target.value }))}
              >
                {customerRows.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="document-list compact-list">
              {draftLineRows.map((line) => (
                <div className="document-row order-document-row" key={line.id}>
                  <label className="field-row compact-field">
                    <span>SKU</span>
                    <select aria-label={`Order SKU ${line.id}`} value={line.skuId} onChange={(event) => updateOrderLine(line.id, { skuId: event.target.value })}>
                      {skuRows.map((sku) => <option key={sku.id} value={sku.id}>{sku.name}</option>)}
                    </select>
                  </label>
                  <label className="field-row compact-field">
                    <span>Packs</span>
                    <input aria-label={`Order quantity ${line.id}`} min={1} type="number" value={line.quantity} onChange={(event) => updateOrderLine(line.id, { quantity: Number(event.target.value) })} />
                  </label>
                  <div className="mono-value">{formatCurrency(line.lineTotal)}</div>
                  <button className="ghost-button tiny" type="button" onClick={() => removeOrderLine(line.id)} disabled={orderLines.length === 1}>Remove</button>
                </div>
              ))}
              <button className="ghost-button small" type="button" onClick={addOrderLine}>Add SKU</button>
            </div>
            <div className="form-triple">
              <label className="field-row">
                <span>Tax %</span>
                <input
                  aria-label="Order tax percent"
                  min={0}
                  type="number"
                  value={orderDraft.taxPercent}
                  onChange={(event) => setOrderDraft((current) => ({ ...current, taxPercent: Number(event.target.value) }))}
                />
              </label>
              <label className="field-row">
                <span>Ship</span>
                <input
                  aria-label="Order shipping cost"
                  min={0}
                  type="number"
                  value={orderDraft.shippingCost}
                  onChange={(event) => setOrderDraft((current) => ({ ...current, shippingCost: Number(event.target.value) }))}
                />
              </label>
            </div>
            <div className="metric-grid compact-metrics">
              <Metric label="Draft total" value={formatCurrency(draftTotal)} />
              <Metric label="Credit headroom" value={formatCurrency(creditAvailable)} />
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => void createOrder()}
              disabled={busyId === 'order-create' || !orderDraft.customerId || draftLineRows.length === 0 || draftLineRows.some((line) => line.quantity <= 0)}
            >
              Create Order
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Order Board" icon={PackageSearch}>
        <div className="document-list compact-list order-list">
          {orderRows.map((order) => {
            const sku = skuById.get(order.skuId)
            const orderLinesForDisplay = order.lines?.length
              ? order.lines
              : [{ skuId: order.skuId, quantity: order.quantity, unitPrice: order.unitPrice, lineTotal: order.unitPrice * order.quantity }]
            const busy = busyId?.endsWith(order.id) ?? false
            return (
              <div
                className={`document-row order-row ${selectedOrder?.id === order.id ? 'is-active' : ''}`}
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    setSelectedOrderId(order.id)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div>
                  <strong>{order.id} / {order.customer}</strong>
                  <span>{orderLinesForDisplay.length === 1 ? `${sku?.name ?? order.skuId} / ${orderLinesForDisplay[0]?.quantity ?? order.quantity} pack(s)` : `${orderLinesForDisplay.length} SKU lines / ${orderLinesForDisplay.reduce((sum, line) => sum + line.quantity, 0)} packs`} / {formatCurrency(order.total)}</span>
                  <span>{formatGrams(order.reservedGrams)} reserved / {formatGrams(order.fulfilledGrams)} fulfilled</span>
                </div>
                <StatusBadge status={orderStatusTone[order.status]} label={order.status} />
                <div className="document-actions">
                  <button
                    className="ghost-button small"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void runOrderAction(order.id, 'reserve')
                    }}
                    disabled={busy || !['DRAFT', 'CONFIRMED', 'BACKORDER'].includes(order.status) || order.reservedGrams > 0}
                  >
                    Reserve
                  </button>
                  <button
                    className="ghost-button small"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void runOrderAction(order.id, 'reserve', { allowPartial: true })
                    }}
                    disabled={busy || !['DRAFT', 'CONFIRMED', 'BACKORDER'].includes(order.status) || order.reservedGrams > 0}
                  >
                    Reserve Available
                  </button>
                  <button
                    className="ghost-button small"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void runOrderAction(order.id, 'pack')
                    }}
                    disabled={busy || !['RESERVED', 'BACKORDER'].includes(order.status) || order.reservedGrams <= 0}
                  >
                    Pack
                  </button>
                  <button
                    className="ghost-button small"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void runOrderAction(order.id, 'ship')
                    }}
                    disabled={busy || order.status !== 'PACKED'}
                  >
                    Ship
                  </button>
                  <button
                    className="primary-button small"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void runOrderAction(order.id, 'fulfill')
                    }}
                    disabled={busy || !['RESERVED', 'BACKORDER', 'PACKED', 'SHIPPED'].includes(order.status) || order.reservedGrams <= 0}
                  >
                    Fulfill
                  </button>
                  <button
                    className="ghost-button small danger"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void runOrderAction(order.id, 'cancel')
                    }}
                    disabled={busy || order.fulfilledGrams > 0 || ['FULFILLED', 'SHIPPED', 'DELIVERED', 'INVOICED', 'CLOSED', 'CANCELLED'].includes(order.status)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title="Reservation vs Available" icon={Boxes}>
        {selectedOrder ? (
          <>
            <div className="metric-grid">
              <Metric label="SKU lines" value={String(selectedOrder.lines?.length ?? 1)} />
              <Metric label="Packs" value={String((selectedOrder.lines?.reduce((sum, line) => sum + line.quantity, 0)) ?? selectedOrder.quantity)} />
              <Metric label="Required" value={formatGrams(orderRequiredGrams(selectedOrder, skuRows))} />
              <Metric label="Reserved" value={formatGrams(selectedOrder.reservedGrams)} />
            </div>
            <div className="allocation-list">
              {(selectedOrder.reservationAllocations ?? []).length === 0 ? (
                <div className="empty-state compact">Reserve this order to generate FEFO lot allocation trace.</div>
              ) : (
                selectedOrder.reservationAllocations?.map((allocation) => (
                  <div className="allocation-row" key={`${allocation.lotId}-${allocation.allocatedGrams}`}>
                    <span>{allocation.lotNumber}</span>
                    <strong>{formatGrams(allocation.allocatedGrams)}</strong>
                    <code>{allocation.materialName}</code>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="empty-state compact">Create or select an order to inspect availability.</div>
        )}
      </Panel>

      <Panel title="Shipping & Documents" icon={Truck}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Carrier</span>
            <select
              aria-label="Shipment carrier"
              value={shipDraft.carrier}
              onChange={(event) => setShipDraft((current) => ({ ...current, carrier: event.target.value as ShipmentRecord['carrier'] }))}
            >
              <option value="DHL">DHL</option>
              <option value="FedEx">FedEx</option>
              <option value="UPS">UPS</option>
              <option value="Pickup">Pickup</option>
            </select>
          </label>
          <label className="field-row">
            <span>Tracking</span>
            <input
              aria-label="Shipment tracking number"
              value={shipDraft.trackingNumber}
              onChange={(event) => setShipDraft((current) => ({ ...current, trackingNumber: event.target.value }))}
            />
          </label>
        </div>
        <div className="order-evidence-grid">
          <div className="document-list compact-list">
            {selectedShipments.length === 0 ? (
              <div className="empty-state compact">Pack the selected order to create shipment trace.</div>
            ) : (
              selectedShipments.map((shipment) => (
                <div className="document-row shipment-row" key={shipment.id}>
                  <div>
                    <strong>{shipment.id} / {shipment.carrier}</strong>
                    <span>{shipment.trackingNumber} / {formatGrams(shipment.weightGrams)}</span>
                  </div>
                  <StatusBadge status={shipmentStatusTone[shipment.status]} label={shipment.status} />
                </div>
              ))
            )}
          </div>
          <div className="document-list compact-list">
            {selectedDocuments.length === 0 ? (
              <div className="empty-state compact">Reserve, pack, or fulfill to generate order documents.</div>
            ) : (
              selectedDocuments.map((document) => (
                <div className="document-row order-document-row" key={document.id}>
                  <div>
                    <strong>{document.type}</strong>
                    <span>{document.url}</span>
                  </div>
                  <StatusBadge status={document.status === 'READY' ? 'stable' : 'draft'} label={document.status} />
                </div>
              ))
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Customer Credit" icon={UsersRound}>
        {selectedCustomer ? (
          <div className="metric-grid">
            <Metric label="Customer" value={selectedCustomer.name} />
            <Metric label="Terms" value={selectedCustomer.paymentTerms} />
            <Metric label="Credit limit" value={formatCurrency(selectedCustomer.creditLimit)} />
            <Metric label="Status" value={selectedCustomer.status} />
          </div>
        ) : (
          <div className="empty-state compact">Select an order to inspect customer credit profile.</div>
        )}
      </Panel>

    </div>
  )
}

function CostingWorkspace() {
  const [costingData, setCostingData] = useState<CostingOverview>(clientFallbackCosting)
  const [formulaCost, setFormulaCost] = useState<FormulaCostReport>(clientFallbackCosting.formula)
  const [batchCost, setBatchCost] = useState<BatchCostReport>(clientFallbackBatchCost)
  const [releasedBatches, setReleasedBatches] = useState<ProductionBatchRecord[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const selectedBatchIdRef = useRef('')
  const [statusMessage, setStatusMessage] = useState('Loading released production cost sheets')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [packSizeGrams, setPackSizeGrams] = useState(50)
  const [targetMarginPercent, setTargetMarginPercent] = useState(58)

  const selectedBatch = releasedBatches.find((batch) => batch.id === selectedBatchId)
  const selectedBatchCogs = useMemo(
    () => costingData.cogs.filter((line) => line.ref === selectedBatchId && line.type === 'PRODUCTION_CONSUMPTION'),
    [costingData.cogs, selectedBatchId],
  )
  const selectedBatchCogsTotal = selectedBatchCogs.reduce((sum, line) => sum + line.cogs, 0)
  const materialNames = useMemo(
    () => new Map(formulaCost.lines.map((line) => [line.materialId, line.materialName])),
    [formulaCost.lines],
  )
  const relevantPolicies = costingData.methodPolicies.filter((policy) => materialNames.has(policy.materialId))
  const safeMarginPercent = Math.min(95, Math.max(0, targetMarginPercent))
  const packCost = batchCost.costPerGram * packSizeGrams
  const recommendedPrice = packCost > 0 ? packCost / (1 - safeMarginPercent / 100) : 0
  const finishedPacks = packSizeGrams > 0 ? Math.floor(batchCost.outputGrams / packSizeGrams) : 0

  const refreshCosting = useCallback(async (requestedBatchId?: string, signal?: AbortSignal) => {
    setIsRefreshing(true)
    try {
      const [overview, batches] = await Promise.all([
        requestApi<CostingOverview>('/costing/overview', { signal }),
        requestApi<ProductionBatchRecord[]>('/production/batches', { signal }),
      ])
      if (signal?.aborted) {
        return
      }

      const nextReleasedBatches = batches.filter((batch) => batch.status === 'RELEASED' && Boolean(batch.outputLot))
      const preferredBatchId = requestedBatchId ?? selectedBatchIdRef.current
      const nextBatchId = nextReleasedBatches.some((batch) => batch.id === preferredBatchId)
        ? preferredBatchId
        : nextReleasedBatches[0]?.id ?? ''

      setCostingData(overview)
      setReleasedBatches(nextReleasedBatches)
      selectedBatchIdRef.current = nextBatchId
      setSelectedBatchId(nextBatchId)

      if (!nextBatchId) {
        setFormulaCost(overview.formula)
        setBatchCost(clientFallbackBatchCost)
        setStatusMessage('No released production batch is ready for costing')
        return
      }

      const selected = nextReleasedBatches.find((batch) => batch.id === nextBatchId)
      if (!selected) {
        return
      }
      const [nextFormulaCost, nextBatchCost] = await Promise.all([
        requestApi<FormulaCostReport>(`/costing/formulas/${encodeURIComponent(selected.formulaId)}`, { signal }),
        requestApi<BatchCostReport>(`/costing/batches/${encodeURIComponent(selected.id)}`, { signal }),
      ])
      if (signal?.aborted) {
        return
      }
      setFormulaCost(nextFormulaCost)
      setBatchCost(nextBatchCost)
      setStatusMessage(`Cost sheet ready for ${selected.id}`)
    } catch {
      if (!signal?.aborted) {
        setStatusMessage('Could not refresh costing data')
      }
    } finally {
      if (!signal?.aborted) {
        setIsRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void refreshCosting(undefined, controller.signal)
    return () => controller.abort()
  }, [refreshCosting])

  return (
    <div className="workspace-grid costing-grid">
      <Panel
        title="Released Production Cost Sheet"
        icon={BadgeDollarSign}
        right={
          <div className="action-row">
            <DataTag label="Status" value={statusMessage} tone="blue" />
            <button className="ghost-button tiny" type="button" onClick={() => void refreshCosting(selectedBatchId)} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        }
      >
        <div className="cost-sheet-controls">
          <label className="field-row">
            <span>Released production batch</span>
            <select
              value={selectedBatchId}
              onChange={(event) => {
                const nextBatchId = event.target.value
                selectedBatchIdRef.current = nextBatchId
                setSelectedBatchId(nextBatchId)
                void refreshCosting(nextBatchId)
              }}
              disabled={releasedBatches.length === 0 || isRefreshing}
            >
              {releasedBatches.length === 0 ? <option value="">No released batches</option> : null}
              {releasedBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.id} / {batch.formulaCode} / {formatGrams(batch.outputLot?.quantityGrams ?? 0)} output
                </option>
              ))}
            </select>
          </label>
          {selectedBatch ? (
            <div className="tag-row cost-sheet-tags">
              <DataTag label="Formula" value={selectedBatch.formulaCode} tone="green" />
              <DataTag label="Output lot" value={selectedBatch.outputLot?.lotNumber ?? 'Pending'} tone="blue" />
              <DataTag label="Released" value="Ready" tone="green" />
            </div>
          ) : null}
        </div>

        {selectedBatch ? (
          <>
            <div className="metric-grid costing-metrics">
              <Metric label="Finished output" value={formatGrams(batchCost.outputGrams)} />
              <Metric label="Target batch" value={formatGrams(batchCost.targetGrams)} />
              <Metric label="Yield variance" value={`${batchCost.yieldVariancePercent.toFixed(2)}%`} />
              <Metric label="Finished cost / gram" value={formatCurrency(batchCost.costPerGram)} />
              <Metric label="Batch cost" value={formatCurrency(batchCost.totalCost)} />
              <Metric label="Input basis" value={batchCost.materialCostBasis === 'ACTUAL_LOT_CONSUMPTION' ? 'Actual lots' : 'Formula estimate'} />
            </div>
            <p className="caveat">{batchCost.invariant}</p>
          </>
        ) : (
          <div className="empty-state compact">
            Complete QC and release a production batch to create a finished-product cost sheet here.
          </div>
        )}
      </Panel>

      <Panel title="Finished Product Pricing" icon={ShoppingCart}>
        {selectedBatch ? (
          <>
            <div className="pricing-scenario-grid">
              <label className="field-row">
                <span>Pack size (g)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={packSizeGrams}
                  onChange={(event) => setPackSizeGrams(Math.max(1, Number(event.target.value) || 1))}
                />
              </label>
              <label className="field-row">
                <span>Target margin (%)</span>
                <input
                  type="number"
                  min="0"
                  max="95"
                  step="1"
                  value={targetMarginPercent}
                  onChange={(event) => setTargetMarginPercent(Math.min(95, Math.max(0, Number(event.target.value) || 0)))}
                />
              </label>
            </div>
            <div className="metric-grid">
              <Metric label="Pack cost" value={formatCurrency(packCost)} />
              <Metric label="Suggested sell price" value={formatCurrency(recommendedPrice)} />
              <Metric label="Gross profit / pack" value={formatCurrency(recommendedPrice - packCost)} />
              <Metric label="Finished packs" value={String(finishedPacks)} />
            </div>
            <p className="caveat">This pricing scenario is calculated from the selected released batch and does not change your catalogue price list.</p>
          </>
        ) : (
          <div className="empty-state compact">Choose a released production batch to calculate pack cost and pricing.</div>
        )}
      </Panel>

      <Panel title="Formula Cost Trace" icon={FlaskConical}>
        <div className="metric-grid costing-metrics">
          <Metric label={`${formulaCost.formulaCode} composition`} value={formatCurrency(formulaCost.totalCost)} />
          <Metric label="Formula cost / gram" value={formatCurrency(formulaCost.costPerGram)} />
          <Metric label="50g formula reference" value={formatCurrency(formulaCost.costPerBottle)} />
          <Metric label="Most expensive" value={formulaCost.mostExpensiveMaterial} />
        </div>
        <div className="trace-strip">
          {formulaCost.trace.slice(0, 4).map((trace) => (
            <span key={trace}>{trace}</span>
          ))}
        </div>
      </Panel>

      <Panel title="Batch Cost Breakdown" icon={Layers3}>
        {selectedBatch ? (
          <div className="metric-grid">
            <Metric label="Raw material" value={formatCurrency(batchCost.materialCost)} />
            <Metric label="Labor" value={formatCurrency(batchCost.laborCost)} />
            <Metric label="Overhead" value={formatCurrency(batchCost.overheadCost)} />
            <Metric label="Total" value={formatCurrency(batchCost.totalCost)} />
          </div>
        ) : (
          <div className="empty-state compact">Batch cost appears when a released batch is selected.</div>
        )}
      </Panel>

      <Panel title="Cost Method & Landed Cost" icon={Database}>
        <div className="cost-policy-list">
          {relevantPolicies.map((policy) => {
            const landed = costingData.landedCosts.find((profile) => profile.materialId === policy.materialId)
            return (
              <div className="cost-policy-row" key={policy.materialId}>
                <div>
                  <strong>{materialNames.get(policy.materialId) ?? policy.materialId}</strong>
                  <span>{policy.method.replaceAll('_', ' ')}</span>
                </div>
                <DataTag label="Overhead" value={`${policy.overheadPercent}%`} tone="amber" />
                <DataTag
                  label="Landed"
                  value={landed ? `${landed.freightPercent + landed.dutyPercent + landed.insurancePercent}%` : '0%'}
                  tone={landed ? 'blue' : undefined}
                />
              </div>
            )
          })}
          {relevantPolicies.length === 0 ? <div className="empty-state compact">Material costing policies will appear with the selected formula.</div> : null}
        </div>
      </Panel>

      <Panel title="Formula Cost Breakdown" icon={Layers3}>
        <div className="cost-breakdown-list">
          {formulaCost.lines.map((line) => (
            <div className="cost-breakdown-row" key={`${line.materialId}-${line.sourcePath}`}>
              <div>
                <strong>{line.materialName}</strong>
                <span>{line.sourcePath}</span>
              </div>
              <span>{formatGrams(line.grams)}</span>
              <span>{line.contributionPercent.toFixed(1)}%</span>
              <strong>{formatCurrency(line.lineCost)}</strong>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Production Input COGS" icon={ClipboardCheck}>
        {selectedBatchCogs.length > 0 ? (
          <>
            <div className="cost-breakdown-list compact-list">
              {selectedBatchCogs.map((line) => (
                <div className="valuation-row" key={line.movementId}>
                  <div>
                    <strong>{line.materialName}</strong>
                    <span>{formatGrams(line.quantityGrams)} from the issued production lot</span>
                  </div>
                  <span>{formatCurrency(line.unitCost)}/g</span>
                  <strong>{formatCurrency(line.cogs)}</strong>
                </div>
              ))}
            </div>
            <p className="caveat">Issued input COGS: {formatCurrency(selectedBatchCogsTotal)}</p>
          </>
        ) : (
          <div className="empty-state compact">Production input cost entries will appear after the batch consumes inventory.</div>
        )}
      </Panel>

      <Panel title="Inventory Valuation" icon={Boxes}>
        <div className="cost-breakdown-list compact-list">
          {costingData.valuation.lines.slice(0, 6).map((line) => (
            <div className="valuation-row" key={line.materialId}>
              <div>
                <strong>{line.materialName}</strong>
                <span>{line.method} / {line.locationBreakdown.map((item) => item.location).join(', ')}</span>
              </div>
              <span>{formatGrams(line.availableGrams)} available</span>
              <strong>{formatCurrency(line.value)}</strong>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function AnalyticsWorkspace() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsDashboardReport>(clientFallbackAnalytics)
  const [statusMessage, setStatusMessage] = useState('Loading analytics dashboard')
  const [runningReportId, setRunningReportId] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const burnChart = analyticsData.burnRate.map((row) => ({
    name: row.materialName.split(' ')[0],
    usage: row.usageGrams,
    daily: row.dailyBurnGrams,
  }))

  const refreshAnalytics = useCallback(async (signal?: AbortSignal) => {
      try {
        const dashboard = await requestApi<AnalyticsDashboardReport>('/analytics/dashboard', {
          signal,
        })
        setAnalyticsData(dashboard)
        setLastSyncedAt(new Date().toISOString())
        setStatusMessage('Live analytics synced from API')
      } catch {
        if (!signal?.aborted) {
          setStatusMessage('Using local analytics seed until API is reachable')
        }
      }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshAnalytics(controller.signal)
      }
    }
    void refreshAnalytics(controller.signal)
    const intervalId = window.setInterval(refreshWhenVisible, 30_000)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refreshAnalytics])

  async function runReport(reportId: string) {
    setRunningReportId(reportId)
    try {
      const result = await requestApi<AnalyticsReportRunResponse>(
        `/analytics/reports/${encodeURIComponent(reportId)}/run`,
        { method: 'POST' },
      )
      setAnalyticsData((current) => ({
        ...current,
        scheduledReports: current.scheduledReports.map((report) =>
          report.id === result.report.id ? result.report : report,
        ),
      }))
      setStatusMessage(`Ran ${result.report.name}`)
    } catch {
      setStatusMessage('Report run failed; keeping existing schedule')
    } finally {
      setRunningReportId(null)
    }
  }

  return (
    <div className="workspace-grid analytics-grid">
      <Panel title="Live Analyst Dashboard" icon={BarChart3} right={<div className="action-row"><DataTag label="Status" value={statusMessage} tone="blue" /><button className="ghost-button tiny" type="button" onClick={() => void refreshAnalytics()}>Refresh</button></div>}>
        <div className="metric-grid analytics-metrics">
          <Metric label="Burn rows" value={String(analyticsData.burnRate.length)} />
          <Metric label="Forecast rows" value={String(analyticsData.lowStockForecast.length)} />
          <Metric label="Expiry risks" value={String(analyticsData.expiryRisk.length)} />
          <Metric label="Reports" value={String(analyticsData.scheduledReports.length)} />
        </div>
        <div className="tag-row">
          <DataTag label="Refresh" value="30 sec" tone="green" />
          <DataTag label="Last sync" value={lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Waiting'} />
        </div>
        <div className="chart-wrap compact-chart">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={burnChart}>
              <defs>
                <linearGradient id="burnUsage" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f766e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" stroke="rgba(225,233,244,0.58)" tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(225,233,244,0.58)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)' }} />
              <Area type="monotone" dataKey="usage" stroke="#0f766e" fill="url(#burnUsage)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="caveat">{analyticsData.invariant}</p>
      </Panel>

      <Panel title="Role Dashboards" icon={UsersRound}>
        <div className="analytics-widget-grid">
          {analyticsData.roleWidgets.map((widget) => (
            <div className="analytics-widget" key={widget.id}>
              <span>{widget.role}</span>
              <strong>{widget.title}</strong>
              <p>{widget.value}</p>
              <small>{widget.drilldown}</small>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Low Stock Forecast" icon={Gauge}>
        <div className="analytics-list">
          {analyticsData.lowStockForecast.slice(0, 6).map((row) => (
            <div className="analytics-row" key={row.materialId}>
              <div>
                <strong>{row.materialName}</strong>
                <span>{row.source} / {formatGrams(row.dailyBurnGrams)} daily burn</span>
              </div>
              <DataTag label="Available" value={formatGrams(row.availableGrams)} />
              <DataTag label="Stockout" value={`${row.daysToStockout}d`} tone={row.daysToStockout < 90 ? 'amber' : 'green'} />
              <DataTag label="Suggest" value={formatGrams(row.suggestedOrderGrams)} tone="blue" />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Expiry Risk" icon={Bell}>
        <div className="analytics-list">
          {analyticsData.expiryRisk.slice(0, 6).map((row) => (
            <div className="analytics-row" key={row.lotId}>
              <div>
                <strong>{row.lotNumber}</strong>
                <span>{row.materialName} / expires {row.expiryDate}</span>
              </div>
              <DataTag label="Risk" value={row.status} tone={row.status === 'HIGH' ? 'amber' : 'green'} />
              <DataTag label="Days" value={String(row.daysUntilExpiry)} />
              <DataTag label="At risk" value={formatGrams(row.gramsAtRisk)} tone="blue" />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Cost Ranking" icon={BadgeDollarSign}>
        <div className="analytics-list compact-list">
          {analyticsData.costRanking.map((row) => (
            <div className="analytics-row" key={row.materialId}>
              <div>
                <strong>#{row.rank} {row.materialName}</strong>
                <span>{formatGrams(row.usageGrams)} usage / {formatCurrency(row.unitCost)}/g</span>
              </div>
              <strong>{formatCurrency(row.extendedCost)}</strong>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Inventory Analytics" icon={PackageSearch}>
        <div className="analytics-list compact-list">
          {analyticsData.inventoryAnalytics.slice(0, 6).map((row) => (
            <div className="analytics-row" key={row.materialId}>
              <div>
                <strong>{row.materialName}</strong>
                <span>{row.family} / aging {row.agingDays}d</span>
              </div>
              <DataTag label="Value" value={formatCurrency(row.inventoryValue)} />
              <DataTag label="Turnover" value={row.turnoverRatio.toFixed(2)} tone={row.deadStock ? 'amber' : 'green'} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Scheduled Reports" icon={FileLock2}>
        <div className="analytics-list">
          {analyticsData.scheduledReports.map((report) => (
            <div className="report-row" key={report.id}>
              <div>
                <strong>{report.name}</strong>
                <span>{report.audience} / {report.cadence} / {report.format}</span>
                <small>Last run: {report.lastRunAt ? new Date(report.lastRunAt).toLocaleString() : 'never'}</small>
              </div>
              <StatusBadge status={report.status === 'ACTIVE' ? 'active' : 'draft'} label={report.status} />
              <button
                className="ghost-button small"
                type="button"
                onClick={() => void runReport(report.id)}
                disabled={runningReportId === report.id}
              >
                {runningReportId === report.id ? 'Running' : 'Run'}
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Analytics Guardrails" icon={ShieldCheck}>
        <ul className="policy-list">
          <li>Dashboard endpoints are GET/read-model first and reconcile movement ledger before displaying insights.</li>
          <li>Scheduled report run updates report evidence and audit only; it does not mutate inventory, orders, or formulas.</li>
          <li>Role widgets surface different drilldowns without bypassing analytics.view permission.</li>
        </ul>
      </Panel>
    </div>
  )
}

function SaasWorkspace({ session }: { session: AuthSession }) {
  const internalAdminView = isInternalAdminSession(session)
  const consoleApiLabel = internalAdminView ? 'Commercial console API' : 'Workspace access API'
  const syncedMessage = internalAdminView ? 'Commercial console synced from live API' : 'Workspace access synced from live API'
  const loadingMessage = internalAdminView ? 'Loading SaaS readiness controls' : 'Loading workspace access controls'
  const fallbackMessage = internalAdminView
    ? 'Using local SaaS readiness seed until API is reachable'
    : 'Using local workspace access seed until API is reachable'
  const fallback = useMemo<SaasConsoleResponse>(() => ({
    plans: [clientFallbackPlan],
    plan: clientFallbackPlan,
    subscription: {
      id: 'SUB-CLIENT-FALLBACK',
      organizationId: session.organizationId,
      planId: clientFallbackPlan.id,
      provider: 'manual',
      collectionMode: 'manual_invoice',
      status: 'trialing',
      currentPeriodStart: 'client-fallback',
      currentPeriodEnd: 'client-fallback',
      canWrite: false,
      canExport: true,
      nextInvoiceAt: 'client-fallback',
      updatedAt: 'client-fallback',
    },
    usage: {
      id: 'USG-CLIENT-FALLBACK',
      organizationId: session.organizationId,
      periodStart: 'client-fallback',
      periodEnd: 'client-fallback',
      activeSeats: 0,
      materials: 0,
      formulas: 0,
      lots: 0,
      documents: 0,
      storageGb: 0,
      apiCalls: 0,
      webhooks: 0,
      auditEvents: 0,
      lastCalculatedAt: 'client-fallback',
    },
    limitChecks: [],
    invoices: [],
    sso: clientFallbackSso,
    apiKeys: [],
    webhooks: [],
    webhookDeliveries: [],
    auditExports: [],
    readiness: [
      {
        key: 'api-offline',
        label: consoleApiLabel,
        status: 'warning',
        detail: 'Client fallback is active until API is reachable',
      },
    ],
    invariant: 'client fallback contains no commercial state; API is source of truth',
  }), [consoleApiLabel, session.organizationId])
  const [saasData, setSaasData] = useState<SaasConsoleResponse>(fallback)
  const [statusMessage, setStatusMessage] = useState(loadingMessage)
  const [auditExport, setAuditExport] = useState<AuditExportResponse | null>(null)
  const [billingAction, setBillingAction] = useState<BillingActionResponse | null>(null)
  const [exporting, setExporting] = useState(false)
  const [billingBusyAction, setBillingBusyAction] = useState<string | null>(null)
  const [trustBusyAction, setTrustBusyAction] = useState<string | null>(null)
  const [trustSecret, setTrustSecret] = useState<{ label: string; value: string } | null>(null)
  const [ssoDraft, setSsoDraft] = useState({
    domain: fallback.sso.domain,
    issuerUrl: fallback.sso.issuerUrl,
    metadataUrl: fallback.sso.metadataUrl ?? '',
    clientId: fallback.sso.clientId ?? '',
    enforceSso: fallback.sso.enforceSso,
    scimEnabled: fallback.sso.scim.enabled,
    roleMapping: Object.entries(fallback.sso.roleMapping).map(([group, role]) => `${group}:${role}`).join('\n'),
  })
  const [apiKeyDraft, setApiKeyDraft] = useState({
    label: 'Operations integration',
    scopes: 'materials.read,orders.write,webhooks.read',
  })
  const [webhookDraft, setWebhookDraft] = useState({
    url: 'https://hooks.example.test/olfactoryops',
    events: 'order.fulfilled,document.downloaded,audit.export.ready',
  })
  const [customDomainDraft, setCustomDomainDraft] = useState('')
  const [customDomainProvisioning, setCustomDomainProvisioning] = useState<SaasCustomDomainRecord | null>(null)
  const [customDomains, setCustomDomains] = useState<SaasCustomDomainRecord[]>([])
  const activeSeats = saasData.usage.activeSeats
  const storageUsedGb = saasData.usage.storageGb
  const apiUsage = saasData.usage.apiCalls
  const saasHealth = useMemo(() => buildSaasHealthSummary(saasData), [saasData])
  const saasHealthSource = statusMessage.toLowerCase().includes('fallback') ? 'Local seed' : 'Live API'
  const canProvisionCustomDomain = session.role === 'Owner' || session.role === 'Admin'

  function syncSsoDraft(next: SsoConfigRecord) {
    setSsoDraft({
      domain: next.domain,
      issuerUrl: next.issuerUrl,
      metadataUrl: next.metadataUrl ?? '',
      clientId: next.clientId ?? '',
      enforceSso: next.enforceSso,
      scimEnabled: next.scim.enabled,
      roleMapping: Object.entries(next.roleMapping).map(([group, role]) => `${group}:${role}`).join('\n'),
    })
  }

  const loadCustomDomains = useCallback(async (signal?: AbortSignal) => {
    if (!canProvisionCustomDomain) {
      setCustomDomains([])
      return []
    }
    const payload = await requestApi<{ domains: SaasCustomDomainRecord[] }>('/saas/custom-domains', { signal })
    setCustomDomains(payload.domains)
    return payload.domains
  }, [canProvisionCustomDomain])

  useEffect(() => {
    const controller = new AbortController()

    async function loadSaasConsole() {
      try {
        const payload = await requestApi<SaasConsoleResponse>('/billing/console', { signal: controller.signal })
        setSaasData(payload)
        syncSsoDraft(payload.sso)
        await loadCustomDomains(controller.signal)
        setStatusMessage(syncedMessage)
      } catch {
        if (!controller.signal.aborted) {
          setStatusMessage(fallbackMessage)
        }
      }
    }

    void loadSaasConsole()

    return () => controller.abort()
  }, [fallbackMessage, loadCustomDomains, syncedMessage])

  async function refreshSaasConsole(status?: string) {
    const consolePayload = await requestApi<SaasConsoleResponse>('/billing/console')
    setSaasData(consolePayload)
    syncSsoDraft(consolePayload.sso)
    await loadCustomDomains()
    if (status) {
      setStatusMessage(status)
    }
    return consolePayload
  }

  function parseCsv(value: string) {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }

  function parseRoleMapping(value: string) {
    return Object.fromEntries(
      value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [group, ...roleParts] = line.split(':')
          return [group?.trim() ?? '', roleParts.join(':').trim()]
        })
        .filter(([group, role]) => group && role),
    )
  }

  async function queueAuditExport() {
    setExporting(true)
    setStatusMessage('Queueing workspace-scoped audit export')
    try {
      const payload = await requestApi<AuditExportResponse>('/audit/export', { method: 'POST' })
      setAuditExport(payload)
      await refreshSaasConsole(`${payload.id} ready for ${payload.scope}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Audit export failed')
    } finally {
      setExporting(false)
    }
  }

  async function runBillingAction(
    action: string,
    path: string,
    init?: RequestInit,
  ) {
    setBillingBusyAction(action)
    setStatusMessage(`Running ${action}`)
    try {
      const payload = await requestApi<BillingActionResponse>(path, { method: 'POST', ...init })
      setBillingAction(payload)
      setStatusMessage(`${payload.mode} ${payload.status}`)
      if (path.includes('/freeze') || path.includes('/reactivate')) {
        await refreshSaasConsole()
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : `${action} failed`)
    } finally {
      setBillingBusyAction(null)
    }
  }

  async function retryWebhookDelivery(deliveryId: string) {
    setBillingBusyAction(deliveryId)
    setStatusMessage(`Retrying ${deliveryId}`)
    try {
      await requestApi<{ invariant: string }>(`/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`, {
        method: 'POST',
      })
      await refreshSaasConsole()
      setStatusMessage(`${deliveryId} delivered with preserved idempotency key`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Webhook retry failed')
    } finally {
      setBillingBusyAction(null)
    }
  }

  async function saveSsoConfig() {
    setTrustBusyAction('sso')
    setTrustSecret(null)
    try {
      const payload = await requestApi<SsoMutationResponse>('/sso-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: saasData.sso.provider,
          domain: ssoDraft.domain,
          issuerUrl: ssoDraft.issuerUrl,
          metadataUrl: ssoDraft.metadataUrl,
          clientId: ssoDraft.clientId,
          enforceSso: ssoDraft.enforceSso,
          jitProvisioning: true,
          scim: {
            enabled: ssoDraft.scimEnabled,
            baseUrl: saasData.sso.scim.baseUrl,
            deprovisionAction: 'revoke_sessions',
          },
          roleMapping: parseRoleMapping(ssoDraft.roleMapping),
        }),
      })
      syncSsoDraft(payload.config)
      await refreshSaasConsole(`${payload.config.domain} trust policy saved`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'SSO update failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  async function rotateScimToken() {
    setTrustBusyAction('scim')
    setTrustSecret(null)
    try {
      const payload = await requestApi<SsoMutationResponse>('/sso-config/scim-token/rotate', { method: 'POST' })
      if (payload.secret) {
        setTrustSecret({ label: 'SCIM bearer token', value: payload.secret })
      }
      await refreshSaasConsole('SCIM token rotated and audit logged')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'SCIM token rotation failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  async function createApiKey() {
    setTrustBusyAction('api-create')
    setTrustSecret(null)
    try {
      const payload = await requestApi<ApiKeyMutationResponse>('/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: apiKeyDraft.label, scopes: parseCsv(apiKeyDraft.scopes) }),
      })
      if (payload.secret) {
        setTrustSecret({ label: `${payload.apiKey.label} API key`, value: payload.secret })
      }
      await refreshSaasConsole(`${payload.apiKey.label} created`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'API key creation failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  async function rotateApiKey(id: string) {
    setTrustBusyAction(id)
    setTrustSecret(null)
    try {
      const payload = await requestApi<ApiKeyMutationResponse>(`/api-keys/${encodeURIComponent(id)}/rotate`, { method: 'POST' })
      if (payload.secret) {
        setTrustSecret({ label: `${payload.apiKey.label} rotated key`, value: payload.secret })
      }
      await refreshSaasConsole(`${id} rotated`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'API key rotation failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  async function revokeApiKey(id: string) {
    setTrustBusyAction(id)
    setTrustSecret(null)
    try {
      await requestApi<ApiKeyMutationResponse>(`/api-keys/${encodeURIComponent(id)}/revoke`, { method: 'POST' })
      await refreshSaasConsole(`${id} revoked`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'API key revoke failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  async function createWebhook() {
    setTrustBusyAction('webhook-create')
    setTrustSecret(null)
    try {
      const payload = await requestApi<WebhookMutationResponse>('/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookDraft.url, events: parseCsv(webhookDraft.events) }),
      })
      if (payload.secret) {
        setTrustSecret({ label: `${payload.webhook.id} signing secret`, value: payload.secret })
      }
      await refreshSaasConsole(`${payload.webhook.id} webhook created`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Webhook creation failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  async function updateWebhookStatus(webhook: WebhookRecord) {
    setTrustBusyAction(webhook.id)
    try {
      const nextStatus = webhook.status === 'active' ? 'paused' : 'active'
      await requestApi<WebhookMutationResponse>(`/webhooks/${encodeURIComponent(webhook.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      await refreshSaasConsole(`${webhook.id} ${nextStatus}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Webhook update failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  async function rotateWebhookSecret(id: string) {
    setTrustBusyAction(id)
    setTrustSecret(null)
    try {
      const payload = await requestApi<WebhookMutationResponse>(`/webhooks/${encodeURIComponent(id)}/rotate-secret`, {
        method: 'POST',
      })
      if (payload.secret) {
        setTrustSecret({ label: `${payload.webhook.id} signing secret`, value: payload.secret })
      }
      await refreshSaasConsole(`${id} signing secret rotated`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Webhook secret rotation failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  async function deleteWebhook(id: string) {
    setTrustBusyAction(id)
    setTrustSecret(null)
    try {
      await requestApi<WebhookMutationResponse>(`/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await refreshSaasConsole(`${id} removed; delivery evidence retained`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Webhook removal failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  async function provisionCustomDomain() {
    setTrustBusyAction('custom-domain')
    try {
      const payload = await requestApi<{ domain: SaasCustomDomainRecord }>('/saas/custom-domains/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: customDomainDraft.trim().toLowerCase() }),
      })
      setCustomDomainProvisioning(payload.domain)
      setCustomDomains((current) => [payload.domain, ...current.filter((domain) => domain.id !== payload.domain.id)])
      setCustomDomainDraft('')
      setStatusMessage(`Cloudflare accepted ${payload.domain.hostname}; complete the DNS/DCV record before going live`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Custom domain provisioning failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  async function refreshCustomDomain(domain: SaasCustomDomainRecord) {
    setTrustBusyAction(domain.id)
    try {
      const payload = await requestApi<{ domain: SaasCustomDomainRecord }>(`/saas/custom-domains/${encodeURIComponent(domain.id)}/refresh`, {
        method: 'POST',
      })
      setCustomDomainProvisioning(payload.domain)
      setCustomDomains((current) => current.map((candidate) => candidate.id === payload.domain.id ? payload.domain : candidate))
      await refreshSaasConsole(`${payload.domain.hostname} is ${payload.domain.status.replace('_', ' ')}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Custom domain status refresh failed')
    } finally {
      setTrustBusyAction(null)
    }
  }

  return (
    <div className="workspace-grid saas-grid">
      {internalAdminView ? (
        <Panel
          className="wide saas-health-panel"
          title="SaaS Health"
          icon={Gauge}
          right={<StatusBadge status={saasHealthTone(saasHealth.status)} label={`${saasHealth.score}%`} />}
        >
          <div className="saas-health-summary">
            <div className="saas-health-score">
              <span className="mono-small">Commercial readiness</span>
              <strong>{saasHealth.score}%</strong>
              <span>
                {saasHealth.blockedCount > 0
                  ? 'Blocked controls need admin action before launch.'
                  : saasHealth.warningCount > 0
                    ? 'Sell-ready with warnings to watch before launch.'
                    : 'All SaaS health controls are passing.'}
              </span>
            </div>
            <div className="metric-grid saas-health-metrics">
              <Metric label="Passing" value={`${saasHealth.passCount}/${saasHealth.factors.length}`} />
              <Metric label="Warnings" value={String(saasHealth.warningCount)} />
              <Metric label="Blocked" value={String(saasHealth.blockedCount)} />
              <Metric label="Source" value={saasHealthSource} />
            </div>
          </div>
          <div className={`usage-meter saas-health-meter tone-${saasHealth.status}`} aria-label="SaaS health score">
            <span style={{ width: `${saasHealth.score}%` }} />
          </div>
          <div className="document-list compact-list saas-health-list">
            {saasHealth.factors.map((factor) => (
              <div className="document-row" key={factor.key}>
                <div>
                  <strong>{factor.label}</strong>
                  <span>{factor.detail}</span>
                </div>
                <StatusBadge status={saasHealthTone(factor.status)} label={factor.status.toUpperCase()} />
              </div>
            ))}
          </div>
          <div className="action-row">
            <button
              className="ghost-button"
              type="button"
              onClick={() => void refreshSaasConsole('SaaS health recalculated from live API')}
            >
              Refresh health
            </button>
            <DataTag label="Invariant" value="server-side gates" tone="green" />
          </div>
        </Panel>
      ) : null}

      <Panel title="Workspace Access" icon={ShieldCheck}>
        <div className="metric-grid">
          <Metric label="Status" value={saasData.subscription.status.toUpperCase()} />
          <Metric label="Seats" value={`${activeSeats}/${saasData.plan.seats}`} />
          <Metric label="Storage" value={`${storageUsedGb.toFixed(3)}/${saasData.plan.storageGb}GB`} />
        </div>
        <div className="usage-meter">
          <span style={{ width: `${Math.min(100, (activeSeats / saasData.plan.seats) * 100)}%` }} />
        </div>
        <div className="action-row">
          {internalAdminView && saasData.subscription.canWrite ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => void runBillingAction('freeze', '/billing/subscription/freeze', {
                body: JSON.stringify({ reason: 'Commercial readiness freeze test' }),
                headers: { 'Content-Type': 'application/json' },
              })}
              disabled={billingBusyAction !== null}
            >
              Freeze workspace
            </button>
          ) : null}
          {internalAdminView && !saasData.subscription.canWrite ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => void runBillingAction('reactivate', '/billing/subscription/reactivate')}
              disabled={billingBusyAction !== null}
            >
              Reactivate
            </button>
          ) : null}
        </div>
        <ul className="policy-list">
          <li>Workspace capacity controls remain enforced server-side before {internalAdminView ? 'commercial writes' : 'workspace changes'}.</li>
          <li>
            {internalAdminView
              ? 'Workspace freeze keeps read/export access and blocks create/update operations.'
              : 'Subscription changes are temporarily managed by OlfactoryOps during beta.'}
          </li>
          <li>{statusMessage}</li>
        </ul>
        {internalAdminView && billingAction ? (
          <div className="audit-export-card">
            <span className="mono-small">{billingAction.id}</span>
            <strong>{billingAction.mode} / {billingAction.status}</strong>
            {billingAction.url ? <span>{billingAction.url}</span> : null}
            <span>{billingAction.invariant}</span>
          </div>
        ) : null}
      </Panel>

      <Panel title="Usage Enforcement" icon={Gauge}>
        <div className="document-list compact-list">
          {saasData.limitChecks.map((check) => (
            <div className="document-row" key={check.key}>
              <div>
                <strong>{check.label}</strong>
                <span>{check.used} / {check.limit} ({check.percent}%)</span>
              </div>
              <StatusBadge
                status={check.status === 'blocked' ? 'alert' : check.status === 'warning' ? 'review' : 'stable'}
                label={check.status.toUpperCase()}
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Invoices & Collection" icon={ClipboardCheck}>
        <div className="document-list compact-list">
          {saasData.invoices.map((invoice) => (
            <div className="document-row" key={invoice.id}>
              <div>
                <strong>{invoice.number}</strong>
                <span>{formatCurrency(invoice.amountDue)} due {new Date(invoice.dueAt).toLocaleDateString()}</span>
                <span>{invoice.hostedInvoiceUrl}</span>
              </div>
              <StatusBadge status={invoice.status === 'paid' ? 'stable' : 'review'} label={invoice.status.toUpperCase()} />
            </div>
          ))}
        </div>
      </Panel>

      {canProvisionCustomDomain ? (
        <Panel title="Custom Domain" icon={Globe2}>
          <p className="caveat">Provision a customer-owned hostname through Cloudflare for SaaS. It becomes the workspace hostname only after Cloudflare reports it active.</p>
          <label className="field-row">
            <span>Hostname</span>
            <input
              value={customDomainDraft}
              placeholder="app.customer-domain.com"
              onChange={(event) => setCustomDomainDraft(event.target.value)}
            />
          </label>
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              disabled={trustBusyAction !== null || !customDomainDraft.trim()}
              onClick={() => void provisionCustomDomain()}
            >
              {trustBusyAction === 'custom-domain' ? 'Provisioning' : 'Provision hostname'}
            </button>
          </div>
          {customDomainProvisioning ? (
            <div className="audit-export-card">
              <span className="mono-small">Cloudflare hostname {customDomainProvisioning.providerId}</span>
              <strong>{customDomainProvisioning.hostname}</strong>
              <StatusBadge
                status={customDomainProvisioning.status === 'active' ? 'stable' : customDomainProvisioning.status === 'failed' ? 'alert' : 'review'}
                label={customDomainProvisioning.status.replace('_', ' ').toUpperCase()}
              />
              {Object.keys(customDomainProvisioning.validation).length > 0 ? (
                Object.entries(customDomainProvisioning.validation).map(([key, value]) => <span key={key}>{key}: {value}</span>)
              ) : (
                <span>Cloudflare did not require an additional DNS record for this hostname.</span>
              )}
            </div>
          ) : null}
          {customDomains.length > 0 ? (
            <div className="document-list compact-list">
              {customDomains.map((domain) => (
                <div className="document-row" key={domain.id}>
                  <div>
                    <strong>{domain.hostname}</strong>
                    <span>Cloudflare: {domain.providerStatus ?? 'pending'} / SSL: {domain.sslStatus ?? 'pending'}</span>
                    {domain.verificationErrors.length > 0 ? <span>{domain.verificationErrors.join(' ')}</span> : null}
                  </div>
                  <div className="action-row">
                    <StatusBadge
                      status={domain.status === 'active' ? 'stable' : domain.status === 'failed' ? 'alert' : 'review'}
                      label={domain.status.replace('_', ' ').toUpperCase()}
                    />
                    <button className="ghost-button tiny" type="button" disabled={trustBusyAction !== null} onClick={() => void refreshCustomDomain(domain)}>
                      {trustBusyAction === domain.id ? 'Checking...' : 'Refresh'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      ) : null}

      {trustSecret ? (
        <Panel className="wide" title="One-Time Secret Reveal" icon={FileLock2}>
          <div className="secret-reveal-card">
            <div>
              <span className="mono-small">{trustSecret.label}</span>
              <strong>{trustSecret.value}</strong>
              <span>This value is not stored in browser state after refresh. Store it in your password manager now.</span>
            </div>
            <button className="ghost-button small" type="button" onClick={() => setTrustSecret(null)}>
              Dismiss
            </button>
          </div>
        </Panel>
      ) : null}

      <Panel title="SSO / SCIM Readiness" icon={LockKeyhole}>
        <div className="tenant-summary">
          <span className="mono-small">{saasData.sso.id}</span>
          <strong>{saasData.sso.provider} for {saasData.sso.domain}</strong>
          <span>Status: {saasData.sso.status} / SCIM {saasData.sso.scim.status}</span>
        </div>
        <div className="settings-form-grid trust-form-grid">
          <label className="field-row">
            <span>Verified domain</span>
            <input value={ssoDraft.domain} onChange={(event) => setSsoDraft((current) => ({ ...current, domain: event.target.value }))} />
          </label>
          <label className="field-row">
            <span>Issuer URL</span>
            <input value={ssoDraft.issuerUrl} onChange={(event) => setSsoDraft((current) => ({ ...current, issuerUrl: event.target.value }))} />
          </label>
          <label className="field-row">
            <span>Metadata URL</span>
            <input value={ssoDraft.metadataUrl} onChange={(event) => setSsoDraft((current) => ({ ...current, metadataUrl: event.target.value }))} />
          </label>
          <label className="field-row">
            <span>Client ID</span>
            <input value={ssoDraft.clientId} onChange={(event) => setSsoDraft((current) => ({ ...current, clientId: event.target.value }))} />
          </label>
          <label className="field-row trust-map-field">
            <span>Group to role mapping</span>
            <textarea value={ssoDraft.roleMapping} onChange={(event) => setSsoDraft((current) => ({ ...current, roleMapping: event.target.value }))} />
          </label>
        </div>
        <div className="action-row">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={ssoDraft.enforceSso}
              onChange={(event) => setSsoDraft((current) => ({ ...current, enforceSso: event.target.checked }))}
            />
            <span>Enforce SSO</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={ssoDraft.scimEnabled}
              onChange={(event) => setSsoDraft((current) => ({ ...current, scimEnabled: event.target.checked }))}
            />
            <span>Enable SCIM</span>
          </label>
          <button className="primary-button" type="button" onClick={() => void saveSsoConfig()} disabled={trustBusyAction !== null}>
            {trustBusyAction === 'sso' ? 'Saving' : 'Save trust policy'}
          </button>
          <button className="ghost-button" type="button" onClick={() => void rotateScimToken()} disabled={trustBusyAction !== null}>
            {trustBusyAction === 'scim' ? 'Rotating' : 'Rotate SCIM token'}
          </button>
        </div>
        <div className="record-grid compact-record-grid">
          {Object.entries(saasData.sso.roleMapping).map(([group, role]) => (
            <div className="record-card" key={group}>
              <div>
                <span className="mono-small">{group}</span>
                <strong>{role}</strong>
                <span>{saasData.sso.scim.deprovisionAction.replace('_', ' ')}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="API Keys" icon={KeyRound}>
        <div className="settings-form-grid trust-form-grid">
          <label className="field-row">
            <span>Key label</span>
            <input value={apiKeyDraft.label} onChange={(event) => setApiKeyDraft((current) => ({ ...current, label: event.target.value }))} />
          </label>
          <label className="field-row">
            <span>Scopes</span>
            <input value={apiKeyDraft.scopes} onChange={(event) => setApiKeyDraft((current) => ({ ...current, scopes: event.target.value }))} />
          </label>
        </div>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={() => void createApiKey()} disabled={trustBusyAction !== null}>
            {trustBusyAction === 'api-create' ? 'Creating' : 'Create API key'}
          </button>
          <DataTag label="Hash" value="server-side SHA-256" tone="green" />
          <DataTag label="Quota" value={`${apiUsage}/${saasData.plan.apiQuota}`} tone="blue" />
        </div>
        <div className="document-list compact-list">
          {saasData.apiKeys.map((key) => (
            <div className="document-row" key={key.id}>
              <div>
                <strong>{key.label}</strong>
                <span>{key.id} / {key.prefix}****{key.lastFour} / rotated {new Date(key.rotatedAt).toLocaleDateString()}</span>
                <span>{key.scopes.join(', ')}</span>
              </div>
              <div className="row-actions">
                <StatusBadge status={key.status === 'active' ? 'stable' : 'alert'} label={key.status.toUpperCase()} />
                {key.status === 'active' ? (
                  <>
                    <button className="ghost-button small" type="button" onClick={() => void rotateApiKey(key.id)} disabled={trustBusyAction !== null}>
                      Rotate
                    </button>
                    <button className="ghost-button small" type="button" onClick={() => void revokeApiKey(key.id)} disabled={trustBusyAction !== null}>
                      Revoke
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Webhooks" icon={Globe2}>
        <div className="settings-form-grid trust-form-grid">
          <label className="field-row">
            <span>Endpoint URL</span>
            <input value={webhookDraft.url} onChange={(event) => setWebhookDraft((current) => ({ ...current, url: event.target.value }))} />
          </label>
          <label className="field-row">
            <span>Events</span>
            <input value={webhookDraft.events} onChange={(event) => setWebhookDraft((current) => ({ ...current, events: event.target.value }))} />
          </label>
        </div>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={() => void createWebhook()} disabled={trustBusyAction !== null}>
            {trustBusyAction === 'webhook-create' ? 'Creating' : 'Create webhook'}
          </button>
          <DataTag label="Limit" value={`${saasData.usage.webhooks}/${saasData.plan.limits.webhooks}`} tone="blue" />
          <DataTag label="Signing" value="HMAC-ready secret" tone="green" />
        </div>
        <div className="document-list compact-list">
          {saasData.webhooks.map((webhook) => (
            <div className="document-row" key={webhook.id}>
              <div>
                <strong>{webhook.id}</strong>
                <span>{webhook.url}</span>
                <span>{webhook.events.join(', ')}</span>
                <span>Secret ****{webhook.signingSecretLastFour} / rotated {new Date(webhook.signingSecretRotatedAt).toLocaleDateString()}</span>
              </div>
              <div className="row-actions">
                <StatusBadge status={webhook.status === 'active' ? 'stable' : 'review'} label={webhook.status.toUpperCase()} />
                <button className="ghost-button small" type="button" onClick={() => void updateWebhookStatus(webhook)} disabled={trustBusyAction !== null}>
                  {webhook.status === 'active' ? 'Pause' : 'Activate'}
                </button>
                <button className="ghost-button small" type="button" onClick={() => void rotateWebhookSecret(webhook.id)} disabled={trustBusyAction !== null}>
                  Rotate
                </button>
                <button className="ghost-button small" type="button" onClick={() => void deleteWebhook(webhook.id)} disabled={trustBusyAction !== null}>
                  Disable
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Webhook Delivery & Retry" icon={RotateCcw}>
        <div className="document-list compact-list">
          {saasData.webhookDeliveries.map((delivery) => (
            <div className="document-row" key={delivery.id}>
              <div>
                <strong>{delivery.event}</strong>
                <span>{delivery.id} / attempts {delivery.attempts} / key {delivery.idempotencyKey}</span>
                <span>Last attempt {new Date(delivery.lastAttemptAt).toLocaleString()}</span>
              </div>
              <div className="row-actions">
                <StatusBadge
                  status={delivery.status === 'delivered' ? 'stable' : delivery.status === 'retrying' ? 'review' : 'alert'}
                  label={delivery.status.toUpperCase()}
                />
                {delivery.status !== 'delivered' ? (
                  <button
                    className="ghost-button small"
                    type="button"
                    onClick={() => void retryWebhookDelivery(delivery.id)}
                    disabled={billingBusyAction === delivery.id}
                  >
                    {billingBusyAction === delivery.id ? 'Retrying' : 'Retry'}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {internalAdminView ? (
        <>
          <Panel title="Commercial Readiness Gate" icon={ShieldCheck}>
            <div className="document-list compact-list">
              {saasData.readiness.map((check) => (
                <div className="document-row" key={check.key}>
                  <div>
                    <strong>{check.label}</strong>
                    <span>{check.detail}</span>
                  </div>
                  <StatusBadge
                    status={check.status === 'blocked' ? 'alert' : check.status === 'warning' ? 'review' : 'stable'}
                    label={check.status.toUpperCase()}
                  />
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="wide" title="Audit Export & Enterprise Evidence" icon={ClipboardCheck}>
            <div className="action-row">
              <button className="primary-button" type="button" onClick={() => void queueAuditExport()} disabled={exporting}>
                {exporting ? 'Queueing' : 'Queue audit export'}
              </button>
              <DataTag label="Scope" value={session.organizationId} tone="blue" />
              <DataTag label="Format" value="JSON" tone="green" />
            </div>
            {auditExport ? (
              <div className="audit-export-card">
                <span className="mono-small">{auditExport.id}</span>
                <strong>{auditExport.status}</strong>
                <span>{auditExport.format} evidence export for {auditExport.scope}</span>
                <span>Audit: {auditExport.audit.requestId}</span>
              </div>
            ) : (
              <div className="empty-state compact">No export queued in this session.</div>
            )}
            <div className="document-list compact-list">
              {saasData.auditExports.map((job) => (
                <div className="document-row" key={job.id}>
                  <div>
                    <strong>{job.id}</strong>
                    <span>{job.format} / {job.scope} / {job.eventCount} event(s)</span>
                    <span>{job.checksum} / expires {new Date(job.expiresAt).toLocaleDateString()}</span>
                  </div>
                  <div className="row-actions">
                    <StatusBadge status={job.status === 'READY' ? 'stable' : job.status === 'FAILED' ? 'alert' : 'review'} label={job.status} />
                    {job.downloadUrl ? <DataTag label="Download" value="signed URL ready" tone="green" /> : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  )
}

function GenericDomainWorkspace({
  domain,
  session,
  onOpenModal,
}: {
  domain: DomainModule
  session: AuthSession
  onOpenModal: (modal: ModalKind) => void
}) {
  const internalAdminView = isInternalAdminSession(session)

  return (
    <div className="workspace-grid generic-grid">
      <Panel title="Feature Set" icon={Layers3}>
        <CardList items={domain.features} />
      </Panel>
      {internalAdminView ? (
        <>
          <Panel title="Entities" icon={Database}>
            <CardList items={domain.entities} mono />
          </Panel>
          <Panel title="Invariants" icon={ShieldCheck}>
            <CardList items={domain.invariants} />
          </Panel>
          <Panel title="API Surface" icon={Command}>
            <CardList items={domain.apis} mono />
          </Panel>
        </>
      ) : null}
      <Panel title="Records" icon={Activity} className="wide">
        <div className="record-grid">
          {records[domain.key].map((record) => (
            <div className="record-card" key={record.id}>
              <div>
                <span className="mono-small">{record.id}</span>
                <strong>{record.label}</strong>
                <span>{record.owner}</span>
              </div>
              <StatusBadge status={record.status} />
              <span className="mono-value">{record.amount}</span>
            </div>
          ))}
        </div>
        {internalAdminView ? (
          <div className="action-row">
            <button className="ghost-button" type="button" onClick={() => onOpenModal('auditExport')}>
              Audit this module
            </button>
            {(domain.key === 'identity' || domain.key === 'saas') && (
              <button className="primary-button" type="button" onClick={() => onOpenModal('ssoPolicy')}>
                <ShieldCheck size={16} />
                Security policy
              </button>
            )}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

function buildCustomizationFallback(): CustomizationConsoleResponse {
  return {
    settings: { ...clientFallbackTenantSettings },
    featureFlags: [],
    numberingSequences: [{ key: 'formula', pattern: 'FRM-####', nextValue: 1, scope: 'brand' }],
    customFields: [],
    branding: { ...clientFallbackBranding },
    audit: [],
    invariant: 'client fallback contains no customization seed; API is source of truth',
  }
}

function fieldStatus(status: CustomFieldDefinition['status']): DomainStatus {
  return status === 'ACTIVE' ? 'stable' : 'draft'
}

function CustomizationWorkspace({ onBrandingSaved }: { onBrandingSaved: (branding: BrandingConfig) => void }) {
  const fallbackCustomization = useMemo(buildCustomizationFallback, [])
  const initialSequence = fallbackCustomization.numberingSequences[0]!
  const [customizationData, setCustomizationData] = useState<CustomizationConsoleResponse>(fallbackCustomization)
  const [customizationStatus, setCustomizationStatus] = useState('Loading customization console')
  const [settingsDraft, setSettingsDraft] = useState<TenantSettingsRecord>(fallbackCustomization.settings)
  const [brandingDraft, setBrandingDraft] = useState<BrandingConfig>(fallbackCustomization.branding)
  const [selectedSequenceKey, setSelectedSequenceKey] = useState(initialSequence.key)
  const [sequenceDraft, setSequenceDraft] = useState<NumberingSequenceRecord>(initialSequence)
  const [sequencePreview, setSequencePreview] = useState(formatSequenceValue(initialSequence))
  const [fieldEntity, setFieldEntity] = useState<CustomFieldDefinition['entity']>('material')
  const [fieldType, setFieldType] = useState<CustomFieldDefinition['fieldType']>('text')
  const [fieldLabel, setFieldLabel] = useState('Regulatory review code')
  const [fieldKey, setFieldKey] = useState('regulatoryReviewCode')
  const [fieldRequired, setFieldRequired] = useState(false)
  const [fieldOptions, setFieldOptions] = useState('citrus, floral, woody')
  const logoImageUrl = normalizeBrandLogoImageUrl(brandingDraft.logoImageUrl)
  const logoImageInvalid = brandingDraft.logoMode === 'image' && !logoImageUrl

  const syncCustomizationData = useCallback((next: CustomizationConsoleResponse, nextStatus: string) => {
    setCustomizationData(next)
    setSettingsDraft(next.settings)
    setBrandingDraft(next.branding)
    const nextSequence =
      next.numberingSequences.find((sequence) => sequence.key === selectedSequenceKey) ?? next.numberingSequences[0]
    if (nextSequence) {
      setSelectedSequenceKey(nextSequence.key)
      setSequenceDraft(nextSequence)
      setSequencePreview(formatSequenceValue(nextSequence))
    }
    setCustomizationStatus(nextStatus)
  }, [selectedSequenceKey])

  const refreshCustomizationConsole = useCallback(async (nextStatus = 'Customization console synced from API') => {
    try {
      const payload = await requestApi<CustomizationConsoleResponse>('/customization-console')
      syncCustomizationData(payload, nextStatus)
    } catch {
      setCustomizationStatus('Using local customization seed until API is reachable')
    }
  }, [syncCustomizationData])

  useEffect(() => {
    void refreshCustomizationConsole()
  }, [refreshCustomizationConsole])

  function selectSequence(key: string) {
    const nextSequence = customizationData.numberingSequences.find((sequence) => sequence.key === key)
    if (!nextSequence) {
      return
    }
    setSelectedSequenceKey(nextSequence.key)
    setSequenceDraft(nextSequence)
    setSequencePreview(formatSequenceValue(nextSequence))
  }

  function addAudit(current: AuditEvent[], audit: AuditEvent) {
    return [audit, ...current].slice(0, 8)
  }

  async function saveSettings() {
    try {
      const payload = await requestApi<SettingsUpdateResponse>('/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settingsDraft,
          defaultDilutionPercent: Number(settingsDraft.defaultDilutionPercent),
        }),
      })
      setCustomizationData((current) => ({
        ...current,
        settings: payload.settings,
        audit: addAudit(current.audit, payload.audit),
      }))
      setSettingsDraft(payload.settings)
      const locale: UiLocale = payload.settings.locale === 'vi-VN' ? 'vi-VN' : 'en-US'
      window.localStorage.setItem(localeStorageKey, locale)
      document.documentElement.lang = locale
      window.dispatchEvent(new CustomEvent<UiLocale>(localeChangeEvent, { detail: locale }))
      setCustomizationStatus('Workspace settings saved with audit evidence')
    } catch {
      setCustomizationStatus('Settings update blocked by customization policy')
    }
  }

  async function toggleFeatureFlag(flag: FeatureFlagRecord, enabled: boolean) {
    setCustomizationData((current) => ({
      ...current,
      featureFlags: current.featureFlags.map((item) => (item.key === flag.key ? { ...item, enabled } : item)),
    }))
    try {
      const payload = await requestApi<FeatureFlagUpdateResponse>(`/feature-flags/${encodeURIComponent(flag.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      setCustomizationData((current) => ({
        ...current,
        featureFlags: current.featureFlags.map((item) =>
          item.key === payload.featureFlag.key ? payload.featureFlag : item,
        ),
        audit: addAudit(current.audit, payload.audit),
      }))
      setCustomizationStatus(`${payload.featureFlag.label} is now ${enabled ? 'enabled' : 'disabled'}`)
    } catch {
      setCustomizationData((current) => ({
        ...current,
        featureFlags: current.featureFlags.map((item) => (item.key === flag.key ? flag : item)),
      }))
      setCustomizationStatus('Feature flag update blocked by customization policy')
    }
  }

  async function previewSequence() {
    try {
      const payload = await requestApi<NumberingPreviewResponse>(
        `/numbering-sequences/${encodeURIComponent(selectedSequenceKey)}/preview`,
      )
      setSequencePreview(payload.value)
      setCustomizationStatus(`Preview generated without incrementing ${payload.key}`)
    } catch {
      setCustomizationStatus('Number preview unavailable')
    }
  }

  async function saveSequence() {
    try {
      const payload = await requestApi<NumberingUpdateResponse>(
        `/numbering-sequences/${encodeURIComponent(selectedSequenceKey)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pattern: sequenceDraft.pattern,
            nextValue: Number(sequenceDraft.nextValue),
            scope: sequenceDraft.scope,
          }),
        },
      )
      setCustomizationData((current) => ({
        ...current,
        numberingSequences: current.numberingSequences.map((sequence) =>
          sequence.key === payload.sequence.key ? payload.sequence : sequence,
        ),
        audit: addAudit(current.audit, payload.audit),
      }))
      setSequenceDraft(payload.sequence)
      setSequencePreview(payload.preview)
      setCustomizationStatus('Numbering sequence saved with monotonic guard')
    } catch {
      setCustomizationStatus('Numbering update blocked; check pattern and next value')
    }
  }

  async function issueNextNumber() {
    try {
      const payload = await requestApi<{ key: string; value: string; invariant: string }>(
        `/numbering-sequences/${encodeURIComponent(selectedSequenceKey)}/next`,
        { method: 'POST' },
      )
      await refreshCustomizationConsole(`Issued ${payload.value} through the sequence service`)
      setSequencePreview(`Issued ${payload.value}`)
    } catch {
      setCustomizationStatus('Numbering issue blocked by sequence service')
    }
  }

  async function createField() {
    try {
      const payload = await requestApi<CustomFieldCreateResponse>('/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: fieldEntity,
          key: fieldKey,
          label: fieldLabel,
          fieldType,
          required: fieldRequired,
          options: fieldOptions
            .split(',')
            .map((option) => option.trim())
            .filter(Boolean),
        }),
      })
      setCustomizationData((current) => ({
        ...current,
        customFields: [payload.customField, ...current.customFields],
        audit: addAudit(current.audit, payload.audit),
      }))
      setFieldLabel('')
      setFieldKey('')
      setCustomizationStatus(`${payload.customField.label} custom field created`)
    } catch {
      setCustomizationStatus('Custom field create blocked; check entity and duplicate key')
    }
  }

  async function saveBranding() {
    if (!brandingDraft.displayName.trim()) {
      setCustomizationStatus('Workspace branding needs a display name')
      return
    }
    if (logoImageInvalid) {
      setCustomizationStatus('Logo image mode needs a valid HTTPS image URL')
      return
    }
    try {
      const payload = await requestApi<BrandingUpdateResponse>('/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...brandingDraft,
          displayName: brandingDraft.displayName.trim(),
          logoImageUrl: brandingDraft.logoImageUrl?.trim() ?? '',
        }),
      })
      setCustomizationData((current) => ({
        ...current,
        branding: payload.branding,
        audit: addAudit(current.audit, payload.audit),
      }))
      setBrandingDraft(payload.branding)
      onBrandingSaved(payload.branding)
      setCustomizationStatus('Workspace branding saved as shared configuration')
    } catch (error) {
      setCustomizationStatus(error instanceof Error ? error.message : 'Branding update blocked by workspace policy')
    }
  }

  return (
    <div className="workspace-grid customization-grid">
      <Panel title="Workspace Settings" icon={Settings}>
        <div className="tag-row">
          <DataTag label="Locale" value={customizationData.settings.locale} />
          <DataTag label="Currency" value={customizationData.settings.currency} tone="blue" />
          <DataTag label="Default unit" value={customizationData.settings.defaultUnit} tone="green" />
        </div>
        <div className="customization-form-grid">
          <label className="field-row">
            <span>Locale</span>
            <select
              aria-label="Customization locale"
              value={settingsDraft.locale}
              onChange={(event) => setSettingsDraft((current) => ({ ...current, locale: event.target.value }))}
            >
              <option value="en-US">English</option>
              <option value="vi-VN">Tieng Viet</option>
            </select>
          </label>
          <label className="field-row">
            <span>Timezone</span>
            <input
              aria-label="Customization timezone"
              value={settingsDraft.timezone}
              onChange={(event) => setSettingsDraft((current) => ({ ...current, timezone: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Currency</span>
            <input
              aria-label="Customization currency"
              value={settingsDraft.currency}
              onChange={(event) => setSettingsDraft((current) => ({ ...current, currency: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Default unit</span>
            <select
              aria-label="Customization default unit"
              value={settingsDraft.defaultUnit}
              onChange={(event) =>
                setSettingsDraft((current) => ({
                  ...current,
                  defaultUnit: event.target.value as TenantSettingsRecord['defaultUnit'],
                }))
              }
            >
              <option value="g">g</option>
              <option value="ml">ml</option>
            </select>
          </label>
          <label className="field-row">
            <span>Default dilution %</span>
            <input
              aria-label="Customization default dilution"
              min={0}
              step={0.1}
              type="number"
              value={settingsDraft.defaultDilutionPercent}
              onChange={(event) =>
                setSettingsDraft((current) => ({
                  ...current,
                  defaultDilutionPercent: Number(event.target.value),
                }))
              }
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void saveSettings()}>
            Save settings
          </button>
        </div>
        <ul className="policy-list">
          <li>{customizationStatus}</li>
          <li>{customizationData.invariant}</li>
        </ul>
      </Panel>

      <Panel title="Feature Flags" icon={Play}>
        <div className="flag-list">
          {customizationData.featureFlags.map((flag) => (
            <label className={`flag-row ${flag.enabled ? 'is-enabled' : ''}`} key={flag.key}>
              <div>
                <strong>{flag.label}</strong>
                <span>{flag.key}</span>
              </div>
              <input
                aria-label={`Toggle ${flag.label}`}
                checked={flag.enabled}
                type="checkbox"
                onChange={(event) => void toggleFeatureFlag(flag, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </Panel>

      <Panel title="Numbering Sequences" icon={Command}>
        <div className="customization-form-grid">
          <label className="field-row">
            <span>Sequence</span>
            <select
              aria-label="Numbering sequence"
              value={selectedSequenceKey}
              onChange={(event) => selectSequence(event.target.value)}
            >
              {customizationData.numberingSequences.map((sequence) => (
                <option key={sequence.key} value={sequence.key}>
                  {sequence.key}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Pattern</span>
            <input
              aria-label="Numbering pattern"
              value={sequenceDraft.pattern}
              onChange={(event) => setSequenceDraft((current) => ({ ...current, pattern: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Next value</span>
            <input
              aria-label="Numbering next value"
              min={0}
              step={1}
              type="number"
              value={sequenceDraft.nextValue}
              onChange={(event) =>
                setSequenceDraft((current) => ({ ...current, nextValue: Number(event.target.value) }))
              }
            />
          </label>
          <label className="field-row">
            <span>Scope</span>
            <select
              aria-label="Numbering scope"
              value={sequenceDraft.scope}
              onChange={(event) =>
                setSequenceDraft((current) => ({
                  ...current,
                  scope: event.target.value as NumberingSequenceRecord['scope'],
                }))
              }
            >
              <option value="brand">brand</option>
              <option value="organization">organization</option>
            </select>
          </label>
        </div>
        <div className="sequence-preview">
          <strong>{sequencePreview}</strong>
          <span>Preview is read-only until you issue the next value.</span>
        </div>
        <div className="action-row">
          <button className="ghost-button" type="button" onClick={() => void previewSequence()}>
            Preview
          </button>
          <button className="primary-button" type="button" onClick={() => void saveSequence()}>
            Save sequence
          </button>
          <button className="ghost-button" type="button" onClick={() => void issueNextNumber()}>
            Issue next
          </button>
        </div>
        <div className="sequence-list">
          {customizationData.numberingSequences.map((sequence) => (
            <button
              className={`sequence-row ${sequence.key === selectedSequenceKey ? 'is-selected' : ''}`}
              key={sequence.key}
              type="button"
              onClick={() => selectSequence(sequence.key)}
            >
              <div>
                <strong>{sequence.key}</strong>
                <span>{sequence.pattern}</span>
              </div>
              <DataTag label="Next" value={String(sequence.nextValue)} />
              <DataTag label="Scope" value={sequence.scope} tone="blue" />
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Custom Fields" icon={Layers3}>
        <div className="customization-form-grid">
          <label className="field-row">
            <span>Entity</span>
            <select
              aria-label="Custom field entity"
              value={fieldEntity}
              onChange={(event) => setFieldEntity(event.target.value as CustomFieldDefinition['entity'])}
            >
              {['material', 'formula', 'lot', 'document', 'supplier', 'order'].map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Field type</span>
            <select
              aria-label="Custom field type"
              value={fieldType}
              onChange={(event) => setFieldType(event.target.value as CustomFieldDefinition['fieldType'])}
            >
              {['text', 'number', 'select', 'date', 'boolean'].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Label</span>
            <input
              aria-label="Custom field label"
              value={fieldLabel}
              onChange={(event) => setFieldLabel(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Key</span>
            <input
              aria-label="Custom field key"
              value={fieldKey}
              onChange={(event) => setFieldKey(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Select options</span>
            <input
              aria-label="Custom field options"
              disabled={fieldType !== 'select'}
              value={fieldOptions}
              onChange={(event) => setFieldOptions(event.target.value)}
            />
          </label>
          <label className="toggle-row">
            <input
              checked={fieldRequired}
              type="checkbox"
              onChange={(event) => setFieldRequired(event.target.checked)}
            />
            Required
          </label>
          <button className="primary-button" type="button" onClick={() => void createField()} disabled={!fieldLabel.trim()}>
            <Plus size={16} />
            Create field
          </button>
        </div>
        <div className="custom-field-list">
          {customizationData.customFields.map((field) => (
            <div className="custom-field-row" key={field.id}>
              <div>
                <strong>{field.label}</strong>
                <span>
                  {field.entity}.{field.key} / {field.fieldType}
                </span>
              </div>
              <DataTag label="Required" value={field.required ? 'yes' : 'no'} tone={field.required ? 'amber' : 'green'} />
              <StatusBadge status={fieldStatus(field.status)} label={field.status} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Workspace & Export Branding" icon={Sparkles}>
        <div className="customization-form-grid">
          <label className="field-row">
            <span>Display name</span>
            <input
              aria-label="Branding display name"
              value={brandingDraft.displayName}
              onChange={(event) => setBrandingDraft((current) => ({ ...current, displayName: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Accent color</span>
            <input
              aria-label="Branding accent color"
              type="color"
              value={brandingDraft.accentColor}
              onChange={(event) => setBrandingDraft((current) => ({ ...current, accentColor: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Sidebar identity</span>
            <select
              aria-label="Branding logo mode"
              value={brandingDraft.logoMode}
              onChange={(event) =>
                setBrandingDraft((current) => ({
                  ...current,
                  logoMode: event.target.value as BrandingConfig['logoMode'],
                }))
              }
            >
              <option value="wordmark">Text wordmark</option>
              <option value="monogram">Workspace initials</option>
              <option value="image">Logo image</option>
            </select>
          </label>
          {brandingDraft.logoMode === 'image' ? (
            <label className="field-row wide-field">
              <span>Logo image URL</span>
              <input
                aria-label="Branding logo image URL"
                inputMode="url"
                placeholder="https://cdn.example.com/brand-logo.png"
                type="url"
                value={brandingDraft.logoImageUrl ?? ''}
                onChange={(event) => setBrandingDraft((current) => ({ ...current, logoImageUrl: event.target.value }))}
              />
              <small className={logoImageInvalid ? 'field-hint is-danger' : 'field-hint'}>
                Use a permanent HTTPS image. The logo is shown to every workspace member.
              </small>
            </label>
          ) : null}
          <label className="field-row">
            <span>Label template</span>
            <input
              aria-label="Branding label template"
              value={brandingDraft.labelTemplate}
              onChange={(event) => setBrandingDraft((current) => ({ ...current, labelTemplate: event.target.value }))}
            />
          </label>
          <label className="field-row wide-field">
            <span>Document footer</span>
            <input
              aria-label="Branding document footer"
              value={brandingDraft.documentFooter}
              onChange={(event) =>
                setBrandingDraft((current) => ({ ...current, documentFooter: event.target.value }))
              }
            />
          </label>
          <button
            className="ghost-button"
            type="button"
            onClick={() =>
              setBrandingDraft((current) => ({
                ...current,
                displayName: 'OlfactoryOps',
                logoMode: 'wordmark',
                logoImageUrl: '',
              }))
            }
          >
            Use OlfactoryOps default
          </button>
          <button
            className="primary-button"
            disabled={!brandingDraft.displayName.trim() || logoImageInvalid}
            type="button"
            onClick={() => void saveBranding()}
          >
            Save workspace branding
          </button>
        </div>
        <div className="branding-preview" style={{ borderColor: `${brandingDraft.accentColor}66` }}>
          <div>
            <span className="mono-small">Workspace & export preview</span>
            <strong style={{ color: brandingDraft.accentColor }}>{brandingDraft.displayName}</strong>
            <span>{brandingDraft.documentFooter}</span>
          </div>
          <div className="branding-preview-media">
            {brandingDraft.logoMode === 'image' && logoImageUrl ? (
              <img alt={`${brandingDraft.displayName || 'Workspace'} logo preview`} src={logoImageUrl} onError={(event) => { event.currentTarget.hidden = true }} />
            ) : (
              <span className="branding-preview-mode">{brandingDraft.logoMode === 'monogram' ? 'Initials' : 'Text wordmark'}</span>
            )}
            <span className="label-preview">
              {brandingDraft.labelTemplate.replace('{brand}', 'NXL').replace('{sequence}', '0430')}
            </span>
          </div>
        </div>
      </Panel>

      <Panel className="wide" title="Customization Audit" icon={ClipboardCheck}>
        <AuditList events={customizationData.audit.length > 0 ? customizationData.audit : auditEvents.slice(0, 4)} />
      </Panel>
    </div>
  )
}

function memberStatus(status: MembershipRecord['status']): DomainStatus {
  if (status === 'ACTIVE') {
    return 'stable'
  }
  if (status === 'INVITED') {
    return 'review'
  }
  return 'draft'
}

function sessionStatus(status: AuthSession['status']): DomainStatus {
  if (status === 'ACTIVE') {
    return 'stable'
  }
  if (status === 'EXPIRED') {
    return 'review'
  }
  return 'draft'
}

const ownerLockedPermissionKeys = ['security.manageUsers', 'security.viewAuditLog', 'security.sessions.manage']

function buildRolePermissionMatrix(
  policies: RolePolicy[],
  catalog: PermissionDefinition[],
): RolePermissionMatrix[] {
  const organizationCatalog = catalog.filter((permission) => permission.scope === 'organization')
  const highRiskPermissionKeys = new Set(
    organizationCatalog
      .filter((permission) => permission.risk === 'high' || permission.risk === 'critical')
      .map((permission) => permission.key),
  )

  return policies.map((policy) => {
    const allowedSet = new Set(policy.permissions)
    const allowedPermissions = organizationCatalog
      .map((permission) => permission.key)
      .filter((permission) => allowedSet.has(permission))
    return {
      role: policy.role,
      scope: policy.scope,
      mfaRequired: policy.mfaRequired,
      allowedPermissions,
      deniedPermissions: organizationCatalog
        .map((permission) => permission.key)
        .filter((permission) => !allowedSet.has(permission)),
      highRiskPermissions: allowedPermissions.filter((permission) => highRiskPermissionKeys.has(permission)),
    }
  })
}

function permissionRiskTone(risk: PermissionDefinition['risk']): 'green' | 'amber' | 'blue' {
  if (risk === 'low') {
    return 'green'
  }
  if (risk === 'medium') {
    return 'blue'
  }
  return 'amber'
}

function IdentityWorkspace() {
  const fallbackTenant = useMemo<TenantConsoleResponse>(() => {
    const organizationRolePolicies = rolePolicies.filter((item) => item.scope === 'organization')
    const organizationPermissionCatalog = permissionCatalog.filter((permission) => permission.scope === 'organization')
    return {
      organization: clientFallbackOrganization,
      brands: [],
      memberships: [],
      sessions: [],
      rolePolicies: organizationRolePolicies,
      permissionCatalog: organizationPermissionCatalog,
      permissionMatrix: buildRolePermissionMatrix(organizationRolePolicies, organizationPermissionCatalog),
      securityPolicy: clientFallbackSecurityPolicy,
      audit: [],
      invariant: 'client fallback contains no workspace seed; API is source of truth',
    }
  }, [])
  const [tenantData, setTenantData] = useState<TenantConsoleResponse>(fallbackTenant)
  const [tenantStatus, setTenantStatus] = useState('Loading workspace console')
  const [approvalQueue, setApprovalQueue] = useState<ApprovalQueueItem[]>([])
  const [inviteEmail, setInviteEmail] = useState('new.viewer@example.test')
  const [inviteRole, setInviteRole] = useState('Viewer')
  const [permissionRole, setPermissionRole] = useState('Viewer')
  const [permissionName, setPermissionName] = useState('inventory.adjust')
  const [permissionBusyKey, setPermissionBusyKey] = useState<string | null>(null)
  const [tenantConsoleReady, setTenantConsoleReady] = useState(false)
  const [probeResult, setProbeResult] = useState<SecurityProbeResult | null>(null)
  const tenantSyncGenerationRef = useRef(0)
  const tenantRefreshIdRef = useRef(0)
  const tenantPermissionMutationRef = useRef(false)
  const permissionOptions = tenantData.permissionCatalog.map((permission) => permission.key)
  const selectedRolePolicy = tenantData.rolePolicies.find((policy) => policy.role === permissionRole) ?? tenantData.rolePolicies[0]
  const selectedRoleMatrix =
    tenantData.permissionMatrix.find((matrix) => matrix.role === selectedRolePolicy?.role) ?? tenantData.permissionMatrix[0]
  const selectedPermissionKeys = new Set(selectedRolePolicy?.permissions ?? [])

  async function refreshTenantConsole(nextStatus = 'Workspace console synced from API') {
    if (tenantPermissionMutationRef.current) {
      return
    }
    const requestId = ++tenantRefreshIdRef.current
    const generation = tenantSyncGenerationRef.current
    const refreshIsCurrent = () =>
      requestId === tenantRefreshIdRef.current &&
      generation === tenantSyncGenerationRef.current &&
      !tenantPermissionMutationRef.current
    try {
      const payload = await requestApi<TenantConsoleResponse>('/security/tenant-console')
      if (!refreshIsCurrent()) {
        return
      }
      setTenantData(payload)
      setTenantConsoleReady(true)
      setTenantStatus(nextStatus)
    } catch {
      if (!refreshIsCurrent()) {
        return
      }
      setTenantConsoleReady(false)
      setTenantStatus('Using local workspace seed until API is reachable')
    }
  }

  async function refreshApprovalQueue() {
    try {
      const [operationPayload, inventoryPayload] = await Promise.all([
        requestApi<{ requests: OperationApprovalRequestRecord[] }>('/approval-requests'),
        requestApi<{ requests: InventoryApprovalRequestRecord[] }>('/inventory/approval-requests'),
      ])
      setApprovalQueue([
        ...operationPayload.requests.map((request) => ({
          id: request.id,
          source: 'operation' as const,
          action: request.action,
          status: request.status,
          targetLabel: request.targetLabel,
          reason: request.reason,
          requiredPermission: request.requiredPermission,
        })),
        ...inventoryPayload.requests.map((request) => ({
          id: request.id,
          source: 'inventory' as const,
          action: request.action,
          status: request.status,
          targetLabel: request.targetLabel,
          reason: request.reason,
          requiredPermission: request.requiredPermission,
        })),
      ])
    } catch {
      setApprovalQueue([])
    }
  }

  useEffect(() => {
    void refreshTenantConsole()
    void refreshApprovalQueue()
  }, [])

  async function reviewApprovalRequest(item: ApprovalQueueItem, decision: 'approve' | 'reject') {
    const basePath = item.source === 'inventory' ? '/inventory/approval-requests' : '/approval-requests'
    try {
      await requestApi(`${basePath}/${encodeURIComponent(item.id)}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: `${decision} from Security approval queue` }),
      })
      await refreshApprovalQueue()
      setTenantStatus(`${item.id} ${decision === 'approve' ? 'approved' : 'rejected'}`)
    } catch (error) {
      setTenantStatus(error instanceof Error ? error.message : `Approval ${decision} failed`)
    }
  }

  async function inviteTenantMember() {
    try {
      await requestApi<TenantInviteResponse>('/security/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          brandIds: [tenantData.brands[0]?.id ?? 'brand-client-fallback'],
        }),
      })
      setInviteEmail('')
      await refreshTenantConsole('Invite created; credential remains invite-only')
    } catch {
      setTenantStatus('Invite blocked by workspace membership policy')
    }
  }

  async function updateMemberStatus(memberId: string, status: MembershipRecord['status']) {
    try {
      await requestApi<MembershipStatusResponse>(`/security/members/${encodeURIComponent(memberId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await refreshTenantConsole(status === 'DEACTIVATED' ? 'Member deactivated and sessions revoked' : 'Member activated')
    } catch {
      setTenantStatus('Membership status update blocked by workspace policy')
    }
  }

  async function revokeTenantSession(sessionId: string) {
    try {
      await requestApi<SessionMutationResponse>(`/security/sessions/${encodeURIComponent(sessionId)}/revoke`, {
        method: 'POST',
      })
      await refreshTenantConsole('Session revoked and audit event recorded')
    } catch {
      setTenantStatus('Session revoke blocked by workspace policy')
    }
  }

  async function revokeAllTenantSessions(email: string) {
    try {
      await requestApi<SessionRevokeAllResponse>('/security/sessions/revoke-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, keepCurrent: true }),
      })
      await refreshTenantConsole(`All active sessions revoked for ${email}`)
    } catch {
      setTenantStatus('Revoke-all blocked by workspace policy')
    }
  }

  async function touchTenantSession(sessionId: string) {
    try {
      await requestApi<SessionMutationResponse>(`/security/sessions/${encodeURIComponent(sessionId)}/touch`, {
        method: 'POST',
      })
      await refreshTenantConsole('Session idle timeout extended')
    } catch {
      setTenantStatus('Session touch blocked by lifecycle policy')
    }
  }

  async function logoutCurrentSession() {
    try {
      await requestApi<{ session: AuthSession; audit: AuditEvent; invariant: string }>('/auth/logout', { method: 'POST' })
      writeStoredAuthSession(null)
      setTenantStatus('Current session logged out; sign in again to load the workspace console')
    } catch {
      setTenantStatus('Logout blocked by session lifecycle policy')
    }
  }

  async function runTenantProbe(organizationId: string) {
    try {
      await requestApi<SecurityProbeResult>(
        `/security/tenant-probe?organizationId=${encodeURIComponent(organizationId)}`,
      )
      setProbeResult({
        status: 'allowed',
        title: 'Workspace probe allowed',
        detail: `Current session can access ${organizationId}`,
      })
    } catch {
      setProbeResult({
        status: 'blocked',
        title: 'Workspace probe blocked',
        detail: `Current session cannot access ${organizationId}`,
      })
    } finally {
      void refreshTenantConsole('Workspace probe recorded in audit trail')
    }
  }

  async function runPermissionProbe() {
    try {
      await requestApi<SecurityProbeResult>(
        `/security/permission-probe?role=${encodeURIComponent(permissionRole)}&permission=${encodeURIComponent(permissionName)}`,
      )
      setProbeResult({
        status: 'allowed',
        title: 'Permission allowed',
        detail: `${permissionRole} can perform ${permissionName}`,
      })
    } catch {
      setProbeResult({
        status: 'blocked',
        title: 'Permission blocked',
        detail: `${permissionRole} cannot perform ${permissionName}`,
      })
    } finally {
      void refreshTenantConsole('Permission probe recorded in audit trail')
    }
  }

  async function updateRolePermission(role: string, permissionKey: string, enabled: boolean) {
    const rolePolicy = tenantData.rolePolicies.find((policy) => policy.role === role)
    if (!tenantConsoleReady || !rolePolicy || tenantPermissionMutationRef.current) {
      return
    }
    tenantPermissionMutationRef.current = true
    tenantSyncGenerationRef.current += 1
    const busyKey = `${rolePolicy.role}:${permissionKey}`
    const nextPermissions = enabled
      ? Array.from(new Set([...rolePolicy.permissions, permissionKey]))
      : rolePolicy.permissions.filter((permission) => permission !== permissionKey)
    const previousTenantData = tenantData
    const nextRolePolicy = { ...rolePolicy, permissions: nextPermissions }
    const nextRolePolicies = tenantData.rolePolicies.map((policy) =>
      policy.role === nextRolePolicy.role && policy.scope === nextRolePolicy.scope ? nextRolePolicy : policy,
    )
    setPermissionBusyKey(busyKey)
    setTenantData((current) => ({
      ...current,
      rolePolicies: nextRolePolicies,
      permissionMatrix: buildRolePermissionMatrix(nextRolePolicies, current.permissionCatalog),
    }))
    setTenantStatus(`${rolePolicy.role} permission matrix updating...`)
    try {
      const payload = await requestApi<PermissionMatrixResponse>(
        `/security/roles/${encodeURIComponent(rolePolicy.role)}/permissions`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: nextPermissions }),
        },
      )
      setTenantData((current) => {
        const mergedRolePolicies = current.rolePolicies.map((policy) =>
          policy.role === payload.rolePolicy.role && policy.scope === payload.rolePolicy.scope ? payload.rolePolicy : policy,
        )
        return {
          ...current,
          rolePolicies: mergedRolePolicies,
          permissionCatalog: payload.permissionCatalog,
          permissionMatrix: payload.matrix,
          audit: [payload.audit, ...current.audit.filter((event) => event.id !== payload.audit.id)],
          invariant: payload.invariant,
        }
      })
      setTenantStatus(`${rolePolicy.role} permission matrix updated`)
      setProbeResult({
        status: 'allowed',
        title: 'Permission matrix updated',
        detail: `${rolePolicy.role} ${enabled ? 'now includes' : 'no longer includes'} ${permissionKey}`,
      })
    } catch (error) {
      setTenantData(previousTenantData)
      const message = error instanceof Error ? error.message : 'Permission update blocked by role policy guard'
      setTenantStatus(message)
      setProbeResult({
        status: 'blocked',
        title: 'Permission update blocked',
        detail: message,
      })
    } finally {
      tenantPermissionMutationRef.current = false
      tenantSyncGenerationRef.current += 1
      setPermissionBusyKey(null)
    }
  }

  return (
    <div className="workspace-grid identity-grid">
      <Panel title="Workspace Boundary" icon={Building2}>
        <div className="tenant-summary">
          <span className="mono-small">{tenantData.organization.id}</span>
          <strong>{tenantData.organization.name}</strong>
          <span>
            {tenantData.organization.plan} / {tenantData.organization.status} / {tenantData.organization.slug}.olfactoryops
          </span>
        </div>
        <div className="tag-row">
          <DataTag label="Contact" value={tenantData.organization.primaryContact} />
          <DataTag label="Brands" value={String(tenantData.brands.length)} tone="blue" />
          <DataTag label="Idle TTL" value={`${tenantData.securityPolicy.idleTimeoutMinutes}m`} tone="green" />
          <DataTag label="Max length" value={`${Math.round(tenantData.securityPolicy.absoluteSessionMinutes / 60)}h`} tone="blue" />
          <DataTag label="Concurrent" value={String(tenantData.securityPolicy.concurrentSessionLimit)} tone="amber" />
        </div>
        <div className="brand-list">
          {tenantData.brands.map((brand) => (
            <div className="brand-row-card" key={brand.id}>
              <div>
                <strong>{brand.name}</strong>
                <span>{brand.id}</span>
              </div>
              <StatusBadge status={brand.status === 'ACTIVE' ? 'stable' : 'draft'} label={brand.status} />
            </div>
          ))}
        </div>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={() => void runTenantProbe('org-nxl')}>
            Probe current workspace
          </button>
          <button className="ghost-button" type="button" onClick={() => void runTenantProbe('org-other')}>
            Probe external workspace
          </button>
        </div>
        {probeResult && (
          <div className={`security-result is-${probeResult.status}`}>
            <strong>{probeResult.title}</strong>
            <span>{probeResult.detail}</span>
          </div>
        )}
      </Panel>

      <Panel
        title="Approval Queue"
        icon={ShieldCheck}
        right={<DataTag label="Pending" value={String(approvalQueue.filter((item) => item.status === 'PENDING').length)} tone="amber" />}
      >
        <div className="member-list">
          {approvalQueue.length > 0 ? (
            approvalQueue.slice(0, 8).map((item) => (
              <div className="member-row" key={`${item.source}-${item.id}`}>
                <div>
                  <strong>{item.targetLabel}</strong>
                  <span>
                    {item.id} / {item.source} / {item.action}
                  </span>
                  <span>{item.reason}</span>
                </div>
                <div className="action-row">
                  <StatusBadge status={item.status === 'PENDING' ? 'review' : item.status === 'APPROVED' ? 'stable' : 'draft'} label={item.status} />
                  {item.status === 'PENDING' ? (
                    <>
                      <button
                        className="ghost-button small"
                        type="button"
                        onClick={() => void reviewApprovalRequest(item, 'reject')}
                      >
                        Reject
                      </button>
                      <button
                        className="primary-button small"
                        type="button"
                        onClick={() => void reviewApprovalRequest(item, 'approve')}
                      >
                        Approve
                      </button>
                    </>
                  ) : (
                    <DataTag label="Reviewed" value={item.source} tone="blue" />
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state compact">
              <strong>No approval requests visible.</strong>
              <span>Requests appear here for their requester and for roles allowed to approve them.</span>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Members & Roles" icon={UsersRound}>
        <div className="tenant-form-row">
          <label className="field-row">
            <span>Invite email</span>
            <input
              aria-label="Invite email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </label>
          <label className="field-row">
            <span>Role</span>
            <select aria-label="Invite role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
              {tenantData.rolePolicies.map((policy) => (
                <option key={policy.role} value={policy.role}>
                  {policy.role}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => void inviteTenantMember()} disabled={!inviteEmail.trim()}>
            <Plus size={16} />
            Invite
          </button>
        </div>

        <div className="member-list">
          {tenantData.memberships.map((member) => (
            <div className="member-row" key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <span>
                  {member.email} / {member.role}
                </span>
              </div>
              <StatusBadge status={memberStatus(member.status)} label={member.status} />
              <DataTag label="MFA" value={member.mfaEnabled ? 'On' : 'Pending'} tone={member.mfaEnabled ? 'green' : 'amber'} />
              {member.status === 'ACTIVE' ? (
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void updateMemberStatus(member.id, 'DEACTIVATED')}
                  disabled={member.role === 'Owner'}
                >
                  Deactivate
                </button>
              ) : (
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void updateMemberStatus(member.id, 'ACTIVE')}
                >
                  Activate
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Session Control"
        icon={LockKeyhole}
        right={
          <button className="ghost-button small" type="button" onClick={() => void logoutCurrentSession()}>
            Logout current
          </button>
        }
      >
        <div className="tag-row">
          <DataTag label="Idle timeout" value={`${tenantData.securityPolicy.idleTimeoutMinutes}m`} tone="green" />
          <DataTag label="Absolute timeout" value={`${tenantData.securityPolicy.absoluteSessionMinutes}m`} tone="blue" />
          <DataTag label="Max sessions" value={String(tenantData.securityPolicy.concurrentSessionLimit)} tone="amber" />
          <DataTag label="New device alert" value={tenantData.securityPolicy.newDeviceAlertEnabled ? 'On' : 'Off'} tone="green" />
        </div>
        <div className="session-list">
          {tenantData.sessions.map((session) => (
            <div className="session-row" key={session.id}>
              <div>
                <strong>{session.email}</strong>
                <span>
                  {session.location} / {session.ipAddress} / {session.userAgent}
                </span>
                <span>
                  Last seen {new Date(session.lastSeenAt).toLocaleTimeString()} / idle until {new Date(session.idleExpiresAt).toLocaleTimeString()}
                </span>
                {session.revokedReason && <span>Reason: {session.revokedReason}</span>}
              </div>
              <StatusBadge status={sessionStatus(session.status)} label={session.status} />
              <span className="mono-value">{new Date(session.expiresAt).toLocaleTimeString()}</span>
              <button
                className="ghost-button small"
                type="button"
                onClick={() => void touchTenantSession(session.id)}
                disabled={session.status !== 'ACTIVE'}
              >
                Touch
              </button>
              <button
                className="ghost-button small"
                type="button"
                onClick={() => void revokeTenantSession(session.id)}
                disabled={session.status === 'REVOKED'}
              >
                Revoke
              </button>
              <button
                className="ghost-button small"
                type="button"
                onClick={() => void revokeAllTenantSessions(session.email)}
                disabled={session.status !== 'ACTIVE'}
              >
                Revoke all
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="wide" title="Permission Matrix" icon={ShieldCheck}>
        <div className="tenant-form-row">
          <label className="field-row">
            <span>Role</span>
            <select
              aria-label="Permission role"
              value={permissionRole}
              disabled={!tenantConsoleReady || permissionBusyKey !== null}
              onChange={(event) => setPermissionRole(event.target.value)}
            >
              {tenantData.rolePolicies.map((policy) => (
                <option key={policy.role} value={policy.role}>
                  {policy.role}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Permission</span>
            <select
              aria-label="Permission name"
              value={permissionName}
              disabled={!tenantConsoleReady || permissionBusyKey !== null}
              onChange={(event) => setPermissionName(event.target.value)}
            >
              {permissionOptions.map((permission) => (
                <option key={permission} value={permission}>
                  {permission}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => void runPermissionProbe()} disabled={!tenantConsoleReady}>
            Run probe
          </button>
        </div>
        <div className="permission-role-strip">
          {tenantData.permissionMatrix.map((matrix) => (
            <button
              className={`permission-role-card ${matrix.role === permissionRole ? 'is-selected' : ''}`}
              key={matrix.role}
              type="button"
              disabled={!tenantConsoleReady || permissionBusyKey !== null}
              onClick={() => setPermissionRole(matrix.role)}
            >
              <strong>{matrix.role}</strong>
              <span>{matrix.allowedPermissions.length} granted / {matrix.deniedPermissions.length} denied</span>
              <span>{matrix.highRiskPermissions.length} high-risk permissions</span>
            </button>
          ))}
        </div>
        {selectedRoleMatrix && (
          <div className="tag-row">
            <DataTag label="Granted" value={String(selectedRoleMatrix.allowedPermissions.length)} tone="green" />
            <DataTag label="Denied" value={String(selectedRoleMatrix.deniedPermissions.length)} tone="blue" />
            <DataTag label="High risk" value={String(selectedRoleMatrix.highRiskPermissions.length)} tone="amber" />
            <DataTag label="MFA" value={selectedRoleMatrix.mfaRequired ? 'Required' : 'Optional'} tone={selectedRoleMatrix.mfaRequired ? 'amber' : 'green'} />
          </div>
        )}
        <div className="permission-grid" key={selectedRolePolicy?.role ?? permissionRole} aria-busy={!tenantConsoleReady}>
          {tenantData.permissionCatalog.map((permission) => {
            const granted = selectedPermissionKeys.has(permission.key)
            const locked = permissionRole === 'Owner' && ownerLockedPermissionKeys.includes(permission.key)
            const busy = permissionBusyKey === `${selectedRolePolicy?.role}:${permission.key}`
            return (
              <label
                className={`permission-row-card ${granted ? 'is-granted' : ''} ${busy ? 'is-busy' : ''}`}
                key={permission.key}
              >
                <input
                  type="checkbox"
                  checked={granted}
                  disabled={!tenantConsoleReady || locked || permissionBusyKey !== null}
                  onChange={(event) => {
                    if (selectedRolePolicy) {
                      void updateRolePermission(selectedRolePolicy.role, permission.key, event.target.checked)
                    }
                  }}
                />
                <span>
                  <strong>{permission.label}</strong>
                  <small>{permission.key}</small>
                  <small>{permission.description}</small>
                  {busy ? <small>Saving permission change...</small> : null}
                </span>
                <DataTag label={permission.category} value={permission.risk} tone={permissionRiskTone(permission.risk)} />
              </label>
            )
          })}
        </div>
        <ul className="policy-list">
          <li>{tenantStatus}</li>
          <li>{tenantData.invariant}</li>
          <li>MFA required for Owner/Admin: {tenantData.securityPolicy.mfaRequiredForOwnerAdmin ? 'yes' : 'no'}</li>
          <li>IP allowlist: {tenantData.securityPolicy.ipAllowlist.join(', ')}</li>
        </ul>
      </Panel>

      <Panel className="wide" title="Workspace Security Audit" icon={ClipboardCheck}>
        <AuditList events={tenantData.audit.length > 0 ? tenantData.audit : auditEvents} />
      </Panel>
    </div>
  )
}

function WorkflowGraph({
  nodes,
  onNavigate,
}: {
  nodes: { key: DomainKey; label: string; detail: string }[]
  onNavigate: (key: DomainKey) => void
}) {
  return (
    <div className="workflow-graph">
      {nodes.map((node, index) => {
        const Icon = domainIcons[node.key]
        return (
          <div className="workflow-step-wrap" key={node.key}>
            <button className="workflow-step" type="button" onClick={() => onNavigate(node.key)}>
              <Icon size={18} />
              <strong>{node.label}</strong>
              <span>{node.detail}</span>
            </button>
            {index < nodes.length - 1 && <ChevronRight className="workflow-arrow" size={18} />}
          </div>
        )
      })}
    </div>
  )
}

function DomainMatrix({ session, onNavigate }: { session: AuthSession; onNavigate: (key: DomainKey) => void }) {
  const internalAdminView = isInternalAdminSession(session)

  return (
    <div className="domain-matrix">
      {visibleDomainsForSession(session).map((domain) => {
        const displayDomain = domainDisplayForSession(domain, session)
        const Icon = domainIcons[domain.key]
        return (
          <button className="domain-cell" key={domain.key} type="button" onClick={() => onNavigate(domain.key)}>
            <Icon size={18} />
            <div>
              <strong>{displayDomain.shortName}</strong>
              <span>{internalAdminView ? displayDomain.owner : displayDomain.screens[0]}</span>
            </div>
            {internalAdminView ? (
              <div className="health-bar">
                <span style={{ width: `${displayDomain.health}%` }} />
              </div>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function EnterpriseReadiness({
  session,
  onOpenModal,
}: {
  session: AuthSession
  onOpenModal: (modal: ModalKind) => void
}) {
  const internalAdminView = isInternalAdminSession(session)

  return (
    <Panel className="enterprise-panel" title={internalAdminView ? 'Enterprise Readiness' : 'Billing Readiness'} icon={ShieldCheck}>
      <div className="enterprise-stack">
        <div className="readiness-item">
          <span>SSO/SCIM</span>
          <StatusBadge status="stable" />
        </div>
        <div className="readiness-item">
          <span>API key rotation</span>
          <StatusBadge status="stable" />
        </div>
        <div className="readiness-item">
          <span>Audit export</span>
          <StatusBadge status="stable" />
        </div>
        <div className="readiness-item">
          <span>{internalAdminView ? 'Dedicated workspace option' : 'Plan limits'}</span>
          <StatusBadge status="active" />
        </div>
      </div>
      <button className="primary-button full" type="button" onClick={() => onOpenModal('ssoPolicy')}>
        {internalAdminView ? 'Open trust layer' : 'Open billing controls'}
      </button>
    </Panel>
  )
}

const evaporationSeriesColors = ['#38bdf8', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#fb7185', '#f97316', '#22c55e']

function EvaporationChart({ curve }: { curve: ReturnType<typeof evaporationCurve> }) {
  const materialSeries = curve[0]?.materials ?? []
  const materialNameById = new Map(materialSeries.map((material) => [material.materialId, material.materialName]))
  const curveData = curve.map((point) => ({
    hour: point.hour,
    ...Object.fromEntries(point.materials.map((material) => [material.materialId, material.remainingPercent])),
  }))
  const checkpoints = [4, 12, 24]
  const pointByHour = new Map(curve.map((point) => [point.hour, point]))

  return (
    <div className="chart-wrap evaporation-chart">
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={curveData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
          <XAxis dataKey="hour" stroke="rgba(158,166,180,.62)" tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} stroke="rgba(158,166,180,.62)" tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
          <Tooltip
            cursor={{ stroke: 'rgba(77,155,255,.32)' }}
            labelFormatter={(hour) => `After ${hour}h`}
            formatter={(value, materialId) => [
              `${Number(value).toFixed(1)}% remaining`,
              materialNameById.get(String(materialId)) ?? String(materialId),
            ]}
            contentStyle={{
              background: 'rgba(9,10,13,.92)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 14,
              color: 'rgba(233,236,243,.92)',
            }}
          />
          <Legend formatter={(materialId) => materialNameById.get(String(materialId)) ?? String(materialId)} />
          {materialSeries.map((material, index) => (
            <Line
              key={material.materialId}
              type="monotone"
              dataKey={material.materialId}
              name={material.materialId}
              stroke={evaporationSeriesColors[index % evaporationSeriesColors.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="evaporation-material-list" aria-label="Material evaporation breakdown">
        {materialSeries.map((material, index) => (
          <div className="evaporation-material-row" key={material.materialId}>
            <div>
              <span
                className="evaporation-swatch"
                style={{ backgroundColor: evaporationSeriesColors[index % evaporationSeriesColors.length] }}
              />
              <strong>{material.materialName}</strong>
              <span>{material.tier} / {material.initialPercent.toFixed(2)}% of formula</span>
            </div>
            {checkpoints.map((hour) => {
              const remaining = pointByHour.get(hour)?.materials.find((item) => item.materialId === material.materialId)?.remainingPercent ?? 0
              return <span key={hour}><b>{hour}h</b> {remaining.toFixed(1)}%</span>
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function MovementTable({
  movements,
  materialRecords = materials,
}: {
  movements: InventoryMovement[]
  materialRecords?: Material[]
}) {
  return (
    <div className="movement-table">
      {movements.map((movement) => {
        const material = materialRecords.find((item) => item.id === movement.materialId)
        return (
          <div className="movement-row" key={movement.id}>
            <span className="mono-value">{movement.id}</span>
            <div>
              <strong>{movement.type}</strong>
              <span>{material?.name}</span>
            </div>
            <StatusBadge status={movement.direction === 'IN' ? 'stable' : 'active'} label={movement.direction} />
            <span className="mono-value">{formatGrams(movement.quantityGrams)}</span>
            <span className="mono-value">{movement.ref}</span>
          </div>
        )
      })}
    </div>
  )
}

function AuditList({ events }: { events: AuditEvent[] }) {
  return (
    <div className="audit-list">
      {events.map((event) => (
        <div className="audit-row" key={event.id}>
          <div>
            <strong>{event.action}</strong>
            <span>{event.actor} / {event.entity}</span>
          </div>
          <StatusBadge
            status={event.outcome === 'allowed' ? 'stable' : event.outcome === 'blocked' ? 'alert' : 'review'}
            label={event.outcome}
          />
          <span className="mono-value">{event.requestId}</span>
        </div>
      ))}
    </div>
  )
}

function UsagePreview({
  allocations,
  shortfalls,
  compact = false,
}: {
  allocations: Allocation[]
  shortfalls: ReturnType<typeof planLabUsage>['shortfalls']
  compact?: boolean
}) {
  return (
    <div className={`usage-preview ${compact ? 'is-compact' : ''}`}>
      {shortfalls.length > 0 && (
        <div className="shortfall-box">
          <strong>Shortfall</strong>
          {shortfalls.map((shortfall) => (
            <span key={shortfall.materialId}>
              {shortfall.materialName}: need {formatGrams(shortfall.requiredGrams)}, available{' '}
              {formatGrams(shortfall.availableGrams)}
            </span>
          ))}
        </div>
      )}
      {allocations.map((allocation) => (
        <div className="allocation-row" key={`${allocation.materialId}-${allocation.lotId}`}>
          <div>
            <strong>{allocation.materialName}</strong>
            <span>{allocation.lotNumber}</span>
          </div>
          <span className="mono-value">{formatGrams(allocation.allocatedGrams)}</span>
          <span className="mono-value">after {formatGrams(allocation.balanceAfter)}</span>
        </div>
      ))}
    </div>
  )
}

function QrLotScanner({
  open,
  onClose,
  onScan,
}: {
  open: boolean
  onClose: () => void
  onScan: (value: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [status, setStatus] = useState('Allow camera access to scan an OlfactoryOps lot label.')
  const [manualValue, setManualValue] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }
    let stream: MediaStream | undefined
    let interval: number | undefined
    let stopped = false
    let scanning = false
    const detectorConstructor = (window as unknown as {
      BarcodeDetector?: new (options?: { formats?: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>
      }
    }).BarcodeDetector

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Camera access is unavailable in this browser. Paste the label value below instead.')
        return
      }
      if (!detectorConstructor) {
        setStatus('This browser does not expose a QR detector. Paste the label value below instead.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        const video = videoRef.current
        if (!video || stopped) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        video.srcObject = stream
        await video.play()
        const detector = new detectorConstructor({ formats: ['qr_code'] })
        setStatus('Point the camera at an OlfactoryOps QR lot label.')
        interval = window.setInterval(async () => {
          if (scanning || stopped || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return
          }
          scanning = true
          try {
            const detected = await detector.detect(video)
            const value = detected[0]?.rawValue
            if (value) {
              onScan(value)
            }
          } catch {
            // Keep scanning; transient detector frames are expected.
          } finally {
            scanning = false
          }
        }, 320)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Camera access was not granted')
      }
    }

    void startCamera()
    return () => {
      stopped = true
      if (interval) window.clearInterval(interval)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [onScan, open])

  return (
    <BlackPopup
      open={open}
      title="Scan inventory QR"
      description="The scanner only selects a lot in the current workspace. It never changes stock."
      actionLabel="Close"
      onClose={onClose}
      onAction={onClose}
    >
      <div className="qr-scanner">
        <video className="qr-scanner-video" ref={videoRef} muted playsInline />
        <p className="muted-copy">{status}</p>
        <label className="field-row">
          <span>Manual label value</span>
          <input value={manualValue} onChange={(event) => setManualValue(event.target.value)} placeholder="OLFOPS|LOT|lot-id|..." />
        </label>
        <button className="ghost-button small" type="button" disabled={!manualValue.trim()} onClick={() => onScan(manualValue)}>
          Select scanned lot
        </button>
      </div>
    </BlackPopup>
  )
}

function NotificationCenter({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (key: DomainKey) => void
}) {
  const [notifications, setNotifications] = useState<AppNotificationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      await requestApi<{ created: number }>('/notifications/refresh', { method: 'POST' })
      const payload = await requestApi<{ notifications: AppNotificationRecord[]; unreadCount: number }>('/notifications')
      setNotifications(payload.notifications)
      setStatus(payload.notifications.length === 0 ? 'No notifications yet.' : '')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void loadNotifications()
    }
  }, [loadNotifications, open])

  async function openNotification(notification: AppNotificationRecord) {
    if (!notification.readAt) {
      try {
        await requestApi(`/notifications/${encodeURIComponent(notification.id)}/read`, { method: 'POST' })
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item))
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not mark notification as read')
      }
    }
    const key = domainKeyForHref(notification.href)
    if (key) {
      onNavigate(key)
    }
  }

  async function markAllRead() {
    try {
      await requestApi('/notifications/read-all', { method: 'POST' })
      setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt: new Date().toISOString() }))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not update notifications')
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          className="notification-center glass"
          aria-label="Notification center"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          <div className="notification-center-header">
            <div>
              <span className="eyebrow">Workspace inbox</span>
              <strong>{uiText('Notifications')}</strong>
            </div>
            <div className="notification-center-actions">
              <button className="ghost-button tiny" type="button" onClick={() => void markAllRead()} disabled={notifications.every((item) => item.readAt)}>
                {uiText('Mark all read')}
              </button>
              <button className="icon-button" type="button" onClick={onClose} aria-label={uiText('Close notifications')}>
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="notification-center-list" aria-live="polite">
            {loading ? <span className="muted-copy">{uiText('Loading notifications...')}</span> : null}
            {!loading && status ? <span className="muted-copy">{uiText(status)}</span> : null}
            {!loading && !status ? notifications.map((notification) => (
              <button
                className={`notification-item ${notification.readAt ? '' : 'is-unread'}`}
                key={notification.id}
                type="button"
                onClick={() => void openNotification(notification)}
              >
                <span className={`notification-dot notification-${notification.category}`} />
                <span>
                  <strong>{notification.title}</strong>
                  <small>{notification.body}</small>
                </span>
              </button>
            )) : null}
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  )
}

function domainKeyForHref(href?: string): DomainKey | null {
  const normalized = href?.split('?')[0]
  const map: Record<string, DomainKey> = {
    '/materials': 'materials',
    '/formulas': 'formulas',
    '/inventory': 'inventory',
    '/procurement': 'procurement',
    '/security': 'identity',
    '/settings': 'customization',
    '/customization': 'customization',
    '/saas': 'saas',
  }
  return normalized ? map[normalized] ?? null : null
}

function CommandPalette({
  open,
  session,
  onClose,
  onNavigate,
  onCommit,
}: {
  open: boolean
  session: AuthSession
  onClose: () => void
  onNavigate: (key: DomainKey) => void
  onCommit: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult[]>([])
  const internalAdminView = isInternalAdminSession(session)
  const commandDomains = useMemo(() => visibleDomainsForSession(session), [session])
  const canCommitLabUsage = sessionHasPermission(session, 'inventory.commitLabUsage')
  const canReviewAuditExport =
    internalAdminView && (domainVisibleForSession('saas', session) || sessionHasPermission(session, 'audit.export'))
  const commands = useMemo(
    () => [
      { label: 'Open OlfactoryOps Console', detail: 'Dashboard', action: () => onNavigate('dashboard') },
      ...commandDomains.map((domain) => {
        const displayDomain = domainDisplayForSession(domain, session)
        return {
          label: `Open ${displayDomain.name}`,
          detail: `${displayDomain.owner} / ${displayDomain.health}% health`,
          action: () => onNavigate(domain.key),
        }
      }),
      ...(canCommitLabUsage
        ? [{ label: 'Commit FRM-0421 lab usage', detail: 'Create OUT movements', action: onCommit }]
        : []),
      ...(canReviewAuditExport
        ? [
            {
              label: 'Review audit export',
              detail: internalAdminView ? 'Enterprise evidence' : 'Billing evidence',
              action: () => onNavigate('saas'),
            },
          ]
        : []),
    ],
    [canCommitLabUsage, canReviewAuditExport, commandDomains, internalAdminView, onCommit, onNavigate, session],
  )
  const remoteCommands = useMemo(
    () => globalResults
      .map((result) => {
        const key = domainKeyForHref(result.href)
        if (!key) return null
        return {
          label: result.title,
          detail: `${result.kind.toUpperCase()} / ${result.subtitle}`,
          action: () => onNavigate(key),
        }
      })
      .filter((command): command is { label: string; detail: string; action: () => void } => command !== null),
    [globalResults, onNavigate],
  )
  const filtered = [...commands, ...remoteCommands].filter((command) =>
    `${command.label} ${command.detail}`.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setGlobalResults([])
    }
  }, [open])

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setGlobalResults([])
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      void requestApi<{ query: string; results: GlobalSearchResult[] }>(`/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((payload) => setGlobalResults(payload.results))
        .catch(() => setGlobalResults([]))
    }, 180)
    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [open, query])

  function run(index: number) {
    filtered[index]?.action()
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="command-palette glass"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ scale: 0.96, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 12 }}
          >
            <div className="command-input-row">
              <Command size={18} />
              <input
                autoFocus
                value={query}
                placeholder="Navigate, create, inspect..."
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setSelectedIndex((index) => Math.min(index + 1, filtered.length - 1))
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setSelectedIndex((index) => Math.max(index - 1, 0))
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    run(selectedIndex)
                  }
                  if (event.key === 'Escape') {
                    onClose()
                  }
                }}
              />
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close command palette">
                <X size={18} />
              </button>
            </div>
            <div className="command-results">
              {filtered.map((command, index) => (
                <button
                  className={`command-result ${index === selectedIndex ? 'is-selected' : ''}`}
                  key={`${command.label}-${command.detail}`}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => run(index)}
                >
                  <span>{command.label}</span>
                  <span>{command.detail}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function BlackPopup({
  open,
  title,
  description,
  actionLabel,
  actionDisabled = false,
  onClose,
  onAction,
  children,
}: {
  open: boolean
  title: string
  description: string
  actionLabel: string
  actionDisabled?: boolean
  onClose: () => void
  onAction: () => void | Promise<void>
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="black-popup glass"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
          >
            <div className="popup-header">
              <div>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
                <X size={18} />
              </button>
            </div>
            <div className="popup-body">{children}</div>
            <div className="popup-actions">
              <button className="ghost-button" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={() => void onAction()} disabled={actionDisabled}>
                {actionLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Panel({
  title,
  icon: Icon,
  right,
  children,
  className = '',
}: {
  title: string
  icon: LucideIcon
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel glass glass-hover ${className}`}>
      <div className="panel-header">
        <div className="panel-title-row">
          <span className="icon-chip">
            <Icon size={17} />
          </span>
          <h2>{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatusDot({ status }: { status: DomainStatus }) {
  return <span className="status-dot" style={{ background: statusMeta[status].color }} />
}

function StatusBadge({ status, label }: { status: DomainStatus; label?: string }) {
  return (
    <span className="status-badge" style={{ ['--status' as string]: statusMeta[status].color }}>
      <StatusDot status={status} />
      {label ?? statusMeta[status].label}
    </span>
  )
}

function DataTag({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon?: LucideIcon
  tone?: 'green' | 'amber' | 'blue'
}) {
  return (
    <span className={`data-tag ${tone ? `tone-${tone}` : ''}`}>
      {Icon && <Icon size={14} />}
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  )
}

function CardList({ items, mono = false }: { items: string[]; mono?: boolean }) {
  return (
    <div className="card-list">
      {items.map((item) => (
        <div className={mono ? 'mono-card' : 'text-card'} key={item}>
          {item}
        </div>
      ))}
    </div>
  )
}

function LabBackdrop() {
  return (
    <div className="lab-backdrop" aria-hidden="true">
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <div className="orb orb-three" />
      <div className="blueprint-grid" />
      <svg className="molecule-linework" viewBox="0 0 640 420" role="presentation">
        <path d="M120 156 205 108 289 156 289 252 205 300 120 252Z" />
        <path d="M289 156 374 108 458 156 458 252 374 300 289 252" />
        <path d="M205 108V45M374 300v72M458 156l72-42M120 252l-72 42" />
        <circle cx="205" cy="108" r="10" />
        <circle cx="374" cy="300" r="10" className="gold-node" />
      </svg>
      <svg className="flask-linework" viewBox="0 0 220 260" role="presentation">
        <path d="M86 20h48M100 20v72L44 214c-8 18 4 34 24 34h84c20 0 32-16 24-34L120 92V20" />
        <path d="M68 196c26 18 58-18 92 0" />
      </svg>
      <div className="scanline" />
    </div>
  )
}

export default App
