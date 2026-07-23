import { NorthStarService, type MfaEnrollmentRecord, type PasswordResetRecord } from '../server/src/services/northstar.service.js'
import {
  PayloadTooLargeException,
  ForbiddenException,
  TooManyRequestsException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '../server/src/shared/http-error.js'
import {
  memberships as seedMemberships,
  createDefaultFormulaWorkspacePreferences,
  normalizeFormulaWorkspacePreferences,
  organizations as seedOrganizations,
  rolePolicies as seedRolePolicies,
  userSettings as seedUserSettings,
  type ApiKeyRecord,
  type AppNotificationRecord,
  type AuditEvent,
  type AuditExportJobRecord,
  type AuthSession,
  type BillingInvoiceRecord,
  type BillingSubscriptionRecord,
  type BrandRecord,
  type BrandingConfig,
  type CommercialSkuRecord,
  type CustomFieldDefinition,
  type DocumentRecord,
  type FeatureFlagRecord,
  type Formula,
  type FormulaVersionRecord,
  type InventoryLot,
  type InventoryMovement,
  type LabUsageRecord,
  type MembershipRecord,
  type Material,
  type MoleculeComponent,
  type NumberingSequenceRecord,
  type OrderDocumentRecord,
  type OrganizationRecord,
  type PriceHistoryRecord,
  type PriceListRecord,
  type ProductionBatchRecord,
  type PurchaseOrderRecord,
  type QuoteRecord,
  type RolePolicy,
  type SaasCustomDomainRecord,
  type SampleRequestRecord,
  type SalesOrderRecord,
  type ScheduledReportRecord,
  type ShipmentRecord,
  type SsoConfigRecord,
  type StockTakeRecord,
  type StorageLocation,
  type SupplierRecord,
  type TenantSettingsRecord,
  type UserSettingsRecord,
  type WebhookRecord,
  type WebhookDeliveryRecord,
  type CustomerRecord,
  type DataImportJobRecord,
  type DomainStatus,
  type LegalAcceptanceRecord,
  type PrivacyRequestRecord,
} from '../src/data/northStar.js'

type Env = {
  DB: D1Database
  CORS_ORIGINS?: string
  SEEDED_ADMIN_PASSWORD_HASH?: string
  MFA_ENCRYPTION_KEY?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_ARTISAN?: string
  STRIPE_PRICE_ATELIER?: string
  STRIPE_PRICE_MAISON?: string
  BILLING_RETURN_URL?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  SENTRY_DSN?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_SAAS_ZONE_ID?: string
  CLOUDFLARE_SAAS_ORIGIN?: string
}

type RouteContext = {
  service: NorthStarService
  params: Record<string, string>
  query: URLSearchParams
  body: Record<string, unknown>
  rawBody?: string
  env: Env
  request: Request
}

type Route = {
  method: string
  pattern: string
  public?: boolean
  hydrateState?: boolean
  sessionCookie?: 'set' | 'clear'
  mutates?: boolean
  rateLimit?: RateLimitPolicy
  limitKey?: 'seats' | 'materials' | 'formulas' | 'lots' | 'documents' | 'webhooks'
  writeGate?: boolean
  persistScope?: 'userSettings' | 'mfaVerification'
  rawBody?: boolean
  handler: (context: RouteContext) => unknown
}

type AuthCredential = {
  sessionId?: string
  source: 'cookie' | 'bearer' | 'none'
}

type RateLimitPolicy = {
  key: 'auth-login' | 'auth-signup' | 'auth-reset' | 'authenticated-mutation' | 'sensitive-mutation'
  scope: 'client-email' | 'client' | 'session'
  limit: number
  windowSeconds: number
  message: string
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
  | 'authCredentialRecords'
  | 'passwordResetRecords'
  | 'mfaEnrollmentRecords'
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
  | 'ssoConfigRecords'
  | 'apiKeyRecords'
  | 'webhookRecords'
  | 'webhookDeliveryRecords'
  | 'auditExportRecords'
  | 'notificationRecords'
  | 'importJobRecords'
  | 'legalAcceptanceRecords'
  | 'privacyRequestRecords'
  | 'customDomainRecords'
  | 'inventoryApprovalRequestRecords'
  | 'operationApprovalRequestRecords'
  | 'auditCounter'

type ServiceState = Record<SnapshotKey, unknown> & {
  sessions: AuthSession[]
  userSettingsRecords: UserSettingsRecord[]
  auditEvents: AuditEvent[]
  organizationRecords: OrganizationRecord[]
  brandRecords: BrandRecord[]
  membershipRecords: MembershipRecord[]
  authCredentialRecords: Array<Record<string, unknown>>
  passwordResetRecords: PasswordResetRecord[]
  mfaEnrollmentRecords: MfaEnrollmentRecord[]
  rolePolicyRecords: RolePolicy[]
  materialRecords: Material[]
  moleculeRecords: MoleculeComponent[]
  locationRecords: StorageLocation[]
  stockTakeRecords: StockTakeRecord[]
  formulaRecords: Formula[]
  formulaVersionRecords: FormulaVersionRecord[]
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
  ssoConfigRecords: SsoConfigRecord[]
  apiKeyRecords: ApiKeyRecord[]
  webhookRecords: WebhookRecord[]
  webhookDeliveryRecords: WebhookDeliveryRecord[]
  auditExportRecords: AuditExportJobRecord[]
  notificationRecords: AppNotificationRecord[]
  importJobRecords: DataImportJobRecord[]
  legalAcceptanceRecords: LegalAcceptanceRecord[]
  privacyRequestRecords: PrivacyRequestRecord[]
  customDomainRecords: SaasCustomDomainRecord[]
  inventoryApprovalRequestRecords: Array<Record<string, unknown>>
  operationApprovalRequestRecords: Array<Record<string, unknown>>
  lots: InventoryLot[]
  movements: InventoryMovement[]
  usageHistory: LabUsageRecord[]
  auditCounter: number
}

const API_PREFIX = '/api/v1'
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024
const authenticatedMutationRateLimit: RateLimitPolicy = {
  key: 'authenticated-mutation',
  scope: 'session',
  limit: 90,
  windowSeconds: 60,
  message: 'Request rate limit exceeded',
}
const sensitiveMutationRateLimit: RateLimitPolicy = {
  key: 'sensitive-mutation',
  scope: 'session',
  limit: 12,
  windowSeconds: 15 * 60,
  message: 'Sensitive operation rate limit exceeded',
}
const LOCAL_CORS_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173']
const SNAPSHOT_CACHE_TTL_MS = 2_000
const WORKSPACE_BRANDING_CACHE_TTL_MS = 2_000
let persistenceReadyPromise: Promise<void> | undefined
let snapshotCacheFlight: Promise<CachedSnapshotState> | null = null
let snapshotCache: CachedSnapshotState | null = null
const workspaceBrandingCache = new Map<string, { loadedAt: number; branding: BrandingConfig }>()

type CachedSnapshotState = {
  loadedAt: number
  updatedAt: string
  state: ServiceState
}

const NORMALIZED_STATE_KEYS = new Set<SnapshotKey>([
  'sessions',
  'mfaEnrollmentRecords',
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
  'formulaRecords',
  'formulaVersionRecords',
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
  'ssoConfigRecords',
  'apiKeyRecords',
  'webhookRecords',
  'webhookDeliveryRecords',
  'auditExportRecords',
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
  'authCredentialRecords',
  'passwordResetRecords',
  'mfaEnrollmentRecords',
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
  'ssoConfigRecords',
  'apiKeyRecords',
  'webhookRecords',
  'webhookDeliveryRecords',
  'auditExportRecords',
  'notificationRecords',
  'importJobRecords',
  'legalAcceptanceRecords',
  'privacyRequestRecords',
  'customDomainRecords',
  'inventoryApprovalRequestRecords',
  'operationApprovalRequestRecords',
  'auditCounter',
]
const SNAPSHOT_KEY_SET = new Set<SnapshotKey>(SNAPSHOT_KEYS)
const SNAPSHOT_PERSIST_KEYS = SNAPSHOT_KEYS.filter((key) => !NORMALIZED_STATE_KEYS.has(key))
const SEEDED_ADMIN_EMAIL = 'admin@labofscents.org'
const SEEDED_ADMIN_ORGANIZATION_ID = 'org-nxl'
const SEEDED_ADMIN_ROLE = 'Admin'
const SEEDED_ADMIN_PASSWORD_SET_AT = '2026-07-16T00:00:00.000Z'
const NORMALIZED_TABLES = [
  'auth_sessions',
  'mfa_enrollments',
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
  'formula_records',
  'formula_version_records',
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
  'sso_configs',
  'api_keys',
  'webhooks',
  'webhook_deliveries',
  'audit_export_jobs',
  'inventory_lots',
  'inventory_movements',
  'lab_usage_records',
]

const routes: Route[] = [
  { method: 'GET', pattern: '/health', public: true, hydrateState: false, handler: () => ({ ok: true, service: 'olfactoryops-worker-api', version: '0.1.0-cloudflare-d1', timestamp: new Date().toISOString() }) },
  { method: 'GET', pattern: '/status', public: true, hydrateState: false, handler: ({ env }) => publicStatus(env) },
  { method: 'GET', pattern: '/version', public: true, hydrateState: false, handler: () => ({ data: { name: 'OlfactoryOps Cloudflare Worker API', stack: ['Cloudflare Workers', 'D1', 'TypeScript'], api: API_PREFIX } }) },
  { method: 'GET', pattern: '/persistence/status', handler: ({ service }) => service.persistenceStatus({ adapter: 'cloudflare-d1-hybrid', snapshotKeys: SNAPSHOT_PERSIST_KEYS.length, snapshotTable: 'northstar_snapshots', normalizedTables: NORMALIZED_TABLES }) },
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
  { method: 'POST', pattern: '/imports/preview', mutates: true, rateLimit: sensitiveMutationRateLimit, handler: ({ service, body }) => service.previewImport(body) },
  { method: 'POST', pattern: '/imports/:id/commit', mutates: true, rateLimit: sensitiveMutationRateLimit, handler: ({ service, params }) => service.commitImport(params.id) },
  { method: 'GET', pattern: '/formulas', handler: ({ service }) => service.formulas() },
  { method: 'POST', pattern: '/formulas', mutates: true, limitKey: 'formulas', handler: ({ service, body }) => service.createFormulaDraft(body) },
  { method: 'PATCH', pattern: '/formulas/:id', mutates: true, handler: ({ service, params, body }) => service.updateFormulaDraft(params.id, body) },
  { method: 'POST', pattern: '/formulas/:id/fork', mutates: true, limitKey: 'formulas', handler: ({ service, params, body }) => service.forkFormula(params.id, body) },
  { method: 'POST', pattern: '/formulas/:id/lines', mutates: true, handler: ({ service, params, body }) => service.addFormulaLine(params.id, body) },
  { method: 'PATCH', pattern: '/formulas/:id/lines/:lineId', mutates: true, handler: ({ service, params, body }) => service.updateFormulaLine(params.id, params.lineId, body) },
  { method: 'DELETE', pattern: '/formulas/:id/lines/:lineId', mutates: true, handler: ({ service, params }) => service.deleteFormulaLine(params.id, params.lineId) },
  { method: 'POST', pattern: '/formulas/:id/lines/:lineId/move', mutates: true, handler: ({ service, params, body }) => service.moveFormulaLine(params.id, params.lineId, body) },
  { method: 'POST', pattern: '/formulas/:id/scale/apply', mutates: true, handler: ({ service, params, body }) => service.applyFormulaScale(params.id, body) },
  { method: 'GET', pattern: '/formulas/:id/resolve', handler: ({ service, params }) => service.resolveFormula(params.id) },
  { method: 'GET', pattern: '/formulas/:id/cost', handler: ({ service, params }) => service.formulaCost(params.id) },
  { method: 'GET', pattern: '/formulas/:id/ifra-check', handler: ({ service, params }) => service.formulaIfra(params.id) },
  { method: 'GET', pattern: '/formulas/:id/evaporation', handler: ({ service, params }) => service.formulaEvaporation(params.id) },
  { method: 'POST', pattern: '/formulas/:id/scale', handler: ({ service, params, body }) => service.formulaScale(params.id, body) },
  { method: 'GET', pattern: '/formulas/:id/versions', handler: ({ service, params }) => service.formulaVersions(params.id) },
  { method: 'POST', pattern: '/formulas/:id/versions', mutates: true, handler: ({ service, params, body }) => service.createFormulaVersion(params.id, body) },
  { method: 'GET', pattern: '/formulas/:id/versions/diff', handler: ({ service, params, query }) => service.formulaVersionDiff(params.id, query.get('from') ?? undefined, query.get('to') ?? undefined) },
  { method: 'POST', pattern: '/formulas/:id/versions/:version/evaluations', mutates: true, handler: ({ service, params, body }) => service.addFormulaEvaluation(params.id, params.version, body) },
  { method: 'POST', pattern: '/formulas/:id/review', mutates: true, handler: ({ service, params, body }) => service.submitFormulaForReview(params.id, body) },
  { method: 'POST', pattern: '/formulas/:id/reject', mutates: true, handler: ({ service, params, body }) => service.rejectFormula(params.id, body) },
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
  { method: 'GET', pattern: '/inventory/approval-requests', handler: ({ service }) => service.inventoryApprovalRequests() },
  { method: 'POST', pattern: '/inventory/approval-requests', mutates: true, writeGate: false, handler: ({ service, body }) => service.requestInventoryApproval(body) },
  { method: 'POST', pattern: '/inventory/approval-requests/:id/approve', mutates: true, handler: ({ service, params, body }) => service.approveInventoryApprovalRequest(params.id, body) },
  { method: 'POST', pattern: '/inventory/approval-requests/:id/reject', mutates: true, handler: ({ service, params, body }) => service.rejectInventoryApprovalRequest(params.id, body) },
  { method: 'GET', pattern: '/approval-requests', handler: ({ service }) => service.operationApprovalRequests() },
  { method: 'POST', pattern: '/approval-requests', mutates: true, writeGate: false, handler: ({ service, body }) => service.requestOperationApproval(body) },
  { method: 'POST', pattern: '/approval-requests/:id/approve', mutates: true, handler: ({ service, params, body }) => service.approveOperationApprovalRequest(params.id, body) },
  { method: 'POST', pattern: '/approval-requests/:id/reject', mutates: true, handler: ({ service, params, body }) => service.rejectOperationApprovalRequest(params.id, body) },
  { method: 'POST', pattern: '/auth/login', public: true, sessionCookie: 'set', mutates: true, writeGate: false, rateLimit: { key: 'auth-login', scope: 'client-email', limit: 8, windowSeconds: 10 * 60, message: 'Authentication rate limit exceeded' }, handler: ({ service, body }) => service.login(typeof body.email === 'string' ? body.email : undefined, typeof body.password === 'string' ? body.password : undefined) },
  { method: 'POST', pattern: '/auth/password-reset/request', public: true, mutates: true, writeGate: false, rateLimit: { key: 'auth-reset', scope: 'client-email', limit: 5, windowSeconds: 60 * 60, message: 'Password reset rate limit exceeded' }, handler: ({ service, body, env, request }) => startPasswordReset(service, body, env, request) },
  { method: 'POST', pattern: '/auth/password-reset/confirm', public: true, mutates: true, writeGate: false, rateLimit: { key: 'auth-reset', scope: 'client', limit: 8, windowSeconds: 60 * 60, message: 'Password reset rate limit exceeded' }, handler: ({ service, body }) => service.completePasswordReset({ token: typeof body.token === 'string' ? body.token : undefined, password: typeof body.password === 'string' ? body.password : undefined }) },
  { method: 'POST', pattern: '/auth/signup', public: true, sessionCookie: 'set', mutates: true, writeGate: false, rateLimit: { key: 'auth-signup', scope: 'client', limit: 4, windowSeconds: 60 * 60, message: 'Signup rate limit exceeded' }, handler: ({ service, body }) => service.signup(body) },
  { method: 'GET', pattern: '/auth/mfa/status', writeGate: false, handler: ({ service }) => service.mfaStatus() },
  { method: 'POST', pattern: '/auth/mfa/enroll', mutates: true, writeGate: false, rateLimit: sensitiveMutationRateLimit, handler: ({ service, body }) => service.beginMfaEnrollment(body) },
  { method: 'POST', pattern: '/auth/mfa/verify', mutates: true, writeGate: false, persistScope: 'mfaVerification', rateLimit: sensitiveMutationRateLimit, handler: ({ service, body }) => service.verifyMfa(body) },
  { method: 'POST', pattern: '/auth/logout', sessionCookie: 'clear', mutates: true, writeGate: false, handler: ({ service }) => service.logout() },
  { method: 'GET', pattern: '/me', handler: ({ service }) => service.me() },
  { method: 'GET', pattern: '/search', handler: ({ service, query }) => service.globalSearch(query.get('q') ?? '') },
  { method: 'GET', pattern: '/notifications', handler: ({ service }) => service.notifications() },
  { method: 'POST', pattern: '/notifications/refresh', mutates: true, writeGate: false, handler: ({ service }) => service.refreshOperationalNotifications() },
  { method: 'POST', pattern: '/notifications/read-all', mutates: true, writeGate: false, handler: ({ service }) => service.markAllNotificationsRead() },
  { method: 'POST', pattern: '/notifications/:id/read', mutates: true, writeGate: false, handler: ({ service, params }) => service.markNotificationRead(params.id) },
  { method: 'GET', pattern: '/legal/status', handler: ({ service }) => service.legalStatus() },
  { method: 'POST', pattern: '/legal/accept', mutates: true, writeGate: false, handler: ({ service, body }) => service.acceptLegal(body) },
  { method: 'GET', pattern: '/privacy/requests', handler: ({ service }) => service.privacyRequests() },
  { method: 'POST', pattern: '/privacy/requests', mutates: true, writeGate: false, rateLimit: sensitiveMutationRateLimit, handler: ({ service, body }) => service.requestPrivacyData(body) },
  { method: 'POST', pattern: '/privacy/requests/:id/export', mutates: true, writeGate: false, rateLimit: sensitiveMutationRateLimit, handler: ({ service, params }) => service.exportPrivacyData(params.id) },
  { method: 'GET', pattern: '/user/settings', handler: ({ service }) => service.userSettings() },
  { method: 'PATCH', pattern: '/user/settings', mutates: true, writeGate: false, persistScope: 'userSettings', handler: ({ service, body }) => service.updateUserSettings(body) },
  { method: 'GET', pattern: '/audit-logs', handler: ({ service }) => service.auditLogs() },
  { method: 'GET', pattern: '/security/policy', handler: ({ service }) => service.securityPolicy() },
  { method: 'GET', pattern: '/security/tenant-console', handler: ({ service }) => service.tenantConsole() },
  { method: 'GET', pattern: '/security/member-summary', handler: ({ service }) => service.memberSummary() },
  { method: 'POST', pattern: '/security/members/invite', mutates: true, rateLimit: sensitiveMutationRateLimit, limitKey: 'seats', handler: ({ service, body }) => service.inviteMember(body) },
  { method: 'PATCH', pattern: '/security/members/:id/status', mutates: true, rateLimit: sensitiveMutationRateLimit, handler: ({ service, params, body }) => service.setMembershipStatus(params.id, body.status === 'ACTIVE' ? 'ACTIVE' : 'DEACTIVATED') },
  { method: 'POST', pattern: '/security/sessions/:id/revoke', mutates: true, rateLimit: sensitiveMutationRateLimit, handler: ({ service, params }) => service.revokeSession(params.id) },
  { method: 'POST', pattern: '/security/sessions/revoke-all', mutates: true, rateLimit: sensitiveMutationRateLimit, handler: ({ service, body }) => service.revokeAllSessions(body) },
  { method: 'POST', pattern: '/security/sessions/:id/touch', mutates: true, handler: ({ service, params }) => service.touchSession(params.id) },
  { method: 'GET', pattern: '/security/permissions', handler: ({ service }) => service.permissionMatrix() },
  { method: 'PATCH', pattern: '/security/roles/:role/permissions', mutates: true, rateLimit: sensitiveMutationRateLimit, handler: ({ service, params, body }) => service.setRolePermissions(params.role, Array.isArray(body.permissions) ? body.permissions.filter((permission): permission is string => typeof permission === 'string') : []) },
  { method: 'GET', pattern: '/security/tenant-probe', handler: ({ service, query }) => service.tenantProbe(query.get('organizationId') ?? 'org-nxl') },
  { method: 'GET', pattern: '/security/permission-probe', handler: ({ service, query }) => service.permissionProbe(query.get('permission') ?? 'inventory.adjust', query.get('role') ?? 'Viewer') },
  { method: 'GET', pattern: '/settings', handler: ({ service }) => service.settings() },
  { method: 'PATCH', pattern: '/settings', mutates: true, handler: ({ service, body }) => service.updateSettings(body) },
  { method: 'GET', pattern: '/customization-console', handler: ({ service }) => service.customizationConsole() },
  { method: 'GET', pattern: '/branding', handler: ({ service }) => service.workspaceBranding() },
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
  { method: 'GET', pattern: '/lab-usage/plan', handler: ({ service, query }) => service.labUsagePlan(query.get('formulaId') ?? '', Number(query.get('grams') ?? '12.5')) },
  { method: 'GET', pattern: '/lab-usage/:id', handler: ({ service, params }) => service.labUsageDetail(params.id) },
  { method: 'POST', pattern: '/lab-usage/weighing-session', mutates: true, handler: ({ service, body }) => service.recordLabWeighingSession(readString(body.formulaId, ''), readNumber(body.grams, 12.5), body) },
  { method: 'POST', pattern: '/lab-usage/commit', mutates: true, handler: ({ service, body }) => service.commitLabUsage(readString(body.formulaId, ''), readNumber(body.grams, 12.5), body) },
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
  { method: 'POST', pattern: '/billing/stripe/webhook', public: true, rawBody: true, mutates: true, writeGate: false, handler: ({ service, env, request, rawBody }) => handleStripeWebhook(service, env, request, rawBody ?? '') },
  { method: 'GET', pattern: '/billing/plan', handler: ({ service }) => service.billingPlan() },
  { method: 'GET', pattern: '/billing/plans', handler: ({ service }) => service.billingPlans() },
  { method: 'GET', pattern: '/billing/console', handler: ({ service }) => service.billingConsole() },
  { method: 'GET', pattern: '/billing/subscription', handler: ({ service }) => service.billingSubscription() },
  { method: 'GET', pattern: '/billing/usage', handler: ({ service }) => service.billingUsage() },
  { method: 'GET', pattern: '/billing/invoices', handler: ({ service }) => service.billingInvoices() },
  { method: 'POST', pattern: '/billing/checkout', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, body, env, request }) => startStripeCheckout(service, body, env, request) },
  { method: 'POST', pattern: '/billing/subscription/select-plan', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, body }) => service.selectBillingPlan(body) },
  { method: 'POST', pattern: '/billing/portal', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, env, request }) => startStripePortal(service, env, request) },
  { method: 'POST', pattern: '/billing/subscription/freeze', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, body }) => service.freezeSubscription(body) },
  { method: 'POST', pattern: '/billing/subscription/reactivate', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service }) => service.reactivateSubscription() },
  { method: 'POST', pattern: '/saas/custom-domains/provision', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, body, env }) => provisionCloudflareCustomDomain(service, body, env) },
  { method: 'GET', pattern: '/saas/custom-domains', handler: ({ service }) => service.customDomains() },
  { method: 'POST', pattern: '/saas/custom-domains/:id/refresh', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, params, env }) => refreshCloudflareCustomDomain(service, params.id, env) },
  { method: 'GET', pattern: '/sso-config', handler: ({ service }) => service.ssoConfig() },
  { method: 'PATCH', pattern: '/sso-config', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, body }) => service.updateSsoConfig(body) },
  { method: 'POST', pattern: '/sso-config/scim-token/rotate', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service }) => service.rotateScimToken() },
  { method: 'GET', pattern: '/api-keys', handler: ({ service }) => service.apiKeys() },
  { method: 'POST', pattern: '/api-keys', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, body }) => service.createApiKey(body) },
  { method: 'POST', pattern: '/api-keys/:id/rotate', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, params }) => service.rotateApiKey(params.id) },
  { method: 'POST', pattern: '/api-keys/:id/revoke', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, params }) => service.revokeApiKey(params.id) },
  { method: 'GET', pattern: '/webhooks', handler: ({ service }) => service.webhooks() },
  { method: 'POST', pattern: '/webhooks', mutates: true, rateLimit: sensitiveMutationRateLimit, limitKey: 'webhooks', writeGate: false, handler: ({ service, body }) => service.createWebhook(body) },
  { method: 'PATCH', pattern: '/webhooks/:id', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, params, body }) => service.updateWebhook(params.id, body) },
  { method: 'POST', pattern: '/webhooks/:id/rotate-secret', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, params }) => service.rotateWebhookSecret(params.id) },
  { method: 'DELETE', pattern: '/webhooks/:id', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, params }) => service.deleteWebhook(params.id) },
  { method: 'POST', pattern: '/webhooks/deliveries/:id/retry', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, params }) => service.retryWebhookDelivery(params.id) },
  { method: 'GET', pattern: '/audit/exports', handler: ({ service }) => service.auditExports() },
  { method: 'POST', pattern: '/audit/export', mutates: true, rateLimit: sensitiveMutationRateLimit, writeGate: false, handler: ({ service, body }) => service.auditExport(body) },
]

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startedAt = Date.now()
    let routeLabel = 'unmatched'
    const origin = request.headers.get('Origin')
    const corsHeaders = buildCorsHeaders(origin, env.CORS_ORIGINS)
    let service: NorthStarService | undefined
    let skipSecurityPersistence = false
    let mfaVerificationRequest = false

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: buildApiSecurityHeaders(corsHeaders) })
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
      routeLabel = `${request.method} ${match.route.pattern}`
      mfaVerificationRequest = match.route.persistScope === 'mfaVerification'

      const rawBody = match.route.rawBody ? await readRawBody(request) : undefined
      const body = rawBody === undefined ? await readJsonBody(request) : {}
      if (match.route.hydrateState !== false) {
        await assertPersistenceReady(env.DB)
      }
      let credential: AuthCredential = { source: 'none' }
      if (!match.route.public) {
        credential = readSessionCredential(request.headers)
        await assertSessionCredentialActive(env.DB, credential.sessionId)
      }
      if (match.route.public && match.route.rateLimit) {
        await assertRateLimit(env.DB, match.route.rateLimit, request, body, credential)
      }

      service = new NorthStarService({
        authCredentials: seededAdminCredentialsForEnv(env),
        mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
      })
      if (match.route.hydrateState !== false) {
        await hydrateSnapshots(env.DB, service, env)
      }
      if (!match.route.public) {
        if (!credential.sessionId) {
          throw new UnauthorizedException('Authentication required')
        }
        service.authenticateSession(credential.sessionId)
        await hydrateWorkspaceBranding(env.DB, service, credential.sessionId)
      }
      if (match.route.mutates && !match.route.public && credential.source === 'cookie') {
        service.assertValidCsrfToken(request.headers.get('X-CSRF-Token'))
      }
      const rateLimit = resolveRateLimitPolicy(match.route)
      if (!match.route.public && rateLimit) {
        await assertRateLimit(env.DB, rateLimit, request, body, credential)
      }
      if (match.route.mutates && match.route.writeGate !== false) {
        service.assertCommercialWriteAllowed(`${request.method} ${match.route.pattern}`)
      }
      if (match.route.limitKey) {
        service.assertPlanCapacity(match.route.limitKey)
      }
      const previousMfaEnrollments =
        match.route.persistScope === 'mfaVerification'
          ? structuredClone((service as unknown as ServiceState).mfaEnrollmentRecords)
          : undefined
      const result = await match.route.handler({
        service,
        params: match.params,
        query: url.searchParams,
        body,
        rawBody,
        env,
        request,
      })
      if (match.route.mutates) {
        await deliverNotificationOutbox(service, env)
      }
      let refreshSnapshotCache = false

      if (match.route.mutates || service.hasSecurityStateChanges()) {
        if (match.route.persistScope === 'userSettings') {
          await persistUserSettingsMutation(env.DB, service)
          refreshSnapshotCache = true
        } else if (match.route.persistScope === 'mfaVerification' && previousMfaEnrollments) {
          try {
            await persistMfaVerificationMutation(env.DB, service, previousMfaEnrollments, credential.sessionId, result)
            refreshSnapshotCache = true
          } catch (error) {
            skipSecurityPersistence = true
            throw error
          }
        } else {
          await persistSnapshots(env.DB, service)
          refreshSnapshotCache = true
        }
      }
      if (refreshSnapshotCache) {
        refreshCachedSnapshotState(service)
        refreshWorkspaceBrandingCache(service, credential.sessionId)
      }

      const response = json(result, 200, buildResponseHeaders(corsHeaders, match.route, result))
      const durationMs = Date.now() - startedAt
      if (durationMs >= 1200) {
        ctx.waitUntil(recordRuntimeEvent(env.DB, { route: routeLabel, status: response.status, durationMs, category: 'latency' }))
      }
      return response
    } catch (error) {
      const candidate = error as {
        getStatus?: () => number
        status?: number
        statusCode?: number
      }
      const status = candidate.getStatus?.() ?? candidate.status ?? candidate.statusCode ?? 500
      if (status >= 500) {
        console.error('Unhandled Worker API error', error)
      }
      if (service && !skipSecurityPersistence) {
        const persistFailureState = mfaVerificationRequest
          ? persistMfaVerificationFailureState(env.DB, service)
          : persistSecurityState(env.DB, service)
        await persistFailureState.catch((persistError) => console.error(persistError))
      }
      const durationMs = Date.now() - startedAt
      if (status >= 500) {
        ctx.waitUntil(
          Promise.all([
            recordRuntimeEvent(env.DB, { route: routeLabel, status, durationMs, category: 'error' }),
            captureSentryRuntimeError(env, { route: routeLabel, status, durationMs }),
          ]),
        )
      }
      return errorJson(error, corsHeaders)
    }
  },
}

