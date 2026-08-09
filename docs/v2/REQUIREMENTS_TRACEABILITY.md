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

## Phase 3 evidence (2026-08-08)

| Requirement family | Phase 3 evidence | Status |
|---|---|---|
| FR-MAT-003 / FR-SCI-001 | Tenant-scoped molecular identity, canonical SMILES, graph, hash, version and provenance records | PASS |
| FR-SCI-002 | RDKit ECFP artifact persistence and exact component pins | PASS |
| FR-SCI-003 | MolFTP is gated by registered target/data context; missing data returns `NOT_EVALUATED` | PASS |
| FR-SCI-004 | Osmordred descriptor adapter records an artifact boundary, not Material columns | PASS |
| FR-SCI-005 | Versioned job/artifact provenance, pin registry, audit and hash evidence | PASS |
| Native BCFP/MolFTP/Osmordred compatibility image | Exact BCFP/MolFTP primary and isolated Osmordred images built; both native test suites passed and cross-runtime structure hashes matched | PASS |
| Model training, datasets, odor prediction, embeddings, similarity and external LLM | Later phases only | NOT_APPLICABLE |

## Phase 4 evidence (2026-08-08)

| Requirement family | Phase 4 evidence | Status |
|---|---|---|
| FR-DATASET-001..006 | Tenant-scoped dataset, version, license, transformation, artifact and checksum records | PASS |
| FR-ML-001..004 | Model, architecture, feature contract, checkpoint, model card, training/evaluation and metric records | PASS |
| Reproducibility and leakage control | Seeded scaffold/time split and distinct train/validation/test group-set hashes | PASS |
| Upstream model provenance | Immutable KGCNN, Transformer-CNN and Osmo Publications pin records with compatibility/license status | PASS |
| KGCNN compatibility | Pinned source, bounded optimization step, checkpoint reload, inference and metric smoke | PASS |
| Transformer-CNN compatibility | Pinned preprocessing, bounded optimization step, checkpoint reload and inference smoke | PASS |
| Bounded public benchmark pipeline | Licensed compact fixture, group split, leakage check, fusion, evaluation and residual uncertainty | PASS |
| Bulk research dataset import and production serving | Outside the local checkpoint | NOT_APPLICABLE |

## Phase 5 evidence (2026-08-08)

| Requirement family | Phase 5 evidence | Status |
|---|---|---|
| FR-ML-003 / FR-ML-006 | Versioned molecular fingerprint projection with source artifact/manifests, normalization and index version | PASS |
| FR-ML-007 | Exact ECFP/BCFP Tanimoto records identify method, metric and index version | PASS |
| FR-ML-008 | Explainability records retain a non-causal association disclaimer | PASS |
| FR-ML-005 | Odor prediction requests retain model/input/task provenance and an honest evidence state | PASS |
| Bounded odor baseline | Research-only Morgan/SMILES fusion, PCA embedding, Ridge descriptor head and validation residual uncertainty | PASS |
| Production odor serving | No reviewed serving model is registered | NOT_APPLICABLE |

## Phase 5B evidence (2026-08-08)

| Requirement family | Phase 5B evidence | Status |
|---|---|---|
| FR-SENT-001..005 | Tenant-scoped consent-aware source, minimized feedback reference, EN/VI analysis envelope, bounded signals | PASS |
| FR-SENT-006..008 | Versioned preference vector, source-set provenance, aggregate-only projection and permissions | PASS |
| FR-SENT-009..010 | RLS/composite tenant scope and source invalidation propagation | PASS |
| FR-SENT-011..012 | Advisory data boundary only; no Formula/Trial/Material/Inventory/Production mutation | PASS |
| FR-SENT-013..015 | Explicit `NOT_ENOUGH_EVIDENCE`; external NLP/LLM provider remains disabled | PASS |

## Phase 6 evidence (2026-08-08)

