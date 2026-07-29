import { NorthStarService, type MfaEnrollmentRecord, type PasswordResetRecord } from '../server/src/services/northstar.service.js'
import {
  cloudflareValidation as providerCloudflareValidation,
  cloudflareVerificationErrors as providerCloudflareVerificationErrors,
  probeHttpsOrigin,
  requestCloudflareSaas,
  requestStripeForm,
  sendResendEmail,
} from './provider-adapters.js'
import {
  AgentRuntimeStore,
  actorFromService,
  configuredAgentProvider,
  ensureAgentReadAccess,
  executeDeterministicAgentRun,
} from './agent-runtime.js'
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
  type FinishedGoodLotRecord,
  type FinishedGoodMovementRecord,
  type Formula,
  type FormulaVersionRecord,
  type InventoryLot,
  type InventoryMovement,
  type LabUsageRecord,
  type MembershipRecord,
  type Material,
  type MaterialComplianceProfile,
  type MoleculeComponent,
  type NumberingSequenceRecord,
  type OrderDocumentRecord,
  type OrganizationRecord,
  type PriceHistoryRecord,
  type PriceListRecord,
  type ProductionBatchRecord,
  type ProductionQcResultRecord,
  type ProductionQcTemplateRecord,
  type ProductionYieldRecord,
  type ProcurementReceiptRecord,
  type LandedCostAllocationRecord,
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
  type SupplierMaterialProfile,
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
  DOCUMENTS?: KVNamespace
  CORS_ORIGINS?: string
  SEEDED_ADMIN_PASSWORD_HASH?: string
  MFA_ENCRYPTION_KEY?: string
  DOCUMENT_SIGNING_KEY?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_ARTISAN?: string
  STRIPE_PRICE_ATELIER?: string
  STRIPE_PRICE_MAISON?: string
  BILLING_RETURN_URL?: string
  BILLING_MODE?: 'managed_beta' | 'self_service'
  BETA_APP_ORIGIN?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  SENTRY_DSN?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_SAAS_ZONE_ID?: string
  CLOUDFLARE_SAAS_ORIGIN?: string
  AGENT_PROVIDER?: 'mock' | 'openai'
  OPENAI_API_KEY?: string
  OPENAI_FORMULA_AGENT_MODEL?: string
  AGENT_CONTEXT_ENCRYPTION_KEY?: string
}

type RouteContext = {
  service: NorthStarService
  params: Record<string, string>
  query: URLSearchParams
  body: Record<string, unknown>
  rawBody?: string
  formData?: FormData
  env: Env
  request: Request
  ctx: ExecutionContext
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
  formData?: boolean
  idempotent?: boolean
  persistState?: boolean
  handler: (context: RouteContext) => unknown
}

export type AuthCredential = {
  sessionId?: string
  sessionSecret?: string
  source: 'cookie' | 'bearer' | 'none'
}

type RateLimitPolicy = {
  key: 'auth-login' | 'auth-signup' | 'auth-reset' | 'authenticated-mutation' | 'sensitive-mutation'
  scope: 'client-email' | 'client' | 'session'
  limit: number
  windowSeconds: number
  message: string
}

type OperationIdempotencyClaim = {
  organizationId: string
  operation: string
  key: string
  requestHash: string
}

type OperationIdempotencyRow = {
  request_hash: string
  status: 'PENDING' | 'COMPLETED'
  response_json: string | null
}

