import { describe, expect, it } from 'vitest'
import {
  evaporationCurve,
  canDownloadDocument,
  documentRequiredPermissions,
  documents,
  formulaTotals,
  formulas,
  initialLots,
  planLabUsage,
  resolveFormula,
  stockSummary,
} from './northStar'

describe('North Star domain invariants', () => {
  it('resolves nested accord leaves before cost and physical models', () => {
    const leaves = resolveFormula('frm-0421')
    const hedione = leaves.find((leaf) => leaf.materialName === 'Hedione')
    const iso = leaves.find((leaf) => leaf.materialName === 'Iso E Super')

    expect(hedione?.effectivePercent).toBeCloseTo(24)
    expect(iso?.effectivePercent).toBeCloseTo(28)
    expect(leaves.reduce((sum, leaf) => sum + leaf.effectivePercent, 0)).toBeCloseTo(100)
  })

  it('rolls formula cost up from resolved leaves', () => {
    const totals = formulaTotals(resolveFormula('frm-0421'))

    expect(totals.totalGrams).toBeCloseTo(100)
    expect(totals.totalCost).toBeGreaterThan(0)
    expect(totals.costPerBottle).toBeCloseTo(totals.costPerGram * 50)
  })

  it('excludes quarantine lots from FEFO lab usage allocation', () => {
    const formula = formulas.find((item) => item.id === 'frm-0421')
    expect(formula).toBeDefined()

    const plan = planLabUsage(resolveFormula('frm-0421'), initialLots, 12.5, formula!.targetGrams)
    const roseAllocation = plan.allocations.find((allocation) => allocation.materialName === 'Rose Oxide')

    expect(plan.shortfalls).toEqual([])
    expect(roseAllocation?.lotNumber).toBe('L-ROX-006')
  })

  it('keeps stock summary read-only and based on lot state', () => {
    const summary = stockSummary(initialLots)
    const rose = summary.find((item) => item.material.name === 'Rose Oxide')

    expect(rose?.current).toBeCloseTo(15)
    expect(rose?.available).toBeCloseTo(6)
  })

  it('produces bounded directional evaporation curves', () => {
    const curve = evaporationCurve(resolveFormula('frm-0421'))

    expect(curve).toHaveLength(8)
    curve.forEach((point) => {
      expect(point.Top).toBeGreaterThanOrEqual(0)
      expect(point.Top).toBeLessThanOrEqual(100)
      expect(point.Heart).toBeGreaterThanOrEqual(0)
      expect(point.Heart).toBeLessThanOrEqual(100)
      expect(point.Base).toBeGreaterThanOrEqual(0)
      expect(point.Base).toBeLessThanOrEqual(100)
    })
  })

  it('requires sensitive formula permission for highly confidential document downloads', () => {
    const formulaExport = documents.find((document) => document.id === 'DOC-121')
    expect(formulaExport).toBeDefined()

    expect(documentRequiredPermissions(formulaExport!)).toEqual(['documents.download', 'formulas.viewSensitive'])
    expect(canDownloadDocument(formulaExport!, ['documents.download'])).toBe(false)
    expect(canDownloadDocument(formulaExport!, ['documents.download', 'formulas.viewSensitive'])).toBe(true)
  })
})
