import { describe, expect, it } from 'vitest'
import { runMaterialIntelligencePilot50 } from './run-material-intelligence-pilot50.js'

describe('material intelligence pilot 50', () => {
  it('classifies exactly the curated 50 cases without guessing identities', async () => {
    const result = await runMaterialIntelligencePilot50({ writeArtifacts: false })
    expect(result.caseCount).toBe(50)
    expect(result.normalizationVersion).toBe('olfactoryops-rdkit-standardization/1.0.0')
    expect(result.rdkitVersion).toBe('2023.09.3')
    expect(result.guessedIdentityCount).toBe(0)
    expect(result.resultCounts).toEqual({ ELIGIBLE: 14, NOT_ELIGIBLE: 11, REVIEW_REQUIRED: 25 })
    expect(result.verifiedIdentityCount).toBe(16)
    expect(result.componentCount).toBe(10)
    expect(result.chemicalEntityCount).toBe(50)
    expect(result.resolutionCounts).toEqual({ RESOLVED: 16, UNRESOLVED: 23, CONFLICTED: 0, NOT_APPLICABLE: 11 })
  })

  it('preserves explicit dilution, natural, base, and unknown classifications', async () => {
    const result = await runMaterialIntelligencePilot50({ writeArtifacts: false })
    expect(result.cases.filter((item) => item.reasonCodes.includes('DILUTION_PRODUCT'))).toHaveLength(4)
    expect(result.cases.filter((item) => item.reasonCodes.includes('NATURAL_COMPLEX'))).toHaveLength(5)
    expect(result.cases.filter((item) => item.reasonCodes.includes('PROPRIETARY_BASE'))).toHaveLength(1)
    expect(result.cases.filter((item) => item.reasonCodes.includes('STEREOCHEMISTRY_UNRESOLVED'))).toHaveLength(2)
  })
})
