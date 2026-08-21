# SRS — Software Requirements Specification
## OlfactoryOps V2

## 1. System overview

OlfactoryOps V2 is a multi-tenant SaaS composed of web/PWA clients, Cloudflare edge routing, transactional domain services, scientific Python/C++ services, object/vector storage and a durable agent runtime.

## 2. Target technology posture

### Web
- React + TypeScript
- PWA
- responsive lab workflows
- EN/VI shell

### Edge/SaaS
- Cloudflare DNS/TLS
- Cloudflare for SaaS
- tenant hostname router
- API ingress protection

### Transactional source of truth
Recommended: PostgreSQL as primary relational system of record for V2 business/scientific metadata.

Cloudflare D1 may be used only for clearly separated edge/control-plane use cases if needed; it must not be a second writer for the same business aggregate.

### Object storage
Private object storage for:
- documents
- datasets
- feature artifacts
- model checkpoints
- exports

### Vector storage
Versioned/rebuildable indexes for:
- RAG
- molecular embeddings
- odor embeddings

### Scientific services
Python/C++ services wrapping pinned Osmo/RDKit components.

### Agent runtime
Durable workflow + external LLM gateway + typed tools + replay + confirmation.

## 3. Platform requirements

**FR-PLAT-001** Scope tenant data by authenticated organization.  
**FR-PLAT-002** Support user membership in multiple organizations.  
**FR-PLAT-003** Require permissions/capabilities for protected operations.  
**FR-PLAT-004** Enable modules according to tenant plan/capability.  
**FR-PLAT-005** Store safe tenant branding/logo.  
**FR-PLAT-006** Support EN/VI application shell.

## 4. Authentication requirements

**FR-AUTH-001** Successful login issues cryptographically random opaque session credential.  
**FR-AUTH-002** Persist only one-way session verifier/hash.  
**FR-AUTH-003** Browser credential uses Secure/HttpOnly cookie.  
**FR-AUTH-004** Cookie-authenticated mutation requires CSRF.  
**FR-AUTH-005** Support session rotation.  
**FR-AUTH-006** Support revoke one/revoke all.  
**FR-AUTH-007** Password change requires re-auth and session policy.  
**FR-AUTH-008** Email change requires re-auth, uniqueness and re-verification.  
**FR-AUTH-009** Verification token is random, one-time, expiring and hash-only at rest.  
**FR-AUTH-010** Credential endpoints are rate-limited.

## 5. Workspace domain requirements

**FR-DOM-001** Allocate `<slug>.olfactoryops.com`.  
**FR-DOM-002** Owner can request custom hostname.  
**FR-DOM-003** Server manages it through Cloudflare for SaaS.  
**FR-DOM-004** Track requested/validation/SSL/active/failed/archived.  
**FR-DOM-005** Do not route custom hostname before provider+SSL active.  
**FR-DOM-006** Tenant Router resolves authoritative hostname registry.

## 6. Notification requirements

**FR-NOTIF-001** Durable notification outbox.  
**FR-NOTIF-002** In-app/email/web-push channels.  
**FR-NOTIF-003** Per-user category/channel preferences.  
**FR-NOTIF-004** Delivery failure must not roll back committed business transaction.

## 7. Privacy requirements

**FR-PRIV-001** Consent stores purpose, policy/version, accept/withdraw timestamps.  
**FR-PRIV-002** Personal export is current-user scoped.  
**FR-PRIV-003** Workspace export is separate Owner/Admin operation.  
**FR-PRIV-004** Erasure requests enter controlled review when retention obligations exist.  
**FR-PRIV-005** Schemas classify personal, tenant-confidential, scientific, operational and public metadata.

## 8. Material requirements

**FR-MAT-001** Material supports TENANT/GLOBAL scope.  
**FR-MAT-002** V2 Global Material dataset initially empty.  
**FR-MAT-003** Material can link canonical molecular identity.  
**FR-MAT-004** Compliance facet stores status/source/version/review.  
**FR-MAT-005** Material links documents, supplier offers, inventory and scientific prediction.  
**FR-MAT-006** AI prediction cannot overwrite curated chemical identity.  
**FR-MAT-007** Material privileged mutation is audited.

