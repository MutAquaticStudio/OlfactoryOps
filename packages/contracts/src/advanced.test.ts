import { describe, expect, it } from 'vitest'
import {
  bulkOperationPreviewSchema,
  optimizerObjectiveWeightsSchema,
  importCreateSchema,
  optimizerCandidateDecisionSchema,
  optimizerRunCreateSchema,
  safeSpreadsheetCellSchema,
} from './advanced.js'

describe('advanced Phase 11 contracts', () => {
  it('requires explicit, compatible optimizer constraints', () => {
    expect(optimizerRunCreateSchema.safeParse({
      parentFormulaVersionId: 'formula_version_1',
      constraints: { requiredMaterialIds: ['mat_a'], prohibitedMaterialIds: ['mat_a'] },
    }).success).toBe(false)
    expect(optimizerRunCreateSchema.safeParse({
      parentFormulaVersionId: 'formula_version_1',
      constraints: { targetCostPerKg: 10 },
    }).success).toBe(false)
    expect(optimizerRunCreateSchema.safeParse({
      parentFormulaVersionId: 'formula_version_1',
      constraints: { requiredComplianceCategory: 'IFRA 4', complianceMode: 'APPROVED_EVIDENCE_ONLY' },
    }).success).toBe(true)
  })

  it('keeps optimizer output advisory until a Formula Project is selected', () => {
    expect(optimizerCandidateDecisionSchema.safeParse({ decision: 'SAVE_AS_DRAFT', rationale: 'Review with perfumer.' }).success).toBe(false)
    expect(optimizerCandidateDecisionSchema.safeParse({ decision: 'SAVE_AS_DRAFT', formulaProjectId: 'formula_project_1', rationale: 'Review with perfumer.' }).success).toBe(true)
    expect(optimizerCandidateDecisionSchema.safeParse({ decision: 'REJECT', formulaProjectId: 'formula_project_1', rationale: 'Does not meet the brief.' }).success).toBe(false)
  })

  it('bounds import content and rejects unsafe names', () => {
    expect(importCreateSchema.safeParse({
      kind: 'MATERIALS', format: 'CSV', fileName: 'materials.csv', contentBase64: Buffer.from('name\nBergamot').toString('base64'), mapping: {}, dryRun: true,
    }).success).toBe(true)
    expect(importCreateSchema.safeParse({
      kind: 'MATERIALS', format: 'CSV', fileName: '../materials.csv', contentBase64: 'YWJjZA==', mapping: {}, dryRun: true,
    }).success).toBe(false)
  })

  it('rejects spreadsheet formula injection and unbounded bulk work', () => {
    expect(safeSpreadsheetCellSchema.safeParse('=HYPERLINK("https://untrusted.example")').success).toBe(false)
    expect(safeSpreadsheetCellSchema.safeParse('Iso E Super').success).toBe(true)
    expect(bulkOperationPreviewSchema.safeParse({ kind: 'MATERIAL_STATUS', targetIds: Array.from({ length: 201 }, (_, index) => `mat_${index}`), payload: { status: 'ACTIVE' }, rationale: 'Batch activation' }).success).toBe(false)
  })

  it('uses a safe default optimizer objective profile', () => {
    expect(optimizerRunCreateSchema.safeParse({ parentFormulaVersionId: 'formula_version_1', constraints: {} }).success).toBe(true)
    const defaults = optimizerRunCreateSchema.parse({ parentFormulaVersionId: 'formula_version_1', constraints: {} }).objectives
    expect(defaults).toEqual({ odorSimilarity: 0.45, briefAlignment: 0.15, availability: 0.15, cost: 0, sensoryEvidence: 0.05, consumerEvidence: 0.05 })

    const onlyObjectives = optimizerObjectiveWeightsSchema.parse({})
    expect(onlyObjectives.cost).toBe(0)
  })
})
