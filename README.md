# OlfactoryOps V2 — System Documentation Pack

**Status:** Scope Lock V0.4
**Generated:** 2026-08-07
**Current-system reference:** `MutAquaticStudio/OlfactoryOps` → `codex/formula-intelligence-hardening`
**Target:** Clean rebuild of OlfactoryOps V2, preserving selected platform/domain invariants while replacing legacy scientific/formula logic.

## V2 Phase 0 status

Phase 0 is the transition foundation only: shared contracts, permission registry, domain-event envelope, provenance vocabulary, scientific/sentiment/agent boundaries, architecture decisions, and the PostgreSQL plan. It does not activate V2 product modules, scientific engines, external LLM providers, or production deployment.

The frozen legacy baseline remains release candidate `0.1.0-rc.1` with migration head `0044`; historical migrations are unchanged and no production release is performed in this checkpoint.

Read the source pack in [`docs/v2/README.md`](docs/v2/README.md), then [`docs/v2/PHASE_0_BASELINE.md`](docs/v2/PHASE_0_BASELINE.md) and [`docs/v2/PHASE_0_IMPLEMENTATION_REPORT.md`](docs/v2/PHASE_0_IMPLEMENTATION_REPORT.md). Run the shared contract checks with `npm.cmd test` and `npm.cmd run typecheck:v2`.

## Cloudflare runtime checkpoint

`main` keeps PostgreSQL as V2
source-of-truth and adds an isolated Cloudflare Worker runtime for Hyperdrive,
private R2 artifacts, the approved Material Evidence Vectorize space, Queue/Workflow job
delivery, and private scientific Containers. Routine `npm.cmd run dev`, test,
typecheck and build commands do not require Docker.

`npm.cmd run build:cloud-runtime` bundles the Worker from a deliberately
non-deployable staging template. Render a staging-only configuration with
`npm.cmd run cloud-runtime:render-staging` only after providing an approved
staging Hyperdrive UUID and immutable scientific image digests. Remote build and
staging status remain `BLOCKED` until those external resources and GitHub
Cloudflare secrets are configured; no production deployment is performed from
this checkpoint. See [`docs/v2/CLOUDFLARE_CLOUD_NATIVE_ARCHITECTURE.md`](docs/v2/CLOUDFLARE_CLOUD_NATIVE_ARCHITECTURE.md).

## Trang thai V2 Phase 2

Phase 2 Lab Operations da `PASS` tren branch `codex/v2-phase2-lab-operations` voi PostgreSQL disposable. PostgreSQL la source of truth cho Material tenant-private, Supplier Profile/Offer, document reference, price history, lot inventory, immutable ledger, FEFO, Lab Weighing, reservation, procurement request/PO/shipment, quarantine, inspection, return va landed cost. V2 khong import Lluch, Global Master Materials hay legacy Formula R&D. Tai lieu va evidence nam trong [`docs/v2/phase-2`](docs/v2/phase-2/). Production deploy va remote migration van `NOT_APPLICABLE` cho checkpoint local nay.

## Trang thai V2 Phase 3

Phase 3 Scientific Structure / Features da `PASS` tren branch
`codex/v2-phase3-scientific-features`. Phase nay them scientific job/artifact
tenant-scoped, RDKit canonical structure/ECFP va provenance pin chinh xac cho
BCFP, MolFTP, Osmordred. BCFP/MolFTP chay trong runtime RDKit 2026; Osmordred
chay trong runtime RDKit 2023.09.3 tach biet va chi duoc ket hop khi
structure hash trung khop. PostgreSQL/RLS, native compatibility, 12-role E2E,
public UX va static gate deu `PASS` tren ha tang disposable local. Xem bao cao
tai [`docs/v2/phase-3/PHASE_3_IMPLEMENTATION_REPORT.md`](docs/v2/phase-3/PHASE_3_IMPLEMENTATION_REPORT.md).

## Trang thai V2 Phase 4

Phase 4 Model va Dataset Platform da `PASS` tren branch
`codex/v2-phase4-model-dataset-platform`. Phase nay them registry PostgreSQL
tenant-scoped cho dataset, dataset version, license, transformation, artifact,
model, model version, feature contract, checkpoint, training run, evaluation
va metric. Moi dataset version can checksum, citation, license evidence va
provenance; split train/validation/test phai co seed va group hash rieng de
chan data leakage. KGCNN va Transformer-CNN deu co bounded training,
checkpoint round-trip va inference trong Docker compatibility runtime. Pipeline
benchmark compact co group split, leakage guard, feature fusion va uncertainty
tu residual validation; no van la research-only, khong phuc vu model, khong
goi LLM va khong deploy production. Xem
[`docs/v2/phase-4`](docs/v2/phase-4/) de xem boundary va evidence.

