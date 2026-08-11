# Queue Contracts (Cloudflare Queues)

## Purpose

- Carry async, at-least-once safe domain events and jobs that can complete out of request flow.
- Preserve strict tenant and permission provenance through Worker orchestration.

## Envelope contract

Message body should include:

- `jobId`
- `tenantId`
- `correlationId`
- `idempotencyKey`
- `actorUserId`
- `jobType`
- `schemaVersion`
- `payloadRef` (never raw sensitive payload)
- `createdAt`

## Safety constraints

- Payload must be references + bounded metadata, not raw command bodies.
- Queue consumers must be idempotent by (`idempotencyKey`, `schemaVersion`) and tenant scoped.
- On repeated attempts:
  - preserve first committed result
  - avoid duplicate mutations
- Keep dead-letter/retry evidence in worker/outbox domain logs.

## Checkpoint status

- Schema + operational contract: PASS
- Producer/consumer integration: BLOCKED (migration rollout pending)

