# ADR-008: Events and Idempotency

## Context
Long-running operations, retries, and multi-tenant workflows need reliable replay and exactly-once business outcomes.

## Decision
Use a versioned domain-event envelope and scoped idempotency metadata. Domain mutation and outbox event commit atomically; workers use leases and fencing.

## Alternatives considered
Best-effort logs; client-only dedupe; unscoped idempotency keys.

## Consequences
Replay and recovery are deterministic, with storage and operational complexity.

## Security impact
Correlation and actor/tenant fields are explicit; event payloads exclude secrets and raw provider reasoning.

## Migration impact
Legacy events are compatibility inputs only; new services publish versioned events and verify sequence/order.

## Status
Accepted for Phase 0.
