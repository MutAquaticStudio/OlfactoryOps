import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { projectProductionDetailInventoryEvidence } from './production-service.js'

const inventoryEvidence = () => ({
  allocations: [{
    id: 'alloc_1',
    inventoryLotId: 'lot_raw_1',
    supplierLot: 'SUPPLIER-LOT-42',
    allocatedQuantityGrams: new Prisma.Decimal('42.5'),
  }],
  weighing: [{
    id: 'weighing_1',
    labWeighingSessionId: 'lab_session_1',
    status: 'CONFIRMED',
    plannedTotalGrams: new Prisma.Decimal('42.5'),
    actualTotalGrams: new Prisma.Decimal('42.3'),
  }],
  weighingLines: [{
    lineId: 'line_1',
    lotId: 'lot_raw_1',
    consumptionMovementId: 'movement_raw_1',
    actualGrams: new Prisma.Decimal('42.3'),
  }],
  materialUsages: [{
    id: 'usage_1',
    lotId: 'lot_raw_1',
    inventoryMovementId: 'movement_raw_1',
    reversalMovementId: null,
    actualQuantityGrams: new Prisma.Decimal('42.3'),
  }],
})

describe('production detail inventory projection', () => {
  it('redacts lot, movement, allocation, and actual-consumption evidence for a production-only role', () => {
    const evidence = inventoryEvidence()

    const projected = projectProductionDetailInventoryEvidence(false, evidence)

    expect(projected.allocations).toEqual([])
    expect(projected.weighingLines).toEqual([])
    expect(projected.materialUsages).toEqual([])
    expect(projected.weighing).toEqual([{
      id: 'weighing_1',
      labWeighingSessionId: null,
      status: 'CONFIRMED',
      plannedTotalGrams: new Prisma.Decimal('42.5'),
      actualTotalGrams: null,
    }])

    // Projection must not mutate the service result that an inventory-authorized
    // actor would receive from the same scoped query.
    expect(evidence.allocations[0]?.inventoryLotId).toBe('lot_raw_1')
    expect(evidence.weighingLines[0]?.consumptionMovementId).toBe('movement_raw_1')
    expect(evidence.materialUsages[0]?.actualQuantityGrams.toString()).toBe('42.3')
  })

  it('preserves full inventory evidence for an inventory-authorized role', () => {
    const evidence = inventoryEvidence()

    const projected = projectProductionDetailInventoryEvidence(true, evidence)

    expect(projected).toBe(evidence)
    expect(projected.allocations[0]?.supplierLot).toBe('SUPPLIER-LOT-42')
    expect(projected.weighingLines[0]?.lotId).toBe('lot_raw_1')
    expect(projected.materialUsages[0]?.inventoryMovementId).toBe('movement_raw_1')
  })
})
