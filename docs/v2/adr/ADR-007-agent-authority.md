# ADR-007: Agent Authority Boundary

## Context
Formula Intelligence and future agents can assist research but must not override operational controls.

## Decision
Agents use allow-listed, typed, permission-checked tools. Deterministic services remain authoritative for inventory, ledger, formula math, compliance, QC, release, fulfillment, auth, and billing.

## Alternatives considered
Free-form model actions; unrestricted SQL/tools; automatic formula mutation.

## Consequences
The agent is safer and explainable, but requires confirmations and durable job state for mutations.

## Security impact
No arbitrary SQL, shell, URL, hidden reasoning, or unregistered tool execution is allowed.

## Migration impact
Existing agent runtime adopts shared contracts before any provider activation.

## Status
Accepted for Phase 0.
