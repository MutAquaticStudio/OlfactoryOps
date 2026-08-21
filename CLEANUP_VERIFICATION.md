# Cleanup verification

**Run date:** 2026-08-08
**Branch:** `codex/formula-intelligence-hardening`
**Baseline:** `PRE_V2_BASELINE.md`
**Rule:** statuses are limited to `PASS`, `FAIL`, `BLOCKED`, and `NOT_APPLICABLE`.

## Repository and runtime boundary

| Gate | Status | Evidence |
|---|---|---|
| Repository inventory complete | PASS | `LEGACY_FILE_INVENTORY.md` records the pre-delete scan and execution status. |
| Dependency map complete | PASS | `LEGACY_FEATURE_DEPENDENCY_MAP.md` traces navigation, API, services, persistence, and preserved ledger paths. |
| Legacy docs isolated | PASS | Historical plans/reports moved to `docs/legacy/v1/**`; active docs link to the archive. |
| Deprecated active UI removed | PASS | Archived Formula Agent/Design Studio/Optimizer UI has no active import; removed paths are handled as compatibility boundaries. |
| Deprecated active API removed | PASS | `server/src/main.ts` and `worker/index.ts` reject removed V1 paths with `V1_SURFACE_REMOVED`; no old product handlers remain. |
| Obsolete jobs/tools removed | PASS | Catalogue/importer job and route wiring removed from active Worker/API; no active source caller remains. |
| Old Lluch/catalogue data isolated | PASS | Source projections and catalogue runtime are under `archive/legacy-v1/**`; historical D1 migrations and provenance are untouched. |
| Legacy Formula scientific behavior removed | PASS | Formula-specific agent/provider behavior is archived; active `src/data/agentRuntime.ts` is a generic protocol/reducer contract only. |
| Dead references explained | PASS | `LEGACY_REFERENCE_SCAN.md` classifies compatibility paths, preserved ledger terminology, migrations, archives, and planning docs. |

## Data and security preservation

| Gate | Status | Evidence |
|---|---|---|
| Historical migrations preserved | PASS | `npm run release:migrations:verify` reports head `0044`, count `44`, valid inventory hash; no migration diff was introduced. |
| Tenant/customer IP protected | PASS | No D1 delete, destructive migration, or customer-data mutation was executed. |
| Tenant isolation / RBAC / CSRF / ledger / FEFO local regression | PASS | `npm.cmd test`: 23 files, 206 tests passed, including Phase 0 contract tests. |
| Client secret scan | PASS | `npm run security:client-bundle` passed. |
| Dependency audit | PASS | `npm audit --omit=dev --audit-level=high` reported 0 vulnerabilities. |

## Build and documentation gates

| Gate | Status | Evidence |
|---|---|---|
| Frontend build | PASS | `npm run build` passed; Vite transformed 813 modules. |
| Local API build | PASS | `npm run build:api` passed. |
| Worker typecheck | PASS | `npm run typecheck:worker` passed. |
| Worker dry-run build | PASS | `npm run build:worker` passed; bindings resolved without deployment. |
| Tenant router dry-run build | PASS | `npm run build:tenant-router` passed. |
| Lint | PASS | `npm run lint` passed without warnings after import cleanup. |
| Migration verification | PASS | `npm run release:migrations:verify` passed locally. |
| Release documentation check | PASS | `npm run release:docs:check` passed for version `0.1.0-rc.1` and migration head `0044`. |
| Non-secret release gate | PASS | `npm run release:nonsecret-gate` passed. |
| Release provenance | NOT_APPLICABLE | This is a frozen transition baseline, not a legacy production release; provenance promotion is deferred until the cleanup checkpoint commit/tag exists. |

## Browser and environment gates

| Gate | Status | Evidence |
|---|---|---|
| Public responsive/accessibility smoke | PASS | `npm run test:ux`: 17 passed across 320/375/390/768/1024/1280/1440/1920px; public landing, auth routing, signup shell and overflow/critical Axe checks passed. |
| Authenticated role matrix | PASS | Isolated local Worker/D1 fixture run `role-fixtures-9da79078-bfde-4cee-b4eb-e5ca089f9f9e`: Owner, Admin, Perfumer, Lab Manager, SENSORY_PANELIST, Brand, Finance, and Viewer each passed session restore, navigation projection, protected-route access, denied costing projection, tenant-scoped `/me` permissions, sensitive permission checks, and removed Formula Agent absence across 320/375/390/768/1024/1280/1440/1920px. Eight role workflows passed; the 56 non-matrix Playwright project entries were intentionally skipped by the dedicated desktop matrix guard. No production credential or tenant was used. |
| Remote D1 migration verification | NOT_APPLICABLE | The cleaned legacy repository is being frozen as the transition baseline for OlfactoryOps V2. No legacy production release is being performed. |
| Production smoke / external integrations | NOT_APPLICABLE | The cleaned legacy repository is being frozen as the transition baseline for OlfactoryOps V2. No legacy production release is being performed. |

### Authenticated role matrix (individual results)

Each row below is an independent fixture and browser context from the isolated local Worker/D1 run. The matrix covered login/session restore, projected navigation, protected and denied routes, tenant-scoped `/me` permissions, capability-sensitive surfaces, and removed V1 Formula Agent absence at all eight required viewports.

| Role | Login/session | Navigation projection | Protected/denied routes | Sensitive surfaces | Deprecated V1 absence | Responsive run |
|---|---|---|---|---|---|---|
| Owner | PASS | PASS | PASS | PASS | PASS | PASS |
| Admin | PASS | PASS | PASS | PASS | PASS | PASS |
| Perfumer | PASS | PASS | PASS | PASS | PASS | PASS |
| Lab Manager | PASS | PASS | PASS | PASS | PASS | PASS |
| SENSORY_PANELIST | PASS | PASS | PASS | PASS | PASS | PASS |
| Brand | PASS | PASS | PASS | PASS | PASS | PASS |
| Finance | PASS | PASS | PASS | PASS | PASS | PASS |
| Viewer | PASS | PASS | PASS | PASS | PASS | PASS |

## Exit verdict

`PASS` for the Pre-V2 cleanup baseline. All applicable local, build, security, migration, public UX, and isolated authenticated role gates pass. Remote D1 and production smoke are explicitly `NOT_APPLICABLE` because this repository is being frozen as the transition baseline; no V2 implementation or legacy production release has started.
