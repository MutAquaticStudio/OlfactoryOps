import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common'
import { NorthStarService } from '../services/northstar.service.js'

type LabUsageBody = {
  formulaId?: string
  grams?: number
  actuals?: {
    materialId?: string
    lotId: string
    actualGrams: number
  }[]
  tolerancePercent?: number
  operator?: string
  purpose?: 'trial' | 'sample' | 'production-prep' | 'qc' | 'waste'
  projectCode?: string
  sampleCode?: string
  qcLink?: string
  reason?: string
  actor?: string
}

type CatalogSkuBody = {
  materialId?: string
  name?: string
  description?: string
  packSizeGrams?: number
  price?: number
  currency?: string
  tier?: 'Studio' | 'Lab' | 'Bulk'
  moqPacks?: number
  labelTemplate?: string
}

type PriceListBody = {
  name?: string
  customerGroup?: 'Studio' | 'Lab' | 'Bulk' | 'Contract'
  currency?: string
  multiplier?: number
  sampleEligible?: boolean
}

type QuoteBody = {
  skuId?: string
  customer?: string
  customerGroup?: 'Studio' | 'Lab' | 'Bulk' | 'Contract'
  quantityPacks?: number
}

type SampleRequestBody = {
  skuId?: string
  customer?: string
  packs?: number
}

type CustomerBody = {
  name?: string
  group?: 'Studio' | 'Lab' | 'Bulk' | 'Contract'
  creditLimit?: number
  paymentTerms?: 'NET_15' | 'NET_30' | 'PREPAID'
  contactEmail?: string
  billingAddress?: {
    label?: string
    line1?: string
    city?: string
    country?: string
  }
  shippingAddress?: {
    label?: string
    line1?: string
    city?: string
    country?: string
  }
}

type SalesOrderBody = {
  skuId?: string
  customerId?: string
  quantity?: number
  discountPercent?: number
  taxPercent?: number
  shippingCost?: number
  currency?: string
}

type PackOrderBody = {
  weightGrams?: number
}

type ShipOrderBody = {
  carrier?: 'DHL' | 'FedEx' | 'UPS' | 'Pickup'
  trackingNumber?: string
}

@Controller()
export class NorthStarController {
  constructor(@Inject(NorthStarService) private readonly northStar: NorthStarService) {}

  @Get('phases')
  phases() {
    return this.northStar.phases()
  }

  @Get('domains')
  domains() {
    return this.northStar.domains()
  }

  @Get('materials')
  materials() {
    return this.northStar.materials()
  }

  @Get('materials/dedupe')
  materialDedupe(@Query('cas') cas = '') {
    return this.northStar.materialDedupe(cas)
  }

  @Post('materials')
  createMaterial(
    @Body()
    body: {
      name?: string
      cas?: string
      family?: string
      tier?: 'Top' | 'Heart' | 'Base'
      vaporPressure?: number
      density?: number
      mw?: number
      logP?: number
      substantivityHours?: number
      ifraLimit?: number
      costPerGram?: number
      odor?: string[]
      source?: string
      version?: string
    },
  ) {
    return this.northStar.createMaterial(body)
  }

  @Get('materials/:id')
  material(@Param('id') id: string) {
    return this.northStar.material(id)
  }

