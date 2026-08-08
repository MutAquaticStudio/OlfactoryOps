# CODEX.md — OlfactoryOps V2 Engineering Contract

This file is the primary implementation contract for Codex.

## 0. Operating rule

**Do not extend the old product by accretion. Build V2 as a clean modular system.**

Use `codex/formula-intelligence-hardening` to recover proven invariants:

- tenant scoping
- RBAC / capability gates
- CSRF
- durable/idempotent mutations
- append-only audit behavior
- safe recipient projections
- durable agent runs/events/jobs
- human confirmation before privileged AI writes
- inventory ledger concepts
- FEFO
- Trial/Sensory separation
- operational lineage

Do **not** automatically migrate old:

- Global Material data
- Lluch catalogue / 1,986 Global Master records
- legacy Formula R&D data/logic
- deterministic Design Studio formula-generation assumptions
- old generated scientific scoring assumptions

## 1. Required logical structure

```text
apps/
  web/
  api/

services/
  platform/
  lab-ops/
  formula/
  trials-sensory/
  lineage/
  rag/
  agent-runtime/
  scientific/
    structure/
    features/
    models/
    embedding/
    prediction/
    similarity/
    explainability/

packages/
  contracts/
  permissions/
  domain-events/
  provenance/
  ui/

infra/
  cloudflare/
  postgres/
  object-storage/
  vector/
  queues/
```

Equivalent physical structure is acceptable only if logical boundaries remain intact.

## 2. Mandatory Osmo adapters

```text
Scientific API
   |
   +-- StructureAdapter
   |     +-- RDKit
   |
   +-- FingerprintAdapter
   |     +-- osmoai/bcfp
   |
   +-- FragmentFeatureAdapter
   |     +-- osmoai/molftp
   |
   +-- DescriptorAdapter
   |     +-- osmoai/osmordred
   |
   +-- GraphModelAdapter
   |     +-- osmoai/kgcnn-keras-unlocked
   |
   +-- SmilesModelAdapter
         +-- osmoai/transformer-CNN
```

React, inventory, production, Formula, or tenant code must never import those repositories directly.

OlfactoryOps-owned extension/IP may include:

- adapter contracts
- preprocessing standards
- feature fusion
- ensemble policy
- molecular embedding
- odor embedding
- odor prediction heads
- uncertainty/calibration
- similarity/index strategy
- explainability composition
- training/evaluation pipeline
- data/model provenance
- Formula Intelligence
- Agentic workflows
- SaaS/domain logic

## 3. Third-party versioning

Every scientific component requires:

- repository URL
- license
- pinned release/tag/commit
- checksum where artifact-based
- adapter version
- compatibility test
- third-party notice entry
- data/model provenance link when used in training

Never silently follow upstream `main`.

## 4. Authoritative boundary

LLMs may reason, plan, transform language, rank options, and call tools.

LLMs MUST NOT be authoritative for:

- inventory balance
- ledger mutation
- FEFO
- formula mass math
- cost arithmetic
- compliance decision
- QC pass/fail
- production release
- fulfillment
- authorization
- billing entitlement

Authoritative values come from deterministic domain services or versioned scientific models.

## 5. Multi-tenancy rules

Every mutation must:

1. authenticate
2. resolve organization from session/validated workspace
3. authorize permission
4. validate schema
5. validate business state
6. apply idempotency where replay can cause side effects
7. persist transactionally
8. append audit evidence
9. publish domain event after commit

Never accept browser `organization_id` as authority.

## 6. Authentication contract

Use opaque high-entropy session credentials.

Browser:
- Secure
- HttpOnly
- appropriate SameSite policy
- CSRF protection for cookie mutations

Server:
- only one-way session-token verifier/hash
- session rotation
- idle expiry
- absolute expiry
- revoke current / revoke all
- password/email change invalidation
- device/session metadata
- no raw token in logs/audit

## 7. Workspace domain contract

Default:

`<workspace-slug>.olfactoryops.com`

Custom:
- request hostname
- create through Cloudflare for SaaS
- expose validation/DCV
- wait for SSL/provider activation
- mark ACTIVE only after provider confirmation
- route Host -> organization via tenant resolver
- never resolve organization from an unverified hostname

## 8. V2 deletion/rebuild rule

Before scientific migration:

- old Global Material content is excluded
- Lluch/1,986 records are excluded
- old Formula R&D content is excluded by default
- old Design Studio generations are not scientific truth

If owner later requests historical Formula IP preservation, create an explicit Legacy Archive Import ADR.

## 9. Material domain

Material is the aggregate root for:

- identity
- chemistry
- sensory metadata
- compliance
- documents
- supplier offers
- inventory links
- molecular identity
- scientific predictions

Material Compliance is a Material facet, not a separate user-facing module.