type SnapshotKey =
  | 'materialRecords'
  | 'materialComplianceRecords'
  | 'supplierMaterialProfileRecords'
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
  | 'tenantSettingsRecords'
  | 'flagRecords'
  | 'sequences'
  | 'customFieldRecords'
  | 'brandingRecord'
  | 'productionBatchRecords'
  | 'finishedGoodLotRecords'
  | 'finishedGoodMovementRecords'
  | 'supplierRecords'
  | 'purchaseOrderRecords'
  | 'priceHistoryRecords'
  | 'procurementReceiptRecords'
  | 'landedCostAllocationRecords'
  | 'productionQcTemplateRecords'
  | 'productionQcResultRecords'
  | 'productionYieldRecords'
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
  materialComplianceRecords: MaterialComplianceProfile[]
  supplierMaterialProfileRecords: SupplierMaterialProfile[]
  moleculeRecords: MoleculeComponent[]
  locationRecords: StorageLocation[]
  stockTakeRecords: StockTakeRecord[]
  formulaRecords: Formula[]
  formulaVersionRecords: FormulaVersionRecord[]
  tenantSettingsRecords: TenantSettingsRecord[]
  flagRecords: FeatureFlagRecord[]
  sequences: NumberingSequenceRecord[]
  customFieldRecords: CustomFieldDefinition[]
  brandingRecord: BrandingConfig
  documentRecords: DocumentRecord[]
  productionBatchRecords: ProductionBatchRecord[]
  finishedGoodLotRecords: FinishedGoodLotRecord[]
  finishedGoodMovementRecords: FinishedGoodMovementRecord[]
  supplierRecords: SupplierRecord[]
  purchaseOrderRecords: PurchaseOrderRecord[]
  priceHistoryRecords: PriceHistoryRecord[]
  procurementReceiptRecords: ProcurementReceiptRecord[]
  landedCostAllocationRecords: LandedCostAllocationRecord[]
  productionQcTemplateRecords: ProductionQcTemplateRecord[]
  productionQcResultRecords: ProductionQcResultRecord[]
  productionYieldRecords: ProductionYieldRecord[]
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
const MAX_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024
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
  'materialComplianceRecords',
  'supplierMaterialProfileRecords',
  'moleculeRecords',
  'locationRecords',
  'stockTakeRecords',
  'formulaRecords',
  'formulaVersionRecords',
  'tenantSettingsRecords',
  'flagRecords',
  'sequences',
  'customFieldRecords',
  'brandingRecord',
  'documentRecords',
  'productionBatchRecords',
  'finishedGoodLotRecords',
  'finishedGoodMovementRecords',
  'supplierRecords',
  'purchaseOrderRecords',
  'priceHistoryRecords',
  'procurementReceiptRecords',
  'landedCostAllocationRecords',
  'productionQcTemplateRecords',
  'productionQcResultRecords',
  'productionYieldRecords',
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
  'authCredentialRecords',
  'passwordResetRecords',
  'importJobRecords',
  'legalAcceptanceRecords',
  'privacyRequestRecords',
  'customDomainRecords',
  'inventoryApprovalRequestRecords',
  'operationApprovalRequestRecords',
  'lots',
  'movements',
  'usageHistory',
])
const SNAPSHOT_KEYS: SnapshotKey[] = [
  'materialRecords',
  'materialComplianceRecords',
  'supplierMaterialProfileRecords',
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
  'tenantSettingsRecords',
  'flagRecords',
  'sequences',
  'customFieldRecords',
  'brandingRecord',
  'productionBatchRecords',
  'finishedGoodLotRecords',
  'finishedGoodMovementRecords',
  'supplierRecords',
  'purchaseOrderRecords',
  'priceHistoryRecords',
  'procurementReceiptRecords',
  'landedCostAllocationRecords',
  'productionQcTemplateRecords',
  'productionQcResultRecords',
  'productionYieldRecords',
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
const D1_NORMALIZED_CUTOVER_KEY = 'd1-normalized-state-v1'
const SEEDED_ADMIN_EMAIL = 'admin@labofscents.org'
const SEEDED_ADMIN_ORGANIZATION_ID = 'org-nxl'
const SEEDED_ADMIN_ROLE = 'Admin'
const SEEDED_ADMIN_PASSWORD_SET_AT = '2026-07-16T00:00:00.000Z'
const NORMALIZED_TABLES = [
  'auth_sessions',
  'mfa_enrollments',
  'user_settings',
  'tenant_audit_events',
  'platform_audit_events',
  'tenant_audit_chain_events',
  'security_rate_limits',
  'tenant_organizations',
  'tenant_brands',
  'tenant_memberships',
  'tenant_role_policies',
  'platform_role_policies',
  'material_records',
  'material_compliance_profiles',
  'supplier_material_profiles',
  'molecule_components',
  'storage_locations',
  'stock_take_records',
  'tenant_settings',
  'tenant_feature_flags',
  'tenant_numbering_sequences',
  'tenant_custom_fields',
  'tenant_branding',
  'formula_records',
  'formula_version_records',
  'document_records',
  'production_batches',
  'finished_good_lots',
  'finished_good_movements',
  'suppliers',
  'purchase_orders',
  'price_history',
  'procurement_receipts',
  'landed_cost_allocations',
  'production_qc_templates',
  'production_qc_results',
  'production_yield_records',
  'operation_idempotency_records',
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
  'notification_outbox',
  'persistence_metadata',
  'auth_credentials',
  'password_reset_records',
  'import_jobs',
  'legal_acceptance_records',
  'privacy_requests',
  'saas_custom_domains',
  'inventory_approval_requests',
  'operation_approval_requests',
  'inventory_lots',
  'inventory_movements',
  'lab_usage_records',
]

const routes: Route[] = [
  { method: 'GET', pattern: '/health', public: true, hydrateState: false, handler: () => ({ ok: true, service: 'olfactoryops-worker-api', version: '0.1.0-cloudflare-d1', timestamp: new Date().toISOString() }) },
  { method: 'GET', pattern: '/status', public: true, hydrateState: false, handler: ({ env }) => publicStatus(env) },
  { method: 'GET', pattern: '/version', public: true, hydrateState: false, handler: () => ({ data: { name: 'OlfactoryOps Cloudflare Worker API', stack: ['Cloudflare Workers', 'D1', 'TypeScript'], api: API_PREFIX } }) },
  { method: 'GET', pattern: '/persistence/status', handler: ({ service }) => service.persistenceStatus({ adapter: 'cloudflare-d1-normalized', snapshotKeys: SNAPSHOT_PERSIST_KEYS.length, snapshotTable: 'legacy-northstar_snapshots-cutover-only', normalizedTables: NORMALIZED_TABLES }) },
  { method: 'GET', pattern: '/phases', handler: ({ service }) => service.phases() },
  { method: 'GET', pattern: '/domains', handler: ({ service }) => service.domains() },
  { method: 'GET', pattern: '/materials', handler: ({ service }) => service.materials() },
  { method: 'GET', pattern: '/materials/dedupe', handler: ({ service, query }) => service.materialDedupe(query.get('cas') ?? '') },
  { method: 'POST', pattern: '/materials', mutates: true, limitKey: 'materials', handler: ({ service, body }) => service.createMaterial(body) },
  { method: 'GET', pattern: '/materials/:id', handler: ({ service, params }) => service.material(params.id) },
  { method: 'PATCH', pattern: '/materials/:id', mutates: true, handler: ({ service, params, body }) => service.updateMaterial(params.id, body) },
  { method: 'GET', pattern: '/materials/:id/compliance', handler: ({ service, params }) => service.materialCompliance(params.id) },
  { method: 'PUT', pattern: '/materials/:id/compliance', mutates: true, idempotent: true, handler: ({ service, params, body }) => service.upsertMaterialCompliance(params.id, body) },
  { method: 'POST', pattern: '/materials/:id/ingest', mutates: true, handler: ({ service, params, body }) => service.ingestMaterialDocument(params.id, body) },
  { method: 'POST', pattern: '/materials/:id/pubchem-fill', mutates: true, handler: ({ service, params }) => service.pubchemFill(params.id) },
  { method: 'GET', pattern: '/materials/:id/molecules', handler: ({ service, params }) => service.materialMolecules(params.id) },
  { method: 'GET', pattern: '/materials/:id/provenance', handler: ({ service, params }) => service.materialProvenance(params.id) },
  { method: 'GET', pattern: '/materials/:id/price-history', handler: ({ service, params }) => service.materialPriceHistory(params.id) },
  { method: 'POST', pattern: '/imports/preview', mutates: true, rateLimit: sensitiveMutationRateLimit, handler: ({ service, body }) => service.previewImport(body) },
  { method: 'POST', pattern: '/imports/:id/commit', mutates: true, rateLimit: sensitiveMutationRateLimit, handler: ({ service, params }) => service.commitImport(params.id) },
  { method: 'GET', pattern: '/formulas', handler: ({ service }) => service.formulas() },
  { method: 'POST', pattern: '/agent/runs', mutates: true, idempotent: true, persistState: false, writeGate: false, handler: (context) => createAgentRun(context) },
  { method: 'GET', pattern: '/agent/runs', persistState: false, handler: ({ service, env }) => new AgentRuntimeStore(env.DB).list(ensureAgentReadAccess(service)) },
  { method: 'GET', pattern: '/agent/runs/:id', persistState: false, handler: ({ service, env, params }) => new AgentRuntimeStore(env.DB).detail(ensureAgentReadAccess(service), params.id) },
  { method: 'GET', pattern: '/agent/runs/:id/events', persistState: false, handler: ({ service, env, params, query }) => new AgentRuntimeStore(env.DB).events(ensureAgentReadAccess(service), params.id, readAgentSequence(query.get('afterSequence'))) },
  { method: 'GET', pattern: '/agent/runs/:id/artifacts', persistState: false, handler: ({ service, env, params }) => new AgentRuntimeStore(env.DB).artifacts(ensureAgentReadAccess(service), params.id) },
  { method: 'GET', pattern: '/agent/runs/:id/artifacts/:artifactId', persistState: false, handler: ({ service, env, params }) => new AgentRuntimeStore(env.DB).artifact(ensureAgentReadAccess(service), params.id, params.artifactId) },
  { method: 'GET', pattern: '/agent/runs/:id/stream', persistState: false, handler: ({ service, env, params, query, request }) => new AgentRuntimeStore(env.DB).stream(ensureAgentReadAccess(service), params.id, readAgentStreamSequence(request, query)) },
  { method: 'POST', pattern: '/agent/runs/:id/cancel', mutates: true, idempotent: true, persistState: false, writeGate: false, handler: ({ service, env, params }) => new AgentRuntimeStore(env.DB).cancel(ensureAgentReadAccess(service), params.id) },
  { method: 'POST', pattern: '/agent/runs/:id/resume', mutates: true, idempotent: true, persistState: false, writeGate: false, handler: (context) => resumeAgentRun(context) },
  { method: 'POST', pattern: '/agent/runs/:id/nodes/:nodeId/retry', mutates: true, idempotent: true, persistState: false, writeGate: false, handler: (context) => retryAgentNode(context) },
  { method: 'POST', pattern: '/agent/runs/:id/confirmations/:confirmationId', mutates: true, idempotent: true, writeGate: false, handler: (context) => resolveAgentConfirmation(context) },
  { method: 'POST', pattern: '/agent/runs/:id/restart', mutates: true, idempotent: true, persistState: false, writeGate: false, handler: (context) => restartAgentRun(context) },
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
  { method: 'GET', pattern: '/inventory/aging-report', handler: ({ service }) => service.inventoryAgingReport() },
  { method: 'POST', pattern: '/inventory/expiry/refresh', mutates: true, handler: ({ service }) => service.refreshInventoryExpiry() },
  { method: 'POST', pattern: '/inventory/stock-takes', mutates: true, handler: ({ service, body }) => service.performStockTake(body) },
  { method: 'GET', pattern: '/storage-locations', handler: ({ service }) => service.storageLocationsList() },
  { method: 'POST', pattern: '/storage-locations', mutates: true, handler: ({ service, body }) => service.createStorageLocation(body) },
  { method: 'PATCH', pattern: '/storage-locations/:id', mutates: true, handler: ({ service, params, body }) => service.updateStorageLocation(params.id, body) },
  { method: 'DELETE', pattern: '/storage-locations/:id', mutates: true, handler: ({ service, params }) => service.deleteStorageLocation(params.id) },
  { method: 'PATCH', pattern: '/lots/:id/quality', mutates: true, handler: ({ service, params, body }) => service.changeLotQuality(params.id, body) },
  { method: 'POST', pattern: '/lots/:id/label', handler: ({ service, params }) => service.lotLabel(params.id) },
  { method: 'GET', pattern: '/lots/:id/genealogy', handler: ({ service, params }) => service.lotGenealogy(params.id) },
  { method: 'POST', pattern: '/inventory/receipts', mutates: true, limitKey: 'lots', handler: ({ service, body }) => service.receiveInventoryReceipt(body) },
  { method: 'POST', pattern: '/inventory/adjustments', mutates: true, handler: ({ service, body }) => service.adjustInventory(body) },
  { method: 'POST', pattern: '/inventory/write-offs', mutates: true, handler: ({ service, body }) => service.writeOffInventory(body) },
  { method: 'POST', pattern: '/inventory/transfers', mutates: true, handler: ({ service, body }) => service.transferInventory(body) },
  { method: 'POST', pattern: '/inventory/transfers/:id/complete', mutates: true, handler: ({ service, params }) => service.completeInventoryTransfer(params.id) },
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
  { method: 'GET', pattern: '/audit/chain/verify', handler: async ({ service, env }) => verifyAuditChain(service, env.DB) },
  { method: 'GET', pattern: '/audit/chain/evidence', handler: async ({ service, env }) => auditChainEvidence(service, env.DB) },
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
  { method: 'GET', pattern: '/documents/:id/content', public: true, hydrateState: false, handler: ({ params, query, env }) => serveDocumentContent(params.id, query, env) },
  { method: 'GET', pattern: '/documents', handler: ({ service }) => service.documents() },
  { method: 'GET', pattern: '/documents/search', handler: ({ service, query }) => service.searchDocuments(query.get('q') ?? '', { type: query.get('type') ?? undefined, status: query.get('status') ?? undefined, linkedTo: query.get('linkedTo') ?? undefined, tag: query.get('tag') ?? undefined }) },
  { method: 'GET', pattern: '/documents/:id/versions', handler: ({ service, params }) => service.documentVersions(params.id) },
  { method: 'GET', pattern: '/documents/compliance-dashboard', handler: ({ service }) => service.documentComplianceDashboard() },
  { method: 'POST', pattern: '/documents/upload', mutates: true, formData: true, limitKey: 'documents', rateLimit: sensitiveMutationRateLimit, handler: ({ service, env, formData }) => handleDocumentUpload(service, env, formData) },
  { method: 'POST', pattern: '/documents/generate', mutates: true, limitKey: 'documents', handler: ({ service, body, env }) => generateDocumentObject(service, env, body) },
  { method: 'POST', pattern: '/documents/:id/approve', mutates: true, handler: ({ service, params, body }) => service.approveDocument(params.id, body) },
  { method: 'POST', pattern: '/documents/:id/scan-result', mutates: true, handler: ({ service, params, body }) => service.recordDocumentScanResult(params.id, body) },
  { method: 'POST', pattern: '/documents/:id/archive', mutates: true, handler: ({ service, params, body }) => service.archiveDocument(params.id, body) },
  { method: 'POST', pattern: '/documents/:id/share', mutates: true, handler: ({ service, params, body, env, request }) => shareDocumentObject(service, env, request, params.id, body) },
  { method: 'GET', pattern: '/documents/download-audit', handler: ({ service }) => service.documentDownloadAudit() },
  { method: 'POST', pattern: '/documents/:id/signed-url', mutates: true, handler: ({ service, params, env, request }) => signDocumentDownload(service, env, request, params.id) },
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
  { method: 'GET', pattern: '/production/schedule', handler: ({ service }) => service.productionSchedule() },
  { method: 'PATCH', pattern: '/production/batches/:id/plan', mutates: true, idempotent: true, handler: ({ service, params, body }) => service.planProductionBatch(params.id, body) },
  { method: 'GET', pattern: '/production/qc-templates', handler: ({ service }) => service.productionQcTemplates() },
  { method: 'POST', pattern: '/production/qc-templates', mutates: true, idempotent: true, handler: ({ service, body }) => service.createProductionQcTemplate(body) },
  { method: 'GET', pattern: '/production/batches/:id/qc/results', handler: ({ service, params }) => service.productionQcResults(params.id) },
  { method: 'POST', pattern: '/production/batches/:id/qc/results', mutates: true, idempotent: true, handler: ({ service, params, body }) => service.recordProductionQcResult(params.id, body) },
  { method: 'POST', pattern: '/production/batches/:id/qc/approve', mutates: true, idempotent: true, handler: ({ service, params }) => service.approveProductionQc(params.id) },
  { method: 'POST', pattern: '/production/batches/:id/yield', mutates: true, idempotent: true, handler: ({ service, params, body }) => service.recordProductionYield(params.id, body) },
  { method: 'POST', pattern: '/production/batches/:id/qc', mutates: true, handler: ({ service, params, body }) => service.qcProductionBatch(params.id, body.result === 'FAILED' ? 'FAILED' : 'PASSED') },
  { method: 'PATCH', pattern: '/production/batches/:id/status', mutates: true, handler: ({ service, params, body }) => service.updateProductionBatchStatus(params.id, readProductionStatus(body.status)) },
  { method: 'GET', pattern: '/production/finished-goods', handler: ({ service }) => service.finishedGoodLots() },
  { method: 'GET', pattern: '/suppliers', handler: ({ service }) => service.suppliers() },
  { method: 'POST', pattern: '/suppliers', mutates: true, handler: ({ service, body }) => service.createSupplier(body) },
  { method: 'GET', pattern: '/suppliers/:id/material-profiles', handler: ({ service, params }) => service.supplierMaterialProfiles(params.id) },
  { method: 'PUT', pattern: '/suppliers/:id/material-profiles/:materialId', mutates: true, idempotent: true, handler: ({ service, params, body }) => service.upsertSupplierMaterialProfile(params.id, params.materialId, body) },
  { method: 'POST', pattern: '/procurement/rfq/compare', mutates: true, handler: ({ service, body }) => service.compareSupplierRfq(body) },
  { method: 'POST', pattern: '/procurement/rfq/award', mutates: true, handler: ({ service, body }) => service.awardSupplierRfq(body) },
  { method: 'GET', pattern: '/purchase-orders', handler: ({ service }) => service.purchaseOrders() },
  { method: 'POST', pattern: '/purchase-orders', mutates: true, handler: ({ service, body }) => service.createPurchaseOrder(body) },
  { method: 'PATCH', pattern: '/purchase-orders/:id/status', mutates: true, handler: ({ service, params, body }) => service.updatePurchaseOrderStatus(params.id, readPurchaseOrderStatus(body.status)) },
  { method: 'POST', pattern: '/purchase-orders/:id/receive', mutates: true, handler: ({ service, params, body }) => service.receivePurchaseOrder(params.id, body) },
  { method: 'GET', pattern: '/procurement/receipts', handler: ({ service }) => service.procurementReceipts() },
  { method: 'POST', pattern: '/purchase-orders/:id/receipts', mutates: true, idempotent: true, handler: ({ service, params, body }) => service.createProcurementReceipt(params.id, body) },
  { method: 'POST', pattern: '/procurement/receipts/:id/landed-cost', mutates: true, idempotent: true, handler: ({ service, params, body }) => service.postProcurementLandedCost(params.id, body) },
  { method: 'POST', pattern: '/procurement/receipts/:id/inspect', mutates: true, idempotent: true, handler: ({ service, params, body }) => service.inspectProcurementReceipt(params.id, body) },
  { method: 'GET', pattern: '/catalog/skus', handler: ({ service }) => service.catalogSkus() },
  { method: 'POST', pattern: '/catalog/skus', mutates: true, handler: ({ service, body }) => service.createCatalogSku(body) },
  { method: 'GET', pattern: '/price-lists', handler: ({ service }) => service.priceLists() },
  { method: 'POST', pattern: '/price-lists', mutates: true, handler: ({ service, body }) => service.createPriceList(body) },
  { method: 'GET', pattern: '/quotes', handler: ({ service }) => service.quotes() },
  { method: 'POST', pattern: '/quotes', mutates: true, handler: ({ service, body }) => service.createQuote(body) },
  { method: 'PATCH', pattern: '/quotes/:id/status', mutates: true, handler: ({ service, params, body }) => service.updateQuoteStatus(params.id, body) },
  { method: 'POST', pattern: '/quotes/:id/convert', mutates: true, handler: ({ service, params }) => service.convertQuoteToOrder(params.id) },
  { method: 'GET', pattern: '/samples', handler: ({ service }) => service.samples() },
  { method: 'POST', pattern: '/samples', mutates: true, handler: ({ service, body }) => service.requestSample(body) },
  { method: 'PATCH', pattern: '/samples/:id/status', mutates: true, handler: ({ service, params, body }) => service.updateSampleStatus(params.id, body) },
  { method: 'GET', pattern: '/customers', handler: ({ service }) => service.customers() },
  { method: 'POST', pattern: '/customers', mutates: true, handler: ({ service, body }) => service.createCustomer(body) },
  { method: 'GET', pattern: '/orders', handler: ({ service }) => service.orders() },
  { method: 'POST', pattern: '/orders', mutates: true, handler: ({ service, body }) => service.createOrder(body) },
  { method: 'POST', pattern: '/orders/:id/reserve', mutates: true, handler: ({ service, params, body }) => service.reserveOrder(params.id, body) },
  { method: 'POST', pattern: '/orders/:id/cancel', mutates: true, handler: ({ service, params }) => service.cancelOrder(params.id) },
  { method: 'POST', pattern: '/orders/:id/pack', mutates: true, handler: ({ service, params, body }) => service.packOrder(params.id, body) },
  { method: 'POST', pattern: '/orders/:id/ship', mutates: true, handler: ({ service, params, body }) => service.shipOrder(params.id, body) },
  { method: 'POST', pattern: '/orders/:id/fulfill', mutates: true, handler: ({ service, params }) => service.fulfillOrder(params.id) },
  { method: 'GET', pattern: '/shipments', handler: ({ service }) => service.shipments() },
  { method: 'GET', pattern: '/order-documents', handler: ({ service }) => service.orderDocuments() },
  { method: 'GET', pattern: '/costing/overview', handler: ({ service }) => service.costingOverview() },
  { method: 'GET', pattern: '/costing/formulas/:id', handler: ({ service, params }) => service.costingFormula(params.id) },
  { method: 'GET', pattern: '/costing/batches/:id', handler: ({ service, params }) => service.costingBatch(params.id) },
  { method: 'GET', pattern: '/costing/finished-goods', handler: ({ service }) => service.finishedGoodCosting() },
  { method: 'GET', pattern: '/costing/skus/:id', handler: ({ service, params }) => service.costingSku(params.id) },
  { method: 'GET', pattern: '/costing/valuation', handler: ({ service }) => service.costingValuation() },
  { method: 'GET', pattern: '/analytics/dashboard', handler: ({ service }) => service.analyticsDashboard() },
  { method: 'GET', pattern: '/analytics/operations', handler: ({ service }) => service.operationalAnalytics() },
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
  { method: 'GET', pattern: '/integrations/readiness', handler: async ({ service, env }) => integrationReadiness(service, env) },
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

function readAgentSequence(value: string | null) {
  const parsed = Number(value ?? '0')
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function readAgentStreamSequence(request: Request, query: URLSearchParams) {
  const header = request.headers.get('Last-Event-ID')
  return readAgentSequence(header ?? query.get('afterSequence'))
}

async function createAgentRun(context: RouteContext) {
  const actor = ensureAgentReadAccess(context.service)
  const store = new AgentRuntimeStore(context.env.DB)
  const result = await store.create(actor, context.body, configuredAgentProvider(context.env))
  const runId = result.data.run.id
  context.ctx.waitUntil(executeDeterministicAgentRun(store, context.service, actor, runId))
  return result
}

async function resumeAgentRun(context: RouteContext) {
  const actor = ensureAgentReadAccess(context.service)
  const store = new AgentRuntimeStore(context.env.DB)
  const result = await store.resume(actor, context.params.id)
  context.ctx.waitUntil(executeDeterministicAgentRun(store, context.service, actor, context.params.id))
  return result
}

async function retryAgentNode(context: RouteContext) {
  const actor = ensureAgentReadAccess(context.service)
  const store = new AgentRuntimeStore(context.env.DB)
  const result = await store.retryNode(actor, context.params.id, context.params.nodeId)
  context.ctx.waitUntil(executeDeterministicAgentRun(store, context.service, actor, context.params.id))
  return result
}

async function restartAgentRun(context: RouteContext) {
  const actor = ensureAgentReadAccess(context.service)
  const prior = await new AgentRuntimeStore(context.env.DB).detail(actor, context.params.id)
  const result = await new AgentRuntimeStore(context.env.DB).create(actor, { brief: prior.data.run.input_brief }, configuredAgentProvider(context.env))
  context.ctx.waitUntil(executeDeterministicAgentRun(new AgentRuntimeStore(context.env.DB), context.service, actor, result.data.run.id))
  return { data: { previousRunId: context.params.id, run: result.data.run } }
}

async function resolveAgentConfirmation(context: RouteContext) {
  const actor = ensureAgentReadAccess(context.service)
  const store = new AgentRuntimeStore(context.env.DB)
  const decision = typeof context.body.decision === 'string' ? context.body.decision : 'accept'
  if (decision === 'reject') return store.rejectConfirmation(actor, context.params.id, context.params.confirmationId)
  const confirmation = await store.acceptConfirmation(actor, context.params.id, context.params.confirmationId)
  if (confirmation.alreadyAccepted) {
    return { data: { duplicate: true, summary: confirmation.summary, invariant: 'confirmation ID is idempotent; no additional formula draft was created' } }
  }
  const created = context.service.createFormulaDraft({
    name: confirmation.proposal.name,
    formulaType: confirmation.proposal.formulaType,
    targetGrams: confirmation.proposal.targetGrams,
    concentrationType: confirmation.proposal.concentrationType,
    finalProductConcentrationPercent: confirmation.proposal.finalProductConcentrationPercent,
    ifraCategory: confirmation.proposal.ifraCategory,
    brief: confirmation.proposal.brief,
  }).data.formula
  const materialNames = new Map(context.service.materials().data.map((material) => [material.id, material.name]))
  const updated = context.service.updateFormulaDraft(created.id, {
    expectedRevision: created.draftRevision,
    lines: confirmation.proposal.ingredients.map((ingredient, index) => ({
      id: `agent-${index + 1}`,
      label: materialNames.get(ingredient.materialId) ?? ingredient.materialId,
      materialId: ingredient.materialId,
      grams: Number((confirmation.proposal.targetGrams * ingredient.percentage / 100).toFixed(4)),
      concentration: ingredient.dilution ?? 100,
      pyramidNote: ingredient.pyramidNote,
    })),
  }).data.formula
  await store.attachSavedFormula(actor, context.params.id, context.params.confirmationId, updated.id)
  return {
    data: {
      formula: updated,
      confirmationId: context.params.confirmationId,
      invariant: 'agent confirmation creates one editable draft and does not reserve or consume inventory',
    },
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startedAt = Date.now()
    let routeLabel = 'unmatched'
    const origin = request.headers.get('Origin')
    const corsHeaders = buildCorsHeaders(origin, env.CORS_ORIGINS)
    let service: NorthStarService | undefined
    let skipSecurityPersistence = false
    let mfaVerificationRequest = false
    let idempotencyClaim: OperationIdempotencyClaim | undefined
    let mutationPersisted = false
    let issuedSessionCredential: string | undefined

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
      const formData = match.route.formData ? await readDocumentFormData(request) : undefined
      const body = rawBody === undefined && formData === undefined ? await readJsonBody(request) : {}
      if (match.route.hydrateState !== false) {
        await assertPersistenceReady(env.DB)
      }
      let credential: AuthCredential = { source: 'none' }
      if (!match.route.public) {
        credential = await resolveActiveSessionCredential(env.DB, readSessionCredential(request.headers))
      }
      if (match.route.public && match.route.rateLimit) {
        await assertRateLimit(env.DB, match.route.rateLimit, request, body, credential)
      }

      service = new NorthStarService({
        authCredentials: seededAdminCredentialsForEnv(env),
        mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
        billingMode: billingModeFromEnv(env),
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
      if (match.route.idempotent) {
        const key = request.headers.get('Idempotency-Key')?.trim()
        if (!key || key.length < 8 || key.length > 160) {
          throw new UnprocessableEntityException('Idempotency-Key header must be between 8 and 160 characters')
        }
        const session = (service as unknown as ServiceState).sessions.find((item) => item.id === credential.sessionId)
        if (!session) {
          throw new UnauthorizedException('Authentication required')
        }
        const operation = `${request.method} ${match.route.pattern}`
        const requestHash = await operationRequestHash(request.method, path, body)
        const claim = await claimOperationIdempotency(env.DB, {
          organizationId: session.organizationId,
          operation,
          key,
          requestHash,
        })
        if ('response' in claim) {
          return json(claim.response, 200, buildResponseHeaders(corsHeaders, match.route, claim.response))
        }
        idempotencyClaim = claim
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
        formData,
        env,
        request,
        ctx,
      })
      if (match.route.mutates) {
        await deliverNotificationOutbox(service, env)
      }
      let refreshSnapshotCache = false

      if ((match.route.mutates && match.route.persistState !== false) || service.hasSecurityStateChanges()) {
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
        mutationPersisted = true
      }
      if (idempotencyClaim && !(result instanceof Response)) {
        await completeOperationIdempotency(env.DB, idempotencyClaim, result)
      }
      if (refreshSnapshotCache) {
        refreshCachedSnapshotState(service)
        refreshWorkspaceBrandingCache(service, credential.sessionId)
      }
      if (match.route.sessionCookie === 'set' && !(result instanceof Response)) {
        const sessionId = readResultSessionId(result)
        if (!sessionId) {
          throw new UnauthorizedException('Authenticated session issuance failed')
        }
        issuedSessionCredential = await issueSessionCredential(env.DB, sessionId)
      }

      const response = result instanceof Response
        ? withApiSecurityHeaders(result, corsHeaders)
        : json(result, 200, buildResponseHeaders(corsHeaders, match.route, result, issuedSessionCredential))
      const durationMs = Date.now() - startedAt
      if (durationMs >= 1200) {
        ctx.waitUntil(recordRuntimeEvent(env.DB, { route: routeLabel, status: response.status, durationMs, category: 'latency' }))
      }
      return response
    } catch (error) {
      if (idempotencyClaim && !mutationPersisted) {
        await abandonOperationIdempotency(env.DB, idempotencyClaim).catch((idempotencyError) => console.error(idempotencyError))
      }
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
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([runScheduledAnalytics(controller, env), runScheduledAgentRecovery(env)]))
  },
}

async function runScheduledAgentRecovery(env: Env) {
  const store = new AgentRuntimeStore(env.DB)
  const reclaimed = await store.recoverExpiredJobs()
  for (const job of reclaimed) {
    const run = await env.DB.prepare(
      `SELECT session_id FROM agent_runs WHERE id = ? AND organization_id = ?`,
    ).bind(job.run_id, job.organization_id).first<{ session_id: string }>()
    if (!run) continue
    try {
      const service = new NorthStarService({
        authCredentials: seededAdminCredentialsForEnv(env),
        mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
        billingMode: billingModeFromEnv(env),
      })
      await hydrateSnapshots(env.DB, service, env)
      service.authenticateSession(run.session_id)
      const actor = actorFromService(service)
      await executeDeterministicAgentRun(store, service, actor, job.run_id)
    } catch (error) {
      console.error('Scheduled agent resume failed', error)
    }
  }
}

async function runScheduledAnalytics(controller: ScheduledController, env: Env) {
  const startedAt = Date.now()
  try {
    await assertPersistenceReady(env.DB)
    const service = new NorthStarService({
      authCredentials: seededAdminCredentialsForEnv(env),
      mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
      billingMode: billingModeFromEnv(env),
    })
    await hydrateSnapshots(env.DB, service, env)
    const scheduledAt = new Date(controller.scheduledTime).toISOString()
    const result = service.runDueAnalyticsReports(scheduledAt)
    const emailDelivery = await deliverNotificationOutbox(service, env)
    if (result.data.reports.length > 0 || emailDelivery.changed) {
      await persistSnapshots(env.DB, service)
      refreshCachedSnapshotState(service)
    }
    await recordRuntimeEvent(env.DB, {
      route: 'SCHEDULED analytics-reports',
      status: 200,
      durationMs: Date.now() - startedAt,
      category: 'scheduler',
    })
  } catch (error) {
    console.error('Scheduled analytics report run failed', error)
    const durationMs = Date.now() - startedAt
    await Promise.all([
      recordRuntimeEvent(env.DB, { route: 'SCHEDULED analytics-reports', status: 500, durationMs, category: 'error' }),
      captureSentryRuntimeError(env, { route: 'SCHEDULED analytics-reports', status: 500, durationMs }),
    ])
    throw error
  }
}

function billingModeFromEnv(env: Env) {
  return env.BILLING_MODE === 'self_service' ? 'self_service' : 'managed_beta'
}

async function integrationReadiness(service: NorthStarService, env: Env) {
  const betaHostnameConfigured = Boolean(env.BETA_APP_ORIGIN?.trim())
  const betaHostnameReachable = await probeHttpsOrigin(fetch, env.BETA_APP_ORIGIN)
  return service.integrationReadiness({
    documentsAvailable: Boolean(env.DOCUMENTS),
    emailConfigured: Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim()),
    cloudflareSaasConfigured: Boolean(env.CLOUDFLARE_API_TOKEN?.trim() && env.CLOUDFLARE_SAAS_ZONE_ID?.trim()),
    betaHostnameConfigured,
    betaHostnameReachable,
  })
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
    return { attempted: 0, changed: false }
  }
  const notifications = service.notificationEmailOutbox()
  for (const notification of notifications) {
    const result = await sendResendEmail(fetch, {
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      to: notification.recipientEmail,
      subject: notification.title,
      text: notification.href ? `${notification.body}\n\nOpen OlfactoryOps: ${notification.href}` : notification.body,
    })
    service.recordNotificationEmailAttempt(notification.id, result)
  }
  return { attempted: notifications.length, changed: notifications.length > 0 }
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
  let payload: Record<string, unknown>
  try {
    payload = await requestStripeForm(fetch, env.STRIPE_SECRET_KEY, 'https://api.stripe.com/v1/checkout/sessions', form)
  } catch (error) {
    throw new UnprocessableEntityException(error instanceof Error ? error.message : 'Stripe could not create a Checkout session')
  }
  if (typeof payload.url !== 'string') {
    throw new UnprocessableEntityException('Stripe could not create a Checkout session')
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
    const result = await sendResendEmail(fetch, {
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      to: prepared.delivery.recipientEmail,
      subject: 'Reset your OlfactoryOps password',
      text: `A password reset was requested for your OlfactoryOps account. This link expires in 30 minutes and can be used once:\n\n${resetUrl.toString()}`,
    })
    service.recordNotificationEmailAttempt(prepared.delivery.notificationId ?? '', result)
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
  let payload: Record<string, unknown>
  try {
    payload = await requestStripeForm(fetch, env.STRIPE_SECRET_KEY, 'https://api.stripe.com/v1/billing_portal/sessions', form)
  } catch (error) {
    throw new UnprocessableEntityException(error instanceof Error ? error.message : 'Stripe could not open the billing portal')
  }
  if (typeof payload.url !== 'string') {
    throw new UnprocessableEntityException('Stripe could not open the billing portal')
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
  category: 'error' | 'latency' | 'scheduler'
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
  if (context.existingDomain && context.existingDomain.status !== 'failed') {
    return {
      data: {
        domain: context.existingDomain,
        idempotent: true,
        invariant: 'an existing custom hostname is returned without creating a duplicate Cloudflare provider record',
      },
    }
  }
  let payload: Record<string, unknown>
  try {
    payload = await requestCloudflareSaas(
      fetch,
      env.CLOUDFLARE_API_TOKEN,
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(env.CLOUDFLARE_SAAS_ZONE_ID)}/custom_hostnames`,
      { method: 'POST', body: JSON.stringify(requestBody) },
    )
  } catch (error) {
    throw new UnprocessableEntityException(error instanceof Error ? error.message : 'Cloudflare could not provision the custom hostname')
  }
  const result = isRecord(payload.result) ? payload.result : undefined
  if (!result || typeof result.id !== 'string') {
    throw new UnprocessableEntityException('Cloudflare could not provision the custom hostname')
  }
  return service.completeCloudflareSaasProvisioning(
    context.hostname,
    result.id,
    providerCloudflareValidation(result),
  )
}

async function refreshCloudflareCustomDomain(service: NorthStarService, id: string, env: Env) {
  const context = service.cloudflareSaasRefreshContext(id).data
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_SAAS_ZONE_ID) {
    throw new UnprocessableEntityException('Cloudflare for SaaS is not configured for this environment')
  }
  let payload: Record<string, unknown>
  try {
    payload = await requestCloudflareSaas(
      fetch,
      env.CLOUDFLARE_API_TOKEN,
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(env.CLOUDFLARE_SAAS_ZONE_ID)}/custom_hostnames/${encodeURIComponent(context.domain.providerId)}`,
    )
  } catch (error) {
    throw new UnprocessableEntityException(error instanceof Error ? error.message : 'Cloudflare could not refresh the custom hostname')
  }
  const result = isRecord(payload.result) ? payload.result : undefined
  if (!result) {
    throw new UnprocessableEntityException('Cloudflare could not refresh the custom hostname')
  }
  const ssl = isRecord(result.ssl) ? result.ssl : undefined
  return service.applyCloudflareSaasRefresh(id, {
    providerStatus: typeof result.status === 'string' ? result.status : undefined,
    sslStatus: typeof ssl?.status === 'string' ? ssl.status : undefined,
    validation: providerCloudflareValidation(result),
    verificationErrors: providerCloudflareVerificationErrors(result),
  })
}

async function handleStripeWebhook(service: NorthStarService, env: Env, request: Request, rawBody: string) {
  if (billingModeFromEnv(env) !== 'self_service') {
    throw new UnprocessableEntityException('Stripe billing is disabled while beta access is managed directly by OlfactoryOps')
  }
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

function base64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
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

async function readDocumentFormData(request: Request) {
  const contentType = request.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new UnprocessableEntityException('Document upload must use multipart/form-data')
  }
  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOCUMENT_UPLOAD_BYTES + 64 * 1024) {
    throw new PayloadTooLargeException({
      message: 'Document upload is too large',
      maxBytes: MAX_DOCUMENT_UPLOAD_BYTES,
    })
  }
  const formData = await request.formData()
  const candidate = formData.get('file')
  if (!(candidate instanceof File)) {
    throw new UnprocessableEntityException('Document upload must include a file field')
  }
  if (candidate.size <= 0 || candidate.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new PayloadTooLargeException({
      message: 'Document file must be between 1 byte and 25MB',
      maxBytes: MAX_DOCUMENT_UPLOAD_BYTES,
    })
  }
  return formData
}

function withApiSecurityHeaders(response: Response, corsHeaders: HeadersInit) {
  const headers = new Headers(response.headers)
  buildApiSecurityHeaders(corsHeaders).forEach((value, key) => {
    if (!headers.has(key)) headers.set(key, value)
  })
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function requireDocumentStore(env: Env) {
  if (!env.DOCUMENTS) {
    throw new UnprocessableEntityException('Private document storage is not configured')
  }
  return env.DOCUMENTS
}

function documentSigningKey(env: Env) {
  const key = env.DOCUMENT_SIGNING_KEY?.trim() || env.MFA_ENCRYPTION_KEY?.trim()
  if (!key || key.length < 32) {
    throw new UnprocessableEntityException('Document signing secret is not configured')
  }
  return key
}

function base64UrlEncode(value: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  return new Uint8Array(Array.from(binary, (character) => character.charCodeAt(0)))
}

async function signDocumentGrant(env: Env, document: DocumentRecord, request: Request) {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
  const expires = Math.floor(expiresAt.getTime() / 1000)
  const payload = `v1|${document.id}|${document.organizationId || 'org-nxl'}|${expires}|${crypto.randomUUID().replaceAll('-', '')}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(documentSigningKey(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const grant = `${base64UrlEncode(payload)}.${base64UrlEncode(signature)}`
  const origin = new URL(request.url).origin
  return {
    url: `${origin}${API_PREFIX}/documents/${encodeURIComponent(document.id)}/content?grant=${encodeURIComponent(grant)}`,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: 300,
    method: 'GET' as const,
  }
}

async function verifyDocumentGrant(env: Env, documentId: string, grant: string | null) {
  if (!grant) return undefined
  const [encodedPayload, encodedSignature, ...extra] = grant.split('.')
  if (!encodedPayload || !encodedSignature || extra.length > 0) return undefined
  let payload: string
  let providedSignature: Uint8Array
  try {
    payload = new TextDecoder().decode(base64UrlDecode(encodedPayload))
    providedSignature = base64UrlDecode(encodedSignature)
  } catch {
    return undefined
  }
  const [version, grantedDocumentId, organizationId, expiresRaw, nonce, ...rest] = payload.split('|')
  const expires = Number(expiresRaw)
  if (version !== 'v1' || !nonce || rest.length > 0 || grantedDocumentId !== documentId || !Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) {
    return undefined
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(documentSigningKey(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expectedSignature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
  if (expectedSignature.byteLength !== providedSignature.byteLength) return undefined
  let mismatch = 0
  for (let index = 0; index < expectedSignature.byteLength; index += 1) mismatch |= expectedSignature[index]! ^ providedSignature[index]!
  return mismatch === 0 ? { organizationId, expires } : undefined
}

function formDataString(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

async function sha256ForArrayBuffer(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', value)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

async function operationRequestHash(method: string, path: string, body: Record<string, unknown>) {
  const payload = new TextEncoder().encode(JSON.stringify(['olfactoryops.operation-idempotency.v1', method, path, body]))
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function claimOperationIdempotency(db: D1Database, claim: OperationIdempotencyClaim) {
  const id = `OPID-${crypto.randomUUID()}`
  const now = new Date().toISOString()
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO operation_idempotency_records (
        id, organization_id, operation, idempotency_key, request_hash, status, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, 'PENDING', ?6)`,
    )
    .bind(id, claim.organizationId, claim.operation, claim.key, claim.requestHash, now)
    .run()
  if ((inserted.meta.changes ?? 0) === 1) return claim

  const existing = await db
    .prepare(
      `SELECT request_hash, status, response_json
       FROM operation_idempotency_records
       WHERE organization_id = ?1 AND operation = ?2 AND idempotency_key = ?3`,
    )
    .bind(claim.organizationId, claim.operation, claim.key)
    .first<OperationIdempotencyRow>()
  if (!existing || existing.request_hash !== claim.requestHash) {
    throw new UnprocessableEntityException('Idempotency-Key cannot be reused with a different request payload')
  }
  if (existing.status !== 'COMPLETED' || !existing.response_json) {
    throw new UnprocessableEntityException('An operation with this Idempotency-Key is still processing; retry shortly')
  }
  return { response: JSON.parse(existing.response_json) as unknown }
}

async function completeOperationIdempotency(db: D1Database, claim: OperationIdempotencyClaim, response: unknown) {
  const result = await db
    .prepare(
      `UPDATE operation_idempotency_records
       SET status = 'COMPLETED', response_json = ?1, completed_at = ?2
       WHERE organization_id = ?3 AND operation = ?4 AND idempotency_key = ?5
         AND request_hash = ?6 AND status = 'PENDING'`,
    )
    .bind(JSON.stringify(response), new Date().toISOString(), claim.organizationId, claim.operation, claim.key, claim.requestHash)
    .run()
  if ((result.meta.changes ?? 0) !== 1) {
    throw new UnprocessableEntityException('Unable to finalize idempotent operation')
  }
}

async function abandonOperationIdempotency(db: D1Database, claim: OperationIdempotencyClaim) {
  await db
    .prepare(
      `DELETE FROM operation_idempotency_records
       WHERE organization_id = ?1 AND operation = ?2 AND idempotency_key = ?3
         AND request_hash = ?4 AND status = 'PENDING'`,
    )
    .bind(claim.organizationId, claim.operation, claim.key, claim.requestHash)
    .run()
}

async function handleDocumentUpload(service: NorthStarService, env: Env, formData: FormData | undefined) {
  if (!formData) throw new UnprocessableEntityException('Document upload form data is missing')
  const file = formData.get('file')
  if (!(file instanceof File)) throw new UnprocessableEntityException('Document upload file is missing')
  const tags = formDataString(formData, 'tags').split(',').map((tag) => tag.trim()).filter(Boolean)
  const prepared = service.prepareDocumentUpload({
    type: formDataString(formData, 'type') as DocumentRecord['type'],
    linkedTo: formDataString(formData, 'linkedTo'),
    title: formDataString(formData, 'title') || undefined,
    version: formDataString(formData, 'version') || undefined,
    sensitivity: formDataString(formData, 'sensitivity') as DocumentRecord['sensitivity'],
    fileName: file.name,
    mimeType: file.type,
    tags,
    supersedesDocumentId: formDataString(formData, 'supersedesDocumentId') || undefined,
    expiresAt: formDataString(formData, 'expiresAt') || undefined,
  }).data
  const objectBody = await file.arrayBuffer()
  const checksum = await sha256ForArrayBuffer(objectBody)
  const documentStore = requireDocumentStore(env)
  await documentStore.put(prepared.storageKey, objectBody, {
    metadata: {
      documentId: prepared.id,
      organizationId: prepared.organizationId,
      checksum,
      scanStatus: 'PENDING',
    },
  })
  try {
    return service.commitDocumentUpload(prepared, {
      sizeBytes: file.size,
      checksum,
      ocrTextPreview: formDataString(formData, 'ocrTextPreview') || undefined,
    })
  } catch (error) {
    await documentStore.delete(prepared.storageKey)
    throw error
  }
}

async function generateDocumentObject(service: NorthStarService, env: Env, body: Record<string, unknown>) {
  const documentStore = requireDocumentStore(env)
  const result = service.generateDocument(body)
  const document = result.data.document
  const pdf = createGeneratedDocumentPdf(document)
  await documentStore.put(document.storageKey, pdf, {
    metadata: {
      documentId: document.id,
      organizationId: document.organizationId || 'org-nxl',
      checksum: document.checksum,
      generated: 'true',
    },
  })
  return result
}

async function signDocumentDownload(service: NorthStarService, env: Env, request: Request, documentId: string) {
  requireDocumentStore(env)
  const result = service.requestDocumentSignedUrl(documentId).data
  return {
    data: {
      ...result,
      signedUrl: await signDocumentGrant(env, result.document, request),
    },
  }
}

async function shareDocumentObject(
  service: NorthStarService,
  env: Env,
  request: Request,
  documentId: string,
  body: Record<string, unknown>,
) {
  requireDocumentStore(env)
  const result = service.shareDocument(documentId, body).data
  return {
    data: {
      ...result,
      shareLink: {
        ...result.shareLink,
        url: (await signDocumentGrant(env, result.document, request)).url,
      },
    },
  }
}

async function serveDocumentContent(documentId: string, query: URLSearchParams, env: Env) {
  const grant = await verifyDocumentGrant(env, documentId, query.get('grant'))
  if (!grant) throw new ForbiddenException('Document access grant is invalid or expired')
  const row = await env.DB
    .prepare('SELECT id, organization_id, storage_key, mime_type, title, status FROM document_records WHERE id = ?1 AND organization_id = ?2')
    .bind(documentId, grant.organizationId)
    .first<{ id: string; organization_id: string; storage_key: string; mime_type: string; title: string; status: string }>()
  if (!row) throw new ForbiddenException('Document is unavailable for this access grant')
  if (row.status === 'QUARANTINED' || row.status === 'ARCHIVED') {
    throw new ForbiddenException('Document is not available for download')
  }
  const object = await requireDocumentStore(env).get(row.storage_key, 'stream')
  if (!object) throw new UnprocessableEntityException('Document object is not available in private storage')
  const fileName = row.title.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '') || `${row.id}.bin`
  return new Response(object, {
    headers: {
      'Content-Type': row.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function createGeneratedDocumentPdf(document: DocumentRecord) {
  const safe = (value: string) => value.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7E]/g, '?')
  const lines = [
    'OlfactoryOps Controlled Document',
    document.title,
    `Document: ${document.id} / ${document.version}`,
    `Type: ${document.type} / Status: ${document.status}`,
    `Linked record: ${document.linkedTo}`,
    `Issued: ${document.issueDate ?? new Date().toISOString().slice(0, 10)}`,
    `Owner: ${document.owner}`,
    `Checksum: ${document.checksum}`,
    'Generated from controlled workspace data. Review and approve before external use.',
  ]
  const stream = lines.map((line, index) => `BT /F1 ${index === 0 ? 16 : 10} Tf 54 ${760 - index * 38} Td (${safe(line)}) Tj ET`).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).byteLength)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = new TextEncoder().encode(pdf).byteLength
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n` })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
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

const opaqueSessionCredentialPattern = /^oo_s1_[A-Za-z0-9_-]{43}$/

function readBearerSessionSecret(authorization: string | null) {
  const [scheme, token] = authorization?.trim().split(/\s+/, 2) ?? []
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined
  }
  return token
}

function readSessionCredential(headers: Headers): AuthCredential {
  const cookieSessionSecret = readCookie(headers.get('Cookie'), 'oo_session')
  if (cookieSessionSecret) {
    return { sessionSecret: cookieSessionSecret, source: 'cookie' }
  }
  const bearerSessionSecret = readBearerSessionSecret(headers.get('Authorization'))
  if (bearerSessionSecret) {
    return { sessionSecret: bearerSessionSecret, source: 'bearer' }
  }
  return { source: 'none' }
}

export function createSessionCredential() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `oo_s1_${base64Url(bytes)}`
}

export function isOpaqueSessionCredential(value: string | undefined): value is string {
  return typeof value === 'string' && opaqueSessionCredentialPattern.test(value)
}

export async function hashSessionCredential(sessionSecret: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionSecret))
  return `sha256:v1:${hex(digest)}`
}

export async function resolveActiveSessionCredential(db: D1Database, credential: AuthCredential): Promise<AuthCredential> {
  const sessionSecret = credential.sessionSecret
  if (!isOpaqueSessionCredential(sessionSecret)) {
    throw new UnauthorizedException('Authentication required')
  }
  const secretHash = await hashSessionCredential(sessionSecret)
  const row = await db
    .prepare(
      `SELECT sessions.id, sessions.status, sessions.idle_expires_at, sessions.expires_at
       FROM auth_session_credentials AS credentials
       INNER JOIN auth_sessions AS sessions ON sessions.id = credentials.session_id
       WHERE credentials.secret_hash = ?1
       LIMIT 1`,
    )
    .bind(secretHash)
    .first<{ id: string; status: string; idle_expires_at: string; expires_at: string }>()
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
  return { ...credential, sessionId: row.id }
}

async function issueSessionCredential(db: D1Database, sessionId: string) {
  const sessionSecret = createSessionCredential()
  const secretHash = await hashSessionCredential(sessionSecret)
  const issuedAt = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO auth_session_credentials (
         session_id, secret_hash, credential_version, issued_at, revoked_at, revoked_reason, updated_at
       )
       VALUES (?1, ?2, 1, ?3, NULL, NULL, ?3)
       ON CONFLICT(session_id) DO UPDATE SET
         secret_hash = excluded.secret_hash,
         credential_version = excluded.credential_version,
         issued_at = excluded.issued_at,
         revoked_at = NULL,
         revoked_reason = NULL,
         updated_at = excluded.updated_at`,
    )
    .bind(sessionId, secretHash, issuedAt)
    .run()
  return sessionSecret
}

