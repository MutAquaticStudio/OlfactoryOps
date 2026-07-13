import { NorthStarService } from '../server/src/services/northstar.service.js'
import { TooManyRequestsException } from '../server/src/shared/http-error.js'
import type {
  AuditEvent,
  AuthSession,
  BillingInvoiceRecord,
  BillingSubscriptionRecord,
  BrandRecord,
  BrandingConfig,
  CommercialSkuRecord,
  CustomFieldDefinition,
  DocumentRecord,
  FeatureFlagRecord,
  InventoryLot,
  InventoryMovement,
  LabUsageRecord,
  MembershipRecord,
  Material,
  MoleculeComponent,
  NumberingSequenceRecord,
  OrderDocumentRecord,
  OrganizationRecord,
  PriceHistoryRecord,
  PriceListRecord,
  ProductionBatchRecord,
  PurchaseOrderRecord,
  QuoteRecord,
  RolePolicy,
  SampleRequestRecord,
  SalesOrderRecord,
  ScheduledReportRecord,
  ShipmentRecord,
  StockTakeRecord,
  StorageLocation,
  SupplierRecord,
  TenantSettingsRecord,
  UserSettingsRecord,
  WebhookDeliveryRecord,
  CustomerRecord,
  DomainStatus,
} from '../src/data/northStar.js'

type Env = {
  DB: D1Database
  CORS_ORIGINS?: string
}

type RouteContext = {
  service: NorthStarService
  params: Record<string, string>
  query: URLSearchParams
  body: Record<string, unknown>
}

type Route = {
  method: string
  pattern: string
  public?: boolean
  sessionCookie?: 'set' | 'clear'
  mutates?: boolean
  rateLimit?: RateLimitPolicy
  limitKey?: 'seats' | 'materials' | 'formulas' | 'lots' | 'documents' | 'webhooks'
  writeGate?: boolean
  handler: (context: RouteContext) => unknown
}

type AuthCredential = {
  sessionId?: string
  source: 'cookie' | 'bearer' | 'none'
}

type RateLimitPolicy = {
  key: 'auth-login' | 'auth-signup'
  limit: number
  windowSeconds: number
}

type SnapshotKey =
  | 'materialRecords'
  | 'moleculeRecords'
  | 'lots'
  | 'movements'
  | 'locationRecords'
  | 'stockTakeRecords'
  | 'formulaRecords'
  | 'formulaVersionRecords'
  | 'usageHistory'
  | 'documentRecords'
  | 'auditEvents'
  | 'organizationRecords'
  | 'brandRecords'
  | 'membershipRecords'
  | 'sessions'
  | 'userSettingsRecords'
  | 'rolePolicyRecords'
  | 'settingsRecord'
  | 'flagRecords'
  | 'sequences'
  | 'customFieldRecords'
  | 'brandingRecord'
  | 'productionBatchRecords'
  | 'supplierRecords'
  | 'purchaseOrderRecords'
  | 'priceHistoryRecords'
  | 'commercialSkuRecords'
  | 'priceListRecords'
  | 'quoteRecords'
  | 'sampleRequestRecords'
  | 'customerRecords'
  | 'salesOrderRecords'
  | 'shipmentRecords'
  | 'orderDocumentRecords'
  | 'scheduledReportRecords'
  | 'subscriptionRecords'
  | 'invoiceRecords'
  | 'webhookDeliveryRecords'
  | 'auditCounter'

type ServiceState = Record<SnapshotKey, unknown> & {
  sessions: AuthSession[]
  userSettingsRecords: UserSettingsRecord[]
  auditEvents: AuditEvent[]
  organizationRecords: OrganizationRecord[]
  brandRecords: BrandRecord[]
  membershipRecords: MembershipRecord[]
  rolePolicyRecords: RolePolicy[]
  materialRecords: Material[]
  moleculeRecords: MoleculeComponent[]
  locationRecords: StorageLocation[]
  stockTakeRecords: StockTakeRecord[]
  settingsRecord: TenantSettingsRecord
  flagRecords: FeatureFlagRecord[]
  sequences: NumberingSequenceRecord[]
  customFieldRecords: CustomFieldDefinition[]
  brandingRecord: BrandingConfig
  documentRecords: DocumentRecord[]
  productionBatchRecords: ProductionBatchRecord[]
  supplierRecords: SupplierRecord[]
  purchaseOrderRecords: PurchaseOrderRecord[]
  priceHistoryRecords: PriceHistoryRecord[]
  commercialSkuRecords: CommercialSkuRecord[]
  priceListRecords: PriceListRecord[]
  quoteRecords: QuoteRecord[]
  sampleRequestRecords: SampleRequestRecord[]
  customerRecords: CustomerRecord[]
  salesOrderRecords: SalesOrderRecord[]
  shipmentRecords: ShipmentRecord[]
  orderDocumentRecords: OrderDocumentRecord[]
  scheduledReportRecords: ScheduledReportRecord[]
  subscriptionRecords: BillingSubscriptionRecord[]
  invoiceRecords: BillingInvoiceRecord[]
  webhookDeliveryRecords: WebhookDeliveryRecord[]
  lots: InventoryLot[]
  movements: InventoryMovement[]
  usageHistory: LabUsageRecord[]
  auditCounter: number
}

const API_PREFIX = '/api/v1'
const LOCAL_CORS_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173']
const NORMALIZED_STATE_KEYS = new Set<SnapshotKey>([
  'sessions',
  'userSettingsRecords',
  'auditEvents',
  'auditCounter',
  'organizationRecords',
  'brandRecords',
  'membershipRecords',
  'rolePolicyRecords',
  'materialRecords',
  'moleculeRecords',
  'locationRecords',
  'stockTakeRecords',
  'settingsRecord',
  'flagRecords',
  'sequences',
  'customFieldRecords',
  'brandingRecord',
  'documentRecords',
  'productionBatchRecords',
  'supplierRecords',
  'purchaseOrderRecords',
  'priceHistoryRecords',
  'commercialSkuRecords',
  'priceListRecords',
  'quoteRecords',
  'sampleRequestRecords',
  'customerRecords',
  'salesOrderRecords',
  'shipmentRecords',
  'orderDocumentRecords',
  'scheduledReportRecords',
  'subscriptionRecords',
  'invoiceRecords',
  'webhookDeliveryRecords',
  'lots',
  'movements',
  'usageHistory',
])
const SNAPSHOT_KEYS: SnapshotKey[] = [
  'materialRecords',
  'moleculeRecords',
  'lots',
  'movements',
  'locationRecords',
  'stockTakeRecords',
  'formulaRecords',
  'formulaVersionRecords',
  'usageHistory',
  'documentRecords',
  'auditEvents',
  'organizationRecords',
  'brandRecords',
  'membershipRecords',
  'sessions',
  'userSettingsRecords',
  'rolePolicyRecords',
  'settingsRecord',
  'flagRecords',
  'sequences',
  'customFieldRecords',
  'brandingRecord',
  'productionBatchRecords',
  'supplierRecords',
  'purchaseOrderRecords',
  'priceHistoryRecords',
  'commercialSkuRecords',
  'priceListRecords',
  'quoteRecords',
  'sampleRequestRecords',
  'customerRecords',
  'salesOrderRecords',
  'shipmentRecords',
  'orderDocumentRecords',
  'scheduledReportRecords',
  'subscriptionRecords',
  'invoiceRecords',
  'webhookDeliveryRecords',
  'auditCounter',
]
const SNAPSHOT_PERSIST_KEYS = SNAPSHOT_KEYS.filter((key) => !NORMALIZED_STATE_KEYS.has(key))
const NORMALIZED_TABLES = [
  'auth_sessions',
  'user_settings',
  'audit_events',
  'security_rate_limits',
  'tenant_organizations',
  'tenant_brands',
  'tenant_memberships',
  'role_policies',
  'material_records',
  'molecule_components',
  'storage_locations',
  'stock_take_records',
  'tenant_settings',
  'feature_flags',
  'numbering_sequences',
  'custom_fields',
  'tenant_branding',
  'document_records',
  'production_batches',
  'suppliers',
  'purchase_orders',
  'price_history',
  'commercial_skus',
  'price_lists',
  'quotes',
  'sample_requests',
  'customers',
  'sales_orders',
  'order_shipments',
  'order_documents',
  'scheduled_reports',
  'billing_subscriptions',
  'billing_invoices',
  'webhook_deliveries',
  'inventory_lots',
  'inventory_movements',
  'lab_usage_records',
]

