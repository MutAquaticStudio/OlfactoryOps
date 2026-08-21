import { describe, expect, it } from 'vitest'
import { V2_CONTRACT_VERSION, apiErrorEnvelopeSchema, tenantContextSchema, evidenceStatusSchema, idempotencyMetadataSchema, materialScopeSchema, materialStatusSchema, complianceStatusSchema, inspectionDispositionSchema, purchaseRequestCreateSchema } from './index'

describe('V2 shared contracts', () => {
  it('requires server-derived tenant context', () => {
    expect(tenantContextSchema.safeParse({ organizationId: 'org-1' }).success).toBe(true)
    expect(tenantContextSchema.safeParse({}).success).toBe(false)
  })

  it('keeps error and evidence states explicit', () => {
    expect(apiErrorEnvelopeSchema.safeParse({ error: { code: 'NOT_CONFIGURED', message: 'Unavailable', requestId: 'req-1' } }).success).toBe(true)
    expect(evidenceStatusSchema.options).toContain('NOT_ENOUGH_EVIDENCE')
    expect(evidenceStatusSchema.options).toContain('BLOCKED')
  })

  it('requires scoped idempotency metadata and a versioned permission contract', () => {
    expect(idempotencyMetadataSchema.safeParse({ key: 'idem-123456', requestHash: 'a'.repeat(64), route: '/v2/materials', scope: 'org-1' }).success).toBe(true)
    expect(V2_CONTRACT_VERSION).toBe('2.0.0')
  })

  it('keeps the Phase 2 material aggregate tenant-only and explicitly reviewed', () => {
    expect(materialScopeSchema.safeParse('TENANT').success).toBe(true)
    expect(materialScopeSchema.safeParse('GLOBAL').success).toBe(false)
    expect(materialStatusSchema.options).toEqual(['DRAFT', 'REVIEW_REQUIRED', 'ACTIVE', 'BLOCKED', 'ARCHIVED'])
    expect(complianceStatusSchema.options).toEqual(['APPROVED', 'REVIEW_REQUIRED', 'BLOCKED', 'NOT_EVALUATED'])
  })

  it('keeps procurement request lines and non-final QC dispositions structured', () => {
    expect(purchaseRequestCreateSchema.safeParse({ lines: [] }).success).toBe(false)
    expect(purchaseRequestCreateSchema.safeParse({ lines: [{ materialId: 'mat-1', requestedGrams: 5 }] }).success).toBe(true)
    expect(inspectionDispositionSchema.options).toContain('HOLD')
    expect(inspectionDispositionSchema.options).toContain('REVIEW_REQUIRED')
  })
})
