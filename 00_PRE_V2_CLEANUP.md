# 00_PRE_V2_CLEANUP.md
## Mandatory Repository Cleanup Before OlfactoryOps V2

**Execution order:** This document MUST be executed before any OlfactoryOps V2 scaffold, schema, service, scientific-core, or UI implementation.

**Repository:** `MutAquaticStudio/OlfactoryOps`
**Historical reference branch:** `codex/formula-intelligence-hardening`
**Target after cleanup:** Repository is clean, buildable, auditable, and ready to start **Scope Lock V0.4**.

---

# 0. PRIMARY RULE

Do **not** begin V2 implementation until this cleanup finishes with a verified PASS.

The purpose of this phase is not to redesign V2.

The purpose is to:

1. understand the current repository,
2. preserve valuable infrastructure,
3. remove deprecated active features,
4. archive historical documentation,
5. protect real tenant/customer data and IP,
6. remove dead runtime dependencies,
7. make the current repository internally consistent,
8. establish a clean hand-off point for V2.

The cleanup must happen **before** introducing the new Osmo-based Scientific Core.

---

# 1. CODEX ROLE

Act as:

- Principal Software Architect
- Repository Refactoring Engineer
- Database Migration Engineer
- Security Engineer
- QA/QC Engineer

Do not make broad deletions based only on filenames.

Inspect dependencies and responsibilities first.

---

# 2. SOURCE OF TRUTH DURING CLEANUP

Use the current repository implementation to understand what exists.

Use **Scope Lock V0.4** only to decide whether a feature is:

- KEEP
- REFACTOR
- REPLACE
- DELETE
- ARCHIVE
- DEFER

Do **not** start implementing the V0.4 replacement during this cleanup unless required to keep the repository buildable.

The replacement implementation belongs to the V2 phase.

---

# 3. FIRST ACTION — CREATE A SAFETY SNAPSHOT

Before modifying code:

1. Confirm the current branch and commit.
2. Create or recommend a permanent Git tag/branch snapshot such as:

```text
archive/pre-v2-legacy-final
```

or:

```text
v1-final-before-v2-cleanup
```

3. Record:

```text
repository
branch
commit SHA
date
migration head
known deployed environments
known active databases
```

Create:

```text
PRE_V2_BASELINE.md
```

Do not delete the historical branch.

---

# 4. MIGRATION SAFETY RULE

## NEVER edit historical migrations that may already have been applied.

Do not:

```text
delete old applied migration
rename old applied migration
change SQL inside old applied migration
reorder old applied migration
reuse an old migration number
```

Historical migrations remain historical evidence.

If cleanup affects an existing deployed database, create a **new forward-only cleanup migration**.

If V2 later starts with a clean database, V2 should use its own migration chain.

Example future V2:

```text
v2/migrations/
  0001_platform.sql
  0002_identity.sql
  0003_materials.sql
  ...
```

Do not force V2 to continue the legacy migration sequence unless an explicit ADR decides otherwise.

---

# 5. CUSTOMER / TENANT DATA PROTECTION

Before deleting any data, classify it.

Every legacy record belongs to one of:

```text
DEMO
SEED
GENERATED_REFERENCE
SYSTEM_TEST
REAL_TENANT_DATA
REAL_CUSTOMER_IP
UNKNOWN
```

## Hard stop

Do NOT delete:

```text
REAL_TENANT_DATA
REAL_CUSTOMER_IP
UNKNOWN
```

without an explicit migration/archive/deletion decision.

This especially applies to:

- Formula compositions
- customer briefs
- private materials
- supplier pricing
- inventory history
- Trials/Sensory evidence
- production history
- uploaded documents
- orders
- audit records

Old Formula R&D is removed as an **active V2 product implementation**, but real customer Formula IP must not be silently destroyed.

---

# 6. REQUIRED REPOSITORY INVENTORY

Before deleting code, scan the complete repository.

Create:

```text
LEGACY_FILE_INVENTORY.md
```

For every relevant file/directory record:

| Field | Description |
|---|---|
| Path | repository path |
| Purpose | what the code currently does |
| Feature/domain | owning feature |
| Shared? | whether other modules depend on it |
| Data dependency | tables/files/indexes it touches |
| V0.4 classification | KEEP / REFACTOR / REPLACE / DELETE / ARCHIVE / DEFER |
| Action | exact intended action |
| Risk | LOW / MEDIUM / HIGH |
| Notes | why |

Allowed classification values:

```text
KEEP
REFACTOR
REPLACE
DELETE
ARCHIVE
DEFER
HISTORICAL_MIGRATION_DO_NOT_EDIT
UNKNOWN_REQUIRES_DECISION
```

