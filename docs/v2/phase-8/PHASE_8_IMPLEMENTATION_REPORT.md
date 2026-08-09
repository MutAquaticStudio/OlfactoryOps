# OlfactoryOps V2 Phase 8 Implementation Report

## Local Acceptance Position

The Phase 8 repository-local checkpoint is `PASS`. Its evidence covers the
production contract, service workflow, controller authorization boundaries,
PostgreSQL migration/RLS boundary, finished-good hold/rework/re-release path,
and the isolated 12-role browser matrix. This is not a remote migration or
production deployment statement.

## Verified Gates

| Gate | Evidence | Status |
|---|---|---|
| Production contract, projection, and client retry rules | Focused Vitest suite for contracts, state, math, correction, release gate, capability projection, and client idempotency | PASS - 7 files, 28 tests. |
| V2 typecheck | `npm.cmd run typecheck:v2` | PASS |
| API build and frontend build | Included by `npm.cmd run test:v2:role-e2e` | PASS |
| Migration chain | Disposable loopback PostgreSQL applied the current `0001` through `0014` sequence, including additive P8 migrations `0012` through `0014` | PASS |
| Phase 8 persistence fence | `v2:postgres:verify` found all 19 Phase 8 tenant tables RLS-enabled and RLS-forced; the P8 chain declares 51 composite tenant foreign keys | PASS |
| Application-role production workflow | `npm.cmd run v2:postgres:rls` | PASS - reservation-backed allocation, weighing/usage, correction idempotency, process/QC/release, hold/rework/re-release revision, raw-to-finished-good genealogy, policy backfill, and cross-tenant denial. |
| Release and finished-good ledger behavior | The disposable RLS workflow verifies active pre-release documentation, latest-QC revision gating, output/quarantine/release, full-lot quality hold, controlled rework, refreshed yield/QC, and immutable superseding re-release | PASS |
| Quality-release and quality-rejection branches | The guarded service and finished-good ledger define `HOLD -> AVAILABLE` and held-lot rejection paths, but this checkpoint has no separate focused integration result for those two dispositions | BLOCKED |
| Browser authorization and responsive route coverage | `npm.cmd run test:v2:role-e2e` | PASS - 12 independent roles in 20.4 seconds. |
| Phase 8 mutation boundaries | The 12-role browser suite exercises create, QC record/approve, release, cancel, close, and finished-good genealogy authorization without writing a production fixture record | PASS |
| Remote PostgreSQL migration | No remote target is in scope | NOT_APPLICABLE |
| Production deployment | No deployment is attempted or authorized | NOT_APPLICABLE |

## Requirements Boundary

| Requirement | Evidence boundary | Status |
|---|---|---|
| BR-080 / FR-PROD-001..004 | Approved Formula Version snapshot, requirement/allocation, reservation-backed weighing/usage, and controlled four-stage processing with hold/rework routes | PASS |
| FR-PROD-005 | Active QC specification, latest-revision QC results, deviation/CAPA resolution, active pre-release document evidence, and deterministic release gate | PASS |
| FR-PROD-006..007 | Release creates a separate finished-good lot/ledger with reconciled yield; full-lot quality hold, controlled rework, and superseding re-release retain separate ledger provenance | PASS |
| Post-release `CONTINUE` and `REJECT` dispositions | Source defines `QUALITY_RELEASE` and held-lot `WASTE` entries with deviation evidence, but no separate focused integration result is supplied | BLOCKED |
| FR-PROD-008, upstream segment | Raw lot, Formula, production evidence, revision/supersession, deviation-evidence document links, release, active document projection, and finished-good genealogy | PASS |
| BR-081, downstream Order/Shipment segment | Commerce-owned Order/Shipment trace links are not created by Phase 8; P8 genealogy entity types do not include Sales Order, SKU, or Shipment | BLOCKED |
| BR-082 | Release is server-authoritative and requires a human principal holding `production.release` and `production.qc.approve` (Owner/Admin by default); it is not an LLM action | PASS |

`BLOCKED` records a cross-phase dependency that has no successful current-run
evidence. It does not convert the separate finished-good ledger into a raw
inventory or shipment ledger.
