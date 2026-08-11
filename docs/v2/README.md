# OlfactoryOps V2 source of truth

This directory contains the Scope Lock V0.4 documents and the Phase 0 architecture contracts. Historical material, formula, and AI implementations remain under `docs/legacy/v1/**` and `archive/legacy-v1/**`.

Phase 0 defines boundaries, contracts, provenance, and verification only. No V2 product module, scientific engine, global material dataset, sentiment model, external LLM, or production migration is active.

Primary reading order:

1. `CODEX.md` (repository implementation contract)
2. `SRS.md`
3. `BRD.md`
4. `BRS.md`
5. `ARCHITECTURE.md`
6. `DATA_ARCHITECTURE.md`
7. `SERVICE_ARCHITECTURE.md`
8. `SECURITY_PRIVACY.md`
9. `SENTIMENT_CONSUMER_INTELLIGENCE.md`
10. `OSMO_ADOPTION_AND_PROVENANCE.md`
11. `MIGRATION_AND_ROADMAP.md`
12. `REQUIREMENTS_TRACEABILITY.md`
13. `manifests/scope-lock.yaml`
14. `manifests/osmo-components.yaml`

Phase 0 outputs are tracked in `PHASE_0_BASELINE.md`, `PHASE_0_ARCHITECTURE_MAP.md`, `PHASE_0_IMPLEMENTATION_REPORT.md`, `OSMO_COMPONENT_REGISTRY.md`, `V2_DATABASE_PLAN.md`, and `adr/`.

Phase 1 Platform Security Core is implemented on `codex/v2-phase1-platform-security` under `phase-1/`. It uses isolated `/v2/*` routes and PostgreSQL as the V2 source of truth. Current verdict: `PHASE_1_READY = YES`.

Static/build/schema/RLS gates, the authenticated 12-role matrix, member invitation workflow, and notification retry worker are `PASS` on disposable infrastructure. Cloudflare provisioning, remote migrations, and production deployment are `NOT_APPLICABLE` for this checkpoint. See `phase-1/PHASE_1_IMPLEMENTATION_REPORT.md` and `phase-1/ROLE_E2E_MATRIX.md` for evidence.

## Cloud-native runtime checkpoint

The Cloudflare runtime branch adds `worker/cloud-runtime/**`: Hyperdrive-backed
Prisma connectivity, private R2 artifact storage, the approved BGE-M3 1024D
Material Evidence Vectorize space, idempotent Queue-to-Workflow dispatch, and
private scientific Container Durable Objects. `wrangler.v2-cloud-runtime.example.toml` is a dry-run-only template;
the renderer refuses to create a staging configuration without a real approved
Hyperdrive UUID and immutable image digests. Local Docker remains manual-only.

Repository-local binding and build checks are `PASS`. The isolated staging R2,
Material Evidence Vectorize index, and scientific/RAG/notification queues are
`PASS`. Remote PostgreSQL/Hyperdrive, deployed Worker/Pages routing, remote
scientific digest evidence, and staging smoke are `BLOCKED`; production
deployment is `NOT_APPLICABLE`.

## Phase 2 status

Phase 2 Lab Operations is `PASS` on `codex/v2-phase2-lab-operations` using disposable PostgreSQL verification. The V2 source of truth remains PostgreSQL. The additive migration creates tenant-only Materials, Supplier Profiles/Offers, lots, immutable movements, reservations, Lab Weighing sessions, request/PO/shipment lifecycle, receipt/inspection/return and landed-cost records. V2 does not import Lluch, Global Master Materials, or legacy scientific assumptions. See `phase-2/` for domain documentation and checkpoint evidence.

## Phase 3 status

Phase 3 Scientific Structure / Features is `PASS` on
`codex/v2-phase3-scientific-features`. It adds tenant-scoped scientific
jobs/artifacts and exact RDKit, BCFP, MolFTP, and Osmordred provenance.
BCFP/MolFTP run in a pinned RDKit 2026 runtime; Osmordred runs in a separate
pinned RDKit 2023.09.3 runtime and is combined only after structure-hash
verification. PostgreSQL/RLS, native compatibility, 12-role E2E, public UX,
and static gates passed on disposable local infrastructure. See
`phase-3/PHASE_3_IMPLEMENTATION_REPORT.md`.

## Phase 4 status

Phase 4 Model and Dataset Platform is `PASS` on
`codex/v2-phase4-model-dataset-platform`. It adds tenant-scoped dataset/model
provenance, reproducible split and evaluation evidence, model cards, pinned
KGCNN/Transformer-CNN/Osmo Publications references, and a non-serving runtime
compatibility image. No bulk dataset, prediction endpoint, embedding, external
LLM, or production deployment is part of this checkpoint. See `phase-4/`.

## Phase 5 status

Phase 5 Olfactory Intelligence is `PASS` on
`codex/v2-phase5-olfactory-intelligence` using disposable PostgreSQL
verification. It adds
tenant-private molecular fingerprint projections, versioned Tanimoto
similarity, feature-based explainability records and full prediction
provenance. It deliberately returns `NOT_EVALUATED` for odor predictions and
odor embeddings until reviewed odor-labelled data, model evaluation and
calibration exist. See `phase-5/`.

## Phase 5B status

Phase 5B Consumer Intelligence is `PASS` on disposable PostgreSQL. It stores
only consent-aware feedback hashes/private references and bounded derived
signals, separates aggregate from raw-content access, and invalidates dependent
evidence when a source is withdrawn. No NLP provider, cross-tenant learning,
or automatic Formula change is active. See `phase-5b/`.

