import { describe, expect, it } from 'vitest'
import { evaluateProductionReleaseGate } from './release-gate.js'

const passingInput = () => ({
  formulaSnapshotPresent: true,
  requirementStatuses: ['CONSUMED'],
  allocationStatuses: ['CONSUMED'],
  processSteps: [
    { stage: 'COMPOUNDING', status: 'COMPLETED' },
    { stage: 'CONDITIONING', status: 'COMPLETED' },
    { stage: 'FILTRATION', status: 'COMPLETED' },
    { stage: 'FILLING', status: 'COMPLETED' },
  ],
  qcRequiredCheckKeys: ['appearance'],
  qcResults: [{ checkKey: 'appearance', resultStatus: 'PASSED' }],
  deviationStatuses: [] as string[],
  capaStatuses: [] as string[],
  yieldStatus: 'RECONCILED',
  reworkStatuses: [] as string[],
  finishedQuantityGrams: 95,
  releaseDocumentSnapshotIds: ['doc_release_evidence'],
})

describe('production release gate', () => {
  it('requires complete QC, traceability, reconciliation, and pre-release evidence', () => {
    expect(evaluateProductionReleaseGate(passingInput()).passed).toBe(true)
  })

  it('blocks a release with a failed or absent required QC result', () => {
    const input = passingInput()
    input.qcResults = [{ checkKey: 'appearance', resultStatus: 'FAILED' }]
    const result = evaluateProductionReleaseGate(input)
    expect(result.passed).toBe(false)
    expect(result.failedChecks).toEqual(['appearance'])
    expect(result.checks.qcPassed).toBe(false)
  })

  it('uses the latest immutable QC revision for each check', () => {
    const input = passingInput()
    input.qcResults = [
      { checkKey: 'appearance', resultStatus: 'PASSED', revision: 1 },
      { checkKey: 'appearance', resultStatus: 'INVALIDATED', revision: 2 },
    ]
    expect(evaluateProductionReleaseGate(input).passed).toBe(false)

    input.qcResults.push({ checkKey: 'appearance', resultStatus: 'PASSED', revision: 3 })
    expect(evaluateProductionReleaseGate(input).passed).toBe(true)
  })

  it('blocks open deviations and non-effective CAPA', () => {
    const input = passingInput()
    input.deviationStatuses = ['OPEN']
    input.capaStatuses = ['EFFECTIVENESS_PENDING']
    const result = evaluateProductionReleaseGate(input)
    expect(result.checks.deviationsResolved).toBe(false)
    expect(result.checks.capaEffective).toBe(false)
    expect(result.passed).toBe(false)
  })

  it('does not treat post-release generation as pre-release documentation', () => {
    const input = passingInput()
    input.releaseDocumentSnapshotIds = []
    const result = evaluateProductionReleaseGate(input)
    expect(result.checks.requiredDocumentation).toBe(false)
    expect(result.passed).toBe(false)
  })
})