function readCookie(cookieHeader: string | null, name: string) {
  const cookies = cookieHeader?.split(';') ?? []
  for (const cookie of cookies) {
    const [rawKey, ...rawValue] = cookie.trim().split('=')
    if (rawKey === name) {
      try {
        return decodeURIComponent(rawValue.join('='))
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

async function assertPersistenceReady(db: D1Database) {
  if (!persistenceReadyPromise) {
    persistenceReadyPromise = Promise.all([
      db.prepare('SELECT metadata_key FROM persistence_metadata LIMIT 1').first(),
      db.prepare('SELECT session_id FROM auth_session_credentials LIMIT 1').first(),
      db.prepare('SELECT organization_id FROM tenant_role_policies LIMIT 1').first(),
      db.prepare('SELECT organization_id FROM tenant_audit_events LIMIT 1').first(),
    ]).then(() => undefined)
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
    billingMode: billingModeFromEnv(env),
  })
  const serviceState = service as unknown as ServiceState
  const legacySnapshotReadRequired = !(await isD1NormalizedCutoverComplete(db))
  const snapshotRows = legacySnapshotReadRequired
    ? await db.prepare('SELECT key, value, updated_at FROM northstar_snapshots').all<{
        key: SnapshotKey
        value: string
        updated_at: string | null
      }>()
    : { results: [] as Array<{ key: SnapshotKey; value: string; updated_at: string | null }> }

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
  await hydrateNormalizedState(db, service, serviceState, env)
  if (legacySnapshotReadRequired) {
    await markD1NormalizedCutoverComplete(db)
  }
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
  if (SNAPSHOT_PERSIST_KEYS.length === 0) {
    return
  }
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

async function isD1NormalizedCutoverComplete(db: D1Database) {
  const row = await db
    .prepare('SELECT metadata_value FROM persistence_metadata WHERE metadata_key = ?1')
    .bind(D1_NORMALIZED_CUTOVER_KEY)
    .first<{ metadata_value: string }>()
  return row?.metadata_value === 'complete'
}

async function markD1NormalizedCutoverComplete(db: D1Database) {
  const updatedAt = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO persistence_metadata (metadata_key, metadata_value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(metadata_key) DO UPDATE SET metadata_value = excluded.metadata_value, updated_at = excluded.updated_at`,
    )
    .bind(D1_NORMALIZED_CUTOVER_KEY, 'complete', updatedAt)
    .run()
}

async function persistUserSettingsMutation(db: D1Database, service: NorthStarService) {
  const serviceState = service as unknown as ServiceState
  const updatedAt = new Date().toISOString()
  await persistUserSettings(db, serviceState.userSettingsRecords, updatedAt)
  await persistMemberships(db, serviceState.membershipRecords, updatedAt)
  await persistAuditEvents(db, serviceState.auditEvents, updatedAt, serviceState)
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
  await persistAuditEvents(db, serviceState.auditEvents, updatedAt, serviceState)
  serviceState.auditCounter = Math.max(Number(serviceState.auditCounter) || 0, maxAuditCounter(serviceState.auditEvents))
}

async function persistMfaVerificationFailureState(db: D1Database, service: NorthStarService) {
  const serviceState = service as unknown as ServiceState
  const updatedAt = new Date().toISOString()
  await persistAuthSessions(db, serviceState.sessions, updatedAt)
  await persistAuditEvents(db, serviceState.auditEvents, updatedAt, serviceState)
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
  organization_id?: string | null
  id: string
  at: string
  actor: string
  action: string
  entity: string
  request_id: string
  outcome: string
}

type NotificationOutboxRow = {
  id: string
  organization_id: string
  recipient_email: string
  category: string
  title: string
  body: string
  href: string | null
  created_at: string
  read_at: string | null
  email_status: string
  email_error: string | null
  email_attempts: number
  email_last_attempt_at: string | null
  email_next_attempt_at: string | null
  email_sent_at: string | null
  updated_at: string
}

type AuthCredentialRow = {
  email: string
  password_hash: string
  password_set_at: string
}

type PasswordResetRow = {
  id: string
  email: string
  token_hash: string
  created_at: string
  expires_at: string
  used_at: string | null
}

type JsonStateRow = {
  id: string
  organization_id: string
  record_json: string
}

type AuditChainRow = {
  event_id: string
  organization_id: string
  sequence: number
  previous_hash: string | null
  event_hash: string
  recorded_at: string
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
  organization_id?: string | null
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
  organization_id: string
  flag_key: string
  label: string
  enabled: number
  phase: number
}

type NumberingSequenceRow = {
  organization_id: string
  sequence_key: string
  pattern: string
  next_value: number
  scope: string
}

type CustomFieldRow = {
  organization_id: string
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
  organization_id: string | null
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
  record_json: string | null
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

type FinishedGoodLotRow = {
  id: string
  organization_id: string
  batch_id: string
  formula_id: string
  formula_code: string
  lot_number: string
  quantity_grams: number
  reserved_grams: number
  quality_status: string
  released_at: string
  cost_per_gram: number
  currency: string
  location: string
}

type FinishedGoodMovementRow = {
  id: string
  organization_id: string
  finished_good_lot_id: string
  batch_id: string
  formula_id: string
  order_id: string | null
  type: string
  direction: string
  quantity_grams: number
  balance_after: number
  cost_per_gram: number
  cogs_amount: number | null
  at: string
  actor: string
}

type SupplierRow = {
  id: string
  organization_id: string | null
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
  organization_id: string | null
  supplier_id: string
  material_id: string
  quantity_grams: number
  received_grams: number
  status: string
  expected_date: string
  unit_cost: number
  currency: string
  created_at: string
  lines_json: string | null
}

type PriceHistoryRow = {
  id: string
  organization_id: string | null
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
  organization_id: string | null
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
  formula_id: string | null
  product_kind: string | null
}

type PriceListRow = {
  id: string
  organization_id: string | null
  name: string
  customer_group: string
  currency: string
  multiplier: number
  sample_eligible: number
  status: string
}

type QuoteRow = {
  id: string
  organization_id: string | null
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
  organization_id: string | null
  sku_id: string
  customer: string
  packs: number
  status: string
  created_at: string
}

type CustomerRow = {
  id: string
  organization_id: string | null
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
  organization_id: string | null
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
  organization_id: string | null
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
  organization_id: string | null
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
  organization_id: string | null
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
  in_transit_from_location: string | null
  in_transit_to_location: string | null
  transfer_started_at: string | null
  transfer_started_by: string | null
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

async function hydrateNormalizedState(
  db: D1Database,
  service: NorthStarService,
  serviceState: ServiceState,
  env: Env,
) {
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
    const revokedAt = new Date().toISOString()
    serviceState.sessions = serviceState.sessions.map((session) =>
      session.status === 'ACTIVE'
        ? {
            ...session,
            status: 'REVOKED',
            revokedAt,
            revokedReason: 'LEGACY_SESSION_CREDENTIAL_REVOKED',
          }
        : session,
    )
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

  const [tenantAuditRows, platformAuditRows] = await Promise.all([
    db
      .prepare(
        `SELECT organization_id, id, at, actor, action, entity, request_id, outcome
         FROM tenant_audit_events
         ORDER BY at DESC, id DESC`,
      )
      .all<AuditEventRow>(),
    db
      .prepare(
        `SELECT id, at, actor, action, entity, request_id, outcome
         FROM platform_audit_events
         ORDER BY at DESC, id DESC`,
      )
      .all<AuditEventRow>(),
  ])
  // Legacy audit rows are deliberately not hydrated. Ownership was not encoded
  // before migration 0029, so they remain in the quarantine table for review.
  serviceState.auditEvents = [
    ...(tenantAuditRows.results ?? []).map((row) => auditEventFromRow(row, 'tenant')),
    ...(platformAuditRows.results ?? []).map((row) => auditEventFromRow(row, 'platform')),
  ].sort((left, right) => right.at.localeCompare(left.at) || right.id.localeCompare(left.id))

  serviceState.auditCounter = Math.max(Number(serviceState.auditCounter) || 0, maxAuditCounter(serviceState.auditEvents))
  await hydrateEnterpriseGovernanceState(db, serviceState)
  await hydrateTenantCoreState(db, serviceState)
  await ensureSeededAdminBootstrap(db, serviceState, env.SEEDED_ADMIN_PASSWORD_HASH)
  await hydrateMaterialState(db, serviceState)
  await hydrateOperationalP1State(db, serviceState)
  await hydrateFormulaState(db, serviceState)
  await hydrateCustomizationState(db, serviceState)
  const seededTenantDefaults = serviceState.organizationRecords.reduce(
    (changed, organization) => service.ensureTenantScopedDefaults(organization.id) || changed,
    false,
  )
  if (seededTenantDefaults) {
    const updatedAt = new Date().toISOString()
    await persistRolePolicies(db, serviceState.rolePolicyRecords, updatedAt)
    await persistCustomizationState(db, serviceState, updatedAt)
  }
  await hydrateDocumentState(db, serviceState)
  await hydrateProcurementState(db, serviceState)
  await hydrateCatalogState(db, serviceState)
  await hydrateProductionState(db, serviceState)
  await hydrateFinishedGoodState(db, serviceState)
  await hydrateOrderState(db, serviceState)
  await hydrateAnalyticsState(db, serviceState)
  await hydrateBillingState(db, serviceState)
  await hydrateNotificationState(db, serviceState)
  await hydrateInventoryState(db, serviceState)
  await hydrateLabUsageState(db, serviceState)
}

async function persistNormalizedState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistAuthSessions(db, serviceState.sessions, updatedAt)
  await persistMfaEnrollments(db, serviceState.mfaEnrollmentRecords, updatedAt)
  await persistUserSettings(db, serviceState.userSettingsRecords, updatedAt)
  await persistAuditEvents(db, serviceState.auditEvents, updatedAt, serviceState)
  await persistEnterpriseGovernanceState(db, serviceState, updatedAt)
  await persistTenantCoreState(db, serviceState, updatedAt)
  await persistMaterialState(db, serviceState, updatedAt)
  await persistOperationalP1State(db, serviceState, updatedAt)
  await persistFormulaState(db, serviceState, updatedAt)
  await persistCustomizationState(db, serviceState, updatedAt)
  await persistDocumentRecords(db, serviceState.documentRecords, updatedAt)
  await persistProcurementState(db, serviceState, updatedAt)
  await persistCatalogState(db, serviceState, updatedAt)
  await persistProductionBatches(db, serviceState.productionBatchRecords, updatedAt)
  await persistFinishedGoodState(db, serviceState, updatedAt)
  await persistOrderState(db, serviceState, updatedAt)
  await persistScheduledReports(db, serviceState.scheduledReportRecords, updatedAt)
  await persistBillingState(db, serviceState, updatedAt)
  await persistNotificationOutbox(db, serviceState.notificationRecords, updatedAt)
  await persistInventoryLots(db, serviceState.lots, updatedAt)
  await persistInventoryMovements(db, serviceState.movements, updatedAt)
  await persistLabUsageRecords(db, serviceState.usageHistory, updatedAt)
  serviceState.auditCounter = Math.max(Number(serviceState.auditCounter) || 0, maxAuditCounter(serviceState.auditEvents))
}

function scopedJsonRecords(rows: JsonStateRow[]) {
  return rows.reduce<unknown[]>((records, row) => {
    const record = parseJson<Record<string, unknown> | null>(row.record_json, null)
    if (record && record.organizationId === row.organization_id) {
      records.push(record)
    }
    return records
  }, [])
}

function requiredStringRecordField(record: Record<string, unknown>, field: string) {
  const value = record[field]
  if (typeof value !== 'string' || !value.trim()) {
    throw new UnprocessableEntityException(`Persistence record is missing ${field}`)
  }
  return value.trim()
}

async function hydrateEnterpriseGovernanceState(db: D1Database, serviceState: ServiceState) {
  const [credentialRows, resetRows, importRows, legalRows, privacyRows, domainRows, inventoryApprovalRows, operationApprovalRows] = await Promise.all([
    db.prepare('SELECT email, password_hash, password_set_at FROM auth_credentials ORDER BY email ASC').all<AuthCredentialRow>(),
    db.prepare('SELECT id, email, token_hash, created_at, expires_at, used_at FROM password_reset_records ORDER BY created_at DESC').all<PasswordResetRow>(),
    db.prepare('SELECT id, organization_id, record_json FROM import_jobs ORDER BY created_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT id, organization_id, record_json FROM legal_acceptance_records ORDER BY accepted_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT id, organization_id, record_json FROM privacy_requests ORDER BY created_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT id, organization_id, record_json FROM saas_custom_domains ORDER BY updated_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT id, organization_id, record_json FROM inventory_approval_requests ORDER BY created_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT id, organization_id, record_json FROM operation_approval_requests ORDER BY created_at DESC').all<JsonStateRow>(),
  ])
  const updatedAt = new Date().toISOString()
  if ((credentialRows.results ?? []).length > 0) {
    serviceState.authCredentialRecords = (credentialRows.results ?? []).map((row) => ({
      email: row.email,
      passwordHash: row.password_hash,
      passwordSetAt: row.password_set_at,
    }))
  } else if (serviceState.authCredentialRecords.length > 0) {
    await persistAuthCredentialRecords(db, serviceState.authCredentialRecords, updatedAt)
  }
  if ((resetRows.results ?? []).length > 0) {
    serviceState.passwordResetRecords = (resetRows.results ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      tokenHash: row.token_hash,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usedAt: row.used_at ?? undefined,
    }))
  } else if (serviceState.passwordResetRecords.length > 0) {
    await persistPasswordResetRecords(db, serviceState.passwordResetRecords, updatedAt)
  }
  const hydratedImports = scopedJsonRecords(importRows.results ?? [])
  if (hydratedImports.length > 0) serviceState.importJobRecords = hydratedImports as DataImportJobRecord[]
  else if (serviceState.importJobRecords.length > 0) await persistImportJobs(db, serviceState.importJobRecords, updatedAt)
  const hydratedLegal = scopedJsonRecords(legalRows.results ?? [])
  if (hydratedLegal.length > 0) serviceState.legalAcceptanceRecords = hydratedLegal as LegalAcceptanceRecord[]
  else if (serviceState.legalAcceptanceRecords.length > 0) await persistLegalAcceptances(db, serviceState.legalAcceptanceRecords)
  const hydratedPrivacy = scopedJsonRecords(privacyRows.results ?? [])
  if (hydratedPrivacy.length > 0) serviceState.privacyRequestRecords = hydratedPrivacy as PrivacyRequestRecord[]
  else if (serviceState.privacyRequestRecords.length > 0) await persistPrivacyRequests(db, serviceState.privacyRequestRecords, updatedAt)
  const hydratedDomains = scopedJsonRecords(domainRows.results ?? [])
  if (hydratedDomains.length > 0) serviceState.customDomainRecords = hydratedDomains as SaasCustomDomainRecord[]
  else if (serviceState.customDomainRecords.length > 0) await persistCustomDomains(db, serviceState.customDomainRecords, updatedAt)
  const hydratedInventoryApprovals = scopedJsonRecords(inventoryApprovalRows.results ?? [])
  if (hydratedInventoryApprovals.length > 0) serviceState.inventoryApprovalRequestRecords = hydratedInventoryApprovals as Array<Record<string, unknown>>
  else if (serviceState.inventoryApprovalRequestRecords.length > 0) await persistApprovalRequests(db, 'inventory_approval_requests', serviceState.inventoryApprovalRequestRecords, updatedAt)
  const hydratedOperationApprovals = scopedJsonRecords(operationApprovalRows.results ?? [])
  if (hydratedOperationApprovals.length > 0) serviceState.operationApprovalRequestRecords = hydratedOperationApprovals as Array<Record<string, unknown>>
  else if (serviceState.operationApprovalRequestRecords.length > 0) await persistApprovalRequests(db, 'operation_approval_requests', serviceState.operationApprovalRequestRecords, updatedAt)
}

async function persistEnterpriseGovernanceState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistAuthCredentialRecords(db, serviceState.authCredentialRecords, updatedAt)
  await persistPasswordResetRecords(db, serviceState.passwordResetRecords, updatedAt)
  await persistImportJobs(db, serviceState.importJobRecords, updatedAt)
  await persistLegalAcceptances(db, serviceState.legalAcceptanceRecords)
  await persistPrivacyRequests(db, serviceState.privacyRequestRecords, updatedAt)
  await persistCustomDomains(db, serviceState.customDomainRecords, updatedAt)
  await persistApprovalRequests(db, 'inventory_approval_requests', serviceState.inventoryApprovalRequestRecords, updatedAt)
  await persistApprovalRequests(db, 'operation_approval_requests', serviceState.operationApprovalRequestRecords, updatedAt)
}

async function persistAuthCredentialRecords(db: D1Database, credentials: Array<Record<string, unknown>>, updatedAt: string) {
  if (credentials.length === 0) return
  await runStatementBatches(
    db,
    credentials.map((credential) =>
      db.prepare(
        `INSERT INTO auth_credentials (email, password_hash, password_set_at, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, password_set_at = excluded.password_set_at, updated_at = excluded.updated_at`,
      ).bind(
        requiredStringRecordField(credential, 'email').toLowerCase(),
        requiredStringRecordField(credential, 'passwordHash'),
        requiredStringRecordField(credential, 'passwordSetAt'),
        updatedAt,
      ),
    ),
  )
}

async function persistPasswordResetRecords(db: D1Database, resets: PasswordResetRecord[], updatedAt: string) {
  if (resets.length === 0) return
  await runStatementBatches(
    db,
    resets.map((reset) =>
      db.prepare(
        `INSERT INTO password_reset_records (id, email, token_hash, created_at, expires_at, used_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET used_at = excluded.used_at, updated_at = excluded.updated_at`,
      ).bind(reset.id, reset.email, reset.tokenHash, reset.createdAt, reset.expiresAt, reset.usedAt ?? null, updatedAt),
    ),
  )
}

async function persistImportJobs(db: D1Database, records: DataImportJobRecord[], updatedAt: string) {
  if (records.length === 0) return
  await runStatementBatches(
    db,
    records.map((job) => {
      const record = job as unknown as Record<string, unknown>
      const organizationId = requiredStringRecordField(record, 'organizationId')
      return db.prepare(
        `INSERT INTO import_jobs (id, organization_id, status, idempotency_key, record_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, record_json = excluded.record_json, updated_at = excluded.updated_at`,
      ).bind(
        requiredStringRecordField(record, 'id'), organizationId, requiredStringRecordField(record, 'status'),
        requiredStringRecordField(record, 'idempotencyKey'), JSON.stringify(record), requiredStringRecordField(record, 'createdAt'), updatedAt,
      )
    }),
  )
}

async function persistLegalAcceptances(db: D1Database, records: LegalAcceptanceRecord[]) {
  if (records.length === 0) return
  await runStatementBatches(
    db,
    records.map((record) =>
      db.prepare(
        `INSERT INTO legal_acceptance_records (id, organization_id, user_id, document, version, record_json, accepted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO NOTHING`,
      ).bind(record.id, record.organizationId, record.userId, record.document, record.version, JSON.stringify(record), record.acceptedAt),
    ),
  )
}

async function persistPrivacyRequests(db: D1Database, records: PrivacyRequestRecord[], updatedAt: string) {
  if (records.length === 0) return
  await runStatementBatches(
    db,
    records.map((record) =>
      db.prepare(
        `INSERT INTO privacy_requests (id, organization_id, status, record_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, record_json = excluded.record_json, updated_at = excluded.updated_at`,
      ).bind(record.id, record.organizationId, record.status, JSON.stringify(record), record.createdAt, updatedAt),
    ),
  )
}

async function persistCustomDomains(db: D1Database, records: SaasCustomDomainRecord[], updatedAt: string) {
  if (records.length === 0) return
  await runStatementBatches(
    db,
    records.map((record) =>
      db.prepare(
        `INSERT INTO saas_custom_domains (id, organization_id, hostname, provider_id, status, record_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET hostname = excluded.hostname, provider_id = excluded.provider_id,
           status = excluded.status, record_json = excluded.record_json, updated_at = excluded.updated_at`,
      ).bind(record.id, record.organizationId, record.hostname.toLowerCase(), record.providerId, record.status, JSON.stringify(record), updatedAt),
    ),
  )
}

async function persistApprovalRequests(
  db: D1Database,
  table: 'inventory_approval_requests' | 'operation_approval_requests',
  records: Array<Record<string, unknown>>,
  updatedAt: string,
) {
  if (records.length === 0) return
  await runStatementBatches(
    db,
    records.map((record) =>
      db.prepare(
        `INSERT INTO ${table} (id, organization_id, status, requested_by, record_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, record_json = excluded.record_json, updated_at = excluded.updated_at`,
      ).bind(
        requiredStringRecordField(record, 'id'), requiredStringRecordField(record, 'organizationId'),
        requiredStringRecordField(record, 'status'), requiredStringRecordField(record, 'requestedBy'),
        JSON.stringify(record), requiredStringRecordField(record, 'createdAt'), updatedAt,
      ),
    ),
  )
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

async function persistAuditEvents(
  db: D1Database,
  events: AuditEvent[],
  updatedAt: string,
  _serviceState: ServiceState,
) {
  if (!Array.isArray(events) || events.length === 0) {
    return
  }
  const tenantEvents = events.filter((event) => event.scope === 'tenant' && Boolean(event.organizationId))
  const platformEvents = events.filter((event) => event.scope === 'platform')
  if (tenantEvents.length > 0) {
    await runStatementBatches(
      db,
      tenantEvents.map((event) =>
        db
          .prepare(
            `INSERT INTO tenant_audit_events (
              organization_id, id, at, actor, action, entity, request_id, outcome, updated_at
            )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(organization_id, id) DO NOTHING`,
          )
          .bind(
            event.organizationId,
            event.id,
            event.at,
            event.actor,
            event.action,
            event.entity,
            event.requestId,
            event.outcome,
            updatedAt,
          ),
      ),
    )
    await persistAuditChainEvents(db, updatedAt)
  }
  if (platformEvents.length > 0) {
    await runStatementBatches(
      db,
      platformEvents.map((event) =>
        db
          .prepare(
            `INSERT INTO platform_audit_events (
              id, at, actor, action, entity, request_id, outcome, updated_at
            )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO NOTHING`,
          )
          .bind(event.id, event.at, event.actor, event.action, event.entity, event.requestId, event.outcome, updatedAt),
      ),
    )
  }
}

export function canonicalAuditChainPayload(
  organizationId: string,
  sequence: number,
  previousHash: string | null,
  event: AuditEvent,
) {
  return JSON.stringify([
    'olfactoryops.audit-chain.v1',
    organizationId,
    sequence,
    previousHash ?? '',
    event.id,
    event.at,
    event.actor,
    event.action,
    event.entity,
    event.requestId,
    event.outcome,
  ])
}

export async function auditChainHash(
  organizationId: string,
  sequence: number,
  previousHash: string | null,
  event: AuditEvent,
) {
  const payload = new TextEncoder().encode(canonicalAuditChainPayload(organizationId, sequence, previousHash, event))
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

async function persistAuditChainEvents(db: D1Database, updatedAt: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [eventRows, chainRows] = await Promise.all([
      db
        .prepare(
          `SELECT organization_id, id, at, actor, action, entity, request_id, outcome
           FROM tenant_audit_events
           ORDER BY at ASC, id ASC`,
        )
        .all<AuditEventRow>(),
      db
        .prepare(
          `SELECT event_id, organization_id, sequence, previous_hash, event_hash, recorded_at
           FROM tenant_audit_chain_events`,
        )
        .all<AuditChainRow>(),
    ])
    const existingEventIds = new Set((chainRows.results ?? []).map((row) => row.event_id))
    const chained = (chainRows.results ?? []).reduce((byOrganization, row) => {
      const current = byOrganization.get(row.organization_id)
      if (!current || row.sequence > current.sequence) {
        byOrganization.set(row.organization_id, row)
      }
      return byOrganization
    }, new Map<string, AuditChainRow>())
    const pending = (eventRows.results ?? [])
      .map((row) => auditEventFromRow(row, 'tenant'))
      .filter((event) => !existingEventIds.has(event.id))
      .sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id))
    if (pending.length === 0) {
      return
    }
    const statements: D1PreparedStatement[] = []
    for (const event of pending) {
      const organizationId = event.organizationId
      if (!organizationId) {
        continue
      }
      const previous = chained.get(organizationId)
      const sequence = (previous?.sequence ?? 0) + 1
      const previousHash = previous?.event_hash ?? null
      const eventHash = await auditChainHash(organizationId, sequence, previousHash, event)
      statements.push(
        db
          .prepare(
            `INSERT INTO tenant_audit_chain_events (event_id, organization_id, sequence, previous_hash, event_hash, recorded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
          )
          .bind(event.id, organizationId, sequence, previousHash, eventHash, updatedAt),
      )
      chained.set(organizationId, {
        event_id: event.id,
        organization_id: organizationId,
        sequence,
        previous_hash: previousHash,
        event_hash: eventHash,
        recorded_at: updatedAt,
      })
    }
    try {
      await db.batch(statements)
      return
    } catch (error) {
      if (attempt === 2) {
        throw error
      }
    }
  }
}

async function verifyAuditChain(service: NorthStarService, db: D1Database) {
  const { organizationId } = service.auditChainAccess().data
  const rows = await db
    .prepare(
      `SELECT c.event_id, c.organization_id, c.sequence, c.previous_hash, c.event_hash, c.recorded_at,
        e.id, e.at, e.actor, e.action, e.entity, e.request_id, e.outcome
       FROM tenant_audit_chain_events c
       INNER JOIN tenant_audit_events e
         ON e.organization_id = c.organization_id AND e.id = c.event_id
       WHERE c.organization_id = ?1
       ORDER BY c.sequence ASC`,
    )
    .bind(organizationId)
    .all<AuditChainRow & AuditEventRow>()
  let previousHash: string | null = null
  let expectedSequence = 1
  for (const row of rows.results ?? []) {
    const event = auditEventFromRow(row, 'tenant')
    const expectedHash = await auditChainHash(organizationId, expectedSequence, previousHash, event)
    if (row.sequence !== expectedSequence || row.previous_hash !== previousHash || row.event_hash !== expectedHash) {
      return {
        data: {
          organizationId,
          valid: false,
          eventCount: expectedSequence - 1,
          failedEventId: row.event_id,
          checkedAt: new Date().toISOString(),
        },
      }
    }
    previousHash = row.event_hash
    expectedSequence += 1
  }
  return {
    data: {
      organizationId,
      valid: true,
      eventCount: expectedSequence - 1,
      tailHash: previousHash,
      checkedAt: new Date().toISOString(),
    },
  }
}

async function auditChainEvidence(service: NorthStarService, db: D1Database) {
  const { organizationId } = service.auditChainAccess().data
  const rows = await db
    .prepare(
      `SELECT event_id, organization_id, sequence, previous_hash, event_hash, recorded_at
       FROM tenant_audit_chain_events
       WHERE organization_id = ?1
       ORDER BY sequence DESC
       LIMIT 250`,
    )
    .bind(organizationId)
    .all<AuditChainRow>()
  const verification = await verifyAuditChain(service, db)
  return {
    data: {
      ...verification.data,
      evidence: (rows.results ?? []).map((row) => ({
        eventId: row.event_id,
        sequence: row.sequence,
        previousHash: row.previous_hash,
        eventHash: row.event_hash,
        recordedAt: row.recorded_at,
      })),
    },
  }
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

  const seedOwnerPolicy = seedRolePolicies.find(
    (policy) => policy.role === 'Owner' && policy.scope === 'organization',
  )
  const bootstrapPolicies = [seedAdminPolicy, seedOwnerPolicy]
    .filter((policy): policy is RolePolicy => Boolean(policy))
    .map((policy) => ({ ...policy, organizationId: SEEDED_ADMIN_ORGANIZATION_ID }))
    .filter(
      (policy) =>
        !serviceState.rolePolicyRecords.some(
          (existing) =>
            existing.organizationId === policy.organizationId &&
            existing.scope === policy.scope &&
            existing.role === policy.role,
        ),
    )
  if (bootstrapPolicies.length > 0) {
    serviceState.rolePolicyRecords = [...bootstrapPolicies, ...serviceState.rolePolicyRecords]
    await persistRolePolicies(db, bootstrapPolicies, updatedAt)
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
    await persistAuthCredentialRecords(db, serviceState.authCredentialRecords, updatedAt)

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
      id: `AUD-TEN-${nextAuditCounter}`,
      at: updatedAt,
      actor: 'system:worker',
      action: credentialWasRotated ? 'security.adminCredential.rotate' : 'security.adminCredential.bootstrap',
      entity: 'seeded-admin-credential',
      requestId: `req_admin_credential_${nextAuditCounter}`,
      outcome: 'allowed',
      organizationId: SEEDED_ADMIN_ORGANIZATION_ID,
      scope: 'tenant',
    }
    serviceState.auditCounter = nextAuditCounter
    serviceState.auditEvents = [auditEvent, ...serviceState.auditEvents]
    await persistAuditEvents(db, [auditEvent], updatedAt, serviceState)
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

  const [tenantRoleRows, platformRoleRows] = await Promise.all([
    db
      .prepare(
        `SELECT organization_id, role, 'organization' AS scope, mfa_required, permissions_json
         FROM tenant_role_policies
         ORDER BY organization_id ASC, role ASC`,
      )
      .all<RolePolicyRow>(),
    db
      .prepare(
        `SELECT NULL AS organization_id, role, 'platform' AS scope, mfa_required, permissions_json
         FROM platform_role_policies
         ORDER BY role ASC`,
      )
      .all<RolePolicyRow>(),
  ])
  const rolePolicies = [
    ...(tenantRoleRows.results ?? []).map(rolePolicyFromRow),
    ...(platformRoleRows.results ?? []).map(rolePolicyFromRow),
  ]
  const missingPlatformDefaults = seedRolePolicies
    .filter((policy) => policy.scope === 'platform')
    .filter((policy) => !rolePolicies.some((persisted) => persisted.scope === 'platform' && persisted.role === policy.role))
  serviceState.rolePolicyRecords = [...rolePolicies, ...missingPlatformDefaults]
  if (missingPlatformDefaults.length > 0) {
    await persistRolePolicies(db, missingPlatformDefaults, new Date().toISOString())
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

async function hydrateOperationalP1State(db: D1Database, serviceState: ServiceState) {
  const rows = await Promise.all([
    db.prepare('SELECT record_json FROM material_compliance_profiles ORDER BY updated_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT record_json FROM supplier_material_profiles ORDER BY updated_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT record_json FROM procurement_receipts ORDER BY created_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT record_json FROM landed_cost_allocations ORDER BY updated_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT record_json FROM production_qc_templates ORDER BY updated_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT record_json FROM production_qc_results ORDER BY updated_at DESC').all<JsonStateRow>(),
    db.prepare('SELECT record_json FROM production_yield_records ORDER BY updated_at DESC').all<JsonStateRow>(),
  ])
  serviceState.materialComplianceRecords = (rows[0].results ?? []).map((row) => parseJsonOptional<MaterialComplianceProfile>(row.record_json)).filter(isDefined)
  serviceState.supplierMaterialProfileRecords = (rows[1].results ?? []).map((row) => parseJsonOptional<SupplierMaterialProfile>(row.record_json)).filter(isDefined)
  serviceState.procurementReceiptRecords = (rows[2].results ?? []).map((row) => parseJsonOptional<ProcurementReceiptRecord>(row.record_json)).filter(isDefined)
  serviceState.landedCostAllocationRecords = (rows[3].results ?? []).map((row) => parseJsonOptional<LandedCostAllocationRecord>(row.record_json)).filter(isDefined)
  serviceState.productionQcTemplateRecords = (rows[4].results ?? []).map((row) => parseJsonOptional<ProductionQcTemplateRecord>(row.record_json)).filter(isDefined)
  serviceState.productionQcResultRecords = (rows[5].results ?? []).map((row) => parseJsonOptional<ProductionQcResultRecord>(row.record_json)).filter(isDefined)
  serviceState.productionYieldRecords = (rows[6].results ?? []).map((row) => parseJsonOptional<ProductionYieldRecord>(row.record_json)).filter(isDefined)
}

async function persistOperationalP1State(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await Promise.all([
    persistOperationalP1RecordSet(db, 'material_compliance_profiles', serviceState.materialComplianceRecords, (record) => record.materialId, (record) => record.status, updatedAt, (record) => record.reviewedAt),
    persistOperationalP1RecordSet(db, 'supplier_material_profiles', serviceState.supplierMaterialProfileRecords, (record) => `${record.supplierId}:${record.materialId}`, (record) => record.status, updatedAt, (record) => record.reviewedAt),
    persistOperationalP1RecordSet(db, 'procurement_receipts', serviceState.procurementReceiptRecords, (record) => record.purchaseOrderId, (record) => record.status, updatedAt, (record) => record.receivedAt),
    persistOperationalP1RecordSet(db, 'landed_cost_allocations', serviceState.landedCostAllocationRecords, (record) => record.receiptId, () => 'POSTED', updatedAt, (record) => record.postedAt),
    persistOperationalP1RecordSet(db, 'production_qc_templates', serviceState.productionQcTemplateRecords, (record) => record.formulaId ?? 'workspace', (record) => record.status, updatedAt, (record) => record.updatedAt),
    persistOperationalP1RecordSet(db, 'production_qc_results', serviceState.productionQcResultRecords, (record) => record.batchId, (record) => record.status, updatedAt, (record) => record.recordedAt),
    persistOperationalP1RecordSet(db, 'production_yield_records', serviceState.productionYieldRecords, (record) => record.batchId, (record) => record.status, updatedAt, (record) => record.recordedAt),
  ])
}

async function persistOperationalP1RecordSet<T extends { id: string; organizationId?: string }>(
  db: D1Database,
  table: string,
  records: T[],
  entityId: (record: T) => string,
  status: (record: T) => string,
  updatedAt: string,
  createdAt: (record: T) => string,
) {
  if (!Array.isArray(records) || records.length === 0) return
  await runStatementBatches(
    db,
    records.map((record) =>
      db.prepare(
        `INSERT INTO ${table} (id, organization_id, entity_id, status, record_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           organization_id = excluded.organization_id,
           entity_id = excluded.entity_id,
           status = excluded.status,
           record_json = excluded.record_json,
           updated_at = excluded.updated_at`,
      ).bind(
        record.id,
        record.organizationId ?? 'org-nxl',
        entityId(record),
        status(record),
        JSON.stringify(record),
        createdAt(record),
        updatedAt,
      ),
    ),
  )
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
  serviceState.tenantSettingsRecords = (settingsRows.results ?? []).map(tenantSettingsFromRow)

  const flagRows = await db
    .prepare(
      `SELECT organization_id, flag_key, label, enabled, phase
       FROM tenant_feature_flags
       ORDER BY organization_id ASC, phase ASC, flag_key ASC`,
    )
    .all<FeatureFlagRow>()
  serviceState.flagRecords = (flagRows.results ?? []).map(featureFlagFromRow)

  const sequenceRows = await db
    .prepare(
      `SELECT organization_id, sequence_key, pattern, next_value, scope
       FROM tenant_numbering_sequences
       ORDER BY organization_id ASC, sequence_key ASC`,
    )
    .all<NumberingSequenceRow>()
  serviceState.sequences = (sequenceRows.results ?? []).map(numberingSequenceFromRow)

  const fieldRows = await db
    .prepare(
      `SELECT organization_id, id, entity, field_key, label, field_type, required, options_json, status
       FROM tenant_custom_fields
       ORDER BY organization_id ASC, entity ASC, id ASC`,
    )
    .all<CustomFieldRow>()
  serviceState.customFieldRecords = (fieldRows.results ?? []).map(customFieldFromRow)

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
  await persistTenantSettings(db, serviceState.tenantSettingsRecords, updatedAt)
  await persistFeatureFlags(db, serviceState.flagRecords, updatedAt)
  await persistNumberingSequences(db, serviceState.sequences, updatedAt)
  await persistCustomFields(db, serviceState.customFieldRecords, updatedAt)
  await persistBranding(db, serviceState.brandingRecord, updatedAt)
}

async function persistTenantSettings(db: D1Database, settingsRecords: TenantSettingsRecord[], updatedAt: string) {
  if (!Array.isArray(settingsRecords) || settingsRecords.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    settingsRecords.map((settings) =>
      db
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
        ),
    ),
  )
}

async function persistFeatureFlags(db: D1Database, flags: FeatureFlagRecord[], updatedAt: string) {
  const scopedFlags = (flags ?? []).filter((flag) => Boolean(flag.organizationId))
  if (scopedFlags.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    scopedFlags.map((flag) =>
      db
        .prepare(
          `INSERT INTO tenant_feature_flags (organization_id, flag_key, label, enabled, phase, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(organization_id, flag_key) DO UPDATE SET
             label = excluded.label,
             enabled = excluded.enabled,
             phase = excluded.phase,
             updated_at = excluded.updated_at`,
        )
        .bind(flag.organizationId, flag.key, flag.label, flag.enabled ? 1 : 0, flag.phase, updatedAt),
    ),
  )
}

async function persistNumberingSequences(db: D1Database, sequences: NumberingSequenceRecord[], updatedAt: string) {
  const scopedSequences = (sequences ?? []).filter((sequence) => Boolean(sequence.organizationId))
  if (scopedSequences.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    scopedSequences.map((sequence) =>
      db
        .prepare(
          `INSERT INTO tenant_numbering_sequences (organization_id, sequence_key, pattern, next_value, scope, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(organization_id, sequence_key) DO UPDATE SET
             pattern = excluded.pattern,
             next_value = excluded.next_value,
             scope = excluded.scope,
             updated_at = excluded.updated_at`,
        )
        .bind(sequence.organizationId, sequence.key, sequence.pattern, sequence.nextValue, sequence.scope, updatedAt),
    ),
  )
}

async function persistCustomFields(db: D1Database, fields: CustomFieldDefinition[], updatedAt: string) {
  const scopedFields = (fields ?? []).filter((field) => Boolean(field.organizationId))
  if (scopedFields.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    scopedFields.map((field) =>
      db
        .prepare(
          `INSERT INTO tenant_custom_fields (
            organization_id, id, entity, field_key, label, field_type, required, options_json, status, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          ON CONFLICT(organization_id, id) DO UPDATE SET
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
          field.organizationId,
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
  const tenantPolicies = rolePolicies.filter(
    (policy) => policy.scope === 'organization' && Boolean(policy.organizationId),
  )
  const platformPolicies = rolePolicies.filter((policy) => policy.scope === 'platform')
  if (tenantPolicies.length > 0) {
    await runStatementBatches(
      db,
      tenantPolicies.map((policy) =>
        db
          .prepare(
            `INSERT INTO tenant_role_policies (organization_id, role, mfa_required, permissions_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(organization_id, role) DO UPDATE SET
               mfa_required = excluded.mfa_required,
               permissions_json = excluded.permissions_json,
               updated_at = excluded.updated_at`,
          )
          .bind(
            policy.organizationId,
            policy.role,
            policy.mfaRequired ? 1 : 0,
            JSON.stringify(policy.permissions),
            updatedAt,
          ),
      ),
    )
  }
  if (platformPolicies.length > 0) {
    await runStatementBatches(
      db,
      platformPolicies.map((policy) =>
      db
        .prepare(
          `INSERT INTO platform_role_policies (role, mfa_required, permissions_json, updated_at)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(role) DO UPDATE SET
             mfa_required = excluded.mfa_required,
             permissions_json = excluded.permissions_json,
             updated_at = excluded.updated_at`,
        )
        .bind(policy.role, policy.mfaRequired ? 1 : 0, JSON.stringify(policy.permissions), updatedAt),
      ),
    )
  }
}

async function hydrateDocumentState(db: D1Database, serviceState: ServiceState) {
  const documentRows = await db
    .prepare(
      `SELECT id, type, title, linked_to, version, sensitivity, status, issue_date, expires_at,
        last_accessed, downloads, storage_key, mime_type, size_kb, checksum, owner, generated_from,
        organization_id, record_json
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
            generated_from, organization_id, record_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
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
            organization_id = excluded.organization_id,
            record_json = excluded.record_json,
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
          document.organizationId ?? 'org-nxl',
          JSON.stringify(document),
          updatedAt,
        ),
    ),
  )
}

async function hydrateProcurementState(db: D1Database, serviceState: ServiceState) {
  const supplierRows = await db
    .prepare(
      `SELECT id, organization_id, name, status, country, lead_time_days, contact_email, payment_terms, preferred_material_ids_json
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
      `SELECT id, organization_id, supplier_id, material_id, quantity_grams, received_grams, status,
        expected_date, unit_cost, currency, created_at, lines_json
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
      `SELECT id, organization_id, material_id, supplier_id, purchase_order_id, unit_cost, currency,
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
            id, organization_id, name, status, country, lead_time_days, contact_email, payment_terms,
            preferred_material_ids_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
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
          supplier.organizationId ?? 'org-nxl',
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
            id, organization_id, supplier_id, material_id, quantity_grams, received_grams, status,
            expected_date, unit_cost, currency, created_at, lines_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
            supplier_id = excluded.supplier_id,
            material_id = excluded.material_id,
            quantity_grams = excluded.quantity_grams,
            received_grams = excluded.received_grams,
            status = excluded.status,
            expected_date = excluded.expected_date,
            unit_cost = excluded.unit_cost,
            currency = excluded.currency,
            created_at = excluded.created_at,
            lines_json = excluded.lines_json,
            updated_at = excluded.updated_at`,
        )
        .bind(
          order.id,
          order.organizationId ?? 'org-nxl',
          order.supplierId,
          order.materialId,
          order.quantityGrams,
          order.receivedGrams,
          order.status,
          order.expectedDate,
          order.unitCost,
          order.currency,
          order.createdAt,
          order.lines ? JSON.stringify(order.lines) : null,
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
            id, organization_id, material_id, supplier_id, purchase_order_id, unit_cost, currency,
            quantity_grams, captured_at, source, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
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
          record.organizationId ?? 'org-nxl',
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
      `SELECT id, organization_id, material_id, name, description, pack_size_grams, price, currency,
        tier, status, moq_packs, label_template, formula_id, product_kind
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
      `SELECT id, organization_id, name, customer_group, currency, multiplier, sample_eligible, status
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
      `SELECT id, organization_id, sku_id, customer, customer_group, quantity_packs, unit_price,
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
      `SELECT id, organization_id, sku_id, customer, packs, status, created_at
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
      `SELECT id, organization_id, name, customer_group, credit_limit, payment_terms, contact_email,
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
            id, organization_id, material_id, name, description, pack_size_grams, price, currency,
            tier, status, moq_packs, label_template, formula_id, product_kind, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
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
            formula_id = excluded.formula_id,
            product_kind = excluded.product_kind,
            updated_at = excluded.updated_at`,
        )
        .bind(
          sku.id,
          sku.organizationId ?? 'org-nxl',
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
          sku.formulaId ?? null,
          sku.productKind ?? (sku.formulaId ? 'FORMULA' : 'MATERIAL'),
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
            id, organization_id, name, customer_group, currency, multiplier, sample_eligible, status, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
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
          priceList.organizationId ?? 'org-nxl',
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
            id, organization_id, sku_id, customer, customer_group, quantity_packs, unit_price,
            total, currency, status, created_at, lines_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
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
          quote.organizationId ?? 'org-nxl',
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
          `INSERT INTO sample_requests (id, organization_id, sku_id, customer, packs, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
           ON CONFLICT(id) DO UPDATE SET
             organization_id = excluded.organization_id,
             sku_id = excluded.sku_id,
             customer = excluded.customer,
             packs = excluded.packs,
             status = excluded.status,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at`,
        )
        .bind(sample.id, sample.organizationId ?? 'org-nxl', sample.skuId, sample.customer, sample.packs, sample.status, sample.createdAt, updatedAt),
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
            id, organization_id, name, customer_group, credit_limit, payment_terms, contact_email,
            billing_address_json, shipping_address_json, status, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
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
          customer.organizationId ?? 'org-nxl',
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
      `SELECT id, organization_id, sku_id, customer_id, customer, quantity, unit_price, discount_percent,
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
      `SELECT id, organization_id, order_id, carrier, tracking_number, status, shipped_at, delivered_at,
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
      `SELECT id, organization_id, order_id, type, status, url, created_at
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
            id, organization_id, sku_id, customer_id, customer, quantity, unit_price, discount_percent,
            tax_percent, shipping_cost, total, currency, reserved_grams, fulfilled_grams, status,
            carrier, tracking_number, reservation_allocations_json, shipment_id,
            document_ids_json, lines_json, created_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
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
          order.organizationId ?? 'org-nxl',
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
            id, organization_id, order_id, carrier, tracking_number, status, shipped_at, delivered_at,
            weight_grams, allocations_json, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
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
          shipment.organizationId ?? 'org-nxl',
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
          `INSERT INTO order_documents (id, organization_id, order_id, type, status, url, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
           ON CONFLICT(id) DO UPDATE SET
             organization_id = excluded.organization_id,
             order_id = excluded.order_id,
             type = excluded.type,
             status = excluded.status,
             url = excluded.url,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at`,
        )
        .bind(document.id, document.organizationId ?? 'org-nxl', document.orderId, document.type, document.status, document.url, document.createdAt, updatedAt),
    ),
  )
}

async function hydrateAnalyticsState(db: D1Database, serviceState: ServiceState) {
  const rows = await db
    .prepare(
      `SELECT id, organization_id, name, cadence, audience, format, status, last_run_at
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
            id, organization_id, name, cadence, audience, format, status, last_run_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
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
          report.organizationId ?? 'org-nxl',
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

async function hydrateNotificationState(db: D1Database, serviceState: ServiceState) {
  const rows = await db
    .prepare(
      `SELECT id, organization_id, recipient_email, category, title, body, href, created_at,
        read_at, email_status, email_error, email_attempts, email_last_attempt_at,
        email_next_attempt_at, email_sent_at, updated_at
       FROM notification_outbox
       ORDER BY created_at DESC, id DESC`,
    )
    .all<NotificationOutboxRow>()
  const notifications = (rows.results ?? []).map(notificationFromRow)
  if (notifications.length > 0) {
    serviceState.notificationRecords = notifications
  } else if (Array.isArray(serviceState.notificationRecords) && serviceState.notificationRecords.length > 0) {
    await persistNotificationOutbox(db, serviceState.notificationRecords, new Date().toISOString())
  }
}

async function persistNotificationOutbox(db: D1Database, notifications: AppNotificationRecord[], updatedAt: string) {
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return
  }
  await runStatementBatches(
    db,
    notifications.map((notification) =>
      db
        .prepare(
          `INSERT INTO notification_outbox (
            id, organization_id, recipient_email, category, title, body, href, created_at,
            read_at, email_status, email_error, email_attempts, email_last_attempt_at,
            email_next_attempt_at, email_sent_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
          ON CONFLICT(id) DO UPDATE SET
            organization_id = excluded.organization_id,
            recipient_email = excluded.recipient_email,
            category = excluded.category,
            title = excluded.title,
            body = excluded.body,
            href = excluded.href,
            created_at = excluded.created_at,
            read_at = excluded.read_at,
            email_status = excluded.email_status,
            email_error = excluded.email_error,
            email_attempts = excluded.email_attempts,
            email_last_attempt_at = excluded.email_last_attempt_at,
            email_next_attempt_at = excluded.email_next_attempt_at,
            email_sent_at = excluded.email_sent_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          notification.id,
          notification.organizationId,
          notification.recipientEmail,
          notification.category,
          notification.title,
          notification.body,
          notification.href ?? null,
          notification.createdAt,
          notification.readAt ?? null,
          notification.emailStatus,
          notification.emailError ?? null,
          notification.emailAttempts ?? 0,
          notification.emailLastAttemptAt ?? null,
          notification.emailNextAttemptAt ?? null,
          notification.emailSentAt ?? null,
          updatedAt,
        ),
    ),
  )
}

async function hydrateFinishedGoodState(db: D1Database, serviceState: ServiceState) {
  const [lotRows, movementRows] = await Promise.all([
    db
      .prepare(
        `SELECT id, organization_id, batch_id, formula_id, formula_code, lot_number,
          quantity_grams, reserved_grams, quality_status, released_at, cost_per_gram, currency, location
         FROM finished_good_lots
         ORDER BY released_at DESC, id DESC`,
      )
      .all<FinishedGoodLotRow>(),
    db
      .prepare(
        `SELECT id, organization_id, finished_good_lot_id, batch_id, formula_id, order_id, type,
          direction, quantity_grams, balance_after, cost_per_gram, cogs_amount, at, actor
         FROM finished_good_movements
         ORDER BY at DESC, id DESC`,
      )
      .all<FinishedGoodMovementRow>(),
  ])
  serviceState.finishedGoodLotRecords = (lotRows.results ?? []).map(finishedGoodLotFromRow)
  serviceState.finishedGoodMovementRecords = (movementRows.results ?? []).map(finishedGoodMovementFromRow)
}

async function persistFinishedGoodState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  if (serviceState.finishedGoodLotRecords.length > 0) {
    await runStatementBatches(
      db,
      serviceState.finishedGoodLotRecords.map((lot) =>
        db
          .prepare(
            `INSERT INTO finished_good_lots (
              id, organization_id, batch_id, formula_id, formula_code, lot_number, quantity_grams,
              reserved_grams, quality_status, released_at, cost_per_gram, currency, location, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
              quantity_grams = excluded.quantity_grams,
              reserved_grams = excluded.reserved_grams,
              quality_status = excluded.quality_status,
              cost_per_gram = excluded.cost_per_gram,
              currency = excluded.currency,
              location = excluded.location,
              updated_at = excluded.updated_at`,
          )
          .bind(
            lot.id,
            lot.organizationId,
            lot.batchId,
            lot.formulaId,
            lot.formulaCode,
            lot.lotNumber,
            lot.quantityGrams,
            lot.reservedGrams,
            lot.qualityStatus,
            lot.releasedAt,
            lot.costPerGram,
            lot.currency,
            lot.location,
            updatedAt,
          ),
      ),
    )
  }
  if (serviceState.finishedGoodMovementRecords.length > 0) {
    await runStatementBatches(
      db,
      serviceState.finishedGoodMovementRecords.map((movement) =>
        db
          .prepare(
            `INSERT INTO finished_good_movements (
              id, organization_id, finished_good_lot_id, batch_id, formula_id, order_id, type,
              direction, quantity_grams, balance_after, cost_per_gram, cogs_amount, at, actor, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            ON CONFLICT(id) DO NOTHING`,
          )
          .bind(
            movement.id,
            movement.organizationId,
            movement.finishedGoodLotId,
            movement.batchId,
            movement.formulaId,
            movement.orderId ?? null,
            movement.type,
            movement.direction,
            movement.quantityGrams,
            movement.balanceAfter,
            movement.costPerGram,
            movement.cogsAmount ?? null,
            movement.at,
            movement.actor,
            updatedAt,
          ),
      ),
    )
  }
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
        shelf_life_after_opening_days, container, packaging, coa_document_id, in_transit_from_location,
        in_transit_to_location, transfer_started_at, transfer_started_by
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
            shelf_life_after_opening_days, container, packaging, coa_document_id, in_transit_from_location,
            in_transit_to_location, transfer_started_at, transfer_started_by, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)
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
            in_transit_from_location = excluded.in_transit_from_location,
            in_transit_to_location = excluded.in_transit_to_location,
            transfer_started_at = excluded.transfer_started_at,
            transfer_started_by = excluded.transfer_started_by,
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
          lot.inTransitFromLocation ?? null,
          lot.inTransitToLocation ?? null,
          lot.transferStartedAt ?? null,
          lot.transferStartedBy ?? null,
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

function auditEventFromRow(row: AuditEventRow, scope: 'tenant' | 'platform' = row.organization_id ? 'tenant' : 'platform'): AuditEvent {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    requestId: row.request_id,
    outcome: readAuditOutcome(row.outcome),
    organizationId: scope === 'tenant' ? row.organization_id?.trim() || undefined : undefined,
    scope,
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
    organizationId: row.organization_id?.trim() || undefined,
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
    organizationId: row.organization_id,
    key: row.flag_key,
    label: row.label,
    enabled: row.enabled === 1,
    phase: Number(row.phase),
  }
}

function numberingSequenceFromRow(row: NumberingSequenceRow): NumberingSequenceRecord {
  return {
    organizationId: row.organization_id,
    key: row.sequence_key,
    pattern: row.pattern,
    nextValue: Number(row.next_value),
    scope: row.scope === 'brand' ? 'brand' : 'organization',
  }
}

function customFieldFromRow(row: CustomFieldRow): CustomFieldDefinition {
  return {
    organizationId: row.organization_id,
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
  const record = parseJsonOptional<DocumentRecord>(row.record_json)
  return {
    ...record,
    id: row.id,
    organizationId: row.organization_id ?? record?.organizationId ?? 'org-nxl',
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
    organizationId: row.organization_id ?? 'org-nxl',
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
    organizationId: row.organization_id ?? 'org-nxl',
    supplierId: row.supplier_id,
    materialId: row.material_id,
    quantityGrams: Number(row.quantity_grams),
    receivedGrams: Number(row.received_grams),
    status: readPurchaseOrderRecordStatus(row.status),
    expectedDate: row.expected_date,
    unitCost: Number(row.unit_cost),
    currency: row.currency,
    createdAt: row.created_at,
    lines: row.lines_json ? parseJson<PurchaseOrderRecord['lines']>(row.lines_json, undefined) : undefined,
  }
}

function priceHistoryFromRow(row: PriceHistoryRow): PriceHistoryRecord {
  return {
    id: row.id,
    organizationId: row.organization_id ?? 'org-nxl',
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

function finishedGoodLotFromRow(row: FinishedGoodLotRow): FinishedGoodLotRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    batchId: row.batch_id,
    formulaId: row.formula_id,
    formulaCode: row.formula_code,
    lotNumber: row.lot_number,
    quantityGrams: Number(row.quantity_grams),
    reservedGrams: Number(row.reserved_grams),
    qualityStatus: row.quality_status === 'HOLD' ? 'HOLD' : 'RELEASED',
    releasedAt: row.released_at,
    costPerGram: Number(row.cost_per_gram),
    currency: row.currency,
    location: row.location,
  }
}

function finishedGoodMovementFromRow(row: FinishedGoodMovementRow): FinishedGoodMovementRecord {
  const type = row.type === 'RESERVATION' || row.type === 'RESERVATION_RELEASE' || row.type === 'FULFILLMENT'
    ? row.type
    : 'PRODUCTION_OUTPUT'
  const direction = row.direction === 'HOLD' || row.direction === 'RELEASE' || row.direction === 'OUT'
    ? row.direction
    : 'IN'
  return {
    id: row.id,
    organizationId: row.organization_id,
    finishedGoodLotId: row.finished_good_lot_id,
    batchId: row.batch_id,
    formulaId: row.formula_id,
    orderId: row.order_id ?? undefined,
    type,
    direction,
    quantityGrams: Number(row.quantity_grams),
    balanceAfter: Number(row.balance_after),
    costPerGram: Number(row.cost_per_gram),
    cogsAmount: row.cogs_amount ?? undefined,
    at: row.at,
    actor: row.actor,
  }
}

function commercialSkuFromRow(row: CommercialSkuRow): CommercialSkuRecord {
  return {
    id: row.id,
    organizationId: row.organization_id ?? 'org-nxl',
    materialId: row.material_id,
    formulaId: row.formula_id ?? undefined,
    productKind: row.product_kind === 'FORMULA' || row.formula_id ? 'FORMULA' : 'MATERIAL',
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
    organizationId: row.organization_id ?? 'org-nxl',
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
    organizationId: row.organization_id ?? 'org-nxl',
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
    organizationId: row.organization_id ?? 'org-nxl',
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
    organizationId: row.organization_id ?? 'org-nxl',
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
    organizationId: row.organization_id ?? 'org-nxl',
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
    organizationId: row.organization_id ?? 'org-nxl',
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

function notificationFromRow(row: NotificationOutboxRow): AppNotificationRecord {
  const category = ['security', 'billing', 'inventory', 'workspace', 'system'].includes(row.category)
    ? row.category as AppNotificationRecord['category']
    : 'system'
  const emailStatus = ['in_app', 'queued', 'sent', 'failed'].includes(row.email_status)
    ? row.email_status as AppNotificationRecord['emailStatus']
    : 'in_app'
  return {
    id: row.id,
    organizationId: row.organization_id,
    recipientEmail: row.recipient_email,
    category,
    title: row.title,
    body: row.body,
    href: row.href ?? undefined,
    createdAt: row.created_at,
    readAt: row.read_at ?? undefined,
    emailStatus,
    emailError: row.email_error ?? undefined,
    emailAttempts: Number(row.email_attempts),
    emailLastAttemptAt: row.email_last_attempt_at ?? undefined,
    emailNextAttemptAt: row.email_next_attempt_at ?? undefined,
    emailSentAt: row.email_sent_at ?? undefined,
  }
}

function shipmentFromRow(row: ShipmentRow): ShipmentRecord {
  return {
    id: row.id,
    organizationId: row.organization_id ?? 'org-nxl',
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
    organizationId: row.organization_id ?? 'org-nxl',
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
    inTransitFromLocation: row.in_transit_from_location ?? undefined,
    inTransitToLocation: row.in_transit_to_location ?? undefined,
    transferStartedAt: row.transfer_started_at ?? undefined,
    transferStartedBy: row.transfer_started_by ?? undefined,
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
    status:
      row.status === 'REVERSED'
        ? 'REVERSED'
        : row.status === 'PARTIALLY_REVERSED'
          ? 'PARTIALLY_REVERSED'
          : 'COMMITTED',
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
  if (
    value === 'QUARANTINED' ||
    value === 'APPROVED' ||
    value === 'REVIEW_REQUIRED' ||
    value === 'EXPIRING' ||
    value === 'EXPIRED' ||
    value === 'SHARED' ||
    value === 'ARCHIVED'
  ) {
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
    value === 'TRANSFER' ||
    value === 'WASTE'
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

export function buildCorsHeaders(origin: string | null, configuredOrigins: string | undefined) {
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

function buildResponseHeaders(
  headers: HeadersInit,
  route: Route,
  result: unknown,
  issuedSessionCredential?: string,
) {
  const responseHeaders = new Headers(headers)
  if (route.sessionCookie === 'set') {
    const sessionId = readResultSessionId(result)
    if (sessionId && issuedSessionCredential) {
      responseHeaders.set('Set-Cookie', buildSessionCookie(issuedSessionCredential, tenantSessionCookieMaxAgeSeconds))
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

export function isAllowedCorsOrigin(origin: string, allowedOrigins: string[]) {
  try {
    const parsedOrigin = new URL(origin)
    if (parsedOrigin.origin !== origin || parsedOrigin.username || parsedOrigin.password) {
      return false
    }
    return allowedOrigins.some((allowedOrigin) => {
      if (!allowedOrigin || allowedOrigin.includes('*')) {
        return false
      }
      try {
        const parsedAllowed = new URL(allowedOrigin)
        return (
          parsedAllowed.origin === allowedOrigin &&
          !parsedAllowed.username &&
          !parsedAllowed.password &&
          parsedAllowed.origin === parsedOrigin.origin
        )
      } catch {
        return false
      }
    })
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
