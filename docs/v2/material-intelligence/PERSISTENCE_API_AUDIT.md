# Material Intelligence Persistence and API Audit

## Current ownership

`v2_materials` is owned by `LabOperationsService`. Its browser-facing controller
provides the existing material CRUD surface and runs mutations in a tenant-scoped
Prisma transaction with permission, idempotency, audit, and event controls.

The generic Advanced import path terminates in
`LabOperationsService.applyCreateOnlyImport()`. It can create base material,
supplier, offer, and opening-inventory records, but it cannot persist the
Material Intelligence graph introduced by migration `0027`.

`MaterialIntelligenceService` owns the new product/entity/composition/evidence
boundary. Before this change it exposed only the latest scientific eligibility
decision. It already uses the canonical transaction context:
`app.organization_id` plus `app.user_id`.

## Existing contracts

- The canonical bulk classifier is
  `scripts/material_intelligence_bulk_precheck.py`. It owns workbook parsing,
  CAS handling, product classification, component planning, conflict routing,
  and fail-closed eligibility previews.
- Migration `0027_material_intelligence_foundation.sql` is authoritative for
  ChemicalEntity, ChemicalIdentifier, MaterialComponent, append-only evidence,
  and append-only eligibility decisions. It forces tenant RLS on all five new
  tables.
- API routes are declared in Nest controllers and compiled into decorator-free
  Worker delegates by `scripts/generate-v2-worker-transport.ts`.
- Read authorization uses the central permission registry. Sensitive Material
  Intelligence reads require `materials.viewSensitive`.

## Required audit record

```text
CURRENT_MATERIAL_WRITE_PATH=LabOperationsService tenant-scoped material mutations; Advanced create-only import for base records only
CURRENT_MATERIAL_READ_API=V2LabOperationsController /v2/lab/materials without Material Intelligence graph reads
CURRENT_MATERIAL_INTELLIGENCE_SERVICE=MaterialIntelligenceService latest eligibility read only
CURRENT_BULK_PRECHECK_RUNNER=scripts/material_intelligence_bulk_precheck.py deterministic preview classifier
CURRENT_TENANT_TRANSACTION_HELPER=Prisma transaction plus set_config(app.organization_id, app.user_id, true)
CURRENT_AUTHORIZATION_MODEL=PlatformService.requirePermission with central role capabilities
CURRENT_IDEMPOTENCY_MODEL=v2_operation_idempotency for browser mutations; deterministic source provenance required for operator bulk persistence
RECOMMENDED_MINIMAL_IMPLEMENTATION=extend MaterialIntelligenceService for bounded tenant reads and governed batch persistence; add a dedicated read-only controller; add a staging-only CLI that invokes the canonical precheck and never exposes a public bulk-write endpoint
```

## Minimal implementation decision

The operator runner will invoke the existing Python precheck without a shell,
validate its `BulkIngestPlan`, and default to `PREVIEW`. `APPLY` requires an
explicit staging environment, approved source SHA, tenant, actor, confirmation,
schema/RLS attestation, and bounded batches of 50 rows. Production is rejected
without a bypass.

Stable IDs are derived from tenant, source file hash, source sheet, source row,
and record role. That source identity is also retained in append-only evidence.
An already committed source row is validated and counted as an idempotent skip;
an interrupted run resumes at the first uncommitted batch. No global entity
reuse, CAS-only merge, structure guessing, inventory, or pricing is introduced.

The API will expose bounded summary and detail reads under
`/v2/material-intelligence`, require `materials.viewSensitive`, execute every
query inside the canonical tenant transaction, and normalize an absent `0027`
schema to `MATERIAL_INTELLIGENCE_NOT_AVAILABLE` without exposing database text.
