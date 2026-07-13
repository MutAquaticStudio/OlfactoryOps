import { AnimatePresence, motion } from 'framer-motion'
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
  KeyRound,
  Layers3,
  LockKeyhole,
  Menu,
  PackageCheck,
  PackageSearch,
  Plus,
  Play,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  auditEvents,
  commercialSkus,
  domains,
  evaporationCurve,
  formatCurrency,
  formatGrams,
  formatSequenceValue,
  formulaTotals,
  formulas,
  formulaVersions,
  initialLots,
  initialMovements,
  materials,
  moleculeComponents,
  permissionCatalog,
  phases,
  planLabUsage,
  priceLists,
  priceHistory,
  productionBatches,
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
  type AuditEvent,
  type AuthSession,
  type AnalyticsDashboardReport,
  type BatchCostReport,
  type BrandRecord,
  type BrandingConfig,
  type BillingActionResponse,
  type BillingConsoleResponse,
  type BillingPlanRecord,
  type CommercialSkuRecord,
  type CostingOverview,
  type CustomerRecord,
  type CustomFieldDefinition,
  type DocumentRecord,
  type DocumentComplianceDashboard,
  type DocumentShareLink,
  type DocumentType,
  type DomainKey,
  type DomainModule,
  type DomainStatus,
  type FeatureFlagRecord,
  type Formula,
  type FormulaLine,
  type FormulaVersionRecord,
  type InventoryReorderSuggestion,
  type InventoryLot,
  type InventoryMovement,
  type LabWeighingSession,
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
  type PurchaseOrderRecord,
  type QuoteRecord,
  type ResolvedLeaf,
  type RolePolicy,
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
} from './data/northStar'

type UsageRecord = LabUsageRecord

type ModalKind =
  | 'commit'
  | 'auditExport'
  | 'ssoPolicy'
  | 'newFormula'
  | 'formulaLine'
  | 'receiveStock'
  | 'inventoryAdjustment'
  | 'inventoryTransfer'
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
  plan: 'Enterprise',
  status: 'ACTIVE',
  primaryContact: 'owner@example.test',
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
  provider: 'OIDC',
  domain: 'example.test',
  status: 'draft',
  roleMapping: {},
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
  accentColor: '#4d9bff',
  documentFooter: 'API managed branding',
  labelTemplate: 'OLF-{sequence}',
  logoMode: 'wordmark',
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
  revokedForLimit: AuthSession[]
  newDeviceAlert: boolean
  securityPolicy: TenantSecurityPolicy
  invariant: string
}

type SignupResponse = {
  organization: OrganizationRecord
  brand: BrandRecord
  membership: MembershipRecord
  session: AuthSession
  csrfToken: string
  audit: AuditEvent
  invariant: string
}

type MeResponse = {
  session: AuthSession
  csrfToken: string
  permissions: string[]
  securityPolicy: TenantSecurityPolicy
}

type SaasConsoleResponse = BillingConsoleResponse

