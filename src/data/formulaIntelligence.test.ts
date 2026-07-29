import { describe, expect, it } from 'vitest'
import { formulaDesignBriefSchema } from './agentRuntime'
import { buildDesignDirectionProposals, buildOptimizerProposals, compositionChangePercent } from './formulaIntelligence'
import { materials } from './northStar'

describe('Formula Intelligence deterministic proposals', () => {
  it('keeps locked approved materials in every design direction and normalizes composition', () => {
    const lockedId = materials[0]!.id
    const brief = formulaDesignBriefSchema.parse({
      name: 'Marine wood',
      creativeBrief: 'Marine woody fragrance with citrus brightness and amber longevity',
      lockedMaterialIds: [lockedId],
      desiredNotes: ['marine', 'amber'],
      targetGrams: 100,
    })
    const directions = buildDesignDirectionProposals(brief, materials)

    expect(directions).toHaveLength(3)
    for (const direction of directions) {
      expect(direction.proposal.ingredients.some((line) => line.materialId === lockedId)).toBe(true)
      expect(direction.proposal.ingredients.reduce((sum, line) => sum + line.percentage, 0)).toBeCloseTo(100, 4)
    }
  })

  it('preserves locked baseline composition while creating deterministic optimization alternatives', () => {
    const baseline = {
      name: 'Baseline', formulaType: 'FINE_FRAGRANCE' as const, targetGrams: 100, concentrationType: 'EDP' as const,
      finalProductConcentrationPercent: 20, ifraCategory: '4', brief: 'baseline',
      ingredients: materials.slice(0, 3).map((material, index) => ({ materialId: material.id, percentage: [50, 30, 20][index]!, pyramidNote: material.tier === 'Heart' ? 'Middle' as const : material.tier })),
    }
    const lockedId = baseline.ingredients[0]!.materialId
    const candidates = buildOptimizerProposals(baseline, materials, 'COMBINED', [lockedId], new Set(materials.map((material) => material.id)))

    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) {
      expect(candidate.proposal.ingredients.find((line) => line.materialId === lockedId)?.percentage).toBe(50)
      expect(compositionChangePercent(baseline, candidate.proposal)).toBeGreaterThanOrEqual(0)
    }
  })

  it('rejects a design brief that locks a material outside the approved catalog', () => {
    const brief = formulaDesignBriefSchema.parse({ name: 'Blocked lock', creativeBrief: 'Citrus floral direction', lockedMaterialIds: ['not-visible'] })
    expect(() => buildDesignDirectionProposals(brief, materials)).toThrow('locked material')
  })
})
