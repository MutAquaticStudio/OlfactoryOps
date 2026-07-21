import { describe, expect, it } from 'vitest'
import {
  evaporationCurve,
  diffFormulaVersions,
  evaluateFormulaIfra,
  formulaVersions,
  canDownloadDocument,
  documentComplianceDashboard,
  documentRequiredPermissions,
  documents,
  formulaTotals,
  formulas,
  initialLots,
  planLabUsage,
  resolveFormula,
  stockSummary,
  resolveFormulaWithCatalog,
  scaleFormula,
  apiKeys,
  auditExportJobs,
  ssoConfig,
  webhooks,
} from './northStar'

describe('OlfactoryOps domain invariants', () => {
  it('resolves accord leaves before cost and physical models', () => {
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

  it('propagates active concentration through nested accords', () => {
    const accord = {
      ...structuredClone(formulas[0]!),
      id: 'test-accord',
      code: 'ACC-TEST',
      lines: [
        { id: 'accord-hedione', label: 'Hedione', materialId: 'mat-hedione', grams: 30 },
        { id: 'accord-iso', label: 'Iso E Super', materialId: 'mat-iso', grams: 70 },
      ],
    }
    const parent = {
      ...structuredClone(formulas[1]!),
      id: 'test-parent',
      code: 'FRM-TEST',
      lines: [
        { id: 'parent-accord', label: 'Test Accord', childFormulaId: accord.id, grams: 20 },
        { id: 'parent-solvent', label: 'Ethanol 96%', materialId: 'mat-ethanol', grams: 80 },
      ],
    }
    const leaves = resolveFormulaWithCatalog(parent.id, [parent, accord])
    const hedione = leaves.find((leaf) => leaf.materialId === 'mat-hedione')

    expect(hedione?.grams).toBeCloseTo(6)
    expect(hedione?.activePercent).toBeCloseTo(6)
  })

  it('evaluates IFRA against the final product concentration', () => {
    const formula = formulas.find((item) => item.id === 'frm-0421')!
    const evaluation = evaluateFormulaIfra(formula, resolveFormula(formula.id))
    const muscenone = evaluation.rows.find((row) => row.materialId === 'mat-muscenone')

    expect(evaluation.compositionReady).toBe(true)
    expect(muscenone?.activePercent).toBeCloseTo(2)
    expect(muscenone?.finalProductPercent).toBeCloseTo(0.4)
    expect(evaluation.blockerCount).toBe(0)
  })

  it('scales and rounds a formula without changing inventory', () => {
    const formula = formulas.find((item) => item.id === 'frm-0421')!
    const plan = scaleFormula(formula, 250, 0.01)

    expect(plan.targetGrams).toBe(250)
    expect(plan.totalRoundedGrams).toBeCloseTo(250)
    expect(plan.lines.find((line) => line.label === 'Muscenone Delta')?.roundedGrams).toBeCloseTo(5)
  })

  it('reports ingredient and compliance evidence in version diffs', () => {
    const before = structuredClone(formulaVersions.find((version) => version.formulaId === 'frm-0421')!)
    const after = structuredClone(before)
    after.version = 'v13'
    after.totalGrams += 1
    after.totalCost += 0.5
    after.lines[0] = { ...after.lines[0]!, grams: after.lines[0]!.grams + 1 }
    const diff = diffFormulaVersions(before, after)

    expect(diff.lineChanges.some((line) => line.change === 'CHANGED')).toBe(true)
    expect(diff.totalGramsDelta).toBeCloseTo(1)
    expect(diff.totalCostDelta).toBeCloseTo(0.5)
  })

  it('requires sensitive formula permission for highly confidential document downloads', () => {
    const formulaExport = documents.find((document) => document.id === 'DOC-121')
    expect(formulaExport).toBeDefined()

    expect(documentRequiredPermissions(formulaExport!)).toEqual(['documents.download', 'formulas.viewSensitive'])
    expect(canDownloadDocument(formulaExport!, ['documents.download'])).toBe(false)
    expect(canDownloadDocument(formulaExport!, ['documents.download', 'formulas.viewSensitive'])).toBe(true)
  })

  it('derives document compliance coverage from linked private documents', () => {
    const dashboard = documentComplianceDashboard()

    expect(dashboard.totalRequired).toBeGreaterThan(0)
    expect(dashboard.missingCount).toBeGreaterThan(0)
    expect(dashboard.expiringCount).toBeGreaterThan(0)
    expect(dashboard.coveragePercent).toBeGreaterThan(0)
    expect(dashboard.requirements.some((requirement) => requirement.id === 'REQ-SDS-mat-iso')).toBe(true)
    expect(dashboard.expiringDocuments.some((document) => document.id === 'DOC-118')).toBe(true)
    expect(dashboard.invariant).toContain('private documents')
  })

  it('keeps enterprise trust seed tenant-scoped without bundled secrets', () => {
    expect(ssoConfig.organizationId).toBe('org-nxl')
    expect(ssoConfig.scim.tokenLastFour).toBeDefined()
    expect(ssoConfig.scim.tokenHash).toBeUndefined()
    expect(webhooks.every((webhook) => webhook.organizationId === 'org-nxl')).toBe(true)
    expect(auditExportJobs.every((job) => job.organizationId === 'org-nxl')).toBe(true)
    expect(apiKeys.every((key) => key.organizationId === 'org-nxl')).toBe(true)
    expect(apiKeys.every((key) => !key.secretHash)).toBe(true)
  })
})
