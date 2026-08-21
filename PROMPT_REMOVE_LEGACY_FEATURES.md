# PROMPT — Remove Deprecated / Replaced Legacy Features
## OlfactoryOps V2 — Scope Lock V0.4

Use this prompt in Codex when preparing the clean V2 codebase from the existing OlfactoryOps repository.

## ROLE

Act as a **Principal Software Architect + Refactoring/Migration Engineer + QA/QC Engineer**.

Target:
- Repository: `MutAquaticStudio/OlfactoryOps`
- Historical reference: `codex/formula-intelligence-hardening`
- Target architecture: **OlfactoryOps V2 Scope Lock V0.4**

Read before changing code, in precedence order: `CODEX.md`, `SRS.md`, `BRD.md`, `BRS.md`, `ARCHITECTURE.md`, `DATA_ARCHITECTURE.md`, `SERVICE_ARCHITECTURE.md`, `MIGRATION_AND_ROADMAP.md`, `OSMO_ADOPTION_AND_PROVENANCE.md`, `manifests/scope-lock.yaml`.

The V0.4 documents override legacy implementation where they conflict.

# OBJECTIVE

Perform a **complete, safe removal of legacy features and data paths explicitly DELETE / REPLACE / DEFERRED from active V2**.

Do not merely hide screens. For every removed feature, eliminate or migrate all active references across:

```text
UI / Navigation / Routes / API contracts / Controllers / Services
Domain logic / Worker handlers / Jobs / Queues / Webhooks
Database schema in the new V2 chain / Seeds / Demo data
Feature flags / Permissions that exist only for removed features
RAG or vector hooks / Agent tools / Events / Notifications
Tests / Fixtures / Mocks / Scripts / Dependencies / Documentation
Dead imports / Dead types / Dead CSS / Analytics
```

No zombie feature may remain.

# CRITICAL MIGRATION SAFETY

## MODE A — CLEAN V2 BRANCH / FRESH V2 DATABASE

If V2 uses a fresh schema:
- do not port obsolete legacy migrations into the V2 migration chain;
- do not seed legacy scientific/business reference data;
- remove obsolete modules completely;
- create only V2 schema required by Scope Lock V0.4.

## MODE B — CLEANUP OF AN EXISTING LEGACY DATABASE

If migrations may already have been applied:
- NEVER edit, rename, reorder, or delete historical migrations that may have run;
- create a new forward-only cleanup migration;
- drop/archive obsolete structures only after dependency analysis;
- never infer ownership or silently transform customer IP;
- provide backup/rollback/recovery steps before destructive schema changes.

If deployment history is unknown, treat the migration as already deployed.

# A. HARD DELETE / DO NOT MIGRATE

## A1. Lluch Supplier Catalogue

Remove active implementation and data for:
- Lluch catalogue parsing/import;
- catalogue reconciliation/publication;
- Lluch-specific UI/API/Worker jobs;
- Lluch-specific search/RAG hooks;
- tests, fixtures, seed data.

Search at minimum for:

```text
Lluch
lluch
lluch-catalogue
lluch_catalogue
supplier_catalogue_imports
supplier_catalogue_products
mat-lluch-2026-
global_material_publications
```

Do not replace it with another supplier dataset in this task.

## A2. Old 1,986 Global Master Materials

Delete from active V2:
- 1,986 Global Master records;
- Global Master Lluch publication data;
- catalogue-specific CAS-variant behavior;
- reconciliation/publishing jobs;
- UI counts/messages;
- tests expecting 1,986 records.

Search for:

```text
1986
1,986
Global Master
MASTER_APPROVED
global_material_publications
material.global.publish
mat-lluch-2026-
```

V2 Global Material Intelligence must start empty.

## A3. Old Global Material scientific data

Remove old global:
- scientific descriptions;
- generated odor/strength/compliance assumptions;
- editorial material profiles;
- feature/prediction data;
- hard-coded production-truth materials;
- seed fixtures intended as production truth.

Keep only the empty V2 Global Material capability/schema where required.