Replace Supplier Material Profile with:
- Supplier Profile
- Supplier Offer
- Material <-> Supplier Offer relation

## 10. Inventory

Never update stock as an arbitrary scalar.

Core immutable movement types:

- RECEIPT
- TRANSFER
- RESERVE
- RELEASE_RESERVATION
- CONSUMPTION
- ADJUSTMENT
- RETURN
- WASTE
- PRODUCTION_OUTPUT
- SHIPMENT

FEFO first filters eligible lots, then sorts.

## 11. Lab Usage replacement

Replace legacy `Lab Usage Commit` with **Lab Weighing / Consumption Session**:

Formula/Trial -> weighing plan -> FEFO eligible lot -> target weight -> actual weight -> confirmation -> immutable consumption -> traceability.

Correction uses compensating movement, not deletion.

## 12. Formula domain

Legacy Formula R&D is not reused.

V2 Formula supports:

- Formula Project
- Formula Draft
- immutable Formula Version
- Components
- final-product context/concentration
- constraints
- review/approval
- provenance
- Design Studio origin
- Trial/Production links

No generated direction becomes approved automatically.

## 13. Trials & Sensory

Independent module:

- Trial planning
- sample/blind coding
- sessions
- panelists
- timepoints
- scorecards
- decisions
- Private Sensory Memory

Private memory is derived, tenant-private, versioned, and never rewrites historical observations.

## 14. Agent runtime

Reuse proven concepts:

- run
- durable job
- versioned node
- typed tool
- artifact
- confirmation
- append-only event
- replay
- cancellation
- retry/lease fencing
- audit

Upgrade to real external LLM execution.

Model output cannot execute SQL, shell, arbitrary HTML/JS, arbitrary URL requests, or unknown tools.

## 15. Material Evidence RAG

RAG is evidence retrieval, never compliance authority.

Eligible source classes:
- approved Material profile
- SDS
- CoA
- IFRA evidence
- allergen declaration
- supplier specification/catalogue
- internal SOP/research as policy permits

Every result retains source provenance/citation.

## 16. Deferred

Keep architecture placeholders, but do not prioritize:

- CSV/XLSX import
- Reformulation Optimizer
- Vexo enterprise activation

## 17. Definition of Done

A feature is not DONE until applicable gates pass:

- schema validation
- tenant isolation tests
- permission tests
- happy path
- negative states
- idempotency/concurrency for side effects
- audit
- API contract
- UI loading/empty/error
- accessibility
- EN/VI shell strings
- observability
- threat review
- third-party/provenance update

Use explicit states:

- NOT_CONFIGURED
- NOT_EVALUATED
- NOT_ENOUGH_EVIDENCE
- REVIEW_REQUIRED
- BLOCKED

Never turn missing evidence into success.

## 18. Ambiguity rule

Codex must not invent hidden business rules.

Record:

```text
DECISION REQUIRED
Context:
Options:
Risk:
Recommended default:
Blocking implementation: yes/no
```

## 19. Sentiment & Consumer Intelligence

Treat Sentiment as a separate evidence/intelligence domain, not as generic chat sentiment.

Required pipeline:

```text
Feedback Source
-> Ingestion
-> Language Detection (EN/VI initially)
-> Normalization / PII minimization
-> Overall Sentiment
-> Aspect Sentiment
-> Emotion / Perception
-> Olfactory Descriptor Extraction
-> Preference Vector
-> Aggregation by source / segment / time
-> Formula Intelligence / Design Studio
```

Potential normalized aspects include opening, heart, drydown, freshness, sweetness, woody/floral/musk/citrus character, intensity, projection, longevity, elegance, naturalness, comfort, uniqueness and purchase intent. This is extensible through a versioned OlfactoryOps-owned vocabulary.

Every derived output must retain source, tenant, language, model/provider/version, extraction version, confidence and evidence references where policy permits.

Sentiment output must not automatically mutate Formula, override deterministic Trial/Sensory evidence, be represented as causal chemistry proof, cross tenant boundaries, or be used for model training without an approved data-use policy.

Design Studio may consume sentiment only as bounded advisory/ranking evidence.

## 20. Sentiment data privacy

Consumer/reviewer text may contain personal data. Define source rights, minimize identifiers, separate raw text from derived signals, propagate deletion/invalidation, record usage policy/consent/legal basis where applicable, and never assume public text automatically grants unrestricted model-training rights.

## 21. Legacy feature removal prompt

Before building V2 modules on top of the historical repository, execute the controlled removal workflow in:

`PROMPT_REMOVE_LEGACY_FEATURES.md`

It is mandatory for V2 cutover. It removes legacy Lluch/Global Material data paths, old Formula R&D, deterministic Formula Intelligence generation, replaced Lab Usage/Supplier Material Profile concepts, and deferred active functionality while preserving tenant isolation, audit, ledger, FEFO and generic agent runtime primitives.
