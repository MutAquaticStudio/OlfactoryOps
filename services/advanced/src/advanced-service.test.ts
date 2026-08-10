import { describe, expect, it } from 'vitest'
import { sanitizeOptimizerCandidate } from './advanced-service.js'

describe('sanitizeOptimizerCandidate', () => {
  const baseCandidate = {
    id: 'opt_candidate_test',
    candidateNumber: 1,
    status: 'ADVISORY',
    scorecard: {
      total: 87.45,
      cost: { score: 0.7, estimatedPerKg: 15.2, currency: 'USD', status: 'ESTIMATED' },
      compliance: { status: 'VERIFIED' },
    },
    componentProposal: [
      { materialId: 'mat_test', percentage: 50, position: 0, note: 'primary' },
    ],
    savedFormulaDraftId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }

  it('redacts candidate score cost when costing is not allowed', () => {
    const sanitized = sanitizeOptimizerCandidate(baseCandidate, {
      canViewFormulaSensitive: false,
      canViewCost: false,
    })

    expect(sanitized.componentProposal).toBeUndefined()
    expect((sanitized.scorecard as Record<string, unknown>).cost).toBeUndefined()
    expect((sanitized.scorecard as Record<string, unknown>).compliance).toEqual({ status: 'VERIFIED' })
    expect(sanitized.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('keeps component and cost details when all required permissions are granted', () => {
    const sanitized = sanitizeOptimizerCandidate(baseCandidate, {
      canViewFormulaSensitive: true,
      canViewCost: true,
    })

    expect(sanitized.componentProposal).toEqual(baseCandidate.componentProposal)
    expect((sanitized.scorecard as Record<string, unknown>).cost).toEqual(baseCandidate.scorecard.cost)
  })
})