  @Patch('materials/:id')
  updateMaterial(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string
      family?: string
      tier?: 'Top' | 'Heart' | 'Base'
      vaporPressure?: number
      density?: number
      mw?: number
      logP?: number
      substantivityHours?: number
      ifraLimit?: number
      costPerGram?: number
      odor?: string[]
      source?: string
      version?: string
    },
  ) {
    return this.northStar.updateMaterial(id, body)
  }

  @Post('materials/:id/ingest')
  ingestMaterialDocument(
    @Param('id') id: string,
    @Body()
    body: {
      documentType?: 'SDS' | 'CoA'
      source?: string
      version?: string
      approved?: boolean
      fields?: {
        density?: number
        vaporPressure?: number
        mw?: number
        logP?: number
        ifraLimit?: number
        costPerGram?: number
      }
      odor?: string[]
    },
  ) {
    return this.northStar.ingestMaterialDocument(id, body)
  }

  @Post('materials/:id/pubchem-fill')
  pubchemFill(@Param('id') id: string) {
    return this.northStar.pubchemFill(id)
  }

  @Get('materials/:id/molecules')
  materialMolecules(@Param('id') id: string) {
    return this.northStar.materialMolecules(id)
  }

  @Get('materials/:id/provenance')
  materialProvenance(@Param('id') id: string) {
    return this.northStar.materialProvenance(id)
  }

  @Get('formulas')
  formulas() {
    return this.northStar.formulas()
  }

  @Post('formulas')
  createFormulaDraft(@Body() body: { name?: string; targetGrams?: number; owner?: string }) {
    return this.northStar.createFormulaDraft(body)
  }

  @Post('formulas/:id/lines')
  addFormulaLine(
    @Param('id') id: string,
    @Body() body: { materialId?: string; childFormulaId?: string; grams?: number; label?: string },
  ) {
    return this.northStar.addFormulaLine(id, body)
  }

  @Patch('formulas/:id/lines/:lineId')
  updateFormulaLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: { materialId?: string; childFormulaId?: string; grams?: number; label?: string },
  ) {
    return this.northStar.updateFormulaLine(id, lineId, body)
  }

  @Delete('formulas/:id/lines/:lineId')
  deleteFormulaLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.northStar.deleteFormulaLine(id, lineId)
  }

  @Post('formulas/:id/lines/:lineId/move')
  moveFormulaLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: { direction?: 'up' | 'down' },
  ) {
    return this.northStar.moveFormulaLine(id, lineId, body)
  }

  @Get('formulas/:id/resolve')
  resolveFormula(@Param('id') id: string) {
    return this.northStar.resolveFormula(id)
  }

  @Get('formulas/:id/cost')
  formulaCost(@Param('id') id: string) {
    return this.northStar.formulaCost(id)
  }

  @Get('formulas/:id/versions')
  formulaVersions(@Param('id') id: string) {
    return this.northStar.formulaVersions(id)
  }

  @Post('formulas/:id/versions')
  createFormulaVersion(@Param('id') id: string, @Body() body: { note?: string; actor?: string }) {
    return this.northStar.createFormulaVersion(id, body)
  }

  @Post('formulas/:id/approve')
  approveFormula(@Param('id') id: string, @Body() body: { actor?: string }) {
    return this.northStar.approveFormula(id, body)
  }

  @Post('formulas/:id/export')
  exportFormula(@Param('id') id: string, @Body() body: { actor?: string }) {
    return this.northStar.exportFormula(id, body)
  }

  @Get('lots')
  lots() {
    return this.northStar.lotsList()
  }

  @Get('inventory/console')
  inventoryConsole() {
    return this.northStar.inventoryConsole()
  }

  @Get('inventory/summary')
  inventorySummary() {
    return this.northStar.inventorySummary()
  }

  @Get('inventory/movements')
  inventoryMovements() {
    return this.northStar.inventoryMovements()
  }

  @Get('inventory/reorder-suggestions')
  inventoryReorderSuggestions() {
    return this.northStar.inventoryReorderSuggestions()
  }

  @Post('inventory/stock-takes')
  performStockTake(
    @Body() body: { lotId?: string; countedGrams?: number; reason?: string; actor?: string },
  ) {
    return this.northStar.performStockTake(body)
  }

  @Get('storage-locations')
  storageLocations() {
    return this.northStar.storageLocationsList()
  }

  @Post('storage-locations')
  createStorageLocation(
    @Body()
    body: {
      name?: string
      zone?: string
      condition?: string
      capacityGrams?: number
      parentId?: string
      kind?: 'Warehouse' | 'Room' | 'Shelf' | 'Bin' | 'Transit'
      light?: 'Dark' | 'Amber' | 'Ambient'
      temperatureRange?: string
    },
  ) {
    return this.northStar.createStorageLocation(body)
  }

  @Patch('lots/:id/quality')
  changeLotQuality(
    @Param('id') id: string,
    @Body()
    body: { qualityStatus?: 'APPROVED' | 'QUARANTINE' | 'ON_HOLD' | 'REJECTED' | 'EXPIRED'; reason?: string },
  ) {
    return this.northStar.changeLotQuality(id, body)
  }

  @Post('lots/:id/label')
  lotLabel(@Param('id') id: string) {
    return this.northStar.lotLabel(id)
  }

  @Get('lots/:id/genealogy')
  lotGenealogy(@Param('id') id: string) {
    return this.northStar.lotGenealogy(id)
  }

  @Post('inventory/receipts')
  receiveInventoryReceipt(
    @Body()
    body: {
      materialId?: string
      lotNumber?: string
      quantityGrams?: number
      expiryDate?: string
      qualityStatus?: 'APPROVED' | 'QUARANTINE' | 'ON_HOLD' | 'REJECTED' | 'EXPIRED'
      location?: string
      supplierLotRef?: string
      currency?: string
      retestDate?: string
      openedDate?: string
      shelfLifeAfterOpeningDays?: number
      container?: string
      packaging?: string
    },
  ) {
    return this.northStar.receiveInventoryReceipt(body)
  }

  @Post('inventory/adjustments')
  adjustInventory(
    @Body() body: { lotId?: string; direction?: 'IN' | 'OUT'; quantityGrams?: number; reason?: string },
  ) {
    return this.northStar.adjustInventory(body)
  }

  @Post('inventory/transfers')
  transferInventory(@Body() body: { lotId?: string; toLocation?: string }) {
    return this.northStar.transferInventory(body)
  }

  @Post('auth/login')
  login(@Body() body: { email?: string }) {
    return this.northStar.login(body.email)
  }

  @Post('auth/signup')
  signup(@Body() body: { organizationName?: string; workspaceSlug?: string; email?: string; name?: string }) {
    return this.northStar.signup(body)
  }

  @Post('auth/logout')
  logout() {
    return this.northStar.logout()
  }

  @Get('me')
  me() {
    return this.northStar.me()
  }

  @Get('user/settings')
  userSettings() {
    return this.northStar.userSettings()
  }

  @Patch('user/settings')
  updateUserSettings(@Body() body: Record<string, unknown>) {
    return this.northStar.updateUserSettings(body)
  }

  @Get('audit-logs')
  auditLogs() {
    return this.northStar.auditLogs()
  }

  @Get('security/policy')
  securityPolicy() {
    return this.northStar.securityPolicy()
  }

  @Get('security/tenant-console')
  tenantConsole() {
    return this.northStar.tenantConsole()
  }

  @Post('security/members/invite')
  inviteMember(@Body() body: { email?: string; name?: string; role?: string; brandIds?: string[] }) {
    return this.northStar.inviteMember(body)
  }

  @Patch('security/members/:id/status')
  setMembershipStatus(@Param('id') id: string, @Body() body: { status?: 'ACTIVE' | 'DEACTIVATED' }) {
    return this.northStar.setMembershipStatus(id, body.status ?? 'DEACTIVATED')
  }

  @Post('security/sessions/:id/revoke')
  revokeSession(@Param('id') id: string) {
    return this.northStar.revokeSession(id)
  }

  @Post('security/sessions/revoke-all')
  revokeAllSessions(@Body() body: { email?: string; keepCurrent?: boolean }) {
    return this.northStar.revokeAllSessions(body)
  }

  @Post('security/sessions/:id/touch')
  touchSession(@Param('id') id: string) {
    return this.northStar.touchSession(id)
  }

  @Get('security/permissions')
  permissionMatrix() {
    return this.northStar.permissionMatrix()
  }

  @Patch('security/roles/:role/permissions')
  setRolePermissions(@Param('role') role: string, @Body() body: { permissions?: string[] }) {
    return this.northStar.setRolePermissions(role, body.permissions ?? [])
  }

  @Get('security/tenant-probe')
  tenantProbe(@Query('organizationId') organizationId = 'org-nxl') {
    return this.northStar.tenantProbe(organizationId)
  }

  @Get('security/permission-probe')
  permissionProbe(@Query('permission') permission = 'inventory.adjust', @Query('role') role = 'Viewer') {
    return this.northStar.permissionProbe(permission, role)
  }

  @Get('settings')
  settings() {
    return this.northStar.settings()
  }

  @Patch('settings')
  updateSettings(
    @Body()
    body: {
      locale?: string
      timezone?: string
      currency?: string
      defaultUnit?: 'g' | 'ml'
      defaultDilutionPercent?: number
    },
  ) {
    return this.northStar.updateSettings(body)
  }

  @Get('customization-console')
  customizationConsole() {
    return this.northStar.customizationConsole()
  }

  @Get('feature-flags')
  featureFlags() {
    return this.northStar.featureFlags()
  }

  @Patch('feature-flags/:key')
  updateFeatureFlag(@Param('key') key: string, @Body() body: { enabled?: boolean }) {
    return this.northStar.updateFeatureFlag(key, body.enabled === true)
  }

  @Get('numbering-sequences')
  numberingSequences() {
    return this.northStar.numberingSequences()
  }

  @Patch('numbering-sequences/:key')
  updateNumberingSequence(
    @Param('key') key: string,
    @Body() body: { pattern?: string; nextValue?: number; scope?: 'organization' | 'brand' },
  ) {
    return this.northStar.updateNumberingSequence(key, body)
  }

  @Get('numbering-sequences/:key/preview')
  previewNumber(@Param('key') key: string) {
    return this.northStar.previewNumber(key)
  }

  @Post('numbering-sequences/:key/next')
  nextNumber(@Param('key') key: string) {
    return this.northStar.nextNumber(key)
  }

  @Post('custom-fields')
  createCustomField(
    @Body()
    body: {
      entity?: 'material' | 'formula' | 'lot' | 'document' | 'supplier' | 'order'
      key?: string
      label?: string
      fieldType?: 'text' | 'number' | 'select' | 'date' | 'boolean'
      required?: boolean
      options?: string[]
    },
  ) {
    return this.northStar.createCustomField(body)
  }

  @Patch('branding')
  updateBranding(
    @Body()
    body: {
      displayName?: string
      accentColor?: string
      documentFooter?: string
      labelTemplate?: string
      logoMode?: 'wordmark' | 'monogram'
    },
  ) {
    return this.northStar.updateBranding(body)
  }

  @Get('documents')
  documents() {
    return this.northStar.documents()
  }

  @Get('documents/compliance-dashboard')
  documentComplianceDashboard() {
    return this.northStar.documentComplianceDashboard()
  }

  @Post('documents/generate')
  generateDocument(@Body() body: { type?: string; linkedTo?: string; actor?: string }) {
    return this.northStar.generateDocument(body)
  }

  @Post('documents/:id/approve')
  approveDocument(@Param('id') id: string, @Body() body: { actor?: string; note?: string }) {
    return this.northStar.approveDocument(id, body)
  }

  @Post('documents/:id/share')
  shareDocument(@Param('id') id: string, @Body() body: { recipient?: string; actor?: string }) {
    return this.northStar.shareDocument(id, body)
  }

  @Get('documents/download-audit')
  documentDownloadAudit() {
    return this.northStar.documentDownloadAudit()
  }

  @Post('documents/:id/signed-url')
  requestDocumentSignedUrl(@Param('id') id: string) {
    return this.northStar.requestDocumentSignedUrl(id)
  }

  @Get('lab-usage')
  labUsageHistory() {
    return this.northStar.labUsageHistory()
  }

  @Get('lab-usage/plan')
  labUsagePlan(@Query('formulaId') formulaId = 'frm-0421', @Query('grams') grams = '12.5') {
    return this.northStar.labUsagePlan(formulaId, Number(grams))
  }

  @Get('lab-usage/:id')
  labUsageDetail(@Param('id') id: string) {
    return this.northStar.labUsageDetail(id)
  }

  @Post('lab-usage/weighing-session')
  recordLabWeighingSession(@Body() body: LabUsageBody = {}) {
    return this.northStar.recordLabWeighingSession(body.formulaId ?? 'frm-0421', body.grams ?? 12.5, {
      actuals: body.actuals,
      tolerancePercent: body.tolerancePercent,
      operator: body.operator,
    })
  }

  @Post('lab-usage/commit')
  commitLabUsage(@Body() body: LabUsageBody = {}) {
    return this.northStar.commitLabUsage(body.formulaId ?? 'frm-0421', body.grams ?? 12.5, {
      actuals: body.actuals,
      tolerancePercent: body.tolerancePercent,
      operator: body.operator,
      purpose: body.purpose,
      projectCode: body.projectCode,
      sampleCode: body.sampleCode,
      qcLink: body.qcLink,
    })
  }

  @Post('lab-usage/reverse-latest')
  reverseLatestLabUsage(@Body() body: LabUsageBody = {}) {
    return this.northStar.reverseLatestLabUsage({
      reason: body.reason,
      actor: body.actor,
    })
  }

  @Post('lab-usage/:id/reverse')
  reverseLabUsage(@Param('id') id: string, @Body() body: LabUsageBody = {}) {
    return this.northStar.reverseLabUsage(id, {
      reason: body.reason,
      actor: body.actor,
    })
  }

  @Get('production/batches')
  productionBatches() {
    return this.northStar.productionBatches()
  }

  @Post('production/batches')
  createProductionBatch(@Body() body: { formulaId?: string; targetGrams?: number }) {
    return this.northStar.createProductionBatch(body.formulaId, body.targetGrams)
  }

  @Post('production/batches/:id/consume')
  consumeProductionBatch(@Param('id') id: string) {
    return this.northStar.consumeProductionBatch(id)
  }

  @Post('production/batches/:id/qc')
  qcProductionBatch(@Param('id') id: string, @Body() body: { result?: 'PASSED' | 'FAILED' }) {
    return this.northStar.qcProductionBatch(id, body.result)
  }

  @Patch('production/batches/:id/status')
  updateProductionBatchStatus(
    @Param('id') id: string,
    @Body() body: { status?: 'PLANNED' | 'WEIGHING' | 'MACERATION' | 'FILTRATION' | 'QC' | 'BOTTLING' | 'RELEASED' | 'HOLD' },
  ) {
    return this.northStar.updateProductionBatchStatus(id, body.status ?? 'MACERATION')
  }

  @Get('suppliers')
  suppliers() {
    return this.northStar.suppliers()
  }

  @Post('suppliers')
  createSupplier(
    @Body()
    body: {
      name?: string
      country?: string
      leadTimeDays?: number
      contactEmail?: string
      paymentTerms?: string
      preferredMaterialIds?: string[]
    },
  ) {
    return this.northStar.createSupplier(body)
  }

  @Get('purchase-orders')
  purchaseOrders() {
    return this.northStar.purchaseOrders()
  }

  @Post('purchase-orders')
  createPurchaseOrder(
    @Body()
    body: {
      supplierId?: string
      materialId?: string
      quantityGrams?: number
      unitCost?: number
      currency?: string
      expectedDate?: string
    },
  ) {
    return this.northStar.createPurchaseOrder(body)
  }

  @Patch('purchase-orders/:id/status')
  updatePurchaseOrderStatus(@Param('id') id: string, @Body() body: { status?: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' }) {
    return this.northStar.updatePurchaseOrderStatus(id, body.status ?? 'SENT')
  }

  @Post('purchase-orders/:id/receive')
  receivePurchaseOrder(@Param('id') id: string, @Body() body: { receivedGrams?: number }) {
    return this.northStar.receivePurchaseOrder(id, body)
  }

  @Get('materials/:id/price-history')
  materialPriceHistory(@Param('id') id: string) {
    return this.northStar.materialPriceHistory(id)
  }

  @Get('catalog/skus')
  catalogSkus() {
    return this.northStar.catalogSkus()
  }

  @Post('catalog/skus')
  createCatalogSku(@Body() body: CatalogSkuBody) {
    return this.northStar.createCatalogSku(body)
  }

  @Get('price-lists')
  priceLists() {
    return this.northStar.priceLists()
  }

  @Post('price-lists')
  createPriceList(@Body() body: PriceListBody) {
    return this.northStar.createPriceList(body)
  }

  @Get('quotes')
  quotes() {
    return this.northStar.quotes()
  }

  @Post('quotes')
  createQuote(@Body() body: QuoteBody) {
    return this.northStar.createQuote(body)
  }

  @Get('samples')
  samples() {
    return this.northStar.samples()
  }

  @Post('samples')
  requestSample(@Body() body: SampleRequestBody) {
    return this.northStar.requestSample(body)
  }

  @Get('customers')
  customers() {
    return this.northStar.customers()
  }

  @Post('customers')
  createCustomer(@Body() body: CustomerBody) {
    return this.northStar.createCustomer(body)
  }

  @Get('orders')
  orders() {
    return this.northStar.orders()
  }

  @Post('orders')
  createOrder(@Body() body: SalesOrderBody) {
    return this.northStar.createOrder(body)
  }

  @Post('orders/:id/reserve')
  reserveOrder(@Param('id') id: string) {
    return this.northStar.reserveOrder(id)
  }

  @Post('orders/:id/cancel')
  cancelOrder(@Param('id') id: string) {
    return this.northStar.cancelOrder(id)
  }

  @Post('orders/:id/pack')
  packOrder(@Param('id') id: string, @Body() body: PackOrderBody) {
    return this.northStar.packOrder(id, body)
  }

  @Post('orders/:id/ship')
  shipOrder(@Param('id') id: string, @Body() body: ShipOrderBody) {
    return this.northStar.shipOrder(id, body)
  }

  @Post('orders/:id/fulfill')
  fulfillOrder(@Param('id') id: string) {
    return this.northStar.fulfillOrder(id)
  }

  @Get('shipments')
  shipments() {
    return this.northStar.shipments()
  }

  @Get('order-documents')
  orderDocuments() {
    return this.northStar.orderDocuments()
  }

  @Get('costing/overview')
  costingOverview() {
    return this.northStar.costingOverview()
  }

  @Get('costing/formulas/:id')
  costingFormula(@Param('id') id: string) {
    return this.northStar.costingFormula(id)
  }

  @Get('costing/batches/:id')
  costingBatch(@Param('id') id: string) {
    return this.northStar.costingBatch(id)
  }

  @Get('costing/skus/:id')
  costingSku(@Param('id') id: string) {
    return this.northStar.costingSku(id)
  }

  @Get('costing/valuation')
  costingValuation() {
    return this.northStar.costingValuation()
  }

  @Get('analytics/dashboard')
  analyticsDashboard() {
    return this.northStar.analyticsDashboard()
  }

  @Get('analytics/burn-rate')
  analyticsBurnRate() {
    return this.northStar.analyticsBurnRate()
  }

  @Get('analytics/low-stock-forecast')
  analyticsLowStockForecast() {
    return this.northStar.analyticsLowStockForecast()
  }

  @Get('analytics/expiry-risk')
  analyticsExpiryRisk() {
    return this.northStar.analyticsExpiryRisk()
  }

  @Get('analytics/cost-ranking')
  analyticsCostRanking() {
    return this.northStar.analyticsCostRanking()
  }

  @Get('analytics/inventory')
  analyticsInventory() {
    return this.northStar.analyticsInventory()
  }

  @Get('analytics/reports')
  analyticsReports() {
    return this.northStar.analyticsReports()
  }

  @Post('analytics/reports/:id/run')
  runAnalyticsReport(@Param('id') id: string) {
    return this.northStar.runAnalyticsReport(id)
  }

  @Get('billing/plan')
  billingPlan() {
    return this.northStar.billingPlan()
  }

  @Get('billing/plans')
  billingPlans() {
    return this.northStar.billingPlans()
  }

  @Get('billing/console')
  billingConsole() {
    return this.northStar.billingConsole()
  }

  @Get('billing/subscription')
  billingSubscription() {
    return this.northStar.billingSubscription()
  }

  @Get('billing/usage')
  billingUsage() {
    return this.northStar.billingUsage()
  }

  @Get('billing/invoices')
  billingInvoices() {
    return this.northStar.billingInvoices()
  }

  @Post('billing/checkout')
  startBillingCheckout(@Body() body: { planId?: string; mode?: 'checkout' | 'manual_sales' }) {
    return this.northStar.startBillingCheckout(body)
  }

  @Post('billing/subscription/select-plan')
  selectBillingPlan(@Body() body: { planId?: string; billingCycle?: 'monthly' | 'annual' }) {
    return this.northStar.selectBillingPlan(body)
  }

  @Post('billing/portal')
  openBillingPortal() {
    return this.northStar.openBillingPortal()
  }

  @Post('billing/subscription/freeze')
  freezeSubscription(@Body() body: { reason?: string }) {
    return this.northStar.freezeSubscription(body)
  }

  @Post('billing/subscription/reactivate')
  reactivateSubscription() {
    return this.northStar.reactivateSubscription()
  }

  @Post('webhooks/deliveries/:id/retry')
  retryWebhookDelivery(@Param('id') id: string) {
    return this.northStar.retryWebhookDelivery(id)
  }

  @Get('sso-config')
  ssoConfig() {
    return this.northStar.ssoConfig()
  }

  @Get('api-keys')
  apiKeys() {
    return this.northStar.apiKeys()
  }

  @Get('webhooks')
  webhooks() {
    return this.northStar.webhooks()
  }

  @Post('audit/export')
  auditExport() {
    return this.northStar.auditExport()
  }
}
