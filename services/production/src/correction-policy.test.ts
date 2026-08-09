import { describe, expect, it } from 'vitest'
import { assertProductionUsageCorrectionAllowed } from './correction-policy.js'

describe('production usage correction policy', () => {
  it('permits a compensating correction before any process stage is completed', () => {
    expect(() => assertProductionUsageCorrectionAllowed({ orderStatus: 'COMPOUNDING', hasCompletedProcessStage: false })).not.toThrow()
  })

  it('blocks correction after downstream processing begins', () => {
    expect(() => assertProductionUsageCorrectionAllowed({ orderStatus: 'COMPOUNDING', hasCompletedProcessStage: true })).toThrow('Raw-material correction is unavailable')
  })

  it('blocks correction from terminal or otherwise unsafe states', () => {
    expect(() => assertProductionUsageCorrectionAllowed({ orderStatus: 'RELEASED', hasCompletedProcessStage: false })).toThrow('Raw-material correction is available only')
  })
})
