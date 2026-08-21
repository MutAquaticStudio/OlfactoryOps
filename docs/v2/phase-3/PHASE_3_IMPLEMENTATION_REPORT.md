# OlfactoryOps V2 Phase 3 Implementation Report

## Verdict

`PHASE_3_READY = YES`.

Phase 3 establishes an isolated, provenance-pinned scientific feature
boundary. PostgreSQL is the V2 system of record for molecular identities,
scientific jobs, artifacts, and audit evidence. The browser never reaches a
native scientific runtime, and no external model, data source, LLM, or
production environment was activated.

## Delivered work

- Additive migration `0004_phase3_scientific_features.sql` for molecular
  identity extensions, versioned scientific jobs/artifacts, and a global,
  immutable component-pin registry. Legacy D1 migrations `0001-0044` remain
  unchanged.
- Private Python scientific runtime for bounded SMILES normalization, RDKit
  canonicalization, optional InChI/InChIKey, structural graph generation, and
  deterministic ECFP artifacts.
- Native, exact-pinned BCFP and MolFTP adapters in an RDKit 2026 runtime. BCFP
  is never substituted with ECFP; MolFTP returns `NOT_EVALUATED` until a future
  registered target data context provides aligned, finite labels.
- Isolated Osmordred adapter in its required RDKit 2023.09.3 runtime. The V2
  composite runtime combines primary and descriptor artifacts only after a
  matching structure-hash check; an ABI or canonicalization mismatch fails
  closed.
- V2-scoped Nest endpoints protected by opaque sessions, CSRF/Origin checks,
  `materials.viewSensitive` and `scientific_ai.use`, idempotency, audit
  evidence, tenant RLS, bounded payloads, and normalized failures.
- Immutable source pins in
  `services/scientific/runtime/component-pins.json`, including repository,
  license, exact commit, adapter/runtime version, patch state, and native
  compatibility test.

## Verification evidence

| Gate | Status | Evidence |
|---|---|---|
| Shared TypeScript tests | PASS | `npm.cmd test`: 28 files, 236 tests |
| Lint and V2 typecheck | PASS | `npm.cmd run lint`, `npm.cmd run typecheck:v2` |
| Frontend/API/Worker/router builds | PASS | `npm.cmd run build`, `build:api`, `typecheck:worker`, `build:worker`, and `build:tenant-router` |
| PostgreSQL migration and RLS harness | PASS | `npm.cmd run v2:postgres:verify` applied `0004`; `v2:postgres:rls` verified scientific tenant denial, permissions, idempotency, and artifact persistence |
| Authenticated role matrix | PASS | 12 disposable-tenant roles passed independently: Owner, Admin, Lab Manager, Perfumer, R&D Scientist, Lab Technician, Procurement, Sensory Panelist, Brand, Supplier, Finance, and Viewer |
| Public UX/accessibility smoke | PASS | `npm.cmd run test:ux`: 33 applicable checks passed across 320–1920px; credential-gated legacy cases remained skipped |
| Client secret scan and dependency audit | PASS | `npm.cmd run security:client-bundle`; `npm.cmd audit --omit=dev --audit-level=high`: 0 vulnerabilities |
| RDKit normalization and canonical identity | PASS | `OCC` and `CCO` produced the same canonical structure hash; invalid SMILES produced no scientific claim |
| BCFP native runtime | PASS | `Dockerfile` built the exact adapter and native test suite passed |
| MolFTP native runtime | PASS | `Dockerfile` built the exact adapter; no target context returned `NOT_EVALUATED` |
| Osmordred native runtime | PASS | `Dockerfile.osmordred` built the isolated exact adapter and descriptor test passed |
| Cross-runtime HTTP smoke | PASS | Primary and isolated descriptor services returned matching structure hashes; the descriptor response contained an Osmordred artifact with eight curated values |
| Native artifact mismatch failure | PASS | composite runtime unit test rejects differing structure hashes with `SCIENTIFIC_RUNTIME_STRUCTURE_MISMATCH` |
| Documentation, diff check, remote migration, production deploy, external model/data/LLM activation | NOT_APPLICABLE | Phase 3 is a local checkpoint; none of these operations is authorized or required |

## Reproducible native checks

```powershell
docker build --file services/scientific/runtime/Dockerfile --tag olfactoryops-scientific-phase3 services/scientific/runtime
docker run --rm -e SCIENTIFIC_SERVICE_SHARED_SECRET=local-test-secret olfactoryops-scientific-phase3 python -m unittest discover -s tests

docker build --file services/scientific/runtime/Dockerfile.osmordred --tag olfactoryops-scientific-osmordred-phase3 services/scientific/runtime
docker run --rm -e SCIENTIFIC_SERVICE_SHARED_SECRET=local-test-secret olfactoryops-scientific-osmordred-phase3 python -m unittest discover -s tests
```

## Scope boundary

No Phase 4 model/dataset work, Phase 5 odor intelligence, Phase 5B sentiment,
Phase 6 Formula/Design Studio/LLM work, legacy catalogue import, remote
migration, or deployment has begun.
