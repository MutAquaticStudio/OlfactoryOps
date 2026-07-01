import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import {
  auditEvents,
  apiKeys,
  billingPlan,
  canDownloadDocument,
  commercialSkus,
  createSignedDocumentUrl,
  documentRequiredPermissions,
  documents,
  domains,
  featureFlags,
  formatSequenceValue,
  formulaTotals,
  formulas as initialFormulas,
  formatGrams,
  initialLots,
  initialMovements,
  materials,
  numberingSequences,
  orderRequiredGrams,
  phases,
  planLabUsage,
  productionBatches,
  purchaseOrders,
  resolveFormula,
  roleHasPermission,
  rolePolicies,
  salesOrders,
  skuAvailability,
  ssoConfig,
  stockSummary,
  suppliers,
  tenantScopeAllows,
  tenantSecurityPolicy,
  tenantSettings,
  webhooks,
  type Allocation,
  type AuditEvent,
  type AuthSession,
  type DocumentRecord,
  type FeatureFlagRecord,
  type Formula,
  type InventoryLot,
  type InventoryMovement,
  type NumberingSequenceRecord,
  type ProductionBatchRecord,
  type PurchaseOrderRecord,
  type SalesOrderRecord,
  type TenantSettingsRecord,
} from '../../../src/data/northStar.js'

type UsageRecord = {
  id: string
  formulaId: string
  formulaCode: string
  grams: number
  status: 'COMMITTED' | 'REVERSED'
  allocations: Allocation[]
  createdAt: string
}

@Injectable()
export class NorthStarService {
  private lots: InventoryLot[] = structuredClone(initialLots)
  private movements: InventoryMovement[] = structuredClone(initialMovements)
  private formulaRecords: Formula[] = structuredClone(initialFormulas)
  private usageHistory: UsageRecord[] = []
  private documentRecords: DocumentRecord[] = structuredClone(documents)
  private auditEvents: AuditEvent[] = structuredClone(auditEvents)
  private sessions: AuthSession[] = []
  private settingsRecord: TenantSettingsRecord = structuredClone(tenantSettings)
  private flagRecords: FeatureFlagRecord[] = structuredClone(featureFlags)
  private sequences: NumberingSequenceRecord[] = structuredClone(numberingSequences)
  private productionBatchRecords: ProductionBatchRecord[] = structuredClone(productionBatches)
  private purchaseOrderRecords: PurchaseOrderRecord[] = structuredClone(purchaseOrders)
  private salesOrderRecords: SalesOrderRecord[] = structuredClone(salesOrders)
  private auditCounter = auditEvents.length

  phases() {
    return { data: phases }
  }

  domains() {
    return { data: domains }
  }

  materials() {
    return { data: materials }
  }

  formulas() {
    return { data: this.formulaRecords }
  }

  createFormulaDraft(body: { name?: string; targetGrams?: number; owner?: string }) {
    const targetGrams = Number(body.targetGrams ?? 100)
    if (!Number.isFinite(targetGrams) || targetGrams <= 0) {
      throw new UnprocessableEntityException('Formula targetGrams must be greater than 0')
    }

    const sequence = this.nextNumber('formula').data
    const formula: Formula = {
      id: sequence.value.toLowerCase(),
      code: sequence.value,
      name: body.name?.trim() || 'Untitled Formula',
      version: 'v1',
      status: 'draft',
      targetGrams,
      owner: body.owner?.trim() || 'Thuan Le Minh',
      lines: [],
    }

    this.formulaRecords = [formula, ...this.formulaRecords]
    this.recordAudit('formula.create', formula.code, formula.owner, 'allowed')
    return { data: { formula, invariant: 'formula draft creation does not create inventory movement' } }
  }

  material(id: string) {
    const material = materials.find((item) => item.id === id)
    if (!material) {
      throw new NotFoundException(`Material ${id} was not found`)
    }
    const summary = stockSummary(this.lots).find((item) => item.material.id === id)
    return { data: { ...material, stock: summary } }
  }

