import { z } from 'zod'

export const DOMAIN_EVENT_CONTRACT_VERSION = 1

export const eventSubjectSchema = z.object({
  type: z.string().trim().min(1).max(80),
  id: z.string().trim().min(1).max(160),
})
export type EventSubject = z.infer<typeof eventSubjectSchema>

export const domainEventEnvelopeSchema = z.object({
  eventId: z.string().trim().min(1).max(160),
  eventType: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/),
  version: z.number().int().positive(),
  organizationId: z.string().trim().min(1).max(160),
  actorId: z.string().trim().min(1).max(160),
  correlationId: z.string().trim().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  subject: eventSubjectSchema,
  payload: z.record(z.string(), z.unknown()),
})
export type DomainEventEnvelope = z.infer<typeof domainEventEnvelopeSchema>

export function validateDomainEvent(input: unknown): DomainEventEnvelope {
  return domainEventEnvelopeSchema.parse(input)
}

export function isSupportedEventVersion(version: number) {
  return version === DOMAIN_EVENT_CONTRACT_VERSION
}