const routes: Route[] = [
  { method: 'GET', pattern: '/health', public: true, handler: () => ({ ok: true, service: 'olfactoryops-worker-api', version: '0.1.0-cloudflare-d1', timestamp: new Date().toISOString() }) },
  { method: 'GET', pattern: '/version', public: true, handler: () => ({ data: { name: 'OlfactoryOps Cloudflare Worker API', stack: ['Cloudflare Workers', 'D1', 'TypeScript'], api: API_PREFIX } }) },
  { method: 'GET', pattern: '/persistence/status', public: true, handler: () => ({ data: { adapter: 'cloudflare-d1-hybrid', snapshotKeys: SNAPSHOT_PERSIST_KEYS.length, snapshotTable: 'northstar_snapshots', normalizedTables: NORMALIZED_TABLES } }) },
  { method: 'GET', pattern: '/phases', handler: ({ service }) => service.phases() },
  { method: 'GET', pattern: '/domains', handler: ({ service }) => service.domains() },
  { method: 'GET', pattern: '/materials', handler: ({ service }) => service.materials() },
  { method: 'GET', pattern: '/materials/dedupe', handler: ({ service, query }) => service.materialDedupe(query.get('cas') ?? '') },
  { method: 'POST', pattern: '/materials', mutates: true, limitKey: 'materials', handler: ({ service, body }) => service.createMaterial(body) },
  { method: 'GET', pattern: '/materials/:id', handler: ({ service, params }) => service.material(params.id) },
  { method: 'PATCH', pattern: '/materials/:id', mutates: true, handler: ({ service, params, body }) => service.updateMaterial(params.id, body) },
  { method: 'POST', pattern: '/materials/:id/ingest', mutates: true, handler: ({ service, params, body }) => service.ingestMaterialDocument(params.id, body) },
  { method: 'POST', pattern: '/materials/:id/pubchem-fill', mutates: true, handler: ({ service, params }) => service.pubchemFill(params.id) },
  { method: 'GET', pattern: '/materials/:id/molecules', handler: ({ service, params }) => service.materialMolecules(params.id) },
  { method: 'GET', pattern: '/materials/:id/provenance', handler: ({ service, params }) => service.materialProvenance(params.id) },
  { method: 'GET', pattern: '/materials/:id/price-history', handler: ({ service, params }) => service.materialPriceHistory(params.id) },
  { method: 'GET', pattern: '/formulas', handler: ({ service }) => service.formulas() },
  { method: 'POST', pattern: '/formulas', mutates: true, limitKey: 'formulas', handler: ({ service, body }) => service.createFormulaDraft(body) },
  { method: 'POST', pattern: '/formulas/:id/lines', mutates: true, handler: ({ service, params, body }) => service.addFormulaLine(params.id, body) },
  { method: 'PATCH', pattern: '/formulas/:id/lines/:lineId', mutates: true, handler: ({ service, params, body }) => service.updateFormulaLine(params.id, params.lineId, body) },
  { method: 'DELETE', pattern: '/formulas/:id/lines/:lineId', mutates: true, handler: ({ service, params }) => service.deleteFormulaLine(params.id, params.lineId) },
  { method: 'POST', pattern: '/formulas/:id/lines/:lineId/move', mutates: true, handler: ({ service, params, body }) => service.moveFormulaLine(params.id, params.lineId, body) },
  { method: 'GET', pattern: '/formulas/:id/resolve', handler: ({ service, params }) => service.resolveFormula(params.id) },
  { method: 'GET', pattern: '/formulas/:id/cost', handler: ({ service, params }) => service.formulaCost(params.id) },
  { method: 'GET', pattern: '/formulas/:id/versions', handler: ({ service, params }) => service.formulaVersions(params.id) },
  { method: 'POST', pattern: '/formulas/:id/versions', mutates: true, handler: ({ service, params, body }) => service.createFormulaVersion(params.id, body) },
  { method: 'POST', pattern: '/formulas/:id/approve', mutates: true, handler: ({ service, params, body }) => service.approveFormula(params.id, body) },
  { method: 'POST', pattern: '/formulas/:id/export', mutates: true, handler: ({ service, params, body }) => service.exportFormula(params.id, body) },
  { method: 'GET', pattern: '/lots', handler: ({ service }) => service.lotsList() },
  { method: 'GET', pattern: '/inventory/console', handler: ({ service }) => service.inventoryConsole() },
  { method: 'GET', pattern: '/inventory/summary', handler: ({ service }) => service.inventorySummary() },
  { method: 'GET', pattern: '/inventory/movements', handler: ({ service }) => service.inventoryMovements() },
  { method: 'GET', pattern: '/inventory/reorder-suggestions', handler: ({ service }) => service.inventoryReorderSuggestions() },
  { method: 'POST', pattern: '/inventory/stock-takes', mutates: true, handler: ({ service, body }) => service.performStockTake(body) },
  { method: 'GET', pattern: '/storage-locations', handler: ({ service }) => service.storageLocationsList() },
  { method: 'POST', pattern: '/storage-locations', mutates: true, handler: ({ service, body }) => service.createStorageLocation(body) },
  { method: 'PATCH', pattern: '/lots/:id/quality', mutates: true, handler: ({ service, params, body }) => service.changeLotQuality(params.id, body) },
  { method: 'POST', pattern: '/lots/:id/label', handler: ({ service, params }) => service.lotLabel(params.id) },
  { method: 'GET', pattern: '/lots/:id/genealogy', handler: ({ service, params }) => service.lotGenealogy(params.id) },
  { method: 'POST', pattern: '/inventory/receipts', mutates: true, limitKey: 'lots', handler: ({ service, body }) => service.receiveInventoryReceipt(body) },
  { method: 'POST', pattern: '/inventory/adjustments', mutates: true, handler: ({ service, body }) => service.adjustInventory(body) },
  { method: 'POST', pattern: '/inventory/transfers', mutates: true, handler: ({ service, body }) => service.transferInventory(body) },
  { method: 'POST', pattern: '/auth/login', public: true, sessionCookie: 'set', mutates: true, writeGate: false, rateLimit: { key: 'auth-login', limit: 8, windowSeconds: 10 * 60 }, handler: ({ service, body }) => service.login(typeof body.email === 'string' ? body.email : undefined) },
  { method: 'POST', pattern: '/auth/signup', public: true, sessionCookie: 'set', mutates: true, writeGate: false, rateLimit: { key: 'auth-signup', limit: 4, windowSeconds: 60 * 60 }, handler: ({ service, body }) => service.signup(body) },
  { method: 'POST', pattern: '/auth/logout', sessionCookie: 'clear', mutates: true, writeGate: false, handler: ({ service }) => service.logout() },
  { method: 'GET', pattern: '/me', handler: ({ service }) => service.me() },
  { method: 'GET', pattern: '/user/settings', handler: ({ service }) => service.userSettings() },
  { method: 'PATCH', pattern: '/user/settings', mutates: true, writeGate: false, handler: ({ service, body }) => service.updateUserSettings(body) },
  { method: 'GET', pattern: '/audit-logs', handler: ({ service }) => service.auditLogs() },
  { method: 'GET', pattern: '/security/policy', handler: ({ service }) => service.securityPolicy() },
  { method: 'GET', pattern: '/security/tenant-console', handler: ({ service }) => service.tenantConsole() },
  { method: 'POST', pattern: '/security/members/invite', mutates: true, limitKey: 'seats', handler: ({ service, body }) => service.inviteMember(body) },
  { method: 'PATCH', pattern: '/security/members/:id/status', mutates: true, handler: ({ service, params, body }) => service.setMembershipStatus(params.id, body.status === 'ACTIVE' ? 'ACTIVE' : 'DEACTIVATED') },
  { method: 'POST', pattern: '/security/sessions/:id/revoke', mutates: true, handler: ({ service, params }) => service.revokeSession(params.id) },
  { method: 'POST', pattern: '/security/sessions/revoke-all', mutates: true, handler: ({ service, body }) => service.revokeAllSessions(body) },
  { method: 'POST', pattern: '/security/sessions/:id/touch', mutates: true, handler: ({ service, params }) => service.touchSession(params.id) },
  { method: 'GET', pattern: '/security/permissions', handler: ({ service }) => service.permissionMatrix() },
  { method: 'PATCH', pattern: '/security/roles/:role/permissions', mutates: true, handler: ({ service, params, body }) => service.setRolePermissions(params.role, Array.isArray(body.permissions) ? body.permissions.filter((permission): permission is string => typeof permission === 'string') : []) },
  { method: 'GET', pattern: '/security/tenant-probe', handler: ({ service, query }) => service.tenantProbe(query.get('organizationId') ?? 'org-nxl') },
  { method: 'GET', pattern: '/security/permission-probe', handler: ({ service, query }) => service.permissionProbe(query.get('permission') ?? 'inventory.adjust', query.get('role') ?? 'Viewer') },
  { method: 'GET', pattern: '/settings', handler: ({ service }) => service.settings() },
  { method: 'PATCH', pattern: '/settings', mutates: true, handler: ({ service, body }) => service.updateSettings(body) },
  { method: 'GET', pattern: '/customization-console', handler: ({ service }) => service.customizationConsole() },
  { method: 'GET', pattern: '/feature-flags', handler: ({ service }) => service.featureFlags() },
  { method: 'PATCH', pattern: '/feature-flags/:key', mutates: true, handler: ({ service, params, body }) => service.updateFeatureFlag(params.key, body.enabled === true) },
  { method: 'GET', pattern: '/numbering-sequences', handler: ({ service }) => service.numberingSequences() },
  { method: 'PATCH', pattern: '/numbering-sequences/:key', mutates: true, handler: ({ service, params, body }) => service.updateNumberingSequence(params.key, body) },
  { method: 'GET', pattern: '/numbering-sequences/:key/preview', handler: ({ service, params }) => service.previewNumber(params.key) },
  { method: 'POST', pattern: '/numbering-sequences/:key/next', mutates: true, handler: ({ service, params }) => service.nextNumber(params.key) },
  { method: 'POST', pattern: '/custom-fields', mutates: true, handler: ({ service, body }) => service.createCustomField(body) },
  { method: 'PATCH', pattern: '/branding', mutates: true, handler: ({ service, body }) => service.updateBranding(body) },
  { method: 'GET', pattern: '/documents', handler: ({ service }) => service.documents() },
  { method: 'GET', pattern: '/documents/compliance-dashboard', handler: ({ service }) => service.documentComplianceDashboard() },
  { method: 'POST', pattern: '/documents/generate', mutates: true, limitKey: 'documents', handler: ({ service, body }) => service.generateDocument(body) },
  { method: 'POST', pattern: '/documents/:id/approve', mutates: true, handler: ({ service, params, body }) => service.approveDocument(params.id, body) },
  { method: 'POST', pattern: '/documents/:id/share', mutates: true, handler: ({ service, params, body }) => service.shareDocument(params.id, body) },
  { method: 'GET', pattern: '/documents/download-audit', handler: ({ service }) => service.documentDownloadAudit() },
  { method: 'POST', pattern: '/documents/:id/signed-url', mutates: true, handler: ({ service, params }) => service.requestDocumentSignedUrl(params.id) },
  { method: 'GET', pattern: '/lab-usage', handler: ({ service }) => service.labUsageHistory() },
  { method: 'GET', pattern: '/lab-usage/plan', handler: ({ service, query }) => service.labUsagePlan(query.get('formulaId') ?? 'frm-0421', Number(query.get('grams') ?? '12.5')) },
  { method: 'GET', pattern: '/lab-usage/:id', handler: ({ service, params }) => service.labUsageDetail(params.id) },
  { method: 'POST', pattern: '/lab-usage/weighing-session', mutates: true, handler: ({ service, body }) => service.recordLabWeighingSession(readString(body.formulaId, 'frm-0421'), readNumber(body.grams, 12.5), body) },
  { method: 'POST', pattern: '/lab-usage/commit', mutates: true, handler: ({ service, body }) => service.commitLabUsage(readString(body.formulaId, 'frm-0421'), readNumber(body.grams, 12.5), body) },
  { method: 'POST', pattern: '/lab-usage/reverse-latest', mutates: true, handler: ({ service, body }) => service.reverseLatestLabUsage(body) },
  { method: 'POST', pattern: '/lab-usage/:id/reverse', mutates: true, handler: ({ service, params, body }) => service.reverseLabUsage(params.id, body) },
  { method: 'GET', pattern: '/production/batches', handler: ({ service }) => service.productionBatches() },
  { method: 'POST', pattern: '/production/batches', mutates: true, handler: ({ service, body }) => service.createProductionBatch(typeof body.formulaId === 'string' ? body.formulaId : undefined, typeof body.targetGrams === 'number' ? body.targetGrams : undefined) },
  { method: 'POST', pattern: '/production/batches/:id/consume', mutates: true, handler: ({ service, params }) => service.consumeProductionBatch(params.id) },
  { method: 'POST', pattern: '/production/batches/:id/qc', mutates: true, handler: ({ service, params, body }) => service.qcProductionBatch(params.id, body.result === 'FAILED' ? 'FAILED' : 'PASSED') },
  { method: 'PATCH', pattern: '/production/batches/:id/status', mutates: true, handler: ({ service, params, body }) => service.updateProductionBatchStatus(params.id, readProductionStatus(body.status)) },
  { method: 'GET', pattern: '/suppliers', handler: ({ service }) => service.suppliers() },
  { method: 'POST', pattern: '/suppliers', mutates: true, handler: ({ service, body }) => service.createSupplier(body) },
  { method: 'GET', pattern: '/purchase-orders', handler: ({ service }) => service.purchaseOrders() },
  { method: 'POST', pattern: '/purchase-orders', mutates: true, handler: ({ service, body }) => service.createPurchaseOrder(body) },
  { method: 'PATCH', pattern: '/purchase-orders/:id/status', mutates: true, handler: ({ service, params, body }) => service.updatePurchaseOrderStatus(params.id, readPurchaseOrderStatus(body.status)) },
  { method: 'POST', pattern: '/purchase-orders/:id/receive', mutates: true, handler: ({ service, params, body }) => service.receivePurchaseOrder(params.id, body) },
  { method: 'GET', pattern: '/catalog/skus', handler: ({ service }) => service.catalogSkus() },
  { method: 'POST', pattern: '/catalog/skus', mutates: true, handler: ({ service, body }) => service.createCatalogSku(body) },
  { method: 'GET', pattern: '/price-lists', handler: ({ service }) => service.priceLists() },
  { method: 'POST', pattern: '/price-lists', mutates: true, handler: ({ service, body }) => service.createPriceList(body) },
  { method: 'GET', pattern: '/quotes', handler: ({ service }) => service.quotes() },
  { method: 'POST', pattern: '/quotes', mutates: true, handler: ({ service, body }) => service.createQuote(body) },
  { method: 'GET', pattern: '/samples', handler: ({ service }) => service.samples() },
  { method: 'POST', pattern: '/samples', mutates: true, handler: ({ service, body }) => service.requestSample(body) },
  { method: 'GET', pattern: '/customers', handler: ({ service }) => service.customers() },
  { method: 'POST', pattern: '/customers', mutates: true, handler: ({ service, body }) => service.createCustomer(body) },
  { method: 'GET', pattern: '/orders', handler: ({ service }) => service.orders() },
  { method: 'POST', pattern: '/orders', mutates: true, handler: ({ service, body }) => service.createOrder(body) },
  { method: 'POST', pattern: '/orders/:id/reserve', mutates: true, handler: ({ service, params }) => service.reserveOrder(params.id) },
  { method: 'POST', pattern: '/orders/:id/cancel', mutates: true, handler: ({ service, params }) => service.cancelOrder(params.id) },
  { method: 'POST', pattern: '/orders/:id/pack', mutates: true, handler: ({ service, params, body }) => service.packOrder(params.id, body) },
  { method: 'POST', pattern: '/orders/:id/ship', mutates: true, handler: ({ service, params, body }) => service.shipOrder(params.id, body) },
  { method: 'POST', pattern: '/orders/:id/fulfill', mutates: true, handler: ({ service, params }) => service.fulfillOrder(params.id) },
  { method: 'GET', pattern: '/shipments', handler: ({ service }) => service.shipments() },
  { method: 'GET', pattern: '/order-documents', handler: ({ service }) => service.orderDocuments() },
  { method: 'GET', pattern: '/costing/overview', handler: ({ service }) => service.costingOverview() },
  { method: 'GET', pattern: '/costing/formulas/:id', handler: ({ service, params }) => service.costingFormula(params.id) },
  { method: 'GET', pattern: '/costing/batches/:id', handler: ({ service, params }) => service.costingBatch(params.id) },
  { method: 'GET', pattern: '/costing/skus/:id', handler: ({ service, params }) => service.costingSku(params.id) },
  { method: 'GET', pattern: '/costing/valuation', handler: ({ service }) => service.costingValuation() },
  { method: 'GET', pattern: '/analytics/dashboard', handler: ({ service }) => service.analyticsDashboard() },
  { method: 'GET', pattern: '/analytics/burn-rate', handler: ({ service }) => service.analyticsBurnRate() },
  { method: 'GET', pattern: '/analytics/low-stock-forecast', handler: ({ service }) => service.analyticsLowStockForecast() },
  { method: 'GET', pattern: '/analytics/expiry-risk', handler: ({ service }) => service.analyticsExpiryRisk() },
  { method: 'GET', pattern: '/analytics/cost-ranking', handler: ({ service }) => service.analyticsCostRanking() },
  { method: 'GET', pattern: '/analytics/inventory', handler: ({ service }) => service.analyticsInventory() },
  { method: 'GET', pattern: '/analytics/reports', handler: ({ service }) => service.analyticsReports() },
  { method: 'POST', pattern: '/analytics/reports/:id/run', mutates: true, handler: ({ service, params }) => service.runAnalyticsReport(params.id) },
  { method: 'GET', pattern: '/billing/plan', handler: ({ service }) => service.billingPlan() },
  { method: 'GET', pattern: '/billing/plans', handler: ({ service }) => service.billingPlans() },
  { method: 'GET', pattern: '/billing/console', handler: ({ service }) => service.billingConsole() },
  { method: 'GET', pattern: '/billing/subscription', handler: ({ service }) => service.billingSubscription() },
  { method: 'GET', pattern: '/billing/usage', handler: ({ service }) => service.billingUsage() },
  { method: 'GET', pattern: '/billing/invoices', handler: ({ service }) => service.billingInvoices() },
  { method: 'POST', pattern: '/billing/checkout', mutates: true, writeGate: false, handler: ({ service, body }) => service.startBillingCheckout(body) },
  { method: 'POST', pattern: '/billing/subscription/select-plan', mutates: true, writeGate: false, handler: ({ service, body }) => service.selectBillingPlan(body) },
  { method: 'POST', pattern: '/billing/portal', mutates: true, writeGate: false, handler: ({ service }) => service.openBillingPortal() },
  { method: 'POST', pattern: '/billing/subscription/freeze', mutates: true, writeGate: false, handler: ({ service, body }) => service.freezeSubscription(body) },
  { method: 'POST', pattern: '/billing/subscription/reactivate', mutates: true, writeGate: false, handler: ({ service }) => service.reactivateSubscription() },
  { method: 'GET', pattern: '/sso-config', handler: ({ service }) => service.ssoConfig() },
  { method: 'GET', pattern: '/api-keys', handler: ({ service }) => service.apiKeys() },
  { method: 'GET', pattern: '/webhooks', handler: ({ service }) => service.webhooks() },
  { method: 'POST', pattern: '/webhooks/deliveries/:id/retry', mutates: true, writeGate: false, handler: ({ service, params }) => service.retryWebhookDelivery(params.id) },
  { method: 'POST', pattern: '/audit/export', mutates: true, writeGate: false, handler: ({ service }) => service.auditExport() },
]

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const corsHeaders = buildCorsHeaders(origin, env.CORS_ORIGINS)
    let service: NorthStarService | undefined

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    try {
      const url = new URL(request.url)
      const path = normalizeApiPath(url.pathname)
      if (!path) {
        return json({ message: `Route ${url.pathname} was not found` }, 404, corsHeaders)
      }

      const match = matchRoute(request.method, path)
      if (!match) {
        return json({ message: `Route ${request.method} ${path} was not found` }, 404, corsHeaders)
      }

      await ensurePersistenceTables(env.DB)
      service = new NorthStarService()
      await hydrateSnapshots(env.DB, service)
      const body = await readJsonBody(request)
      if (match.route.rateLimit) {
        await assertRateLimit(env.DB, match.route.rateLimit, request, body)
      }
      let credential: AuthCredential = { source: 'none' }
      if (!match.route.public) {
        credential = readSessionCredential(request.headers)
        service.authenticateSession(credential.sessionId)
      }
      if (match.route.mutates && !match.route.public && credential.source === 'cookie') {
        service.assertValidCsrfToken(request.headers.get('X-CSRF-Token'))
      }
      if (match.route.mutates && match.route.writeGate !== false) {
        service.assertCommercialWriteAllowed(`${request.method} ${match.route.pattern}`)
      }
      if (match.route.limitKey) {
        service.assertPlanCapacity(match.route.limitKey)
      }
      const result = await match.route.handler({ service, params: match.params, query: url.searchParams, body })

      if (match.route.mutates || service.hasSecurityStateChanges()) {
        await persistSnapshots(env.DB, service)
      }

      return json(result, 200, buildResponseHeaders(corsHeaders, match.route, result))
    } catch (error) {
      if (service) {
        await persistSecurityState(env.DB, service).catch((persistError) => console.error(persistError))
      }
      return errorJson(error, corsHeaders)
    }
  },
}

function normalizeApiPath(pathname: string) {
  if (pathname === API_PREFIX) {
    return '/'
  }
  if (!pathname.startsWith(`${API_PREFIX}/`)) {
    return ''
  }
  return pathname.slice(API_PREFIX.length)
}

function matchRoute(method: string, path: string) {
  for (const route of routes) {
    if (route.method !== method.toUpperCase()) {
      continue
    }
    const params = matchPattern(route.pattern, path)
    if (params) {
      return { route, params }
    }
  }
  return null
}

function matchPattern(pattern: string, path: string) {
  const patternSegments = pattern.split('/').filter(Boolean)
  const pathSegments = path.split('/').filter(Boolean)
  if (patternSegments.length !== pathSegments.length) {
    return null
  }

  const params: Record<string, string> = {}
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index]
    const pathSegment = pathSegments[index]
    if (!patternSegment || !pathSegment) {
      return null
    }
    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = decodeURIComponent(pathSegment)
      continue
    }
    if (patternSegment !== pathSegment) {
      return null
    }
  }
  return params
}

