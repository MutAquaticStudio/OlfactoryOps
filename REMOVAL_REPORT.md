# Pre-V2 removal report

## Scope

This checkpoint removes deprecated V1 product surfaces from the active runtime. It does not implement V2 scientific core, does not rewrite migrations, and does not delete tenant/customer data.

## Decisions

| Surface | Status | Runtime action | Data action |
|---|---|---|---|
| Lluch supplier catalogue / 1,986 global rows | PASS | Remove active UI/API/job/RAG entry points | Preserve source and existing rows as historical/reference data; no delete |
| Global scientific assumptions | PASS | Remove from active resolver/RAG | Preserve provenance/history; no V2 claims |
| Formula R&D / Design Studio / Optimizer | PASS | Remove active navigation and return `V1_SURFACE_REMOVED` | Preserve formulas and agent evidence |
| Formula Agent product behavior | PASS | Keep generic run/runtime primitives only | Preserve agent events/audit |
| Supplier Material Profile | PASS | Remove product terminology/route | Preserve supplier/compliance evidence |
| Lab Usage / Trials | PASS | Keep immutable ledger/FEFO/trial evidence; UI replacement later | Never erase movements or sensory evidence |
| CSV/XLSX import | PASS | Remove active V2 surface and dependency only when unreferenced | Preserve import history |
| Production/procurement/orders/fulfillment | PASS | No product removal | Preserve operational records |

## Safety outcome

No customer or tenant data was deleted. Historical migration files were not modified. Archived source remains available under `archive/legacy-v1` for provenance and rollback review.

## Verification status

Detailed gate results are in `CLEANUP_VERIFICATION.md`. This report is not a release approval by itself.

## Completed execution (2026-08-08)

The runtime boundary and archive moves described above are complete. The old catalogue/Formula Intelligence/import/supplier-profile/phase implementations are no longer active dependencies. The full reference explanation is in `LEGACY_REFERENCE_SCAN.md`.

The cleanup intentionally leaves historical migrations and all real tenant/customer evidence untouched. Build and test status is reported in `CLEANUP_VERIFICATION.md` after the fresh gate run.

## Finalization status (2026-08-08)

- Isolated role fixtures were generated in local Worker/D1 persistence only; no production credentials, tenant, or customer data were used.
- The authenticated matrix passed individually for Owner, Admin, Perfumer, Lab Manager, SENSORY_PANELIST, Brand, Finance, and Viewer. Each role was checked for session restoration, projected navigation, protected and denied routes, tenant-scoped permissions, sensitive-data capability boundaries, costing/inventory/trial visibility, and absence of removed V1 Formula Agent UI at the required responsive widths.
- Remote D1 verification, production smoke, external provider checks, and deployment are `NOT_APPLICABLE` for this transition baseline. No production release is being performed.
- The repository is ready for the cleanup checkpoint commit/tag once the final diff review is complete. V2 remains explicitly out of scope.