## Trang thai V2 Phase 5

Phase 5 Olfactory Intelligence da `PASS` tren branch
`codex/v2-phase5-olfactory-intelligence`, voi PostgreSQL disposable. He thong them
molecular embedding duoc trace tu ECFP/BCFP artifact, similarity Tanimoto co
method/metric/index version va explainability record luon kem canh bao khong
phai bang chung nhan qua. Baseline research-only cho odor embedding,
prediction, feature fusion va residual uncertainty duoc test trong model
runtime; no khong phai production serving hay compliance decision. Xem evidence
tai [`docs/v2/phase-5`](docs/v2/phase-5/).

## Trang thai V2 Phase 5B

Phase 5B Consumer Intelligence da `PASS` tren PostgreSQL disposable. Du lieu
feedback chi luu hash va private reference, khong luu raw text trong V2. Ket qua
phan tich co evidence status, preference vector tach rieng theo tenant/source
va can it nhat ba analysis hop le; neu thieu bang chung he thong tra
`NOT_ENOUGH_EVIDENCE`. Huy consent/source se invalidate cac analysis/vector lien
quan. Khong co NLP/LLM provider, cross-tenant learning hay tu dong sua cong thuc.
Xem [`docs/v2/phase-5b`](docs/v2/phase-5b/).

## Trang thai V2 Phase 6

Phase 6 Formula/Design Studio da `PASS` tren PostgreSQL disposable. Formula
math va approval deu server-authoritative; Design Studio co raw/structured
brief, constraint/universe snapshot, advisory candidate, safe sharing, RAG
citation va agent run durable. Agent confirmation co expiry, retry gioi han va
lease fencing; agent van chi doc, khong tu tao Formula Draft hay dong kho. LLM
provider dang `NOT_CONFIGURED`, khong co ket qua gia. Xem
[`docs/v2/phase-6`](docs/v2/phase-6/).

## Trang thai V2 Phase 7

Phase 7 Trials, Sensory Sessions va Private Sensory Memory da co source V2 cho
Trial version/release, Lab Weighing lien ket immutable inventory ledger,
sensory form/session/scorecard, public link token-hash va private memory co
nguong evidence. `npm.cmd run v2:postgres:verify` va
`npm.cmd run v2:postgres:rls`, unit/regression, lint/build, secret/dependency
scan va browser E2E 12 role da `PASS` tren disposable loopback PostgreSQL.
Panelist chi thay blind assignment cua minh; operational reader moi co broad
Trial read. `PHASE_7_READY = YES` cho checkpoint local. Xem [`docs/v2/phase-7`](docs/v2/phase-7/) va
[`PHASE_7_IMPLEMENTATION_REPORT.md`](docs/v2/phase-7/PHASE_7_IMPLEMENTATION_REPORT.md).

## Phase 8 status

Phase 8 Production Manufacturing has a repository-local acceptance result of
`PASS`: the focused production suite has 28 passing tests, `typecheck:v2`, API
and frontend builds, the disposable PostgreSQL migration verifier, the
application-role RLS workflow, and the isolated 12-role browser matrix all
pass on the current tree. The boundary covers approved Formula snapshots,
reservation-backed raw weighing/usage, controlled processing/QC,
deviation/CAPA, yield/rework, release, finished-good lots and ledger,
genealogy, and controlled documents.

Finished goods use a separate Phase 8 lot and append-only ledger boundary, not
raw inventory movements, raw inventory reservations, or shipments.
Migrations `0012` through `0014` establish 19 forced-RLS P8 tables and 51
composite tenant foreign keys. Release evaluates `production.release` and
`production.qc.approve`; current default policies grant both only to Owner/Admin.
It also requires the latest passed required QC revision and active pre-release
document evidence. Lab Manager may plan, execute, approve QC, manage deviations,
cancel, and close, but cannot release a finished-good lot under the default
policy. A released lot can only enter hold through the documented, full-lot
finished-good ledger workflow. Phase 10 now owns the downstream
Order/Shipment segment through its separate Commerce traceability boundary.

