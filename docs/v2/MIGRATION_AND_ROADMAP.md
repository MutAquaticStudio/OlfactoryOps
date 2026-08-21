# Migration & Implementation Roadmap — OlfactoryOps V2

## 1. Historical baseline

Reference:
- Repository: `MutAquaticStudio/OlfactoryOps`
- Branch: `codex/formula-intelligence-hardening`

It is used to recover proven invariants, not V2 scientific data.

## 2. Scope migration matrix

| Area | Decision | V2 action |
|---|---|---|
| Multi-Tenant SaaS | KEEP + HARDEN | preserve concept/tests |
| RBAC / Role Policies | KEEP + HARDEN | permission-first |
| CSRF | KEEP | port/test |
| Opaque Sessions | REBUILD | full hash/rotation/device lifecycle |
| Tenant branding/logo | KEEP | port concept |
| Custom domain | REBUILD | `<slug>.olfactoryops.com` + Cloudflare for SaaS |
| Email verification | KEEP + HARDEN | hash-only token |
| Profile email/password | KEEP + HARDEN | re-auth/revoke |
| Managed billing | KEEP | isolated from lab |
| Push notifications | REBUILD | in-app/email/web push |
| Legal consent/export | REBUILD | Privacy vs Workspace export |
| EN/VI | KEEP | shell localization |
| Observability | REBUILD | Owner-only tenant view |
| PWA | KEEP | privacy-safe caching |
| CSV/XLSX import | PLAN | defer |
| Global Materials | DELETE + REBUILD | empty V2 global data |
| Lluch / 1,986 | DELETE | no migrate |
| Material Compliance | REBUILD | Material facet |
| Supplier Material Profile | REPLACE | Supplier Profile + Offer |
| Formula R&D | DELETE + REBUILD | new domain |
| Inventory Lots | KEEP + REBUILD | ledger/FEFO |
| Movement Ledger | KEEP | immutable |
| Lab Usage Commit | REPLACE | Lab Weighing/Consumption |
| Procurement | KEEP + REBUILD | lab-centric |
| Production | FULL REBUILD | detailed trace |
| Commerce/SKU/Quotes | KEEP OPTIONAL | supplier/service |
| Orders/Fulfillment | KEEP + HARDEN | state separation |
| AI Formula Agent | REBUILD | new tools/science |
| Formula Design Studio | FULL REBUILD | new intelligence flow |
| Reformulation Optimizer | PLAN | defer |
| Trials & Sensory | REBUILD | separate module |
| Private Sensory Memory | KEEP + EXPAND | derived/versioned |
| Operational Lineage | KEEP + EXPAND | include AI provenance |
| Material Evidence RAG | KEEP + REBUILD | controlled evidence |
| External LLM | COMPLETE | real provider gateway |
| Scientific Core | NEW | Osmo adapters + OlfactoryOps extensions |

## 3. Do-not-migrate scientific data

Exclude:
- Lluch Global Master records
- old supplier catalogue scientific dataset
- old Global Material scientific content/features
- legacy Formula R&D by default
- old deterministic Design Studio candidates as training truth

If historical Formula IP must be preserved, create a Legacy Archive Import ADR/mapping.

## 4. Implementation phases

### Phase 0 — Foundation
- V2 repo/package boundaries
- docs under `/docs/v2`
- shared contracts
- permission vocabulary
- event envelope
- ADR process
- CI gates
- third-party manifest
- pinned Osmo refs

### Phase 1 — Platform Security Core
- organizations/users/memberships
- RBAC
- opaque hashed sessions
- CSRF
- email verification
- profile security
- audit
- branding
- `<slug>.olfactoryops.com`
- Cloudflare custom domain
- Owner observability
- EN/VI
- billing skeleton
- notification outbox/push skeleton

### Phase 2 — Material / Supplier / Inventory
- empty Material model
- molecular identity link
- Supplier Profile/Offer
- compliance facet
- documents
- lots
- ledger/reservation/FEFO
- lab weighing
- procurement/receiving/quarantine/landed cost

### Phase 3 — Scientific Structure / Features
- Python scientific framework
- RDKit
- BCFP
- MolFTP
- Osmordred
- feature artifacts/provenance
- async scientific jobs

Exit: reproducibility test on pinned molecules.

### Phase 4 — Model / Dataset Platform
- Dataset Registry
- Osmo Publications policy
- KGCNN
- Transformer-CNN
- Model Registry
- training/evaluation
- prediction contract
- baseline benchmarks

### Phase 5 — Olfactory Intelligence
- fusion/ensemble
- molecular embedding
- odor embedding
- prediction heads
- similarity
- explainability
- uncertainty/calibration
- vector-index versioning

### Phase 6 — Formula / Design Studio
- new Formula domain
- raw/structured brief
- real LLM gateway
- scientific/material/RAG tools
- candidate pipeline
- safe sharing
- save Formula Draft
- approval

### Phase 7 — Trials & Sensory
- Trial lifecycle
- weighing links
- sensory
- evidence
- decisions
- Private Sensory Memory

### Phase 8 — Production
- order/requirements
- allocation
- weighing
- process
- QC
- yield
- release
- finished goods
- traceability

### Phase 9 — Agentic AI Platform
- durable provider loops
- tools/MCP
- confirmations
- cross-module workflows
- quotas
- lineage integration

### Phase 10 — Commerce
- supplier commerce
- SKU
- quote
- order
- reservation
- shipping/fulfillment

### Phase 11 — Deferred
- CSV/XLSX import
- Reformulation Optimizer
- Vexo enterprise DataOps

## 5. Parallel workstreams

Can proceed after Phase 0:
- Platform
- Lab Operations
- Scientific Core
- Data/Model Provenance
- Agent Runtime

Formula/Design integration waits for stable interfaces.

## 6. Migration categories

For existing records classify:
- KEEP
- TRANSFORM
- ARCHIVE
- DELETE

Scientific default = delete/rebuild unless explicit archival business decision.

## 7. Verification per phase

- migration scratch test
- rollback/recovery
- tenant isolation
- permission
- negative states
- performance baseline
- secret scan
- license/provenance
- business acceptance
- release evidence

## 8. First Codex tasks

Do not start with Design Studio.

Start:
1. scaffold service/package boundaries
2. define permissions/events
3. create Osmo component manifest/pinning
4. implement tenant/session boundary
5. implement Material/Molecular Identity contracts
6. scaffold Scientific API + RDKit adapter

## 9. Mandatory legacy removal gate

Before V2 feature implementation is considered clean, execute `PROMPT_REMOVE_LEGACY_FEATURES.md`.

Required outputs:
- `REMOVAL_INVENTORY.md`
- `REMOVAL_REPORT.md`
- `LEGACY_REFERENCE_SCAN.md`

The cleanup must distinguish a fresh V2 migration chain from cleanup of a database that may already have historical migrations applied.
