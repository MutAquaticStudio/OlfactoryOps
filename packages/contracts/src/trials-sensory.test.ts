import { describe, expect, it } from 'vitest'
import {
  privateSensoryMemoryProjectionSchema,
  sensoryEvaluationSubmitRequestSchema,
  sensoryFormCreateRequestSchema,
  sensoryPublicLinkCreateRequestSchema,
  trialCreateRequestSchema,
  trialSampleCreateRequestSchema,
  trialStartPreparationRequestSchema,
  trialWeighingConfirmRequestSchema,
} from './trials-sensory'

describe('Phase 7 trial and sensory contracts', () => {
  it('requires an immutable formula version or an explicit manual experimental source', () => {
    expect(trialCreateRequestSchema.safeParse({
      title: 'Marine evaluation trial',
      sourceKind: 'FORMULA_VERSION',
      formulaVersionId: 'formula-version-1',
      plannedMassGrams: 50,
    }).success).toBe(true)

    expect(trialCreateRequestSchema.safeParse({
      title: 'Missing formula version',
      sourceKind: 'FORMULA_VERSION',
    }).success).toBe(false)

    expect(trialCreateRequestSchema.safeParse({
      title: 'Manual evaluation',
      sourceKind: 'MANUAL_EXPERIMENT',
      manualSource: 'Bench blend recorded in the signed lab notebook.',
    }).success).toBe(true)

    expect(trialCreateRequestSchema.safeParse({
      title: 'Undocumented manual evaluation',
      sourceKind: 'MANUAL_EXPERIMENT',
    }).success).toBe(false)

    expect(trialCreateRequestSchema.safeParse({
      title: 'Conflicting source',
      sourceKind: 'MANUAL_EXPERIMENT',
      manualSource: 'Bench blend.',
      formulaVersionId: 'formula-version-1',
    }).success).toBe(false)
  })

  it('rejects duplicate materials in a trial weighing plan and duplicate confirm lines', () => {
    expect(trialStartPreparationRequestSchema.safeParse({
      lines: [
        { materialId: 'material-1', requestedGrams: 10 },
        { materialId: 'material-1', requestedGrams: 15 },
      ],
    }).success).toBe(false)

    expect(trialStartPreparationRequestSchema.safeParse({
      lines: [
        { materialId: 'material-1', requestedGrams: 10 },
        { materialId: 'material-2', requestedGrams: 15, toleranceGrams: 0.25 },
      ],
    }).success).toBe(true)

    expect(trialWeighingConfirmRequestSchema.safeParse({
      lines: [
        { lineId: 'line-1', lotId: 'lot-1', actualGrams: 10 },
        { lineId: 'line-1', lotId: 'lot-2', actualGrams: 10 },
      ],
    }).success).toBe(false)
  })

  it('keeps sensory forms versioned, bounded, and unambiguous', () => {
    const validForm = {
      name: 'Fine fragrance panel',
      versionLabel: '1.0',
      timepoints: ['T0', '30m', '4h'],
      dimensions: [
        { key: 'overall_liking', label: 'Overall liking', minimum: 1, maximum: 10 },
        { key: 'odor_family', label: 'Odor family', kind: 'DESCRIPTOR', options: ['Woody', 'Floral'] },
      ],
      descriptorVocabulary: ['Woody', 'Floral'],
    }
    expect(sensoryFormCreateRequestSchema.safeParse(validForm).success).toBe(true)

    expect(sensoryFormCreateRequestSchema.safeParse({
      ...validForm,
      timepoints: ['T0', 't0'],
    }).success).toBe(false)

    expect(sensoryFormCreateRequestSchema.safeParse({
      ...validForm,
      dimensions: [
        validForm.dimensions[0],
        { key: 'overall_liking', label: 'Repeated rating' },
      ],
    }).success).toBe(false)

    expect(sensoryFormCreateRequestSchema.safeParse({
      ...validForm,
      dimensions: [{ key: 'longevity', label: 'Longevity', minimum: 8, maximum: 4 }],
    }).success).toBe(false)

    expect(sensoryFormCreateRequestSchema.safeParse({
      ...validForm,
      dimensions: [{ key: 'odor_family', label: 'Odor family', kind: 'ORDINAL', options: [] }],
    }).success).toBe(false)
  })

  it('validates sample identity and public presentation links without expanding their scope', () => {
    expect(trialSampleCreateRequestSchema.safeParse({
      sampleCode: 'BLIND_010',
      concentrationPercent: 15,
      carrier: 'Alcohol',
    }).success).toBe(true)
    expect(trialSampleCreateRequestSchema.safeParse({ sampleCode: 'blind sample' }).success).toBe(false)

    expect(sensoryPublicLinkCreateRequestSchema.safeParse({
      sampleAssignmentId: 'assignment-1',
      presentationMode: 'BLIND',
      expiresAt: '2026-09-01T00:00:00.000Z',
      maxSubmissions: 3,
    }).success).toBe(true)
    expect(sensoryPublicLinkCreateRequestSchema.safeParse({
      sampleAssignmentId: 'assignment-1',
      presentationMode: 'BRAND_REVIEW',
      expiresAt: '2026-09-01T00:00:00.000Z',
    }).success).toBe(true)
    expect(sensoryPublicLinkCreateRequestSchema.safeParse({
      sampleAssignmentId: 'assignment-1',
      presentationMode: 'UNBLINDED',
      expiresAt: '2026-09-01T00:00:00.000Z',
    }).success).toBe(false)
  })

  it('bounds evaluation values and limits structured feedback payloads', () => {
    expect(sensoryEvaluationSubmitRequestSchema.safeParse({
      sampleAssignmentId: 'assignment-1',
      timepoint: '4h',
      ratings: { overall_liking: 8, longevity: 7 },
      controlledResponses: { odor_family: ['Woody', 'Amber'] },
      descriptors: ['Woody', 'Amber'],
      preferenceRank: 1,
      final: true,
    }).success).toBe(true)

    expect(sensoryEvaluationSubmitRequestSchema.safeParse({
      sampleAssignmentId: 'assignment-1',
      timepoint: '4h',
      ratings: { overall_liking: 11 },
    }).success).toBe(false)
    expect(sensoryEvaluationSubmitRequestSchema.safeParse({
      sampleAssignmentId: 'assignment-1',
      timepoint: '4h',
      preferenceRank: 0,
    }).success).toBe(false)
  })

  it('projects only bounded, evidence-qualified private sensory memory', () => {
    expect(privateSensoryMemoryProjectionSchema.safeParse({
      evidenceCount: 3,
      minimumEvidenceCount: 3,
      confidence: 'VERIFIED',
      descriptorProfile: { woody: 7.4, amber: 5.8 },
      performanceProfile: { longevity: 8.1 },
      timepointProfile: { '4h': { longevity: 8.1 } },
      conclusion: 'Panel evidence supports a woody drydown.',
    }).success).toBe(true)

    expect(privateSensoryMemoryProjectionSchema.safeParse({
      evidenceCount: -1,
      minimumEvidenceCount: 3,
      confidence: 'NOT_ENOUGH_EVIDENCE',
      descriptorProfile: {},
      performanceProfile: {},
      timepointProfile: {},
    }).success).toBe(false)

    expect(privateSensoryMemoryProjectionSchema.safeParse({
      evidenceCount: 3,
      minimumEvidenceCount: 3,
      confidence: 'VERIFIED',
      descriptorProfile: { woody: 12 },
      performanceProfile: {},
      timepointProfile: {},
    }).success).toBe(false)
  })
})
