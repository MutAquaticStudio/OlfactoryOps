import { describe, expect, it } from 'vitest'
import { calculateFormulaMath } from './formula-math.js'

describe('calculateFormulaMath', () => {
  const components = [
    { materialId: 'mat-a', percentage: 60, position: 0 },
    { materialId: 'mat-b', percentage: 40, position: 1 },
  ]

  it('calculates authoritative weights for a valid hundred-percent formula', () => {
    const result = calculateFormulaMath(components, 250)
    expect(result).toMatchObject({ valid: true, totalPercentage: 100, normalized: false })
    expect(result.components.map((item) => item.weightGrams)).toEqual([150, 100])
  })

  it('does not silently normalize unless the server explicitly requests a preview', () => {
    expect(calculateFormulaMath([{ materialId: 'mat-a', percentage: 20, position: 0 }], 100).issues).toContain('TOTAL_NOT_100')
    expect(calculateFormulaMath([{ materialId: 'mat-a', percentage: 20, position: 0 }], 100, { normalize: true })).toMatchObject({ valid: true, totalPercentage: 100, normalized: true })
  })

  it('fails duplicate component identifiers and positions', () => {
    const result = calculateFormulaMath([{ materialId: 'mat-a', percentage: 50, position: 0 }, { materialId: 'mat-a', percentage: 50, position: 0 }], 100)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining(['DUPLICATE_MATERIAL', 'DUPLICATE_POSITION']))
  })
})