async function readJsonBody(request: Request) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return {}
  }
  const text = await request.text()
  if (!text.trim()) {
    return {}
  }
  const parsed = JSON.parse(text)
  return isRecord(parsed) ? parsed : {}
}

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function readNumber(value: unknown, fallback: number) {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

async function assertRateLimit(
  db: D1Database,
  policy: RateLimitPolicy,
  request: Request,
  body: Record<string, unknown>,
) {
  const now = new Date()
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : 'unknown'
  const clientKey = `${policy.key}:${readClientAddress(request.headers)}:${email}`
  const row = await db
    .prepare('SELECT count, window_start, expires_at FROM security_rate_limits WHERE key = ?1')
    .bind(clientKey)
    .first<{ count: number; window_start: string; expires_at: string }>()

  const expiresAt = row ? new Date(row.expires_at) : null
  if (!row || !expiresAt || expiresAt.getTime() <= now.getTime()) {
    const nextExpiresAt = new Date(now.getTime() + policy.windowSeconds * 1000).toISOString()
    await db
      .prepare(
        `INSERT INTO security_rate_limits (key, count, window_start, expires_at, updated_at)
         VALUES (?1, 1, ?2, ?3, ?2)
         ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
      )
      .bind(clientKey, now.toISOString(), nextExpiresAt)
      .run()
    await db.prepare('DELETE FROM security_rate_limits WHERE expires_at <= ?1').bind(now.toISOString()).run()
    return
  }

  if (row.count >= policy.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000))
    throw new TooManyRequestsException({
      message: 'Authentication rate limit exceeded',
      limitKey: policy.key,
      limit: policy.limit,
      windowSeconds: policy.windowSeconds,
      retryAfterSeconds,
    })
  }

  await db
    .prepare('UPDATE security_rate_limits SET count = count + 1, updated_at = ?2 WHERE key = ?1')
    .bind(clientKey, now.toISOString())
    .run()
}

function readClientAddress(headers: Headers) {
  const cfIp = headers.get('CF-Connecting-IP')?.trim()
  if (cfIp) {
    return cfIp
  }
  return headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown'
}

function readProductionStatus(value: unknown) {
  if (
    value === 'PLANNED' ||
    value === 'WEIGHING' ||
    value === 'MACERATION' ||
    value === 'FILTRATION' ||
    value === 'QC' ||
    value === 'BOTTLING' ||
    value === 'RELEASED' ||
    value === 'HOLD'
  ) {
    return value
  }
  return 'MACERATION'
}

function readPurchaseOrderStatus(value: unknown) {
  if (value === 'DRAFT' || value === 'SENT' || value === 'PARTIAL' || value === 'RECEIVED') {
    return value
  }
  return 'SENT'
}

function readBearerSessionId(authorization: string | null) {
  const [scheme, token] = authorization?.trim().split(/\s+/, 2) ?? []
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined
  }
  return token
}

function readSessionCredential(headers: Headers): AuthCredential {
  const cookieSessionId = readCookie(headers.get('Cookie'), 'oo_session')
  if (cookieSessionId) {
    return { sessionId: cookieSessionId, source: 'cookie' }
  }
  const bearerSessionId = readBearerSessionId(headers.get('Authorization'))
  if (bearerSessionId) {
    return { sessionId: bearerSessionId, source: 'bearer' }
  }
  return { source: 'none' }
}

function readCookie(cookieHeader: string | null, name: string) {
  const cookies = cookieHeader?.split(';') ?? []
  for (const cookie of cookies) {
    const [rawKey, ...rawValue] = cookie.trim().split('=')
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join('='))
    }
  }
  return undefined
}

async function ensurePersistenceTables(db: D1Database) {
  await ensureSnapshotTable(db)
  await ensureRateLimitTable(db)
  await ensureAuthSessionTable(db)
  await ensureUserSettingsTable(db)
  await ensureAuditEventTable(db)
  await ensureTenantOrganizationTable(db)
  await ensureTenantBrandTable(db)
  await ensureTenantMembershipTable(db)
  await ensureRolePolicyTable(db)
  await ensureMaterialRecordTable(db)
  await ensureMoleculeComponentTable(db)
  await ensureStorageLocationTable(db)
  await ensureStockTakeRecordTable(db)
  await ensureTenantSettingsTable(db)
  await ensureFeatureFlagTable(db)
  await ensureNumberingSequenceTable(db)
  await ensureCustomFieldTable(db)
  await ensureTenantBrandingTable(db)
  await ensureDocumentRecordTable(db)
  await ensureProductionBatchTable(db)
  await ensureSupplierTable(db)
  await ensurePurchaseOrderTable(db)
  await ensurePriceHistoryTable(db)
  await ensureCommercialSkuTable(db)
  await ensurePriceListTable(db)
  await ensureQuoteTable(db)
  await ensureSampleRequestTable(db)
  await ensureCustomerTable(db)
  await ensureSalesOrderTable(db)
  await ensureOrderShipmentTable(db)
  await ensureOrderDocumentTable(db)
  await ensureScheduledReportTable(db)
  await ensureBillingSubscriptionTable(db)
  await ensureBillingInvoiceTable(db)
  await ensureWebhookDeliveryTable(db)
  await ensureInventoryLotTable(db)
  await ensureInventoryMovementTable(db)
  await ensureLabUsageRecordTable(db)
}

async function ensureSnapshotTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS northstar_snapshots (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
}

async function ensureRateLimitTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS security_rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        window_start TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
}

async function ensureAuthSessionTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        brand_id TEXT NOT NULL,
        role TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        idle_expires_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL,
        mfa_verified INTEGER NOT NULL DEFAULT 0,
        ip_address TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        device_id TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        csrf_token TEXT,
        revoked_at TEXT,
        revoked_reason TEXT,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_auth_sessions_org_status ON auth_sessions(organization_id, status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_auth_sessions_email_status ON auth_sessions(email, status)').run()
}

async function ensureUserSettingsTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        preferred_landing TEXT NOT NULL,
        ui_density TEXT NOT NULL,
        reduce_motion INTEGER NOT NULL DEFAULT 0,
        email_digest TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, organization_id)
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_user_settings_org_email ON user_settings(organization_id, email)').run()
}

async function ensureAuditEventTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        request_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_events_at ON audit_events(at)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action)').run()
}

async function ensureTenantOrganizationTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS tenant_organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        plan TEXT NOT NULL,
        status TEXT NOT NULL,
        primary_contact TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_tenant_organizations_status ON tenant_organizations(status)').run()
}

async function ensureTenantBrandTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS tenant_brands (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        default_currency TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_tenant_brands_org_status ON tenant_brands(organization_id, status)').run()
}

async function ensureTenantMembershipTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS tenant_memberships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        brand_ids_json TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        mfa_enabled INTEGER NOT NULL DEFAULT 0,
        last_active_at TEXT NOT NULL,
        invited_at TEXT,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_tenant_memberships_org_status ON tenant_memberships(organization_id, status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_tenant_memberships_email ON tenant_memberships(email)').run()
}

async function ensureRolePolicyTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS role_policies (
        role TEXT NOT NULL,
        scope TEXT NOT NULL,
        mfa_required INTEGER NOT NULL DEFAULT 0,
        permissions_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (role, scope)
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_role_policies_scope ON role_policies(scope)').run()
}

async function ensureMaterialRecordTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS material_records (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cas TEXT NOT NULL,
        family TEXT NOT NULL,
        tier TEXT NOT NULL,
        record_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_material_records_cas ON material_records(cas)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_material_records_family ON material_records(family)').run()
}

async function ensureMoleculeComponentTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS molecule_components (
        id TEXT PRIMARY KEY,
        material_id TEXT NOT NULL,
        name TEXT NOT NULL,
        cas TEXT NOT NULL,
        status TEXT NOT NULL,
        record_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_molecule_components_material_status ON molecule_components(material_id, status)').run()
}

async function ensureStorageLocationTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS storage_locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        zone TEXT NOT NULL,
        status TEXT NOT NULL,
        record_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_storage_locations_zone_status ON storage_locations(zone, status)').run()
}

async function ensureStockTakeRecordTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS stock_take_records (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        lot_id TEXT NOT NULL,
        status TEXT NOT NULL,
        record_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_stock_take_records_lot_at ON stock_take_records(lot_id, at)').run()
}

async function ensureTenantSettingsTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS tenant_settings (
        organization_id TEXT PRIMARY KEY,
        locale TEXT NOT NULL,
        timezone TEXT NOT NULL,
        currency TEXT NOT NULL,
        default_unit TEXT NOT NULL,
        default_dilution_percent REAL NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
}

async function ensureFeatureFlagTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS feature_flags (
        flag_key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        phase INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_feature_flags_phase ON feature_flags(phase)').run()
}

async function ensureNumberingSequenceTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS numbering_sequences (
        sequence_key TEXT PRIMARY KEY,
        pattern TEXT NOT NULL,
        next_value INTEGER NOT NULL,
        scope TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_numbering_sequences_scope ON numbering_sequences(scope)').run()
}

async function ensureCustomFieldTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS custom_fields (
        id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        field_key TEXT NOT NULL,
        label TEXT NOT NULL,
        field_type TEXT NOT NULL,
        required INTEGER NOT NULL DEFAULT 0,
        options_json TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_custom_fields_entity_status ON custom_fields(entity, status)').run()
}

async function ensureTenantBrandingTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS tenant_branding (
        organization_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        accent_color TEXT NOT NULL,
        document_footer TEXT NOT NULL,
        label_template TEXT NOT NULL,
        logo_mode TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
}

async function ensureDocumentRecordTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS document_records (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        linked_to TEXT NOT NULL,
        version TEXT NOT NULL,
        sensitivity TEXT NOT NULL,
        status TEXT NOT NULL,
        issue_date TEXT,
        expires_at TEXT,
        last_accessed TEXT NOT NULL,
        downloads INTEGER NOT NULL,
        storage_key TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_kb REAL NOT NULL,
        checksum TEXT NOT NULL,
        owner TEXT NOT NULL,
        generated_from TEXT,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_document_records_linked_type ON document_records(linked_to, type)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_document_records_status ON document_records(status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_document_records_expiry ON document_records(expires_at)').run()
}

async function ensureProductionBatchTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS production_batches (
        id TEXT PRIMARY KEY,
        formula_id TEXT NOT NULL,
        formula_code TEXT NOT NULL,
        status TEXT NOT NULL,
        target_grams REAL NOT NULL,
        consumed_grams REAL NOT NULL,
        qc_status TEXT NOT NULL,
        owner TEXT NOT NULL,
        work_order_json TEXT NOT NULL,
        qc_checks_json TEXT NOT NULL,
        yield_grams REAL,
        yield_variance_percent REAL,
        output_lot_json TEXT,
        genealogy_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_production_batches_formula_status ON production_batches(formula_id, status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_production_batches_status ON production_batches(status)').run()
}

async function ensureSupplierTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        country TEXT NOT NULL,
        lead_time_days INTEGER NOT NULL,
        contact_email TEXT NOT NULL,
        payment_terms TEXT NOT NULL,
        preferred_material_ids_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_suppliers_status_country ON suppliers(status, country)').run()
}

async function ensurePurchaseOrderTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        supplier_id TEXT NOT NULL,
        material_id TEXT NOT NULL,
        quantity_grams REAL NOT NULL,
        received_grams REAL NOT NULL,
        status TEXT NOT NULL,
        expected_date TEXT NOT NULL,
        unit_cost REAL NOT NULL,
        currency TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_status ON purchase_orders(supplier_id, status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_purchase_orders_material_status ON purchase_orders(material_id, status)').run()
}

async function ensurePriceHistoryTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS price_history (
        id TEXT PRIMARY KEY,
        material_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        purchase_order_id TEXT NOT NULL,
        unit_cost REAL NOT NULL,
        currency TEXT NOT NULL,
        quantity_grams REAL NOT NULL,
        captured_at TEXT NOT NULL,
        source TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_price_history_material_captured ON price_history(material_id, captured_at)').run()
}

async function ensureCommercialSkuTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS commercial_skus (
        id TEXT PRIMARY KEY,
        material_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        pack_size_grams REAL NOT NULL,
        price REAL NOT NULL,
        currency TEXT NOT NULL,
        tier TEXT NOT NULL,
        status TEXT NOT NULL,
        moq_packs INTEGER NOT NULL,
        label_template TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_commercial_skus_material_status ON commercial_skus(material_id, status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_commercial_skus_tier_status ON commercial_skus(tier, status)').run()
}

async function ensurePriceListTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS price_lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        customer_group TEXT NOT NULL,
        currency TEXT NOT NULL,
        multiplier REAL NOT NULL,
        sample_eligible INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_price_lists_group_status ON price_lists(customer_group, status)').run()
}

async function ensureQuoteTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS quotes (
        id TEXT PRIMARY KEY,
        sku_id TEXT NOT NULL,
        customer TEXT NOT NULL,
        customer_group TEXT NOT NULL,
        quantity_packs INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total REAL NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_quotes_sku_status ON quotes(sku_id, status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at)').run()
}

async function ensureSampleRequestTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sample_requests (
        id TEXT PRIMARY KEY,
        sku_id TEXT NOT NULL,
        customer TEXT NOT NULL,
        packs INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_sample_requests_sku_status ON sample_requests(sku_id, status)').run()
}

async function ensureCustomerTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        customer_group TEXT NOT NULL,
        credit_limit REAL NOT NULL,
        payment_terms TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        billing_address_json TEXT NOT NULL,
        shipping_address_json TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_customers_group_status ON customers(customer_group, status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_customers_contact_email ON customers(contact_email)').run()
}

async function ensureSalesOrderTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sales_orders (
        id TEXT PRIMARY KEY,
        sku_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        customer TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        discount_percent REAL NOT NULL,
        tax_percent REAL NOT NULL,
        shipping_cost REAL NOT NULL,
        total REAL NOT NULL,
        currency TEXT NOT NULL,
        reserved_grams REAL NOT NULL,
        fulfilled_grams REAL NOT NULL,
        status TEXT NOT NULL,
        carrier TEXT,
        tracking_number TEXT,
        reservation_allocations_json TEXT,
        shipment_id TEXT,
        document_ids_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_status ON sales_orders(customer_id, status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_sales_orders_created_at ON sales_orders(created_at)').run()
}

async function ensureOrderShipmentTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS order_shipments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        carrier TEXT NOT NULL,
        tracking_number TEXT NOT NULL,
        status TEXT NOT NULL,
        shipped_at TEXT,
        delivered_at TEXT,
        weight_grams REAL NOT NULL,
        allocations_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_order_shipments_order_status ON order_shipments(order_id, status)').run()
}

async function ensureOrderDocumentTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS order_documents (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_order_documents_order_type ON order_documents(order_id, type)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_order_documents_status ON order_documents(status)').run()
}

async function ensureScheduledReportTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS scheduled_reports (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cadence TEXT NOT NULL,
        audience TEXT NOT NULL,
        format TEXT NOT NULL,
        status TEXT NOT NULL,
        last_run_at TEXT,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_scheduled_reports_status_cadence ON scheduled_reports(status, cadence)').run()
}

async function ensureBillingSubscriptionTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS billing_subscriptions (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        collection_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        current_period_start TEXT NOT NULL,
        current_period_end TEXT NOT NULL,
        trial_ends_at TEXT,
        grace_ends_at TEXT,
        freeze_reason TEXT,
        provider_customer_id TEXT,
        provider_subscription_id TEXT,
        can_write INTEGER NOT NULL DEFAULT 0,
        can_export INTEGER NOT NULL DEFAULT 0,
        next_invoice_at TEXT NOT NULL,
        subscription_updated_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_org_status ON billing_subscriptions(organization_id, status)').run()
}

async function ensureBillingInvoiceTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS billing_invoices (
        id TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        number TEXT NOT NULL,
        status TEXT NOT NULL,
        amount_due REAL NOT NULL,
        currency TEXT NOT NULL,
        due_at TEXT NOT NULL,
        paid_at TEXT,
        hosted_invoice_url TEXT NOT NULL,
        document_id TEXT,
        provider_invoice_id TEXT,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_billing_invoices_subscription_status ON billing_invoices(subscription_id, status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_billing_invoices_due_at ON billing_invoices(due_at)').run()
}

async function ensureWebhookDeliveryTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id TEXT PRIMARY KEY,
        webhook_id TEXT NOT NULL,
        event TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        last_attempt_at TEXT NOT NULL,
        next_retry_at TEXT,
        response_code INTEGER,
        idempotency_key TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status_retry ON webhook_deliveries(status, next_retry_at)').run()
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_deliveries_idempotency ON webhook_deliveries(idempotency_key)').run()
}

async function ensureInventoryLotTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS inventory_lots (
        id TEXT PRIMARY KEY,
        material_id TEXT NOT NULL,
        lot_number TEXT NOT NULL,
        quantity_grams REAL NOT NULL,
        reserved_grams REAL NOT NULL,
        received_date TEXT NOT NULL,
        expiry_date TEXT NOT NULL,
        quality_status TEXT NOT NULL,
        location TEXT NOT NULL,
        unit_cost REAL NOT NULL,
        supplier_lot_ref TEXT,
        currency TEXT,
        retest_date TEXT,
        opened_date TEXT,
        shelf_life_after_opening_days INTEGER,
        container TEXT,
        packaging TEXT,
        coa_document_id TEXT,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_inventory_lots_material_quality ON inventory_lots(material_id, quality_status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiry ON inventory_lots(expiry_date)').run()
}

async function ensureInventoryMovementTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        direction TEXT NOT NULL,
        material_id TEXT NOT NULL,
        lot_id TEXT NOT NULL,
        quantity_grams REAL NOT NULL,
        balance_after REAL NOT NULL,
        ref TEXT NOT NULL,
        actor TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_inventory_movements_lot_at ON inventory_movements(lot_id, at)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref ON inventory_movements(ref)').run()
}

async function ensureLabUsageRecordTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS lab_usage_records (
        id TEXT PRIMARY KEY,
        formula_id TEXT NOT NULL,
        formula_code TEXT NOT NULL,
        grams REAL NOT NULL,
        batch_grams REAL NOT NULL,
        status TEXT NOT NULL,
        purpose TEXT NOT NULL,
        project_code TEXT,
        sample_code TEXT,
        qc_link TEXT,
        allocations_json TEXT NOT NULL,
        weighing_session_json TEXT,
        created_at TEXT NOT NULL,
        reversed_at TEXT,
        reversal_movements_json TEXT,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_lab_usage_records_formula_created ON lab_usage_records(formula_id, created_at)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_lab_usage_records_status ON lab_usage_records(status)').run()
}

async function hydrateSnapshots(db: D1Database, service: NorthStarService) {
  const snapshotRows = await db
    .prepare('SELECT key, value FROM northstar_snapshots')
    .all<{ key: SnapshotKey; value: string }>()
  const serviceState = service as unknown as ServiceState

  for (const row of snapshotRows.results ?? []) {
    if (!SNAPSHOT_KEYS.includes(row.key)) {
      continue
    }
    serviceState[row.key] = JSON.parse(row.value)
  }
  await hydrateNormalizedState(db, serviceState)
}

async function persistSnapshots(db: D1Database, service: NorthStarService) {
  const serviceState = service as unknown as ServiceState
  const updatedAt = new Date().toISOString()
  await persistNormalizedState(db, serviceState, updatedAt)
  const statements = SNAPSHOT_PERSIST_KEYS.map((key) =>
    db
      .prepare(
        `INSERT INTO northstar_snapshots (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(key, JSON.stringify(serviceState[key]), updatedAt),
  )
  await db.batch(statements)
}

async function persistSecurityState(db: D1Database, service: NorthStarService) {
  await persistNormalizedState(db, service as unknown as ServiceState, new Date().toISOString())
}

type AuthSessionRow = {
  id: string
  user_id: string
  email: string
  organization_id: string
  brand_id: string
  role: string
  issued_at: string
  last_seen_at: string
  idle_expires_at: string
  expires_at: string
  status: string
  mfa_verified: number
  ip_address: string
  user_agent: string
  device_id: string
  location: string
  csrf_token: string | null
  revoked_at: string | null
  revoked_reason: string | null
}

type UserSettingsRow = {
  user_id: string
  organization_id: string
  email: string
  display_name: string
  preferred_landing: string
  ui_density: string
  reduce_motion: number
  email_digest: string
  updated_at: string
}

type AuditEventRow = {
  id: string
  at: string
  actor: string
  action: string
  entity: string
  request_id: string
  outcome: string
}

type OrganizationRow = {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  primary_contact: string
  created_at: string
}

type BrandRow = {
  id: string
  organization_id: string
  name: string
  status: string
  default_currency: string
}

type MembershipRow = {
  id: string
  user_id: string
  email: string
  name: string
  organization_id: string
  brand_ids_json: string
  role: string
  status: string
  mfa_enabled: number
  last_active_at: string
  invited_at: string | null
}

type RolePolicyRow = {
  role: string
  scope: string
  mfa_required: number
  permissions_json: string
}

type MaterialRow = {
  id: string
  record_json: string
}

type MoleculeRow = {
  id: string
  record_json: string
}

type StorageLocationRow = {
  id: string
  record_json: string
}

type StockTakeRow = {
  id: string
  record_json: string
}

type TenantSettingsRow = {
  organization_id: string
  locale: string
  timezone: string
  currency: string
  default_unit: string
  default_dilution_percent: number
}

type FeatureFlagRow = {
  flag_key: string
  label: string
  enabled: number
  phase: number
}

type NumberingSequenceRow = {
  sequence_key: string
  pattern: string
  next_value: number
  scope: string
}

type CustomFieldRow = {
  id: string
  entity: string
  field_key: string
  label: string
  field_type: string
  required: number
  options_json: string
  status: string
}

type BrandingRow = {
  organization_id: string
  display_name: string
  accent_color: string
  document_footer: string
  label_template: string
  logo_mode: string
}

type DocumentRecordRow = {
  id: string
  type: string
  title: string
  linked_to: string
  version: string
  sensitivity: string
  status: string
  issue_date: string | null
  expires_at: string | null
  last_accessed: string
  downloads: number
  storage_key: string
  mime_type: string
  size_kb: number
  checksum: string
  owner: string
  generated_from: string | null
}

type ProductionBatchRow = {
  id: string
  formula_id: string
  formula_code: string
  status: string
  target_grams: number
  consumed_grams: number
  qc_status: string
  owner: string
  work_order_json: string
  qc_checks_json: string
  yield_grams: number | null
  yield_variance_percent: number | null
  output_lot_json: string | null
  genealogy_json: string
}

type SupplierRow = {
  id: string
  name: string
  status: string
  country: string
  lead_time_days: number
  contact_email: string
  payment_terms: string
  preferred_material_ids_json: string
}

type PurchaseOrderRow = {
  id: string
  supplier_id: string
  material_id: string
  quantity_grams: number
  received_grams: number
  status: string
  expected_date: string
  unit_cost: number
  currency: string
  created_at: string
}

type PriceHistoryRow = {
  id: string
  material_id: string
  supplier_id: string
  purchase_order_id: string
  unit_cost: number
  currency: string
  quantity_grams: number
  captured_at: string
  source: string
}

type CommercialSkuRow = {
  id: string
  material_id: string
  name: string
  description: string
  pack_size_grams: number
  price: number
  currency: string
  tier: string
  status: string
  moq_packs: number
  label_template: string
}

type PriceListRow = {
  id: string
  name: string
  customer_group: string
  currency: string
  multiplier: number
  sample_eligible: number
  status: string
}

type QuoteRow = {
  id: string
  sku_id: string
  customer: string
  customer_group: string
  quantity_packs: number
  unit_price: number
  total: number
  currency: string
  status: string
  created_at: string
}

type SampleRequestRow = {
  id: string
  sku_id: string
  customer: string
  packs: number
  status: string
  created_at: string
}

type CustomerRow = {
  id: string
  name: string
  customer_group: string
  credit_limit: number
  payment_terms: string
  contact_email: string
  billing_address_json: string
  shipping_address_json: string
  status: string
}

type SalesOrderRow = {
  id: string
  sku_id: string
  customer_id: string
  customer: string
  quantity: number
  unit_price: number
  discount_percent: number
  tax_percent: number
  shipping_cost: number
  total: number
  currency: string
  reserved_grams: number
  fulfilled_grams: number
  status: string
  carrier: string | null
  tracking_number: string | null
  reservation_allocations_json: string | null
  shipment_id: string | null
  document_ids_json: string | null
  created_at: string
}

type ScheduledReportRow = {
  id: string
  name: string
  cadence: string
  audience: string
  format: string
  status: string
  last_run_at: string | null
}

type BillingSubscriptionRow = {
  id: string
  organization_id: string
  plan_id: string
  provider: string
  collection_mode: string
  status: string
  current_period_start: string
  current_period_end: string
  trial_ends_at: string | null
  grace_ends_at: string | null
  freeze_reason: string | null
  provider_customer_id: string | null
  provider_subscription_id: string | null
  can_write: number
  can_export: number
  next_invoice_at: string
  subscription_updated_at: string
}

type BillingInvoiceRow = {
  id: string
  subscription_id: string
  number: string
  status: string
  amount_due: number
  currency: string
  due_at: string
  paid_at: string | null
  hosted_invoice_url: string
  document_id: string | null
  provider_invoice_id: string | null
}

type WebhookDeliveryRow = {
  id: string
  webhook_id: string
  event: string
  status: string
  attempts: number
  last_attempt_at: string
  next_retry_at: string | null
  response_code: number | null
  idempotency_key: string
}

type ShipmentRow = {
  id: string
  order_id: string
  carrier: string
  tracking_number: string
  status: string
  shipped_at: string | null
  delivered_at: string | null
  weight_grams: number
  allocations_json: string
}

type OrderDocumentRow = {
  id: string
  order_id: string
  type: string
  status: string
  url: string
  created_at: string
}

type InventoryLotRow = {
  id: string
  material_id: string
  lot_number: string
  quantity_grams: number
  reserved_grams: number
  received_date: string
  expiry_date: string
  quality_status: string
  location: string
  unit_cost: number
  supplier_lot_ref: string | null
  currency: string | null
  retest_date: string | null
  opened_date: string | null
  shelf_life_after_opening_days: number | null
  container: string | null
  packaging: string | null
  coa_document_id: string | null
}

type InventoryMovementRow = {
  id: string
  at: string
  type: string
  direction: string
  material_id: string
  lot_id: string
  quantity_grams: number
  balance_after: number
  ref: string
  actor: string
}

type LabUsageRecordRow = {
  id: string
  formula_id: string
  formula_code: string
  grams: number
  batch_grams: number
  status: string
  purpose: string
  project_code: string | null
  sample_code: string | null
  qc_link: string | null
  allocations_json: string
  weighing_session_json: string | null
  created_at: string
  reversed_at: string | null
  reversal_movements_json: string | null
}

async function hydrateNormalizedState(db: D1Database, serviceState: ServiceState) {
  const sessionRows = await db
    .prepare(
      `SELECT id, user_id, email, organization_id, brand_id, role, issued_at, last_seen_at,
        idle_expires_at, expires_at, status, mfa_verified, ip_address, user_agent, device_id,
        location, csrf_token, revoked_at, revoked_reason
       FROM auth_sessions
       ORDER BY issued_at DESC`,
    )
    .all<AuthSessionRow>()
  const sessions = (sessionRows.results ?? []).map(authSessionFromRow)
  if (sessions.length > 0) {
    serviceState.sessions = sessions
  } else if (Array.isArray(serviceState.sessions) && serviceState.sessions.length > 0) {
    await persistAuthSessions(db, serviceState.sessions, new Date().toISOString())
  }

  const userSettingsRows = await db
    .prepare(
      `SELECT user_id, organization_id, email, display_name, preferred_landing, ui_density,
        reduce_motion, email_digest, updated_at
       FROM user_settings
       ORDER BY organization_id ASC, email ASC`,
    )
    .all<UserSettingsRow>()
  const userSettingsRecords = (userSettingsRows.results ?? []).map(userSettingsFromRow)
  if (userSettingsRecords.length > 0) {
    serviceState.userSettingsRecords = userSettingsRecords
  } else if (Array.isArray(serviceState.userSettingsRecords) && serviceState.userSettingsRecords.length > 0) {
    await persistUserSettings(db, serviceState.userSettingsRecords, new Date().toISOString())
  }

  const auditRows = await db
    .prepare(
      `SELECT id, at, actor, action, entity, request_id, outcome
       FROM audit_events
       ORDER BY at DESC`,
    )
    .all<AuditEventRow>()
  const events = (auditRows.results ?? []).map(auditEventFromRow)
  if (events.length > 0) {
    serviceState.auditEvents = events
  } else if (Array.isArray(serviceState.auditEvents) && serviceState.auditEvents.length > 0) {
    await persistAuditEvents(db, serviceState.auditEvents, new Date().toISOString())
  }

  serviceState.auditCounter = Math.max(Number(serviceState.auditCounter) || 0, maxAuditCounter(serviceState.auditEvents))
  await hydrateTenantCoreState(db, serviceState)
  await hydrateMaterialState(db, serviceState)
  await hydrateCustomizationState(db, serviceState)
  await hydrateDocumentState(db, serviceState)
  await hydrateProcurementState(db, serviceState)
  await hydrateCatalogState(db, serviceState)
  await hydrateProductionState(db, serviceState)
  await hydrateOrderState(db, serviceState)
  await hydrateAnalyticsState(db, serviceState)
  await hydrateBillingState(db, serviceState)
  await hydrateInventoryState(db, serviceState)
  await hydrateLabUsageState(db, serviceState)
}

async function persistNormalizedState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistAuthSessions(db, serviceState.sessions, updatedAt)
  await persistUserSettings(db, serviceState.userSettingsRecords, updatedAt)
  await persistAuditEvents(db, serviceState.auditEvents, updatedAt)
  await persistTenantCoreState(db, serviceState, updatedAt)
  await persistMaterialState(db, serviceState, updatedAt)
  await persistCustomizationState(db, serviceState, updatedAt)
  await persistDocumentRecords(db, serviceState.documentRecords, updatedAt)
  await persistProcurementState(db, serviceState, updatedAt)
  await persistCatalogState(db, serviceState, updatedAt)
  await persistProductionBatches(db, serviceState.productionBatchRecords, updatedAt)
  await persistOrderState(db, serviceState, updatedAt)
  await persistScheduledReports(db, serviceState.scheduledReportRecords, updatedAt)
  await persistBillingState(db, serviceState, updatedAt)
  await persistInventoryLots(db, serviceState.lots, updatedAt)
  await persistInventoryMovements(db, serviceState.movements, updatedAt)
  await persistLabUsageRecords(db, serviceState.usageHistory, updatedAt)
  serviceState.auditCounter = Math.max(Number(serviceState.auditCounter) || 0, maxAuditCounter(serviceState.auditEvents))
}

async function persistAuthSessions(db: D1Database, sessions: AuthSession[], updatedAt: string) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    sessions.map((session) =>
      db
        .prepare(
          `INSERT INTO auth_sessions (
            id, user_id, email, organization_id, brand_id, role, issued_at, last_seen_at,
            idle_expires_at, expires_at, status, mfa_verified, ip_address, user_agent, device_id,
            location, csrf_token, revoked_at, revoked_reason, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            email = excluded.email,
            organization_id = excluded.organization_id,
            brand_id = excluded.brand_id,
            role = excluded.role,
            issued_at = excluded.issued_at,
            last_seen_at = excluded.last_seen_at,
            idle_expires_at = excluded.idle_expires_at,
            expires_at = excluded.expires_at,
            status = excluded.status,
            mfa_verified = excluded.mfa_verified,
            ip_address = excluded.ip_address,
            user_agent = excluded.user_agent,
            device_id = excluded.device_id,
            location = excluded.location,
            csrf_token = excluded.csrf_token,
            revoked_at = excluded.revoked_at,
            revoked_reason = excluded.revoked_reason,
            updated_at = excluded.updated_at`,
        )
        .bind(
          session.id,
          session.userId,
          session.email,
          session.organizationId,
          session.brandId,
          session.role,
          session.issuedAt,
          session.lastSeenAt,
          session.idleExpiresAt,
          session.expiresAt,
          session.status,
          session.mfaVerified ? 1 : 0,
          session.ipAddress,
          session.userAgent,
          session.deviceId,
          session.location,
          session.csrfToken ?? null,
          session.revokedAt ?? null,
          session.revokedReason ?? null,
          updatedAt,
        ),
    ),
  )
}