| Requirement family | Phase 6 evidence | Status |
|---|---|---|
| FR-FORM-* | Server-authoritative Formula Project/Draft/Version/Review/Provenance, deterministic 100 percent math and immutable approval | PASS |
| FR-DS-* | Raw/structured brief, unresolved constraints, material universe, candidate, recipient-safe sharing and draft handoff | PASS |
| FR-AG-* | Durable read-only run/job/event/tool/artifact path, lease fencing, replay, confirmation expiry/retry/cancellation and provider-disabled projection | PASS |
| FR-RAG-* | Approved-source material evidence indexing and bounded tenant-scoped citation retrieval | PASS |
| Provider live smoke | No server-side test credential is configured | BLOCKED |
| Remote migration and production deploy | Local checkpoint only | NOT_APPLICABLE |

## Phase 7 evidence (2026-08-09)

| Requirement family | Phase 7 implementation surface | Status |
|---|---|---|
| FR-TRIAL-* | Trial source/version/release/preparation, multi-sample, evidence/decision, Formula snapshot and deterministic Phase 2 weighing bridge; disposable RLS workflow | PASS |
| FR-SENS-* | Versioned form, session/panel/sample assignment, blinded evaluation, controlled unblind, panelist `/assignments/me` and public scorecard idempotency; disposable RLS workflow | PASS |
| FR-MEM-* | Tenant-private versioned sensory memory, source-set provenance and minimum independent-evidence threshold; disposable RLS workflow | PASS |
| Tenant isolation, redaction and public access | Forced RLS, composite tenant FKs, Brand Trial-detail denial, panelist `trials.viewAssigned` scope, operational `trials.viewAll` scope, token-hash `SECURITY DEFINER` resolver, public submission idempotency and revoke/expiry/count guard; migration/RLS checks | PASS |
| Phase 7 local release gate | Contract/regression, lint/build, migration/RLS, client secret/dependency scans and independent 12-role browser matrix | PASS |
| Remote migration and production deployment | Outside this local documentation update | NOT_APPLICABLE |

## Phase 8 evidence (2026-08-09)

| Requirement family | Phase 8 evidence boundary | Status |
|---|---|---|
| BR-080 / FR-PROD-001..004 | Approved Formula Version snapshot, reservation-backed requirements/allocation/weighing/usage, controlled correction boundary, and four-stage process state machine with hold/rework routes; focused suite plus disposable RLS workflow | PASS |
| FR-PROD-005 | Active QC specification, latest-revision QC result approval, deviation/CAPA resolution, active pre-release document evidence, and deterministic release gate; focused suite plus disposable RLS workflow | PASS |
| FR-PROD-006..007 | Reconciled yield, controlled rework, release revision, separate finished-good lot, and append-only finished-good ledger with full-lot quality hold and re-release; disposable RLS workflow | PASS |
| Post-release `CONTINUE` and `REJECT` dispositions | Guarded source defines `QUALITY_RELEASE` and held-lot `WASTE` ledger paths with deviation evidence, but no separate focused integration result is supplied | BLOCKED |
| FR-PROD-008, raw-to-finished-good segment | Formula/raw lot/usage/process/QC/deviation/evidence/yield/release/finished-good/active-document genealogy; dual-capability genealogy authorization | PASS |
| BR-081, downstream Order/Shipment segment | Phase 10 owns `finished_good_lot -> sales reservation -> fulfillment -> sales shipment -> return` traceability edges. It does not reuse raw inventory or inbound `v2_shipments` records | PASS |
| BR-082 and Phase 8 authorization | Server-authoritative release requires a human principal holding `production.release` and `production.qc.approve` (Owner/Admin by default); 12 isolated role browser matrix covers mutation and genealogy boundaries | PASS |
| Tenant isolation at persistence layer | Forced RLS on all 19 P8 tenant tables, 51 composite tenant foreign keys, legacy policy backfill, and cross-tenant production/finished-good denial on disposable PostgreSQL | PASS |
| Phase 8 local release gate | Focused 28-test suite, `typecheck:v2`, API/frontend builds, migration verifier, RLS workflow, and 12-role browser matrix | PASS |
| Remote migration and production deployment | No remote database or deployment is in this local checkpoint | NOT_APPLICABLE |

