import { describe, expect, it } from 'vitest'
import {
  formulaVersions,
  formulas,
  type Formula,
  type FormulaVersionRecord,
} from '../src/data/northStar'
import {
  normalizeFormulaPersistenceRecord,
  normalizeFormulaVersionPersistenceRecord,
  isSingleRecoveryCodeConsumption,
} from './index'

describe('Formula D1 persistence normalization', () => {
  it('backfills tenant and workflow metadata on legacy Formula snapshots', () => {
    const legacyFormula = {
      ...formulas[0],
      organizationId: undefined,
      brandId: undefined,
      workflowStatus: undefined,
      draftRevision: undefined,
      updatedAt: undefined,
      approvalHistory: undefined,
    } as unknown as Formula

    const normalized = normalizeFormulaPersistenceRecord(
      legacyFormula,
      '2026-07-18T12:00:00.000Z',
    )

    expect(normalized.organizationId).toBe('org-nxl')
    expect(normalized.brandId).toBe('brand-nxl')
    expect(normalized.workflowStatus).toBe('APPROVED')
    expect(normalized.draftRevision).toBe(1)
    expect(normalized.updatedAt).toBe('2026-07-18T12:00:00.000Z')
    expect(normalized.approvalHistory).toEqual([])
  })

  it('backfills organization metadata on legacy immutable versions', () => {
    const legacyVersion = {
      ...formulaVersions[0],
      organizationId: undefined,
      evaluations: undefined,
      resolvedLeaves: undefined,
      evaporation: undefined,
    } as unknown as FormulaVersionRecord

    const normalized = normalizeFormulaVersionPersistenceRecord(
      legacyVersion,
      '2026-07-18T12:00:00.000Z',
    )

    expect(normalized.organizationId).toBe('org-nxl')
    expect(normalized.checksum).toBe(formulaVersions[0]?.checksum)
    expect(normalized.evaluations).toEqual([])
    expect(normalized.resolvedLeaves).toEqual([])
    expect(normalized.evaporation).toEqual([])
  })

  it('fails closed when Formula identity metadata is missing', () => {
    const invalid = { ...formulas[0], id: undefined } as unknown as Formula
    expect(() => normalizeFormulaPersistenceRecord(invalid)).toThrow(
      'Formula persistence record is missing identity metadata',
    )
  })
})

describe('MFA recovery-code persistence', () => {
  it('accepts only an exact one-hash removal transition', () => {
    const previous = ['sha256:a', 'sha256:b', 'sha256:c']

    expect(isSingleRecoveryCodeConsumption(previous, ['sha256:a', 'sha256:c'])).toBe(true)
    expect(isSingleRecoveryCodeConsumption(previous, previous)).toBe(false)
    expect(isSingleRecoveryCodeConsumption(previous, ['sha256:a'])).toBe(false)
    expect(isSingleRecoveryCodeConsumption(previous, ['sha256:a', 'sha256:x'])).toBe(false)
    expect(
      isSingleRecoveryCodeConsumption(['sha256:a', 'sha256:a'], ['sha256:a']),
    ).toBe(false)
  })
})
