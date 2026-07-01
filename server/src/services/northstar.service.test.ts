import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { NorthStarService } from './northstar.service'

describe('NorthStarService', () => {
  it('commits lab usage through OUT movements and reverses by compensation', () => {
    const service = new NorthStarService()
    const commit = service.commitLabUsage('frm-0421', 12.5).data

    expect(commit.usage.status).toBe('COMMITTED')
    expect(commit.movements.length).toBeGreaterThan(0)
    expect(commit.movements.every((movement) => movement.direction === 'OUT')).toBe(true)

    const reverse = service.reverseLatestLabUsage().data

    expect(reverse.usageId).toBe(commit.usage.id)
    expect(reverse.movements.every((movement) => movement.direction === 'IN')).toBe(true)
    expect(reverse.invariant).toContain('reverse by compensation')
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
