import { describe, expect, it } from 'vitest'
import { calculateProductionRequirements, calculateYield, evaluateNumericSpecification } from './math.js'

describe('production math', () => {
  it('projects a pinned 100 percent formula into deterministic requirements', () => {
    expect(calculateProductionRequirements([
      { materialId: 'mat_a', percentage: 40 },
      { materialId: 'mat_b', percentage: 60 },
    ], 250)).toEqual([
      { materialId: 'mat_a', percentage: 40, requiredGrams: 100 },
      { materialId: 'mat_b', percentage: 60, requiredGrams: 150 },
    ])
  })

  it('refuses invalid formula arithmetic', () => {
    expect(() => calculateProductionRequirements([{ materialId: 'mat_a', percentage: 99 }], 100)).toThrow('Formula composition')
  })

  it('retains the loss and yield evidence without adjusting stock', () => {
    expect(calculateYield(100, 97.5)).toEqual({ theoreticalGrams: 100, actualGrams: 97.5, lossGrams: 2.5, yieldPercent: 97.5 })
  })

  it('evaluates a numeric QC result against both limits', () => {
    expect(evaluateNumericSpecification(1.1, 1, 1.2)).toBe('PASS')
    expect(evaluateNumericSpecification(1.3, 1, 1.2)).toBe('FAIL')
  })
})