Do not delete tenant-created Material data unless a separate migration decision explicitly authorizes it.

## A4. Legacy Formula R&D implementation

Remove active legacy:
- Formula R&D workspace/UI;
- old formula-generation logic;
- old formula scoring/ranking;
- old scientific assumptions;
- old evaporation/scientific UI coupled only to legacy Formula R&D;
- obsolete Formula schema/routes/services that conflict with V2;
- tests encoding obsolete behavior.

Preserve only generic primitives compatible with V2:
- RBAC/permissions;
- audit;
- idempotency;
- immutable-version patterns;
- validated generic math/unit utilities;
- UI infrastructure;
- event/runtime infrastructure.

## A5. Legacy deterministic Formula Intelligence generation

Delete old product behavior:
- deterministic material-selection policy;
- old three-direction heuristics;
- hard-coded opening/heart/trail generation;
- candidate-ranking assumptions;
- Formula Intelligence scientific scoring tied to removed datasets;
- old material-universe assumptions;
- compatibility redirects that make old Formula Agent appear as the current V2 product.

DO NOT delete these reusable V2 Agent Runtime primitives:

```text
durable run
durable job
versioned events
typed artifacts
confirmation
idempotency
lease fencing
audit
recipient-scoped sharing
```

# B. REPLACE OLD IMPLEMENTATION WITH V2 CONCEPT

## B1. Supplier Material Profile -> Supplier Profile + Supplier Offer

Remove active `Supplier Material Profile` UI/API/schema terminology and embedded supplier-commercial state from Material.

Replace with:

```text
Supplier Profile
Supplier Offer
Material <-> Supplier Offer
```

After migration, no active route/type/UI should expose `Supplier Material Profile`.

## B2. Standalone Material Compliance Profile -> Material Compliance Facet

Compliance remains important but belongs under Material:

```text
Material
  -> Compliance
     -> status
     -> jurisdiction/category
     -> source/version
     -> limits/evidence
     -> review
```

Remove obsolete standalone navigation and duplicate data paths. Preserve valid compliance evidence.

## B3. Lab Usage Commit -> Lab Weighing / Consumption Session

Remove user-facing/API concepts:

```text
Lab Usage Commit
Lab Usage Reverse
```

Replace with:

```text
Lab Weighing / Consumption Session
```

Preserve invariant:

```text
actual consumption -> actual lot -> immutable movement ledger -> Formula/Trial/Production trace
```

Corrections use compensating movements. Never reintroduce direct stock edits.

## B4. Production -> Full V2 rebuild

Do not carry the old Production module unchanged.

Target flow:

```text
Approved Formula Version
-> Production Order
-> Material Requirements
-> Lot Allocation
-> Weighing
-> Compounding
-> Conditioning / Maturation
-> Filtration
-> Filling
-> QC
-> Release
-> Finished Good Lot
```

Preserve generic audit, idempotency, ledger, FEFO, permission, lineage and immutable QC evidence patterns.

## B5. Formula Design Studio -> Full V2 rebuild

Delete legacy Design Studio product logic while retaining generic infrastructure.

Target:

```text
Raw Brief
-> External LLM Structured Proposal
-> Human Review
-> Authorized Material Universe
-> Material Evidence RAG
-> Molecular AI
-> Olfactory AI
-> Sentiment & Consumer Intelligence
-> Formula Intelligence
-> Candidate Directions
-> Perfumer Decision
-> Formula Draft
```

Do not leave old deterministic candidate generation enabled behind a hidden flag.

## B6. AI Formula Agent -> V2 Agent Runtime / Agentic AI

Remove obsolete Formula-specific agent product logic that conflicts with V2.

Retain/refactor generic durable runtime primitives.

External LLM must execute through a real provider adapter. Deterministic/mock mode may remain only as CI/local test provider and must never be presented as real AI to users.

## B7. Trials & Sensory -> standalone V2 module

Preserve valid Trial/Sensory concepts and historical evidence, but rebuild boundaries according to V2:

