import { describe, expect, it } from 'vitest'
import { createCandidateRequestSchema } from '../../../packages/contracts/src/formula-intelligence.js'

describe('Formula Intelligence candidate evidence contracts', () => {
  const component = { materialId: 'mat_1', percentage: 100, position: 0 }

  it('accepts only bounded, explicit evidence references', () => {
    const result = createCandidateRequestSchema.parse({
      narrative: 'A researched woody direction.',
      components: [component],
      evidenceReferences: {
        materialEvidenceSourceIds: ['evidence_1'],
        scientificArtifactIds: ['artifact_1'],
        consumerPreferenceVectorId: 'preference_1',
      },
    })
    expect(result.evidenceReferences?.materialEvidenceSourceIds).toEqual(['evidence_1'])
  })

  it('rejects unregistered evidence payload fields', () => {
    expect(() => createCandidateRequestSchema.parse({ narrative: 'A direction.', components: [component], evidenceReferences: { arbitraryUrl: 'https://example.test' } })).toThrow()
  })
})
