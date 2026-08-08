# Legacy file inventory

Inventory completed before cleanup. Paths below are the relevant legacy surface, not a blanket permission to delete the repository. `HISTORICAL_MIGRATION_DO_NOT_EDIT` is used for applied D1 history.

| Path / directory | Purpose | Feature/domain | Shared? | Data dependency | Classification | Intended action | Risk | Notes |
|---|---|---|---|---|---|---|---|---|
| `src/data/lluch-catalogue-2026.ts` | Lluch source projection, enrichment, global directory | Lluch/materials | No after removal | 0035, 0041, 0042 tables and source arrays | ARCHIVE | Move to `archive/legacy-v1/src-data`; remove imports | HIGH | Contains 1,986 catalogue-derived rows |
| `src/data/lluch-catalogue-2026-products.ts` | Embedded 1,986 product rows | Lluch/materials | No | Lluch source checksum | ARCHIVE | Move with source projection; never load in active bundle | HIGH | Supplier IP/provenance preserved |
| `src/data/lluch-catalogue-2026-evidence.ts` | Supplier-declared evidence rows | Lluch/materials/RAG | No | Catalogue evidence | ARCHIVE | Move with source projection | HIGH | Do not treat as regulatory truth |
| `src/data/lluch-catalogue-2026.test.ts` | Tests for old global library | Lluch/materials | No | 1,986 fixture expectations | REPLACE | Replace with negative cleanup tests | MEDIUM | Old count must not remain an active invariant |
| `worker/lluch-catalogue-store.ts` | D1 supplier catalogue import/search | Lluch/worker | No | `supplier_catalogue_*` | ARCHIVE | Move to `archive/legacy-v1/worker`; remove route/job imports | HIGH | No production deletion |
| `worker/material-evidence-rag.ts` | RAG ingestion including global Lluch path | RAG | Yes for private evidence | `material_evidence_*`, Vectorize | REFACTOR | Retain tenant/private evidence; remove global catalogue branch | HIGH | RAG security concepts are preserved |
| `worker/formula-intelligence.ts` | Design Studio and optimizer product workflows | Formula Intelligence | Generic runtime seam shared | agent/brief/direction tables | DEFER | Disable product routes; preserve generic runtime contracts for later V2 | HIGH | No provider activation |
| `src/features/formula-intelligence/FormulaIntelligenceWorkspaces.tsx` | Design Studio/Optimizer UI | Formula R&D/AI | No after nav removal | formula-intelligence API | ARCHIVE | Move to `archive/legacy-v1/ui`; remove active imports | HIGH | Old product UI is not V2 truth |
| `src/features/ai-formula-agent/FormulaAgentWorkspace.tsx` | Old Formula Agent UI | Formula Agent | No | agent runtime | ARCHIVE | Move to archive; keep generic runtime types | MEDIUM | Compatibility route removed |
| `src/features/trials/*` | Trial/sensory UI and projections | Trials/Sensory | Domain primitives are shared | 0034 tables | DEFER | Preserve data/service primitives; remove old product route if not required by current surface | HIGH | Real evidence is not deleted |
| `server/src/services/agent-local-runtime.service.ts` | Local agent runtime + optimizer/design logic | Agent runtime | Yes | local in-memory + API contracts | REFACTOR | Keep generic run/lease/idempotency; remove product candidate generation | HIGH | Worker/local parity must remain buildable |
| `server/src/routes/northstar.controller.ts` | Local API routes | API | Yes | all normalized tables | REFACTOR | Return stable 410 for deprecated product routes; preserve operational routes | HIGH | No undocumented legacy API remains callable |
| `worker/index.ts` | Worker route table, cron and persistence | Worker API | Yes | D1/KV/AI/Vectorize | REFACTOR | Reject deprecated paths; remove catalogue cron and handlers | HIGH | Historical helpers may be archived |
| `migrations/0030_ai_formula_agent.sql`–`0044_email_verification.sql` | Applied D1 history | Database | Yes | production/test D1 | HISTORICAL_MIGRATION_DO_NOT_EDIT | Leave byte-for-byte unchanged | HIGH | Forward-only migration only if data schema changes |
| `src/data/northStar.ts` | Shared domain types, seed data, formulas/material resolver | Core domain | Yes | snapshots and normalized persistence | REFACTOR | Keep tenant material/ledger/RBAC; remove active global catalogue projection | HIGH | Do not delete private records |
| `README.md` | Product/setup documentation | Documentation | Yes | none | REFACTOR | Add current-source marker; move stale V1 sections to historical docs over time | MEDIUM | Existing history remains useful evidence |
| `docs/agent-platform/*`, `docs/competitive-moat/*`, `docs/ai-formula-agent-plan.md` | Prior AI/competitive plans and reports | Documentation | No | none | ARCHIVE | Move to `docs/legacy/v1` with historical headers | LOW | Not current V2 requirements |
| `src/App.tsx` and `src/data/appRoutes.ts` | Navigation and route resolution | Frontend shell | Yes | all domains | REFACTOR | Remove deprecated nav/routes; preserve direct operational routes | HIGH | Route removal is runtime-visible, not CSS hiding |
| `src/data/nox-lab-editorial-material-profiles.ts` | Editorial material assumptions | Global scientific data | No | material seed | ARCHIVE | Move to archive; no V2 scientific claims | HIGH | Not legal/compliance evidence |
| `read-excel-file` dependency and import helpers | CSV/XLSX import | Deferred import | No after route removal | `import_jobs` | REFACTOR | Remove active UI/API dependency if no remaining import caller | MEDIUM | Migration history remains |

## Execution status (2026-08-08)

- Completed the pre-delete dependency trace and archived the source/runtime files listed above under `archive/legacy-v1/**`.
- Removed active navigation, route handlers, catalogue jobs, supplier-profile handlers, and Formula Intelligence product runtime. Compatibility requests remain explicit `410 V1_SURFACE_REMOVED` responses where required.
- Preserved all historical migrations, tenant/customer records, formula history, inventory movements, trial/sensory evidence, documents, orders, and audit records. No database delete or destructive migration was executed.
- Archived `server/src/data/internal-phases.ts` after confirming there were no remaining imports or route handlers.
- The current reference classification and zero-unexplained-reference check are recorded in `LEGACY_REFERENCE_SCAN.md`.
