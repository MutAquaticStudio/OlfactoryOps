# OlfactoryOps V2 Phase 0 Baseline

## Scope

This document freezes the cleaned V1 repository as the transition baseline for V2. Phase 0 establishes contracts, boundaries, provenance rules, and decision records. It does not implement V2 product modules, scientific engines, sentiment models, provider activation, or production deployment.

## Repository baseline

- Repository: `MutAquaticStudio/OlfactoryOps`
- Phase 0 branch: `codex/formula-intelligence-hardening`
- Cleanup baseline commit: `e0d8e71e609dfffce0fb3241652230466df85a95`
- Cleanup baseline tag: `pre-v2-clean-baseline`
- Legacy migration head: `0044` (unchanged)
- Existing cleanup reports: `CLEANUP_VERIFICATION.md`, `REMOVAL_REPORT.md`, `LEGACY_REFERENCE_SCAN.md`
- Existing cleanup gates: PASS before Phase 0 work; no production deployment was performed.

## Handoff normalization

The V2 handoff documents supplied at repository root were moved under `docs/v2/` so the source of truth has one stable location. `CODEX.md`, `README.md`, and the legacy-removal prompt remain root-level project documents. No historical migration or production data was changed.

## Phase 0 outputs

- Shared contracts in `packages/contracts`.
- Versioned permissions in `packages/permissions`.
- Domain event envelope in `packages/domain-events`.
- Provenance vocabulary in `packages/provenance`.
- Scientific, sentiment, and agent-runtime boundary contracts under `services/`.
- Logical app/service/infra boundary READMEs.
- Architecture map, database plan, Osmo registry, and ADR-001 through ADR-011.
- Contract tests and `typecheck:v2` verification script.

## Guardrails

PostgreSQL is the V2 system of record. D1 remains the V1 edge/control-plane store until a separately approved migration. No Phase 0 file writes inventory, formula, approval, ledger, billing, or customer data. No training or cross-tenant learning is introduced.

## Verification vocabulary

`PASS` means evidence was run and met the Phase 0 criterion. `FAIL` means a required check failed. `BLOCKED` means the check could not run because an external prerequisite is unavailable. `NOT_APPLICABLE` means the check is intentionally outside this transition checkpoint.
