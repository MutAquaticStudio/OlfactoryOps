# ADR-001: Modular V2 Boundaries

## Context
The cleaned V1 application is a working monolith with React, Nest/Fastify, and Worker surfaces. V2 needs clear ownership without a risky rewrite.

## Decision
Use logical `apps`, `services`, `packages`, and `infra` boundaries while leaving current code in place until incremental extraction is verified.

## Alternatives considered
Blindly move the repository; create a parallel application; keep an unbounded monolith.

## Consequences
Contracts become explicit and migration is slower but reversible.

## Security impact
Authorization and tenant checks remain in server-owned services, not duplicated in UI.

## Migration impact
Every extraction requires parity tests, route compatibility, and a rollback path.

## Status
Accepted for Phase 0.
