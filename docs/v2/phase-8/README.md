# OlfactoryOps V2 Phase 8 - Production Manufacturing

## Purpose

Phase 8 provides the server-authoritative, tenant-scoped production boundary
from an approved Formula Version through raw-material consumption, controlled
processing, QC, deviation/CAPA, yield/rework, release, finished-good lots,
genealogy, and retained documents. Client code does not directly write raw
inventory, finished-good ledger, release, or genealogy records.

## Scope

- `0012_phase8_production_manufacturing.sql` establishes production,
  finished-good, genealogy, and document records.
- `0013_phase8_production_quality_revisions.sql` adds versioned QC correction
  and supersession provenance plus deviation-to-rework linkage.
- `0014_phase8_finished_good_hold_and_rework.sql` adds post-release quality
  hold evidence, release revisions, and additive Owner/Admin policy backfill.
- `packages/contracts/src/production.ts`, the production service/controller,
  and the V2 production workspace are the shared source surfaces.

Together, the additive Phase 8 migrations own 19 tenant-scoped tables and 51
composite tenant foreign keys. They keep raw inventory provenance connected to
production without using raw inventory or shipments as a finished-good ledger.

Raw materials remain owned by the Phase 2 inventory reservation and movement
ledger. Finished goods have their own Phase 8 lot and ledger records; they do
not use raw inventory movements, reservations, or `v2_shipments` as a
finished-good ledger.

## Verified Local Evidence

| Gate | Evidence | Status |
|---|---|---|
| Focused production contract/domain/UI suite | `npx.cmd vitest run packages/contracts/src/production.test.ts services/production/src/correction-policy.test.ts services/production/src/detail-projection.test.ts services/production/src/math.test.ts services/production/src/release-gate.test.ts services/production/src/state.test.ts src/features/v2-production/api.test.ts` | PASS - 7 files, 28 tests. |
| V2 typecheck | `npm.cmd run typecheck:v2` | PASS |
| Integrated API/frontend build and migration verifier | `npm.cmd run test:v2:role-e2e` runs `build:api`, frontend build, and `v2:postgres:verify` before browser checks | PASS |
| Disposable PostgreSQL application-role workflow | `npm.cmd run v2:postgres:rls` | PASS - reservation-backed allocation, controlled usage correction, raw-to-finished-good genealogy, post-release quality hold/rework/re-release, policy backfill, and cross-tenant denial. |
| Browser and role authorization matrix | `npm.cmd run test:v2:role-e2e` | PASS - 12 isolated roles, including production list/navigation/route, responsive overflow checks, mutation authorization boundaries, and finished-good genealogy dual-capability denial. |
| Remote migration and production deployment | No remote database or deployment target is part of this checkpoint | NOT_APPLICABLE |

The evidence is local and disposable-database evidence. It does not state that
a remote migration or production deployment has occurred.

The architecture record distinguishes the state-transition registry from the
guarded workflow paths. In particular, release accepts only a `QC` order with
active pre-release documents and the latest passed QC revision; post-release
hold, quality release, rejection, and rework move the finished-good balance
only through its dedicated ledger and deviation evidence.

## Reading Order

1. [Production manufacturing architecture](PRODUCTION_MANUFACTURING_ARCHITECTURE.md)
   defines ledger ownership, lifecycle, permissions, release gates, and
   traceability.
2. [Phase 8 implementation report](PHASE_8_IMPLEMENTATION_REPORT.md) maps
   the verified gates to the Phase 8 requirement boundary.

## Evidence Convention

Only these evidence states are used in Phase 8 documentation:

- `PASS`: the stated scoped check completed successfully.
- `FAIL`: the stated check ran and failed.
- `BLOCKED`: a required boundary lacks a successful current-run result; this
  does not conclude that the implementation failed.
- `NOT_APPLICABLE`: the gate is outside this local checkpoint.
