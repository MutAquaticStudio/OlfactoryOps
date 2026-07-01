import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { NorthStarService } from './northstar.service'

describe('NorthStarService', () => {
  it('commits lab usage through OUT movements and reverses by compensation', () => {
    const service = new NorthStarService()
    const commit = service.commitLabUsage('frm-0421', 12.5).data

    expect(commit.usage.status).toBe('COMMITTED')
    expect(commit.usage.weighingSession?.status).toBe('READY')
    expect(commit.movements.length).toBeGreaterThan(0)
    expect(commit.movements.every((movement) => movement.direction === 'OUT')).toBe(true)

    const reverse = service.reverseLatestLabUsage().data

    expect(reverse.usageId).toBe(commit.usage.id)
    expect(reverse.movements.every((movement) => movement.direction === 'IN')).toBe(true)
    expect(reverse.invariant).toContain('reverse by compensation')
  })

  it('records lab weighing sessions without creating inventory movements', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const plan = service.labUsagePlan('frm-0421', 12.5).data
    const actuals = plan.allocations.map((allocation, index) => ({
      materialId: allocation.materialId,
      lotId: allocation.lotId,
      actualGrams: index === 0 ? Number((allocation.allocatedGrams * 1.01).toFixed(4)) : allocation.allocatedGrams,
    }))

    const result = service.recordLabWeighingSession('frm-0421', 12.5, {
      actuals,
      tolerancePercent: 2,
      operator: 'Bench Chemist',
    }).data

    expect(result.weighingSession.status).toBe('READY')
    expect(result.weighingSession.operator).toBe('Bench Chemist')
    expect(result.weighingSession.lines[0]?.deviationPercent).toBeCloseTo(1)
    expect(result.invariant).toContain('before movement creation')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('commits lab usage with actual weighed quantities', () => {
    const service = new NorthStarService()
    const plan = service.labUsagePlan('frm-0421', 12.5).data
    const firstAllocation = plan.allocations[0]!
    const actualGrams = Number((firstAllocation.allocatedGrams * 0.99).toFixed(4))

    const commit = service.commitLabUsage('frm-0421', 12.5, {
      actuals: [
        {
          materialId: firstAllocation.materialId,
          lotId: firstAllocation.lotId,
          actualGrams,
        },
      ],
      tolerancePercent: 2,
      operator: 'Bench Chemist',
    }).data

    expect(commit.movements[0]?.quantityGrams).toBeCloseTo(actualGrams)
    expect(commit.movements[0]?.actor).toBe('Bench Chemist')
    expect(commit.usage.allocations[0]?.allocatedGrams).toBeCloseTo(actualGrams)
    expect(commit.usage.weighingSession?.lines[0]?.actualGrams).toBeCloseTo(actualGrams)
  })

  it('blocks out-of-tolerance lab weighing commits before inventory changes', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const plan = service.labUsagePlan('frm-0421', 12.5).data
    const firstAllocation = plan.allocations[0]!

    expect(() =>
      service.commitLabUsage('frm-0421', 12.5, {
        actuals: [
          {
            materialId: firstAllocation.materialId,
            lotId: firstAllocation.lotId,
            actualGrams: Number((firstAllocation.allocatedGrams * 1.25).toFixed(4)),
          },
        ],
        tolerancePercent: 2,
        operator: 'Bench Chemist',
      }),
    ).toThrow(UnprocessableEntityException)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('issues short-lived document URLs only after permission check and logs access', () => {
    const service = new NorthStarService()
    const before = service.documents().data.find((document) => document.id === 'DOC-118')
    expect(before).toBeDefined()

    const result = service.requestDocumentSignedUrl('DOC-118').data

    expect(result.signedUrl.url).toContain('expires=')
    expect(result.signedUrl.ttlSeconds).toBe(300)
    expect(result.document.downloads).toBe(before!.downloads + 1)
    expect(result.audit.action).toBe('document.download')
    expect(result.audit.outcome).toBe('allowed')
    expect(service.documentDownloadAudit().data[0]?.entity).toBe('DOC-118')
  })

  it('blocks highly confidential document downloads without sensitive permission and keeps audit evidence', () => {
    const service = new NorthStarService()

    expect(() => service.requestDocumentSignedUrl('DOC-121')).toThrow(ForbiddenException)
    expect(() =>
      service.requestDocumentSignedUrl('DOC-121', {
        actor: 'api:viewer',
        permissions: ['documents.download'],
      }),
    ).toThrow(ForbiddenException)

    const latestAudit = service.documentDownloadAudit().data[0]
    expect(latestAudit?.entity).toBe('DOC-121')
    expect(latestAudit?.outcome).toBe('blocked')
  })

  it('blocks cross-tenant and missing-permission probes', () => {
    const service = new NorthStarService()

    expect(service.tenantProbe('org-nxl').data.allowed).toBe(true)
    expect(() => service.tenantProbe('org-other')).toThrow(ForbiddenException)
    expect(() => service.permissionProbe('inventory.adjust', 'Viewer')).toThrow(ForbiddenException)
    expect(service.permissionProbe('inventory.adjust', 'Owner').data.allowed).toBe(true)
  })

  it('updates customization settings and increments numbering through the sequence service', () => {
    const service = new NorthStarService()

    const settings = service.updateSettings({ currency: 'EUR', defaultDilutionPercent: 12 }).data
    const first = service.nextNumber('formula').data
    const second = service.nextNumber('formula').data

    expect(settings.currency).toBe('EUR')
    expect(settings.organizationId).toBe('org-nxl')
    expect(first.value).toBe('FRM-0422')
    expect(second.value).toBe('FRM-0423')
  })

  it('creates formula drafts without consuming inventory', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const result = service.createFormulaDraft({ name: 'Midnight Vetiver', targetGrams: 50 }).data

    expect(result.formula.code).toBe('FRM-0422')
    expect(result.formula.status).toBe('draft')
    expect(result.invariant).toContain('does not create inventory movement')
    expect(service.formulas().data[0]?.id).toBe(result.formula.id)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
  })

  it('adds formula ingredient lines and resolves draft cost without consuming inventory', () => {
    const service = new NorthStarService()
    const formula = service.createFormulaDraft({ name: 'Line Test Accord', targetGrams: 80 }).data.formula
    const beforeMovements = service.inventoryMovements().data.length
    const result = service.addFormulaLine(formula.id, { materialId: 'mat-hedione', grams: 16 }).data
    const resolved = service.resolveFormula(formula.id).data

    expect(result.line.label).toBe('Hedione')
    expect(result.formula.lines).toHaveLength(1)
    expect(result.leaves[0]?.materialId).toBe('mat-hedione')
    expect(result.totals.totalGrams).toBe(16)
    expect(resolved.leaves[0]?.effectivePercent).toBe(20)
    expect(service.inventoryMovements().data.length).toBe(beforeMovements)
    expect(result.invariant).toContain('does not create inventory movement')
  })

  it('receives direct inventory receipts through lot and IN movement', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const receipt = service.receiveInventoryReceipt({
      materialId: 'mat-iso',
      lotNumber: 'L-ISO-999',
      quantityGrams: 25,
      expiryDate: '2028-01-01',
    }).data

    expect(receipt.lot.lotNumber).toBe('L-ISO-999')
    expect(receipt.movement.direction).toBe('IN')
    expect(receipt.summary?.available).toBeGreaterThan(232)
    expect(receipt.invariant).toContain('immutable IN movement')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements + 1)
  })

  it('adjusts stock only through immutable adjustment movements and blocks negative availability', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const adjustment = service.adjustInventory({
      lotId: 'lot-hed-001',
      direction: 'OUT',
      quantityGrams: 6,
      reason: 'Cycle count variance',
    }).data

    expect(adjustment.lot.quantityGrams).toBe(180)
    expect(adjustment.movement.type).toBe('ADJUSTMENT')
    expect(adjustment.movement.direction).toBe('OUT')
    expect(adjustment.summary?.available).toBe(180)
    expect(adjustment.invariant).toContain('only through immutable movement')
    expect(service.inventoryMovements().data.length).toBe(beforeMovements + 1)

    expect(() =>
      service.adjustInventory({
        lotId: 'lot-iso-001',
        direction: 'OUT',
        quantityGrams: 240,
        reason: 'Invalid write down',
      }),
    ).toThrow(UnprocessableEntityException)
  })

  it('transfers lots between storage locations without changing stock quantity', () => {
    const service = new NorthStarService()
    const beforeSummary = service.inventorySummary().data.find((item) => item.material.id === 'mat-ambroxan')
    const transfer = service.transferInventory({
      lotId: 'lot-amb-001',
      toLocation: 'Cold Room A',
    }).data
    const afterSummary = service.inventorySummary().data.find((item) => item.material.id === 'mat-ambroxan')

    expect(transfer.lot.location).toBe('Cold Room A')
    expect(transfer.movement.type).toBe('TRANSFER')
    expect(transfer.movement.direction).toBe('MOVE')
    expect(transfer.movement.balanceAfter).toBe(38)
    expect(afterSummary?.available).toBe(beforeSummary?.available)
    expect(afterSummary?.current).toBe(beforeSummary?.current)
    expect(transfer.invariant).toContain('without changing stock quantity')
  })

  it('runs production consumption separately from lab usage', () => {
    const service = new NorthStarService()
    const batch = service.createProductionBatch('frm-0421', 25).data
    const result = service.consumeProductionBatch(batch.id).data

    expect(result.batchId).toBe(batch.id)
    expect(result.movements.length).toBeGreaterThan(0)
    expect(result.movements.every((movement) => movement.type === 'PRODUCTION_CONSUMPTION')).toBe(true)
    expect(result.invariant).toContain('separate from lab usage')
  })

  it('receives purchase orders into inventory through lot and IN movement', () => {
    const service = new NorthStarService()
    const receipt = service.receivePurchaseOrder('PO-2026-014').data

    expect(receipt.lot.materialId).toBe('mat-bergamot')
    expect(receipt.movement.direction).toBe('IN')
    expect(receipt.invariant).toContain('creates lot and IN movement')
  })

  it('reserves orders without movement and fulfills with OUT movement', () => {
    const service = new NorthStarService()
    const beforeMovements = service.inventoryMovements().data.length
    const reservation = service.reserveOrder('SO-2026-092').data
    const afterReserveMovements = service.inventoryMovements().data.length
    const fulfillment = service.fulfillOrder('SO-2026-092').data

    expect(reservation.invariant).toContain('creates no InventoryMovement')
    expect(afterReserveMovements).toBe(beforeMovements)
    expect(fulfillment.movements.every((movement) => movement.direction === 'OUT')).toBe(true)
  })

  it('queues enterprise audit export as a tenant-scoped control', () => {
    const service = new NorthStarService()
    const exportJob = service.auditExport().data

    expect(exportJob.status).toBe('QUEUED')
    expect(exportJob.scope).toBe('ORG-NXL')
    expect(exportJob.audit.action).toBe('audit.export')
  })
})