async function persistUserSettings(db: D1Database, settings: UserSettingsRecord[], updatedAt: string) {
  if (!Array.isArray(settings) || settings.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    settings.map((record) =>
      db
        .prepare(
          `INSERT INTO user_settings (
            user_id, organization_id, email, display_name, preferred_landing,
            ui_density, reduce_motion, email_digest, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
          ON CONFLICT(user_id, organization_id) DO UPDATE SET
            email = excluded.email,
            display_name = excluded.display_name,
            preferred_landing = excluded.preferred_landing,
            ui_density = excluded.ui_density,
            reduce_motion = excluded.reduce_motion,
            email_digest = excluded.email_digest,
            updated_at = excluded.updated_at`,
        )
        .bind(
          record.userId,
          record.organizationId,
          record.email,
          record.displayName,
          record.preferredLanding,
          record.uiDensity,
          record.reduceMotion ? 1 : 0,
          record.emailDigest,
          updatedAt,
        ),
    ),
  )
}

async function persistAuditEvents(db: D1Database, events: AuditEvent[], updatedAt: string) {
  if (!Array.isArray(events) || events.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    events.map((event) =>
      db
        .prepare(
          `INSERT INTO audit_events (id, at, actor, action, entity, request_id, outcome, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
           ON CONFLICT(id) DO UPDATE SET
             at = excluded.at,
             actor = excluded.actor,
             action = excluded.action,
             entity = excluded.entity,
             request_id = excluded.request_id,
             outcome = excluded.outcome,
             updated_at = excluded.updated_at`,
        )
        .bind(event.id, event.at, event.actor, event.action, event.entity, event.requestId, event.outcome, updatedAt),
    ),
  )
}

async function hydrateTenantCoreState(db: D1Database, serviceState: ServiceState) {
  const organizationRows = await db
    .prepare(
      `SELECT id, name, slug, plan, status, primary_contact, created_at
       FROM tenant_organizations
       ORDER BY created_at DESC, id DESC`,
    )
    .all<OrganizationRow>()
  const organizations = (organizationRows.results ?? []).map(organizationFromRow)
  if (organizations.length > 0) {
    serviceState.organizationRecords = organizations
  } else if (Array.isArray(serviceState.organizationRecords) && serviceState.organizationRecords.length > 0) {
    await persistOrganizations(db, serviceState.organizationRecords, new Date().toISOString())
  }

  const brandRows = await db
    .prepare(
      `SELECT id, organization_id, name, status, default_currency
       FROM tenant_brands
       ORDER BY organization_id ASC, id ASC`,
    )
    .all<BrandRow>()
  const brands = (brandRows.results ?? []).map(brandFromRow)
  if (brands.length > 0) {
    serviceState.brandRecords = brands
  } else if (Array.isArray(serviceState.brandRecords) && serviceState.brandRecords.length > 0) {
    await persistBrands(db, serviceState.brandRecords, new Date().toISOString())
  }

  const membershipRows = await db
    .prepare(
      `SELECT id, user_id, email, name, organization_id, brand_ids_json, role, status,
        mfa_enabled, last_active_at, invited_at
       FROM tenant_memberships
       ORDER BY organization_id ASC, id ASC`,
    )
    .all<MembershipRow>()
  const memberships = (membershipRows.results ?? []).map(membershipFromRow)
  if (memberships.length > 0) {
    serviceState.membershipRecords = memberships
  } else if (Array.isArray(serviceState.membershipRecords) && serviceState.membershipRecords.length > 0) {
    await persistMemberships(db, serviceState.membershipRecords, new Date().toISOString())
  }

  const roleRows = await db
    .prepare(
      `SELECT role, scope, mfa_required, permissions_json
       FROM role_policies
       ORDER BY scope ASC, role ASC`,
    )
    .all<RolePolicyRow>()
  const rolePolicies = (roleRows.results ?? []).map(rolePolicyFromRow)
  if (rolePolicies.length > 0) {
    serviceState.rolePolicyRecords = rolePolicies
  } else if (Array.isArray(serviceState.rolePolicyRecords) && serviceState.rolePolicyRecords.length > 0) {
    await persistRolePolicies(db, serviceState.rolePolicyRecords, new Date().toISOString())
  }
}

async function persistTenantCoreState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistOrganizations(db, serviceState.organizationRecords, updatedAt)
  await persistBrands(db, serviceState.brandRecords, updatedAt)
  await persistMemberships(db, serviceState.membershipRecords, updatedAt)
  await persistRolePolicies(db, serviceState.rolePolicyRecords, updatedAt)
}

async function hydrateMaterialState(db: D1Database, serviceState: ServiceState) {
  const materialRows = await db
    .prepare('SELECT id, record_json FROM material_records ORDER BY name ASC')
    .all<MaterialRow>()
  const materials = (materialRows.results ?? [])
    .map((row) => parseJsonOptional<Material>(row.record_json))
    .filter(isDefined)
  if (materials.length > 0) {
    serviceState.materialRecords = materials
  } else if (Array.isArray(serviceState.materialRecords) && serviceState.materialRecords.length > 0) {
    await persistMaterials(db, serviceState.materialRecords, new Date().toISOString())
  }

  const moleculeRows = await db
    .prepare('SELECT id, record_json FROM molecule_components ORDER BY material_id ASC, name ASC')
    .all<MoleculeRow>()
  const molecules = (moleculeRows.results ?? [])
    .map((row) => parseJsonOptional<MoleculeComponent>(row.record_json))
    .filter(isDefined)
  if (molecules.length > 0) {
    serviceState.moleculeRecords = molecules
  } else if (Array.isArray(serviceState.moleculeRecords) && serviceState.moleculeRecords.length > 0) {
    await persistMolecules(db, serviceState.moleculeRecords, new Date().toISOString())
  }

  const locationRows = await db
    .prepare('SELECT id, record_json FROM storage_locations ORDER BY zone ASC, name ASC')
    .all<StorageLocationRow>()
  const locations = (locationRows.results ?? [])
    .map((row) => parseJsonOptional<StorageLocation>(row.record_json))
    .filter(isDefined)
  if (locations.length > 0) {
    serviceState.locationRecords = locations
  } else if (Array.isArray(serviceState.locationRecords) && serviceState.locationRecords.length > 0) {
    await persistStorageLocations(db, serviceState.locationRecords, new Date().toISOString())
  }

  const stockTakeRows = await db
    .prepare('SELECT id, record_json FROM stock_take_records ORDER BY at DESC, id DESC')
    .all<StockTakeRow>()
  const stockTakes = (stockTakeRows.results ?? [])
    .map((row) => parseJsonOptional<StockTakeRecord>(row.record_json))
    .filter(isDefined)
  if (stockTakes.length > 0) {
    serviceState.stockTakeRecords = stockTakes
  } else if (Array.isArray(serviceState.stockTakeRecords) && serviceState.stockTakeRecords.length > 0) {
    await persistStockTakes(db, serviceState.stockTakeRecords, new Date().toISOString())
  }
}

async function persistMaterialState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistMaterials(db, serviceState.materialRecords, updatedAt)
  await persistMolecules(db, serviceState.moleculeRecords, updatedAt)
  await persistStorageLocations(db, serviceState.locationRecords, updatedAt)
  await persistStockTakes(db, serviceState.stockTakeRecords, updatedAt)
}

async function persistMaterials(db: D1Database, materials: Material[], updatedAt: string) {
  if (!Array.isArray(materials) || materials.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    materials.map((material) =>
      db
        .prepare(
          `INSERT INTO material_records (id, name, cas, family, tier, record_json, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             cas = excluded.cas,
             family = excluded.family,
             tier = excluded.tier,
             record_json = excluded.record_json,
             updated_at = excluded.updated_at`,
        )
        .bind(material.id, material.name, material.cas, material.family, material.tier, JSON.stringify(material), updatedAt),
    ),
  )
}

async function persistMolecules(db: D1Database, molecules: MoleculeComponent[], updatedAt: string) {
  if (!Array.isArray(molecules) || molecules.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    molecules.map((molecule) =>
      db
        .prepare(
          `INSERT INTO molecule_components (id, material_id, name, cas, status, record_json, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(id) DO UPDATE SET
             material_id = excluded.material_id,
             name = excluded.name,
             cas = excluded.cas,
             status = excluded.status,
             record_json = excluded.record_json,
             updated_at = excluded.updated_at`,
        )
        .bind(molecule.id, molecule.materialId, molecule.name, molecule.cas, molecule.status, JSON.stringify(molecule), updatedAt),
    ),
  )
}

async function persistStorageLocations(db: D1Database, locations: StorageLocation[], updatedAt: string) {
  if (!Array.isArray(locations) || locations.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    locations.map((location) =>
      db
        .prepare(
          `INSERT INTO storage_locations (id, name, zone, status, record_json, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             zone = excluded.zone,
             status = excluded.status,
             record_json = excluded.record_json,
             updated_at = excluded.updated_at`,
        )
        .bind(location.id, location.name, location.zone, location.status ?? 'ACTIVE', JSON.stringify(location), updatedAt),
    ),
  )
}

async function persistStockTakes(db: D1Database, stockTakes: StockTakeRecord[], updatedAt: string) {
  if (!Array.isArray(stockTakes) || stockTakes.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    stockTakes.map((stockTake) =>
      db
        .prepare(
          `INSERT INTO stock_take_records (id, at, lot_id, status, record_json, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(id) DO UPDATE SET
             at = excluded.at,
             lot_id = excluded.lot_id,
             status = excluded.status,
             record_json = excluded.record_json,
             updated_at = excluded.updated_at`,
        )
        .bind(stockTake.id, stockTake.at, stockTake.lotId, stockTake.status, JSON.stringify(stockTake), updatedAt),
    ),
  )
}

async function hydrateCustomizationState(db: D1Database, serviceState: ServiceState) {
  const settingsRows = await db
    .prepare(
      `SELECT organization_id, locale, timezone, currency, default_unit, default_dilution_percent
       FROM tenant_settings
       ORDER BY organization_id ASC`,
    )
    .all<TenantSettingsRow>()
  const settings = settingsRows.results?.[0]
  if (settings) {
    serviceState.settingsRecord = tenantSettingsFromRow(settings)
  } else if (serviceState.settingsRecord) {
    await persistTenantSettings(db, serviceState.settingsRecord, new Date().toISOString())
  }

  const flagRows = await db
    .prepare('SELECT flag_key, label, enabled, phase FROM feature_flags ORDER BY phase ASC, flag_key ASC')
    .all<FeatureFlagRow>()
  const flags = (flagRows.results ?? []).map(featureFlagFromRow)
  if (flags.length > 0) {
    serviceState.flagRecords = flags
  } else if (Array.isArray(serviceState.flagRecords) && serviceState.flagRecords.length > 0) {
    await persistFeatureFlags(db, serviceState.flagRecords, new Date().toISOString())
  }

  const sequenceRows = await db
    .prepare('SELECT sequence_key, pattern, next_value, scope FROM numbering_sequences ORDER BY sequence_key ASC')
    .all<NumberingSequenceRow>()
  const sequences = (sequenceRows.results ?? []).map(numberingSequenceFromRow)
  if (sequences.length > 0) {
    serviceState.sequences = sequences
  } else if (Array.isArray(serviceState.sequences) && serviceState.sequences.length > 0) {
    await persistNumberingSequences(db, serviceState.sequences, new Date().toISOString())
  }

  const fieldRows = await db
    .prepare(
      `SELECT id, entity, field_key, label, field_type, required, options_json, status
       FROM custom_fields
       ORDER BY entity ASC, id ASC`,
    )
    .all<CustomFieldRow>()
  const fields = (fieldRows.results ?? []).map(customFieldFromRow)
  if (fields.length > 0) {
    serviceState.customFieldRecords = fields
  } else if (Array.isArray(serviceState.customFieldRecords) && serviceState.customFieldRecords.length > 0) {
    await persistCustomFields(db, serviceState.customFieldRecords, new Date().toISOString())
  }

  const brandingRows = await db
    .prepare(
      `SELECT organization_id, display_name, accent_color, document_footer, label_template, logo_mode
       FROM tenant_branding
       ORDER BY organization_id ASC`,
    )
    .all<BrandingRow>()
  const branding = brandingRows.results?.[0]
  if (branding) {
    serviceState.brandingRecord = brandingFromRow(branding)
  } else if (serviceState.brandingRecord) {
    await persistBranding(db, serviceState.brandingRecord, new Date().toISOString())
  }
}

