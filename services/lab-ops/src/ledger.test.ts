import { describe, expect, it } from 'vitest'
import { allocateLandedCost, projectLot, selectFefo } from './ledger.js'

describe('V2 immutable lot ledger', () => {
  it('derives on-hand and available stock without a mutable balance', () => {
    expect(projectLot([
      { type: 'RECEIPT', quantityGrams: 100 },
      { type: 'RESERVE', quantityGrams: 25 },
      { type: 'CONSUMPTION', quantityGrams: 10 },
      { type: 'RELEASE_RESERVATION', quantityGrams: 5 },
    ])).toMatchObject({ onHandGrams: 90, reservedGrams: 20, availableGrams: 70 })
  })

  it('rejects infeasible reservation and negative stock projections', () => {
    expect(() => projectLot([{ type: 'RELEASE_RESERVATION', quantityGrams: 1 }])).toThrow('Reservation release')
    expect(() => projectLot([{ type: 'CONSUMPTION', quantityGrams: 1 }])).toThrow('negative on-hand')
  })
})

describe('V2 FEFO', () => {
  it('filters eligibility before expiry and keeps a deterministic tie-break', () => {
    const selected = selectFefo([
      { lotId: 'expired', materialId: 'mat', status: 'AVAILABLE', qualityStatus: 'PASSED', expiresAt: '2025-01-01T00:00:00.000Z', availableGrams: 100, createdAt: '2024-01-01T00:00:00.000Z' },
      { lotId: 'quarantine', materialId: 'mat', status: 'QUARANTINE', qualityStatus: 'PASSED', expiresAt: '2028-01-01T00:00:00.000Z', availableGrams: 100, createdAt: '2024-01-01T00:00:00.000Z' },
      { lotId: 'later', materialId: 'mat', status: 'AVAILABLE', qualityStatus: 'PASSED', expiresAt: '2028-02-01T00:00:00.000Z', availableGrams: 30, createdAt: '2024-01-01T00:00:00.000Z' },
      { lotId: 'earlier', materialId: 'mat', status: 'AVAILABLE', qualityStatus: 'PASSED', expiresAt: '2028-01-01T00:00:00.000Z', availableGrams: 30, createdAt: '2024-02-01T00:00:00.000Z' },
    ], 'mat', 40, new Date('2027-01-01T00:00:00.000Z'))
    expect(selected.map((item) => item.lotId)).toEqual(['earlier', 'later'])
  })
})

describe('V2 landed cost', () => {
  it('allocates by receipt value and assigns rounding residual to the highest-value line', () => {
    const result = allocateLandedCost([{ id: 'high', receivedValue: 75, quantityGrams: 100 }, { id: 'low', receivedValue: 25, quantityGrams: 100 }], 1)
    expect(result.find((line) => line.id === 'high')?.allocatedCost).toBe(0.75)
    expect(result.find((line) => line.id === 'low')?.allocatedCost).toBe(0.25)
    expect(result.reduce((sum, line) => sum + line.allocatedCost, 0)).toBe(1)
  })
})
