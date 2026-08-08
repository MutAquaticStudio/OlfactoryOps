# Requirements Traceability Matrix — OlfactoryOps V2

| Business requirement | System requirement | Module | Initial phase |
|---|---|---|---|
| BR-001..003 | FR-PLAT-001..003 | Platform | 1 |
| BR-004..006 | FR-DOM-001..006 | Domains / Tenant Router | 1 |
| BR-010..013 | FR-AUTH-001..010 | Auth | 1 |
| BR-020..022 | FR-NOTIF-001..004 | Billing/Notifications | 1 |
| BR-030..033 | FR-PRIV-001..005 | Privacy | 1 |
| BR-040..043 | FR-MAT-*, FR-SCI-* | Material/Scientific | 2-5 |
| BR-050..054 | FR-INV-*, FR-WEIGH-*, FR-PROC-* | Inventory/Procurement | 2 |
| BR-060..063 | FR-FORM-*, FR-DS-* | Formula/Design | 6 |
| BR-070..074 | FR-TRIAL-*, FR-SENS-*, FR-MEM-* | Trials/Sensory | 7 |
| BR-080..082 | FR-PROD-* | Production | 8 |
| BR-090..091 | FR-COM-*, FR-ORD-* | Commerce | 10 |
| BR-100..106 | FR-SCI-*, FR-ML-*, FR-AG-* | Scientific/AI | 3-9 |
| BR-110..113 | FR-DATASET-* | Provenance | 0/4 |

## Test trace convention

Every PR should list requirements.

Example:

```text
Implements: FR-INV-002, FR-INV-006
Tests:
- immutable ledger
- compensating reversal
- cross-tenant movement denied
```

## Requirement evidence state

This release checkpoint uses only four evidence states:

- PASS
- FAIL
- BLOCKED
- NOT_APPLICABLE

Hosted evidence is required before any production gate can be marked PASS.

## Phase 0 evidence (2026-08-08)

| Requirement family | Phase 0 evidence | Status |
|---|---|---|
| FR-PLAT-001..003 | Tenant/actor context contracts and platform boundary | PASS |
| FR-DATASET-* | Dataset, license, version, source and checksum provenance contracts | PASS |
| FR-SCI-005 | Scientific artifact/model/dataset provenance references | PASS |
| FR-AG-* | Agent tool mode, permission, timeout, retry and confirmation contracts | PASS |
| FR-SENS-* / FR-MEM-* | Sentiment and sensory boundary contracts kept separate | PASS |
| Domain event envelope | Versioned event envelope with tenant, actor, correlation and subject | PASS |
| Permission registry | Versioned registry for all V2 permission groups | PASS |
| Contract tests | Shared contract suite executed with Vitest | PASS |

Phase 0 product-module, scientific-engine, provider, remote migration, and production gates are NOT_APPLICABLE to that foundation checkpoint.

## Phase 1 evidence (2026-08-08)

| Requirement family | Phase 1 evidence | Status |
|---|---|---|
| FR-PLAT-001..003 | V2 tenant, membership, role-policy, session, hostname and platform contracts | PASS |
| FR-AUTH-001..010 | V2 opaque session, CSRF, verification, profile and security service boundary | PASS |
| FR-DOM-001..006 | V2 hostname registry, router base-domain contract and Cloudflare adapter boundary | PASS |
| FR-NOTIF-001..004 | V2 notification outbox, delivery worker, retry/backoff and push contracts | PASS |
| FR-PRIV-001..005 | V2 consent, privacy export, workspace export and erasure review boundary | PASS |
| FR-AUTH-011 | V2 member invitation, resend, revoke and acceptance workflow | PASS |
| Phase 1 release gate | `docs/v2/phase-1/PHASE_1_IMPLEMENTATION_REPORT.md` | PASS |

## Phase 2 evidence (2026-08-08)

| Requirement family | Phase 2 evidence | Status |
|---|---|---|
| FR-MAT-001..005 | Tenant-only material aggregate, identity placeholder, identifiers, document reference, compliance, audit and approval gates | PASS |
| FR-SUP-001..002 | Supplier Profile, evidence references, approved Offer and append-only price history | PASS |
| FR-INV-001..006 | Lot records, immutable ledger, reconstructable projection, reservation consumption/expiry, transfer and deterministic FEFO | PASS |
| FR-WEIGH-001..004 | Planned/confirmed weighing session with lot selection, tolerance, reserved consumption and compensating traceability | PASS |
| FR-PROC-001..006 | Request lines/approval, PO/shipment lifecycle, quarantine receipt, inspection hold/review/final decision, return and landed-cost boundary | PASS |
| Tenant isolation/RBAC/idempotency | Disposable PostgreSQL `v2_app` RLS harness and 12-role Playwright matrix | PASS |
| Legacy global catalogue and V1 material paths | Not introduced into V2 Phase 2 | PASS |
| Production deployment, remote migration, external suppliers/documents | No release is authorized for this local phase checkpoint | NOT_APPLICABLE |
