import { describe, expect, it } from 'vitest'
import { V2_CONTRACT_VERSION, apiErrorEnvelopeSchema, tenantContextSchema, evidenceStatusSchema, idempotencyMetadataSchema } from './index'

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
})