No bulk deletion is allowed until the inventory exists.

---

# 7. BUILD A FEATURE DEPENDENCY MAP

Create:

```text
LEGACY_FEATURE_DEPENDENCY_MAP.md
```

For each legacy feature trace:

```text
Navigation
  ↓
Page / Component
  ↓
Client data layer
  ↓
API route
  ↓
Controller / Worker route
  ↓
Service
  ↓
Domain types
  ↓
Database
  ↓
Background jobs / cron
  ↓
Events
  ↓
Agent tools
  ↓
RAG / Vector indexes
  ↓
Tests / fixtures
```

Identify shared infrastructure before removing a file.

---

# 8. FEATURES TO DELETE FROM ACTIVE PRODUCT

## 8.1 Lluch Supplier Catalogue

Remove active:

- Lluch catalogue UI
- search/filter features specific to Lluch
- parser/import
- reconciliation
- publication jobs
- Worker handlers
- catalogue APIs
- catalogue-specific RAG hooks
- seeds
- demo data
- tests expecting Lluch catalogue content

Search terms:

```text
Lluch
lluch
lluch-catalogue
lluch_catalogue
supplier_catalogue_imports
supplier_catalogue_products
mat-lluch-2026-
```

Do not replace it with another supplier catalogue during cleanup.

---

## 8.2 Old 1,986 Global Master Materials

Remove active data/runtime references for:

```text
1,986 Global Master Materials
Global Master Lluch
MASTER_APPROVED
global_material_publications
material.global.publish
mat-lluch-2026-
```

V2 Global Material Intelligence will be rebuilt later.

---

## 8.3 Old Global Material Scientific Data

Remove from active product:

- old curated Global Material dataset
- old generated odor assumptions
- old strength assumptions
- old scientific scoring
- old editorial scientific profiles
- derived scientific artifacts tied to deprecated Global data
- production seed data pretending to be V2 scientific truth

Do not delete tenant-created Materials.

Active V2 Global Material dataset target:

```text
EMPTY / TO BE REBUILT
```

---

## 8.4 Legacy Formula R&D Product Logic

Remove active legacy:

- Formula R&D workspace implementation
- obsolete Formula generation
- obsolete formula scoring
- old scientific heuristics
- old legacy-only evaporation/scoring UI
- old domain logic that conflicts with V2 Formula architecture
- obsolete Formula routes
- obsolete tests

Do NOT automatically delete:

- generic formula math utilities that remain valid
- generic immutable-version helpers
- generic audit
- generic permission system
- generic idempotency
- generic UI primitives

Classify those separately.

---

## 8.5 Legacy Formula Intelligence Candidate Generation

Delete active product logic for:

- deterministic old direction generation
- old fixed three-direction policy
- old opening/heart/trail heuristics
- legacy ranking
- legacy scientific material selection
- assumptions tied to old material data
- obsolete compatibility redirects
- Formula Agent behavior presented as V2 AI

Preserve/refactor generic runtime primitives:

```text
durable runs
durable jobs
versioned events
tool-call contracts
typed artifacts
confirmation
idempotency
lease fencing
event replay
audit
recipient-scoped sharing
```

---

# 9. FEATURES TO REPLACE LATER — REMOVE OLD FORM

## 9.1 Supplier Material Profile

Legacy:

```text
Supplier Material Profile
```

Target later:

```text
Supplier Profile
Supplier Offer
Material <-> Supplier Offer
```

Cleanup:

- remove obsolete terminology/routes/UI
- preserve valid Supplier data if real
- do not implement full V2 Supplier module yet

---

## 9.2 Standalone Material Compliance Profile

Target later:

```text
Material
  -> Compliance facet
```

Cleanup:

- remove standalone product/navigation concept
- preserve valid compliance evidence
- mark migration requirement for V2 Material aggregate

---

## 9.3 Lab Usage Commit / Reverse

Legacy:

```text
Lab Usage Commit
Lab Usage Reverse
```

Target later:

```text
Lab Weighing / Consumption Session
```

Cleanup:

- remove obsolete UI/route terminology when safe
- preserve immutable inventory movement history
- preserve traceability
- preserve generic movement-ledger primitives

Never replace with direct stock editing.

---

## 9.4 Production

Legacy Production is not final V2 Production.

Target later:

```text
Approved Formula Version
-> Production Order
-> Requirements
-> Lot Allocation
-> Weighing
-> Compounding
-> Conditioning
-> Filtration
-> Filling
-> QC
-> Release
-> Finished Good Lot
```