async function publicStatus(env: Env) {
  const checkedAt = new Date().toISOString()
  try {
    await env.DB.prepare('SELECT 1 AS healthy').first<{ healthy: number }>()
    const telemetry = await env.DB
      .prepare(
        `SELECT
          SUM(CASE WHEN category = 'error' THEN 1 ELSE 0 END) AS error_count,
          SUM(CASE WHEN category = 'latency' THEN 1 ELSE 0 END) AS slow_count
         FROM runtime_events
         WHERE occurred_at >= datetime('now', '-15 minutes')`,
      )
      .first<{ error_count: number | null; slow_count: number | null }>()
    const errorCount = Number(telemetry?.error_count ?? 0)
    const slowCount = Number(telemetry?.slow_count ?? 0)
    const apiStatus = errorCount > 0 ? 'degraded' : 'operational'
    return {
      data: {
        status: apiStatus,
        checkedAt,
        components: [
          { name: 'API', status: apiStatus },
          { name: 'D1 persistence', status: 'operational' },
        ],
        telemetry: { windowMinutes: 15, errorCount, slowCount },
      },
    }
  } catch {
    return {
      data: {
        status: 'degraded',
        checkedAt,
        components: [
          { name: 'API', status: 'operational' },
          { name: 'D1 persistence', status: 'degraded' },
        ],
      },
    }
  }
}

