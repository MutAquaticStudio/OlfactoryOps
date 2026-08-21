# OlfactoryOps V2 Phase 10 Implementation Report

## Local Acceptance Position

Phase 10 Commerce / Orders / Fulfillment is implemented as a tenant-scoped
PostgreSQL domain. It is deliberately separate from Phase 2 raw-material
inventory and inbound procurement shipments. Finished goods are allocated from
the Phase 8 finished-good ledger only.

This report records a local repository checkpoint. It is not evidence of a
remote migration, live shipping provider, or production deployment.

## Implemented Flows

1. Customer, contact and address records are tenant-scoped and role-gated.
2. Finished-good and service SKUs have versioned price records. A finished-good
   SKU pins an approved Formula Version and a positive pack configuration.
3. Quote versions preserve commercial snapshots. An accepted non-expired quote
   can create a sales order without copying mutable current price data.
4. Sales orders move through confirmation, allocation, partial fulfillment,
   fulfillment, cancellation, and closure with immutable order events.
5. Allocation uses released finished-good lots, FEFO ordering, append-only
   finished-good ledger entries, and a dedicated sales-reservation aggregate.
6. Fulfillment supports picking, packing, shipment metadata, delivery, and
   safe partial fulfillment. It never consumes raw-material inventory.
7. A cancellation releases only unfulfilled reservations and retains shipped
   and fulfillment history.
8. Returns support request, authorization, partial receipt, complete receipt,
   evidence-backed Quality disposition, and closure. Every immutable receipt
   creates a `RETURN -> QUARANTINE` finished-good ledger movement. A partial
   receipt stays `AUTHORIZED`; the aggregate becomes `INSPECTING` only after
   every authorized return line is physically received.
9. `RETURN_QC` evidence is mandatory before an authorized Quality principal
   can retain a return in quarantine, reject it to waste, or release it back
   to available finished-good stock. `RELEASE_TO_AVAILABLE` additionally
   requires `production.release`, verifies the lot remains released and
   unexpired, and creates `QUALITY_RELEASE` evidence. `REJECT_TO_WASTE`
   creates immutable `WASTE` evidence. `HOLD_FOR_QUALITY` preserves the
   quarantine balance without inventing a stock movement. The deciding
   principal must also hold `documents.view` to inspect the cited evidence.
10. Cost and margin projections, Formula references, finished-good lot data,
   documents, and traceability are independently permission-gated.
11. `commerce.status` is a governed, read-only Agent Runtime adapter. It calls
    `CommerceService.listOrders` under the actor's tenant context and emits a
    bounded order-status projection only.

## Verified Gates

| Gate | Evidence | Status |
|---|---|---|
| Commerce contracts and client idempotency | Focused Vitest contracts plus client retry cache | PASS |
| Commerce Agent adapter | Focused tenant-context and redacted-projection tests | PASS |
| V2 typecheck | `npm.cmd run typecheck:v2` | PASS |
| Frontend and API build | Included by role E2E runner | PASS |
| Migration chain | Disposable PostgreSQL applies `0001` through `0016` and re-applies the additive Phase 10 migration | PASS |
| Commerce RLS workflow | `npm.cmd run v2:postgres:rls` covers quote-to-order, finished-good reservation, shipment, partial/complete return receipt, all three Quality dispositions, immutable receipt/decision evidence, redaction, and cross-tenant denial | PASS |
| Role and responsive browser matrix | `npm.cmd run test:v2:role-e2e` verifies all 12 roles independently at 320, 390, 768, 1280, and 1440 pixels | PASS |
| Live carrier provider | Provider-neutral boundary only; no configured test carrier | BLOCKED |
| Remote PostgreSQL migration | No remote target is part of this checkpoint | NOT_APPLICABLE |
| Production deployment | No deployment is authorized for this checkpoint | NOT_APPLICABLE |

## Requirements Boundary

| Requirement | Implementation evidence | Status |
|---|---|---|
| BR-090 / FR-COM-* | Customers, contacts, addresses, SKUs, prices, quote versions, customer-safe documents, tenant isolation, and audit | PASS |
| BR-091 / FR-ORD-* | Order lifecycle, dedicated finished-good reservation, partial fulfillment, shipment status, cancellation, full return custody/disposition, and margin authorization | PASS |
| BR-081 downstream segment | Finished-good lot -> reservation -> fulfillment -> shipment -> return traceability edges, without reusing raw inventory or inbound shipment records | PASS |
| Customer return disposition to saleable stock | `RETURN_QC` evidence, separated Quality authority, partial-receipt gate, `HOLD_FOR_QUALITY`, `REJECT_TO_WASTE`, and authorized `RELEASE_TO_AVAILABLE` are tested against the finished-good ledger | PASS |
| Live shipping carrier dispatch and delivery webhooks | No external provider credential or test environment is configured | BLOCKED |

`BLOCKED` records an unavailable external verification dependency. It does not
authorize a live integration or weaken the local domain safeguards.