  resolveFormula(id: string) {
    const formula = this.formulaRecords.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    const leaves = initialFormulas.some((item) => item.id === id) ? resolveFormula(id) : []
    return {
      data: {
        formula,
        leaves,
        totals: formulaTotals(leaves),
        invariant: 'resolve before compute',
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

  lotsList() {
    return { data: this.lots }
  }

  inventorySummary() {
    return { data: stockSummary(this.lots) }
  }

  inventoryMovements() {
    return { data: this.movements }
  }

  receiveInventoryReceipt(body: {
    materialId?: string
    lotNumber?: string
    quantityGrams?: number
    expiryDate?: string
  }) {
    const materialId = body.materialId ?? materials[0]?.id
    const material = materials.find((item) => item.id === materialId)
    if (!material) {
      throw new NotFoundException(`Material ${materialId} was not found`)
    }

    const quantityGrams = Number(body.quantityGrams ?? 0)
    if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) {
      throw new UnprocessableEntityException('Inventory receipt quantityGrams must be greater than 0')
    }

    const timestamp = new Date().toISOString()
    const lot: InventoryLot = {
      id: `lot-api-${Date.now()}`,
      materialId: material.id,
      lotNumber: body.lotNumber?.trim() || `L-${material.cas.replaceAll('-', '')}`,
      quantityGrams,
      reservedGrams: 0,
      receivedDate: timestamp.slice(0, 10),
      expiryDate: body.expiryDate ?? '2028-12-31',
      qualityStatus: 'APPROVED',
      location: 'Receiving Bay',
      unitCost: material.costPerGram,
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
      actor: 'api:inventory',
    }

    this.lots = [lot, ...this.lots]
    this.movements = [movement, ...this.movements]
    this.recordAudit('inventory.receive', lot.lotNumber, 'api:inventory', 'allowed')

    return {
      data: {
        lot,
        movement,
        summary: stockSummary(this.lots).find((item) => item.material.id === material.id),
        invariant: 'inventory receipt creates lot and immutable IN movement',
      },
    }
  }

  login(email = 'owner@noxel.is') {
    const issuedAt = new Date()
    const session: AuthSession = {
      id: `SES-${String(this.sessions.length + 1).padStart(4, '0')}`,
      userId: 'usr-owner',
      email,
      organizationId: 'org-nxl',
      brandId: 'brand-nxl',
      role: 'Owner',
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + tenantSecurityPolicy.sessionTimeoutMinutes * 60_000).toISOString(),
      mfaVerified: true,
    }
    this.sessions = [session, ...this.sessions]
    this.recordAudit('auth.login', session.userId, 'api:auth', 'allowed')
    return { data: { session, securityPolicy: tenantSecurityPolicy } }
  }

  me() {
    const session = this.currentSession()
    return {
      data: {
        session,
        permissions: this.permissionsForRole(session.role),
        securityPolicy: tenantSecurityPolicy,
      },
    }
  }

  auditLogs() {
    return { data: this.auditEvents }
  }

  securityPolicy() {
    return { data: tenantSecurityPolicy }
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
    const allowed = roleHasPermission(role, permission)
    this.recordAudit('security.permissionProbe', permission, role, allowed ? 'allowed' : 'blocked')
    if (!allowed) {
      throw new ForbiddenException(`Role ${role} cannot perform ${permission}`)
    }
    return { data: { allowed, role, permission } }
  }

  settings() {
    return { data: this.settingsRecord }
  }

  updateSettings(patch: Partial<TenantSettingsRecord>) {
    this.settingsRecord = {
      ...this.settingsRecord,
      ...patch,
      organizationId: this.settingsRecord.organizationId,
    }
    this.recordAudit('customization.settings.update', this.settingsRecord.organizationId, 'api:owner', 'allowed')
    return { data: this.settingsRecord }
  }

  featureFlags() {
    return { data: this.flagRecords }
  }

  numberingSequences() {
    return { data: this.sequences }
  }

  nextNumber(key: string) {
    const sequence = this.sequences.find((item) => item.key === key)
    if (!sequence) {
      throw new NotFoundException(`Numbering sequence ${key} was not found`)
    }
    const value = formatSequenceValue(sequence)
    this.sequences = this.sequences.map((item) =>
      item.key === key ? { ...item, nextValue: item.nextValue + 1 } : item,
    )
    this.recordAudit('customization.sequence.next', key, 'api:owner', 'allowed')
    return { data: { key, value, invariant: 'numbering increments through a single sequence service' } }
  }

  documents() {
    return { data: this.documentRecords }
  }

  documentDownloadAudit() {
    return { data: this.auditEvents.filter((event) => event.action === 'document.download') }
  }

  requestDocumentSignedUrl(
    id: string,
    context: { actor?: string; permissions?: string[]; ip?: string } = {},
  ) {
    const document = this.documentRecords.find((item) => item.id === id)
    if (!document) {
      throw new NotFoundException(`Document ${id} was not found`)
    }

    const actor = context.actor ?? 'api:compliance'
    const permissions = context.permissions ?? ['documents.view', 'documents.download', 'formulas.viewSensitive']
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
    const formula = this.formulaRecords.find((item) => item.id === formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${formulaId} was not found`)
    }
    const leaves = initialFormulas.some((item) => item.id === formulaId) ? resolveFormula(formulaId) : []
    const plan = planLabUsage(leaves, this.lots, grams, formula.targetGrams)
    return {
      data: {
        formulaId,
        grams,
        allocations: plan.allocations,
        shortfalls: plan.shortfalls,
        canCommit: plan.shortfalls.length === 0,
      },
    }
  }

  commitLabUsage(formulaId: string, grams: number) {
    const formula = this.formulaRecords.find((item) => item.id === formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${formulaId} was not found`)
    }
    const plan = this.labUsagePlan(formulaId, grams).data
    if (!plan.canCommit) {
      throw new UnprocessableEntityException({
        message: 'Lab usage cannot be committed while shortfalls exist',
        shortfalls: plan.shortfalls,
      })
    }

    const usageId = `LAB-API-${String(this.usageHistory.length + 1).padStart(4, '0')}`
    const timestamp = new Date().toISOString()
    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    const createdMovements: InventoryMovement[] = []

    plan.allocations.forEach((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        return
      }
      lot.quantityGrams = Math.max(0, lot.quantityGrams - allocation.allocatedGrams)
      createdMovements.push({
        id: `MOV-API-${usageId}-${index + 1}`,
        at: timestamp,
        type: 'LAB_CONSUMPTION',
        direction: 'OUT',
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: allocation.allocatedGrams,
        balanceAfter: lot.quantityGrams,
        ref: usageId,
        actor: 'api:perfumer',
      })
    })

