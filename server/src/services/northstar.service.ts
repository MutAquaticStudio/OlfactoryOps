import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import {
  auditEvents,
  canDownloadDocument,
  createSignedDocumentUrl,
  documentRequiredPermissions,
  documents,
  domains,
  formulaTotals,
  formulas,
  formatGrams,
  initialLots,
  initialMovements,
  materials,
  phases,
  planLabUsage,
  resolveFormula,
  stockSummary,
  type Allocation,
  type AuditEvent,
  type DocumentRecord,
  type InventoryLot,
  type InventoryMovement,
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
  private usageHistory: UsageRecord[] = []
  private documentRecords: DocumentRecord[] = structuredClone(documents)
  private auditEvents: AuditEvent[] = structuredClone(auditEvents)
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

  material(id: string) {
    const material = materials.find((item) => item.id === id)
    if (!material) {
      throw new NotFoundException(`Material ${id} was not found`)
    }
    const summary = stockSummary(this.lots).find((item) => item.material.id === id)
    return { data: { ...material, stock: summary } }
  }

  resolveFormula(id: string) {
    const formula = formulas.find((item) => item.id === id)
    if (!formula) {
      throw new NotFoundException(`Formula ${id} was not found`)
    }
    const leaves = resolveFormula(id)
    return {
      data: {
        formula,
        leaves,
        totals: formulaTotals(leaves),
        invariant: 'resolve before compute',
      },
    }
  }

  inventorySummary() {
    return { data: stockSummary(this.lots) }
  }

  inventoryMovements() {
    return { data: this.movements }
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
    const formula = formulas.find((item) => item.id === formulaId)
    if (!formula) {
      throw new NotFoundException(`Formula ${formulaId} was not found`)
    }
    const leaves = resolveFormula(formulaId)
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
    const formula = formulas.find((item) => item.id === formulaId)
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
}
