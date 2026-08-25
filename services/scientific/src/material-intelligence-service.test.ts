import { describe, expect, it } from 'vitest'
import type { MaterialIntelligenceAssessment, VerifiedMolecularIdentity } from '../../../packages/contracts/src/material-intelligence.js'
import {
  buildScientificFeatureCacheIdentity,
  compareVerifiedIdentities,
  evaluateScientificEligibility,
} from './material-intelligence-service.js'

const hash = (character: string) => character.repeat(64)
const evidence = [{
  id: 'evidence-pubchem', sourceKind: 'PUBLIC_DATABASE_RECORD' as const, sourceRef: 'https://pubchem.ncbi.nlm.nih.gov/compound/1183',
  sourceVersion: 'CID 1183', retrievedAt: '2026-08-25T00:00:00.000Z', contentHash: hash('a'), status: 'VERIFIED' as const,
}]
const molecularIdentity: VerifiedMolecularIdentity = {
  molecularIdentityId: 'identity-vanillin', canonicalSmiles: 'COC1=C(C=CC(=C1)C=O)O', inchiKey: 'MWOOGOJBHIARFG-UHFFFAOYSA-N',
  structureHash: hash('b'), normalizationVersion: 'olfactoryops-rdkit-standardization/1.0.0', rdkitVersion: '2026.03.5', stereochemistry: 'NOT_APPLICABLE', structureSupport: 'SUPPORTED', evidenceRefs: ['evidence-pubchem'],
}
const assessment = (overrides: Partial<MaterialIntelligenceAssessment> = {}): MaterialIntelligenceAssessment => ({
  materialId: 'material-vanillin', materialName: 'Vanillin', productClassification: 'NEAT_SUBSTANCE', components: [], evidence,
  chemicalEntity: { id: 'entity-vanillin', preferredName: 'Vanillin', entityType: 'SINGLE_SUBSTANCE', resolutionStatus: 'RESOLVED', evidenceStatus: 'VERIFIED', molecularIdentity },
  ...overrides,
})

describe('material intelligence scientific eligibility', () => {
  it('allows only a verified resolved single substance with supported structure evidence', () => {
    expect(evaluateScientificEligibility(assessment())).toMatchObject({ result: 'ELIGIBLE', reasonCodes: ['RESOLVED_SINGLE_SUBSTANCE'] })
  })

  it.each([
    ['DILUTION', 'NOT_ELIGIBLE', 'DILUTION_PRODUCT'],
    ['DEFINED_MIXTURE', 'NOT_ELIGIBLE', 'DEFINED_MIXTURE'],
    ['UNDEFINED_MIXTURE', 'NOT_ELIGIBLE', 'UNDEFINED_MIXTURE'],
    ['NATURAL', 'NOT_ELIGIBLE', 'NATURAL_COMPLEX'],
    ['BASE', 'NOT_ELIGIBLE', 'PROPRIETARY_BASE'],
    ['FORMULATION', 'NOT_ELIGIBLE', 'FORMULATION'],
    ['UNKNOWN', 'REVIEW_REQUIRED', 'UNKNOWN_COMPOSITION'],
  ] as const)('fails closed for %s products', (productClassification, result, reason) => {
    expect(evaluateScientificEligibility(assessment({ productClassification }))).toMatchObject({ result, reasonCodes: [reason] })
  })

  it('does not make a dilution eligible from its active component structure', () => {
    expect(evaluateScientificEligibility(assessment({
      productClassification: 'DILUTION',
      components: [{ name: 'Vanillin', role: 'ACTIVE', concentration: { kind: 'EXACT', value: 10, unit: 'PERCENT', basis: 'MASS' }, evidenceStatus: 'VERIFIED', evidenceRefs: ['evidence-pubchem'] }],
    }))).toMatchObject({ result: 'NOT_ELIGIBLE', reasonCodes: ['DILUTION_PRODUCT'] })
  })

  it('keeps generic unresolved stereochemistry out of model eligibility', () => {
    expect(evaluateScientificEligibility(assessment({
      chemicalEntity: { ...assessment().chemicalEntity!, molecularIdentity: { ...molecularIdentity, stereochemistry: 'UNRESOLVED' } },
    }))).toMatchObject({ result: 'REVIEW_REQUIRED', reasonCodes: ['STEREOCHEMISTRY_UNRESOLVED'] })
  })

  it('keeps conflicting identity evidence visible and fail closed', () => {
    expect(evaluateScientificEligibility(assessment({
      chemicalEntity: { id: 'entity-conflict', preferredName: 'Conflicted material', entityType: 'SINGLE_SUBSTANCE', resolutionStatus: 'CONFLICTED', evidenceStatus: 'CONFLICTED' },
    }))).toMatchObject({ result: 'REVIEW_REQUIRED', reasonCodes: ['IDENTITY_CONFLICT'] })
  })

  it('requires strong verified identity keys and rejects isomer collapse', () => {
    expect(compareVerifiedIdentities(undefined, molecularIdentity)).toEqual({ decision: 'REVIEW_REQUIRED', reason: 'STRONG_IDENTIFIER_REQUIRED' })
    expect(compareVerifiedIdentities(molecularIdentity, { ...molecularIdentity })).toMatchObject({ decision: 'SAME_VERIFIED_ENTITY' })
    expect(compareVerifiedIdentities(molecularIdentity, { ...molecularIdentity, structureHash: hash('c'), inchiKey: 'CDOSHBSSFJOMGT-JTQLQIEISA-N' })).toEqual({ decision: 'DISTINCT_VERIFIED_ENTITIES', reason: 'STRUCTURE_HASH_CONFLICT' })
  })

  it('builds release-independent feature cache identity only for eligible entities', () => {
    const eligible = evaluateScientificEligibility(assessment())
    expect(buildScientificFeatureCacheIdentity(eligible, 'OSMO_DRAVNIEKS', 'checkpoint-a23cb99')).toEqual({
      chemicalEntityId: 'entity-vanillin', structureHash: hash('b'), normalizationVersion: 'olfactoryops-rdkit-standardization/1.0.0', method: 'OSMO_DRAVNIEKS', version: 'checkpoint-a23cb99',
    })
    try {
      buildScientificFeatureCacheIdentity(evaluateScientificEligibility(assessment({ productClassification: 'BASE' })), 'OSMO_DRAVNIEKS', 'v1')
      throw new Error('EXPECTED_SCIENTIFIC_ENTITY_NOT_ELIGIBLE')
    } catch (error) {
      expect(error).toMatchObject({ code: 'SCIENTIFIC_ENTITY_NOT_ELIGIBLE', status: 409 })
    }
  })
})
