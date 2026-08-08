# OlfactoryOps V2 source of truth

This directory contains the Scope Lock V0.4 documents and the Phase 0 architecture contracts. Historical material, formula, and AI implementations remain under `docs/legacy/v1/**` and `archive/legacy-v1/**`.

Phase 0 defines boundaries, contracts, provenance, and verification only. No V2 product module, scientific engine, global material dataset, sentiment model, external LLM, or production migration is active.

Primary reading order:

1. `CODEX.md` (repository implementation contract)
2. `SRS.md`
3. `BRD.md`
4. `BRS.md`
5. `ARCHITECTURE.md`
6. `DATA_ARCHITECTURE.md`
7. `SERVICE_ARCHITECTURE.md`
8. `SECURITY_PRIVACY.md`
9. `SENTIMENT_CONSUMER_INTELLIGENCE.md`
10. `OSMO_ADOPTION_AND_PROVENANCE.md`
11. `MIGRATION_AND_ROADMAP.md`
12. `REQUIREMENTS_TRACEABILITY.md`
13. `manifests/scope-lock.yaml`
14. `manifests/osmo-components.yaml`

Phase 0 outputs are tracked in `PHASE_0_BASELINE.md`, `PHASE_0_ARCHITECTURE_MAP.md`, `PHASE_0_IMPLEMENTATION_REPORT.md`, `OSMO_COMPONENT_REGISTRY.md`, `V2_DATABASE_PLAN.md`, and `adr/`.

Phase 1 Platform Security Core is implemented on `codex/v2-phase1-platform-security` under `phase-1/`. It uses isolated `/v2/*` routes and PostgreSQL as the V2 source of truth. Current verdict: `PHASE_1_READY = YES`.

Static/build/schema/RLS gates, the authenticated 12-role matrix, member invitation workflow, and notification retry worker are `PASS` on disposable infrastructure. Cloudflare provisioning, remote migrations, and production deployment are `NOT_APPLICABLE` for this checkpoint. See `phase-1/PHASE_1_IMPLEMENTATION_REPORT.md` and `phase-1/ROLE_E2E_MATRIX.md` for evidence. Phase 2 remains out of scope for this checkpoint.
