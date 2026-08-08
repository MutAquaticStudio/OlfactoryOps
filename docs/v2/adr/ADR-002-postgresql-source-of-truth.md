# ADR-002: PostgreSQL as V2 Source of Truth

## Context
V1 uses D1 at the edge while V2 requires transactional, tenant-scoped operational data.

## Decision
PostgreSQL is the sole authoritative V2 writer. D1 remains a V1 edge/control-plane store during transition.

## Alternatives considered
Keep D1 as the primary database; dual-write both stores; use a hosted NoSQL database.

## Consequences
Transactions, RLS, and relational lineage are available, with an added connectivity and migration obligation.

## Security impact
RLS and repository tenant context provide defense in depth; no second writer may bypass policy.

## Migration impact
Use additive migrations, dual-read windows, reconciliation, then an explicit cutover. Do not modify legacy migrations destructively.

## Status
Accepted for Phase 0.
