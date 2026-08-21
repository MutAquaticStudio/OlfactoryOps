import { describe, expect, it } from 'vitest'
import {
  productionAllocationCommitRequestSchema,
  productionFinishedGoodQualityHoldRequestSchema,
  productionQcSpecificationCreateRequestSchema,
  productionReleaseRequestSchema,
  productionReworkCreateRequestSchema,
  productionUsageReversalRequestSchema,
} from './production'

describe('Phase 8 production contracts', () => {
  it('rejects duplicate requirement and lot allocations while allowing split-lot allocation', () => {
    expect(productionAllocationCommitRequestSchema.safeParse({
      allocations: [
        { requirementId: 'req-1', lotId: 'lot-1', allocatedGrams: 10 },
        { requirementId: 'req-1', lotId: 'lot-1', allocatedGrams: 5 },
      ],
    }).success).toBe(false)

    expect(productionAllocationCommitRequestSchema.safeParse({
      allocations: [
        { requirementId: 'req-1', lotId: 'lot-1', allocatedGrams: 10 },
        { requirementId: 'req-1', lotId: 'lot-2', allocatedGrams: 5 },
      ],
    }).success).toBe(true)
  })

  it('keeps QC specifications typed and bounded', () => {
    const base = {
      name: 'Release QC',
      versionLabel: '1.0',
      checks: [{ key: 'density', label: 'Density', kind: 'NUMERIC', minimum: 1.1, maximum: 0.9 }],
    }
    expect(productionQcSpecificationCreateRequestSchema.safeParse(base).success).toBe(false)

    expect(productionQcSpecificationCreateRequestSchema.safeParse({
      ...base,
      checks: [{ key: 'appearance', label: 'Appearance', kind: 'ENUM' }],
    }).success).toBe(false)

    expect(productionQcSpecificationCreateRequestSchema.safeParse({
      ...base,
      checks: [
        { key: 'density', label: 'Density', kind: 'NUMERIC', minimum: 0.9, maximum: 1.1, unit: 'g/ml' },
        { key: 'appearance', label: 'Appearance', kind: 'ENUM', allowedValues: ['CLEAR', 'HAZY'] },
      ],
    }).success).toBe(true)
  })

  it('does not allow a release expiry before its manufacture timestamp', () => {
    expect(productionReleaseRequestSchema.safeParse({
      finishedGoodLotNumber: 'FG-2026-0001',
      location: 'Released goods shelf',
      manufacturedAt: '2026-08-10T00:00:00.000Z',
      expiresAt: '2026-08-09T00:00:00.000Z',
      rationale: 'All required release gates are satisfied.',
    }).success).toBe(false)
  })

  it('requires a finished-good source only for finished-good rework', () => {
    expect(productionReworkCreateRequestSchema.safeParse({
      deviationId: 'dev-1',
      sourceKind: 'FINISHED_GOOD_LOT',
      quantityGrams: 5,
      targetStage: 'FILTRATION',
      reason: 'Correct a controlled haze deviation.',
    }).success).toBe(false)

    expect(productionReworkCreateRequestSchema.safeParse({
      deviationId: 'dev-1',
      sourceKind: 'IN_PROCESS',
      sourceFinishedGoodLotId: 'fg-lot-1',
      quantityGrams: 5,
      targetStage: 'FILTRATION',
      reason: 'Correct a controlled haze deviation.',
    }).success).toBe(false)

    expect(productionReworkCreateRequestSchema.safeParse({
      deviationId: 'dev-1',
      sourceKind: 'FINISHED_GOOD_LOT',
      sourceFinishedGoodLotId: 'fg-lot-1',
      quantityGrams: 5,
      targetStage: 'FILTRATION',
      reason: 'Correct a controlled haze deviation.',
    }).success).toBe(true)

    expect(productionReworkCreateRequestSchema.safeParse({
      sourceKind: 'IN_PROCESS',
      quantityGrams: 5,
      targetStage: 'FILTRATION',
      reason: 'A controlled correction is required.',
    }).success).toBe(false)
  })

  it('requires a bounded reason for a controlled production usage correction', () => {
    expect(productionUsageReversalRequestSchema.safeParse({}).success).toBe(false)
    expect(productionUsageReversalRequestSchema.safeParse({ reason: ' '.repeat(2) }).success).toBe(false)
    expect(productionUsageReversalRequestSchema.safeParse({
      reason: 'The verified lot was selected in error; the batch is held for an authorized correction.',
    }).success).toBe(true)
  })

  it('deduplicates bounded evidence on a finished-good quality hold', () => {
    const result = productionFinishedGoodQualityHoldRequestSchema.safeParse({
      rationale: 'Hold the released lot pending a controlled rework decision.',
      evidenceDocumentSnapshotIds: ['doc-a', 'doc-a', 'doc-b'],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.evidenceDocumentSnapshotIds).toEqual(['doc-a', 'doc-b'])
  })
})