type AuditExportResponse = {
  id: string
  format: string
  status: string
  scope: string
  audit: AuditEvent
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

type PurchaseOrderReceiptResponse = {
  lot: InventoryLot
  movement: InventoryMovement
  purchaseOrder: PurchaseOrderRecord
  priceHistory: PriceHistoryRecord
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

type MaterialIngestionResponse = MaterialMutationResponse & {
  ingestion: {
    id: string
    materialId: string
    documentType: 'SDS' | 'CoA'
    source: string
    version: string
    status: 'REVIEW_REQUIRED' | 'APPROVED'
    extractedFields: string[]
  }
}

type MaterialMoleculesResponse = {
  materialId: string
  molecules: MoleculeComponent[]
  totalPercent: number
  invariant: string
}

type MaterialProvenanceResponse = {
  materialId: string
  provenance: Material['provenance']
  documents: DocumentRecord[]
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
  audit?: AuditEvent
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

type InventoryReceiptResponse = {
  lot: InventoryLot
  movement: InventoryMovement
  summary?: ReturnType<typeof stockSummary>[number]
  invariant: string
}

type InventoryAdjustmentResponse = InventoryReceiptResponse

type InventoryTransferResponse = InventoryReceiptResponse

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
  { title: 'R&D Spine', keys: ['materials', 'formulas', 'inventory', 'labUsage', 'documents'] },
  { title: 'Operations', keys: ['production', 'procurement', 'commerce', 'orders'] },
  { title: 'Enterprise', keys: ['costing', 'analytics', 'saas'] },
]

const workflowNodes: { key: DomainKey; label: string; detail: string }[] = [
  { key: 'materials', label: 'Material', detail: 'SDS, CoA, provenance' },
  { key: 'formulas', label: 'Formula', detail: 'Nested resolve engine' },
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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1'
const authStorageKey = 'olfactoryops.auth.v1'
const authSessionMarkerKey = 'olfactoryops.has_session.v1'
const authExpiredEvent = 'olfactoryops.auth.expired'
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
    try {
      const payload = (await response.json()) as { message?: unknown }
      if (typeof payload.message === 'string') {
        message = payload.message
      }
    } catch {
      // Keep the status-based message when the response is not JSON.
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

function tenantDisplayForSession(session: AuthSession) {
  const fallbackName = session.email.split('@')[1] ?? 'Tenant workspace'

  return {
    scope: session.organizationId,
    label: `${session.organizationId.toUpperCase()} / ${fallbackName}`,
  }
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
  const [commandOpen, setCommandOpen] = useState(false)
  const [modal, setModal] = useState<ModalKind>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [selectedMaterialId, setSelectedMaterialId] = useState('mat-iso')
  const [materialRecords, setMaterialRecords] = useState<Material[]>(() => structuredClone(materials))
  const [formulaRecords, setFormulaRecords] = useState<Formula[]>(() => structuredClone(formulas))
  const [activeFormulaId, setActiveFormulaId] = useState('frm-0421')
  const [lots, setLots] = useState<InventoryLot[]>(initialLots)
  const [movements, setMovements] = useState<InventoryMovement[]>(initialMovements)
  const [storageLocationRecords, setStorageLocationRecords] = useState<StorageLocation[]>(storageLocations)
  const [usageHistory, setUsageHistory] = useState<UsageRecord[]>([])
  const [batchGrams, setBatchGrams] = useState(12.5)
  const [actualWeights, setActualWeights] = useState<Record<string, number>>({})
  const [weighingTolerancePercent, setWeighingTolerancePercent] = useState(2)
  const [weighingOperator, setWeighingOperator] = useState('Thuan Le Minh')
  const [labUsagePurpose, setLabUsagePurpose] = useState<LabUsagePurpose>('trial')
  const [labUsageProjectCode, setLabUsageProjectCode] = useState('NXL-RD-0421')
  const [labUsageSampleCode, setLabUsageSampleCode] = useState('SMP-0421-A')
  const [labUsageStatusMessage, setLabUsageStatusMessage] = useState('Live API sync pending')
  const [labUsageBusy, setLabUsageBusy] = useState(false)
  const [newFormulaName, setNewFormulaName] = useState('Untitled Accord')
  const [newFormulaTargetGrams, setNewFormulaTargetGrams] = useState(100)
  const [newLineMaterialId, setNewLineMaterialId] = useState(materials[0]?.id ?? '')
  const [newLineGrams, setNewLineGrams] = useState(5)
  const [receiveMaterialId, setReceiveMaterialId] = useState(materials[0]?.id ?? '')
  const [receiveLotNumber, setReceiveLotNumber] = useState('L-NEW-001')
  const [receiveQuantityGrams, setReceiveQuantityGrams] = useState(25)
  const [receiveExpiryDate, setReceiveExpiryDate] = useState('2028-12-31')
  const [adjustmentLotId, setAdjustmentLotId] = useState(initialLots[0]?.id ?? '')
  const [adjustmentDirection, setAdjustmentDirection] = useState<'IN' | 'OUT'>('OUT')
  const [adjustmentQuantityGrams, setAdjustmentQuantityGrams] = useState(5)
  const [adjustmentReason, setAdjustmentReason] = useState('Cycle count correction')
  const [transferLotId, setTransferLotId] = useState(initialLots[0]?.id ?? '')
  const [transferLocation, setTransferLocation] = useState(storageLocations[1]?.name ?? 'Amber Shelf 2')

  const selectedDomain = domains.find((domain) => domain.key === activeKey)
  const selectedFormula = useMemo(() => {
    const fallbackFormula = formulas.find((formula) => formula.id === 'frm-0421')!
    return formulaRecords.find((formula) => formula.id === activeFormulaId) ?? fallbackFormula
  }, [activeFormulaId, formulaRecords])
  const resolvedLeaves = useMemo(
    () => resolveFormulaWithCatalog(selectedFormula.id, formulaRecords, materialRecords),
    [formulaRecords, materialRecords, selectedFormula.id],
  )
  const totals = useMemo(() => formulaTotals(resolvedLeaves), [resolvedLeaves])
  const curve = useMemo(() => evaporationCurve(resolvedLeaves), [resolvedLeaves])
  const labPlan = useMemo(
    () => planLabUsage(resolvedLeaves, lots, batchGrams, selectedFormula.targetGrams),
    [resolvedLeaves, lots, batchGrams, selectedFormula.targetGrams],
  )
  const weighingSessionPreview = useMemo(
    () =>
      buildWeighingSessionPreview({
        formula: selectedFormula,
        plan: labPlan,
        lots,
        batchGrams,
        actualWeights,
        tolerancePercent: weighingTolerancePercent,
        operator: weighingOperator,
      }),
    [actualWeights, batchGrams, labPlan, lots, selectedFormula, weighingOperator, weighingTolerancePercent],
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
  const navigateToDomain = useCallback((key: DomainKey) => {
    setActiveKey(key)
    setMobileNavOpen(false)
  }, [])

  useEffect(() => {
    const nextWeights: Record<string, number> = {}
    labPlan.allocations.forEach((allocation) => {
      nextWeights[allocationKey(allocation)] = Number(allocation.allocatedGrams.toFixed(3))
    })
    setActualWeights(nextWeights)
  }, [labPlan.allocations])

  useEffect(() => {
    function handleAuthExpired() {
      setCurrentSession(null)
      setActiveKey('dashboard')
    }

    window.addEventListener(authExpiredEvent, handleAuthExpired)
    return () => window.removeEventListener(authExpiredEvent, handleAuthExpired)
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
          setCurrentSession(payload.session)
        }
      } catch {
        if (active) {
          acceptCsrfToken()
          setCurrentSession(null)
        }
      }
    }

    void restoreSession()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!currentSession) {
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
  }, [currentSession])

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

  function setTargetWeights() {
    const nextWeights: Record<string, number> = {}
    labPlan.allocations.forEach((allocation) => {
      nextWeights[allocationKey(allocation)] = Number(allocation.allocatedGrams.toFixed(3))
    })
    setActualWeights(nextWeights)
  }

  async function commitLabUsage() {
    if (!weighingReady || resolvedLeaves.length === 0) {
      return
    }

    setLabUsageBusy(true)
    try {
      const payload = await requestApi<LabUsageCommitResponse>('/lab-usage/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formulaId: selectedFormula.id,
          grams: batchGrams,
          actuals: weighingSessionPreview.lines.map((line) => ({
            materialId: line.materialId,
            lotId: line.lotId,
            actualGrams: line.actualGrams,
          })),
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
  }

  async function reverseLatestUsage() {
    const latest = usageHistory.find((usage) => usage.status === 'COMMITTED')
    if (!latest) {
      return
    }

    setLabUsageBusy(true)
    try {
      const payload = await requestApi<LabUsageReverseResponse>(`/lab-usage/${encodeURIComponent(latest.id)}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: weighingOperator || 'Lab Manager',
          reason: 'Compensation reversal from Lab Usage workspace',
        }),
      })

      setLots(payload.lots)
      setMovements((current) => mergeMovements(payload.movements, current))
      setUsageHistory(payload.usageHistory)
      setLabUsageStatusMessage(`${payload.usageId} reversed by compensation`)
    } catch (error) {
      setLabUsageStatusMessage(error instanceof Error ? error.message : 'Lab Usage reverse failed')
    } finally {
      setLabUsageBusy(false)
    }
  }

  async function createFormulaDraft() {
    const targetGrams = Math.max(1, Number(newFormulaTargetGrams) || 100)
    try {
      const payload = await requestApi<FormulaCreateResponse>('/formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFormulaName.trim() || 'Untitled Formula',
          targetGrams,
          owner: 'Thuan Le Minh',
        }),
      })
      setFormulaRecords((current) => [
        payload.formula,
        ...current.filter((formula) => formula.id !== payload.formula.id),
      ])
      setActiveFormulaId(payload.formula.id)
      setNewFormulaName('Untitled Accord')
      setNewFormulaTargetGrams(100)
      setActiveKey('formulas')
      setModal(null)
    } catch {
      setActiveKey('formulas')
    }
  }

  async function addFormulaMaterialLine() {
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
    } catch {
      setActiveKey('formulas')
    }
  }

  async function receiveStockLot() {
    const material = materialRecords.find((item) => item.id === receiveMaterialId)
    const quantityGrams = Number(receiveQuantityGrams)

    if (!material || !Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      return
    }

    try {
      const payload = await requestApi<InventoryReceiptResponse>('/inventory/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialId: material.id,
          lotNumber: receiveLotNumber.trim() || `L-${material.cas.replaceAll('-', '')}`,
          quantityGrams,
          expiryDate: receiveExpiryDate || '2028-12-31',
          location: 'Receiving Bay',
          qualityStatus: 'APPROVED',
          container: 'Receiving container',
        }),
      })

      setLots((current) => [payload.lot, ...current.filter((lot) => lot.id !== payload.lot.id)])
      setMovements((current) => [payload.movement, ...current.filter((movement) => movement.id !== payload.movement.id)])
      setReceiveLotNumber(`L-NEW-${String(lots.length + 2).padStart(3, '0')}`)
      setReceiveQuantityGrams(25)
      setActiveKey('inventory')
      setModal(null)
    } catch {
      setActiveKey('inventory')
    }
  }

  async function adjustInventoryLot() {
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

    try {
      const payload = await requestApi<InventoryAdjustmentResponse>('/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotId: lot.id,
          direction: adjustmentDirection,
          quantityGrams,
          reason: adjustmentReason.trim() || 'Cycle count correction',
        }),
      })

      setLots((current) => current.map((item) => (item.id === payload.lot.id ? payload.lot : item)))
      setMovements((current) => [payload.movement, ...current.filter((movement) => movement.id !== payload.movement.id)])
      setAdjustmentQuantityGrams(5)
      setActiveKey('inventory')
      setModal(null)
    } catch {
      setActiveKey('inventory')
    }
  }

  async function transferInventoryLot() {
    const lot = lots.find((item) => item.id === transferLotId)
    const toLocation = transferLocation.trim()

    if (!lot || !toLocation || lot.location === toLocation) {
      return
    }

    try {
      const payload = await requestApi<InventoryTransferResponse>('/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId: lot.id, toLocation }),
      })

      setLots((current) => current.map((item) => (item.id === payload.lot.id ? payload.lot : item)))
      setMovements((current) => [payload.movement, ...current.filter((movement) => movement.id !== payload.movement.id)])
      setActiveKey('inventory')
      setModal(null)
    } catch {
      setActiveKey('inventory')
    }
  }

  function acceptAuthSession(session: AuthSession, token: string) {
    acceptCsrfToken(token)
    setCurrentSession(session)
    writeStoredAuthSession(session)
    setActiveKey('dashboard')
  }

  async function loginToWorkspace(email: string) {
    const payload = await requestApi<LoginResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    acceptAuthSession(payload.session, payload.csrfToken)
    return payload
  }

  async function signupWorkspace(input: {
    organizationName: string
    workspaceSlug: string
    email: string
    name: string
  }) {
    const payload = await requestApi<SignupResponse>('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    acceptAuthSession(payload.session, payload.csrfToken)
    return payload
  }

  async function logoutWorkspace() {
    try {
      await requestApi<{ session: AuthSession; audit: AuditEvent; invariant: string }>('/auth/logout', { method: 'POST' })
    } catch {
      // The local session must still be cleared if the demo API is unavailable.
    } finally {
      setCurrentSession(null)
      acceptCsrfToken()
      writeStoredAuthSession(null)
      setCommandOpen(false)
      setModal(null)
    }
  }

  if (!currentSession) {
    return (
      <AuthGateway
        onLogin={loginToWorkspace}
        onSignup={signupWorkspace}
      />
    )
  }

  return (
    <div className="min-h-screen bg-lab-bg text-[var(--text)]">
      <LabBackdrop />
      <div className={`app-shell ${sidebarCollapsed ? 'is-rail' : ''} ${mobileNavOpen ? 'is-mobile-nav-open' : ''}`}>
        <Sidebar
          activeKey={activeKey}
          collapsed={sidebarCollapsed && !mobileNavOpen}
          mobileOpen={mobileNavOpen}
          session={currentSession}
          onNavigate={navigateToDomain}
          onToggle={() => {
            if (mobileNavOpen) {
              setMobileNavOpen(false)
              return
            }
            setSidebarCollapsed((value) => !value)
          }}
        />
        <main className="workspace">
          <Topbar
            activeDomain={selectedDomain}
            session={currentSession}
            onCommand={() => setCommandOpen(true)}
            onLogout={() => void logoutWorkspace()}
            onMenu={() => setMobileNavOpen((value) => !value)}
          />
          <AnimatePresence mode="wait">
            {activeKey === 'dashboard' ? (
              <motion.div key="dashboard" {...shellMotion}>
                <Dashboard
                  stats={stats}
                  movements={movements}
                  activeKey={activeKey}
                  onNavigate={navigateToDomain}
                  onOpenModal={setModal}
                />
              </motion.div>
            ) : selectedDomain ? (
              <motion.div key={activeKey} {...shellMotion}>
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
                  formulaRecords={formulaRecords}
                  setFormulaRecords={setFormulaRecords}
                  activeFormulaId={activeFormulaId}
                  setActiveFormulaId={setActiveFormulaId}
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
                  onNewFormula={() => setModal('newFormula')}
                  onAddFormulaLine={() => setModal('formulaLine')}
                  onReceiveStock={() => setModal('receiveStock')}
                  onAdjustStock={() => setModal('inventoryAdjustment')}
                  onTransferStock={() => setModal('inventoryTransfer')}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={navigateToDomain}
        onCommit={() => setModal('commit')}
      />

      <BlackPopup
        open={modal === 'commit'}
        title="Commit lab usage"
        description="This creates immutable OUT movements for eligible lots. Formula save/review stays non-consuming."
        actionLabel="Create movements"
        onClose={() => setModal(null)}
        onAction={commitLabUsage}
        actionDisabled={!weighingReady || labUsageBusy}
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
        description="Creates an approved inventory lot and a matching immutable RECEIPT movement."
        actionLabel="Create Lot"
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
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'inventoryAdjustment'}
        title="Adjust stock"
        description="Creates an immutable ADJUSTMENT movement. Available stock cannot go negative."
        actionLabel="Create Adjustment"
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
        description="Moves a lot between storage locations and records TRANSFER / MOVE evidence without changing stock."
        actionLabel="Confirm Transfer"
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
          <div className="popup-grid">
            <Metric label="Movement type" value="TRANSFER" />
            <Metric label="Quantity effect" value="No stock delta" />
          </div>
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'auditExport'}
        title="Audit export"
        description="Enterprise export is scoped to the current tenant and every download is logged."
        actionLabel="Queue JSON export"
        onClose={() => setModal(null)}
        onAction={() => setModal(null)}
      >
        <div className="popup-grid">
          <Metric label="Events" value="9,144" />
          <Metric label="Format" value="JSON" />
          <Metric label="Scope" value={currentSession.organizationId} />
        </div>
      </BlackPopup>

      <BlackPopup
        open={modal === 'ssoPolicy'}
        title="SSO and tenant security"
        description="Owner/Admin actions require MFA. SSO group mapping never bypasses tenant scope."
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
  collapsed,
  mobileOpen,
  session,
  onNavigate,
  onToggle,
}: {
  activeKey: DomainKey
  collapsed: boolean
  mobileOpen: boolean
  session: AuthSession
  onNavigate: (key: DomainKey) => void
  onToggle: () => void
}) {
  const tenantDisplay = tenantDisplayForSession(session)

  return (
    <aside className="sidebar glass" style={mobileOpen ? { left: 10, transform: 'none' } : undefined}>
      <div className="brand-row">
        <div className="brand-mark">
          <Sparkles size={18} />
        </div>
        {!collapsed && (
          <div>
            <div className="wordmark">OlfactoryOps</div>
            <div className="mono-small">North Star OS</div>
          </div>
        )}
        <button className="icon-button sidebar-toggle" type="button" onClick={onToggle} aria-label="Toggle sidebar">
          <Menu size={18} />
        </button>
      </div>

      <nav className="nav-stack" aria-label="Main modules">
        {navGroups.map((group) => (
          <div className="nav-group" key={group.title}>
            {!collapsed && <div className="nav-title">{group.title}</div>}
            {group.keys.map((key) => {
              const domain = key === 'dashboard' ? undefined : domains.find((item) => item.key === key)
              const Icon = domainIcons[key]
              const label = key === 'dashboard' ? 'North Star Console' : domain?.shortName ?? key
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
                  {!collapsed && domain && <StatusDot status={domain.status} />}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="sidebar-footer">
          <div className="mono-small">Tenant isolation</div>
          <div className="footer-status">
            <CheckCircle2 size={16} />
            <span>Session scoped to {tenantDisplay.scope}</span>
          </div>
        </div>
      )}
    </aside>
  )
}

function Topbar({
  activeDomain,
  session,
  onCommand,
  onLogout,
  onMenu,
}: {
  activeDomain?: DomainModule
  session: AuthSession
  onCommand: () => void
  onLogout: () => void
  onMenu: () => void
}) {
  const tenantDisplay = tenantDisplayForSession(session)

  return (
    <header className="topbar glass">
      <button className="icon-button mobile-menu" type="button" onClick={onMenu} aria-label="Open navigation">
        <Menu size={18} />
      </button>
      <div>
        <div className="mono-small">{tenantDisplay.label}</div>
        <h1>{activeDomain ? activeDomain.name : 'North Star Console'}</h1>
      </div>
      <button className="command-button" type="button" onClick={onCommand}>
        <Search size={17} />
        <span>Search modules, records, actions</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="topbar-actions">
        <DataTag icon={ShieldCheck} label="Tenant guard" value="On" tone="green" />
        <DataTag icon={UsersRound} label={session.role} value={session.email} tone="blue" />
        <button className="icon-button" type="button" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <button className="ghost-button small" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}

function AuthGateway({
  onLogin,
  onSignup,
}: {
  onLogin: (email: string) => Promise<LoginResponse>
  onSignup: (input: { organizationName: string; workspaceSlug: string; email: string; name: string }) => Promise<SignupResponse>
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('owner@example.test')
  const [name, setName] = useState('Thuan Le Minh')
  const [organizationName, setOrganizationName] = useState('NOXELIS Lab')
  const [workspaceSlug, setWorkspaceSlug] = useState('noxelis-live')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Login with an active tenant membership, or sign up a new workspace.')

  async function submitAuth() {
    setBusy(true)
    setStatus(mode === 'login' ? 'Checking tenant membership' : 'Provisioning isolated tenant')
    try {
      if (mode === 'login') {
        const result = await onLogin(email)
        setStatus(`${result.session.email} signed in with ${result.session.role} role`)
      } else {
        const result = await onSignup({ organizationName, workspaceSlug, email, name })
        setStatus(`${result.organization.name} provisioned with owner access`)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(nextMode: 'login' | 'signup') {
    setMode(nextMode)
    setStatus(nextMode === 'login' ? 'Use owner@example.test for the demo tenant.' : 'Create a new tenant workspace and owner session.')
    if (nextMode === 'signup') {
      setEmail('owner@newlab.test')
      setName('Workspace Owner')
      setOrganizationName('New Fragrance Lab')
      setWorkspaceSlug('new-fragrance-lab')
    } else {
      setEmail('owner@example.test')
      setName('Thuan Le Minh')
      setOrganizationName('NOXELIS Lab')
      setWorkspaceSlug('noxelis-live')
    }
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
                <div className="mono-small">North Star OS</div>
              </div>
            </div>
            <h1>{mode === 'login' ? 'Login to your lab tenant' : 'Create a tenant workspace'}</h1>
            <p className="lead">
              Tenant access starts here: membership, role, session TTL, MFA policy, and audit evidence are established before the console opens.
            </p>
            <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
              <button className={mode === 'login' ? 'is-active' : ''} type="button" onClick={() => switchMode('login')}>
                Login
              </button>
              <button className={mode === 'signup' ? 'is-active' : ''} type="button" onClick={() => switchMode('signup')}>
                Sign up
              </button>
            </div>
          </div>

          <div className="auth-form">
            {mode === 'signup' && (
              <>
                <label className="field-row">
                  <span>Organization</span>
                  <input
                    aria-label="Signup organization"
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                  />
                </label>
                <label className="field-row">
                  <span>Workspace slug</span>
                  <input
                    aria-label="Signup workspace slug"
                    value={workspaceSlug}
                    onChange={(event) => setWorkspaceSlug(event.target.value)}
                  />
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
            <label className="field-row">
              <span>Email</span>
              <input
                aria-label={mode === 'login' ? 'Login email' : 'Signup email'}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button
              className="primary-button full"
              type="button"
              onClick={() => void submitAuth()}
              disabled={busy || !email.trim() || (mode === 'signup' && (!organizationName.trim() || !workspaceSlug.trim()))}
            >
              {busy ? 'Working' : mode === 'login' ? 'Login' : 'Create workspace'}
            </button>
            <div className="auth-status">
              <ShieldCheck size={16} />
              <span>{status}</span>
            </div>
            <div className="policy-list">
              <li>Demo login: owner@example.test</li>
              <li>Signup provisions an active owner membership</li>
              <li>Sessions use idle and absolute expiry windows</li>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function Dashboard({
  stats,
  movements,
  onNavigate,
  onOpenModal,
}: {
  stats: { done: number; avgCoverage: number; risks: number }
  movements: InventoryMovement[]
  activeKey: DomainKey
  onNavigate: (key: DomainKey) => void
  onOpenModal: (modal: ModalKind) => void
}) {
  return (
    <div className="dashboard-grid">
      <Panel className="hero-panel" title="North Star Console" icon={Gauge} right={<StatusBadge status="active" />}>
        <div className="hero-content">
          <div>
            <p className="lead">
              Full SaaS operating layer across all 15 phases, with the core R&D value stream live inside the
              broader enterprise product surface.
            </p>
            <div className="hero-actions">
              <button className="primary-button" type="button" onClick={() => onNavigate('formulas')}>
                Open Formula R&D
                <ChevronRight size={16} />
              </button>
              <button className="ghost-button" type="button" onClick={() => onOpenModal('auditExport')}>
                Audit export
              </button>
            </div>
          </div>
          <div className="hero-metrics">
            <Metric label="Phases active/stable" value={`${stats.done}/16`} />
            <Metric label="Avg coverage" value={`${stats.avgCoverage}%`} />
            <Metric label="Risk flags" value={String(stats.risks)} />
          </div>
        </div>
      </Panel>

      <Panel className="phase-panel" title="Phase Roadmap" icon={Layers3}>
        <PhaseRoadmap onNavigate={onNavigate} />
      </Panel>

      <Panel className="workflow-panel" title="Operating Value Stream" icon={Activity}>
        <WorkflowGraph onNavigate={onNavigate} />
      </Panel>

      <Panel className="matrix-panel" title="Domain Health Matrix" icon={Database}>
        <DomainMatrix onNavigate={onNavigate} />
      </Panel>

      <EnterpriseReadiness onOpenModal={onOpenModal} />

      <Panel className="ledger-panel" title="Movement Ledger" icon={Boxes}>
        <MovementTable movements={movements.slice(0, 6)} />
      </Panel>

      <Panel className="audit-panel" title="Audit Trail" icon={KeyRound}>
        <AuditList events={auditEvents} />
      </Panel>
    </div>
  )
}

function DomainWorkspace({
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
  onNewFormula: () => void
  onAddFormulaLine: () => void
  onReceiveStock: () => void
  onAdjustStock: () => void
  onTransferStock: () => void
}) {
  return (
    <div className="domain-page">
      <DomainHeader domain={domain} onOpenModal={onOpenModal} />

      {domain.key === 'materials' && (
        <MaterialWorkspace
          materialRecords={materialRecords}
          onMaterialsChange={setMaterialRecords}
          selectedMaterialId={selectedMaterialId}
          onSelectMaterial={setSelectedMaterialId}
          stock={stock}
        />
      )}
      {domain.key === 'formulas' && (
        <FormulaWorkspace
          formulaRecords={formulaRecords}
          materialRecords={materialRecords}
          activeFormulaId={activeFormulaId}
          onSelectFormula={setActiveFormulaId}
          onFormulaRecordsChange={setFormulaRecords}
          resolvedLeaves={resolvedLeaves}
          totals={totals}
          curve={curve}
          onSelectMaterial={setSelectedMaterialId}
          onNewFormula={onNewFormula}
          onAddLine={onAddFormulaLine}
        />
      )}
      {domain.key === 'inventory' && (
        <InventoryWorkspace
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
        />
      )}
      {domain.key === 'labUsage' && (
        <LabUsageWorkspace
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
      {domain.key === 'production' && <ProductionWorkspace />}
      {domain.key === 'procurement' && (
        <ProcurementWorkspace
          stock={stock}
          materialRecords={materialRecords}
          onLotsChange={onLotsChange}
          onMovementsChange={onMovementsChange}
        />
      )}
      {domain.key === 'commerce' && <CommerceWorkspace stock={stock} materialRecords={materialRecords} />}
      {domain.key === 'orders' && <OrdersWorkspace stock={stock} />}
      {domain.key === 'costing' && <CostingWorkspace />}
      {domain.key === 'analytics' && <AnalyticsWorkspace />}
      {domain.key === 'saas' && <SaasWorkspace session={session} />}
      {domain.key === 'identity' && <IdentityWorkspace />}
      {domain.key === 'customization' && <CustomizationWorkspace />}
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
        <GenericDomainWorkspace domain={domain} onOpenModal={onOpenModal} />
      )}
    </div>
  )
}

function DomainHeader({ domain, onOpenModal }: { domain: DomainModule; onOpenModal: (modal: ModalKind) => void }) {
  const Icon = domainIcons[domain.key]
  return (
    <Panel className="domain-header" title={domain.name} icon={Icon} right={<StatusBadge status={domain.status} />}>
      <div className="domain-header-grid">
        <div>
          <p className="lead">{domain.responsibility}</p>
          <div className="tag-row">
            <DataTag icon={Layers3} label="Phase" value={domain.phase} />
            <DataTag icon={UsersRound} label="Owner" value={domain.owner} />
            <DataTag icon={Gauge} label="Health" value={`${domain.health}%`} tone={domain.health > 70 ? 'green' : 'amber'} />
          </div>
        </div>
        <div className="risk-card">
          <div className="mono-small">Current gate</div>
          <strong>{domain.risk}</strong>
          <button
            className="ghost-button small"
            type="button"
            onClick={() => onOpenModal(domain.key === 'saas' || domain.key === 'identity' ? 'ssoPolicy' : 'auditExport')}
          >
            Review controls
          </button>
        </div>
      </div>
    </Panel>
  )
}

function MaterialWorkspace({
  materialRecords,
  onMaterialsChange,
  selectedMaterialId,
  onSelectMaterial,
  stock,
}: {
  materialRecords: Material[]
  onMaterialsChange: (materials: Material[]) => void
  selectedMaterialId: string
  onSelectMaterial: (id: string) => void
  stock: ReturnType<typeof stockSummary>
}) {
  const selected = materialRecords.find((material) => material.id === selectedMaterialId) ?? materialRecords[0] ?? materials[0]!
  const stockByMaterialId = useMemo(() => buildStockByMaterialId(stock), [stock])
  const selectedStock = stockByMaterialId.get(selected.id)
  const [materialStatus, setMaterialStatus] = useState('Loading material intelligence')
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
  const [ingestDraft, setIngestDraft] = useState({
    documentType: 'SDS' as 'SDS' | 'CoA',
    source: `${selected.name} SDS v4`,
    version: 'v4',
    density: selected.density,
    vaporPressure: selected.vaporPressure,
  })
  const [moleculeRows, setMoleculeRows] = useState<MoleculeComponent[]>(() =>
    moleculeComponents.filter((molecule) => molecule.materialId === selected.id),
  )
  const [provenanceRows, setProvenanceRows] = useState<Material['provenance']>(selected.provenance)
  const [linkedDocuments, setLinkedDocuments] = useState<DocumentRecord[]>([])

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
    setIngestDraft((current) => ({
      ...current,
      source: `${selected.name} ${current.documentType} review`,
      density: selected.density,
      vaporPressure: selected.vaporPressure,
    }))
    setMoleculeRows(moleculeComponents.filter((molecule) => molecule.materialId === selected.id))
    setProvenanceRows(selected.provenance)
    setLinkedDocuments([])

    async function loadIntelligence() {
      try {
        const [moleculePayload, provenancePayload] = await Promise.all([
          requestApi<MaterialMoleculesResponse>(`/materials/${encodeURIComponent(selected.id)}/molecules`),
          requestApi<MaterialProvenanceResponse>(`/materials/${encodeURIComponent(selected.id)}/provenance`),
        ])
        if (!active) {
          return
        }
        setMoleculeRows(moleculePayload.molecules)
        setProvenanceRows(provenancePayload.provenance)
        setLinkedDocuments(provenancePayload.documents)
      } catch {
        if (active) {
          setMaterialStatus('Using local molecule/provenance seed until API is reachable')
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
    setProvenanceRows(nextMaterial.provenance)
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
    } catch {
      setMaterialStatus('Material create blocked; check required fields or duplicate CAS')
    }
  }

  async function saveMaterialUpdate() {
    try {
      const payload = await requestApi<MaterialMutationResponse>(`/materials/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family: editDraft.family,
          tier: editDraft.tier,
          density: Number(editDraft.density),
          vaporPressure: Number(editDraft.vaporPressure),
          costPerGram: Number(editDraft.costPerGram),
          ifraLimit: Number(editDraft.ifraLimit),
          odor: editDraft.odor.split(',').map((tag) => tag.trim()).filter(Boolean),
          source: 'Material inspector update',
          version: 'manual-ui',
        }),
      })
      upsertMaterial(payload.material)
      setMaterialStatus(`${payload.material.name} metadata saved with provenance`)
    } catch {
      setMaterialStatus('Material update blocked by validation or permission')
    }
  }

  async function approveIngestion() {
    try {
      const payload = await requestApi<MaterialIngestionResponse>(`/materials/${encodeURIComponent(selected.id)}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: ingestDraft.documentType,
          source: ingestDraft.source,
          version: ingestDraft.version,
          approved: true,
          fields: {
            density: Number(ingestDraft.density),
            vaporPressure: Number(ingestDraft.vaporPressure),
          },
          odor: editDraft.odor.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
      })
      upsertMaterial(payload.material)
      setMaterialStatus(`${payload.ingestion.source} approved and written to material provenance`)
    } catch {
      setMaterialStatus('SDS/CoA ingest blocked; review extracted fields')
    }
  }

  async function fillFromPubChem() {
    try {
      const payload = await requestApi<PubChemFillResponse>(`/materials/${encodeURIComponent(selected.id)}/pubchem-fill`, {
        method: 'POST',
      })
      upsertMaterial(payload.material)
      setMoleculeRows(payload.molecules)
      setMaterialStatus(`${payload.material.name} enriched from curated PubChem profile`)
    } catch {
      setMaterialStatus('PubChem fill unavailable for this material')
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
          <button className="ghost-button" type="button" onClick={() => void checkCasDuplicate()}>
            Check CAS
          </button>
          <button className="primary-button" type="button" onClick={() => void createMaterialRecord()} disabled={!createName.trim() || !createCas.trim()}>
            <Plus size={16} />
            Create material
          </button>
        </div>
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
          <button className="primary-button" type="button" onClick={() => void saveMaterialUpdate()}>
            Save metadata
          </button>
          <button className="ghost-button" type="button" onClick={() => void fillFromPubChem()}>
            PubChem fill
          </button>
        </div>
      </Panel>

      <Panel title="SDS / CoA Review" icon={FileLock2}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Document type</span>
            <select
              aria-label="Material ingest document type"
              value={ingestDraft.documentType}
              onChange={(event) =>
                setIngestDraft((current) => ({ ...current, documentType: event.target.value as 'SDS' | 'CoA' }))
              }
            >
              <option value="SDS">SDS</option>
              <option value="CoA">CoA</option>
            </select>
          </label>
          <label className="field-row">
            <span>Version</span>
            <input
              aria-label="Material ingest version"
              value={ingestDraft.version}
              onChange={(event) => setIngestDraft((current) => ({ ...current, version: event.target.value }))}
            />
          </label>
          <label className="field-row wide-field">
            <span>Source</span>
            <input
              aria-label="Material ingest source"
              value={ingestDraft.source}
              onChange={(event) => setIngestDraft((current) => ({ ...current, source: event.target.value }))}
            />
          </label>
          <label className="field-row">
            <span>Extracted density</span>
            <input
              aria-label="Material ingest density"
              step={0.001}
              type="number"
              value={ingestDraft.density}
              onChange={(event) => setIngestDraft((current) => ({ ...current, density: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>Extracted vapor pressure</span>
            <input
              aria-label="Material ingest vapor pressure"
              step={0.0001}
              type="number"
              value={ingestDraft.vaporPressure}
              onChange={(event) =>
                setIngestDraft((current) => ({ ...current, vaporPressure: Number(event.target.value) }))
              }
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void approveIngestion()}>
            Approve ingest
          </button>
        </div>
        <div className="empty-state">
          <strong>Review-first ingestion</strong>
          <span>Extracted SDS/CoA fields are written only after this explicit approval step.</span>
        </div>
      </Panel>

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

      <Panel className="wide" title="Field Provenance" icon={ClipboardCheck}>
        <div className="provenance-list">
          {provenanceRows.map((source, index) => (
            <div className="provenance-item" key={`${source.field}-${source.version}-${index}`}>
              <div>
                <strong>{source.field}</strong>
                <span>{source.source}</span>
              </div>
              <span className="mono-value">{source.version}</span>
              <span className="mono-small">{index === 0 ? 'latest' : source.date}</span>
            </div>
          ))}
          {linkedDocuments.map((document) => (
            <div className="provenance-item" key={document.id}>
              <div>
                <strong>{document.type} document</strong>
                <span>{document.title} / {document.sensitivity}</span>
              </div>
              <span className="mono-value">{document.version}</span>
              <StatusBadge status="stable" label="private" />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function FormulaWorkspace({
  formulaRecords,
  materialRecords,
  activeFormulaId,
  onSelectFormula,
  onFormulaRecordsChange,
  resolvedLeaves,
  totals,
  curve,
  onSelectMaterial,
  onNewFormula,
  onAddLine,
}: {
  formulaRecords: Formula[]
  materialRecords: Material[]
  activeFormulaId: string
  onSelectFormula: (id: string) => void
  onFormulaRecordsChange: Dispatch<SetStateAction<Formula[]>>
  resolvedLeaves: ResolvedLeaf[]
  totals: ReturnType<typeof formulaTotals>
  curve: ReturnType<typeof evaporationCurve>
  onSelectMaterial: (id: string) => void
  onNewFormula: () => void
  onAddLine: () => void
}) {
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
      setFormulaStatus('Choose a child formula and grams before adding nested accord')
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
      setFormulaStatus('Nested accord added and cycle guard passed')
    } catch (error) {
      setFormulaStatus(error instanceof Error ? error.message : 'Nested formula add failed')
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
                    {line.childFormulaId ? 'Nested accord' : 'Raw material leaf'}
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

      <Panel title="Nested Accord" icon={Layers3}>
        <div className="material-form-grid">
          <label className="field-row">
            <span>Child formula</span>
            <select
              aria-label="Nested child formula"
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
            <span>Nested grams</span>
            <input
              aria-label="Nested formula grams"
              min={0.01}
              step={0.01}
              type="number"
              value={nestedGrams}
              onChange={(event) => setNestedGrams(Number(event.target.value))}
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void addNestedFormulaLine()} disabled={!nestedFormulaId}>
            Add Nested
          </button>
        </div>
        <ul className="policy-list">
          <li>Cycle guard blocks parent-child loops before saving.</li>
          <li>Nested save recalculates resolve and cost but creates no stock movement.</li>
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
}

function InventoryWorkspace({
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
}: {
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
}) {
  const [selectedLotId, setSelectedLotId] = useState(lots[0]?.id ?? '')
  const [qualityStatus, setQualityStatus] = useState<LotQualityStatus>('APPROVED')
  const [qualityReason, setQualityReason] = useState('QC release review')
  const [stockTakeCount, setStockTakeCount] = useState(0)
  const [stockTakeReason, setStockTakeReason] = useState('Cycle count reconciliation')
  const [stockTakeRecords, setStockTakeRecords] = useState<StockTakeRecord[]>([])
  const [labelPayload, setLabelPayload] = useState<LotLabelPayload | null>(null)
  const [genealogy, setGenealogy] = useState<LotGenealogyResponse | null>(null)
  const [reorderSuggestions, setReorderSuggestions] = useState<InventoryReorderSuggestion[]>([])
  const [newLocationName, setNewLocationName] = useState('Retest Bin 1')
  const [newLocationZone, setNewLocationZone] = useState('Quality')
  const [newLocationCapacity, setNewLocationCapacity] = useState(600)
  const [inventoryStatus, setInventoryStatus] = useState('Phase 6 console ready')
  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? lots[0]
  const selectedMaterial = selectedLot ? materialRecords.find((material) => material.id === selectedLot.materialId) : undefined
  const selectedLocation = selectedLot ? storageLocations.find((location) => location.name === selectedLot.location) : undefined

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
          setInventoryStatus('API sync unavailable, showing local seed data')
        }
      })
    return () => {
      active = false
    }
  }, [onLotsChange, onMovementsChange, onStorageLocationsChange])

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
    try {
      const payload = await requestApi<LotQualityResponse>(`/lots/${encodeURIComponent(selectedLot.id)}/quality`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualityStatus, reason: qualityReason }),
      })
      upsertLot(payload.lot)
      setInventoryStatus(`${payload.lot.lotNumber} moved to ${payload.lot.qualityStatus} with no stock movement`)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'QC status update failed')
    }
  }

  async function reconcileStockTake() {
    if (!selectedLot) {
      return
    }
    try {
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
          kind: 'Bin',
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
    if (!selectedLot) {
      return
    }
    try {
      const payload = await requestApi<LotLabelResponse>(`/lots/${encodeURIComponent(selectedLot.id)}/label`, {
        method: 'POST',
      })
      setLabelPayload(payload.label)
      setInventoryStatus(payload.invariant)
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : 'Label generation failed')
    }
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
              <div>
                <strong>{selectedLot.lotNumber}</strong>
                <span>{selectedMaterial?.name ?? selectedLot.materialId}</span>
              </div>
              <DataTag label="Qty" value={formatGrams(selectedLot.quantityGrams)} />
              <DataTag label="Reserved" value={formatGrams(selectedLot.reservedGrams)} />
              <DataTag label="Expiry" value={selectedLot.expiryDate} tone="amber" />
              <DataTag label="Location" value={selectedLot.location} tone="blue" />
              <DataTag label="Supplier" value={selectedLot.supplierLotRef ?? 'Not set'} />
              <DataTag label="Retest" value={selectedLot.retestDate ?? 'Not set'} />
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
                Update QC
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
                Stock Take
              </button>
            </div>

            <div className="action-row">
              <button className="ghost-button small" type="button" onClick={() => void printLotLabel()}>
                Print QR Label
              </button>
              <button className="ghost-button small" type="button" onClick={() => void loadLotGenealogy()}>
                View Genealogy
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
          <button className="primary-button" type="button" onClick={() => void createLocation()} disabled={!newLocationName.trim() || newLocationCapacity <= 0}>
            New Location
          </button>
        </div>
        <div className="material-list">
          {storageLocations.slice(0, 8).map((location) => {
            const storedGrams = lots
              .filter((lot) => lot.location === location.name)
              .reduce((sum, lot) => sum + lot.quantityGrams, 0)
            return (
              <div className="material-row static" key={location.id}>
                <div>
                  <strong>{location.name}</strong>
                  <span>{location.zone} / {location.kind ?? 'Location'} / {location.condition}</span>
                </div>
                <div className="mono-value">{formatGrams(storedGrams)}</div>
                <StatusBadge status={location.status === 'IN_TRANSIT' ? 'review' : 'stable'} label={location.status ?? 'ACTIVE'} />
              </div>
            )
          })}
        </div>
      </Panel>

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
}

function LabUsageWorkspace({
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
  onReverse: () => void
}) {
  const latestCommitted = usageHistory.find((usage) => usage.status === 'COMMITTED')
  const actualTotal = weighingSession.lines.reduce((sum, line) => sum + line.actualGrams, 0)
  const maxDeviation = weighingSession.lines.reduce((max, line) => Math.max(max, line.deviationPercent), 0)
  return (
    <div className="workspace-grid lab-grid">
      <Panel
        title="Commit Preview"
        icon={ClipboardCheck}
        right={<DataTag label="Formula" value={weighingSession.formulaCode} />}
      >
        <label className="slider-row">
          <span>Trial batch grams</span>
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
        <div className="empty-state compact">{statusMessage}</div>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={onCommit} disabled={!weighingReady || busy}>
            <Play size={16} />
            {busy ? 'Working' : 'Commit Actual Usage'}
          </button>
          <button className="ghost-button" type="button" onClick={onReverse} disabled={!latestCommitted || busy}>
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

      <Panel title="Usage History" icon={Activity}>
        <div className="history-list">
          {usageHistory.length === 0 ? (
            <div className="empty-state">No lab usage committed in this session.</div>
          ) : (
            usageHistory.map((usage) => (
              <div className="history-row" key={usage.id}>
                <div>
                  <strong>{usage.id}</strong>
                  <span>
                    {usage.formulaCode} / {formatGrams(usage.batchGrams)}
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
}

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
      setStatusMessage('Signed URL issued and download audit recorded')
    } catch {
      setStatusMessage('Could not sign URL from API; permission gate or server unavailable')
    } finally {
      setLoadingDocumentId(null)
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
    setStatusMessage('Creating tenant-scoped external share link')

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
                  {document.type} / {document.linkedTo} / {document.sizeKb}KB
                  {document.expiresAt ? ` / expires ${document.expiresAt}` : ''}
                </span>
              </div>
              <DataTag label={document.sensitivity} value={document.status} />
              <span className="mono-value">{document.downloads} downloads</span>
              <div className="document-actions">
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
              </div>
            </div>
          ))}
        </div>
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
            <span>Select a document to create a short-lived tenant-scoped access URL.</span>
          </div>
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

function ProductionWorkspace() {
  const approvedFormulaIds = useMemo(
    () => new Set(formulaVersions.filter((version) => version.status === 'APPROVED').map((version) => version.formulaId)),
    [],
  )
  const approvedFormulas = useMemo(
    () => formulas.filter((formula) => approvedFormulaIds.has(formula.id)),
    [approvedFormulaIds],
  )
  const [batches, setBatches] = useState<ProductionBatchRecord[]>(productionBatches)
  const [selectedFormulaId, setSelectedFormulaId] = useState(approvedFormulas[0]?.id ?? 'frm-0421')
  const [targetGrams, setTargetGrams] = useState(25)
  const [statusMessage, setStatusMessage] = useState('Loading production batches')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [lastMovements, setLastMovements] = useState<InventoryMovement[]>([])
  const activeBatch = batches[0]

  const batchCostBasis = useCallback((batch: ProductionBatchRecord) => {
    const leaves = resolveFormulaWithCatalog(batch.formulaId, formulas, materials)
    return formulaTotals(leaves).costPerGram * batch.targetGrams
  }, [])

  const updateBatch = useCallback((updated: ProductionBatchRecord) => {
    setBatches((current) => current.map((batch) => (batch.id === updated.id ? updated : batch)))
  }, [])

  const loadBatches = useCallback(async () => {
    try {
      const payload = await requestApi<ProductionBatchRecord[]>('/production/batches')
      setBatches(payload)
      setStatusMessage('Production batches synced from live API')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Using local production batch seed')
    }
  }, [])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  async function createBatch() {
    setCreating(true)
    setStatusMessage('Creating production batch from approved formula')
    try {
      const batch = await requestApi<ProductionBatchRecord>('/production/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formulaId: selectedFormulaId, targetGrams }),
      })
      setBatches((current) => [batch, ...current])
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
      setStatusMessage(error instanceof Error ? error.message : 'Production consumption failed')
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
      setStatusMessage(error instanceof Error ? error.message : 'QC update failed')
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
      setStatusMessage(error instanceof Error ? error.message : 'Lifecycle update failed')
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
            <select value={selectedFormulaId} onChange={(event) => setSelectedFormulaId(event.target.value)}>
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
          <button className="primary-button" type="button" onClick={() => void createBatch()} disabled={creating || targetGrams <= 0}>
            {creating ? 'Creating' : 'Create batch'}
          </button>
        </div>
        <ul className="policy-list">
          <li>Only formulas with an approved version snapshot can enter production.</li>
          <li>Batch consumption writes PRODUCTION_CONSUMPTION, never LAB_CONSUMPTION.</li>
          <li>{statusMessage}</li>
        </ul>
      </Panel>

      <Panel title="Lifecycle Gate" icon={ClipboardCheck}>
        {activeBatch ? (
          <div className="production-timeline">
            {productionLifecycle.map((status) => (
              <button
                className={`timeline-step ${activeBatch.status === status ? 'is-current' : ''} ${productionLifecycle.indexOf(activeBatch.status) > productionLifecycle.indexOf(status) ? 'is-done' : ''}`}
                key={status}
                type="button"
                onClick={() => void moveBatch(activeBatch.id, status)}
                disabled={busyId === activeBatch.id || status === 'WEIGHING'}
              >
                <span>{status}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">No batch created yet.</div>
        )}
        {activeBatch && (
          <div className="metric-grid">
            <Metric label="Active batch" value={activeBatch.id} />
            <Metric label="Status" value={activeBatch.status} />
            <Metric label="QC" value={activeBatch.qcStatus} />
            <Metric label="Cost basis" value={formatCurrency(batchCostBasis(activeBatch))} />
            <Metric label="Output lot" value={activeBatch.outputLot?.lotNumber ?? 'Pending release'} />
            <Metric
              label="Yield"
              value={activeBatch.yieldGrams ? `${formatGrams(activeBatch.yieldGrams)} / ${activeBatch.yieldVariancePercent}%` : 'Pending'}
            />
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
                  onClick={() => void consumeBatch(batch.id)}
                  disabled={busyId === batch.id || batch.consumedGrams > 0}
                >
                  Consume
                </button>
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void moveBatch(batch.id, 'FILTRATION')}
                  disabled={busyId === batch.id || batch.consumedGrams <= 0 || batch.status === 'RELEASED'}
                >
                  Filtration
                </button>
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void moveBatch(batch.id, 'QC')}
                  disabled={busyId === batch.id || batch.consumedGrams <= 0 || batch.status === 'RELEASED'}
                >
                  QC ready
                </button>
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void recordQc(batch.id, 'PASSED')}
                  disabled={busyId === batch.id || batch.consumedGrams <= 0 || batch.qcStatus === 'PASSED'}
                >
                  QC pass
                </button>
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void recordQc(batch.id, 'FAILED')}
                  disabled={busyId === batch.id || batch.consumedGrams <= 0 || batch.status === 'RELEASED'}
                >
                  Hold
                </button>
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => void moveBatch(batch.id, 'RELEASED')}
                  disabled={busyId === batch.id || batch.qcStatus !== 'PASSED' || batch.status === 'RELEASED'}
                >
                  Release
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

      <Panel title="Phase 9 Guardrails" icon={ShieldCheck}>
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
  const [receiveDraft, setReceiveDraft] = useState<Record<string, number>>({})

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
    setBusyId('po-create')
    setStatusMessage('Creating purchase order draft')
    try {
      const payload = await requestApi<PurchaseOrderCreateResponse>('/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: orderDraft.supplierId,
          materialId: orderDraft.materialId,
          quantityGrams: Number(orderDraft.quantityGrams),
          unitCost: Number(orderDraft.unitCost),
          currency: orderDraft.currency,
        }),
      })
      updateOrder(payload.purchaseOrder)
      setSelectedMaterialId(payload.purchaseOrder.materialId)
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

  async function receivePurchaseOrder(order: PurchaseOrderRecord, receiveAll = false) {
    const remainingGrams = order.quantityGrams - order.receivedGrams
    const receivedGrams = receiveAll ? remainingGrams : Number(receiveDraft[order.id] ?? remainingGrams)
    setBusyId(order.id)
    setStatusMessage(`Receiving ${formatGrams(receivedGrams)} for ${order.id}`)
    try {
      const payload = await requestApi<PurchaseOrderReceiptResponse>(`/purchase-orders/${encodeURIComponent(order.id)}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivedGrams }),
      })
      updateOrder(payload.purchaseOrder)
      onLotsChange((current) => (current.some((lot) => lot.id === payload.lot.id) ? current : [payload.lot, ...current]))
      onMovementsChange((current) =>
        current.some((movement) => movement.id === payload.movement.id) ? current : [payload.movement, ...current],
      )
      setHistoryRows((current) =>
        current.some((record) => record.id === payload.priceHistory.id) ? current : [payload.priceHistory, ...current],
      )
      setReceiveDraft((current) => ({ ...current, [order.id]: Math.max(payload.purchaseOrder.quantityGrams - payload.purchaseOrder.receivedGrams, 0) }))
      setSelectedMaterialId(order.materialId)
      setLastReceipt(payload)
      setStatusMessage(payload.invariant)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Purchase order receipt failed')
    } finally {
      setBusyId(null)
    }
  }

  function fillOrderFromMaterial(materialId: string) {
    const material = materialById.get(materialId)
    setOrderDraft((current) => ({
      ...current,
      materialId,
      unitCost: material?.costPerGram ?? current.unitCost,
    }))
    setSelectedMaterialId(materialId)
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
    setSelectedMaterialId(suggestion.materialId)
    setStatusMessage(`${suggestion.materialName} loaded into PO draft from low-stock suggestion`)
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
            <span>Material</span>
            <select
              aria-label="Purchase order material"
              value={orderDraft.materialId}
              onChange={(event) => fillOrderFromMaterial(event.target.value)}
            >
              {materialOptions.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Quantity grams</span>
            <input
              aria-label="Purchase order quantity grams"
              min={1}
              step={1}
              type="number"
              value={orderDraft.quantityGrams}
              onChange={(event) => setOrderDraft((current) => ({ ...current, quantityGrams: Number(event.target.value) }))}
            />
          </label>
          <label className="field-row">
            <span>Unit cost</span>
            <input
              aria-label="Purchase order unit cost"
              min={0.01}
              step={0.01}
              type="number"
              value={orderDraft.unitCost}
              onChange={(event) => setOrderDraft((current) => ({ ...current, unitCost: Number(event.target.value) }))}
            />
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
          <button
            className="primary-button"
            type="button"
            onClick={() => void createPurchaseOrder()}
            disabled={busyId === 'po-create' || !orderDraft.supplierId || !orderDraft.materialId || orderDraft.quantityGrams <= 0}
          >
            Create PO
          </button>
        </div>
        <ul className="policy-list">
          <li>Draft PO creation does not reserve or move inventory.</li>
          <li>Goods receipt is the only action that creates lots and RECEIPT movements.</li>
        </ul>
      </Panel>

      <Panel className="wide" title="Purchase Order Board" icon={Activity}>
        <div className="document-list compact-list purchase-order-list">
          {activeOrders.length === 0 ? (
            <div className="empty-state compact">No active purchase orders.</div>
          ) : (
            activeOrders.map((order) => {
              const material = materialById.get(order.materialId)
              const supplier = supplierById.get(order.supplierId)
              const remainingGrams = order.quantityGrams - order.receivedGrams
              return (
                <div className="document-row purchase-order-row" key={order.id}>
                  <div>
                    <strong>{order.id} / {material?.name ?? order.materialId}</strong>
                    <span>{supplier?.name ?? order.supplierId} / expected {order.expectedDate}</span>
                    <span>
                      {formatGrams(order.receivedGrams)} received of {formatGrams(order.quantityGrams)} / {formatCurrency(order.unitCost)} per g
                    </span>
                  </div>
                  <StatusBadge status={purchaseOrderStatusTone[order.status]} label={order.status} />
                  <input
                    aria-label={`Receive grams for ${order.id}`}
                    min={0}
                    max={remainingGrams}
                    step={1}
                    type="number"
                    value={receiveDraft[order.id] ?? remainingGrams}
                    onChange={(event) =>
                      setReceiveDraft((current) => ({ ...current, [order.id]: Number(event.target.value) }))
                    }
                  />
                  <div className="document-actions">
                    <button
                      className="ghost-button small"
                      type="button"
                      onClick={() => void sendPurchaseOrder(order.id)}
                      disabled={busyId === order.id || order.status !== 'DRAFT'}
                    >
                      Send
                    </button>
                    <button
                      className="primary-button small"
                      type="button"
                      onClick={() => void receivePurchaseOrder(order)}
                      disabled={busyId === order.id || order.status === 'DRAFT' || remainingGrams <= 0}
                    >
                      Receive
                    </button>
                    <button
                      className="ghost-button small"
                      type="button"
                      onClick={() => void receivePurchaseOrder(order, true)}
                      disabled={busyId === order.id || order.status === 'DRAFT' || remainingGrams <= 0}
                    >
                      Receive Remaining
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

      <Panel title="Phase 10 Guardrails" icon={ShieldCheck}>
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
}

const sampleStatusTone: Record<SampleRequestRecord['status'], DomainStatus> = {
  REQUESTED: 'active',
  APPROVED: 'stable',
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
}: {
  stock: ReturnType<typeof stockSummary>
  materialRecords: Material[]
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
    customer: 'Maison Trial Studio',
    customerGroup: 'Studio' as PriceListRecord['customerGroup'],
    quantityPacks: 2,
  })
  const [sampleDraft, setSampleDraft] = useState({
    customer: 'Atelier Preview',
    packs: 1,
  })

  const materialById = useMemo(
    () => new Map(materialOptions.map((material) => [material.id, material])),
    [materialOptions],
  )
  const skuById = useMemo(() => new Map(skuRows.map((sku) => [sku.id, sku])), [skuRows])
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
      activePriceListByGroup.get(quoteDraft.customerGroup) ??
      (selectedSku ? activePriceListByGroup.get(selectedSku.tier) : undefined) ??
      priceListRows[0],
    [activePriceListByGroup, priceListRows, quoteDraft.customerGroup, selectedSku],
  )
  const quoteUnitPrice = selectedSku && activePriceList ? selectedSku.price * activePriceList.multiplier : 0
  const quoteTotal = quoteUnitPrice * quoteDraft.quantityPacks

  useEffect(() => {
    setSkuRows((current) => syncSkuAvailabilityRows(current, stock))
  }, [stock])

  useEffect(() => {
    let active = true
    async function loadCommerce() {
      try {
        const [skuPayload, priceListPayload, quotePayload, samplePayload] = await Promise.all([
          requestApi<CatalogSkuAvailability[]>('/catalog/skus'),
          requestApi<PriceListRecord[]>('/price-lists'),
          requestApi<QuoteRecord[]>('/quotes'),
          requestApi<SampleRequestRecord[]>('/samples'),
        ])
        if (!active) {
          return
        }
        setSkuRows(skuPayload)
        setPriceListRows(priceListPayload)
        setQuoteRows(quotePayload)
        setSampleRows(samplePayload)
        setSelectedSkuId((current) => (skuPayload.some((sku) => sku.id === current) ? current : skuPayload[0]?.id ?? ''))
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
    if (!selectedSku) {
      return
    }
    setBusyId('quote-create')
    setStatusMessage('Creating quote from inventory-derived SKU availability')
    try {
      const payload = await requestApi<QuoteCreateResponse>('/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: selectedSku.id,
          customer: quoteDraft.customer,
          customerGroup: quoteDraft.customerGroup,
          quantityPacks: Number(quoteDraft.quantityPacks),
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
                <span>Customer</span>
                <input
                  aria-label="Quote customer"
                  value={quoteDraft.customer}
                  onChange={(event) => setQuoteDraft((current) => ({ ...current, customer: event.target.value }))}
                />
              </label>
              <label className="field-row">
                <span>Customer group</span>
                <select
                  aria-label="Quote customer group"
                  value={quoteDraft.customerGroup}
                  onChange={(event) => setQuoteDraft((current) => ({ ...current, customerGroup: event.target.value as PriceListRecord['customerGroup'] }))}
                >
                  <option value="Studio">Studio</option>
                  <option value="Lab">Lab</option>
                  <option value="Bulk">Bulk</option>
                  <option value="Contract">Contract</option>
                </select>
              </label>
              <label className="field-row">
                <span>Quantity packs</span>
                <input
                  aria-label="Quote quantity packs"
                  min={1}
                  type="number"
                  value={quoteDraft.quantityPacks}
                  onChange={(event) => setQuoteDraft((current) => ({ ...current, quantityPacks: Number(event.target.value) }))}
                />
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={() => void createQuote()}
                disabled={busyId === 'quote-create' || !quoteDraft.customer.trim() || quoteDraft.quantityPacks <= 0}
              >
                Create Quote
              </button>
            </div>
            <div className="metric-grid">
              <Metric label="Selected SKU" value={selectedSku.name} />
              <Metric label="Available" value={`${selectedSku.canSellPacks} packs`} />
              <Metric label="Unit quote" value={formatCurrency(quoteUnitPrice)} />
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
          <div className="empty-state compact">Select a SKU to preview tenant label and sample request.</div>
        )}
      </Panel>

      <Panel className="wide" title="Quote & Sample Evidence" icon={Activity}>
        <div className="commerce-evidence-grid">
          <div className="document-list compact-list">
            {quoteRows.slice(0, 5).map((quote) => (
              <div className="document-row quote-row" key={quote.id}>
                <div>
                  <strong>{quote.id} / {skuById.get(quote.skuId)?.name ?? quote.skuId}</strong>
                  <span>{quote.customer} / {quote.customerGroup} / {quote.quantityPacks} packs</span>
                </div>
                <StatusBadge status={quoteStatusTone[quote.status]} label={quote.status} />
                <div className="mono-value">{formatCurrency(quote.total)}</div>
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
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Phase 11 Guardrails" icon={ShieldCheck}>
        <ul className="policy-list">
          <li>SKU records store pack, price, label, and material mapping only.</li>
          <li>Available packs are derived from approved inventory lots at read time.</li>
          <li>Quotes and samples do not create reservations or InventoryMovement rows.</li>
          <li>Public storefront, customer portal, and document-per-SKU surfacing remain next gates.</li>
        </ul>
      </Panel>
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
    name: 'North Star Studio',
    group: 'Studio' as CustomerRecord['group'],
    creditLimit: 300,
    paymentTerms: 'NET_15' as CustomerRecord['paymentTerms'],
    contactEmail: 'orders@north-star-studio.example',
    city: 'Los Angeles',
    country: 'US',
  })
  const [orderDraft, setOrderDraft] = useState({
    customerId: '',
    skuId: commercialSkus[0]?.id ?? '',
    quantity: 1,
    discountPercent: 0,
    taxPercent: 8,
    shippingCost: 12,
  })
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
  const draftSku = skuById.get(orderDraft.skuId)
  const draftCustomer = customerById.get(orderDraft.customerId)
  const draftPriceList = priceLists.find((priceList) => priceList.customerGroup === draftCustomer?.group && priceList.status === 'ACTIVE')
  const draftUnitPrice = draftSku ? draftSku.price * (draftPriceList?.multiplier ?? 1) : 0
  const draftSubtotal = draftUnitPrice * orderDraft.quantity
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
      skuId: skuById.has(current.skuId) ? current.skuId : skuRows[0]?.id ?? '',
    }))
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
          quantity: Number(orderDraft.quantity),
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

  async function runOrderAction(orderId: string, action: 'reserve' | 'cancel' | 'pack' | 'ship' | 'fulfill') {
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
        const payload = await requestApi<OrderReservationResponse>(endpoint, { method: 'POST' })
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
            <label className="field-row">
              <span>SKU</span>
              <select
                aria-label="Order SKU"
                value={orderDraft.skuId}
                onChange={(event) => setOrderDraft((current) => ({ ...current, skuId: event.target.value }))}
              >
                {skuRows.map((sku) => (
                  <option key={sku.id} value={sku.id}>
                    {sku.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-triple">
              <label className="field-row">
                <span>Packs</span>
                <input
                  aria-label="Order quantity"
                  min={1}
                  type="number"
                  value={orderDraft.quantity}
                  onChange={(event) => setOrderDraft((current) => ({ ...current, quantity: Number(event.target.value) }))}
                />
              </label>
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
              disabled={busyId === 'order-create' || !orderDraft.customerId || !orderDraft.skuId || orderDraft.quantity <= 0}
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
                  <span>{sku?.name ?? order.skuId} / {order.quantity} pack(s) / {formatCurrency(order.total)}</span>
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
                    disabled={busy || !['DRAFT', 'CONFIRMED', 'BACKORDER'].includes(order.status)}
                  >
                    Reserve
                  </button>
                  <button
                    className="ghost-button small"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void runOrderAction(order.id, 'pack')
                    }}
                    disabled={busy || order.status !== 'RESERVED'}
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
                    disabled={busy || !['RESERVED', 'PACKED', 'SHIPPED'].includes(order.status)}
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
                    disabled={busy || ['FULFILLED', 'SHIPPED', 'DELIVERED', 'INVOICED', 'CLOSED', 'CANCELLED'].includes(order.status)}
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
        {selectedOrder && selectedSku ? (
          <>
            <div className="metric-grid">
              <Metric label="SKU" value={selectedSku.name} />
              <Metric label="Can sell" value={`${selectedSku.canSellPacks} packs`} />
              <Metric label="Required" value={formatGrams(selectedSku.packSizeGrams * selectedOrder.quantity)} />
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

      <Panel title="Phase 12 Guardrails" icon={ShieldCheck}>
        <ul className="policy-list">
          <li>Order creation prices SKU packs but does not reserve or move inventory.</li>
          <li>Reservation reduces available stock only and creates no InventoryMovement.</li>
          <li>Cancel releases reserved grams without writing a movement row.</li>
          <li>Fulfillment creates OUT movements and keeps shipment lot traceability plus invoice/COA evidence.</li>
        </ul>
      </Panel>
    </div>
  )
}

function CostingWorkspace() {
  const [costingData, setCostingData] = useState<CostingOverview>(clientFallbackCosting)
  const [batchCost, setBatchCost] = useState<BatchCostReport>(clientFallbackBatchCost)
  const [statusMessage, setStatusMessage] = useState('Loading costing read models')
  const cogsTotal = costingData.cogs.reduce((sum, line) => sum + line.cogs, 0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadCosting() {
      try {
        const [overview, batch] = await Promise.all([
          requestApi<CostingOverview>('/costing/overview', { signal: controller.signal }),
          requestApi<BatchCostReport>('/costing/batches/BTH-2025-118', { signal: controller.signal }),
        ])
        setCostingData(overview)
        setBatchCost(batch)
        setStatusMessage('Costing synced from live API')
      } catch {
        if (!controller.signal.aborted) {
          setStatusMessage('Using local costing seed until API is reachable')
        }
      }
    }

    void loadCosting()

    return () => controller.abort()
  }, [])

  return (
    <div className="workspace-grid costing-grid">
      <Panel title="Cost Trace" icon={BadgeDollarSign} right={<DataTag label="Status" value={statusMessage} tone="blue" />}>
        <div className="metric-grid costing-metrics">
          <Metric label={`${costingData.formula.formulaCode} total`} value={formatCurrency(costingData.formula.totalCost)} />
          <Metric label="Formula cost / gram" value={formatCurrency(costingData.formula.costPerGram)} />
          <Metric label="50g bottle" value={formatCurrency(costingData.formula.costPerBottle)} />
          <Metric label="Inventory valuation" value={formatCurrency(costingData.valuation.totalValue)} />
          <Metric label="COGS captured" value={formatCurrency(cogsTotal)} />
          <Metric label="Most expensive" value={costingData.formula.mostExpensiveMaterial} />
        </div>
        <div className="trace-strip">
          {costingData.formula.trace.slice(0, 4).map((trace) => (
            <span key={trace}>{trace}</span>
          ))}
        </div>
      </Panel>

      <Panel title="Batch Cost" icon={FlaskConical}>
        <div className="metric-grid">
          <Metric label={batchCost.batchId} value={formatCurrency(batchCost.totalCost)} />
          <Metric label="Cost / gram" value={formatCurrency(batchCost.costPerGram)} />
          <Metric label="Material" value={formatCurrency(batchCost.materialCost)} />
          <Metric label="Labor + overhead" value={formatCurrency(batchCost.laborCost + batchCost.overheadCost)} />
        </div>
        <p className="caveat">{batchCost.invariant}</p>
      </Panel>

      <Panel title="Cost Methods & Landed Cost" icon={Database}>
        <div className="cost-policy-list">
          {costingData.methodPolicies.map((policy) => {
            const landed = costingData.landedCosts.find((profile) => profile.materialId === policy.materialId)
            return (
              <div className="cost-policy-row" key={policy.materialId}>
                <div>
                  <strong>{policy.materialId}</strong>
                  <span>{policy.method}</span>
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
        </div>
      </Panel>

      <Panel title="Formula Cost Breakdown" icon={Layers3}>
        <div className="cost-breakdown-list">
          {costingData.formula.lines.map((line) => (
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

      <Panel title="SKU Margin & Price List" icon={ShoppingCart}>
        <div className="cost-breakdown-list">
          {costingData.skuMargins.map((sku) => (
            <div className="margin-row" key={sku.skuId}>
              <div>
                <strong>{sku.skuName}</strong>
                <span>{sku.trace.join(' / ')}</span>
              </div>
              <DataTag label="Pack cost" value={formatCurrency(sku.packCost)} />
              <DataTag label="Margin" value={`${sku.marginPercent.toFixed(1)}%`} tone={sku.marginPercent > 40 ? 'green' : 'amber'} />
              <DataTag label="Target price" value={formatCurrency(sku.recommendedPrice)} tone="blue" />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Valuation Report" icon={Boxes}>
        <div className="cost-breakdown-list compact-list">
          {costingData.valuation.lines.slice(0, 6).map((line) => (
            <div className="valuation-row" key={line.materialId}>
              <div>
                <strong>{line.materialName}</strong>
                <span>{line.method} / {line.locationBreakdown.map((item) => item.location).join(', ')}</span>
              </div>
              <span>{formatGrams(line.currentGrams)}</span>
              <span>{formatGrams(line.availableGrams)} available</span>
              <strong>{formatCurrency(line.value)}</strong>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="COGS Trace" icon={ClipboardCheck}>
        <div className="cost-breakdown-list compact-list">
          {costingData.cogs.map((line) => (
            <div className="valuation-row" key={line.movementId}>
              <div>
                <strong>{line.materialName}</strong>
                <span>{line.type} / {line.ref}</span>
              </div>
              <span>{formatGrams(line.quantityGrams)}</span>
              <span>{formatCurrency(line.unitCost)}/g</span>
              <strong>{formatCurrency(line.cogs)}</strong>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Finance Guardrails" icon={ShieldCheck}>
        <ul className="policy-list">
          <li>Costing is a read model over formula resolve, lot cost, landed cost, and movement COGS.</li>
          <li>Margin is guarded by costing.view and finance.viewMargin role permissions.</li>
          <li>Formula, valuation, and COGS traces are source-backed snapshots, not accounting journal posts.</li>
        </ul>
      </Panel>
    </div>
  )
}

function AnalyticsWorkspace() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsDashboardReport>(clientFallbackAnalytics)
  const [statusMessage, setStatusMessage] = useState('Loading analytics dashboard')
  const [runningReportId, setRunningReportId] = useState<string | null>(null)
  const burnChart = analyticsData.burnRate.map((row) => ({
    name: row.materialName.split(' ')[0],
    usage: row.usageGrams,
    daily: row.dailyBurnGrams,
  }))

  useEffect(() => {
    const controller = new AbortController()

    async function loadAnalytics() {
      try {
        const dashboard = await requestApi<AnalyticsDashboardReport>('/analytics/dashboard', {
          signal: controller.signal,
        })
        setAnalyticsData(dashboard)
        setStatusMessage('Analytics synced from live API')
      } catch {
        if (!controller.signal.aborted) {
          setStatusMessage('Using local analytics seed until API is reachable')
        }
      }
    }

    void loadAnalytics()

    return () => controller.abort()
  }, [])

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
      <Panel title="Read-only Intelligence" icon={BarChart3} right={<DataTag label="Status" value={statusMessage} tone="blue" />}>
        <div className="metric-grid analytics-metrics">
          <Metric label="Burn rows" value={String(analyticsData.burnRate.length)} />
          <Metric label="Forecast rows" value={String(analyticsData.lowStockForecast.length)} />
          <Metric label="Expiry risks" value={String(analyticsData.expiryRisk.length)} />
          <Metric label="Reports" value={String(analyticsData.scheduledReports.length)} />
        </div>
        <div className="chart-wrap compact-chart">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={burnChart}>
              <defs>
                <linearGradient id="burnUsage" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4d9bff" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#4d9bff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" stroke="rgba(225,233,244,0.58)" tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(225,233,244,0.58)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)' }} />
              <Area type="monotone" dataKey="usage" stroke="#4d9bff" fill="url(#burnUsage)" />
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
  const fallback = useMemo<SaasConsoleResponse>(() => ({
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
    readiness: [
      {
        key: 'api-offline',
        label: 'Commercial console API',
        status: 'warning',
        detail: 'Client fallback is active until API is reachable',
      },
    ],
    invariant: 'client fallback contains no commercial state; API is source of truth',
  }), [session.organizationId])
  const [saasData, setSaasData] = useState<SaasConsoleResponse>(fallback)
  const [statusMessage, setStatusMessage] = useState('Loading SaaS readiness controls')
  const [auditExport, setAuditExport] = useState<AuditExportResponse | null>(null)
  const [billingAction, setBillingAction] = useState<BillingActionResponse | null>(null)
  const [exporting, setExporting] = useState(false)
  const [billingBusyAction, setBillingBusyAction] = useState<string | null>(null)
  const activeSeats = saasData.usage.activeSeats
  const storageUsedGb = saasData.usage.storageGb
  const apiUsage = saasData.usage.apiCalls

  useEffect(() => {
    const controller = new AbortController()

    async function loadSaasConsole() {
      try {
        const payload = await requestApi<SaasConsoleResponse>('/billing/console', { signal: controller.signal })
        setSaasData(payload)
        setStatusMessage('Commercial console synced from live API')
      } catch {
        if (!controller.signal.aborted) {
          setStatusMessage('Using local SaaS readiness seed until API is reachable')
        }
      }
    }

    void loadSaasConsole()

    return () => controller.abort()
  }, [])

  async function queueAuditExport() {
    setExporting(true)
    setStatusMessage('Queueing tenant-scoped audit export')
    try {
      const payload = await requestApi<AuditExportResponse>('/audit/export', { method: 'POST' })
      setAuditExport(payload)
      setStatusMessage(`${payload.id} queued for ${payload.scope}`)
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
        const consolePayload = await requestApi<SaasConsoleResponse>('/billing/console')
        setSaasData(consolePayload)
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
      const consolePayload = await requestApi<SaasConsoleResponse>('/billing/console')
      setSaasData(consolePayload)
      setStatusMessage(`${deliveryId} delivered with preserved idempotency key`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Webhook retry failed')
    } finally {
      setBillingBusyAction(null)
    }
  }

  return (
    <div className="workspace-grid saas-grid">
      <Panel title="Billing & Plan Limits" icon={BadgeDollarSign}>
        <div className="metric-grid">
          <Metric label="Plan" value={saasData.plan.name} />
          <Metric label="Monthly" value={formatCurrency(saasData.plan.monthlyPrice)} />
          <Metric label="Status" value={saasData.subscription.status.toUpperCase()} />
          <Metric label="Next invoice" value={new Date(saasData.subscription.nextInvoiceAt).toLocaleDateString()} />
          <Metric label="Seats" value={`${activeSeats}/${saasData.plan.seats}`} />
          <Metric label="Storage" value={`${storageUsedGb.toFixed(3)}/${saasData.plan.storageGb}GB`} />
        </div>
        <div className="usage-meter">
          <span style={{ width: `${Math.min(100, (activeSeats / saasData.plan.seats) * 100)}%` }} />
        </div>
        <div className="action-row">
          <button
            className="primary-button"
            type="button"
            onClick={() => void runBillingAction('checkout', '/billing/checkout', {
              body: JSON.stringify({ planId: saasData.plan.id, mode: 'manual_sales' }),
              headers: { 'Content-Type': 'application/json' },
            })}
            disabled={billingBusyAction !== null}
          >
            Start sale
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => void runBillingAction('portal', '/billing/portal')}
            disabled={billingBusyAction !== null}
          >
            Billing portal
          </button>
          {saasData.subscription.canWrite ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => void runBillingAction('freeze', '/billing/subscription/freeze', {
                body: JSON.stringify({ reason: 'Commercial readiness freeze test' }),
                headers: { 'Content-Type': 'application/json' },
              })}
              disabled={billingBusyAction !== null}
            >
              Freeze tenant
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              onClick={() => void runBillingAction('reactivate', '/billing/subscription/reactivate')}
              disabled={billingBusyAction !== null}
            >
              Reactivate
            </button>
          )}
        </div>
        <ul className="policy-list">
          <li>Plan limits are enforced server-side before commercial writes.</li>
          <li>Tenant freeze keeps read/export access and blocks create/update operations.</li>
          <li>{statusMessage}</li>
        </ul>
        {billingAction ? (
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

      <Panel title="SSO / SCIM Readiness" icon={LockKeyhole}>
        <div className="tenant-summary">
          <span className="mono-small">{saasData.sso.id}</span>
          <strong>{saasData.sso.provider} for {saasData.sso.domain}</strong>
          <span>Configuration status: {saasData.sso.status}</span>
        </div>
        <div className="record-grid compact-record-grid">
          {Object.entries(saasData.sso.roleMapping).map(([group, role]) => (
            <div className="record-card" key={group}>
              <div>
                <span className="mono-small">{group}</span>
                <strong>{role}</strong>
                <span>SCIM deprovision revokes sessions</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="API Keys" icon={KeyRound}>
        <div className="document-list compact-list">
          {saasData.apiKeys.map((key) => (
            <div className="document-row" key={key.id}>
              <div>
                <strong>{key.label}</strong>
                <span>{key.id} / ****{key.lastFour} / rotated {new Date(key.rotatedAt).toLocaleDateString()}</span>
              </div>
              <StatusBadge status={key.status === 'active' ? 'stable' : 'alert'} label={key.status.toUpperCase()} />
            </div>
          ))}
        </div>
        <div className="tag-row">
          <DataTag label="Quota" value={`${apiUsage}/${saasData.plan.apiQuota}`} tone="blue" />
          <DataTag label="Managed by" value="security.apiKeys.manage" tone="amber" />
        </div>
      </Panel>

      <Panel title="Webhooks" icon={Globe2}>
        <div className="document-list compact-list">
          {saasData.webhooks.map((webhook) => (
            <div className="document-row" key={webhook.id}>
              <div>
                <strong>{webhook.id}</strong>
                <span>{webhook.url}</span>
                <span>{webhook.events.join(', ')}</span>
              </div>
              <StatusBadge status={webhook.status === 'active' ? 'stable' : 'review'} label={webhook.status.toUpperCase()} />
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
      </Panel>
    </div>
  )
}

function GenericDomainWorkspace({
  domain,
  onOpenModal,
}: {
  domain: DomainModule
  onOpenModal: (modal: ModalKind) => void
}) {
  return (
    <div className="workspace-grid generic-grid">
      <Panel title="Feature Set" icon={Layers3}>
        <CardList items={domain.features} />
      </Panel>
      <Panel title="Entities" icon={Database}>
        <CardList items={domain.entities} mono />
      </Panel>
      <Panel title="Invariants" icon={ShieldCheck}>
        <CardList items={domain.invariants} />
      </Panel>
      <Panel title="API Surface" icon={Command}>
        <CardList items={domain.apis} mono />
      </Panel>
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

function CustomizationWorkspace() {
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
      setCustomizationStatus('Tenant settings saved with audit evidence')
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
    try {
      const payload = await requestApi<BrandingUpdateResponse>('/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandingDraft),
      })
      setCustomizationData((current) => ({
        ...current,
        branding: payload.branding,
        audit: addAudit(current.audit, payload.audit),
      }))
      setBrandingDraft(payload.branding)
      setCustomizationStatus('Export branding saved as tenant configuration')
    } catch {
      setCustomizationStatus('Branding update blocked; accent color must be hex')
    }
  }

  return (
    <div className="workspace-grid customization-grid">
      <Panel title="Tenant Settings" icon={Settings}>
        <div className="tag-row">
          <DataTag label="Locale" value={customizationData.settings.locale} />
          <DataTag label="Currency" value={customizationData.settings.currency} tone="blue" />
          <DataTag label="Default unit" value={customizationData.settings.defaultUnit} tone="green" />
        </div>
        <div className="customization-form-grid">
          <label className="field-row">
            <span>Locale</span>
            <input
              aria-label="Customization locale"
              value={settingsDraft.locale}
              onChange={(event) => setSettingsDraft((current) => ({ ...current, locale: event.target.value }))}
            />
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
              <DataTag label="Phase" value={`P${flag.phase}`} tone="blue" />
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

      <Panel title="Export Branding" icon={Sparkles}>
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
            <span>Logo mode</span>
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
              <option value="wordmark">wordmark</option>
              <option value="monogram">monogram</option>
            </select>
          </label>
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
          <button className="primary-button" type="button" onClick={() => void saveBranding()}>
            Save branding
          </button>
        </div>
        <div className="branding-preview" style={{ borderColor: `${brandingDraft.accentColor}66` }}>
          <div>
            <span className="mono-small">Export preview</span>
            <strong style={{ color: brandingDraft.accentColor }}>{brandingDraft.displayName}</strong>
            <span>{brandingDraft.documentFooter}</span>
          </div>
          <span className="label-preview">
            {brandingDraft.labelTemplate.replace('{brand}', 'NXL').replace('{sequence}', '0430')}
          </span>
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
      invariant: 'client fallback contains no tenant seed; API is source of truth',
    }
  }, [])
  const [tenantData, setTenantData] = useState<TenantConsoleResponse>(fallbackTenant)
  const [tenantStatus, setTenantStatus] = useState('Loading tenant console')
  const [inviteEmail, setInviteEmail] = useState('new.viewer@example.test')
  const [inviteRole, setInviteRole] = useState('Viewer')
  const [permissionRole, setPermissionRole] = useState('Viewer')
  const [permissionName, setPermissionName] = useState('inventory.adjust')
  const [probeResult, setProbeResult] = useState<SecurityProbeResult | null>(null)
  const permissionOptions = tenantData.permissionCatalog.map((permission) => permission.key)
  const selectedRolePolicy = tenantData.rolePolicies.find((policy) => policy.role === permissionRole) ?? tenantData.rolePolicies[0]
  const selectedRoleMatrix =
    tenantData.permissionMatrix.find((matrix) => matrix.role === selectedRolePolicy?.role) ?? tenantData.permissionMatrix[0]
  const selectedPermissionKeys = new Set(selectedRolePolicy?.permissions ?? [])

  async function refreshTenantConsole(nextStatus = 'Tenant console synced from API') {
    try {
      const payload = await requestApi<TenantConsoleResponse>('/security/tenant-console')
      setTenantData(payload)
      setTenantStatus(nextStatus)
    } catch {
      setTenantStatus('Using local tenant seed until API is reachable')
    }
  }

  useEffect(() => {
    void refreshTenantConsole()
  }, [])

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
      setTenantStatus('Invite blocked by tenant membership policy')
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
      setTenantStatus('Membership status update blocked by tenant policy')
    }
  }

  async function revokeTenantSession(sessionId: string) {
    try {
      await requestApi<SessionMutationResponse>(`/security/sessions/${encodeURIComponent(sessionId)}/revoke`, {
        method: 'POST',
      })
      await refreshTenantConsole('Session revoked and audit event recorded')
    } catch {
      setTenantStatus('Session revoke blocked by tenant policy')
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
      setTenantStatus('Revoke-all blocked by tenant policy')
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
      setTenantStatus('Current session logged out; sign in again to load tenant console')
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
        title: 'Tenant probe allowed',
        detail: `Current session can access ${organizationId}`,
      })
    } catch {
      setProbeResult({
        status: 'blocked',
        title: 'Tenant probe blocked',
        detail: `Current session cannot access ${organizationId}`,
      })
    } finally {
      void refreshTenantConsole('Tenant probe recorded in audit trail')
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

  async function updateRolePermission(permissionKey: string, enabled: boolean) {
    if (!selectedRolePolicy) {
      return
    }
    const nextPermissions = enabled
      ? Array.from(new Set([...selectedRolePolicy.permissions, permissionKey]))
      : selectedRolePolicy.permissions.filter((permission) => permission !== permissionKey)
    try {
      await requestApi<PermissionMatrixResponse>(
        `/security/roles/${encodeURIComponent(selectedRolePolicy.role)}/permissions`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: nextPermissions }),
        },
      )
      await refreshTenantConsole(`${selectedRolePolicy.role} permission matrix updated`)
      setProbeResult({
        status: 'allowed',
        title: 'Permission matrix updated',
        detail: `${selectedRolePolicy.role} ${enabled ? 'now includes' : 'no longer includes'} ${permissionKey}`,
      })
    } catch {
      setTenantStatus('Permission update blocked by role policy guard')
      setProbeResult({
        status: 'blocked',
        title: 'Permission update blocked',
        detail: `${selectedRolePolicy.role} cannot be changed to that permission set`,
      })
    }
  }

  return (
    <div className="workspace-grid identity-grid">
      <Panel title="Tenant Boundary" icon={Building2}>
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
            Probe current tenant
          </button>
          <button className="ghost-button" type="button" onClick={() => void runTenantProbe('org-other')}>
            Probe external tenant
          </button>
        </div>
        {probeResult && (
          <div className={`security-result is-${probeResult.status}`}>
            <strong>{probeResult.title}</strong>
            <span>{probeResult.detail}</span>
          </div>
        )}
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
              onChange={(event) => setPermissionName(event.target.value)}
            >
              {permissionOptions.map((permission) => (
                <option key={permission} value={permission}>
                  {permission}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="button" onClick={() => void runPermissionProbe()}>
            Run probe
          </button>
        </div>
        <div className="permission-role-strip">
          {tenantData.permissionMatrix.map((matrix) => (
            <button
              className={`permission-role-card ${matrix.role === permissionRole ? 'is-selected' : ''}`}
              key={matrix.role}
              type="button"
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
        <div className="permission-grid">
          {tenantData.permissionCatalog.map((permission) => {
            const granted = selectedPermissionKeys.has(permission.key)
            const locked = permissionRole === 'Owner' && ownerLockedPermissionKeys.includes(permission.key)
            return (
              <label className={`permission-row-card ${granted ? 'is-granted' : ''}`} key={permission.key}>
                <input
                  type="checkbox"
                  checked={granted}
                  disabled={locked}
                  onChange={(event) => void updateRolePermission(permission.key, event.target.checked)}
                />
                <span>
                  <strong>{permission.label}</strong>
                  <small>{permission.key}</small>
                  <small>{permission.description}</small>
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

      <Panel className="wide" title="Tenant Security Audit" icon={ClipboardCheck}>
        <AuditList events={tenantData.audit.length > 0 ? tenantData.audit : auditEvents} />
      </Panel>
    </div>
  )
}

function PhaseRoadmap({ onNavigate }: { onNavigate: (key: DomainKey) => void }) {
  return (
    <div className="phase-strip">
      {phases.map((phase) => (
        <button className="phase-card" key={phase.id} type="button" onClick={() => onNavigate(phase.domain)}>
          <span className="mono-value">P{phase.id}</span>
          <strong>{phase.name}</strong>
          <span>{phase.gate}</span>
          <div className="phase-footer">
            <StatusDot status={phase.status} />
            <span className="mono-small">{phase.coverage}% / {phase.securityLayer}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function WorkflowGraph({ onNavigate }: { onNavigate: (key: DomainKey) => void }) {
  return (
    <div className="workflow-graph">
      {workflowNodes.map((node, index) => {
        const Icon = domainIcons[node.key]
        return (
          <div className="workflow-step-wrap" key={node.key}>
            <button className="workflow-step" type="button" onClick={() => onNavigate(node.key)}>
              <Icon size={18} />
              <strong>{node.label}</strong>
              <span>{node.detail}</span>
            </button>
            {index < workflowNodes.length - 1 && <ChevronRight className="workflow-arrow" size={18} />}
          </div>
        )
      })}
    </div>
  )
}

function DomainMatrix({ onNavigate }: { onNavigate: (key: DomainKey) => void }) {
  return (
    <div className="domain-matrix">
      {domains.map((domain) => {
        const Icon = domainIcons[domain.key]
        return (
          <button className="domain-cell" key={domain.key} type="button" onClick={() => onNavigate(domain.key)}>
            <Icon size={18} />
            <div>
              <strong>{domain.shortName}</strong>
              <span>{domain.phase}</span>
            </div>
            <div className="health-bar">
              <span style={{ width: `${domain.health}%` }} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

function EnterpriseReadiness({ onOpenModal }: { onOpenModal: (modal: ModalKind) => void }) {
  return (
    <Panel className="enterprise-panel" title="Enterprise Readiness" icon={ShieldCheck}>
      <div className="enterprise-stack">
        <div className="readiness-item">
          <span>SSO/SCIM</span>
          <StatusBadge status="review" />
        </div>
        <div className="readiness-item">
          <span>API key rotation</span>
          <StatusBadge status="testing" />
        </div>
        <div className="readiness-item">
          <span>Audit export</span>
          <StatusBadge status="active" />
        </div>
        <div className="readiness-item">
          <span>Dedicated tenant option</span>
          <StatusBadge status="draft" />
        </div>
      </div>
      <button className="primary-button full" type="button" onClick={() => onOpenModal('ssoPolicy')}>
        Review trust layer
      </button>
    </Panel>
  )
}

function EvaporationChart({ curve }: { curve: ReturnType<typeof evaporationCurve> }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={curve} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="topGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#4d9bff" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#4d9bff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="heartGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#c4a86a" stopOpacity={0.32} />
              <stop offset="95%" stopColor="#c4a86a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
          <XAxis dataKey="hour" stroke="rgba(158,166,180,.62)" tickLine={false} axisLine={false} />
          <YAxis stroke="rgba(158,166,180,.62)" tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ stroke: 'rgba(77,155,255,.32)' }}
            contentStyle={{
              background: 'rgba(9,10,13,.92)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 14,
              color: 'rgba(233,236,243,.92)',
            }}
          />
          <Area type="monotone" dataKey="Top" stroke="#4d9bff" fill="url(#topGradient)" strokeWidth={2} />
          <Area type="monotone" dataKey="Heart" stroke="#c4a86a" fill="url(#heartGradient)" strokeWidth={2} />
          <Area type="monotone" dataKey="Base" stroke="#37d6a0" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
        </AreaChart>
      </ResponsiveContainer>
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

function CommandPalette({
  open,
  onClose,
  onNavigate,
  onCommit,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (key: DomainKey) => void
  onCommit: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const commands = useMemo(
    () => [
      { label: 'Open North Star Console', detail: 'Dashboard', action: () => onNavigate('dashboard') },
      ...domains.map((domain) => ({
        label: `Open ${domain.name}`,
        detail: `Phase ${domain.phase}`,
        action: () => onNavigate(domain.key),
      })),
      { label: 'Commit FRM-0421 lab usage', detail: 'Create OUT movements', action: onCommit },
      { label: 'Review audit export', detail: 'Enterprise evidence', action: () => onNavigate('saas') },
    ],
    [onCommit, onNavigate],
  )
  const filtered = commands.filter((command) =>
    `${command.label} ${command.detail}`.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

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