Remote migration and production deployment are `NOT_APPLICABLE`: no remote
database or deployment was attempted. See [`docs/v2/phase-8`](docs/v2/phase-8/)
and [`PHASE_8_IMPLEMENTATION_REPORT.md`](docs/v2/phase-8/PHASE_8_IMPLEMENTATION_REPORT.md).

## Trang thai V2 Phase 9

Phase 9 Agent Runtime co governed boundary cho agent definition/workflow/tool/
policy versioned theo tenant, durable run/node/message/tool/confirmation,
provider usage, evaluation va lineage evidence. Snapshot active chi duoc phep
tro toi ban `PUBLISHED`; version snapshot va evidence P9 duoc chi dinh la
append-only, con run node, confirmation/effect va quota reservation co
lifecycle update duoc kiem soat. Bang Phase 9 deu forced RLS. Tool la typed
adapter duoc dang ky, co schema, permission, timeout/retry va audit; khong co
generic SQL, database write, shell, URL, HTTP hay MCP tool vuot qua domain
service.

Persisted event sequence la source of truth. REST replay endpoint va SSE stream
chi replay du lieu da luu; gap sequence hoac replay window exhausted se yeu cau
resync tu persisted state. Run route la `/api/v1/v2/agent-runs`; catalog,
evaluation va observability route la `/api/v1/v2/agent-runtime`. Provider
gateway server-only mac dinh `NOT_CONFIGURED`, khong outbound call; runtime co
the luu status trung thuc nay nhung khong tao completion, token/cost hay
artifact gia. Phase 10 da ket noi `commerce.status` vao CommerceService
tenant-scoped va chi tra projection trang thai don hang gioi han, khong mo
quyen ghi cho agent.

Focused Phase 9 contract/controller/client tests, service/package typecheck va
PostgreSQL migration/RLS disposable deu `PASS`. Disposable confirmation checks
da verify fenced effect claim, Formula-origin unique-draft invariant, va
invalid candidate/project terminal handling kem quota release; Phase 9 local
acceptance la `PASS`. Credential-backed provider van `BLOCKED`. Phase 10 da
co Commerce-backed result va isolated browser evidence. Remote migration va
production deployment la `NOT_APPLICABLE`. Xem
[`docs/v2/phase-9`](docs/v2/phase-9/).

## Trang thai V2 Phase 10

Phase 10 Commerce / Orders / Fulfillment da `PASS` cho local checkpoint.
Domain nay co customer, SKU, quote version, sales order, reservation tren
finished-good lot da release, fulfillment tung phan, shipment metadata,
cancel, return, customer-safe document va traceability. Return receipt la
immutable evidence va luon ghi `RETURN -> QUARANTINE`. Return nhan mot phan
van o `AUTHORIZED`; khi nhan du thi can `RETURN_QC` evidence va quyen Quality
tach biet de hold, reject-to-waste, hoac release co kiem soat ve available.
Commerce khong tu dong restock hang tra ve. PostgreSQL RLS workflow va ma
tran browser 12 role da `PASS`. Live shipping provider la `BLOCKED`; remote
migration va production deployment la `NOT_APPLICABLE`. Xem
[`docs/v2/phase-10`](docs/v2/phase-10/).

## Purpose

This pack is the implementation source package for Codex and engineering review. It contains:

- `CODEX.md` — primary implementation contract
- `BRS.md` — Business Requirements Specification
- `BRD.md` — Business Requirements Document
- `SRS.md` — Software Requirements Specification
- `ARCHITECTURE.md`
- `DIAGRAMS.md`
- `DATA_ARCHITECTURE.md`
- `SERVICE_ARCHITECTURE.md`
- `SECURITY_PRIVACY.md`
- `OSMO_ADOPTION_AND_PROVENANCE.md`
- `MIGRATION_AND_ROADMAP.md`
- `REQUIREMENTS_TRACEABILITY.md`
- machine-readable manifests and Mermaid `.mmd` diagrams

## Non-negotiable direction

OlfactoryOps V2 has three product domains:

1. **Platform / SaaS Core**
2. **Lab Operations**
3. **AI Intelligence**

Scientific AI is a dedicated service layer. The legacy Formula R&D and old Global Material scientific data are not the scientific source of truth for V2.

## Osmo-first Scientific Core

