import { describe, expect, it } from 'vitest'
import { runMaterialIntelligencePilot50 } from './run-material-intelligence-pilot50.js'

describe('material intelligence pilot 50', () => {
  it('classifies exactly the curated 50 cases without guessing identities', async () => {
    const result = await runMaterialIntelligencePilot50({ writeArtifacts: false })
    expect(result.materialProductCount).toBe(50)
    expect(result.normalizationVersion).toBe('olfactoryops-rdkit-standardization/1.0.0')
    expect(result.rdkitVersion).toBe('2023.09.3')
    expect(result.guessedIdentityCount).toBe(0)
    expect(result.resultCounts).toEqual({ ELIGIBLE: 24, NOT_ELIGIBLE: 16, REVIEW_REQUIRED: 10 })
    expect(result.primaryChemicalEntityAssessmentCount).toBe(50)
    expect(result.supportingChemicalEntityCount).toBe(5)
    expect(result.totalUniqueChemicalEntityCount).toBe(54)
    expect(result.verifiedChemicalEntityCount).toBe(35)
    expect(result.unresolvedChemicalEntityCount).toBe(1)
    expect(result.complexChemicalEntityCount).toBe(18)
    expect(result.verifiedMolecularIdentityCount).toBe(35)
    expect(result.componentCount).toBe(10)
    expect(result.componentEntityLinkedCount).toBe(10)
    expect(result.resolutionCounts).toEqual({ RESOLVED: 33, UNRESOLVED: 1, CONFLICTED: 0, NOT_APPLICABLE: 16 })
    expect(result.priorityUnresolvedResearchedCount).toBe(14)
    expect(result.priorityUnresolvedResolvedCount).toBe(14)
    expect(result.priorityUnresolvedRemainingCount).toBe(0)
  })

  it('preserves explicit dilution, natural, base, and unknown classifications', async () => {
    const result = await runMaterialIntelligencePilot50({ writeArtifacts: false })
    expect(result.cases.filter((item) => item.eligibilityReasonCodes.includes('DILUTION_PRODUCT'))).toHaveLength(4)
    expect(result.cases.filter((item) => item.eligibilityReasonCodes.includes('NATURAL_COMPLEX'))).toHaveLength(5)
    expect(result.cases.filter((item) => item.eligibilityReasonCodes.includes('PROPRIETARY_BASE'))).toHaveLength(1)
    expect(result.cases.filter((item) => item.eligibilityReasonCodes.includes('STEREOCHEMISTRY_UNRESOLVED'))).toHaveLength(9)
  })

  it('reuses verified component entities without making dilution products eligible', async () => {
    const result = await runMaterialIntelligencePilot50({ writeArtifacts: false })
    const citral = result.cases.find((item) => item.id === 'M020')!
    const ethylVanillinDilution = result.cases.find((item) => item.id === 'M042')!
    expect(citral.components.map((item) => item.chemicalEntityId)).toEqual(['entity-m021', 'entity-m022'])
    expect(ethylVanillinDilution.components[0]?.chemicalEntityId).toBe('entity-m007')
    expect(ethylVanillinDilution.eligibilityResult).toBe('NOT_ELIGIBLE')
    expect(result.cases.find((item) => item.id === 'M007')?.entityEligibilityResult).toBe('ELIGIBLE')
    expect(result.supportingEntities.find((item) => item.id === 'entity-support-dpg')?.eligibilityResult).toBe('NOT_ELIGIBLE')
  })
})
