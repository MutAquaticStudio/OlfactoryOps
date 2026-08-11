# ADR-012: Cloudflare Cloud-Native Runtime for V2

## Status

Accepted for migration checkpoint `codex/cloudflare-cloud-native-runtime`.

## Context

V2 had reached a stable feature-complete checkpoint before feature direction
shifted toward a runtime migration. We now need to move to a Cloudflare-first
runtime while preserving PostgreSQL as authoritative transactional state.

## Decision

Use a Cloudflare-native topology with these boundaries:

- Workers for edge ingress, tenant routing, authn/authz, orchestration
- PostgreSQL for source-of-truth domain state
- Hyperdrive as Workers-to-PostgreSQL access path
- R2 for immutable/versioned artifact and report payloads
- Vectorize for separated semantic indexes
- Queues for at-least-once async work
- Workflows for durable orchestration state machines
- Cloudflare Containers for expensive scientific compute (feature + model workloads)

For this checkpoint, scientific/long-running paths remain migration-first and are
not deployed as production defaults.

## Consequences

- D1 is no longer used as the V2 authoritative store.
- Scientific inference and prediction are moved out of Workers runtime.
- Local Docker becomes explicit/manual only during migration debugging.
- Remote builds and runbooks are mandatory before any production move.
- No production deployment of this migration checkpoint.

## Alternatives considered

1. Keep D1 + local Docker as runtime default.
   - Rejected: would continue lock-in and operational drift from migration goal.
2. Introduce partial migration where some modules still write through D1.
   - Rejected: risks mixed source-of-truth behavior and tenancy inconsistencies.
3. Replace PostgreSQL with a managed Cloudflare-native DB.
   - Rejected: would violate V2 source-of-truth requirement and previous trust
     boundaries.

## Compliance requirements

- Keep tenant isolation, RLS, and audit evidence behavior unchanged.
- No production writes via container/queue/workflow without durable approval
  boundaries.
- Keep migration proof local and test environment oriented until cloud services and
  secrets are validated.
- No direct container-facing tenant credentials in compute payloads.

## Implementation status

- docs/workbooks created: **PASS**
- CI workflow scaffolding: **IN_PROGRESS**
- remote container and Hyperdrive cutover: **BLOCKED** (provider/environment dependency)
- local docker decommission: **NOT_APPLIED** until remote proof is green

