import { describe, expect, it } from 'vitest'
import { formulaDesignBriefSchema, formulaDirectionFeedbackSchema, formulaDirectionShareSchema, formulaOptimizationObjectivesSchema } from './agentRuntime'
import { buildDesignDirectionProposals, buildOptimizerProposals, compareOptimizerCandidates, compositionChangePercent, optimizerBaselineLines, optimizerParetoState, sensoryMemoryEvidenceForDirection } from './formulaIntelligence'
import { formulaVersions, materials } from './northStar'

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

  it('uses a diverse reviewed palette instead of truncating every direction to four materials', () => {
    const brief = formulaDesignBriefSchema.parse({
      name: 'Citrus amber study',
      creativeBrief: 'Luminous citrus opening, transparent floral heart, and dry amber woods',
      desiredNotes: ['citrus', 'floral', 'amber', 'woody'],
      availabilityFirst: true,
      targetGrams: 100,
    })
    const directions = buildDesignDirectionProposals(brief, materials)
    const palettes = directions.map((direction) => direction.proposal.ingredients.map((line) => line.materialId))

    expect(palettes.every((palette) => palette.length >= 6)).toBe(true)
    expect(new Set(palettes.map((palette) => [...palette].sort().join('|'))).size).toBeGreaterThan(1)
    expect(directions.every((direction) => new Set(direction.proposal.ingredients.map((line) => materials.find((material) => material.id === line.materialId)?.tier)).size >= 2)).toBe(true)
  })

  it('turns Fine Fragrance research into carrier-free Accord building blocks', () => {
    const brief = formulaDesignBriefSchema.parse({
      name: 'Twenty percent EDP',
      creativeBrief: 'A balanced citrus woody eau de parfum',
      formulaType: 'FINE_FRAGRANCE',
      concentrationType: 'EDP',
      finalProductConcentrationPercent: 20,
      targetGrams: 100,
    })
    const directions = buildDesignDirectionProposals(brief, materials)

    for (const direction of directions) {
      const carrier = direction.proposal.ingredients.find((line) => materials.find((material) => material.id === line.materialId)?.family === 'Carrier')
      expect(carrier).toBeUndefined()
      expect(direction.proposal.formulaType).toBe('ACCORD')
      expect(direction.proposal.finalProductConcentrationPercent).toBe(100)
      expect(direction.proposal.requiresFinalProductContext).toBe(true)
      expect(direction.proposal.ingredients.reduce((sum, line) => sum + line.percentage, 0)).toBeCloseTo(100, 4)
    }
  })

  it('builds accords as carrier-free concentrates and keeps final-product review context explicit', () => {
    const brief = formulaDesignBriefSchema.parse({
      name: 'Citrus wood accord',
      creativeBrief: 'A dry citrus wood accord for later final-product evaluation',
      formulaType: 'ACCORD',
      concentrationType: 'OTHER',
      finalProductConcentrationPercent: 100,
      ifraCategory: '4',
      requiresFinalProductContext: true,
      targetGrams: 100,
    })
    const directions = buildDesignDirectionProposals(brief, materials)

    for (const direction of directions) {
      expect(direction.proposal.ingredients.some((line) => materials.find((material) => material.id === line.materialId)?.family === 'Carrier')).toBe(false)
      expect(direction.proposal.requiresFinalProductContext).toBe(true)
      expect(direction.proposal.ingredients.reduce((sum, line) => sum + line.percentage, 0)).toBeCloseTo(100, 4)
    }
  })

  it('preserves locked baseline composition while creating deterministic optimization alternatives', () => {
    const baseline = {
      name: 'Baseline', formulaType: 'FINE_FRAGRANCE' as const, targetGrams: 100, concentrationType: 'EDP' as const,
      finalProductConcentrationPercent: 20, ifraCategory: '4', requiresFinalProductContext: false, brief: 'baseline',
      ingredients: materials.slice(0, 3).map((material, index) => ({ materialId: material.id, percentage: [50, 30, 20][index]!, pyramidNote: material.tier === 'Heart' ? 'Middle' as const : material.tier })),
    }
    const lockedId = baseline.ingredients[0]!.materialId
    const candidates = buildOptimizerProposals(baseline, materials, 'COMBINED', [lockedId], new Set(materials.map((material) => material.id)))

    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) {
      expect(candidate.proposal.ingredients.find((line) => line.materialId === lockedId)?.percentage).toBe(50)
      expect(candidate.proposal.ingredients.reduce((sum, line) => sum + line.percentage, 0)).toBeCloseTo(100, 4)
      expect(compositionChangePercent(baseline, candidate.proposal)).toBeGreaterThanOrEqual(0)
    }
  })

  it('creates useful ratio candidates without introducing an unreviewed replacement material', () => {
    const baseline = {
      name: 'Ratio baseline', formulaType: 'ACCORD' as const, targetGrams: 100, concentrationType: 'OTHER' as const,
      finalProductConcentrationPercent: 100, ifraCategory: '4', requiresFinalProductContext: false, brief: 'baseline',
      ingredients: [
        { materialId: 'mat-bergamot', percentage: 35, pyramidNote: 'Top' as const },
        { materialId: 'mat-hedione', percentage: 30, pyramidNote: 'Middle' as const },
        { materialId: 'mat-iso', percentage: 20, pyramidNote: 'Base' as const },
        { materialId: 'mat-roseoxide', percentage: 15, pyramidNote: 'Top' as const },
      ],
    }
    const candidates = buildOptimizerProposals(baseline, materials, 'COMBINED', [], new Set(['mat-bergamot', 'mat-hedione', 'mat-iso']))

    expect(candidates.some((candidate) => compositionChangePercent(baseline, candidate.proposal) > 0)).toBe(true)
    for (const candidate of candidates) {
      expect(new Set(candidate.proposal.ingredients.map((line) => line.materialId))).toEqual(new Set(baseline.ingredients.map((line) => line.materialId)))
      expect(candidate.proposal.ingredients.reduce((sum, line) => sum + line.percentage, 0)).toBeCloseTo(100, 4)
    }
  })

  it('resolves a nested immutable formula version to a material-only optimizer baseline', () => {
    const nested = formulaVersions.find((version) => version.formulaId === 'frm-0421')!
    const resolved = optimizerBaselineLines(nested)

    expect(nested.lines.some((line) => Boolean(line.childFormulaId))).toBe(true)
    expect(resolved.length).toBeGreaterThan(0)
    expect(resolved.every((line) => Boolean(line.materialId) && !line.childFormulaId)).toBe(true)
    expect(resolved.reduce((sum, line) => sum + line.grams, 0)).toBeCloseTo(nested.totalGrams, 4)
  })

  it('rejects a design brief that locks a material outside the approved catalog', () => {
    const brief = formulaDesignBriefSchema.parse({ name: 'Blocked lock', creativeBrief: 'Citrus floral direction', lockedMaterialIds: ['not-visible'] })
    expect(() => buildDesignDirectionProposals(brief, materials)).toThrow('locked material')
  })

  it('uses strict share and feedback schemas for brand-facing mutations', () => {
    expect(() => formulaDirectionShareSchema.parse({ recipientUserIds: ['usr-brand'], unexpected: true })).toThrow()
    expect(formulaDirectionShareSchema.parse({ recipientUserIds: ['usr-brand'] }).allowMaterialNames).toBe(false)
    expect(() => formulaDirectionFeedbackSchema.parse({ rating: 2.5 })).toThrow()
    expect(() => formulaDirectionFeedbackSchema.parse({})).toThrow()
  })

  it('ranks evaluated compliance and inventory evidence before unknown evidence', () => {
    const compared = compareOptimizerCandidates(
      { complianceStatus: 'PASS', availability: 'UNKNOWN', costDelta: -20, compositionChangePercent: 1, inventoryEvaluated: false },
      { complianceStatus: 'PASS', availability: 'AVAILABLE', costDelta: 1, compositionChangePercent: 6, inventoryEvaluated: true },
    )
    expect(compared).toBeGreaterThan(0)
    expect(compareOptimizerCandidates(
      { complianceStatus: 'PASS', availability: 'AVAILABLE', costDelta: undefined, compositionChangePercent: 1, inventoryEvaluated: true },
      { complianceStatus: 'REVIEW_REQUIRED', availability: 'AVAILABLE', costDelta: -10, compositionChangePercent: 0, inventoryEvaluated: true },
    )).toBeLessThan(0)
  })

  it('keeps private sensory learning bounded and honest about insufficient evidence', () => {
    const direction = { title: 'Citrus trail', narrative: 'A luminous citrus opening.', pyramidSummary: 'Top: Bergamot' }
    expect(sensoryMemoryEvidenceForDirection(direction, undefined, true)).toMatchObject({ state: 'NOT_ENOUGH_EVIDENCE', adjustment: 0 })
    expect(sensoryMemoryEvidenceForDirection(direction, {
      id: 'profile-1', organizationId: 'org-nxl', version: 2, evidenceCount: 5, confidence: 'MEDIUM',
      preferredDescriptors: ['citrus', 'luminous'], avoidedDescriptors: ['powdery'], recurrentDecisionReasons: [], createdAt: '2026-08-01T00:00:00.000Z',
    }, true)).toMatchObject({ state: 'READY', adjustment: 6 })
    expect(sensoryMemoryEvidenceForDirection(direction, undefined, false)).toMatchObject({ state: 'DISABLED', adjustment: 0 })
  })

  it('requires reviewer-approved substitutions and exposes Pareto uncertainty', () => {
    const source = materials.find((material) => materials.some((candidate) => candidate.id !== material.id && candidate.tier === material.tier))!
    const replacement = materials.find((material) => material.id !== source.id && material.tier === source.tier)!
    const baseline = {
      name: 'Restricted baseline', formulaType: 'FINE_FRAGRANCE' as const, targetGrams: 100, concentrationType: 'EDP' as const,
      finalProductConcentrationPercent: 20, ifraCategory: '4', requiresFinalProductContext: false, brief: 'baseline',
      ingredients: [{ materialId: source.id, percentage: 100, pyramidNote: source.tier === 'Heart' ? 'Middle' as const : source.tier }],
    }
    const objectives = formulaOptimizationObjectivesSchema.parse({ prohibitedMaterialIds: [source.id], requireApprovedSubstitutions: true })
    expect(buildOptimizerProposals(baseline, materials, 'COMBINED', [], new Set(), objectives)).toHaveLength(0)
    const approved = [{
      id: 'sub-1', organizationId: 'org-nxl', sourceMaterialId: source.id, replacementMaterialId: replacement.id, status: 'APPROVED' as const,
      reviewer: 'usr-admin', evidenceReference: 'panel review', roleSimilarity: 'HIGH' as const, strengthFactor: 1, version: 1, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    }]
    const candidates = buildOptimizerProposals(baseline, materials, 'COMBINED', [], new Set([replacement.id]), objectives, approved)
    expect(candidates.some((candidate) => candidate.proposal.ingredients.some((line) => line.materialId === replacement.id))).toBe(true)
    expect(optimizerParetoState({ complianceStatus: 'PASS', availability: 'UNKNOWN', costDelta: -1, compositionChangePercent: 2, inventoryEvaluated: false }, [])).toBe('NOT_EVALUATED')
  })
})