async function persistCustomizationState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistTenantSettings(db, serviceState.settingsRecord, updatedAt)
  await persistFeatureFlags(db, serviceState.flagRecords, updatedAt)
  await persistNumberingSequences(db, serviceState.sequences, updatedAt)
  await persistCustomFields(db, serviceState.customFieldRecords, updatedAt)
  await persistBranding(db, serviceState.brandingRecord, updatedAt)
}

async function persistTenantSettings(db: D1Database, settings: TenantSettingsRecord, updatedAt: string) {
  if (!settings) {
    return
  }
  await db
    .prepare(
      `INSERT INTO tenant_settings (
        organization_id, locale, timezone, currency, default_unit, default_dilution_percent, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(organization_id) DO UPDATE SET
        locale = excluded.locale,
        timezone = excluded.timezone,
        currency = excluded.currency,
        default_unit = excluded.default_unit,
        default_dilution_percent = excluded.default_dilution_percent,
        updated_at = excluded.updated_at`,
    )
    .bind(
      settings.organizationId,
      settings.locale,
      settings.timezone,
      settings.currency,
      settings.defaultUnit,
      settings.defaultDilutionPercent,
      updatedAt,
    )
    .run()
}

async function persistFeatureFlags(db: D1Database, flags: FeatureFlagRecord[], updatedAt: string) {
  if (!Array.isArray(flags) || flags.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    flags.map((flag) =>
      db
        .prepare(
          `INSERT INTO feature_flags (flag_key, label, enabled, phase, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(flag_key) DO UPDATE SET
             label = excluded.label,
             enabled = excluded.enabled,
             phase = excluded.phase,
             updated_at = excluded.updated_at`,
        )
        .bind(flag.key, flag.label, flag.enabled ? 1 : 0, flag.phase, updatedAt),
    ),
  )
}

async function persistNumberingSequences(db: D1Database, sequences: NumberingSequenceRecord[], updatedAt: string) {
  if (!Array.isArray(sequences) || sequences.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    sequences.map((sequence) =>
      db
        .prepare(
          `INSERT INTO numbering_sequences (sequence_key, pattern, next_value, scope, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(sequence_key) DO UPDATE SET
             pattern = excluded.pattern,
             next_value = excluded.next_value,
             scope = excluded.scope,
             updated_at = excluded.updated_at`,
        )
        .bind(sequence.key, sequence.pattern, sequence.nextValue, sequence.scope, updatedAt),
    ),
  )
}

async function persistCustomFields(db: D1Database, fields: CustomFieldDefinition[], updatedAt: string) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    fields.map((field) =>
      db
        .prepare(
          `INSERT INTO custom_fields (
            id, entity, field_key, label, field_type, required, options_json, status, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
          ON CONFLICT(id) DO UPDATE SET
            entity = excluded.entity,
            field_key = excluded.field_key,
            label = excluded.label,
            field_type = excluded.field_type,
            required = excluded.required,
            options_json = excluded.options_json,
            status = excluded.status,
            updated_at = excluded.updated_at`,
        )
        .bind(
          field.id,
          field.entity,
          field.key,
          field.label,
          field.fieldType,
          field.required ? 1 : 0,
          JSON.stringify(field.options),
          field.status,
          updatedAt,
        ),
    ),
  )
}

async function persistBranding(db: D1Database, branding: BrandingConfig, updatedAt: string) {
  if (!branding) {
    return
  }
  await db
    .prepare(
      `INSERT INTO tenant_branding (
        organization_id, display_name, accent_color, document_footer, label_template, logo_mode, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(organization_id) DO UPDATE SET
        display_name = excluded.display_name,
        accent_color = excluded.accent_color,
        document_footer = excluded.document_footer,
        label_template = excluded.label_template,
        logo_mode = excluded.logo_mode,
        updated_at = excluded.updated_at`,
    )
    .bind(
      branding.organizationId,
      branding.displayName,
      branding.accentColor,
      branding.documentFooter,
      branding.labelTemplate,
      branding.logoMode,
      updatedAt,
    )
    .run()
}

async function persistOrganizations(db: D1Database, organizations: OrganizationRecord[], updatedAt: string) {
  if (!Array.isArray(organizations) || organizations.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    organizations.map((organization) =>
      db
        .prepare(
          `INSERT INTO tenant_organizations (
            id, name, slug, plan, status, primary_contact, created_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            slug = excluded.slug,
            plan = excluded.plan,
            status = excluded.status,
            primary_contact = excluded.primary_contact,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          organization.id,
          organization.name,
          organization.slug,
          organization.plan,
          organization.status,
          organization.primaryContact,
          organization.createdAt,
          updatedAt,
        ),
    ),
  )
}

async function persistBrands(db: D1Database, brands: BrandRecord[], updatedAt: string) {
  if (!Array.isArray(brands) || brands.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    brands.map((brand) =>
      db
        .prepare(
          `INSERT INTO tenant_brands (id, organization_id, name, status, default_currency, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(id) DO UPDATE SET
             organization_id = excluded.organization_id,
             name = excluded.name,
             status = excluded.status,
             default_currency = excluded.default_currency,
             updated_at = excluded.updated_at`,
        )
        .bind(brand.id, brand.organizationId, brand.name, brand.status, brand.defaultCurrency, updatedAt),
    ),
  )
}

async function persistMemberships(db: D1Database, memberships: MembershipRecord[], updatedAt: string) {
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    memberships.map((membership) =>
      db
        .prepare(
          `INSERT INTO tenant_memberships (
            id, user_id, email, name, organization_id, brand_ids_json, role, status,
            mfa_enabled, last_active_at, invited_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            email = excluded.email,
            name = excluded.name,
            organization_id = excluded.organization_id,
            brand_ids_json = excluded.brand_ids_json,
            role = excluded.role,
            status = excluded.status,
            mfa_enabled = excluded.mfa_enabled,
            last_active_at = excluded.last_active_at,
            invited_at = excluded.invited_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          membership.id,
          membership.userId,
          membership.email,
          membership.name,
          membership.organizationId,
          JSON.stringify(membership.brandIds),
          membership.role,
          membership.status,
          membership.mfaEnabled ? 1 : 0,
          membership.lastActiveAt,
          membership.invitedAt ?? null,
          updatedAt,
        ),
    ),
  )
}

async function persistRolePolicies(db: D1Database, rolePolicies: RolePolicy[], updatedAt: string) {
  if (!Array.isArray(rolePolicies) || rolePolicies.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    rolePolicies.map((policy) =>
      db
        .prepare(
          `INSERT INTO role_policies (role, scope, mfa_required, permissions_json, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(role, scope) DO UPDATE SET
             mfa_required = excluded.mfa_required,
             permissions_json = excluded.permissions_json,
             updated_at = excluded.updated_at`,
        )
        .bind(policy.role, policy.scope, policy.mfaRequired ? 1 : 0, JSON.stringify(policy.permissions), updatedAt),
    ),
  )
}

async function hydrateDocumentState(db: D1Database, serviceState: ServiceState) {
  const documentRows = await db
    .prepare(
      `SELECT id, type, title, linked_to, version, sensitivity, status, issue_date, expires_at,
        last_accessed, downloads, storage_key, mime_type, size_kb, checksum, owner, generated_from
       FROM document_records
       ORDER BY last_accessed DESC, id DESC`,
    )
    .all<DocumentRecordRow>()
  const documentRecords = (documentRows.results ?? []).map(documentFromRow)
  if (documentRecords.length > 0) {
    serviceState.documentRecords = documentRecords
  } else if (Array.isArray(serviceState.documentRecords) && serviceState.documentRecords.length > 0) {
    await persistDocumentRecords(db, serviceState.documentRecords, new Date().toISOString())
  }
}

async function persistDocumentRecords(db: D1Database, documents: DocumentRecord[], updatedAt: string) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    documents.map((document) =>
      db
        .prepare(
          `INSERT INTO document_records (
            id, type, title, linked_to, version, sensitivity, status, issue_date, expires_at,
            last_accessed, downloads, storage_key, mime_type, size_kb, checksum, owner,
            generated_from, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
          ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            title = excluded.title,
            linked_to = excluded.linked_to,
            version = excluded.version,
            sensitivity = excluded.sensitivity,
            status = excluded.status,
            issue_date = excluded.issue_date,
            expires_at = excluded.expires_at,
            last_accessed = excluded.last_accessed,
            downloads = excluded.downloads,
            storage_key = excluded.storage_key,
            mime_type = excluded.mime_type,
            size_kb = excluded.size_kb,
            checksum = excluded.checksum,
            owner = excluded.owner,
            generated_from = excluded.generated_from,
            updated_at = excluded.updated_at`,
        )
        .bind(
          document.id,
          document.type,
          document.title,
          document.linkedTo,
          document.version,
          document.sensitivity,
          document.status,
          document.issueDate ?? null,
          document.expiresAt ?? null,
          document.lastAccessed,
          document.downloads,
          document.storageKey,
          document.mimeType,
          document.sizeKb,
          document.checksum,
          document.owner,
          document.generatedFrom ?? null,
          updatedAt,
        ),
    ),
  )
}

async function hydrateProcurementState(db: D1Database, serviceState: ServiceState) {
  const supplierRows = await db
    .prepare(
      `SELECT id, name, status, country, lead_time_days, contact_email, payment_terms, preferred_material_ids_json
       FROM suppliers
       ORDER BY name ASC`,
    )
    .all<SupplierRow>()
  const suppliers = (supplierRows.results ?? []).map(supplierFromRow)
  if (suppliers.length > 0) {
    serviceState.supplierRecords = suppliers
  } else if (Array.isArray(serviceState.supplierRecords) && serviceState.supplierRecords.length > 0) {
    await persistSuppliers(db, serviceState.supplierRecords, new Date().toISOString())
  }

  const poRows = await db
    .prepare(
      `SELECT id, supplier_id, material_id, quantity_grams, received_grams, status,
        expected_date, unit_cost, currency, created_at
       FROM purchase_orders
       ORDER BY created_at DESC, id DESC`,
    )
    .all<PurchaseOrderRow>()
  const purchaseOrders = (poRows.results ?? []).map(purchaseOrderFromRow)
  if (purchaseOrders.length > 0) {
    serviceState.purchaseOrderRecords = purchaseOrders
  } else if (Array.isArray(serviceState.purchaseOrderRecords) && serviceState.purchaseOrderRecords.length > 0) {
    await persistPurchaseOrders(db, serviceState.purchaseOrderRecords, new Date().toISOString())
  }

  const priceRows = await db
    .prepare(
      `SELECT id, material_id, supplier_id, purchase_order_id, unit_cost, currency,
        quantity_grams, captured_at, source
       FROM price_history
       ORDER BY captured_at DESC, id DESC`,
    )
    .all<PriceHistoryRow>()
  const priceHistory = (priceRows.results ?? []).map(priceHistoryFromRow)
  if (priceHistory.length > 0) {
    serviceState.priceHistoryRecords = priceHistory
  } else if (Array.isArray(serviceState.priceHistoryRecords) && serviceState.priceHistoryRecords.length > 0) {
    await persistPriceHistory(db, serviceState.priceHistoryRecords, new Date().toISOString())
  }
}

async function persistProcurementState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistSuppliers(db, serviceState.supplierRecords, updatedAt)
  await persistPurchaseOrders(db, serviceState.purchaseOrderRecords, updatedAt)
  await persistPriceHistory(db, serviceState.priceHistoryRecords, updatedAt)
}

async function persistSuppliers(db: D1Database, suppliers: SupplierRecord[], updatedAt: string) {
  if (!Array.isArray(suppliers) || suppliers.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    suppliers.map((supplier) =>
      db
        .prepare(
          `INSERT INTO suppliers (
            id, name, status, country, lead_time_days, contact_email, payment_terms,
            preferred_material_ids_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            status = excluded.status,
            country = excluded.country,
            lead_time_days = excluded.lead_time_days,
            contact_email = excluded.contact_email,
            payment_terms = excluded.payment_terms,
            preferred_material_ids_json = excluded.preferred_material_ids_json,
            updated_at = excluded.updated_at`,
        )
        .bind(
          supplier.id,
          supplier.name,
          supplier.status,
          supplier.country,
          supplier.leadTimeDays,
          supplier.contactEmail,
          supplier.paymentTerms,
          JSON.stringify(supplier.preferredMaterialIds),
          updatedAt,
        ),
    ),
  )
}

