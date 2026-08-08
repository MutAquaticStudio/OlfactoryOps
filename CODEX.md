# Current OlfactoryOps source of truth

This repository is in the mandatory pre-V2 cleanup checkpoint.

## Current

- `CODEX.md`
- `00_PRE_V2_CLEANUP.md`
- `docs/v2/*` (scope-lock and future V2 decisions only; no V2 implementation is included in cleanup)
- authenticated runtime invariants in `src/data/northStar.ts`, `server/`, and `worker/`

## Historical

- `docs/legacy/*`
- `archive/legacy-v1/*`
- immutable migration files under `migrations/`

Historical documentation and archived source MUST NOT be used to infer current V2 product requirements. The cleanup preserves tenant/customer data and generic infrastructure while removing deprecated V1 product surfaces from the active runtime.
