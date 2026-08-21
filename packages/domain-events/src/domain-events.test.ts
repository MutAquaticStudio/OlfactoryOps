import { describe, expect, it } from 'vitest'
import { DOMAIN_EVENT_CONTRACT_VERSION, domainEventEnvelopeSchema, isSupportedEventVersion, validateDomainEvent } from './index'

const event = {
  eventId: 'evt-1', eventType: 'material.material.created', version: 1,
  organizationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1',
  occurredAt: '2026-08-08T10:00:00.000Z', subject: { type: 'material', id: 'mat-1' }, payload: { status: 'DRAFT' },
}

describe('V2 domain event envelope', () => {
  it('validates the SRS envelope and rejects malformed event types', () => {
    expect(validateDomainEvent(event).subject.type).toBe('material')
    expect(domainEventEnvelopeSchema.safeParse({ ...event, eventType: 'arbitrary' }).success).toBe(false)
  })

  it('uses an explicit version strategy', () => {
    expect(isSupportedEventVersion(DOMAIN_EVENT_CONTRACT_VERSION)).toBe(true)
    expect(isSupportedEventVersion(99)).toBe(false)
  })
})