## 9. Supplier requirements

**FR-SUP-001** Supplier Profile stores organization and operational metadata.  
**FR-SUP-002** Supplier Offer relates Supplier, Material, product/grade, MOQ, price, currency, lead time and validity.  
**FR-SUP-003** Quality/performance metrics derive from operational evidence.

## 10. Inventory requirements

**FR-INV-001** Inventory is lot-based.  
**FR-INV-002** Stock-changing operations create immutable movement records.  
**FR-INV-003** Reservation is separate from consumption/shipment.  
**FR-INV-004** FEFO filters eligibility before expiry ordering.  
**FR-INV-005** Quarantined lots are not allocatable.  
**FR-INV-006** Correction uses compensating movement.  
**FR-INV-007** Quantity can be reconstructed from movement/reservation state.

## 11. Lab Weighing requirements

**FR-WEIGH-001** Session references Formula/Trial/Production context.  
**FR-WEIGH-002** Propose eligible lots.  
**FR-WEIGH-003** Record actual lot and actual weight.  
**FR-WEIGH-004** Confirmation atomically creates consumption movement + trace.  
**FR-WEIGH-005** Controlled abort/correction.

## 12. Procurement requirements

**FR-PROC-001** Requirement/request, PO, shipment, receipt, inspection, disposition.  
**FR-PROC-002** Receipt creates quarantine lot.  
**FR-PROC-003** Posted landed cost stores immutable allocation evidence.  
**FR-PROC-004** Reject supports return/reject evidence.

## 13. Formula requirements

**FR-FORM-001** Formula is rebuilt independent of legacy Formula R&D.  
**FR-FORM-002** Downstream Formula Version immutable.  
**FR-FORM-003** Components reference Material + quantity basis.  
**FR-FORM-004** Support final-product context/concentration when applicable.  
**FR-FORM-005** Review/approval explicit and permission-controlled.  
**FR-FORM-006** Preserve origin provenance.

## 14. Design Studio requirements

**FR-DS-001** Persist raw creative brief.  
**FR-DS-002** LLM may propose structured brief; server validates; human reviews.  
**FR-DS-003** Candidate generation uses authorized material universe.  
**FR-DS-004** Pin universe/version/hash for reproducibility.  
**FR-DS-005** Candidate stores deterministic validation/evidence states.  
**FR-DS-006** Sharing is recipient-scoped/redacted.  
**FR-DS-007** Save candidate creates Formula Draft only.

## 15. Trials & Sensory requirements

**FR-TRIAL-001** Trial is independent aggregate.  
**FR-TRIAL-002** Planning does not mutate stock.  
**FR-TRIAL-003** Trial links immutable Formula Version.  
**FR-TRIAL-004** Trial links actual lab consumption lineage.  
**FR-SENS-001** Support blind/sample codes.  
**FR-SENS-002** Support configured timepoints/scorecards.  
**FR-SENS-003** Panelist-safe projection redacts Formula/lot data.  
**FR-SENS-004** Explicit decision outcome.  
**FR-MEM-001** Private Sensory Memory is tenant-scoped, derived, versioned.  
**FR-MEM-002** Insufficient evidence produces explicit state.

## 16. Production requirements

**FR-PROD-001** Production Order references approved Formula Version.  
**FR-PROD-002** Store requirements and lot allocations.  
**FR-PROD-003** Actual weighing links ledger consumption.  
**FR-PROD-004** Store configured process stages.  
**FR-PROD-005** QC gates release.  
**FR-PROD-006** Release creates Finished Good Lot.  
**FR-PROD-007** Reconcile yield/waste.  
**FR-PROD-008** Finished Good Lot retains raw-lot and Formula-Version lineage.

## 17. Commerce requirements