## Phase 6 status

Phase 6 Formula/Design Studio is `PASS` on disposable PostgreSQL. It provides
server-authoritative formula math, drafts, immutable approval, reviewed design
briefs, pinned material universes, advisory candidates, recipient-safe shares,
bounded evidence retrieval and durable research runs. Agent confirmation is
durable, expires safely, can retry only within its ceiling and is lease-fenced;
it remains read-only. The server-only LLM gateway truthfully reports
`NOT_CONFIGURED`; no provider completion is faked. See `phase-6/`.

## Trang thai Phase 7

Phase 7 Trials, Sensory Sessions va Private Sensory Memory co migration,
contract, service va controller V2 trong working tree. Tai lieu Phase 7 ghi
ro Trial/sensory state machine, Phase 2 immutable-ledger integration, tenant
RLS, redaction, token-scoped public scorecard link va private-memory threshold.
`v2:postgres:verify`, `v2:postgres:rls`, contract/regression, lint/build,
secret/dependency scan va ma tran browser 12 role deu `PASS` tren disposable
loopback PostgreSQL. Panelist chi co assignment-scoped blind access qua
`trials.viewAssigned`; operational readers dung `trials.viewAll`. Xem
`phase-7/` va `phase-7/PHASE_7_IMPLEMENTATION_REPORT.md`.

## Phase 8 status

Phase 8 Production Manufacturing is `PASS` for the local repository checkpoint.
The focused production suite has 28 passing tests; `typecheck:v2`, API and
frontend builds, the disposable PostgreSQL migration verifier, the
application-role RLS workflow, and the 12-role browser matrix also pass on the
current source. The database chain now includes `0012` through `0014` for
production, QC/release revisions, and post-release finished-good hold/rework.

Raw material remains in the Phase 2 inventory reservation/movement ledger.
Finished-good lots and their append-only ledger are separate Phase 8 records
and do not use `v2_inventory_*` or `v2_shipments` as a finished-good ledger.
Migrations `0012` through `0014` cover all 19 P8 tenant tables with forced RLS
and 51 composite tenant foreign keys. Release evaluates `production.release`
and `production.qc.approve`; current default policies grant both only to
Owner/Admin. It also requires the latest required QC revisions to pass and
active pre-release document evidence; generated release documents do not
substitute for that gate. Lab Manager can perform the operational and
QC/deviation work but cannot release under the default policy.

The production genealogy covers raw inputs through finished goods, controlled
deviation evidence, and active document snapshots. It requires both
finished-good and document-view permissions. Phase 10 now owns the downstream
Order/Shipment segment through a separate commerce traceability boundary;
neither Phase 8 nor Phase 10 reuses raw inventory or inbound shipment records.
Remote migration and production deployment are `NOT_APPLICABLE` for this local
checkpoint. See `phase-8/` and `phase-10/`.

## Phase 9 status

Phase 9 documents the active governed Agent Runtime: tenant-scoped versioned
definitions, workflows, tools and policies; durable run/node/message/tool,
confirmation, provider-usage, evaluation and lineage evidence; forced RLS;
and published-only active snapshots. Version snapshots and designated P9
evidence are immutable, while run nodes, confirmations/effects, and quota
reservations use controlled lifecycle updates. Agent tools are registered,
typed, permission-bound domain adapters rather than generic SQL, shell, URL,
HTTP, or MCP access. Persisted event sequences remain the source of truth; the
REST replay endpoint and SSE stream replay them and require a persisted-state
resync on a gap.

Run routes are under `/api/v1/v2/agent-runs`; catalog, evaluation, and
observability routes are under `/api/v1/v2/agent-runtime`. The server-only
provider gateway makes no outbound call by default and returns
`NOT_CONFIGURED`; the runtime may persist that truthful status but cannot
fabricate a completion, token/cost totals, or artifact. Phase 10 supplies the
read-only Commerce adapter through `CommerceService`, which returns only a
bounded tenant-scoped order-status projection.

Focused Phase 9 contract/controller/client tests, service/package typecheck,
and disposable PostgreSQL migration/RLS gates are `PASS`. The disposable
confirmation checks verify the fenced effect claim, Formula-origin unique-draft
invariant, and invalid candidate/project terminal handling with quota release;
the repository-local Phase 9 acceptance is `PASS`. The Phase 10 Commerce
adapter has focused projection tests and participates in the authenticated
role-browser flow. Credential-backed provider execution remains `BLOCKED`.
Remote migration and production deployment are `NOT_APPLICABLE`. See
`phase-9/` and `phase-10/`.

## Phase 10 status

Phase 10 Commerce / Orders / Fulfillment is `PASS` for the local repository
checkpoint. It provides tenant-scoped customers, SKUs, quote versions, sales
orders, released finished-good reservation, partial fulfillment, shipment
metadata, cancellation, evidence-backed return disposition, customer-safe
documents, and commercial traceability. `v2_sales_return_receipts` are
immutable physical custody evidence, and every receipt creates a
finished-good `RETURN -> QUARANTINE` ledger movement. A return remains
`AUTHORIZED` while partially received, then requires `RETURN_QC` evidence and
separate Quality authorization for hold, waste, or controlled release back to
available stock. The disposable migration/RLS workflow and the independent
12-role browser matrix pass. A live shipping carrier is
`BLOCKED`; remote migration and production deployment are `NOT_APPLICABLE`.
See `phase-10/`.