Preserve generic ledger, FEFO, QC evidence, audit, idempotency, lineage, permissions.

---

## 9.5 Formula Design Studio

Legacy product logic must not survive as V2 truth.

Target later:

```text
Raw Brief
-> External LLM
-> Human Review
-> Material Evidence
-> Molecular AI
-> Olfactory AI
-> Sentiment & Consumer Intelligence
-> Formula Intelligence
-> Candidate
-> Formula Draft
```

Cleanup does not implement this pipeline.

---

## 9.6 AI Formula Agent

Remove Formula-specific legacy product behavior.

Keep/refactor general Agent Runtime primitives.

Deterministic/mock provider may remain only for:

```text
tests
CI
local deterministic fixtures
```

It must not be represented as real external AI in V2.

---

## 9.7 Trials & Sensory

Preserve valid business evidence and useful primitives.

V2 will rebuild it as a dedicated module.

Do not destroy historical Trial/Sensory data if real tenant data exists.

---

# 10. DEFERRED — REMOVE FROM ACTIVE V2 PRODUCT SURFACE

## CSV / XLSX Import

For initial V2:

- remove from V2 navigation
- no active V2 API surface
- no V2 background jobs
- remove dependency used solely by importer if safe
- keep planning documentation only

If legacy deployment still needs importer temporarily, isolate it under an explicit legacy boundary.

## Reformulation Optimizer

Classification:

```text
DEFER
```

Remove from active V2:

- navigation
- active routes
- mutations
- scheduled jobs
- agent tools
- misleading feature availability

Keep requirements/planning only.

## Vexo

Approved future integration, not initial runtime requirement.

---

# 11. FEATURES / INFRASTRUCTURE THAT MUST BE PRESERVED

Do not accidentally remove:

```text
Multi-Tenant SaaS
tenant isolation
RBAC / Role Policies
CSRF
authentication security primitives
opaque-session hardening work
Tenant branding/logo
Cloudflare workspace-domain foundations
Email verification
Profile security
Managed billing
Notification infrastructure
Privacy/consent/export foundations
EN / VI
Owner observability foundations
PWA shell
Inventory Lots
Immutable Movement Ledger
FEFO
Procurement business primitives
Orders / Fulfillment
Reservation
Shipping
Operational Lineage
Material Evidence RAG security concepts
Private Sensory Memory concepts
Sentiment & Consumer Intelligence V0.4 requirements
```

---

# 12. OSMO RULE DURING CLEANUP

Do not begin Scientific Core implementation yet.

Cleanup must leave the repo ready for later adoption of:

```text
osmoai/bcfp
osmoai/molftp
osmoai/osmordred
osmoai/kgcnn-keras-unlocked
osmoai/transformer-CNN
osmoai/publications
osmoai/genai-toolbox
osmoai/vexo
osmoai/rdkit-pypi / upstream RDKit
```

Do not add:

```text
osmoai/taxonomy
```

during cleanup.

---

# 13. DOCUMENT CLEANUP

Old documentation can cause Codex to infer obsolete requirements.

Create:

```text
docs/legacy/v1/
```

Move clearly historical architecture/product/audit docs there where safe.

Examples:

```text
old Formula Intelligence architecture
competitive-moat phase reports
old Design Studio planning
old Lluch documentation
old deployment assumptions that no longer define V2
```

Add a header when practical:

```text
HISTORICAL DOCUMENT
Not a current OlfactoryOps V2 requirement.
Use docs/v2 and root CODEX.md as current source of truth.
```

Do not destroy useful historical engineering evidence.

---

# 14. ROOT SOURCE-OF-TRUTH MARKER

After cleanup, root docs must state:

```text
CURRENT:
docs/v2/*
CODEX.md
Scope Lock V0.4

HISTORICAL:
docs/legacy/*

Historical documentation MUST NOT be used to infer current product requirements.
```

---

# 15. UI CLEANUP

For deleted/deferred features remove:

- sidebar items
- navigation
- command palette commands
- dashboard widgets
- workspace pages
- dialogs
- quick actions
- obsolete settings
- dead routes
- compatibility redirects unless required for migration
- dead CSS/assets

A deprecated feature must not merely be hidden by CSS.

---

# 16. API CLEANUP

Remove inactive:

- route registrations
- DTO/schema
- controllers
- Worker routes
- service methods
- cron jobs
- queues
- webhooks
- feature-specific agent tools
- MCP tools
- obsolete capability endpoints

A removed feature must not remain callable through an undocumented API.

---

# 17. DATABASE / DATA CLEANUP

