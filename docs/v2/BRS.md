# BRS — Business Requirements Specification
## OlfactoryOps V2

## 1. Executive summary

OlfactoryOps V2 is a multi-tenant SaaS operating system for fragrance research, perfumery laboratories, suppliers, and selected commercial operations. It combines controlled lab operations with a new scientific molecular/olfactory intelligence core and an agentic AI layer.

V2 has two strategic goals:

1. Replace legacy Formula/Global Material scientific assumptions with a reproducible, provenance-aware scientific stack built from approved Osmo open-source components.
2. Preserve and harden proven operational controls from the current OlfactoryOps implementation: tenant isolation, permissions, auditability, inventory traceability, durable workflows, human confirmation, and sensory learning.

## 2. Business vision

```text
Material identity
-> molecular intelligence
-> formula/design work
-> lab weighing
-> trial
-> sensory evidence
-> production
-> finished-good trace
-> optional commerce/fulfillment
```

Every stage should be traceable by provenance and tenant-scoped lineage.

## 3. Business goals

| ID | Goal |
|---|---|
| BG-001 | Secure multi-tenant fragrance R&D workspaces. |
| BG-002 | Material intelligence connecting chemical, supplier, compliance, inventory and AI evidence. |
| BG-003 | New Formula/Design workflow informed by molecular and olfactory intelligence. |
| BG-004 | Lot/weight traceability from receiving to lab/production consumption. |
| BG-005 | Reusable Trial & Sensory evidence without inappropriate panel-data exposure. |
| BG-006 | Optional supplier/service commerce without forcing commerce on pure R&D labs. |
| BG-007 | Safe external LLM execution through typed tools, deterministic authorities and human confirmation. |
| BG-008 | Proprietary OlfactoryOps intelligence built by extending approved Osmo open-source building blocks. |
| BG-009 | Dataset/model/prediction provenance for technical, licensing and commercial audit. |
| BG-010 | Privacy/export model that separates personal data from tenant business IP. |

## 4. Stakeholders

- Workspace Owner
- Admin
- Lab Manager
- Perfumer / Creator
- R&D Scientist
- Lab Technician
- Procurement
- Sensory Panelist
- Supplier / Commercial User
- Brand / Client Collaborator
- Finance / Read-only roles as authorized

## 5. Scope

### Platform
- Multi-Tenant SaaS
- RBAC and role policy
- CSRF
- completed opaque hashed sessions
- tenant branding/logo
- default `<slug>.olfactoryops.com`
- Cloudflare for SaaS custom domains
- email verification
- profile email/password change
- managed billing
- in-app/email/web push notifications
- legal consent/data export
- EN/VI
- Owner-only operational observability
- PWA

### Lab Operations
- new Material domain
- Material Compliance facet
- Supplier Profile + Supplier Offers
- Inventory Lots
- immutable Movement Ledger
- FEFO
- Lab Weighing / Consumption
- Procurement
- redesigned Production
- optional Supplier Commerce/SKU/Quotes
- Orders/Reservation/Shipping/Fulfillment
- Trials & Sensory
- Private Sensory Memory
- Operational Lineage
- Material Evidence RAG

### Scientific/AI
- RDKit
- BCFP
- MolFTP
- Osmordred
- KGCNN
- Transformer-CNN
- feature fusion
- molecular/odor embeddings
- odor prediction
- similarity
- explainability
- new Formula Intelligence / Design Studio
- durable Agent Runtime
- real external LLM gateway
- MCP/database tooling with genai-toolbox
- dataset/model provenance

### Planning only
- CSV/XLSX import
- Reformulation Optimizer
- Vexo enterprise activation

### Explicitly removed from V2 migration
- old Global Material data
- Lluch catalogue
- old 1,986 Global Master Materials
- old Formula R&D data/logic
- generated scientific assumptions derived from old Formula Intelligence

## 6. Business requirements

### Platform/Tenancy

**BR-001** Isolate every customer workspace by organization.  
**BR-002** Allow a user to belong to multiple organizations with independent membership policy.  
**BR-003** Evaluate permissions server-side.  
**BR-004** Allocate `<workspace-slug>.olfactoryops.com`.  
**BR-005** Allow Owner to connect validated custom domain through Cloudflare for SaaS.  
**BR-006** Allow tenant branding without changing security/semantic UI meaning.

### Security