```text
Trial
Samples
Blind Coding
Sensory Sessions
Assignments
Timepoints
Scorecards
Decision
Evidence Projection
Private Sensory Memory
```

# C. DEFERRED FEATURES — REMOVE FROM ACTIVE PRODUCT

## C1. CSV / XLSX Import

Initial V2 must have:
- no production import UI;
- no exposed import routes;
- no import jobs;
- no package retained solely for import unless another active feature requires it.

Keep architecture/roadmap documentation only.

If legacy operations still require it temporarily, isolate behind an explicit legacy boundary and exclude from V2 navigation.

## C2. Reformulation Optimizer

Status: `PLANNING ONLY`.

Remove/disable active V2:
- navigation;
- public routes;
- mutations;
- agent tools;
- jobs;
- feature flags suggesting availability.

Keep requirements and architecture placeholder only.

## C3. Vexo activation

`osmoai/vexo` remains approved for future Chemistry DataOps but must not be a launch dependency.

Remove unnecessary active runtime coupling while preserving provenance/planning documentation.

# D. DO NOT DELETE

The cleanup must preserve these V2 foundations even when colocated with deprecated code:

```text
Multi-Tenant SaaS
tenant isolation
RBAC / Role Policies
CSRF
opaque hashed session/security primitives
Tenant branding/logo
Cloudflare for SaaS domain architecture
Email verification
Profile security
Managed billing
Notification infrastructure
Privacy / consent / export foundations
EN / VI
Owner observability foundations
PWA shell
Inventory Lots
Immutable Movement Ledger
FEFO
Procurement concept
Orders / Fulfillment
Reservation
Shipping / Fulfillment
Operational Lineage
Material Evidence RAG security boundary
Private Sensory Memory concept
Sentiment & Consumer Intelligence V0.4
```

Preserve approved Osmo V2 components:

```text
osmoai/bcfp
osmoai/molftp
osmoai/osmordred
osmoai/kgcnn-keras-unlocked
osmoai/transformer-CNN
osmoai/publications
osmoai/genai-toolbox
osmoai/vexo       # planning only
osmoai/rdkit-pypi / upstream RDKit reference
```

Do not add `osmoai/taxonomy`.

# E. REQUIRED REMOVAL WORKFLOW

## Step 1 — Build `REMOVAL_INVENTORY.md`

Search the entire repository and classify every relevant occurrence:

```text
DELETE
REPLACE
KEEP_PRIMITIVE
ARCHIVE
MIGRATION_HISTORY_DO_NOT_EDIT
PLANNING_ONLY
UNKNOWN_REQUIRES_DECISION
```

Do not start broad deletion before this inventory is complete.

## Step 2 — Build dependency graph per target

Identify:

```text
UI -> route -> API -> controller -> service -> domain type
-> database -> migration -> seed -> job -> event -> permission
-> agent tool -> RAG/index -> test -> package dependency
```

Identify shared primitives before deleting files.

## Step 3 — Remove UI

Remove deprecated:
- navigation;
- routes/pages/workspaces;
- dialogs/drawers;
- command palette;
- quick actions;
- dashboards/settings;
- legacy redirects.

Do not leave hidden deprecated pages reachable by URL.

## Step 4 — Remove API/runtime

Remove obsolete:
- route registration;
- schema/controller/service;
- Worker handler;
- cron/queue/webhook;
- agent/MCP tool.

A removed API must not remain callable but undocumented.

## Step 5 — Remove domain/data surface

Clean obsolete:
- types/enums;
- domain records;
- seed/demo data;
- feature-specific state;
- feature flags;
- config;
- indexes/materialized data.

Apply MODE A or MODE B migration safety rule.

## Step 6 — Replace obsolete tests

Delete or rewrite tests proving removed behavior.

Add negative V2 tests where useful:

```text
old Lluch records are not seeded
Global Material library starts empty
old Formula Intelligence endpoints are absent
legacy Optimizer is not enabled
legacy Lab Usage mutation is unavailable
Supplier Material Profile no longer exists as active API
```

