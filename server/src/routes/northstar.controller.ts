import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common'
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

type FormulaDraftBody = {
  expectedRevision?: number
  name?: string
  formulaType?: 'ACCORD' | 'FINE_FRAGRANCE'
  targetGrams?: number
  concentrationType?: 'PARFUM' | 'EDP' | 'EDT' | 'EDC' | 'COLOGNE' | 'OTHER'
  finalProductConcentrationPercent?: number
  targetMarkets?: string[]
  brief?: string
  inspiration?: string
  pyramidSummary?: string
  tags?: string[]
  project?: string
  collection?: string
  density?: number
  bottleVolumeMl?: number
  bottleCount?: number
  ifraCategory?: string
  assignedReviewer?: string
  lines?: Array<{
    id: string
    label: string
    grams: number
    materialId?: string
    childFormulaId?: string
    dilution?: number
    concentration?: number
    pyramidNote?: 'Top' | 'Middle' | 'Base' | 'Solvent'
    odorType?: string
    accord?: string
    tags?: string[]
    notes?: string
    sourceLotId?: string
    sourceLotNumber?: string
    sourceLocation?: string
    sourceAvailableGrams?: number
    sourceSupplierLotRef?: string
  }>
}

type FormulaReviewBody = {
  reviewer?: string
  comment?: string
  signature?: string
}