The V2 scientific implementation MUST begin from the approved Osmo open-source components and extend them behind OlfactoryOps-owned adapters:

| Osmo repository | V2 role |
|---|---|
| `osmoai/bcfp` | ECFP/BCFP molecular fingerprints |
| `osmoai/molftp` | fragment-target prevalence features / explainability |
| `osmoai/osmordred` | dense molecular descriptors |
| `osmoai/kgcnn-keras-unlocked` | 2D/3D GNN research/model backbone |
| `osmoai/transformer-CNN` | SMILES Transformer-CNN model path |
| `osmoai/publications` | research code + licensed datasets / benchmarking |
| `osmoai/vexo` | optional chemistry DataOps / BigQuery / Sheets connector |
| `osmoai/genai-toolbox` | MCP/database tool infrastructure |
| `osmoai/rdkit-pypi` | RDKit wheel/build reference; upstream runtime license separately audited |

**Not in scope:** `osmoai/taxonomy`. V2 must not introduce an ODbL dependency unless a future approved architecture decision reopens it.

## Workspace domain convention

Every workspace receives:

`<workspace-slug>.olfactoryops.com`

Example:

`abc.olfactoryops.com`

A workspace may later attach a customer-owned hostname through Cloudflare for SaaS after hostname validation/DCV and SSL activation.

## Source precedence

1. `CODEX.md`
2. `SRS.md`
3. `BRD.md`
4. `BRS.md`
5. Architecture/Data/Service documents
6. `OSMO_ADOPTION_AND_PROVENANCE.md`
7. `MIGRATION_AND_ROADMAP.md`
8. historical implementation in `codex/formula-intelligence-hardening`

Historical code is reference material, not permission to carry legacy scientific data or Formula R&D logic into V2.

## Legacy removal prompt

Before implementing V2 on top of the historical repository, run [`PROMPT_REMOVE_LEGACY_FEATURES.md`](PROMPT_REMOVE_LEGACY_FEATURES.md). It performs end-to-end cleanup rather than merely hiding deprecated features.

## V2 Phase 1 status

The Platform Security Core is isolated under `/v2/*` on branch `codex/v2-phase1-platform-security`. It uses PostgreSQL for V2 identity, tenant, session, domain, billing-capability, notification, consent, export, audit, and observability records. V1 routes and D1 migrations `0001-0044` remain unchanged.

Phase 1 is not production-deployed. The local transition checkpoint is now `PHASE_1_READY = YES`; the release report is [`docs/v2/phase-1/PHASE_1_IMPLEMENTATION_REPORT.md`](docs/v2/phase-1/PHASE_1_IMPLEMENTATION_REPORT.md), with the authenticated matrix in [`ROLE_E2E_MATRIX.md`](docs/v2/phase-1/ROLE_E2E_MATRIX.md). The PostgreSQL/RLS gate runs only against a resettable loopback test database and verifies a `v2_app` role without `BYPASSRLS`; production deployment remains out of scope.

## Trạng thái V2 Phase 1 (tiếng Việt)

Phase 1 Platform Security Core đang chạy trên branch `codex/v2-phase1-platform-security`, tách biệt dưới các route `/v2/*`. PostgreSQL là nguồn ghi dữ liệu duy nhất của V2; V1 và các migration D1 `0001–0044` được giữ nguyên. Signup tạo workspace, Owner membership, role policies, hostname mặc định, managed-beta billing state, session opaque và bản ghi xác minh email trong transaction.

Các lớp đã kiểm chứng `PASS`: Prisma schema/migration disposable, RLS với role `v2_app` không có `BYPASSRLS` trên database loopback có thể reset, tenant isolation, CSRF/Origin, session rotation/revoke, credential re-auth, hostname matching, append-only audit, member invitation, notification retry/outbox, ma trận E2E độc lập cho 12 role, build/lint/test, secret scan và dependency audit. `NOT_APPLICABLE`: migration từ xa, DNS/Cloudflare SaaS và production deploy trong checkpoint này.

`PHASE_1_READY = YES` cho checkpoint local/disposable. Chi tiết, lệnh kiểm thử và giới hạn môi trường nằm trong [`docs/v2/phase-1/PHASE_1_IMPLEMENTATION_REPORT.md`](docs/v2/phase-1/PHASE_1_IMPLEMENTATION_REPORT.md). Không deploy production và không bắt đầu Phase 2 trong checkpoint này.