## Step 7 — Dependency cleanup

Remove packages only after proving they are unused by preserved features.

Then run repository-equivalent:

```text
install/lock refresh
typecheck
lint
build
tests
dependency audit
secret scan
```

## Step 8 — Dead-reference scan

Search minimum terms:

```text
Lluch
lluch
1,986
1986
Global Master
MASTER_APPROVED
supplier_catalogue
Formula Agent
ai-formula-agent
Reformulation Optimizer
formula-intelligence/optimizer
Lab Usage
Supplier Material Profile
supplier_material_profile
```

Every remaining hit must be classified and justified.

Allowed remaining references:
- historical migration;
- historical audit/archive;
- removal report;
- planning docs;
- license/provenance record.

# F. DATA CLEANUP RULES

## Tenant-owned data

Never delete real tenant-owned data merely because UI code is removed unless Scope Lock explicitly makes it obsolete and ownership/deletion policy is known.

## Explicitly disposable scientific/reference data

Old Lluch/Global Master reference data is intentionally excluded from V2.

For an existing DB cleanup migration:
1. count affected records;
2. identify references;
3. produce pre-delete report;
4. delete dependency-safe;
5. invalidate RAG/vector artifacts;
6. remove derived scientific artifacts;
7. verify zero active references;
8. append migration/audit evidence.

## Legacy Formula data

Before destructive deletion of Formula records, classify:

```text
demo/seed
generated legacy output
real tenant/customer IP
```

Demo/generated obsolete content may be removed according to policy.

Real customer Formula IP must be explicitly archived/exported/mapped or explicitly approved for deletion. Never silently destroy customer IP.

# G. DATABASE ACCEPTANCE

Verify:

```text
0 old Lluch records in active V2
0 old 1,986 Global Master records
0 active old supplier-catalogue production records
0 active legacy Design Studio generation used as V2 truth
0 legacy Optimizer active routes
0 legacy Lab Usage mutation routes
0 Supplier Material Profile active API/schema
```

Also verify preserved invariants:

```text
tenant isolation PASS
RBAC PASS
CSRF PASS
auth/session tests PASS
inventory ledger PASS
FEFO PASS
audit PASS
orders/fulfillment preserved
```

# H. REQUIRED VERIFICATION

Run all applicable:

```text
typecheck
lint
unit tests
integration tests
tenant-isolation tests
security tests
frontend build
API build
Worker/scientific builds
dependency audit
secret scan
dead-code scan
```

Do not declare completion because a test was skipped after the cleanup broke the harness.

# I. REQUIRED OUTPUT

## `REMOVAL_REPORT.md`

Include:
- executive summary;
- removed/replaced/deferred features;
- files deleted/changed;
- routes removed;
- data/schema cleanup;
- flags/permissions/dependencies removed;
- tests removed/replaced;
- intentionally retained legacy references;
- migration strategy MODE A or MODE B;
- pre/post counts;
- verification results;
- risks/blockers/manual follow-up.

## `LEGACY_REFERENCE_SCAN.md`

List every remaining legacy hit and its reason. No unexplained hit.

## Update manifests

Update:
- `manifests/scope-lock.yaml`;
- third-party manifest if dependencies changed;
- route/module registry;
- permission registry.

## Verification table

Use only:

```text
PASS
FAIL
BLOCKED
NOT_APPLICABLE
```

Never mark an untested item PASS.

# J. EXIT CRITERIA

Complete only when:
- deprecated UI is gone;
- deprecated active routes/services/domain logic are gone;
- old data does not seed V2;
- Lluch/1,986 old data is absent from active V2;
- old Formula scientific assumptions are absent;
- old deterministic Formula generation is absent;
- deferred Optimizer/import features are inactive;
- replacement boundaries are documented;
- preserved infrastructure still passes;
- no unexplained dead reference remains;
- `REMOVAL_INVENTORY.md`, `REMOVAL_REPORT.md`, and `LEGACY_REFERENCE_SCAN.md` exist.

**Do not stop after hiding features. Remove them end-to-end.**