async function deliverNotificationOutbox(service: NorthStarService, env: Env) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return
  }
  const notifications = service.notificationEmailOutbox()
  for (const notification of notifications) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [notification.recipientEmail],
          subject: notification.title,
          text: notification.href ? `${notification.body}\n\nOpen OlfactoryOps: ${notification.href}` : notification.body,
        }),
      })
      if (!response.ok) {
        const message = (await response.text()).slice(0, 180)
        service.setNotificationEmailStatus(notification.id, 'failed', message || `Resend returned ${response.status}`)
        continue
      }
      service.setNotificationEmailStatus(notification.id, 'sent')
    } catch (error) {
      service.setNotificationEmailStatus(
        notification.id,
        'failed',
        error instanceof Error ? error.message : 'Notification provider request failed',
      )
    }
  }
}

async function startStripeCheckout(
  service: NorthStarService,
  body: Record<string, unknown>,
  env: Env,
  request: Request,
) {
  const planId = typeof body.planId === 'string' ? body.planId : undefined
  const prepared = service.stripeCheckoutContext({ planId }).data
  const priceId = stripePriceForPlan(env, prepared.plan.id)
  if (!env.STRIPE_SECRET_KEY || !priceId) {
    throw new UnprocessableEntityException('Stripe billing is not configured for this plan')
  }
  const origin = billingReturnOrigin(request, env)
  const form = new URLSearchParams({
    mode: 'subscription',
    success_url: `${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?billing=cancelled`,
    client_reference_id: prepared.organizationId,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'automatic_tax[enabled]': 'true',
    allow_promotion_codes: 'true',
    'metadata[organizationId]': prepared.organizationId,
    'metadata[planId]': prepared.plan.id,
    'subscription_data[metadata][organizationId]': prepared.organizationId,
    'subscription_data[metadata][planId]': prepared.plan.id,
  })
  if (prepared.subscription.providerCustomerId) {
    form.set('customer', prepared.subscription.providerCustomerId)
  } else {
    form.set('customer_email', prepared.customerEmail)
  }
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  const payload = await readProviderJson(response)
  if (!response.ok || typeof payload.url !== 'string') {
    throw new UnprocessableEntityException(providerErrorMessage(payload, 'Stripe could not create a Checkout session'))
  }
  return {
    data: {
      id: `BILL-ACT-${prepared.audit.id}`,
      mode: 'checkout' as const,
      status: 'ready' as const,
      url: payload.url,
      audit: prepared.audit,
      invariant: 'Stripe Checkout is created server-side with plan metadata; payment state changes only after a verified webhook',
    },
  }
}

async function startPasswordReset(
  service: NorthStarService,
  body: Record<string, unknown>,
  env: Env,
  request: Request,
) {
  const prepared = service.beginPasswordReset(typeof body.email === 'string' ? body.email : undefined)
  if (prepared.delivery && env.RESEND_API_KEY && env.EMAIL_FROM) {
    const resetUrl = new URL('/', billingReturnOrigin(request, env))
    resetUrl.searchParams.set('reset', prepared.delivery.token)
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [prepared.delivery.recipientEmail],
          subject: 'Reset your OlfactoryOps password',
          text: `A password reset was requested for your OlfactoryOps account. This link expires in 30 minutes and can be used once:\n\n${resetUrl.toString()}`,
        }),
      })
      service.setNotificationEmailStatus(
        prepared.delivery.notificationId ?? '',
        response.ok ? 'sent' : 'failed',
        response.ok ? undefined : `Resend returned ${response.status}`,
      )
    } catch (error) {
      service.setNotificationEmailStatus(
        prepared.delivery.notificationId ?? '',
        'failed',
        error instanceof Error ? error.message : 'Password reset email failed',
      )
    }
  }
  return { data: prepared.data }
}

async function startStripePortal(service: NorthStarService, env: Env, request: Request) {
  const prepared = service.stripePortalContext().data
  if (!env.STRIPE_SECRET_KEY) {
    throw new UnprocessableEntityException('Stripe billing portal is not configured')
  }
  const form = new URLSearchParams({
    customer: prepared.subscription.providerCustomerId || '',
    return_url: billingReturnOrigin(request, env),
  })
  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  const payload = await readProviderJson(response)
  if (!response.ok || typeof payload.url !== 'string') {
    throw new UnprocessableEntityException(providerErrorMessage(payload, 'Stripe could not open the billing portal'))
  }
  return {
    data: {
      id: `BILL-ACT-${prepared.audit.id}`,
      mode: 'portal' as const,
      status: 'ready' as const,
      url: payload.url,
      audit: prepared.audit,
      invariant: 'Billing portal customer identity is resolved from the server-side subscription record',
    },
  }
}

function billingReturnOrigin(request: Request, env: Env) {
  const configured = env.BILLING_RETURN_URL?.trim()
  const candidate = configured || request.headers.get('Origin') || request.url
  try {
    const url = new URL(candidate)
    const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    if (url.protocol !== 'https:' && !localHttp) {
      throw new Error('Billing return URL must use HTTPS outside local development')
    }
    return url.origin
  } catch {
    return new URL(request.url).origin
  }
}

type RuntimeEvent = {
  route: string
  status: number
  durationMs: number
  category: 'error' | 'latency'
}

async function recordRuntimeEvent(db: D1Database, event: RuntimeEvent) {
  await db
    .prepare(
      `INSERT INTO runtime_events (id, occurred_at, route, status, duration_ms, category)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), new Date().toISOString(), event.route.slice(0, 180), event.status, event.durationMs, event.category)
    .run()
    .catch((error) => console.error('Unable to persist runtime event', error))
}

async function captureSentryRuntimeError(env: Env, event: Omit<RuntimeEvent, 'category'>) {
  const dsn = env.SENTRY_DSN?.trim()
  if (!dsn) return
  try {
    const parsed = new URL(dsn)
    const projectId = parsed.pathname.split('/').filter(Boolean).pop()
    if (!parsed.username || !projectId) return
    const eventId = crypto.randomUUID().replaceAll('-', '')
    const endpoint = `${parsed.protocol}//${parsed.host}/api/${encodeURIComponent(projectId)}/envelope/`
    const envelope = [
      JSON.stringify({ event_id: eventId, dsn }),
      JSON.stringify({ type: 'event', content_type: 'application/json' }),
      JSON.stringify({
        event_id: eventId,
        timestamp: new Date().toISOString(),
        platform: 'javascript',
        level: 'error',
        logger: 'olfactoryops.worker',
        message: `Worker ${event.status} on ${event.route}`,
        tags: { route: event.route, status: String(event.status) },
        extra: { durationMs: event.durationMs },
      }),
      '',
    ].join('\n')
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
    })
  } catch (error) {
    console.error('Unable to send runtime event to Sentry', error)
  }
}

