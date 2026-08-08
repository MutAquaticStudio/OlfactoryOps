# Legacy reference scan

**Scan date:** 2026-08-08 (finalization pass)
**Scope:** active source and runtime files under `src/`, `server/`, `worker/`, `scripts/`, and package metadata.
**Excluded by design:** `archive/legacy-v1/**`, `docs/legacy/v1/**`, `node_modules/**`, generated `dist*/`, and the authoritative cleanup plan/report documents.

## Method

The active tree was searched for deprecated feature vocabulary and entry points:

```text
rg -n "optimizer|Formula Intelligence|formula-agent|Design Studio|Reformulation|lluch|supplier_material|SOURCE_ONLY|global master" src server worker scripts package.json --glob '!**/*.test.*' --glob '!archive/**'
rg -n "internal-phases|@Get\('phases'\)|pattern: '/phases'" src server worker
```

The complete repository file inventory was completed before archival (215 repository files indexed at the final scan). Historical migrations were checked separately and were not edited.

## Explained matches

| Classification | Location | Explanation | Status |
|---|---|---|---|
| `ARCHIVE_DATA` | `src/data/appRoutes.ts`, `src/data/appRoutes.test.ts`, `worker/tenant-app-router.test.ts` | Old Formula Agent/Design Studio/Optimizer/import/catalogue paths are explicit compatibility boundaries. They return `410 V1_SURFACE_REMOVED`; they are not active handlers or navigation entries. | PASS |
| `ARCHIVE_DATA` | `src/App.tsx`, `server/src/routes/northstar.controller.ts`, `server/src/services/northstar.service.ts`, `src/data/northStar.ts`, `src/features/trials/TrialsWorkspace.tsx` | Lab Usage is retained as the immutable inventory movement/FEFO ledger and trial evidence link. These references are operational traceability, not the deferred Formula Intelligence product surface. | PASS |
| `HISTORICAL_MIGRATION_DO_NOT_EDIT` | `migrations/0027_operational_p1_enterprise.sql`, `migrations/0034_fragrance_operating_memory.sql`, `migrations/0035_lluch_supplier_catalogue.sql`, `migrations/0041_lluch_global_master_materials.sql`, `migrations/0042_lluch_master_cas_variants.sql` | Applied D1 history and data provenance. No runtime query or migration file was deleted or rewritten as part of cleanup. | PASS |
| `ARCHIVE_DATA` | `archive/legacy-v1/**`, `docs/legacy/v1/**` | Source projections, old runtime implementations, tests, and prior planning documents are retained for provenance and rollback review, excluded from build/test active paths. | PASS |
| `PLANNING_DOCUMENT` | `00_PRE_V2_CLEANUP.md`, `PRE_V2_BASELINE.md`, `LEGACY_FILE_INVENTORY.md`, `LEGACY_FEATURE_DEPENDENCY_MAP.md`, `REMOVAL_REPORT.md`, `CLEANUP_VERIFICATION.md` | These documents necessarily name removed surfaces because they are the audit record. | PASS |

## Active-tree result

- No active import remains for the archived Lluch source, supplier profile projection, Formula Intelligence UI/runtime, or internal phase roadmap.
- No active Worker/Local API route remains for removed catalogue/import/Formula Intelligence product surfaces; compatibility requests are rejected explicitly.
- No new global-material or provider-backed Formula Intelligence behavior is present in the active tree.
- Generic `src/data/agentRuntime.ts` contains only the dependency-free runtime protocol/reducer contract; formula-specific provider behavior is archived.
- Remaining `provider` matches are billing, SSO, transactional email, or Cloudflare SaaS integration code and are unrelated to removed V1 surfaces.

## Result

`PASS` for explained legacy references. Any future V2 implementation must add a new dependency map and must not reactivate archived routes or source projections without a new scope decision.

## Finalization re-scan

- The active-tree search was repeated after the authenticated role harness changes.
- Zero unexplained active references were found for the removed Formula Agent/Design Studio/Optimizer product surfaces, Lluch runtime/source projections, supplier-profile product route, catalogue/import jobs, or internal phase roadmap.
- The only remaining matches are the explained compatibility boundaries, preserved Lab Usage/ledger terminology, historical migrations, archive material, and audit/planning documents listed above.
- `git diff --check` remains clean; no migration from `0001` through `0044` was modified.