async function persistPurchaseOrders(db: D1Database, purchaseOrders: PurchaseOrderRecord[], updatedAt: string) {
  if (!Array.isArray(purchaseOrders) || purchaseOrders.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    purchaseOrders.map((order) =>
      db
        .prepare(
          `INSERT INTO purchase_orders (
            id, supplier_id, material_id, quantity_grams, received_grams, status,
            expected_date, unit_cost, currency, created_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ON CONFLICT(id) DO UPDATE SET
            supplier_id = excluded.supplier_id,
            material_id = excluded.material_id,
            quantity_grams = excluded.quantity_grams,
            received_grams = excluded.received_grams,
            status = excluded.status,
            expected_date = excluded.expected_date,
            unit_cost = excluded.unit_cost,
            currency = excluded.currency,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          order.id,
          order.supplierId,
          order.materialId,
          order.quantityGrams,
          order.receivedGrams,
          order.status,
          order.expectedDate,
          order.unitCost,
          order.currency,
          order.createdAt,
          updatedAt,
        ),
    ),
  )
}

async function persistPriceHistory(db: D1Database, records: PriceHistoryRecord[], updatedAt: string) {
  if (!Array.isArray(records) || records.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    records.map((record) =>
      db
        .prepare(
          `INSERT INTO price_history (
            id, material_id, supplier_id, purchase_order_id, unit_cost, currency,
            quantity_grams, captured_at, source, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          ON CONFLICT(id) DO UPDATE SET
            material_id = excluded.material_id,
            supplier_id = excluded.supplier_id,
            purchase_order_id = excluded.purchase_order_id,
            unit_cost = excluded.unit_cost,
            currency = excluded.currency,
            quantity_grams = excluded.quantity_grams,
            captured_at = excluded.captured_at,
            source = excluded.source,
            updated_at = excluded.updated_at`,
        )
        .bind(
          record.id,
          record.materialId,
          record.supplierId,
          record.purchaseOrderId,
          record.unitCost,
          record.currency,
          record.quantityGrams,
          record.capturedAt,
          record.source,
          updatedAt,
        ),
    ),
  )
}

async function hydrateCatalogState(db: D1Database, serviceState: ServiceState) {
  const skuRows = await db
    .prepare(
      `SELECT id, material_id, name, description, pack_size_grams, price, currency,
        tier, status, moq_packs, label_template
       FROM commercial_skus
       ORDER BY name ASC`,
    )
    .all<CommercialSkuRow>()
  const skus = (skuRows.results ?? []).map(commercialSkuFromRow)
  if (skus.length > 0) {
    serviceState.commercialSkuRecords = skus
  } else if (Array.isArray(serviceState.commercialSkuRecords) && serviceState.commercialSkuRecords.length > 0) {
    await persistCommercialSkus(db, serviceState.commercialSkuRecords, new Date().toISOString())
  }

  const priceListRows = await db
    .prepare(
      `SELECT id, name, customer_group, currency, multiplier, sample_eligible, status
       FROM price_lists
       ORDER BY customer_group ASC, id ASC`,
    )
    .all<PriceListRow>()
  const priceLists = (priceListRows.results ?? []).map(priceListFromRow)
  if (priceLists.length > 0) {
    serviceState.priceListRecords = priceLists
  } else if (Array.isArray(serviceState.priceListRecords) && serviceState.priceListRecords.length > 0) {
    await persistPriceLists(db, serviceState.priceListRecords, new Date().toISOString())
  }

  const quoteRows = await db
    .prepare(
      `SELECT id, sku_id, customer, customer_group, quantity_packs, unit_price,
        total, currency, status, created_at
       FROM quotes
       ORDER BY created_at DESC, id DESC`,
    )
    .all<QuoteRow>()
  const quotes = (quoteRows.results ?? []).map(quoteFromRow)
  if (quotes.length > 0) {
    serviceState.quoteRecords = quotes
  } else if (Array.isArray(serviceState.quoteRecords) && serviceState.quoteRecords.length > 0) {
    await persistQuotes(db, serviceState.quoteRecords, new Date().toISOString())
  }

  const sampleRows = await db
    .prepare(
      `SELECT id, sku_id, customer, packs, status, created_at
       FROM sample_requests
       ORDER BY created_at DESC, id DESC`,
    )
    .all<SampleRequestRow>()
  const samples = (sampleRows.results ?? []).map(sampleRequestFromRow)
  if (samples.length > 0) {
    serviceState.sampleRequestRecords = samples
  } else if (Array.isArray(serviceState.sampleRequestRecords) && serviceState.sampleRequestRecords.length > 0) {
    await persistSampleRequests(db, serviceState.sampleRequestRecords, new Date().toISOString())
  }

  const customerRows = await db
    .prepare(
      `SELECT id, name, customer_group, credit_limit, payment_terms, contact_email,
        billing_address_json, shipping_address_json, status
       FROM customers
       ORDER BY name ASC`,
    )
    .all<CustomerRow>()
  const customers = (customerRows.results ?? []).map(customerFromRow)
  if (customers.length > 0) {
    serviceState.customerRecords = customers
  } else if (Array.isArray(serviceState.customerRecords) && serviceState.customerRecords.length > 0) {
    await persistCustomers(db, serviceState.customerRecords, new Date().toISOString())
  }
}

async function persistCatalogState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistCommercialSkus(db, serviceState.commercialSkuRecords, updatedAt)
  await persistPriceLists(db, serviceState.priceListRecords, updatedAt)
  await persistQuotes(db, serviceState.quoteRecords, updatedAt)
  await persistSampleRequests(db, serviceState.sampleRequestRecords, updatedAt)
  await persistCustomers(db, serviceState.customerRecords, updatedAt)
}

async function persistCommercialSkus(db: D1Database, skus: CommercialSkuRecord[], updatedAt: string) {
  if (!Array.isArray(skus) || skus.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    skus.map((sku) =>
      db
        .prepare(
          `INSERT INTO commercial_skus (
            id, material_id, name, description, pack_size_grams, price, currency,
            tier, status, moq_packs, label_template, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
          ON CONFLICT(id) DO UPDATE SET
            material_id = excluded.material_id,
            name = excluded.name,
            description = excluded.description,
            pack_size_grams = excluded.pack_size_grams,
            price = excluded.price,
            currency = excluded.currency,
            tier = excluded.tier,
            status = excluded.status,
            moq_packs = excluded.moq_packs,
            label_template = excluded.label_template,
            updated_at = excluded.updated_at`,
        )
        .bind(
          sku.id,
          sku.materialId,
          sku.name,
          sku.description,
          sku.packSizeGrams,
          sku.price,
          sku.currency,
          sku.tier,
          sku.status,
          sku.moqPacks,
          sku.labelTemplate,
          updatedAt,
        ),
    ),
  )
}

async function persistPriceLists(db: D1Database, priceLists: PriceListRecord[], updatedAt: string) {
  if (!Array.isArray(priceLists) || priceLists.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    priceLists.map((priceList) =>
      db
        .prepare(
          `INSERT INTO price_lists (
            id, name, customer_group, currency, multiplier, sample_eligible, status, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            customer_group = excluded.customer_group,
            currency = excluded.currency,
            multiplier = excluded.multiplier,
            sample_eligible = excluded.sample_eligible,
            status = excluded.status,
            updated_at = excluded.updated_at`,
        )
        .bind(
          priceList.id,
          priceList.name,
          priceList.customerGroup,
          priceList.currency,
          priceList.multiplier,
          priceList.sampleEligible ? 1 : 0,
          priceList.status,
          updatedAt,
        ),
    ),
  )
}

async function persistQuotes(db: D1Database, quotes: QuoteRecord[], updatedAt: string) {
  if (!Array.isArray(quotes) || quotes.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    quotes.map((quote) =>
      db
        .prepare(
          `INSERT INTO quotes (
            id, sku_id, customer, customer_group, quantity_packs, unit_price,
            total, currency, status, created_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ON CONFLICT(id) DO UPDATE SET
            sku_id = excluded.sku_id,
            customer = excluded.customer,
            customer_group = excluded.customer_group,
            quantity_packs = excluded.quantity_packs,
            unit_price = excluded.unit_price,
            total = excluded.total,
            currency = excluded.currency,
            status = excluded.status,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          quote.id,
          quote.skuId,
          quote.customer,
          quote.customerGroup,
          quote.quantityPacks,
          quote.unitPrice,
          quote.total,
          quote.currency,
          quote.status,
          quote.createdAt,
          updatedAt,
        ),
    ),
  )
}

async function persistSampleRequests(db: D1Database, samples: SampleRequestRecord[], updatedAt: string) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    samples.map((sample) =>
      db
        .prepare(
          `INSERT INTO sample_requests (id, sku_id, customer, packs, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(id) DO UPDATE SET
             sku_id = excluded.sku_id,
             customer = excluded.customer,
             packs = excluded.packs,
             status = excluded.status,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at`,
        )
        .bind(sample.id, sample.skuId, sample.customer, sample.packs, sample.status, sample.createdAt, updatedAt),
    ),
  )
}

async function persistCustomers(db: D1Database, customers: CustomerRecord[], updatedAt: string) {
  if (!Array.isArray(customers) || customers.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    customers.map((customer) =>
      db
        .prepare(
          `INSERT INTO customers (
            id, name, customer_group, credit_limit, payment_terms, contact_email,
            billing_address_json, shipping_address_json, status, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            customer_group = excluded.customer_group,
            credit_limit = excluded.credit_limit,
            payment_terms = excluded.payment_terms,
            contact_email = excluded.contact_email,
            billing_address_json = excluded.billing_address_json,
            shipping_address_json = excluded.shipping_address_json,
            status = excluded.status,
            updated_at = excluded.updated_at`,
        )
        .bind(
          customer.id,
          customer.name,
          customer.group,
          customer.creditLimit,
          customer.paymentTerms,
          customer.contactEmail,
          JSON.stringify(customer.billingAddress),
          JSON.stringify(customer.shippingAddress),
          customer.status,
          updatedAt,
        ),
    ),
  )
}

async function hydrateProductionState(db: D1Database, serviceState: ServiceState) {
  const rows = await db
    .prepare(
      `SELECT id, formula_id, formula_code, status, target_grams, consumed_grams, qc_status,
        owner, work_order_json, qc_checks_json, yield_grams, yield_variance_percent,
        output_lot_json, genealogy_json
       FROM production_batches
       ORDER BY id DESC`,
    )
    .all<ProductionBatchRow>()
  const batches = (rows.results ?? []).map(productionBatchFromRow)
  if (batches.length > 0) {
    serviceState.productionBatchRecords = batches
  } else if (Array.isArray(serviceState.productionBatchRecords) && serviceState.productionBatchRecords.length > 0) {
    await persistProductionBatches(db, serviceState.productionBatchRecords, new Date().toISOString())
  }
}

async function persistProductionBatches(db: D1Database, batches: ProductionBatchRecord[], updatedAt: string) {
  if (!Array.isArray(batches) || batches.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    batches.map((batch) =>
      db
        .prepare(
          `INSERT INTO production_batches (
            id, formula_id, formula_code, status, target_grams, consumed_grams, qc_status,
            owner, work_order_json, qc_checks_json, yield_grams, yield_variance_percent,
            output_lot_json, genealogy_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
          ON CONFLICT(id) DO UPDATE SET
            formula_id = excluded.formula_id,
            formula_code = excluded.formula_code,
            status = excluded.status,
            target_grams = excluded.target_grams,
            consumed_grams = excluded.consumed_grams,
            qc_status = excluded.qc_status,
            owner = excluded.owner,
            work_order_json = excluded.work_order_json,
            qc_checks_json = excluded.qc_checks_json,
            yield_grams = excluded.yield_grams,
            yield_variance_percent = excluded.yield_variance_percent,
            output_lot_json = excluded.output_lot_json,
            genealogy_json = excluded.genealogy_json,
            updated_at = excluded.updated_at`,
        )
        .bind(
          batch.id,
          batch.formulaId,
          batch.formulaCode,
          batch.status,
          batch.targetGrams,
          batch.consumedGrams,
          batch.qcStatus,
          batch.owner,
          JSON.stringify(batch.workOrder),
          JSON.stringify(batch.qcChecks),
          batch.yieldGrams ?? null,
          batch.yieldVariancePercent ?? null,
          batch.outputLot ? JSON.stringify(batch.outputLot) : null,
          JSON.stringify(batch.genealogy),
          updatedAt,
        ),
    ),
  )
}

async function hydrateOrderState(db: D1Database, serviceState: ServiceState) {
  const orderRows = await db
    .prepare(
      `SELECT id, sku_id, customer_id, customer, quantity, unit_price, discount_percent,
        tax_percent, shipping_cost, total, currency, reserved_grams, fulfilled_grams, status,
        carrier, tracking_number, reservation_allocations_json, shipment_id, document_ids_json, created_at
       FROM sales_orders
       ORDER BY created_at DESC, id DESC`,
    )
    .all<SalesOrderRow>()
  const orders = (orderRows.results ?? []).map(salesOrderFromRow)
  if (orders.length > 0) {
    serviceState.salesOrderRecords = orders
  } else if (Array.isArray(serviceState.salesOrderRecords) && serviceState.salesOrderRecords.length > 0) {
    await persistSalesOrders(db, serviceState.salesOrderRecords, new Date().toISOString())
  }

  const shipmentRows = await db
    .prepare(
      `SELECT id, order_id, carrier, tracking_number, status, shipped_at, delivered_at,
        weight_grams, allocations_json
       FROM order_shipments
       ORDER BY id DESC`,
    )
    .all<ShipmentRow>()
  const shipments = (shipmentRows.results ?? []).map(shipmentFromRow)
  if (shipments.length > 0) {
    serviceState.shipmentRecords = shipments
  } else if (Array.isArray(serviceState.shipmentRecords) && serviceState.shipmentRecords.length > 0) {
    await persistShipments(db, serviceState.shipmentRecords, new Date().toISOString())
  }

  const documentRows = await db
    .prepare(
      `SELECT id, order_id, type, status, url, created_at
       FROM order_documents
       ORDER BY created_at DESC, id DESC`,
    )
    .all<OrderDocumentRow>()
  const documents = (documentRows.results ?? []).map(orderDocumentFromRow)
  if (documents.length > 0) {
    serviceState.orderDocumentRecords = documents
  } else if (Array.isArray(serviceState.orderDocumentRecords) && serviceState.orderDocumentRecords.length > 0) {
    await persistOrderDocuments(db, serviceState.orderDocumentRecords, new Date().toISOString())
  }
}

async function persistOrderState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistSalesOrders(db, serviceState.salesOrderRecords, updatedAt)
  await persistShipments(db, serviceState.shipmentRecords, updatedAt)
  await persistOrderDocuments(db, serviceState.orderDocumentRecords, updatedAt)
}

async function persistSalesOrders(db: D1Database, orders: SalesOrderRecord[], updatedAt: string) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    orders.map((order) =>
      db
        .prepare(
          `INSERT INTO sales_orders (
            id, sku_id, customer_id, customer, quantity, unit_price, discount_percent,
            tax_percent, shipping_cost, total, currency, reserved_grams, fulfilled_grams, status,
            carrier, tracking_number, reservation_allocations_json, shipment_id,
            document_ids_json, created_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
          ON CONFLICT(id) DO UPDATE SET
            sku_id = excluded.sku_id,
            customer_id = excluded.customer_id,
            customer = excluded.customer,
            quantity = excluded.quantity,
            unit_price = excluded.unit_price,
            discount_percent = excluded.discount_percent,
            tax_percent = excluded.tax_percent,
            shipping_cost = excluded.shipping_cost,
            total = excluded.total,
            currency = excluded.currency,
            reserved_grams = excluded.reserved_grams,
            fulfilled_grams = excluded.fulfilled_grams,
            status = excluded.status,
            carrier = excluded.carrier,
            tracking_number = excluded.tracking_number,
            reservation_allocations_json = excluded.reservation_allocations_json,
            shipment_id = excluded.shipment_id,
            document_ids_json = excluded.document_ids_json,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          order.id,
          order.skuId,
          order.customerId,
          order.customer,
          order.quantity,
          order.unitPrice,
          order.discountPercent,
          order.taxPercent,
          order.shippingCost,
          order.total,
          order.currency,
          order.reservedGrams,
          order.fulfilledGrams,
          order.status,
          order.carrier ?? null,
          order.trackingNumber ?? null,
          order.reservationAllocations ? JSON.stringify(order.reservationAllocations) : null,
          order.shipmentId ?? null,
          order.documentIds ? JSON.stringify(order.documentIds) : null,
          order.createdAt,
          updatedAt,
        ),
    ),
  )
}

async function persistShipments(db: D1Database, shipments: ShipmentRecord[], updatedAt: string) {
  if (!Array.isArray(shipments) || shipments.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    shipments.map((shipment) =>
      db
        .prepare(
          `INSERT INTO order_shipments (
            id, order_id, carrier, tracking_number, status, shipped_at, delivered_at,
            weight_grams, allocations_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          ON CONFLICT(id) DO UPDATE SET
            order_id = excluded.order_id,
            carrier = excluded.carrier,
            tracking_number = excluded.tracking_number,
            status = excluded.status,
            shipped_at = excluded.shipped_at,
            delivered_at = excluded.delivered_at,
            weight_grams = excluded.weight_grams,
            allocations_json = excluded.allocations_json,
            updated_at = excluded.updated_at`,
        )
        .bind(
          shipment.id,
          shipment.orderId,
          shipment.carrier,
          shipment.trackingNumber,
          shipment.status,
          shipment.shippedAt ?? null,
          shipment.deliveredAt ?? null,
          shipment.weightGrams,
          JSON.stringify(shipment.allocations),
          updatedAt,
        ),
    ),
  )
}

async function persistOrderDocuments(db: D1Database, documents: OrderDocumentRecord[], updatedAt: string) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    documents.map((document) =>
      db
        .prepare(
          `INSERT INTO order_documents (id, order_id, type, status, url, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(id) DO UPDATE SET
             order_id = excluded.order_id,
             type = excluded.type,
             status = excluded.status,
             url = excluded.url,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at`,
        )
        .bind(document.id, document.orderId, document.type, document.status, document.url, document.createdAt, updatedAt),
    ),
  )
}

async function hydrateAnalyticsState(db: D1Database, serviceState: ServiceState) {
  const rows = await db
    .prepare(
      `SELECT id, name, cadence, audience, format, status, last_run_at
       FROM scheduled_reports
       ORDER BY id ASC`,
    )
    .all<ScheduledReportRow>()
  const reports = (rows.results ?? []).map(scheduledReportFromRow)
  if (reports.length > 0) {
    serviceState.scheduledReportRecords = reports
  } else if (Array.isArray(serviceState.scheduledReportRecords) && serviceState.scheduledReportRecords.length > 0) {
    await persistScheduledReports(db, serviceState.scheduledReportRecords, new Date().toISOString())
  }
}

async function persistScheduledReports(db: D1Database, reports: ScheduledReportRecord[], updatedAt: string) {
  if (!Array.isArray(reports) || reports.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    reports.map((report) =>
      db
        .prepare(
          `INSERT INTO scheduled_reports (
            id, name, cadence, audience, format, status, last_run_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            cadence = excluded.cadence,
            audience = excluded.audience,
            format = excluded.format,
            status = excluded.status,
            last_run_at = excluded.last_run_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          report.id,
          report.name,
          report.cadence,
          report.audience,
          report.format,
          report.status,
          report.lastRunAt ?? null,
          updatedAt,
        ),
    ),
  )
}

async function hydrateBillingState(db: D1Database, serviceState: ServiceState) {
  const subscriptionRows = await db
    .prepare(
      `SELECT id, organization_id, plan_id, provider, collection_mode, status,
        current_period_start, current_period_end, trial_ends_at, grace_ends_at,
        freeze_reason, provider_customer_id, provider_subscription_id, can_write,
       can_export, next_invoice_at, subscription_updated_at
       FROM billing_subscriptions
       ORDER BY subscription_updated_at DESC, id DESC`,
    )
    .all<BillingSubscriptionRow>()
  const subscriptions = (subscriptionRows.results ?? []).map(billingSubscriptionFromRow)
  if (subscriptions.length > 0) {
    serviceState.subscriptionRecords = subscriptions
  } else if (Array.isArray(serviceState.subscriptionRecords) && serviceState.subscriptionRecords.length > 0) {
    await persistBillingSubscriptions(db, serviceState.subscriptionRecords, new Date().toISOString())
  }

  const invoiceRows = await db
    .prepare(
      `SELECT id, subscription_id, number, status, amount_due, currency, due_at,
        paid_at, hosted_invoice_url, document_id, provider_invoice_id
       FROM billing_invoices
       ORDER BY due_at DESC, id DESC`,
    )
    .all<BillingInvoiceRow>()
  const invoices = (invoiceRows.results ?? []).map(billingInvoiceFromRow)
  if (invoices.length > 0) {
    serviceState.invoiceRecords = invoices
  } else if (Array.isArray(serviceState.invoiceRecords) && serviceState.invoiceRecords.length > 0) {
    await persistBillingInvoices(db, serviceState.invoiceRecords, new Date().toISOString())
  }

  const deliveryRows = await db
    .prepare(
      `SELECT id, webhook_id, event, status, attempts, last_attempt_at, next_retry_at,
        response_code, idempotency_key
       FROM webhook_deliveries
       ORDER BY last_attempt_at DESC, id DESC`,
    )
    .all<WebhookDeliveryRow>()
  const deliveries = (deliveryRows.results ?? []).map(webhookDeliveryFromRow)
  if (deliveries.length > 0) {
    serviceState.webhookDeliveryRecords = deliveries
  } else if (Array.isArray(serviceState.webhookDeliveryRecords) && serviceState.webhookDeliveryRecords.length > 0) {
    await persistWebhookDeliveries(db, serviceState.webhookDeliveryRecords, new Date().toISOString())
  }
}

async function persistBillingState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistBillingSubscriptions(db, serviceState.subscriptionRecords, updatedAt)
  await persistBillingInvoices(db, serviceState.invoiceRecords, updatedAt)
  await persistWebhookDeliveries(db, serviceState.webhookDeliveryRecords, updatedAt)
}

async function persistBillingSubscriptions(db: D1Database, subscriptions: BillingSubscriptionRecord[], updatedAt: string) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    subscriptions.map((subscription) => prepareBillingSubscriptionStatement(db, subscription, updatedAt)),
  )
}

async function persistBillingSubscription(db: D1Database, subscription: BillingSubscriptionRecord, updatedAt: string) {
  if (!subscription) {
    return
  }
  await prepareBillingSubscriptionStatement(db, subscription, updatedAt).run()
}

function prepareBillingSubscriptionStatement(db: D1Database, subscription: BillingSubscriptionRecord, updatedAt: string) {
  return db
    .prepare(
      `INSERT INTO billing_subscriptions (
        id, organization_id, plan_id, provider, collection_mode, status,
        current_period_start, current_period_end, trial_ends_at, grace_ends_at,
        freeze_reason, provider_customer_id, provider_subscription_id, can_write,
        can_export, next_invoice_at, subscription_updated_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
      ON CONFLICT(id) DO UPDATE SET
        organization_id = excluded.organization_id,
        plan_id = excluded.plan_id,
        provider = excluded.provider,
        collection_mode = excluded.collection_mode,
        status = excluded.status,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        trial_ends_at = excluded.trial_ends_at,
        grace_ends_at = excluded.grace_ends_at,
        freeze_reason = excluded.freeze_reason,
        provider_customer_id = excluded.provider_customer_id,
        provider_subscription_id = excluded.provider_subscription_id,
        can_write = excluded.can_write,
        can_export = excluded.can_export,
        next_invoice_at = excluded.next_invoice_at,
        subscription_updated_at = excluded.subscription_updated_at,
        updated_at = excluded.updated_at`,
    )
    .bind(
      subscription.id,
      subscription.organizationId,
      subscription.planId,
      subscription.provider,
      subscription.collectionMode,
      subscription.status,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
      subscription.trialEndsAt ?? null,
      subscription.graceEndsAt ?? null,
      subscription.freezeReason ?? null,
      subscription.providerCustomerId ?? null,
      subscription.providerSubscriptionId ?? null,
      subscription.canWrite ? 1 : 0,
      subscription.canExport ? 1 : 0,
      subscription.nextInvoiceAt,
      subscription.updatedAt,
      updatedAt,
    )
}

async function persistBillingInvoices(db: D1Database, invoices: BillingInvoiceRecord[], updatedAt: string) {
  if (!Array.isArray(invoices) || invoices.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    invoices.map((invoice) =>
      db
        .prepare(
          `INSERT INTO billing_invoices (
            id, subscription_id, number, status, amount_due, currency, due_at,
            paid_at, hosted_invoice_url, document_id, provider_invoice_id, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
          ON CONFLICT(id) DO UPDATE SET
            subscription_id = excluded.subscription_id,
            number = excluded.number,
            status = excluded.status,
            amount_due = excluded.amount_due,
            currency = excluded.currency,
            due_at = excluded.due_at,
            paid_at = excluded.paid_at,
            hosted_invoice_url = excluded.hosted_invoice_url,
            document_id = excluded.document_id,
            provider_invoice_id = excluded.provider_invoice_id,
            updated_at = excluded.updated_at`,
        )
        .bind(
          invoice.id,
          invoice.subscriptionId,
          invoice.number,
          invoice.status,
          invoice.amountDue,
          invoice.currency,
          invoice.dueAt,
          invoice.paidAt ?? null,
          invoice.hostedInvoiceUrl,
          invoice.documentId ?? null,
          invoice.providerInvoiceId ?? null,
          updatedAt,
        ),
    ),
  )
}