## Fresh V2 database

Do not port obsolete tables/data into V2.

## Existing legacy database

Use new forward-only cleanup migrations.

For intentionally disposable legacy reference data:

1. count records
2. analyze references
3. generate pre-cleanup report
4. clean in dependency-safe order
5. invalidate derived RAG/vector artifacts
6. invalidate deprecated scientific artifacts
7. verify zero active references
8. record cleanup evidence

Do not delete historical migrations.

---

# 18. TEST CLEANUP

Do not delete tests blindly.

Replace important obsolete tests with negative cleanup tests.

Examples:

```text
Lluch Global Masters are not seeded
old Global Master count is absent
legacy Formula Intelligence route is unavailable
legacy Optimizer is not active
legacy Lab Usage mutation is unavailable
Supplier Material Profile is not an active product model
```

Preserved invariant tests must continue to pass:

```text
tenant isolation
RBAC
CSRF
auth/session
ledger
FEFO
audit
orders/fulfillment
```

---

# 19. DEPENDENCY CLEANUP

After feature removal:

- scan imports
- scan package usage
- remove packages used only by deleted features
- refresh lock file
- scan unused assets
- scan unused environment variables
- scan unused secrets/config bindings
- scan unused Wrangler/Worker bindings

Do not remove a dependency based only on its name.

---

# 20. DEAD REFERENCE SCAN

After cleanup search entire repo for at least:

```text
Lluch
lluch
1,986
1986
Global Master
MASTER_APPROVED
supplier_catalogue
supplier catalogue
ai-formula-agent
Formula Agent
Reformulation Optimizer
formula-intelligence/optimizer
Lab Usage
lab usage
Supplier Material Profile
supplier_material_profile
```

Also include every legacy identifier discovered during inventory.

Create:

```text
LEGACY_REFERENCE_SCAN.md
```

Every remaining hit must be classified:

```text
HISTORICAL_MIGRATION
ARCHIVED_DOCUMENT
ARCHIVE_DATA
PLANNING_DOCUMENT
LICENSE / PROVENANCE
MUST_REMOVE
```

There must be zero unexplained references.

---

# 21. REQUIRED CLEANUP OUTPUTS

Codex must produce:

```text
PRE_V2_BASELINE.md
LEGACY_FILE_INVENTORY.md
LEGACY_FEATURE_DEPENDENCY_MAP.md
REMOVAL_REPORT.md
LEGACY_REFERENCE_SCAN.md
CLEANUP_VERIFICATION.md
```

---

# 22. CLEANUP VERIFICATION

Use only:

```text
PASS
FAIL
BLOCKED
NOT_APPLICABLE
```

Minimum gates:

| Gate | Required |
|---|---|
| Repository inventory complete | YES |
| Dependency map complete | YES |
| Legacy docs isolated | YES |
| Deprecated active UI removed | YES |
| Deprecated active API removed | YES |
| Obsolete jobs/tools removed | YES |
| Old Lluch/1,986 active data removed or isolated | YES |
| Legacy Formula scientific behavior removed | YES |
| Historical migrations preserved | YES |
| Tenant/customer IP protected | YES |
| Tenant isolation tests pass | YES |
| RBAC tests pass | YES |
| CSRF tests pass | YES |
| Inventory ledger tests pass | YES |
| FEFO tests pass | YES |
| Build passes | YES |
| Typecheck passes | YES |
| Lint passes | YES |
| Security/secret scan passes | YES |
| Dead legacy references explained | YES |

---

# 23. FINAL EXIT CRITERIA

Cleanup is complete only when:

```text
1. repository builds
2. tests pass
3. preserved infrastructure still works
4. deleted features are gone end-to-end
5. historical migrations were not rewritten
6. historical docs are clearly archived
7. old Lluch / 1,986 data is not active V2 truth
8. legacy Formula R&D / deterministic generation is not active
9. deferred features are not presented as active
10. real tenant/customer IP has not been silently deleted
11. dead-reference scan has zero unexplained hits
12. REMOVAL_REPORT.md exists
13. CLEANUP_VERIFICATION.md is PASS
```

Only after all applicable gates PASS may Codex begin:

```text
OlfactoryOps V2 Phase 0
```

---

# 24. FINAL CODEX INSTRUCTION

Do not implement the new V2 scientific stack during this cleanup.

Do not redesign features unless necessary to remove a dependency safely.

Do not hide old features and call that cleanup.

Do not destroy real customer IP.

Do not rewrite migration history.

**First make the existing repository clean, stable, understandable, and auditable. Then begin V2.**
