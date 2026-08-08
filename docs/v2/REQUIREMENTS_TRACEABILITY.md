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

- PLANNED
- IMPLEMENTED
- VERIFIED_LOCAL
- VERIFIED_TEST
- VERIFIED_PRODUCTION
- BLOCKED
- DEFERRED

Never label VERIFIED_PRODUCTION without hosted evidence.

## Phase 0 evidence (2026-08-08)

| Requirement family | Phase 0 evidence | Status |
|---|---|---|
| FR-PLAT-001..003 | Tenant/actor context contracts and platform boundary | IMPLEMENTED |
| FR-DATASET-* | Dataset, license, version, source and checksum provenance contracts | IMPLEMENTED |
| FR-SCI-005 | Scientific artifact/model/dataset provenance references | IMPLEMENTED |
| FR-AG-* | Agent tool mode, permission, timeout, retry and confirmation contracts | IMPLEMENTED |
| FR-SENS-* / FR-MEM-* | Sentiment and sensory boundary contracts kept separate | IMPLEMENTED |
| Domain event envelope | Versioned event envelope with tenant, actor, correlation and subject | IMPLEMENTED |
| Permission registry | Versioned registry for all V2 permission groups | VERIFIED_LOCAL |
| Contract tests | Shared contract test suite executed with Vitest | VERIFIED_LOCAL |

Phase 0 does not claim product-module, scientific-engine, provider, remote migration, or production verification. Those items remain PLANNED or DEFERRED until the approved phase that implements them.