async function persistWebhookDeliveries(db: D1Database, deliveries: WebhookDeliveryRecord[], updatedAt: string) {
  if (!Array.isArray(deliveries) || deliveries.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    deliveries.map((delivery) =>
      db
        .prepare(
          `INSERT INTO webhook_deliveries (
            id, webhook_id, event, status, attempts, last_attempt_at, next_retry_at,
            response_code, idempotency_key, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          ON CONFLICT(id) DO UPDATE SET
            webhook_id = excluded.webhook_id,
            event = excluded.event,
            status = excluded.status,
            attempts = excluded.attempts,
            last_attempt_at = excluded.last_attempt_at,
            next_retry_at = excluded.next_retry_at,
            response_code = excluded.response_code,
            idempotency_key = excluded.idempotency_key,
            updated_at = excluded.updated_at`,
        )
        .bind(
          delivery.id,
          delivery.webhookId,
          delivery.event,
          delivery.status,
          delivery.attempts,
          delivery.lastAttemptAt,
          delivery.nextRetryAt ?? null,
          delivery.responseCode ?? null,
          delivery.idempotencyKey,
          updatedAt,
        ),
    ),
  )
}

async function hydrateInventoryState(db: D1Database, serviceState: ServiceState) {
  const lotRows = await db
    .prepare(
      `SELECT id, material_id, lot_number, quantity_grams, reserved_grams, received_date, expiry_date,
        quality_status, location, unit_cost, supplier_lot_ref, currency, retest_date, opened_date,
        shelf_life_after_opening_days, container, packaging, coa_document_id
       FROM inventory_lots
       ORDER BY received_date DESC, id DESC`,
    )
    .all<InventoryLotRow>()
  const lots = (lotRows.results ?? []).map(inventoryLotFromRow)
  if (lots.length > 0) {
    serviceState.lots = lots
  } else if (Array.isArray(serviceState.lots) && serviceState.lots.length > 0) {
    await persistInventoryLots(db, serviceState.lots, new Date().toISOString())
  }

  const movementRows = await db
    .prepare(
      `SELECT id, at, type, direction, material_id, lot_id, quantity_grams, balance_after, ref, actor
       FROM inventory_movements
       ORDER BY at DESC, id DESC`,
    )
    .all<InventoryMovementRow>()
  const movements = (movementRows.results ?? []).map(inventoryMovementFromRow)
  if (movements.length > 0) {
    serviceState.movements = movements
  } else if (Array.isArray(serviceState.movements) && serviceState.movements.length > 0) {
    await persistInventoryMovements(db, serviceState.movements, new Date().toISOString())
  }
}

async function hydrateLabUsageState(db: D1Database, serviceState: ServiceState) {
  const rows = await db
    .prepare(
      `SELECT id, formula_id, formula_code, grams, batch_grams, status, purpose, project_code,
        sample_code, qc_link, allocations_json, weighing_session_json, created_at, reversed_at,
        reversal_movements_json
       FROM lab_usage_records
       ORDER BY created_at DESC, id DESC`,
    )
    .all<LabUsageRecordRow>()
  const usages = (rows.results ?? []).map(labUsageFromRow)
  if (usages.length > 0) {
    serviceState.usageHistory = usages
  } else if (Array.isArray(serviceState.usageHistory) && serviceState.usageHistory.length > 0) {
    await persistLabUsageRecords(db, serviceState.usageHistory, new Date().toISOString())
  }
}

async function persistInventoryLots(db: D1Database, lots: InventoryLot[], updatedAt: string) {
  if (!Array.isArray(lots) || lots.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    lots.map((lot) =>
      db
        .prepare(
          `INSERT INTO inventory_lots (
            id, material_id, lot_number, quantity_grams, reserved_grams, received_date, expiry_date,
            quality_status, location, unit_cost, supplier_lot_ref, currency, retest_date, opened_date,
            shelf_life_after_opening_days, container, packaging, coa_document_id, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
          ON CONFLICT(id) DO UPDATE SET
            material_id = excluded.material_id,
            lot_number = excluded.lot_number,
            quantity_grams = excluded.quantity_grams,
            reserved_grams = excluded.reserved_grams,
            received_date = excluded.received_date,
            expiry_date = excluded.expiry_date,
            quality_status = excluded.quality_status,
            location = excluded.location,
            unit_cost = excluded.unit_cost,
            supplier_lot_ref = excluded.supplier_lot_ref,
            currency = excluded.currency,
            retest_date = excluded.retest_date,
            opened_date = excluded.opened_date,
            shelf_life_after_opening_days = excluded.shelf_life_after_opening_days,
            container = excluded.container,
            packaging = excluded.packaging,
            coa_document_id = excluded.coa_document_id,
            updated_at = excluded.updated_at`,
        )
        .bind(
          lot.id,
          lot.materialId,
          lot.lotNumber,
          lot.quantityGrams,
          lot.reservedGrams,
          lot.receivedDate,
          lot.expiryDate,
          lot.qualityStatus,
          lot.location,
          lot.unitCost,
          lot.supplierLotRef ?? null,
          lot.currency ?? null,
          lot.retestDate ?? null,
          lot.openedDate ?? null,
          lot.shelfLifeAfterOpeningDays ?? null,
          lot.container ?? null,
          lot.packaging ?? null,
          lot.coaDocumentId ?? null,
          updatedAt,
        ),
    ),
  )
}

async function persistInventoryMovements(db: D1Database, movements: InventoryMovement[], updatedAt: string) {
  if (!Array.isArray(movements) || movements.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    movements.map((movement) =>
      db
        .prepare(
          `INSERT INTO inventory_movements (
            id, at, type, direction, material_id, lot_id, quantity_grams, balance_after, ref, actor, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ON CONFLICT(id) DO UPDATE SET
            at = excluded.at,
            type = excluded.type,
            direction = excluded.direction,
            material_id = excluded.material_id,
            lot_id = excluded.lot_id,
            quantity_grams = excluded.quantity_grams,
            balance_after = excluded.balance_after,
            ref = excluded.ref,
            actor = excluded.actor,
            updated_at = excluded.updated_at`,
        )
        .bind(
          movement.id,
          movement.at,
          movement.type,
          movement.direction,
          movement.materialId,
          movement.lotId,
          movement.quantityGrams,
          movement.balanceAfter,
          movement.ref,
          movement.actor,
          updatedAt,
        ),
    ),
  )
}

async function persistLabUsageRecords(db: D1Database, usages: LabUsageRecord[], updatedAt: string) {
  if (!Array.isArray(usages) || usages.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    usages.map((usage) =>
      db
        .prepare(
          `INSERT INTO lab_usage_records (
            id, formula_id, formula_code, grams, batch_grams, status, purpose, project_code,
            sample_code, qc_link, allocations_json, weighing_session_json, created_at, reversed_at,
            reversal_movements_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
          ON CONFLICT(id) DO UPDATE SET
            formula_id = excluded.formula_id,
            formula_code = excluded.formula_code,
            grams = excluded.grams,
            batch_grams = excluded.batch_grams,
            status = excluded.status,
            purpose = excluded.purpose,
            project_code = excluded.project_code,
            sample_code = excluded.sample_code,
            qc_link = excluded.qc_link,
            allocations_json = excluded.allocations_json,
            weighing_session_json = excluded.weighing_session_json,
            created_at = excluded.created_at,
            reversed_at = excluded.reversed_at,
            reversal_movements_json = excluded.reversal_movements_json,
            updated_at = excluded.updated_at`,
        )
        .bind(
          usage.id,
          usage.formulaId,
          usage.formulaCode,
          usage.grams,
          usage.batchGrams,
          usage.status,
          usage.purpose,
          usage.projectCode ?? null,
          usage.sampleCode ?? null,
          usage.qcLink ?? null,
          JSON.stringify(usage.allocations),
          usage.weighingSession ? JSON.stringify(usage.weighingSession) : null,
          usage.createdAt,
          usage.reversedAt ?? null,
          usage.reversalMovements ? JSON.stringify(usage.reversalMovements) : null,
          updatedAt,
        ),
    ),
  )
}

function authSessionFromRow(row: AuthSessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    organizationId: row.organization_id,
    brandId: row.brand_id,
    role: row.role,
    issuedAt: row.issued_at,
    lastSeenAt: row.last_seen_at,
    idleExpiresAt: row.idle_expires_at,
    expiresAt: row.expires_at,
    status: readSessionStatus(row.status),
    mfaVerified: row.mfa_verified === 1,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    deviceId: row.device_id,
    location: row.location,
    csrfToken: row.csrf_token ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    revokedReason: row.revoked_reason ?? undefined,
  }
}

function userSettingsFromRow(row: UserSettingsRow): UserSettingsRecord {
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    email: row.email,
    displayName: row.display_name,
    preferredLanding: readPreferredLanding(row.preferred_landing),
    uiDensity: row.ui_density === 'compact' ? 'compact' : 'comfortable',
    reduceMotion: row.reduce_motion === 1,
    emailDigest: readEmailDigest(row.email_digest),
    updatedAt: row.updated_at,
  }
}

function auditEventFromRow(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    requestId: row.request_id,
    outcome: readAuditOutcome(row.outcome),
  }
}

function organizationFromRow(row: OrganizationRow): OrganizationRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: readOrganizationPlan(row.plan),
    status: readOrganizationStatus(row.status),
    primaryContact: row.primary_contact,
    createdAt: row.created_at,
  }
}

function brandFromRow(row: BrandRow): BrandRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    status: readBrandStatus(row.status),
    defaultCurrency: row.default_currency,
  }
}

function membershipFromRow(row: MembershipRow): MembershipRecord {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    organizationId: row.organization_id,
    brandIds: parseJson<string[]>(row.brand_ids_json, []).filter((brandId): brandId is string => typeof brandId === 'string'),
    role: row.role,
    status: readMembershipStatus(row.status),
    mfaEnabled: row.mfa_enabled === 1,
    lastActiveAt: row.last_active_at,
    invitedAt: row.invited_at ?? undefined,
  }
}

function rolePolicyFromRow(row: RolePolicyRow): RolePolicy {
  return {
    role: row.role,
    scope: readRolePolicyScope(row.scope),
    mfaRequired: row.mfa_required === 1,
    permissions: parseJson<string[]>(row.permissions_json, []).filter(
      (permission): permission is string => typeof permission === 'string',
    ),
  }
}

function tenantSettingsFromRow(row: TenantSettingsRow): TenantSettingsRecord {
  return {
    organizationId: row.organization_id,
    locale: row.locale,
    timezone: row.timezone,
    currency: row.currency,
    defaultUnit: row.default_unit === 'ml' ? 'ml' : 'g',
    defaultDilutionPercent: Number(row.default_dilution_percent),
  }
}

function featureFlagFromRow(row: FeatureFlagRow): FeatureFlagRecord {
  return {
    key: row.flag_key,
    label: row.label,
    enabled: row.enabled === 1,
    phase: Number(row.phase),
  }
}

function numberingSequenceFromRow(row: NumberingSequenceRow): NumberingSequenceRecord {
  return {
    key: row.sequence_key,
    pattern: row.pattern,
    nextValue: Number(row.next_value),
    scope: row.scope === 'brand' ? 'brand' : 'organization',
  }
}

function customFieldFromRow(row: CustomFieldRow): CustomFieldDefinition {
  return {
    id: row.id,
    entity: readCustomFieldEntity(row.entity),
    key: row.field_key,
    label: row.label,
    fieldType: readCustomFieldType(row.field_type),
    required: row.required === 1,
    options: parseJson<string[]>(row.options_json, []).filter((option): option is string => typeof option === 'string'),
    status: row.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
  }
}

function brandingFromRow(row: BrandingRow): BrandingConfig {
  return {
    organizationId: row.organization_id,
    displayName: row.display_name,
    accentColor: row.accent_color,
    documentFooter: row.document_footer,
    labelTemplate: row.label_template,
    logoMode: row.logo_mode === 'monogram' ? 'monogram' : 'wordmark',
  }
}

function documentFromRow(row: DocumentRecordRow): DocumentRecord {
  return {
    id: row.id,
    type: readDocumentType(row.type),
    title: row.title,
    linkedTo: row.linked_to,
    version: row.version,
    sensitivity: readDocumentSensitivity(row.sensitivity),
    status: readDocumentStatus(row.status),
    issueDate: row.issue_date ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    lastAccessed: row.last_accessed,
    downloads: Number(row.downloads),
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    sizeKb: Number(row.size_kb),
    checksum: row.checksum,
    owner: row.owner,
    generatedFrom: row.generated_from ?? undefined,
  }
}

function supplierFromRow(row: SupplierRow): SupplierRecord {
  return {
    id: row.id,
    name: row.name,
    status: readDomainStatus(row.status),
    country: row.country,
    leadTimeDays: Number(row.lead_time_days),
    contactEmail: row.contact_email,
    paymentTerms: row.payment_terms,
    preferredMaterialIds: parseJson<string[]>(row.preferred_material_ids_json, []).filter(
      (materialId): materialId is string => typeof materialId === 'string',
    ),
  }
}

function purchaseOrderFromRow(row: PurchaseOrderRow): PurchaseOrderRecord {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    materialId: row.material_id,
    quantityGrams: Number(row.quantity_grams),
    receivedGrams: Number(row.received_grams),
    status: readPurchaseOrderRecordStatus(row.status),
    expectedDate: row.expected_date,
    unitCost: Number(row.unit_cost),
    currency: row.currency,
    createdAt: row.created_at,
  }
}

function priceHistoryFromRow(row: PriceHistoryRow): PriceHistoryRecord {
  return {
    id: row.id,
    materialId: row.material_id,
    supplierId: row.supplier_id,
    purchaseOrderId: row.purchase_order_id,
    unitCost: Number(row.unit_cost),
    currency: row.currency,
    quantityGrams: Number(row.quantity_grams),
    capturedAt: row.captured_at,
    source: row.source === 'QUOTE' ? 'QUOTE' : 'PO_RECEIPT',
  }
}

function productionBatchFromRow(row: ProductionBatchRow): ProductionBatchRecord {
  return {
    id: row.id,
    formulaId: row.formula_id,
    formulaCode: row.formula_code,
    status: readProductionBatchRecordStatus(row.status),
    targetGrams: Number(row.target_grams),
    consumedGrams: Number(row.consumed_grams),
    qcStatus: readProductionQcStatus(row.qc_status),
    owner: row.owner,
    workOrder: parseJson<ProductionBatchRecord['workOrder']>(row.work_order_json, {
      id: `${row.id}-WO`,
      scheduledStartAt: '',
      dueAt: '',
      equipment: '',
      steps: [],
    }),
    qcChecks: parseJson<ProductionBatchRecord['qcChecks']>(row.qc_checks_json, []),
    yieldGrams: row.yield_grams ?? undefined,
    yieldVariancePercent: row.yield_variance_percent ?? undefined,
    outputLot: row.output_lot_json
      ? parseJson<ProductionBatchRecord['outputLot']>(row.output_lot_json, undefined)
      : undefined,
    genealogy: parseJson<ProductionBatchRecord['genealogy']>(row.genealogy_json, {
      inputLotIds: [],
      inputMovementIds: [],
    }),
  }
}

function commercialSkuFromRow(row: CommercialSkuRow): CommercialSkuRecord {
  return {
    id: row.id,
    materialId: row.material_id,
    name: row.name,
    description: row.description,
    packSizeGrams: Number(row.pack_size_grams),
    price: Number(row.price),
    currency: row.currency,
    tier: readCommercialSkuTier(row.tier),
    status: readCommercialStatus(row.status),
    moqPacks: Number(row.moq_packs),
    labelTemplate: row.label_template,
  }
}

function priceListFromRow(row: PriceListRow): PriceListRecord {
  return {
    id: row.id,
    name: row.name,
    customerGroup: readCustomerGroup(row.customer_group),
    currency: row.currency,
    multiplier: Number(row.multiplier),
    sampleEligible: row.sample_eligible === 1,
    status: readCommercialStatus(row.status),
  }
}

function quoteFromRow(row: QuoteRow): QuoteRecord {
  return {
    id: row.id,
    skuId: row.sku_id,
    customer: row.customer,
    customerGroup: readCustomerGroup(row.customer_group),
    quantityPacks: Number(row.quantity_packs),
    unitPrice: Number(row.unit_price),
    total: Number(row.total),
    currency: row.currency,
    status: readQuoteStatus(row.status),
    createdAt: row.created_at,
  }
}

function sampleRequestFromRow(row: SampleRequestRow): SampleRequestRecord {
  return {
    id: row.id,
    skuId: row.sku_id,
    customer: row.customer,
    packs: Number(row.packs),
    status: readSampleRequestStatus(row.status),
    createdAt: row.created_at,
  }
}

function customerFromRow(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    name: row.name,
    group: readCustomerGroup(row.customer_group),
    creditLimit: Number(row.credit_limit),
    paymentTerms: readPaymentTerms(row.payment_terms),
    contactEmail: row.contact_email,
    billingAddress: parseJson<CustomerRecord['billingAddress']>(row.billing_address_json, {
      id: `${row.id}-BILL`,
      label: 'Billing',
      line1: '',
      city: '',
      country: '',
    }),
    shippingAddress: parseJson<CustomerRecord['shippingAddress']>(row.shipping_address_json, {
      id: `${row.id}-SHIP`,
      label: 'Shipping',
      line1: '',
      city: '',
      country: '',
    }),
    status: readCustomerStatus(row.status),
  }
}

function salesOrderFromRow(row: SalesOrderRow): SalesOrderRecord {
  return {
    id: row.id,
    skuId: row.sku_id,
    customerId: row.customer_id,
    customer: row.customer,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    discountPercent: Number(row.discount_percent),
    taxPercent: Number(row.tax_percent),
    shippingCost: Number(row.shipping_cost),
    total: Number(row.total),
    currency: row.currency,
    reservedGrams: Number(row.reserved_grams),
    fulfilledGrams: Number(row.fulfilled_grams),
    status: readSalesOrderStatus(row.status),
    carrier: row.carrier ? readShipmentCarrier(row.carrier) : undefined,
    trackingNumber: row.tracking_number ?? undefined,
    reservationAllocations: row.reservation_allocations_json
      ? parseJson<NonNullable<SalesOrderRecord['reservationAllocations']>>(row.reservation_allocations_json, [])
      : undefined,
    shipmentId: row.shipment_id ?? undefined,
    documentIds: row.document_ids_json ? parseJson<string[]>(row.document_ids_json, []) : undefined,
    createdAt: row.created_at,
  }
}