function stripePriceForPlan(env: Env, planId: string) {
  if (planId === 'PLAN-ARTISAN') return env.STRIPE_PRICE_ARTISAN?.trim()
  if (planId === 'PLAN-ATELIER') return env.STRIPE_PRICE_ATELIER?.trim()
  if (planId === 'PLAN-MAISON') return env.STRIPE_PRICE_MAISON?.trim()
  return undefined
}

async function provisionCloudflareCustomDomain(
  service: NorthStarService,
  body: Record<string, unknown>,
  env: Env,
) {
  const hostname = typeof body.hostname === 'string' ? body.hostname : undefined
  const context = service.cloudflareSaasProvisioningContext({ hostname }).data
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_SAAS_ZONE_ID) {
    throw new UnprocessableEntityException('Cloudflare for SaaS is not configured for this environment')
  }
  const requestBody: Record<string, unknown> = {
    hostname: context.hostname,
    custom_metadata: {
      organizationId: context.organizationId,
      requestedBy: context.requestedBy,
    },
    ssl: { method: 'txt', type: 'dv' },
  }
  if (env.CLOUDFLARE_SAAS_ORIGIN?.trim()) {
    requestBody.custom_origin_server = env.CLOUDFLARE_SAAS_ORIGIN.trim()
    requestBody.custom_origin_sni = env.CLOUDFLARE_SAAS_ORIGIN.trim()
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(env.CLOUDFLARE_SAAS_ZONE_ID)}/custom_hostnames`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  )
  const payload = await readProviderJson(response)
  const result = isRecord(payload.result) ? payload.result : undefined
  if (!response.ok || !result || typeof result.id !== 'string') {
    throw new UnprocessableEntityException(providerErrorMessage(payload, 'Cloudflare could not provision the custom hostname'))
  }
  return service.completeCloudflareSaasProvisioning(
    context.hostname,
    result.id,
    cloudflareValidation(result),
  )
}

async function refreshCloudflareCustomDomain(service: NorthStarService, id: string, env: Env) {
  const context = service.cloudflareSaasRefreshContext(id).data
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_SAAS_ZONE_ID) {
    throw new UnprocessableEntityException('Cloudflare for SaaS is not configured for this environment')
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(env.CLOUDFLARE_SAAS_ZONE_ID)}/custom_hostnames/${encodeURIComponent(context.domain.providerId)}`,
    { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } },
  )
  const payload = await readProviderJson(response)
  const result = isRecord(payload.result) ? payload.result : undefined
  if (!response.ok || !result) {
    throw new UnprocessableEntityException(providerErrorMessage(payload, 'Cloudflare could not refresh the custom hostname'))
  }
  const ssl = isRecord(result.ssl) ? result.ssl : undefined
  return service.applyCloudflareSaasRefresh(id, {
    providerStatus: typeof result.status === 'string' ? result.status : undefined,
    sslStatus: typeof ssl?.status === 'string' ? ssl.status : undefined,
    validation: cloudflareValidation(result),
    verificationErrors: cloudflareVerificationErrors(result),
  })
}

function cloudflareValidation(result: Record<string, unknown>) {
  const validation: Record<string, string> = {}
  const ownership = isRecord(result.ownership_verification) ? result.ownership_verification : undefined
  if (ownership && typeof ownership.name === 'string' && typeof ownership.value === 'string') {
    validation.type = typeof ownership.type === 'string' ? ownership.type.toUpperCase() : 'TXT'
    validation.name = ownership.name
    validation.value = ownership.value
  }
  const validationRecords = Array.isArray(result.validation_records) ? result.validation_records : []
  const txtRecord = validationRecords.find((entry) => isRecord(entry) && typeof entry.txt_name === 'string')
  if (isRecord(txtRecord)) {
    validation.type = 'TXT'
    validation.name = typeof txtRecord.txt_name === 'string' ? txtRecord.txt_name : validation.name || ''
    validation.value = typeof txtRecord.txt_value === 'string'
      ? txtRecord.txt_value
      : typeof txtRecord.txt_record === 'string' ? txtRecord.txt_record : validation.value || ''
  }
  return validation
}

function cloudflareVerificationErrors(result: Record<string, unknown>) {
  const errors = Array.isArray(result.verification_errors) ? result.verification_errors : []
  const ssl = isRecord(result.ssl) ? result.ssl : undefined
  const validationErrors = ssl && Array.isArray(ssl.validation_errors) ? ssl.validation_errors : []
  return [...errors, ...validationErrors]
    .map((entry) => typeof entry === 'string' ? entry : isRecord(entry) && typeof entry.message === 'string' ? entry.message : '')
    .filter(Boolean)
    .slice(0, 8)
}

async function handleStripeWebhook(service: NorthStarService, env: Env, request: Request, rawBody: string) {
  const signature = request.headers.get('Stripe-Signature')
  if (!env.STRIPE_WEBHOOK_SECRET || !signature || !(await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET))) {
    throw new ForbiddenException('Stripe webhook signature is invalid')
  }
  let event: unknown
  try {
    event = JSON.parse(rawBody)
  } catch {
    throw new UnprocessableEntityException('Stripe webhook payload must be valid JSON')
  }
  if (!isRecord(event) || typeof event.id !== 'string') {
    throw new UnprocessableEntityException('Stripe webhook event id is required')
  }
  const claimed = await claimBillingWebhookEvent(env.DB, 'stripe', event.id)
  if (!claimed) {
    return { data: { received: true, idempotent: true, eventId: event.id } }
  }
  return service.applyStripeWebhook(event)
}

async function verifyStripeSignature(rawBody: string, header: string, secret: string) {
  const values = header.split(',').reduce<Record<string, string[]>>((result, part) => {
    const separator = part.indexOf('=')
    if (separator < 1) return result
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key && value) result[key] = [...(result[key] ?? []), value]
    return result
  }, {})
  const timestamp = Number(values.t?.[0])
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return false
  }
  const signedPayload = `${timestamp}.${rawBody}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
  const expected = hex(signature)
  return (values.v1 ?? []).some((candidate) => secureEqual(candidate, expected))
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function claimBillingWebhookEvent(db: D1Database, provider: string, eventId: string) {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO billing_provider_events (provider, event_id, received_at)
       VALUES (?1, ?2, ?3)`,
    )
    .bind(provider, eventId, new Date().toISOString())
    .run()
  return (result.meta.changes ?? 0) > 0
}

async function readProviderJson(response: Response) {
  try {
    const payload: unknown = await response.json()
    return isRecord(payload) ? payload : {}
  } catch {
    return {}
  }
}

function providerErrorMessage(payload: Record<string, unknown>, fallback: string) {
  const error = payload.error
  if (isRecord(error) && typeof error.message === 'string') return error.message.slice(0, 300)
  return fallback
}

function resolveRateLimitPolicy(route: Route) {
  if (route.rateLimit) {
    return route.rateLimit
  }
  if (route.mutates && !route.public && route.sessionCookie !== 'clear') {
    return authenticatedMutationRateLimit
  }
  return undefined
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
  const text = await readRawBody(request)
  if (!text.trim()) {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new UnprocessableEntityException('Request body must contain valid JSON')
  }
  if (!isRecord(parsed)) {
    throw new UnprocessableEntityException('Request body must be a JSON object')
  }
  return parsed
}

async function readRawBody(request: Request) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return ''
  }
  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new PayloadTooLargeException({
      message: 'Request body is too large',
      maxBytes: MAX_JSON_BODY_BYTES,
    })
  }
  const text = await request.text()
  const bodyBytes = new TextEncoder().encode(text).byteLength
  if (bodyBytes > MAX_JSON_BODY_BYTES) {
    throw new PayloadTooLargeException({
      message: 'Request body is too large',
      maxBytes: MAX_JSON_BODY_BYTES,
    })
  }
  return text
}

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function seededAdminCredentialsForEnv(env: Env) {
  const passwordHash = readConfiguredSeededAdminPasswordHash(env.SEEDED_ADMIN_PASSWORD_HASH)
  if (!passwordHash) {
    return []
  }
  return [
    {
      email: SEEDED_ADMIN_EMAIL,
      passwordHash,
      passwordSetAt: SEEDED_ADMIN_PASSWORD_SET_AT,
    },
  ]
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
  credential: AuthCredential,
) {
  const now = new Date()
  const nowIso = now.toISOString()
  const nextExpiresAt = new Date(now.getTime() + policy.windowSeconds * 1000).toISOString()
  const subject = await rateLimitSubject(policy, request, body, credential)
  const clientKey = `${policy.key}:${subject}`
  const row = await db
    .prepare(
      `INSERT INTO security_rate_limits (key, count, window_start, expires_at, updated_at)
       VALUES (?1, 1, ?2, ?3, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN security_rate_limits.expires_at <= ?2 THEN 1 ELSE security_rate_limits.count + 1 END,
         window_start = CASE WHEN security_rate_limits.expires_at <= ?2 THEN excluded.window_start ELSE security_rate_limits.window_start END,
         expires_at = CASE WHEN security_rate_limits.expires_at <= ?2 THEN excluded.expires_at ELSE security_rate_limits.expires_at END,
         updated_at = excluded.updated_at
       RETURNING count, expires_at`,
    )
    .bind(clientKey, nowIso, nextExpiresAt)
    .first<{ count: number; expires_at: string }>()

  if (!row) {
    throw new Error('Rate limit state was not returned')
  }
  if (row.count === 1) {
    await db.prepare('DELETE FROM security_rate_limits WHERE expires_at <= ?1').bind(nowIso).run()
  }
  const expiresAt = new Date(row.expires_at)
  if (row.count > policy.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000))
    throw new TooManyRequestsException({
      message: policy.message,
      limitKey: policy.key,
      limit: policy.limit,
      windowSeconds: policy.windowSeconds,
      retryAfterSeconds,
    })
  }
}

