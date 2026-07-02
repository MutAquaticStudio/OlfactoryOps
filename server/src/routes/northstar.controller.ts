import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common'
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

  @Get('materials/:id')
  material(@Param('id') id: string) {
    return this.northStar.material(id)
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

  @Get('formulas/:id/resolve')
  resolveFormula(@Param('id') id: string) {
    return this.northStar.resolveFormula(id)
  }

  @Get('formulas/:id/cost')
  formulaCost(@Param('id') id: string) {
    return this.northStar.formulaCost(id)
  }

  @Get('lots')
  lots() {
    return this.northStar.lotsList()
  }

  @Get('inventory/summary')
  inventorySummary() {
    return this.northStar.inventorySummary()
  }

  @Get('inventory/movements')
  inventoryMovements() {
    return this.northStar.inventoryMovements()
  }

  @Post('inventory/receipts')
  receiveInventoryReceipt(
    @Body() body: { materialId?: string; lotNumber?: string; quantityGrams?: number; expiryDate?: string },
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

  @Get('me')
  me() {
    return this.northStar.me()
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
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.northStar.updateSettings(body)
  }

  @Get('feature-flags')
  featureFlags() {
    return this.northStar.featureFlags()
  }

  @Get('numbering-sequences')
  numberingSequences() {
    return this.northStar.numberingSequences()
  }

  @Post('numbering-sequences/:key/next')
  nextNumber(@Param('key') key: string) {
    return this.northStar.nextNumber(key)
  }

  @Get('documents')
  documents() {
    return this.northStar.documents()
  }

  @Get('documents/download-audit')
  documentDownloadAudit() {
    return this.northStar.documentDownloadAudit()
  }

  @Post('documents/:id/signed-url')
  requestDocumentSignedUrl(@Param('id') id: string) {
    return this.northStar.requestDocumentSignedUrl(id)
  }

  @Get('lab-usage/plan')
  labUsagePlan(@Query('formulaId') formulaId = 'frm-0421', @Query('grams') grams = '12.5') {
    return this.northStar.labUsagePlan(formulaId, Number(grams))
  }

  @Post('lab-usage/weighing-session')
  recordLabWeighingSession(@Body() body: LabUsageBody) {
    return this.northStar.recordLabWeighingSession(body.formulaId ?? 'frm-0421', body.grams ?? 12.5, {
      actuals: body.actuals,
      tolerancePercent: body.tolerancePercent,
      operator: body.operator,
    })
  }

  @Post('lab-usage/commit')
  commitLabUsage(@Body() body: LabUsageBody) {
    return this.northStar.commitLabUsage(body.formulaId ?? 'frm-0421', body.grams ?? 12.5, {
      actuals: body.actuals,
      tolerancePercent: body.tolerancePercent,
      operator: body.operator,
    })
  }

  @Post('lab-usage/reverse-latest')
  reverseLatestLabUsage() {
    return this.northStar.reverseLatestLabUsage()
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

  @Get('suppliers')
  suppliers() {
    return this.northStar.suppliers()
  }

  @Get('purchase-orders')
  purchaseOrders() {
    return this.northStar.purchaseOrders()
  }

  @Post('purchase-orders/:id/receive')
  receivePurchaseOrder(@Param('id') id: string) {
    return this.northStar.receivePurchaseOrder(id)
  }

  @Get('catalog/skus')
  catalogSkus() {
    return this.northStar.catalogSkus()
  }

  @Get('orders')
  orders() {
    return this.northStar.orders()
  }

  @Post('orders/:id/reserve')
  reserveOrder(@Param('id') id: string) {
    return this.northStar.reserveOrder(id)
  }

  @Post('orders/:id/fulfill')
  fulfillOrder(@Param('id') id: string) {
    return this.northStar.fulfillOrder(id)
  }

  @Get('billing/plan')
  billingPlan() {
    return this.northStar.billingPlan()
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