**FR-COM-001** Commerce optional by workspace.  
**FR-COM-002** Supplier/service catalogue/SKU/quote.  
**FR-ORD-001** Separate reservation/packing/shipping/fulfillment.  
**FR-ORD-002** Canonical pricing recalculated server-side where applicable.  
**FR-ORD-003** Shipment writes correct inventory/finished-good movement.

## 18. Scientific feature requirements

**FR-SCI-001** Structure service validates/normalizes molecular input with RDKit.  
**FR-SCI-002** BCFP adapter generates versioned fingerprint feature.  
**FR-SCI-003** MolFTP adapter generates versioned fragment-target features.  
**FR-SCI-004** Osmordred adapter generates dense descriptor artifacts.  
**FR-SCI-005** Feature artifact includes component version + structure hash.  
**FR-SCI-006** Expensive scientific operations support async jobs.

## 19. Model requirements

**FR-ML-001** KGCNN adapter supports selected 2D/3D graph architectures.  
**FR-ML-002** Transformer-CNN adapter supports SMILES path.  
**FR-ML-003** Support OlfactoryOps ensemble/fusion.  
**FR-ML-004** Model Registry tracks model, architecture, version, code, checkpoint, feature contract, datasets and metrics.  
**FR-ML-005** Prediction stores model version, input hash, output and uncertainty/evidence state.  
**FR-ML-006** Odor embedding versioned/reproducible.  
**FR-ML-007** Similarity identifies method/model/index/metric version.  
**FR-ML-008** Explainability is not represented as causal proof unless scientifically justified.

## 20. Dataset provenance

**FR-DATASET-001** Dataset Registry stores source/license/citation/version/checksum.  
**FR-DATASET-002** Transformations record code/version and hashes where feasible.  
**FR-DATASET-003** Training run identifies exact dataset versions.  
**FR-DATASET-004** Osmo Publications CC BY datasets retain attribution metadata.  
**FR-DATASET-005** No Osmo ODbL Taxonomy data enters V2 core without approved ADR.

## 21. RAG requirements

**FR-RAG-001** Source is approval/status controlled.  
**FR-RAG-002** Index retains source/version/chunk provenance.  
**FR-RAG-003** Retrieval result is re-authorized before response.  
**FR-RAG-004** Response returns bounded authorized citations/excerpts.  
**FR-RAG-005** RAG cannot decide compliance, stock, cost or Formula approval.  
**FR-RAG-006** Invalidation/reindex is durable/auditable.

## 22. Agent requirements

**FR-AG-001** Agent runs durable.  
**FR-AG-002** Workflow nodes/event protocol versioned.  
**FR-AG-003** Tool registry allow-listed/schema-validated.  
**FR-AG-004** Tool execution repeats tenant/permission check.  
**FR-AG-005** Side-effect tools use idempotency.  
**FR-AG-006** High-risk write uses explicit confirmation.  
**FR-AG-007** External LLM provider runs server-side.  
**FR-AG-008** Provider secret/raw hidden reasoning/raw errors not exposed to client/audit.  
**FR-AG-009** Event replay survives transport reconnect; transport is not source of truth.  
**FR-AG-010** Support cancel, bounded retry, durable lease/fencing.  
**FR-AG-011** genai-toolbox may provide governed MCP/database tools, but generic writes cannot bypass domain services.

## 23. Lineage requirements

**FR-LIN-001** Derive lineage from authoritative records.  
**FR-LIN-002** Support bounded traversal.  
**FR-LIN-003** Filter edges by tenant/permission.  
**FR-LIN-004** Include model/dataset/prediction/RAG/agent provenance.

## 24. API requirements

- versioned namespace
- typed schema contract
- correlation ID
- route-scoped idempotency
- consistent error envelope
- cursor pagination
- sensitive endpoints `no-store`
- no provider secret/internal stack trace
- explicit unavailable states

## 25. Event envelope