**BR-010** Use opaque sessions with only one-way verifier/hash stored server-side.  
**BR-011** Users can inspect/revoke sessions.  
**BR-012** Password/email change uses re-auth and revoke/rotate policy.  
**BR-013** Email verification uses one-time expiring hash-only tokens.

### Billing/Notifications

**BR-020** Tenant billing remains separate from lab workflows.  
**BR-021** Notifications support in-app, email, PWA push.  
**BR-022** User can configure preferences.

### Privacy

**BR-030** Personal Data Export and Workspace Export are separate.  
**BR-031** Personal export cannot leak tenant Formula/business IP.  
**BR-032** Consent records are versioned by purpose/policy/time/withdrawal.  
**BR-033** Tenant business/scientific data is not automatically a user's personal export.

### Material

**BR-040** Material aggregates identity, chemistry, compliance, evidence, suppliers, inventory and scientific intelligence.  
**BR-041** Global Material Intelligence starts empty; old Lluch/Global content is not imported.  
**BR-042** Supplier model becomes Supplier Profile + Supplier Offers.  
**BR-043** Molecular predictions retain model/version/provenance.

### Inventory/Procurement

**BR-050** Inventory quantity is explainable from immutable movements/reservations.  
**BR-051** FEFO allocates only eligible lots.  
**BR-052** Receiving creates quarantine until quality/compliance gates pass.  
**BR-053** Procurement supports offers, PO, receiving, inspection, return and landed cost.  
**BR-054** Lab weighing links actual quantity to actual lot.

### Formula/Design

**BR-060** Legacy Formula R&D is replaced.  
**BR-061** Downstream Formula Versions are immutable.  
**BR-062** AI candidate remains advisory until human saves Formula Draft.  
**BR-063** Design Studio combines creative brief, evidence, molecular intelligence, olfactory intelligence and deterministic checks.

### Trials/Sensory

**BR-070** Trials & Sensory is independent.  
**BR-071** Trial planning does not consume stock.  
**BR-072** Actual weighing creates lot traceability.  
**BR-073** Private Sensory Memory is derived, tenant-private and versioned.  
**BR-074** Missing evidence remains explicit.

### Production

**BR-080** Rebuild Production: approved Formula Version -> requirements -> allocation -> weighing -> processing -> QC -> release -> Finished Good Lot.  
**BR-081** Trace raw lots to output lots and downstream orders.  
**BR-082** Release is deterministic human-controlled, not an LLM action.

### Commerce

**BR-090** Commerce is module-enabled for supplier/service tenants.  
**BR-091** Reservation, shipment and fulfillment remain distinct.

### AI/Scientific

**BR-100** Scientific Core starts from approved Osmo repositories through OlfactoryOps adapters.  
**BR-101** App/domain code cannot directly depend on Osmo APIs.  
**BR-102** Support graph, SMILES and engineered-feature model paths.  
**BR-103** Support fused molecular and odor embeddings.  
**BR-104** Prediction retains model/input/output/uncertainty metadata.  
**BR-105** External LLM runs server-side through provider gateway.  
**BR-106** LLM is not authority for inventory, Formula math, compliance, QC, release or authorization.

### Provenance/Licensing

**BR-110** External code/data used at runtime or training has source/license/version provenance.  
**BR-111** CC BY data retains attribution metadata.  
**BR-112** Releases contain third-party notices.  
**BR-113** Osmo Scent Taxonomy is excluded from V2 scope; no ODbL dependency.

## 7. Success criteria

- No verified cross-tenant data path.
- Inventory reconstructable from ledger.
- Released production lot traceable to Formula Version and raw lots.
- Scientific prediction traceable to model/version/input.
- Model traceable to training datasets/licenses.
- LLM cannot directly perform authoritative business mutations.
- Candidate-to-Trial chain retains immutable provenance.
- Custom domain cannot activate before Cloudflare provider + SSL confirmation.
- Personal export cannot expose tenant Formula/business IP by default.

## 8. Constraints

- V2 is a clean rebuild.
- Global Material dataset starts empty.
- Formula R&D starts new.
- CSV/XLSX import deferred.
- Reformulation Optimizer deferred.
- Scientific services can require Python/C++ and must not be forced into Cloudflare Worker TypeScript.
- Privacy/legal behavior needs jurisdiction-specific legal review before commercial launch.
