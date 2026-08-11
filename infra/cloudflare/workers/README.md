# Cloudflare Workers Bindings (Migration Readiness)

This folder defines the target Worker binding contract used by the migration
checkpoint.

## API Worker target env shape (future)

- `HYPERDRIVE` via Cloudflare Hyperdrive binding
- `R2_ARTIFACTS` for versioned scientific/artifact payloads
- `RAG_MATERIAL_VECTORS`, `RAG_ODOR_VECTORS`, `RAG_MOLECULE_VECTORS` Vectorize bindings (separate indexes)
- `SCIENCE_FEATURES_QUEUE` / `SCIENCE_MODEL_QUEUE` queue bindings
- `WORKFLOW_SCIENCE_INGEST` / `WORKFLOW_PRODUCTION` workflow bindings
- `SOMETHING` for container call hooks (hosted container dispatch adapter)
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` only for secure CI/ops
- `CI_ARTIFACT_DIGEST`, `CI_BUILD_METADATA` from remote build systems

## Runtime responsibilities

- AuthN / authZ / session projection
- Hostname routing decision and capability projection
- Transactional orchestration against PostgreSQL through Hyperdrive
- Asynchronous job submission to queues/workflows
- Read-only results/progress caching only

## Migration note

Existing runtime files still reference D1 for legacy transition.
For this checkpoint, do not attempt D1-only behavior as authoritative truth.
Workers must eventually treat PostgreSQL through Hyperdrive as primary source.

