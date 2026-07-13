import { NorthStarService } from '../server/src/services/northstar.service.js'
import { TooManyRequestsException } from '../server/src/shared/http-error.js'
import type { AuditEvent, AuthSession, DocumentRecord, InventoryLot, InventoryMovement, LabUsageRecord } from '../src/data/northStar.js'

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
  | 'subscriptionRecord'
  | 'invoiceRecords'
  | 'webhookDeliveryRecords'
  | 'auditCounter'

type ServiceState = Record<SnapshotKey, unknown> & {
  sessions: AuthSession[]
  auditEvents: AuditEvent[]
  documentRecords: DocumentRecord[]
  lots: InventoryLot[]
  movements: InventoryMovement[]
  usageHistory: LabUsageRecord[]
  auditCounter: number
}

const API_PREFIX = '/api/v1'
const LOCAL_CORS_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173']
const NORMALIZED_STATE_KEYS = new Set<SnapshotKey>([
  'sessions',
  'auditEvents',
  'auditCounter',
  'documentRecords',
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
  'subscriptionRecord',
  'invoiceRecords',
  'webhookDeliveryRecords',
  'auditCounter',
]
const SNAPSHOT_PERSIST_KEYS = SNAPSHOT_KEYS.filter((key) => !NORMALIZED_STATE_KEYS.has(key))

const routes: Route[] = [
  { method: 'GET', pattern: '/health', public: true, handler: () => ({ ok: true, service: 'olfactoryops-worker-api', version: '0.1.0-cloudflare-d1', timestamp: new Date().toISOString() }) },
  { method: 'GET', pattern: '/version', public: true, handler: () => ({ data: { name: 'OlfactoryOps Cloudflare Worker API', stack: ['Cloudflare Workers', 'D1', 'TypeScript'], api: API_PREFIX } }) },
  { method: 'GET', pattern: '/persistence/status', public: true, handler: () => ({ data: { adapter: 'cloudflare-d1-hybrid', snapshotKeys: SNAPSHOT_PERSIST_KEYS.length, snapshotTable: 'northstar_snapshots', normalizedTables: ['auth_sessions', 'audit_events', 'security_rate_limits', 'document_records', 'inventory_lots', 'inventory_movements', 'lab_usage_records'] } }) },
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
  { method: 'GET', pattern: '/billing/console', handler: ({ service }) => service.billingConsole() },
  { method: 'GET', pattern: '/billing/subscription', handler: ({ service }) => service.billingSubscription() },
  { method: 'GET', pattern: '/billing/usage', handler: ({ service }) => service.billingUsage() },
  { method: 'GET', pattern: '/billing/invoices', handler: ({ service }) => service.billingInvoices() },
  { method: 'POST', pattern: '/billing/checkout', mutates: true, writeGate: false, handler: ({ service, body }) => service.startBillingCheckout(body) },
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
  await ensureAuditEventTable(db)
  await ensureDocumentRecordTable(db)
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

type AuditEventRow = {
  id: string
  at: string
  actor: string
  action: string
  entity: string
  request_id: string
  outcome: string
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
  await hydrateDocumentState(db, serviceState)
  await hydrateInventoryState(db, serviceState)
  await hydrateLabUsageState(db, serviceState)
}

async function persistNormalizedState(db: D1Database, serviceState: ServiceState, updatedAt: string) {
  await persistAuthSessions(db, serviceState.sessions, updatedAt)
  await persistAuditEvents(db, serviceState.auditEvents, updatedAt)
  await persistDocumentRecords(db, serviceState.documentRecords, updatedAt)
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

function readAuditOutcome(value: string): AuditEvent['outcome'] {
  if (value === 'allowed' || value === 'blocked' || value === 'review') {
    return value
  }
  return 'review'
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