function scheduledReportFromRow(row: ScheduledReportRow): ScheduledReportRecord {
  return {
    id: row.id,
    name: row.name,
    cadence: readScheduledReportCadence(row.cadence),
    audience: row.audience,
    format: row.format === 'XLSX' ? 'XLSX' : 'PDF',
    status: row.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
    lastRunAt: row.last_run_at ?? undefined,
  }
}

function billingSubscriptionFromRow(row: BillingSubscriptionRow): BillingSubscriptionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    provider: readBillingProvider(row.provider),
    collectionMode: row.collection_mode === 'hosted_checkout' ? 'hosted_checkout' : 'manual_invoice',
    status: readBillingSubscriptionStatus(row.status),
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    trialEndsAt: row.trial_ends_at ?? undefined,
    graceEndsAt: row.grace_ends_at ?? undefined,
    freezeReason: row.freeze_reason ?? undefined,
    providerCustomerId: row.provider_customer_id ?? undefined,
    providerSubscriptionId: row.provider_subscription_id ?? undefined,
    canWrite: row.can_write === 1,
    canExport: row.can_export === 1,
    nextInvoiceAt: row.next_invoice_at,
    updatedAt: row.subscription_updated_at,
  }
}

function billingInvoiceFromRow(row: BillingInvoiceRow): BillingInvoiceRecord {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    number: row.number,
    status: readBillingInvoiceStatus(row.status),
    amountDue: Number(row.amount_due),
    currency: row.currency,
    dueAt: row.due_at,
    paidAt: row.paid_at ?? undefined,
    hostedInvoiceUrl: row.hosted_invoice_url,
    documentId: row.document_id ?? undefined,
    providerInvoiceId: row.provider_invoice_id ?? undefined,
  }
}

function webhookDeliveryFromRow(row: WebhookDeliveryRow): WebhookDeliveryRecord {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    event: row.event,
    status: readWebhookDeliveryStatus(row.status),
    attempts: Number(row.attempts),
    lastAttemptAt: row.last_attempt_at,
    nextRetryAt: row.next_retry_at ?? undefined,
    responseCode: row.response_code ?? undefined,
    idempotencyKey: row.idempotency_key,
  }
}

function shipmentFromRow(row: ShipmentRow): ShipmentRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    carrier: readShipmentCarrier(row.carrier),
    trackingNumber: row.tracking_number,
    status: readShipmentStatus(row.status),
    shippedAt: row.shipped_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    weightGrams: Number(row.weight_grams),
    allocations: parseJson<ShipmentRecord['allocations']>(row.allocations_json, []),
  }
}

function orderDocumentFromRow(row: OrderDocumentRow): OrderDocumentRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    type: readOrderDocumentType(row.type),
    status: readOrderDocumentStatus(row.status),
    url: row.url,
    createdAt: row.created_at,
  }
}

function inventoryLotFromRow(row: InventoryLotRow): InventoryLot {
  return {
    id: row.id,
    materialId: row.material_id,
    lotNumber: row.lot_number,
    quantityGrams: Number(row.quantity_grams),
    reservedGrams: Number(row.reserved_grams),
    receivedDate: row.received_date,
    expiryDate: row.expiry_date,
    qualityStatus: readLotQualityStatus(row.quality_status),
    location: row.location,
    unitCost: Number(row.unit_cost),
    supplierLotRef: row.supplier_lot_ref ?? undefined,
    currency: row.currency ?? undefined,
    retestDate: row.retest_date ?? undefined,
    openedDate: row.opened_date ?? undefined,
    shelfLifeAfterOpeningDays: row.shelf_life_after_opening_days ?? undefined,
    container: row.container ?? undefined,
    packaging: row.packaging ?? undefined,
    coaDocumentId: row.coa_document_id ?? undefined,
  }
}

function inventoryMovementFromRow(row: InventoryMovementRow): InventoryMovement {
  return {
    id: row.id,
    at: row.at,
    type: readInventoryMovementType(row.type),
    direction: readInventoryMovementDirection(row.direction),
    materialId: row.material_id,
    lotId: row.lot_id,
    quantityGrams: Number(row.quantity_grams),
    balanceAfter: Number(row.balance_after),
    ref: row.ref,
    actor: row.actor,
  }
}

function labUsageFromRow(row: LabUsageRecordRow): LabUsageRecord {
  const reversalMovements = row.reversal_movements_json
    ? parseJson<InventoryMovement[]>(row.reversal_movements_json, []).map((movement) => ({
        ...movement,
        type: readInventoryMovementType(movement.type),
        direction: readInventoryMovementDirection(movement.direction),
      }))
    : undefined
  return {
    id: row.id,
    formulaId: row.formula_id,
    formulaCode: row.formula_code,
    grams: Number(row.grams),
    batchGrams: Number(row.batch_grams),
    status: row.status === 'REVERSED' ? 'REVERSED' : 'COMMITTED',
    purpose: readLabUsagePurpose(row.purpose),
    projectCode: row.project_code ?? undefined,
    sampleCode: row.sample_code ?? undefined,
    qcLink: row.qc_link ?? undefined,
    allocations: parseJson<LabUsageRecord['allocations']>(row.allocations_json, []),
    weighingSession: row.weighing_session_json ? parseJson<LabUsageRecord['weighingSession']>(row.weighing_session_json, undefined) : undefined,
    createdAt: row.created_at,
    reversedAt: row.reversed_at ?? undefined,
    reversalMovements,
  }
}

function readSessionStatus(value: string): AuthSession['status'] {
  if (value === 'ACTIVE' || value === 'REVOKED' || value === 'EXPIRED') {
    return value
  }
  return 'EXPIRED'
}

function readPreferredLanding(value: string): UserSettingsRecord['preferredLanding'] {
  if (
    value === 'dashboard' ||
    value === 'platform' ||
    value === 'identity' ||
    value === 'customization' ||
    value === 'materials' ||
    value === 'formulas' ||
    value === 'inventory' ||
    value === 'labUsage' ||
    value === 'documents' ||
    value === 'production' ||
    value === 'procurement' ||
    value === 'commerce' ||
    value === 'orders' ||
    value === 'costing' ||
    value === 'analytics' ||
    value === 'saas'
  ) {
    return value
  }
  return 'dashboard'
}

function readEmailDigest(value: string): UserSettingsRecord['emailDigest'] {
  if (value === 'off' || value === 'daily' || value === 'weekly') {
    return value
  }
  return 'weekly'
}

function readAuditOutcome(value: string): AuditEvent['outcome'] {
  if (value === 'allowed' || value === 'blocked' || value === 'review') {
    return value
  }
  return 'review'
}

function readOrganizationPlan(value: string): OrganizationRecord['plan'] {
  if (value === 'Free' || value === 'Pro' || value === 'Team' || value === 'Enterprise') {
    return value
  }
  return 'Team'
}

function readOrganizationStatus(value: string): OrganizationRecord['status'] {
  if (value === 'ACTIVE' || value === 'FROZEN' || value === 'SUSPENDED') {
    return value
  }
  return 'ACTIVE'
}

function readBrandStatus(value: string): BrandRecord['status'] {
  if (value === 'ACTIVE' || value === 'ARCHIVED') {
    return value
  }
  return 'ACTIVE'
}

function readMembershipStatus(value: string): MembershipRecord['status'] {
  if (value === 'ACTIVE' || value === 'INVITED' || value === 'DEACTIVATED') {
    return value
  }
  return 'INVITED'
}

function readRolePolicyScope(value: string): RolePolicy['scope'] {
  if (value === 'organization' || value === 'platform') {
    return value
  }
  return 'organization'
}

function readDomainStatus(value: string): DomainStatus {
  if (value === 'stable' || value === 'active' || value === 'testing' || value === 'review' || value === 'draft' || value === 'alert') {
    return value
  }
  return 'review'
}

function readCustomFieldEntity(value: string): CustomFieldDefinition['entity'] {
  if (value === 'material' || value === 'formula' || value === 'lot' || value === 'document' || value === 'supplier' || value === 'order') {
    return value
  }
  return 'material'
}

function readCustomFieldType(value: string): CustomFieldDefinition['fieldType'] {
  if (value === 'text' || value === 'number' || value === 'select' || value === 'date' || value === 'boolean') {
    return value
  }
  return 'text'
}

function readDocumentType(value: string): DocumentRecord['type'] {
  if (
    value === 'SDS' ||
    value === 'CoA' ||
    value === 'IFRA' ||
    value === 'Invoice' ||
    value === 'Formula Export' ||
    value === 'Batch Record' ||
    value === 'Allergen Declaration' ||
    value === 'GHS Label' ||
    value === 'Formula Spec Sheet' ||
    value === 'Finished Product SDS'
  ) {
    return value
  }
  return 'SDS'
}

function readDocumentSensitivity(value: string): DocumentRecord['sensitivity'] {
  if (value === 'Internal' || value === 'Confidential' || value === 'Highly Confidential') {
    return value
  }
  return 'Confidential'
}

function readDocumentStatus(value: string): DocumentRecord['status'] {
  if (value === 'APPROVED' || value === 'REVIEW_REQUIRED' || value === 'EXPIRING' || value === 'EXPIRED' || value === 'SHARED') {
    return value
  }
  return 'REVIEW_REQUIRED'
}

function readPurchaseOrderRecordStatus(value: string): PurchaseOrderRecord['status'] {
  if (value === 'DRAFT' || value === 'SENT' || value === 'PARTIAL' || value === 'RECEIVED') {
    return value
  }
  return 'DRAFT'
}

function readCommercialSkuTier(value: string): CommercialSkuRecord['tier'] {
  if (value === 'Studio' || value === 'Lab' || value === 'Bulk') {
    return value
  }
  return 'Studio'
}

function readCommercialStatus(value: string): CommercialSkuRecord['status'] {
  if (value === 'DRAFT' || value === 'ACTIVE' || value === 'ARCHIVED') {
    return value
  }
  return 'DRAFT'
}

function readCustomerGroup(value: string): PriceListRecord['customerGroup'] {
  if (value === 'Studio' || value === 'Lab' || value === 'Bulk' || value === 'Contract') {
    return value
  }
  return 'Studio'
}

function readQuoteStatus(value: string): QuoteRecord['status'] {
  if (value === 'DRAFT' || value === 'REVIEW' || value === 'SENT') {
    return value
  }
  return 'REVIEW'
}

function readSampleRequestStatus(value: string): SampleRequestRecord['status'] {
  if (value === 'REQUESTED' || value === 'APPROVED' || value === 'CONVERTED') {
    return value
  }
  return 'REQUESTED'
}

function readPaymentTerms(value: string): CustomerRecord['paymentTerms'] {
  if (value === 'NET_15' || value === 'NET_30' || value === 'PREPAID') {
    return value
  }
  return 'PREPAID'
}

function readCustomerStatus(value: string): CustomerRecord['status'] {
  if (value === 'ACTIVE' || value === 'CREDIT_HOLD' || value === 'ARCHIVED') {
    return value
  }
  return 'ACTIVE'
}

function readProductionBatchRecordStatus(value: string): ProductionBatchRecord['status'] {
  if (
    value === 'PLANNED' ||
    value === 'WEIGHING' ||
    value === 'MACERATION' ||
    value === 'FILTRATION' ||
    value === 'QC' ||
    value === 'BOTTLING' ||
    value === 'RELEASED' ||
    value === 'HOLD'
  ) {
    return value
  }
  return 'HOLD'
}

function readProductionQcStatus(value: string): ProductionBatchRecord['qcStatus'] {
  if (value === 'PENDING' || value === 'PASSED' || value === 'FAILED') {
    return value
  }
  return 'PENDING'
}

function readSalesOrderStatus(value: string): SalesOrderRecord['status'] {
  if (
    value === 'DRAFT' ||
    value === 'CONFIRMED' ||
    value === 'RESERVED' ||
    value === 'BACKORDER' ||
    value === 'PICKING' ||
    value === 'PACKED' ||
    value === 'SHIPPED' ||
    value === 'FULFILLED' ||
    value === 'DELIVERED' ||
    value === 'INVOICED' ||
    value === 'CLOSED' ||
    value === 'CANCELLED' ||
    value === 'HOLD'
  ) {
    return value
  }
  return 'HOLD'
}

function readShipmentCarrier(value: string): ShipmentRecord['carrier'] {
  if (value === 'DHL' || value === 'FedEx' || value === 'UPS' || value === 'Pickup') {
    return value
  }
  return 'DHL'
}

function readShipmentStatus(value: string): ShipmentRecord['status'] {
  if (value === 'PICKING' || value === 'PACKED' || value === 'SHIPPED' || value === 'DELIVERED') {
    return value
  }
  return 'PICKING'
}

function readOrderDocumentType(value: string): OrderDocumentRecord['type'] {
  if (value === 'PICK_LIST' || value === 'PACKING_SLIP' || value === 'INVOICE' || value === 'COA') {
    return value
  }
  return 'PICK_LIST'
}

function readOrderDocumentStatus(value: string): OrderDocumentRecord['status'] {
  if (value === 'DRAFT' || value === 'READY' || value === 'SENT') {
    return value
  }
  return 'DRAFT'
}

function readScheduledReportCadence(value: string): ScheduledReportRecord['cadence'] {
  if (value === 'DAILY' || value === 'WEEKLY' || value === 'MONTHLY') {
    return value
  }
  return 'WEEKLY'
}

function readBillingProvider(value: string): BillingSubscriptionRecord['provider'] {
  if (value === 'manual' || value === 'paddle' || value === 'stripe') {
    return value
  }
  return 'manual'
}

function readBillingSubscriptionStatus(value: string): BillingSubscriptionRecord['status'] {
  if (
    value === 'trialing' ||
    value === 'active' ||
    value === 'past_due' ||
    value === 'grace' ||
    value === 'frozen' ||
    value === 'canceled'
  ) {
    return value
  }
  return 'past_due'
}

function readBillingInvoiceStatus(value: string): BillingInvoiceRecord['status'] {
  if (value === 'draft' || value === 'open' || value === 'paid' || value === 'void' || value === 'uncollectible') {
    return value
  }
  return 'draft'
}

function readWebhookDeliveryStatus(value: string): WebhookDeliveryRecord['status'] {
  if (value === 'delivered' || value === 'retrying' || value === 'failed') {
    return value
  }
  return 'retrying'
}

function readLotQualityStatus(value: string): InventoryLot['qualityStatus'] {
  if (value === 'APPROVED' || value === 'QUARANTINE' || value === 'ON_HOLD' || value === 'REJECTED' || value === 'EXPIRED') {
    return value
  }
  return 'QUARANTINE'
}

function readInventoryMovementType(value: string): InventoryMovement['type'] {
  if (
    value === 'RECEIPT' ||
    value === 'LAB_CONSUMPTION' ||
    value === 'REVERSAL' ||
    value === 'PRODUCTION_CONSUMPTION' ||
    value === 'FULFILLMENT' ||
    value === 'ADJUSTMENT' ||
    value === 'TRANSFER'
  ) {
    return value
  }
  return 'ADJUSTMENT'
}

function readInventoryMovementDirection(value: string): InventoryMovement['direction'] {
  if (value === 'IN' || value === 'OUT' || value === 'MOVE') {
    return value
  }
  return 'OUT'
}

function readLabUsagePurpose(value: string): LabUsageRecord['purpose'] {
  if (value === 'trial' || value === 'sample' || value === 'production-prep' || value === 'qc' || value === 'waste') {
    return value
  }
  return 'trial'
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function parseJsonOptional<T>(value: string | null | undefined): T | undefined {
  if (!value) {
    return undefined
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

async function runStatementBatches(db: D1Database, statements: D1PreparedStatement[], batchSize = 50) {
  for (let index = 0; index < statements.length; index += batchSize) {
    await db.batch(statements.slice(index, index + batchSize))
  }
}

function maxAuditCounter(events: AuditEvent[]) {
  if (!Array.isArray(events)) {
    return 0
  }
  return events.reduce((max, event) => Math.max(max, trailingNumber(event.id), trailingNumber(event.requestId)), 0)
}

function trailingNumber(value: string) {
  const match = value.match(/(\d+)$/)
  return match ? Number(match[1]) : 0
}

function buildCorsHeaders(origin: string | null, configuredOrigins: string | undefined) {
  const allowedOrigins = parseCsv(configuredOrigins)
  const effectiveOrigins = allowedOrigins.length > 0 ? allowedOrigins : LOCAL_CORS_ORIGINS
  const allowedOrigin = origin && isAllowedCorsOrigin(origin, effectiveOrigins) ? origin : effectiveOrigins[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
}

function buildResponseHeaders(headers: HeadersInit, route: Route, result: unknown) {
  const responseHeaders = { ...(headers as Record<string, string>) }
  if (route.sessionCookie === 'set') {
    const sessionId = readResultSessionId(result)
    if (sessionId) {
      responseHeaders['Set-Cookie'] = buildSessionCookie(sessionId, tenantSessionCookieMaxAgeSeconds)
    }
  }
  if (route.sessionCookie === 'clear') {
    responseHeaders['Set-Cookie'] = buildSessionCookie('', 0)
  }
  return responseHeaders
}

const tenantSessionCookieMaxAgeSeconds = 8 * 60 * 60

function readResultSessionId(result: unknown) {
  if (!isRecord(result) || !isRecord(result.data) || !isRecord(result.data.session)) {
    return undefined
  }
  return typeof result.data.session.id === 'string' ? result.data.session.id : undefined
}

function buildSessionCookie(value: string, maxAgeSeconds: number) {
  return `oo_session=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=None`
}

function isAllowedCorsOrigin(origin: string, allowedOrigins: string[]) {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin === origin) {
      return true
    }
    if (!allowedOrigin.includes('*')) {
      return false
    }
    return wildcardOriginMatches(origin, allowedOrigin)
  })
}

function wildcardOriginMatches(origin: string, allowedOrigin: string) {
  try {
    const parsedOrigin = new URL(origin)
    const parsedAllowed = new URL(allowedOrigin.replace('*.', 'wildcard.'))
    const allowedHost = parsedAllowed.hostname.replace(/^wildcard\./, '')

    return (
      parsedOrigin.protocol === parsedAllowed.protocol &&
      parsedOrigin.hostname.endsWith(`.${allowedHost}`) &&
      !parsedOrigin.username &&
      !parsedOrigin.password &&
      parsedOrigin.port === parsedAllowed.port
    )
  } catch {
    return false
  }
}

function parseCsv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function json(payload: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  })
}

function errorJson(error: unknown, headers: HeadersInit) {
  const candidate = error as {
    getStatus?: () => number
    getResponse?: () => unknown
    status?: number
    statusCode?: number
    message?: string
  }
  const status = candidate.getStatus?.() ?? candidate.status ?? candidate.statusCode ?? 500
  const response = candidate.getResponse?.()
  const payload =
    typeof response === 'string'
      ? { message: response, statusCode: status }
      : isRecord(response)
        ? { statusCode: status, ...response }
        : { message: candidate.message ?? 'Unexpected worker API error', statusCode: status }
  return json(payload, status, headers)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