Trong bang nay, `BLOCKED` nghia la chua co bang chung command runtime dinh kem,
khong phai la ket luan implementation that bai. Chi doi sang `PASS` sau khi
gate tuong ung chay thanh cong tren source/migration hien tai.

## Phase 9 evidence (2026-08-10)

| Requirement family | Phase 9 evidence boundary | Status |
|---|---|---|
| FR-AG-001..002 | Versioned contracts, published active snapshots, durable run/node/message evidence, and disposable persistence checks | PASS |
| FR-AG-003..005 | Typed allow-listed adapters, route/domain authorization, idempotency, and tool invocation controls | PASS |
| FR-AG-006 | Confirmation-required Formula Draft mutation: fenced durable effect claim, Formula-origin unique-draft invariant, invalid candidate/project terminal handling with quota release, and cancel/approve race outcomes verified on disposable PostgreSQL | PASS |
| FR-AG-007..008 | Server-only provider gateway, bounded structured artifacts, metadata redaction, and no raw prompts/reasoning/secrets | PASS |
| FR-AG-009..010 | Persisted event replay, sequence validation/deduplication, REST/SSE resynchronization, lease fencing, quota reservation, cancellation, and bounded retry | PASS |
| FR-AG-011 | Governed non-generic boundary; no generic SQL, database write, shell, URL, HTTP, MCP, or unregistered-tool path bypasses a domain service | PASS |
| Focused Phase 9 contract, controller, client, and runtime tests | 15 test files and 62 tests passed | PASS |
| Service/package typecheck and disposable PostgreSQL migration/RLS gates | `typecheck:v2`, `v2:postgres:verify`, and `v2:postgres:rls` passed | PASS |
| Phase 9 confirmation-saga effect claim, unique draft, invalid-input recovery, and cancel/approve race acceptance | Cancel-first leaves no Formula draft; staged approval blocks cancel and then completes, verified on disposable PostgreSQL | PASS |
| Credential-backed outbound provider completion and usage | Default provider state is `NOT_CONFIGURED`; no credential-backed outbound provider adapter is enabled | BLOCKED |
| Commerce-backed order status result | Phase 10 `commerce.status` reuses tenant-scoped `CommerceService.listOrders` with a bounded redacted projection; focused adapter and role-browser execution pass | PASS |
| Authenticated browser Commerce-Agent route | `test:v2:role-e2e` creates and executes the Owner read-only Commerce run under an isolated cookie-authenticated fixture | PASS |
| Remote migration and production deployment | Outside this local documentation checkpoint | NOT_APPLICABLE |

## Phase 10 evidence (2026-08-10)

| Requirement family | Phase 10 evidence boundary | Status |
|---|---|---|
| BR-090 / FR-COM-* | Tenant-scoped customers, contacts, addresses, SKUs, prices, quote versions, customer-safe documents, audit, and disclosure projection | PASS |
| BR-091 / FR-ORD-* | Order lifecycle, dedicated finished-good reservation, FEFO allocation, partial fulfillment, shipment status, cancellation, and closure | PASS |
| Return custody and disposition | Authorized and partial receipt, immutable receipt, shipped-lot quantity check, append-only `RETURN -> QUARANTINE` ledger, required `RETURN_QC` evidence, Quality hold/waste/release decisions, and no automatic restock | PASS |
| Cost and sensitive evidence | Server-side cost/margin, Formula, finished-good, document, and traceability permission projections | PASS |
| Cross-module production traceability | Released finished-good lot -> sales reservation -> fulfillment -> shipment -> return, without raw inventory/inbound shipment reuse | PASS |
| Tenant isolation/RBAC/idempotency | Forced RLS, composite tenant foreign keys, operation idempotency, cross-tenant denial, and independent 12-role browser matrix | PASS |
| Live carrier integration | Provider-neutral carrier/service/tracking boundary only; no configured test credential | BLOCKED |
| Remote migration and production deployment | No remote target or deployment is part of this local checkpoint | NOT_APPLICABLE |