    this.lots = Array.from(lotMap.values())
    this.movements = [...createdMovements, ...this.movements]
    const usage: UsageRecord = {
      id: usageId,
      formulaId,
      formulaCode: formula.code,
      grams,
      status: 'COMMITTED',
      allocations: plan.allocations,
      createdAt: timestamp,
    }
    this.usageHistory = [usage, ...this.usageHistory]

    return {
      data: {
        usage,
        movements: createdMovements,
        message: `${usageId} committed ${formatGrams(grams)} using immutable OUT movements`,
      },
    }
  }

  reverseLatestLabUsage() {
    const usage = this.usageHistory.find((item) => item.status === 'COMMITTED')
    if (!usage) {
      throw new UnprocessableEntityException('No committed lab usage exists to reverse')
    }

    const timestamp = new Date().toISOString()
    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    const reversals: InventoryMovement[] = []

    usage.allocations.forEach((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        return
      }
      lot.quantityGrams += allocation.allocatedGrams
      reversals.push({
        id: `MOV-API-REV-${usage.id}-${index + 1}`,
        at: timestamp,
        type: 'REVERSAL',
        direction: 'IN',
        materialId: allocation.materialId,
        lotId: allocation.lotId,
        quantityGrams: allocation.allocatedGrams,
        balanceAfter: lot.quantityGrams,
        ref: usage.id,
        actor: 'api:lab-manager',
      })
    })

    this.lots = Array.from(lotMap.values())
    this.movements = [...reversals, ...this.movements]
    this.usageHistory = this.usageHistory.map((item) =>
      item.id === usage.id ? { ...item, status: 'REVERSED' } : item,
    )

    return {
      data: {
        usageId: usage.id,
        movements: reversals,
        invariant: 'reverse by compensation; original OUT remains',
      },
    }
  }

  productionBatches() {
    return { data: this.productionBatchRecords }
  }

  createProductionBatch(formulaId = 'frm-0421', targetGrams = 25) {
    const formula = this.formulaRecords.find((item) => item.id === formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${formulaId} was not found`)
    }
    const id = this.nextNumber('batch').data.value
    const batch: ProductionBatchRecord = {
      id,
      formulaId,
      formulaCode: formula.code,
      status: 'WEIGHING',
      targetGrams,
      consumedGrams: 0,
      qcStatus: 'PENDING',
      owner: 'Manufacturing',
    }
    this.productionBatchRecords = [batch, ...this.productionBatchRecords]
    this.recordAudit('production.batch.create', id, 'api:manufacturing', 'allowed')
    return { data: batch }
  }

  consumeProductionBatch(id: string) {
    const batch = this.productionBatchRecords.find((item) => item.id === id)
    if (!batch) {
      throw new NotFoundException(`Production batch ${id} was not found`)
    }
    if (batch.consumedGrams > 0) {
      throw new UnprocessableEntityException(`Production batch ${id} has already consumed inventory`)
    }
    const formula = this.formulaRecords.find((item) => item.id === batch.formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${batch.formulaId} was not found`)
    }
    const leaves = initialFormulas.some((item) => item.id === batch.formulaId) ? resolveFormula(batch.formulaId) : []
    const plan = planLabUsage(leaves, this.lots, batch.targetGrams, formula.targetGrams)
    if (plan.shortfalls.length > 0) {
      throw new UnprocessableEntityException({ message: 'Production cannot consume while shortfalls exist', shortfalls: plan.shortfalls })
    }

    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
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
        actor: 'api:manufacturing',
      }
    })

    this.lots = Array.from(lotMap.values())
    this.movements = [...movements, ...this.movements]
    this.productionBatchRecords = this.productionBatchRecords.map((item) =>
      item.id === id ? { ...item, consumedGrams: batch.targetGrams, status: 'MACERATION' } : item,
    )
    this.recordAudit('production.batch.consume', id, 'api:manufacturing', 'allowed')
    return { data: { batchId: id, movements, invariant: 'production consumption is separate from lab usage' } }
  }

  qcProductionBatch(id: string, result: 'PASSED' | 'FAILED' = 'PASSED') {
    const batch = this.productionBatchRecords.find((item) => item.id === id)
    if (!batch) {
      throw new NotFoundException(`Production batch ${id} was not found`)
    }
    const status = result === 'PASSED' ? 'RELEASED' : 'QC'
    this.productionBatchRecords = this.productionBatchRecords.map((item) =>
      item.id === id ? { ...item, qcStatus: result, status } : item,
    )
    this.recordAudit('production.batch.qc', id, 'api:qc', result === 'PASSED' ? 'allowed' : 'review')
    return { data: this.productionBatchRecords.find((item) => item.id === id)! }
  }

  suppliers() {
    return { data: suppliers }
  }

  purchaseOrders() {
    return { data: this.purchaseOrderRecords }
  }

  receivePurchaseOrder(id: string) {
    const order = this.purchaseOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Purchase order ${id} was not found`)
    }
    const material = materials.find((item) => item.id === order.materialId)
    if (!material) {
      throw new NotFoundException(`Material ${order.materialId} was not found`)
    }
    if (order.status === 'RECEIVED') {
      throw new UnprocessableEntityException(`Purchase order ${id} has already been received`)
    }

    const lot: InventoryLot = {
      id: `lot-${order.id.toLowerCase()}`,
      materialId: order.materialId,
      lotNumber: `L-${order.id}`,
      quantityGrams: order.quantityGrams,
      reservedGrams: 0,
      receivedDate: new Date().toISOString().slice(0, 10),
      expiryDate: '2028-12-31',
      qualityStatus: 'APPROVED',
      location: 'Receiving Bay',
      unitCost: material.costPerGram,
    }
    const movement: InventoryMovement = {
      id: `MOV-PO-${id}`,
      at: new Date().toISOString(),
      type: 'RECEIPT',
      direction: 'IN',
      materialId: order.materialId,
      lotId: lot.id,
      quantityGrams: order.quantityGrams,
      balanceAfter: lot.quantityGrams,
      ref: id,
      actor: 'api:procurement',
    }
    this.lots = [lot, ...this.lots]
    this.movements = [movement, ...this.movements]
    this.purchaseOrderRecords = this.purchaseOrderRecords.map((item) =>
      item.id === id ? { ...item, receivedGrams: item.quantityGrams, status: 'RECEIVED' } : item,
    )
    this.recordAudit('procurement.po.receive', id, 'api:procurement', 'allowed')
    return { data: { lot, movement, invariant: 'goods receipt creates lot and IN movement' } }
  }

  catalogSkus() {
    return { data: skuAvailability(commercialSkus, this.lots) }
  }

  orders() {
    return { data: this.salesOrderRecords }
  }

  reserveOrder(id: string) {
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    const sku = commercialSkus.find((item) => item.id === order.skuId)
    if (!sku) {
      throw new NotFoundException(`SKU ${order.skuId} was not found`)
    }
    const requiredGrams = orderRequiredGrams(order)
    const allocations = this.pickLotsForMaterial(sku.materialId, requiredGrams)
    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    allocations.forEach((allocation) => {
      const lot = lotMap.get(allocation.lotId)
      if (lot) {
        lot.reservedGrams += allocation.allocatedGrams
      }
    })
    this.lots = Array.from(lotMap.values())
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id ? { ...item, reservedGrams: requiredGrams, status: 'RESERVED' } : item,
    )
    this.recordAudit('orders.reserve', id, 'api:fulfillment', 'allowed')
    return { data: { orderId: id, allocations, invariant: 'reservation changes reserved stock but creates no InventoryMovement' } }
  }

  fulfillOrder(id: string) {
    const order = this.salesOrderRecords.find((item) => item.id === id)
    if (!order) {
      throw new NotFoundException(`Sales order ${id} was not found`)
    }
    if (order.status !== 'RESERVED') {
      throw new UnprocessableEntityException(`Sales order ${id} must be reserved before fulfillment`)
    }
    const sku = commercialSkus.find((item) => item.id === order.skuId)
    if (!sku) {
      throw new NotFoundException(`SKU ${order.skuId} was not found`)
    }
    const allocations = this.pickLotsForMaterial(sku.materialId, order.reservedGrams, true)
    const lotMap = new Map(this.lots.map((lot) => [lot.id, { ...lot }]))
    const movements: InventoryMovement[] = allocations.map((allocation, index) => {
      const lot = lotMap.get(allocation.lotId)
      if (!lot) {
        throw new NotFoundException(`Lot ${allocation.lotId} was not found`)
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
        actor: 'api:fulfillment',
      }
    })
    this.lots = Array.from(lotMap.values())
    this.movements = [...movements, ...this.movements]
    this.salesOrderRecords = this.salesOrderRecords.map((item) =>
      item.id === id ? { ...item, fulfilledGrams: order.reservedGrams, status: 'FULFILLED' } : item,
    )
    this.recordAudit('orders.fulfill', id, 'api:fulfillment', 'allowed')
    return { data: { orderId: id, movements, invariant: 'fulfillment creates OUT movement after reservation' } }
  }

  billingPlan() {
    return { data: billingPlan }
  }

  ssoConfig() {
    return { data: ssoConfig }
  }

  apiKeys() {
    return { data: apiKeys }
  }

  webhooks() {
    return { data: webhooks }
  }

  auditExport() {
    const audit = this.recordAudit('audit.export', 'ORG-NXL', 'api:owner', 'allowed')
    return {
      data: {
        id: `AUD-EXP-${audit.id}`,
        format: 'JSON',
        status: 'QUEUED',
        scope: 'ORG-NXL',
        audit,
      },
    }
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
    if (this.sessions[0]) {
      return this.sessions[0]
    }
    return this.login().data.session
  }

  private permissionsForRole(role: string) {
    return rolePolicies.find((policy) => policy.role === role)?.permissions ?? []
  }

  private pickLotsForMaterial(materialId: string, requiredGrams: number, reservedOnly = false) {
    const material = materials.find((item) => item.id === materialId)
    if (!material) {
      throw new NotFoundException(`Material ${materialId} was not found`)
    }
    const allocations: Allocation[] = []
    let remaining = requiredGrams
    const eligibleLots = this.lots
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