async function rateLimitSubject(
  policy: RateLimitPolicy,
  request: Request,
  body: Record<string, unknown>,
  credential: AuthCredential,
) {
  const clientAddress = readClientAddress(request.headers)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : 'unknown'
  const rawSubject =
    policy.scope === 'session'
      ? `session:${credential.sessionId ?? clientAddress}`
      : policy.scope === 'client-email'
        ? `client:${clientAddress}:email:${email}`
        : `client:${clientAddress}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawSubject))
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')
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

async function assertSessionCredentialActive(db: D1Database, sessionId: string | undefined) {
  if (!sessionId) {
    throw new UnauthorizedException('Authentication required')
  }
  const row = await db
    .prepare(
      `SELECT status, idle_expires_at, expires_at
       FROM auth_sessions
       WHERE id = ?1
       LIMIT 1`,
    )
    .bind(sessionId)
    .first<{ status: string; idle_expires_at: string; expires_at: string }>()
  const now = Date.now()
  const idleExpiresAt = row ? Date.parse(row.idle_expires_at) : Number.NaN
  const expiresAt = row ? Date.parse(row.expires_at) : Number.NaN
  if (
    !row ||
    row.status !== 'ACTIVE' ||
    !Number.isFinite(idleExpiresAt) ||
    !Number.isFinite(expiresAt) ||
    idleExpiresAt <= now ||
    expiresAt <= now
  ) {
    throw new UnauthorizedException('Authentication required')
  }
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

async function assertPersistenceReady(db: D1Database) {
  if (!persistenceReadyPromise) {
    persistenceReadyPromise = db
      .prepare('SELECT key FROM northstar_snapshots LIMIT 1')
      .first()
      .then(() => undefined)
  }
  try {
    await persistenceReadyPromise
  } catch {
    persistenceReadyPromise = undefined
    throw new Error('Service persistence is not ready; apply D1 migrations before deployment')
  }
}

async function hydrateSnapshots(db: D1Database, service: NorthStarService, env: Env) {
  const { state: cachedState } = await loadCachedSnapshotState(db, env)
  const serviceState = service as unknown as ServiceState
  const currentState = cachedState as unknown as Partial<Record<SnapshotKey, ServiceState[SnapshotKey]>>

  for (const key of SNAPSHOT_KEYS) {
    const cachedValue = currentState[key]
    if (cachedValue === undefined) {
      continue
    }
    ;(serviceState as Record<SnapshotKey, ServiceState[SnapshotKey]>)[key] = structuredClone(cachedValue)
  }
  return
}

async function hydrateWorkspaceBranding(db: D1Database, service: NorthStarService, sessionId: string) {
  const serviceState = service as unknown as ServiceState
  const session = serviceState.sessions.find((candidate) => candidate.id === sessionId)
  if (!session) {
    return
  }

  const cached = workspaceBrandingCache.get(session.organizationId)
  if (cached && Date.now() - cached.loadedAt <= WORKSPACE_BRANDING_CACHE_TTL_MS) {
    serviceState.brandingRecord = structuredClone(cached.branding)
    return
  }

  const branding = await db
    .prepare(
      `SELECT organization_id, display_name, accent_color, document_footer, label_template, logo_mode, logo_image_url
       FROM tenant_branding
       WHERE organization_id = ?1`,
    )
    .bind(session.organizationId)
    .first<BrandingRow>()

  const resolvedBranding: BrandingConfig = branding
    ? brandingFromRow(branding)
    : {
        organizationId: session.organizationId,
        displayName: 'OlfactoryOps',
        accentColor: '#0f766e',
        documentFooter: 'Confidential workspace record',
        labelTemplate: 'OLF-{sequence}',
        logoMode: 'wordmark',
      }
  serviceState.brandingRecord = resolvedBranding
  workspaceBrandingCache.set(session.organizationId, { loadedAt: Date.now(), branding: structuredClone(resolvedBranding) })
}

function refreshWorkspaceBrandingCache(service: NorthStarService, sessionId?: string) {
  if (!sessionId) {
    return
  }
  const serviceState = service as unknown as ServiceState
  const session = serviceState.sessions.find((candidate) => candidate.id === sessionId)
  if (!session) {
    return
  }
  workspaceBrandingCache.set(session.organizationId, {
    loadedAt: Date.now(),
    branding: structuredClone(serviceState.brandingRecord),
  })
}

function isSnapshotCacheFresh(state: CachedSnapshotState | null): state is CachedSnapshotState {
  return Boolean(state && Date.now() - state.loadedAt <= SNAPSHOT_CACHE_TTL_MS)
}

async function loadCachedSnapshotState(db: D1Database, env: Env): Promise<CachedSnapshotState> {
  if (isSnapshotCacheFresh(snapshotCache)) {
    return snapshotCache
  }
  if (snapshotCacheFlight) {
    return snapshotCacheFlight
  }
  snapshotCacheFlight = hydrateSnapshotStateFromDatabase(db, env)
  try {
    snapshotCache = await snapshotCacheFlight
    return snapshotCache
  } finally {
    snapshotCacheFlight = null
  }
}

async function hydrateSnapshotStateFromDatabase(db: D1Database, env: Env): Promise<CachedSnapshotState> {
  const service = new NorthStarService({
    authCredentials: seededAdminCredentialsForEnv(env),
    mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
  })
  const serviceState = service as unknown as ServiceState
  const snapshotRows = await db.prepare('SELECT key, value, updated_at FROM northstar_snapshots').all<{
    key: SnapshotKey
    value: string
    updated_at: string | null
  }>()

  let updatedAt = ''
  for (const row of snapshotRows.results ?? []) {
    if (!SNAPSHOT_KEY_SET.has(row.key)) {
      continue
    }
    serviceState[row.key] = JSON.parse(row.value)
    if (row.updated_at && row.updated_at > updatedAt) {
      updatedAt = row.updated_at
    }
  }
  await hydrateNormalizedState(db, serviceState, env)
  return { loadedAt: Date.now(), updatedAt, state: structuredClone(serviceState) }
}

function refreshCachedSnapshotState(service: NorthStarService) {
  snapshotCache = {
    loadedAt: Date.now(),
    updatedAt: new Date().toISOString(),
    state: structuredClone(service as unknown as ServiceState),
  }
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

async function persistUserSettingsMutation(db: D1Database, service: NorthStarService) {
  const serviceState = service as unknown as ServiceState
  const updatedAt = new Date().toISOString()
  await persistUserSettings(db, serviceState.userSettingsRecords, updatedAt)
  await persistMemberships(db, serviceState.membershipRecords, updatedAt)
  await persistAuditEvents(db, serviceState.auditEvents, updatedAt)
  serviceState.auditCounter = Math.max(Number(serviceState.auditCounter) || 0, maxAuditCounter(serviceState.auditEvents))
}

export function isSingleRecoveryCodeConsumption(previousHashes: string[], nextHashes: string[]) {
  if (previousHashes.length !== nextHashes.length + 1) {
    return false
  }
  const previousSet = new Set(previousHashes)
  const nextSet = new Set(nextHashes)
  if (previousSet.size !== previousHashes.length || nextSet.size !== nextHashes.length) {
    return false
  }
  return nextHashes.every((hash) => previousSet.has(hash))
}

async function persistMfaVerificationMutation(
  db: D1Database,
  service: NorthStarService,
  previousEnrollments: MfaEnrollmentRecord[],
  sessionId: string | undefined,
  result: unknown,
) {
  const serviceState = service as unknown as ServiceState
  const session = serviceState.sessions.find((item) => item.id === sessionId)
  if (!session) {
    throw new UnauthorizedException('Authentication required')
  }
  const enrollment = serviceState.mfaEnrollmentRecords.find(
    (item) => item.userId === session.userId && item.organizationId === session.organizationId,
  )
  const previousEnrollment = previousEnrollments.find(
    (item) => item.userId === session.userId && item.organizationId === session.organizationId,
  )
  if (!enrollment || !previousEnrollment) {
    throw new UnprocessableEntityException('MFA enrollment is unavailable')
  }

  const resultData = isRecord(result) && isRecord(result.data) ? result.data : {}
  const method = resultData.method
  const updatedAt = new Date().toISOString()
  if (method === 'recovery') {
    if (!isSingleRecoveryCodeConsumption(previousEnrollment.recoveryCodeHashes, enrollment.recoveryCodeHashes)) {
      throw new ForbiddenException('MFA code is invalid or expired')
    }
    const mutation = await db
      .prepare(
        `UPDATE mfa_enrollments
         SET encrypted_secret = ?1, recovery_code_hashes_json = ?2, created_at = ?3,
             verified_at = ?4, updated_at = ?5
         WHERE organization_id = ?6 AND user_id = ?7
           AND verified_at IS NOT NULL
           AND recovery_code_hashes_json = ?8`,
      )
      .bind(
        enrollment.encryptedSecret,
        JSON.stringify(enrollment.recoveryCodeHashes),
        enrollment.createdAt,
        enrollment.verifiedAt ?? null,
        enrollment.updatedAt || updatedAt,
        enrollment.organizationId,
        enrollment.userId,
        JSON.stringify(previousEnrollment.recoveryCodeHashes),
      )
      .run()
    if ((mutation.meta.changes ?? 0) !== 1) {
      throw new ForbiddenException('MFA code is invalid or expired')
    }
  } else if (method === 'totp') {
    await persistMfaEnrollments(db, [enrollment], updatedAt)
  } else {
    throw new UnprocessableEntityException('MFA verification result is invalid')
  }

  await persistAuthSessions(db, serviceState.sessions, updatedAt)
  await persistMemberships(db, serviceState.membershipRecords, updatedAt)
  await persistAuditEvents(db, serviceState.auditEvents, updatedAt)
  serviceState.auditCounter = Math.max(Number(serviceState.auditCounter) || 0, maxAuditCounter(serviceState.auditEvents))
}

async function persistMfaVerificationFailureState(db: D1Database, service: NorthStarService) {
  const serviceState = service as unknown as ServiceState
  const updatedAt = new Date().toISOString()
  await persistAuthSessions(db, serviceState.sessions, updatedAt)
  await persistAuditEvents(db, serviceState.auditEvents, updatedAt)
  serviceState.auditCounter = Math.max(Number(serviceState.auditCounter) || 0, maxAuditCounter(serviceState.auditEvents))
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

type MfaEnrollmentRow = {
  user_id: string
  organization_id: string
  encrypted_secret: string
  recovery_code_hashes_json: string
  created_at: string
  verified_at: string | null
  updated_at: string
}

type UserSettingsRow = {
  user_id: string
  organization_id: string
  email: string
  display_name: string
  preferred_landing: string
  ui_density: string
  sidebar_mode: string
  reduce_motion: number
  email_digest: string
  accent_color: string
  formula_workspace_json: string | null
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
  custom_domain: string | null
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
  logo_image_url?: string | null
}

type FormulaRecordRow = {
  organization_id: string
  id: string
  brand_id: string
  code: string
  name: string
  formula_type: string
  workflow_status: string
  status: string
  version: string
  draft_revision: number
  record_json: string
  updated_at: string
}

type FormulaVersionRecordRow = {
  organization_id: string
  id: string
  formula_id: string
  formula_code: string
  version: string
  status: string
  created_at: string
  created_by: string
  checksum: string
  record_json: string
  updated_at: string
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
  lines_json: string | null
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
  lines_json: string | null
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

type SsoConfigRow = {
  id: string
  organization_id: string
  provider: string
  domain: string
  status: string
  issuer_url: string
  metadata_url: string | null
  client_id: string | null
  acs_url: string
  entity_id: string
  domain_verified_at: string | null
  jit_provisioning: number
  enforce_sso: number
  scim_json: string
  role_mapping_json: string
  config_updated_at: string
}

type ApiKeyRow = {
  id: string
  organization_id: string
  label: string
  prefix: string
  last_four: string
  scopes_json: string
  created_at: string
  created_by: string
  rotated_at: string
  last_used_at: string | null
  expires_at: string | null
  status: string
  secret_hash: string | null
}

type WebhookRow = {
  id: string
  organization_id: string
  url: string
  events_json: string
  status: string
  last_delivery: string
  created_at: string
  owner: string
  signing_secret_last_four: string
  signing_secret_rotated_at: string
  failure_count: number
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

type AuditExportJobRow = {
  id: string
  organization_id: string
  requested_by: string
  format: string
  scope: string
  status: string
  event_count: number
  checksum: string
  download_url: string | null
  created_at: string
  completed_at: string | null
  expires_at: string
  audit_event_id: string
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
  organization_id: string
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

async function hydrateNormalizedState(db: D1Database, serviceState: ServiceState, env: Env) {
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
  const mfaRows = await db
    .prepare(
      `SELECT user_id, organization_id, encrypted_secret, recovery_code_hashes_json,
        created_at, verified_at, updated_at
       FROM mfa_enrollments
       ORDER BY organization_id ASC, user_id ASC`,
    )
    .all<MfaEnrollmentRow>()
  serviceState.mfaEnrollmentRecords = (mfaRows.results ?? []).map(mfaEnrollmentFromRow)


  const userSettingsRows = await db
    .prepare(
      `SELECT user_id, organization_id, email, display_name, preferred_landing, ui_density,
        sidebar_mode, reduce_motion, email_digest, accent_color, formula_workspace_json, updated_at
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
  await ensureSeededAdminBootstrap(db, serviceState, env.SEEDED_ADMIN_PASSWORD_HASH)
  await hydrateMaterialState(db, serviceState)
  await hydrateFormulaState(db, serviceState)
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
  await persistMfaEnrollments(db, serviceState.mfaEnrollmentRecords, updatedAt)
  await persistUserSettings(db, serviceState.userSettingsRecords, updatedAt)
  await persistAuditEvents(db, serviceState.auditEvents, updatedAt)
  await persistTenantCoreState(db, serviceState, updatedAt)
  await persistMaterialState(db, serviceState, updatedAt)
  await persistFormulaState(db, serviceState, updatedAt)
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

async function persistMfaEnrollments(
  db: D1Database,
  enrollments: MfaEnrollmentRecord[],
  updatedAt: string,
) {
  if (!Array.isArray(enrollments) || enrollments.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    enrollments.map((enrollment) =>
      db
        .prepare(
          `INSERT INTO mfa_enrollments (
            user_id, organization_id, encrypted_secret, recovery_code_hashes_json,
            created_at, verified_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          ON CONFLICT(organization_id, user_id) DO UPDATE SET
            encrypted_secret = excluded.encrypted_secret,
            recovery_code_hashes_json = excluded.recovery_code_hashes_json,
            created_at = excluded.created_at,
            verified_at = excluded.verified_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          enrollment.userId,
          enrollment.organizationId,
          enrollment.encryptedSecret,
          JSON.stringify(enrollment.recoveryCodeHashes),
          enrollment.createdAt,
          enrollment.verifiedAt ?? null,
          enrollment.updatedAt || updatedAt,
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
            ui_density, sidebar_mode, reduce_motion, email_digest, accent_color, formula_workspace_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
          ON CONFLICT(user_id, organization_id) DO UPDATE SET
            email = excluded.email,
            display_name = excluded.display_name,
            preferred_landing = excluded.preferred_landing,
            ui_density = excluded.ui_density,
            sidebar_mode = excluded.sidebar_mode,
            reduce_motion = excluded.reduce_motion,
            email_digest = excluded.email_digest,
            accent_color = excluded.accent_color,
            formula_workspace_json = excluded.formula_workspace_json,
            updated_at = excluded.updated_at`,
        )
        .bind(
          record.userId,
          record.organizationId,
          record.email,
          record.displayName,
          record.preferredLanding,
          record.uiDensity,
          record.sidebarMode === 'rail' ? 'rail' : 'expanded',
          record.reduceMotion ? 1 : 0,
          record.emailDigest,
          readAccentColor(record.accentColor),
          JSON.stringify(normalizeFormulaWorkspacePreferences(record.formulaWorkspace, createDefaultFormulaWorkspacePreferences())),
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

async function ensureSeededAdminBootstrap(
  db: D1Database,
  serviceState: ServiceState,
  configuredAdminPasswordHash?: string,
) {
  const seedOrganization = seedOrganizations.find((organization) => organization.id === SEEDED_ADMIN_ORGANIZATION_ID)
  const seedMembership = seedMemberships.find(
    (membership) => membership.email.toLowerCase() === SEEDED_ADMIN_EMAIL,
  )
  const seedUserSetting = seedUserSettings.find(
    (settings) =>
      settings.email.toLowerCase() === SEEDED_ADMIN_EMAIL &&
      settings.organizationId === SEEDED_ADMIN_ORGANIZATION_ID,
  )
  const seedAdminPolicy = seedRolePolicies.find(
    (policy) => policy.role === SEEDED_ADMIN_ROLE && policy.scope === 'organization',
  )
  const updatedAt = new Date().toISOString()

  if (seedOrganization) {
    const existingOrganization = serviceState.organizationRecords.find((organization) => organization.id === seedOrganization.id)
    const nextOrganization = existingOrganization
      ? { ...existingOrganization, primaryContact: seedOrganization.primaryContact }
      : seedOrganization
    if (!existingOrganization || existingOrganization.primaryContact !== nextOrganization.primaryContact) {
      serviceState.organizationRecords = [
        nextOrganization,
        ...serviceState.organizationRecords.filter((organization) => organization.id !== nextOrganization.id),
      ]
      await persistOrganizations(db, [nextOrganization], updatedAt)
    }
  }

  if (seedMembership) {
    const existingMembership = serviceState.membershipRecords.find(
      (membership) => membership.id === seedMembership.id || membership.email.toLowerCase() === SEEDED_ADMIN_EMAIL,
    )
    const nextMembership = {
      ...seedMembership,
      lastActiveAt: existingMembership?.lastActiveAt ?? seedMembership.lastActiveAt,
    }
    if (!existingMembership || JSON.stringify(existingMembership) !== JSON.stringify(nextMembership)) {
      serviceState.membershipRecords = [
        nextMembership,
        ...serviceState.membershipRecords.filter(
          (membership) => membership.id !== nextMembership.id && membership.email.toLowerCase() !== SEEDED_ADMIN_EMAIL,
        ),
      ]
      await persistMemberships(db, [nextMembership], updatedAt)
    }
  }

  if (seedUserSetting) {
    const existingUserSetting = serviceState.userSettingsRecords.find(
      (settings) => settings.userId === seedUserSetting.userId && settings.organizationId === seedUserSetting.organizationId,
    )
    if (!existingUserSetting) {
      serviceState.userSettingsRecords = [seedUserSetting, ...serviceState.userSettingsRecords]
      await persistUserSettings(db, [seedUserSetting], updatedAt)
    }
  }

  if (seedAdminPolicy) {
    const existingAdminPolicy = serviceState.rolePolicyRecords.find(
      (policy) => policy.role === seedAdminPolicy.role && policy.scope === seedAdminPolicy.scope,
    )
    if (!existingAdminPolicy || JSON.stringify(existingAdminPolicy) !== JSON.stringify(seedAdminPolicy)) {
      serviceState.rolePolicyRecords = [
        seedAdminPolicy,
        ...serviceState.rolePolicyRecords.filter(
          (policy) => !(policy.role === seedAdminPolicy.role && policy.scope === seedAdminPolicy.scope),
        ),
      ]
      await persistRolePolicies(db, [seedAdminPolicy], updatedAt)
    }
  }

  const seedOwnerPolicy = seedRolePolicies.find(
    (policy) => policy.role === 'Owner' && policy.scope === 'organization',
  )
  if (seedOwnerPolicy) {
    const existingOwnerPolicy = serviceState.rolePolicyRecords.find(
      (policy) => policy.role === seedOwnerPolicy.role && policy.scope === seedOwnerPolicy.scope,
    )
    if (!existingOwnerPolicy || JSON.stringify(existingOwnerPolicy) !== JSON.stringify(seedOwnerPolicy)) {
      serviceState.rolePolicyRecords = [
        seedOwnerPolicy,
        ...serviceState.rolePolicyRecords.filter(
          (policy) => !(policy.role === seedOwnerPolicy.role && policy.scope === seedOwnerPolicy.scope),
        ),
      ]
      await persistRolePolicies(db, [seedOwnerPolicy], updatedAt)
    }
  }

  const existingAdminCredential = serviceState.authCredentialRecords.find(
    (credential) => String(credential.email ?? '').toLowerCase() === SEEDED_ADMIN_EMAIL,
  )

  const seededAdminPasswordHash = readConfiguredSeededAdminPasswordHash(configuredAdminPasswordHash)

  if (seededAdminPasswordHash && (!existingAdminCredential || existingAdminCredential.passwordHash !== seededAdminPasswordHash)) {
    const credentialWasRotated = Boolean(existingAdminCredential)
    const seededAdminCredential = {
      email: SEEDED_ADMIN_EMAIL,
      passwordHash: seededAdminPasswordHash,
      passwordSetAt: updatedAt,
    }
    serviceState.authCredentialRecords = [
      seededAdminCredential,
      ...serviceState.authCredentialRecords.filter(
        (credential) => String(credential.email ?? '').toLowerCase() !== SEEDED_ADMIN_EMAIL,
      ),
    ]
    await db
      .prepare(
        `INSERT INTO northstar_snapshots (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind('authCredentialRecords', JSON.stringify(serviceState.authCredentialRecords), updatedAt)
      .run()

    const revokedAdminSessions = serviceState.sessions
      .filter((session) => session.email.toLowerCase() === SEEDED_ADMIN_EMAIL && session.status === 'ACTIVE')
      .map((session) => ({
        ...session,
        status: 'REVOKED' as const,
        revokedAt: updatedAt,
        revokedReason: 'admin_credential_rotated',
      }))
    if (revokedAdminSessions.length > 0) {
      const revokedById = new Map(revokedAdminSessions.map((session) => [session.id, session]))
      serviceState.sessions = serviceState.sessions.map((session) => revokedById.get(session.id) ?? session)
      await persistAuthSessions(db, revokedAdminSessions, updatedAt)
    }

    const nextAuditCounter = Math.max(Number(serviceState.auditCounter) || 0, maxAuditCounter(serviceState.auditEvents)) + 1
    const auditEvent: AuditEvent = {
      id: `AUD-${nextAuditCounter}`,
      at: updatedAt,
      actor: 'system:worker',
      action: credentialWasRotated ? 'security.adminCredential.rotate' : 'security.adminCredential.bootstrap',
      entity: SEEDED_ADMIN_EMAIL,
      requestId: `req_admin_credential_${nextAuditCounter}`,
      outcome: 'allowed',
    }
    serviceState.auditCounter = nextAuditCounter
    serviceState.auditEvents = [auditEvent, ...serviceState.auditEvents]
    await persistAuditEvents(db, [auditEvent], updatedAt)
  }
}

function readConfiguredSeededAdminPasswordHash(configuredAdminPasswordHash: string | undefined) {
  const candidate = configuredAdminPasswordHash?.trim()
  if (candidate && /^pbkdf2:v1:sha256:100000:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/.test(candidate)) {
    return candidate
  }
  return undefined
}

async function hydrateTenantCoreState(db: D1Database, serviceState: ServiceState) {
  const organizationRows = await db
    .prepare(
      `SELECT id, name, slug, custom_domain, plan, status, primary_contact, created_at
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
    const ownerDefault = seedRolePolicies.find((policy) => policy.scope === 'organization' && policy.role === 'Owner')
    const ownerPolicy = rolePolicies.find((policy) => policy.scope === 'organization' && policy.role === 'Owner')
    const ownerNeedsMemberSummary = Boolean(
      ownerDefault?.permissions.includes('security.viewMembers') && !ownerPolicy?.permissions.includes('security.viewMembers'),
    )
    serviceState.rolePolicyRecords = ownerNeedsMemberSummary
      ? rolePolicies.map((policy) =>
          policy.scope === 'organization' && policy.role === 'Owner'
            ? { ...policy, permissions: [...policy.permissions, 'security.viewMembers'] }
            : policy,
        )
      : rolePolicies
    if (ownerNeedsMemberSummary) {
      await persistRolePolicies(db, serviceState.rolePolicyRecords, new Date().toISOString())
    }
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

async function hydrateFormulaState(db: D1Database, serviceState: ServiceState) {
  const formulaRows = await db
    .prepare(
      `SELECT organization_id, id, brand_id, code, name, formula_type, workflow_status,
        status, version, draft_revision, record_json, updated_at
       FROM formula_records
       ORDER BY updated_at DESC, organization_id ASC, code ASC`,
    )
    .all<FormulaRecordRow>()
  const formulas = (formulaRows.results ?? []).map(formulaFromRow).filter(isDefined)
  if (formulas.length > 0) {
    serviceState.formulaRecords = formulas
  } else if (Array.isArray(serviceState.formulaRecords) && serviceState.formulaRecords.length > 0) {
    await persistFormulaRecords(db, serviceState.formulaRecords, new Date().toISOString())
  }

  const versionRows = await db
    .prepare(
      `SELECT organization_id, id, formula_id, formula_code, version, status, created_at,
        created_by, checksum, record_json, updated_at
       FROM formula_version_records
       ORDER BY created_at DESC, organization_id ASC, formula_code ASC`,
    )
    .all<FormulaVersionRecordRow>()
  const versions = (versionRows.results ?? []).map(formulaVersionFromRow).filter(isDefined)
  if (versions.length > 0) {
    serviceState.formulaVersionRecords = versions
  } else if (Array.isArray(serviceState.formulaVersionRecords) && serviceState.formulaVersionRecords.length > 0) {
    await persistFormulaVersions(db, serviceState.formulaVersionRecords, new Date().toISOString())
  }
}

export function normalizeFormulaPersistenceRecord(formula: Formula, updatedAt = new Date().toISOString()): Formula {
  const id = typeof formula.id === 'string' ? formula.id.trim() : ''
  const code = typeof formula.code === 'string' ? formula.code.trim() : ''
  const name = typeof formula.name === 'string' ? formula.name.trim() : ''
  if (!id || !code || !name) {
    throw new Error('Formula persistence record is missing identity metadata')
  }

  const organizationId =
    typeof formula.organizationId === 'string' && formula.organizationId.trim()
      ? formula.organizationId.trim()
      : SEEDED_ADMIN_ORGANIZATION_ID
  const formulaType = formula.formulaType === 'ACCORD' || code.startsWith('ACC-') ? 'ACCORD' : 'FINE_FRAGRANCE'
  const status = formula.status || 'draft'
  const workflowStatus =
    formula.workflowStatus === 'APPROVED' ||
    formula.workflowStatus === 'IN_REVIEW' ||
    formula.workflowStatus === 'CHANGES_REQUESTED' ||
    formula.workflowStatus === 'ARCHIVED'
      ? formula.workflowStatus
      : status === 'stable'
        ? 'APPROVED'
        : 'DRAFT'

  return {
    ...formula,
    id,
    code,
    name,
    organizationId,
    brandId:
      typeof formula.brandId === 'string' && formula.brandId.trim()
        ? formula.brandId.trim()
        : organizationId === SEEDED_ADMIN_ORGANIZATION_ID
          ? 'brand-nxl'
          : `brand-${organizationId.replace(/^org-/, '')}`,
    formulaType,
    concentrationType: formula.concentrationType || (formulaType === 'ACCORD' ? 'OTHER' : 'EDP'),
    finalProductConcentrationPercent: Number.isFinite(formula.finalProductConcentrationPercent)
      ? Math.min(100, Math.max(0.01, formula.finalProductConcentrationPercent))
      : formulaType === 'ACCORD'
        ? 100
        : 20,
    targetMarkets: Array.isArray(formula.targetMarkets) ? formula.targetMarkets : [],
    brief: formula.brief || '',
    inspiration: formula.inspiration || '',
    pyramidSummary: formula.pyramidSummary || '',
    tags: Array.isArray(formula.tags) ? formula.tags : [],
    project: formula.project || '',
    collection: formula.collection || '',
    density: Number.isFinite(formula.density) && formula.density > 0 ? formula.density : 1,
    bottleVolumeMl:
      Number.isFinite(formula.bottleVolumeMl) && formula.bottleVolumeMl > 0 ? formula.bottleVolumeMl : 50,
    bottleCount:
      Number.isFinite(formula.bottleCount) && formula.bottleCount > 0 ? Math.round(formula.bottleCount) : 1,
    ifraCategory: formula.ifraCategory || '4',
    workflowStatus,
    draftRevision:
      Number.isFinite(formula.draftRevision) && formula.draftRevision > 0 ? Math.round(formula.draftRevision) : 1,
    updatedAt: formula.updatedAt || updatedAt,
    updatedBy: formula.updatedBy || formula.owner || 'system:migration',
    approvalHistory: Array.isArray(formula.approvalHistory) ? formula.approvalHistory : [],
    status,
    version: formula.version || 'v1',
    targetGrams: Number.isFinite(formula.targetGrams) && formula.targetGrams > 0 ? formula.targetGrams : 100,
    owner: formula.owner || 'system:migration',
    lines: Array.isArray(formula.lines) ? formula.lines : [],
  }
}

export function normalizeFormulaVersionPersistenceRecord(
  version: FormulaVersionRecord,
  updatedAt = new Date().toISOString(),
): FormulaVersionRecord {
  const id = typeof version.id === 'string' ? version.id.trim() : ''
  const formulaId = typeof version.formulaId === 'string' ? version.formulaId.trim() : ''
  const formulaCode = typeof version.formulaCode === 'string' ? version.formulaCode.trim() : ''
  const versionValue = typeof version.version === 'string' ? version.version.trim() : ''
  if (!id || !formulaId || !formulaCode || !versionValue) {
    throw new Error('Formula version persistence record is missing identity metadata')
  }

  return {
    ...version,
    id,
    formulaId,
    formulaCode,
    version: versionValue,
    organizationId:
      typeof version.organizationId === 'string' && version.organizationId.trim()
        ? version.organizationId.trim()
        : SEEDED_ADMIN_ORGANIZATION_ID,
    status: version.status || 'DRAFT',
    createdAt: version.createdAt || updatedAt,
    createdBy: version.createdBy || 'system:migration',
    checksum: version.checksum || formulaVersionPersistenceChecksum(version),
    evaluations: Array.isArray(version.evaluations) ? version.evaluations : [],
    resolvedLeaves: Array.isArray(version.resolvedLeaves) ? version.resolvedLeaves : [],
    evaporation:
      Array.isArray(version.evaporation) && version.evaporation.every((point) => Array.isArray(point?.materials))
        ? version.evaporation
        : [],
    lines: Array.isArray(version.lines) ? version.lines : [],
  }
}

function formulaVersionPersistenceChecksum(version: FormulaVersionRecord) {
  const payload = `${version.formulaId || 'legacy'}:${version.version || 'v1'}:${JSON.stringify(version.lines ?? [])}`
  let hash = 0
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 31 + payload.charCodeAt(index)) >>> 0
  }
  return `sha256:${hash.toString(16).padStart(8, '0')}`
}
async function persistFormulaState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistFormulaRecords(db, serviceState.formulaRecords, updatedAt)
  await persistFormulaVersions(db, serviceState.formulaVersionRecords, updatedAt)
}

async function persistFormulaRecords(db: D1Database, formulas: Formula[], updatedAt: string) {
  if (!Array.isArray(formulas) || formulas.length === 0) {
    return
  }
  const normalizedFormulas = formulas.map((formula) => normalizeFormulaPersistenceRecord(formula, updatedAt))
  await runStatementBatches(
    db,
    normalizedFormulas.map((formula) =>
      db
        .prepare(
          `INSERT INTO formula_records (
            organization_id, id, brand_id, code, name, formula_type, workflow_status,
            status, version, draft_revision, record_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
          ON CONFLICT(organization_id, id) DO UPDATE SET
            brand_id = excluded.brand_id,
            code = excluded.code,
            name = excluded.name,
            formula_type = excluded.formula_type,
            workflow_status = excluded.workflow_status,
            status = excluded.status,
            version = excluded.version,
            draft_revision = excluded.draft_revision,
            record_json = excluded.record_json,
            updated_at = excluded.updated_at`,
        )
        .bind(
          formula.organizationId,
          formula.id,
          formula.brandId,
          formula.code,
          formula.name,
          formula.formulaType,
          formula.workflowStatus,
          formula.status,
          formula.version,
          formula.draftRevision,
          JSON.stringify(formula),
          updatedAt,
        ),
    ),
  )
}

async function persistFormulaVersions(db: D1Database, versions: FormulaVersionRecord[], updatedAt: string) {
  if (!Array.isArray(versions) || versions.length === 0) {
    return
  }
  const normalizedVersions = versions.map((version) => normalizeFormulaVersionPersistenceRecord(version, updatedAt))
  await runStatementBatches(
    db,
    normalizedVersions.map((version) =>
      db
        .prepare(
          `INSERT INTO formula_version_records (
            organization_id, id, formula_id, formula_code, version, status, created_at,
            created_by, checksum, record_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ON CONFLICT(organization_id, id) DO UPDATE SET
            formula_id = excluded.formula_id,
            formula_code = excluded.formula_code,
            version = excluded.version,
            status = excluded.status,
            created_at = excluded.created_at,
            created_by = excluded.created_by,
            checksum = excluded.checksum,
            record_json = excluded.record_json,
            updated_at = excluded.updated_at`,
        )
        .bind(
          version.organizationId,
          version.id,
          version.formulaId,
          version.formulaCode,
          version.version,
          version.status,
          version.createdAt,
          version.createdBy,
          version.checksum,
          JSON.stringify(version),
          updatedAt,
        ),
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
        organization_id, display_name, accent_color, document_footer, label_template, logo_mode, logo_image_url, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(organization_id) DO UPDATE SET
        display_name = excluded.display_name,
        accent_color = excluded.accent_color,
        document_footer = excluded.document_footer,
        label_template = excluded.label_template,
        logo_mode = excluded.logo_mode,
        logo_image_url = excluded.logo_image_url,
        updated_at = excluded.updated_at`,
    )
    .bind(
      branding.organizationId,
      branding.displayName,
      branding.accentColor,
      branding.documentFooter,
      branding.labelTemplate,
      branding.logoMode,
      branding.logoImageUrl ?? null,
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
            id, name, slug, custom_domain, plan, status, primary_contact, created_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            slug = excluded.slug,
            custom_domain = excluded.custom_domain,
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
          organization.customDomain ?? null,
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
        total, currency, status, created_at, lines_json
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
            total, currency, status, created_at, lines_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
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
            lines_json = excluded.lines_json,
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
          quote.lines ? JSON.stringify(quote.lines) : null,
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
        carrier, tracking_number, reservation_allocations_json, shipment_id, document_ids_json, lines_json, created_at
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
            document_ids_json, lines_json, created_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)
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
            lines_json = excluded.lines_json,
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
          order.lines ? JSON.stringify(order.lines) : null,
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

  const ssoRows = await db
    .prepare(
      `SELECT id, organization_id, provider, domain, status, issuer_url, metadata_url,
        client_id, acs_url, entity_id, domain_verified_at, jit_provisioning,
        enforce_sso, scim_json, role_mapping_json, config_updated_at
       FROM sso_configs
       ORDER BY organization_id ASC`,
    )
    .all<SsoConfigRow>()
  const ssoConfigs = (ssoRows.results ?? []).map(ssoConfigFromRow)
  if (ssoConfigs.length > 0) {
    serviceState.ssoConfigRecords = ssoConfigs
  } else if (Array.isArray(serviceState.ssoConfigRecords) && serviceState.ssoConfigRecords.length > 0) {
    await persistSsoConfigs(db, serviceState.ssoConfigRecords, new Date().toISOString())
  }

  const apiKeyRows = await db
    .prepare(
      `SELECT id, organization_id, label, prefix, last_four, scopes_json, created_at,
        created_by, rotated_at, last_used_at, expires_at, status, secret_hash
       FROM api_keys
       ORDER BY created_at DESC, id DESC`,
    )
    .all<ApiKeyRow>()
  const keys = (apiKeyRows.results ?? []).map(apiKeyFromRow)
  if (keys.length > 0) {
    serviceState.apiKeyRecords = keys
  } else if (Array.isArray(serviceState.apiKeyRecords) && serviceState.apiKeyRecords.length > 0) {
    await persistApiKeys(db, serviceState.apiKeyRecords, new Date().toISOString())
  }

  const webhookRows = await db
    .prepare(
      `SELECT id, organization_id, url, events_json, status, last_delivery, created_at,
        owner, signing_secret_last_four, signing_secret_rotated_at, failure_count
       FROM webhooks
       ORDER BY created_at DESC, id DESC`,
    )
    .all<WebhookRow>()
  const hookRecords = (webhookRows.results ?? []).map(webhookFromRow)
  if (hookRecords.length > 0) {
    serviceState.webhookRecords = hookRecords
  } else if (Array.isArray(serviceState.webhookRecords) && serviceState.webhookRecords.length > 0) {
    await persistWebhooks(db, serviceState.webhookRecords, new Date().toISOString())
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

  const exportRows = await db
    .prepare(
      `SELECT id, organization_id, requested_by, format, scope, status, event_count,
        checksum, download_url, created_at, completed_at, expires_at, audit_event_id
       FROM audit_export_jobs
       ORDER BY created_at DESC, id DESC`,
    )
    .all<AuditExportJobRow>()
  const exportJobs = (exportRows.results ?? []).map(auditExportJobFromRow)
  if (exportJobs.length > 0) {
    serviceState.auditExportRecords = exportJobs
  } else if (Array.isArray(serviceState.auditExportRecords) && serviceState.auditExportRecords.length > 0) {
    await persistAuditExportJobs(db, serviceState.auditExportRecords, new Date().toISOString())
  }
}

async function persistBillingState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistBillingSubscriptions(db, serviceState.subscriptionRecords, updatedAt)
  await persistBillingInvoices(db, serviceState.invoiceRecords, updatedAt)
  await persistSsoConfigs(db, serviceState.ssoConfigRecords, updatedAt)
  await persistApiKeys(db, serviceState.apiKeyRecords, updatedAt)
  await persistWebhooks(db, serviceState.webhookRecords, updatedAt)
  await persistWebhookDeliveries(db, serviceState.webhookDeliveryRecords, updatedAt)
  await persistAuditExportJobs(db, serviceState.auditExportRecords, updatedAt)
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

async function persistSsoConfigs(db: D1Database, configs: SsoConfigRecord[], updatedAt: string) {
  if (!Array.isArray(configs) || configs.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    configs.map((config) =>
      db
        .prepare(
          `INSERT INTO sso_configs (
            id, organization_id, provider, domain, status, issuer_url, metadata_url,
            client_id, acs_url, entity_id, domain_verified_at, jit_provisioning,
            enforce_sso, scim_json, role_mapping_json, config_updated_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
          ON CONFLICT(organization_id) DO UPDATE SET
            id = excluded.id,
            provider = excluded.provider,
            domain = excluded.domain,
            status = excluded.status,
            issuer_url = excluded.issuer_url,
            metadata_url = excluded.metadata_url,
            client_id = excluded.client_id,
            acs_url = excluded.acs_url,
            entity_id = excluded.entity_id,
            domain_verified_at = excluded.domain_verified_at,
            jit_provisioning = excluded.jit_provisioning,
            enforce_sso = excluded.enforce_sso,
            scim_json = excluded.scim_json,
            role_mapping_json = excluded.role_mapping_json,
            config_updated_at = excluded.config_updated_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          config.id,
          config.organizationId,
          config.provider,
          config.domain,
          config.status,
          config.issuerUrl,
          config.metadataUrl ?? null,
          config.clientId ?? null,
          config.acsUrl,
          config.entityId,
          config.domainVerifiedAt ?? null,
          config.jitProvisioning ? 1 : 0,
          config.enforceSso ? 1 : 0,
          JSON.stringify(config.scim),
          JSON.stringify(config.roleMapping),
          config.updatedAt,
          updatedAt,
        ),
    ),
  )
}

async function persistApiKeys(db: D1Database, keys: ApiKeyRecord[], updatedAt: string) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    keys.map((key) =>
      db
        .prepare(
          `INSERT INTO api_keys (
            id, organization_id, label, prefix, last_four, scopes_json, created_at,
            created_by, rotated_at, last_used_at, expires_at, status, secret_hash, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
            label = excluded.label,
            prefix = excluded.prefix,
            last_four = excluded.last_four,
            scopes_json = excluded.scopes_json,
            created_at = excluded.created_at,
            created_by = excluded.created_by,
            rotated_at = excluded.rotated_at,
            last_used_at = excluded.last_used_at,
            expires_at = excluded.expires_at,
            status = excluded.status,
            secret_hash = excluded.secret_hash,
            updated_at = excluded.updated_at`,
        )
        .bind(
          key.id,
          key.organizationId,
          key.label,
          key.prefix,
          key.lastFour,
          JSON.stringify(key.scopes),
          key.createdAt,
          key.createdBy,
          key.rotatedAt,
          key.lastUsedAt ?? null,
          key.expiresAt ?? null,
          key.status,
          key.secretHash ?? null,
          updatedAt,
        ),
    ),
  )
}

async function persistWebhooks(db: D1Database, hooks: WebhookRecord[], updatedAt: string) {
  if (!Array.isArray(hooks) || hooks.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    hooks.map((hook) =>
      db
        .prepare(
          `INSERT INTO webhooks (
            id, organization_id, url, events_json, status, last_delivery, created_at,
            owner, signing_secret_last_four, signing_secret_rotated_at, failure_count, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
            url = excluded.url,
            events_json = excluded.events_json,
            status = excluded.status,
            last_delivery = excluded.last_delivery,
            created_at = excluded.created_at,
            owner = excluded.owner,
            signing_secret_last_four = excluded.signing_secret_last_four,
            signing_secret_rotated_at = excluded.signing_secret_rotated_at,
            failure_count = excluded.failure_count,
            updated_at = excluded.updated_at`,
        )
        .bind(
          hook.id,
          hook.organizationId,
          hook.url,
          JSON.stringify(hook.events),
          hook.status,
          hook.lastDelivery,
          hook.createdAt,
          hook.owner,
          hook.signingSecretLastFour,
          hook.signingSecretRotatedAt,
          hook.failureCount,
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

async function persistAuditExportJobs(db: D1Database, jobs: AuditExportJobRecord[], updatedAt: string) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    jobs.map((job) =>
      db
        .prepare(
          `INSERT INTO audit_export_jobs (
            id, organization_id, requested_by, format, scope, status, event_count,
            checksum, download_url, created_at, completed_at, expires_at, audit_event_id, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
            requested_by = excluded.requested_by,
            format = excluded.format,
            scope = excluded.scope,
            status = excluded.status,
            event_count = excluded.event_count,
            checksum = excluded.checksum,
            download_url = excluded.download_url,
            created_at = excluded.created_at,
            completed_at = excluded.completed_at,
            expires_at = excluded.expires_at,
            audit_event_id = excluded.audit_event_id,
            updated_at = excluded.updated_at`,
        )
        .bind(
          job.id,
          job.organizationId,
          job.requestedBy,
          job.format,
          job.scope,
          job.status,
          job.eventCount,
          job.checksum,
          job.downloadUrl ?? null,
          job.createdAt,
          job.completedAt ?? null,
          job.expiresAt,
          job.auditEventId,
          updatedAt,
        ),
    ),
  )
}

async function hydrateInventoryState(db: D1Database, serviceState: ServiceState) {
  const lotRows = await db
    .prepare(
      `SELECT id, organization_id, material_id, lot_number, quantity_grams, reserved_grams, received_date, expiry_date,
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
            id, organization_id, material_id, lot_number, quantity_grams, reserved_grams, received_date, expiry_date,
            quality_status, location, unit_cost, supplier_lot_ref, currency, retest_date, opened_date,
            shelf_life_after_opening_days, container, packaging, coa_document_id, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
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
          lot.organizationId ?? 'org-nxl',
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

function mfaEnrollmentFromRow(row: MfaEnrollmentRow): MfaEnrollmentRecord {
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    encryptedSecret: row.encrypted_secret,
    recoveryCodeHashes: parseJson<string[]>(row.recovery_code_hashes_json, []).filter(
      (value): value is string => typeof value === 'string',
    ),
    createdAt: row.created_at,
    verifiedAt: row.verified_at ?? undefined,
    updatedAt: row.updated_at,
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
    sidebarMode: row.sidebar_mode === 'rail' ? 'rail' : 'expanded',
    reduceMotion: row.reduce_motion === 1,
    emailDigest: readEmailDigest(row.email_digest),
    accentColor: readAccentColor(row.accent_color),
    formulaWorkspace: readFormulaWorkspacePreferences(row.formula_workspace_json),
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
    customDomain: row.custom_domain ?? undefined,
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
    logoMode: row.logo_mode === 'monogram' || row.logo_mode === 'image' ? row.logo_mode : 'wordmark',
    logoImageUrl: row.logo_image_url?.trim() || undefined,
  }
}

function formulaFromRow(row: FormulaRecordRow): Formula | undefined {
  const record = parseJsonOptional<Formula>(row.record_json)
  if (!record || !Array.isArray(record.lines)) {
    return undefined
  }
  const workflowStatus: Formula['workflowStatus'] =
    row.workflow_status === 'IN_REVIEW' ||
    row.workflow_status === 'CHANGES_REQUESTED' ||
    row.workflow_status === 'APPROVED'
      ? row.workflow_status
      : 'DRAFT'
  return {
    ...record,
    organizationId: row.organization_id,
    id: row.id,
    brandId: row.brand_id,
    code: row.code,
    name: row.name,
    formulaType: row.formula_type === 'ACCORD' ? 'ACCORD' : 'FINE_FRAGRANCE',
    workflowStatus,
    status: readDomainStatus(row.status),
    version: row.version,
    draftRevision: Number(row.draft_revision),
    updatedAt: record.updatedAt || row.updated_at,
    approvalHistory: Array.isArray(record.approvalHistory) ? record.approvalHistory : [],
    lines: record.lines,
  }
}

function formulaVersionFromRow(row: FormulaVersionRecordRow): FormulaVersionRecord | undefined {
  const record = parseJsonOptional<FormulaVersionRecord>(row.record_json)
  if (!record || !Array.isArray(record.lines)) {
    return undefined
  }
  return {
    ...record,
    organizationId: row.organization_id,
    id: row.id,
    formulaId: row.formula_id,
    formulaCode: row.formula_code,
    version: row.version,
    status: row.status === 'APPROVED' ? 'APPROVED' : 'SNAPSHOT',
    createdAt: row.created_at,
    createdBy: row.created_by,
    checksum: row.checksum,
    evaluations: Array.isArray(record.evaluations) ? record.evaluations : [],
    resolvedLeaves: Array.isArray(record.resolvedLeaves) ? record.resolvedLeaves : [],
    evaporation:
      Array.isArray(record.evaporation) && record.evaporation.every((point) => Array.isArray(point?.materials))
        ? record.evaporation
        : [],
    lines: record.lines,
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
    lines: row.lines_json ? parseJson<NonNullable<QuoteRecord['lines']>>(row.lines_json, []) : undefined,
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
    lines: row.lines_json ? parseJson<NonNullable<SalesOrderRecord['lines']>>(row.lines_json, []) : undefined,
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

function ssoConfigFromRow(row: SsoConfigRow): SsoConfigRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider === 'SAML' ? 'SAML' : 'OIDC',
    domain: row.domain,
    status: row.status === 'enforced' ? 'enforced' : row.status === 'verified' ? 'verified' : 'draft',
    issuerUrl: row.issuer_url,
    metadataUrl: row.metadata_url ?? undefined,
    clientId: row.client_id ?? undefined,
    acsUrl: row.acs_url,
    entityId: row.entity_id,
    domainVerifiedAt: row.domain_verified_at ?? undefined,
    jitProvisioning: row.jit_provisioning === 1,
    enforceSso: row.enforce_sso === 1,
    scim: parseJson<SsoConfigRecord['scim']>(row.scim_json, {
      enabled: false,
      baseUrl: '',
      deprovisionAction: 'revoke_sessions',
      status: 'disabled',
    }),
    roleMapping: parseJson<Record<string, string>>(row.role_mapping_json, {}),
    updatedAt: row.config_updated_at,
  }
}

function apiKeyFromRow(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    prefix: row.prefix,
    lastFour: row.last_four,
    scopes: parseJson<string[]>(row.scopes_json, []).filter((scope): scope is string => typeof scope === 'string'),
    createdAt: row.created_at,
    createdBy: row.created_by,
    rotatedAt: row.rotated_at,
    lastUsedAt: row.last_used_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    status: row.status === 'revoked' ? 'revoked' : 'active',
    secretHash: row.secret_hash ?? undefined,
  }
}

function webhookFromRow(row: WebhookRow): WebhookRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    url: row.url,
    events: parseJson<string[]>(row.events_json, []).filter((event): event is string => typeof event === 'string'),
    status: row.status === 'paused' ? 'paused' : 'active',
    lastDelivery: row.last_delivery,
    createdAt: row.created_at,
    owner: row.owner,
    signingSecretLastFour: row.signing_secret_last_four,
    signingSecretRotatedAt: row.signing_secret_rotated_at,
    failureCount: Number(row.failure_count),
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

function auditExportJobFromRow(row: AuditExportJobRow): AuditExportJobRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    requestedBy: row.requested_by,
    format: row.format === 'CSV' ? 'CSV' : 'JSON',
    scope: row.scope,
    status:
      row.status === 'PROCESSING'
        ? 'PROCESSING'
        : row.status === 'READY'
          ? 'READY'
          : row.status === 'FAILED'
            ? 'FAILED'
            : 'QUEUED',
    eventCount: Number(row.event_count),
    checksum: row.checksum,
    downloadUrl: row.download_url ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    expiresAt: row.expires_at,
    auditEventId: row.audit_event_id,
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
    organizationId: row.organization_id,
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

function readFormulaWorkspacePreferences(value: string | null | undefined) {
  if (typeof value !== 'string' || !value.trim()) {
    return createDefaultFormulaWorkspacePreferences()
  }
  try {
    return normalizeFormulaWorkspacePreferences(JSON.parse(value), createDefaultFormulaWorkspacePreferences())
  } catch {
    return createDefaultFormulaWorkspacePreferences()
  }
}

function readAccentColor(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return '#4d9bff'
  }
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  const shortMatch = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(trimmed)
  if (shortMatch) {
    return `#${shortMatch[1]}${shortMatch[1]}${shortMatch[2]}${shortMatch[2]}${shortMatch[3]}${shortMatch[3]}`.toLowerCase()
  }
  return '#4d9bff'
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
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (!origin || !isAllowedCorsOrigin(origin, effectiveOrigins)) {
    return headers
  }
  headers['Access-Control-Allow-Origin'] = origin
  headers['Access-Control-Allow-Methods'] = 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS'
  headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-CSRF-Token'
  headers['Access-Control-Expose-Headers'] = 'Retry-After'
  headers['Access-Control-Allow-Credentials'] = 'true'
  return headers
}

function buildResponseHeaders(headers: HeadersInit, route: Route, result: unknown) {
  const responseHeaders = new Headers(headers)
  if (route.sessionCookie === 'set') {
    const sessionId = readResultSessionId(result)
    if (sessionId) {
      responseHeaders.set('Set-Cookie', buildSessionCookie(sessionId, tenantSessionCookieMaxAgeSeconds))
    }
  }
  if (route.sessionCookie === 'clear') {
    responseHeaders.set('Set-Cookie', buildSessionCookie('', 0))
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

function buildApiSecurityHeaders(headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Cache-Control', 'no-store, max-age=0')
  responseHeaders.set('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
  responseHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  responseHeaders.set('Referrer-Policy', 'no-referrer')
  responseHeaders.set('Strict-Transport-Security', 'max-age=31536000')
  responseHeaders.set('X-Content-Type-Options', 'nosniff')
  responseHeaders.set('X-Frame-Options', 'DENY')
  responseHeaders.set('X-Permitted-Cross-Domain-Policies', 'none')
  return responseHeaders
}

function json(payload: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = buildApiSecurityHeaders(headers)
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders,
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
  const responseHeaders = new Headers(headers)
  const retryAfterSeconds = Number((payload as Record<string, unknown>).retryAfterSeconds)
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    responseHeaders.set('Retry-After', String(Math.ceil(retryAfterSeconds)))
  }
  return json(payload, status, responseHeaders)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
