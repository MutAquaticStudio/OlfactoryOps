# Legacy feature dependency map

This map was traced from navigation/page imports through API routes and persistence. It is the cleanup dependency order; it is not a V2 design.

## Lluch catalogue / old global materials

`App.tsx Materials directory and detail drawer`
→ `src/data/lluch-catalogue-2026.ts`
→ `NorthStarService.materials()`, `lluchCatalogue()`, `enrichMaterialsFromLluchCatalogue()`
→ `NorthstarController /materials/catalogues/lluch-2026*`
→ `worker/index.ts` catalogue routes + scheduled backfill
→ `worker/lluch-catalogue-store.ts`
→ `supplier_catalogue_imports`, `supplier_catalogue_products`, `global_material_publications`
→ `worker/material-evidence-rag.ts` global index branch
→ migrations `0035`, `0039`, `0041`, `0042`
→ catalogue/RAG/isolated-security tests.

Cleanup order: disable routes and scheduler → stop global RAG ingestion → remove active imports → archive source/fixtures → replace tests with negative assertions. No tenant material/lot/document/audit rows are deleted.

## Formula Intelligence / Design Studio / Optimizer

`navGroups` + `appRoutes.ts`
→ `src/features/formula-intelligence/FormulaIntelligenceWorkspaces.tsx`
→ `server/src/routes/northstar.controller.ts` and Worker `/formula-intelligence/*`
→ `worker/formula-intelligence.ts` + `server/src/services/agent-local-runtime.service.ts`
→ `agent_runs`, design projects, directions, optimizer candidates, confirmations, audit events
→ `migrations 0030–0032`, `0036–0037`, `0040`.

Cleanup order: remove active navigation/direct routes → return stable `410 V1_SURFACE_REMOVED` from API → keep generic run/event/lease/idempotency primitives for future V2 → archive product UI and deterministic candidate generation tests.

## Formula Agent generic runtime

`agent-runtime.ts` shared schemas/reducer/store
→ Worker/local run lifecycle and event replay
→ D1 `agent_*` tables and audit chain.

Keep the generic runtime. Remove only formula-specific UI/provider behavior and deterministic product generation from the active surface.

## Lab Usage and Trials

`App.tsx` lab usage/trials pages
→ existing `/lab-usage/*` and `/trials/*` APIs
→ `NorthStarService` immutable movement, FEFO, trial snapshots, sensory evidence
→ `inventory_movements`, `fragrance_trials`, sensory tables, audit chain.

Keep ledger, FEFO, traceability, and real sensory evidence. Any UI/product replacement is deferred and must not mutate or erase those records.

## Deferred import and compliance terminology

`App.tsx` import helpers / `/imports/*`
→ `NorthStarService.previewImport/commitImport`
→ `import_jobs` and material/lot writes.

`Supplier Material Profile` and standalone compliance routes
→ `NorthstarController` supplier/material profile methods
→ normalized supplier/compliance tables.

Remove from active V2 navigation/API only after confirming no preserved operational workflow calls them; preserve evidence rows and migration history.

## Execution status (2026-08-08)

- Dependency paths for the removed catalogue, Formula Intelligence, importer, supplier-profile, and phase-roadmap surfaces were verified and archived.
- Active navigation and product routes no longer load archived implementations. Compatibility boundaries are tested separately and return a stable removal response.
- Lab Usage, FEFO, trials, sensory records, production, procurement, orders, and audit-chain paths remain intentionally active because they protect operational history and customer data.
- No V2 replacement implementation was started during this checkpoint.