type FormulaEvaluationBody = {
  day?: number
  observation?: string
  stability?: 'PASS' | 'WATCH' | 'FAIL'
  rating?: number
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
  customerId?: string
  customer?: string
  customerGroup?: 'Studio' | 'Lab' | 'Bulk' | 'Contract'
  quantityPacks?: number
  lines?: Array<{ skuId?: string; quantityPacks?: number }>
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
  createFormulaDraft(@Body() body: FormulaDraftBody) {
    return this.northStar.createFormulaDraft(body)
  }

  @Patch('formulas/:id')
  updateFormulaDraft(@Param('id') id: string, @Body() body: FormulaDraftBody) {
    return this.northStar.updateFormulaDraft(id, body)
  }

  @Post('formulas/:id/fork')
  forkFormula(@Param('id') id: string, @Body() body: { name?: string; comment?: string }) {
    return this.northStar.forkFormula(id, body)
  }

  @Post('formulas/:id/lines')
  addFormulaLine(
    @Param('id') id: string,
    @Body() body: {
      materialId?: string
      childFormulaId?: string
      grams?: number
      label?: string
      dilution?: number
      concentration?: number
      pyramidNote?: 'Top' | 'Middle' | 'Base' | 'Solvent'
      odorType?: string
      accord?: string
      tags?: string[]
      notes?: string
      sourceLotId?: string
      sourceLotNumber?: string
      sourceLocation?: string
      sourceAvailableGrams?: number
      sourceSupplierLotRef?: string
    },
  ) {
    return this.northStar.addFormulaLine(id, body)
  }

  @Patch('formulas/:id/lines/:lineId')
  updateFormulaLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: {
      materialId?: string
      childFormulaId?: string
      grams?: number
      label?: string
      dilution?: number
      concentration?: number
      pyramidNote?: 'Top' | 'Middle' | 'Base' | 'Solvent'
      odorType?: string
      accord?: string
      tags?: string[]
      notes?: string
      sourceLotId?: string
      sourceLotNumber?: string
      sourceLocation?: string
      sourceAvailableGrams?: number
      sourceSupplierLotRef?: string
    },
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

  @Get('formulas/:id/ifra-check')
  formulaIfra(@Param('id') id: string) {
    return this.northStar.formulaIfra(id)
  }

  @Get('formulas/:id/evaporation')
  formulaEvaporation(@Param('id') id: string) {
    return this.northStar.formulaEvaporation(id)
  }

  @Post('formulas/:id/scale')
  formulaScale(
    @Param('id') id: string,
    @Body() body: { targetGrams?: number; targetVolumeMl?: number; bottleCount?: number; incrementGrams?: number },
  ) {
    return this.northStar.formulaScale(id, body)
  }

  @Get('formulas/:id/versions')
  formulaVersions(@Param('id') id: string) {
    return this.northStar.formulaVersions(id)
  }

  @Post('formulas/:id/versions')
  createFormulaVersion(@Param('id') id: string, @Body() body: { note?: string; actor?: string }) {
    return this.northStar.createFormulaVersion(id, body)
  }

  @Get('formulas/:id/versions/diff')
  formulaVersionDiff(
    @Param('id') id: string,
    @Query('from') fromVersion?: string,
    @Query('to') toVersion?: string,
  ) {
    return this.northStar.formulaVersionDiff(id, fromVersion, toVersion)
  }

  @Post('formulas/:id/versions/:version/evaluations')
  addFormulaEvaluation(
    @Param('id') id: string,
    @Param('version') version: string,
    @Body() body: FormulaEvaluationBody,
  ) {
    return this.northStar.addFormulaEvaluation(id, version, body)
  }

  @Post('formulas/:id/review')
  submitFormulaForReview(@Param('id') id: string, @Body() body: FormulaReviewBody) {
    return this.northStar.submitFormulaForReview(id, body)
  }

  @Post('formulas/:id/reject')
  rejectFormula(@Param('id') id: string, @Body() body: FormulaReviewBody) {
    return this.northStar.rejectFormula(id, body)
  }

  @Post('formulas/:id/approve')
  approveFormula(@Param('id') id: string, @Body() body: FormulaReviewBody) {
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
      documents?: Array<{
        type?: 'SDS' | 'CoA'
        fileName?: string
        fileSizeKb?: number
        mimeType?: string
      }>
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

  @Get('inventory/approval-requests')
  inventoryApprovalRequests() {
    return this.northStar.inventoryApprovalRequests()
  }

  @Post('inventory/approval-requests')
  requestInventoryApproval(@Body() body: { action?: string; payload?: unknown; reason?: string }) {
    return this.northStar.requestInventoryApproval(body)
  }

  @Post('inventory/approval-requests/:id/approve')
  approveInventoryApprovalRequest(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.northStar.approveInventoryApprovalRequest(id, body)
  }

  @Post('inventory/approval-requests/:id/reject')
  rejectInventoryApprovalRequest(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.northStar.rejectInventoryApprovalRequest(id, body)
  }

  @Get('approval-requests')
  operationApprovalRequests() {
    return this.northStar.operationApprovalRequests()
  }

  @Post('approval-requests')
  requestOperationApproval(@Body() body: { method?: string; path?: string; payload?: unknown; reason?: string }) {
    return this.northStar.requestOperationApproval(body)
  }

  @Post('approval-requests/:id/approve')
  approveOperationApprovalRequest(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.northStar.approveOperationApprovalRequest(id, body)
  }

  @Post('approval-requests/:id/reject')
  rejectOperationApprovalRequest(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.northStar.rejectOperationApprovalRequest(id, body)
  }

  @Post('auth/login')
  login(@Body() body: { email?: string; password?: string }) {
    return this.northStar.login(body.email, body.password)
  }

  @Post('auth/signup')
  signup(
    @Body()
    body: { organizationName?: string; workspaceSlug?: string; email?: string; name?: string; password?: string; customDomain?: string },
  ) {
    return this.northStar.signup(body)
  }

  @Get('auth/mfa/status')
  mfaStatus() {
    return this.northStar.mfaStatus()
  }

  @Post('auth/mfa/enroll')
  beginMfaEnrollment(@Body() body: { password?: string }) {
    return this.northStar.beginMfaEnrollment(body)
  }

  @Post('auth/mfa/verify')
  verifyMfa(@Body() body: { code?: string }) {
    return this.northStar.verifyMfa(body)
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

  @Get('security/member-summary')
  memberSummary() {
    return this.northStar.memberSummary()
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

  @Get('branding')
  workspaceBranding() {
    return this.northStar.workspaceBranding()
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
      logoMode?: 'wordmark' | 'monogram' | 'image'
      logoImageUrl?: string
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
  labUsagePlan(@Query('formulaId') formulaId = '', @Query('grams') grams = '12.5') {
    return this.northStar.labUsagePlan(formulaId, Number(grams))
  }

  @Get('lab-usage/:id')
  labUsageDetail(@Param('id') id: string) {
    return this.northStar.labUsageDetail(id)
  }

  @Post('lab-usage/weighing-session')
  recordLabWeighingSession(@Body() body: LabUsageBody = {}) {
    return this.northStar.recordLabWeighingSession(body.formulaId ?? '', body.grams ?? 12.5, {
      actuals: body.actuals,
      tolerancePercent: body.tolerancePercent,
      operator: body.operator,
    })
  }

  @Post('lab-usage/commit')
  commitLabUsage(@Body() body: LabUsageBody = {}) {
    return this.northStar.commitLabUsage(body.formulaId ?? '', body.grams ?? 12.5, {
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

  @Get('production/schedule')
  productionSchedule() {
    return this.northStar.productionSchedule()
  }

  @Patch('production/batches/:id/plan')
  planProductionBatch(
    @Param('id') id: string,
    @Body() body: { scheduledStartAt?: string; dueAt?: string; equipment?: string },
  ) {
    return this.northStar.planProductionBatch(id, body)
  }

  @Get('production/qc-templates')
  productionQcTemplates() {
    return this.northStar.productionQcTemplates()
  }

  @Post('production/qc-templates')
  createProductionQcTemplate(
    @Body()
    body: {
      formulaId?: string
      name?: string
      checks?: Array<{
        id?: string
        label?: string
        kind?: 'NUMERIC' | 'TEXT' | 'BOOLEAN'
        unit?: string
        required?: boolean
        min?: number
        max?: number
        expectedText?: string
      }>
    },
  ) {
    return this.northStar.createProductionQcTemplate(body)
  }

  @Get('production/batches/:id/qc/results')
  productionQcResults(@Param('id') id: string) {
    return this.northStar.productionQcResults(id)
  }

  @Post('production/batches/:id/qc/results')
  recordProductionQcResult(
    @Param('id') id: string,
    @Body() body: { templateCheckId?: string; observedValue?: string; status?: 'PENDING' | 'PASSED' | 'FAILED' | 'NOT_APPLICABLE'; note?: string; documentIds?: string[] },
  ) {
    return this.northStar.recordProductionQcResult(id, body)
  }

  @Post('production/batches/:id/qc/approve')
  approveProductionQc(@Param('id') id: string) {
    return this.northStar.approveProductionQc(id)
  }

  @Post('production/batches/:id/yield')
  recordProductionYield(
    @Param('id') id: string,
    @Body() body: { yieldGrams?: number; wasteGrams?: number; laborCost?: number; overheadCost?: number; note?: string },
  ) {
    return this.northStar.recordProductionYield(id, body)
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

  @Get('procurement/receipts')
  procurementReceipts() {
    return this.northStar.procurementReceipts()
  }

  @Post('purchase-orders/:id/receipts')
  createProcurementReceipt(
    @Param('id') id: string,
    @Body() body: { receivedAt?: string; documentIds?: string[]; lines?: Array<{ materialId?: string; receivedGrams?: number; supplierLotRef?: string }> },
  ) {
    return this.northStar.createProcurementReceipt(id, body)
  }

  @Post('procurement/receipts/:id/landed-cost')
  postProcurementLandedCost(
    @Param('id') id: string,
    @Body() body: { freightCost?: number; dutyCost?: number; insuranceCost?: number },
  ) {
    return this.northStar.postProcurementLandedCost(id, body)
  }

  @Post('procurement/receipts/:id/inspect')
  inspectProcurementReceipt(
    @Param('id') id: string,
    @Body() body: { action?: 'ACCEPT' | 'QUARANTINE' | 'RETURN'; discrepancies?: Array<{ type?: 'SHORT' | 'DAMAGE' | 'QUALITY' | 'DOCUMENT' | 'OTHER'; action?: 'ACCEPT' | 'QUARANTINE' | 'RETURN'; note?: string }> },
  ) {
    return this.northStar.inspectProcurementReceipt(id, body)
  }

  @Get('materials/:id/compliance')
  materialCompliance(@Param('id') id: string) {
    return this.northStar.materialCompliance(id)
  }

  @Put('materials/:id/compliance')
  upsertMaterialCompliance(
    @Param('id') id: string,
    @Body()
    body: {
      status?: 'APPROVED' | 'REVIEW_REQUIRED' | 'BLOCKED'
      ifraCategoryLimits?: Array<{ category?: string; limitPercent?: number }>
      allergens?: Array<{ name?: string; cas?: string; concentrationPercent?: number }>
      euUkFlags?: string[]
      source?: string
      sourceVersion?: string
      reviewedAt?: string
      sourceDocumentId?: string
      note?: string
    },
  ) {
    return this.northStar.upsertMaterialCompliance(id, body)
  }

  @Get('suppliers/:id/material-profiles')
  supplierMaterialProfiles(@Param('id') id: string) {
    return this.northStar.supplierMaterialProfiles(id)
  }

  @Put('suppliers/:id/material-profiles/:materialId')
  upsertSupplierMaterialProfile(
    @Param('id') id: string,
    @Param('materialId') materialId: string,
    @Body()
    body: {
      status?: 'APPROVED' | 'REVIEW_REQUIRED' | 'BLOCKED'
      leadTimeDays?: number
      minimumOrderGrams?: number
      unitCost?: number
      currency?: string
      supplierMaterialCode?: string
    },
  ) {
    return this.northStar.upsertSupplierMaterialProfile(id, materialId, body)
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

  @Patch('quotes/:id/status')
  updateQuoteStatus(
    @Param('id') id: string,
    @Body() body: { status?: 'DRAFT' | 'REVIEW' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' },
  ) {
    return this.northStar.updateQuoteStatus(id, body)
  }

  @Post('quotes/:id/convert')
  convertQuoteToOrder(@Param('id') id: string) {
    return this.northStar.convertQuoteToOrder(id)
  }

  @Get('samples')
  samples() {
    return this.northStar.samples()
  }

  @Post('samples')
  requestSample(@Body() body: SampleRequestBody) {
    return this.northStar.requestSample(body)
  }

  @Patch('samples/:id/status')
  updateSampleStatus(@Param('id') id: string, @Body() body: { status?: 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'CONVERTED' }) {
    return this.northStar.updateSampleStatus(id, body)
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
  reserveOrder(@Param('id') id: string, @Body() body: { allowPartial?: boolean }) {
    return this.northStar.reserveOrder(id, body)
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

  @Get('analytics/operations')
  operationalAnalytics() {
    return this.northStar.operationalAnalytics()
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

  @Get('integrations/readiness')
  integrationReadiness() {
    return this.northStar.integrationReadiness()
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

  @Get('saas/custom-domains')
  customDomains() {
    return this.northStar.customDomains()
  }

  @Post('webhooks/deliveries/:id/retry')
  retryWebhookDelivery(@Param('id') id: string) {
    return this.northStar.retryWebhookDelivery(id)
  }

  @Get('sso-config')
  ssoConfig() {
    return this.northStar.ssoConfig()
  }

  @Patch('sso-config')
  updateSsoConfig(@Body() body: Record<string, unknown>) {
    return this.northStar.updateSsoConfig(body)
  }

  @Post('sso-config/scim-token/rotate')
  rotateScimToken() {
    return this.northStar.rotateScimToken()
  }

  @Get('api-keys')
  apiKeys() {
    return this.northStar.apiKeys()
  }

  @Post('api-keys')
  createApiKey(@Body() body: { label?: string; scopes?: string[]; expiresAt?: string }) {
    return this.northStar.createApiKey(body)
  }

  @Post('api-keys/:id/rotate')
  rotateApiKey(@Param('id') id: string) {
    return this.northStar.rotateApiKey(id)
  }

  @Post('api-keys/:id/revoke')
  revokeApiKey(@Param('id') id: string) {
    return this.northStar.revokeApiKey(id)
  }

  @Get('webhooks')
  webhooks() {
    return this.northStar.webhooks()
  }

  @Post('webhooks')
  createWebhook(@Body() body: { url?: string; events?: string[] }) {
    return this.northStar.createWebhook(body)
  }

  @Patch('webhooks/:id')
  updateWebhook(@Param('id') id: string, @Body() body: { url?: string; events?: string[]; status?: 'active' | 'paused' }) {
    return this.northStar.updateWebhook(id, body)
  }

  @Post('webhooks/:id/rotate-secret')
  rotateWebhookSecret(@Param('id') id: string) {
    return this.northStar.rotateWebhookSecret(id)
  }

  @Delete('webhooks/:id')
  deleteWebhook(@Param('id') id: string) {
    return this.northStar.deleteWebhook(id)
  }

  @Get('audit/exports')
  auditExports() {
    return this.northStar.auditExports()
  }

  @Post('audit/export')
  auditExport(@Body() body: { format?: 'JSON' | 'CSV'; scope?: string }) {
    return this.northStar.auditExport(body)
  }
}
