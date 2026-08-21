# ADR-010: Legacy Migration Boundary

## Context
The V1 repository and migrations are cleaned and must remain a stable transition baseline.

## Decision
Freeze historical migrations `0001-0044`, preserve runtime compatibility, and migrate incrementally through verified contracts and reconciliation.

## Alternatives considered
Rewrite history; destructive schema cleanup; immediate V2 cutover.

## Consequences
The transition is auditable and reversible, but temporary compatibility code remains.

## Security impact
No tenant/customer data is silently deleted or re-scoped during Phase 0.

## Migration impact
Every future cutover needs record counts, tenant isolation checks, invariant tests, and rollback evidence.

## Status
Accepted for Phase 0.