```json
{
  "eventId": "uuid",
  "eventType": "domain.entity.action",
  "version": 1,
  "organizationId": "org-id",
  "actorId": "user-or-service",
  "correlationId": "id",
  "occurredAt": "ISO-8601",
  "subject": {"type": "material", "id": "mat-id"},
  "payload": {}
}
```

Sensitive payloads must be minimized.

## 26. Consistency requirements

- authoritative mutation uses transaction
- event/outbox publishes after durable commit
- same idempotency key + same request returns persisted result
- same key + different request returns conflict
- history is not normal-UI hard deleted
- scientific/model/data artifacts are versioned/immutable

## 27. Non-functional requirements

**NFR-001 Security:** fail closed on authorization ambiguity.  
**NFR-002 Tenant isolation:** automated cross-tenant tests per tenant module.  
**NFR-003 Availability:** external AI failure does not corrupt domain state.  
**NFR-004 Performance:** expensive molecular/model/RAG work is async with progress.  
**NFR-005 Scalability:** scientific workers scale independently.  
**NFR-006 Reproducibility:** scientific results identify input/component/model versions.  
**NFR-007 Auditability:** privileged operations create durable audit evidence.  
**NFR-008 Accessibility:** keyboard/focus/reduced-motion + automated accessibility tests.  
**NFR-009 Localization:** UI localized; scientific identifiers language-neutral.  
**NFR-010 Observability:** internal platform telemetry + bounded Owner view.  
**NFR-011 Privacy:** logs/events minimize sensitive/personal content.  
**NFR-012 Supply chain:** dependencies pinned/locked/license/security scanned.

## 28. Service-to-service security

- separate service identity
- least privilege
- TLS
- rotated credentials
- private/signed internal communication
- user/tenant context forwarded as validated claims, not arbitrary public headers

## 29. Testing

Required:
- unit
- domain invariant
- API contract
- integration
- migration
- tenant isolation
- authorization
- idempotency/concurrency
- security
- accessibility
- visual regression
- scientific reproducibility
- model regression
- RAG authorization/citation
- agent replay/provider failure
- end-to-end critical flows

## 30. Release gates

Do not claim production-ready unless:
- migrations applied
- schema compatibility confirmed
- secrets configured
- tests green
- security/license scans accepted
- scientific versions pinned
- dataset attributions present
- key-role smoke tests executed
- observability confirms dependencies

## 31. Sentiment & Consumer Intelligence requirements

**FR-SENT-001** Store authorized feedback sources with source type, tenant, reference, timestamps and usage-policy metadata.  
**FR-SENT-002** Detect language and initially support EN/VI.  
**FR-SENT-003** Produce overall sentiment with confidence.  
**FR-SENT-004** Produce aspect sentiment with normalized aspect IDs and evidence references/spans where permitted.  
**FR-SENT-005** Extract perception/emotion and olfactory/performance descriptors.  
**FR-SENT-006** Create versioned Consumer Preference aggregates by source/product/project/segment/time window.  
**FR-SENT-007** Derived records identify model/provider/version and extraction/aggregation version.  
**FR-SENT-008** Raw feedback and aggregate access use separate permissions.  
**FR-SENT-009** Cross-tenant aggregation is prohibited unless a future explicitly governed dataset is approved.  
**FR-SENT-010** Source deletion/invalidation propagates to dependent aggregates/vector artifacts under policy.  
**FR-SENT-011** Formula Intelligence may consume sentiment only as bounded advisory/ranking input.  
**FR-SENT-012** Sentiment cannot automatically create/approve/mutate Formula, Trial, Material, Inventory or Production records.  
**FR-SENT-013** Expose explicit NOT_ENOUGH_EVIDENCE, LOW_CONFIDENCE, NOT_CONFIGURED or equivalent states.  
**FR-SENT-014** Consumer sentiment and Private Sensory Memory are separate persistence/version domains.  
**FR-SENT-015** External LLM/NLP extraction follows provider security, provenance and data-minimization requirements.
