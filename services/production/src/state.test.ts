import { describe, expect, it } from 'vitest'
import { assertProductionTransition, assertStageTransition, expectedPriorStage } from './state.js'

describe('production state machine', () => {
  it('allows the deterministic production path', () => {
    assertProductionTransition('DRAFT', 'PLANNED')
    assertProductionTransition('PLANNED', 'READY_FOR_WEIGHING')
    assertProductionTransition('READY_FOR_WEIGHING', 'WEIGHING')
    assertProductionTransition('WEIGHING', 'COMPOUNDING')
    assertProductionTransition('FILLING', 'QC')
    assertProductionTransition('QC', 'RELEASED')
    assertProductionTransition('REJECTED', 'CLOSED')
  })

  it('allows a held batch to return to ready-for-weighing only through service correction guards', () => {
    assertProductionTransition('HOLD', 'READY_FOR_WEIGHING')
  })

  it('supports the controlled QC failure path from hold to rejection and closure', () => {
    assertProductionTransition('QC', 'HOLD')
    assertProductionTransition('HOLD', 'REJECTED')
    assertProductionTransition('REJECTED', 'CLOSED')
  })

  it('permits post-release transitions only for the dedicated quality-hold flow', () => {
    assertProductionTransition('RELEASED', 'HOLD')
    assertProductionTransition('HOLD', 'RELEASED')
  })

  it('rejects terminal and unsafe transitions', () => {
    expect(() => assertProductionTransition('DRAFT', 'RELEASED')).toThrow('This production order transition is not allowed.')
    expect(() => assertProductionTransition('RELEASED', 'QC')).toThrow('This production order transition is not allowed.')
    expect(() => assertProductionTransition('WEIGHING', 'CANCELLED')).toThrow('This production order transition is not allowed.')
    expect(() => assertStageTransition('COMPLETED', 'IN_PROGRESS')).toThrow('This production stage transition is not allowed.')
  })

  it('preserves the fixed stage sequence', () => {
    expect(expectedPriorStage('COMPOUNDING')).toBeNull()
    expect(expectedPriorStage('FILTRATION')).toBe('CONDITIONING')
    expect(expectedPriorStage('FILLING')).toBe('FILTRATION')
  })
})
