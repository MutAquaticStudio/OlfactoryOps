# Cloudflare Workers Bindings

The implemented isolated V2 entrypoint is `worker/cloud-runtime/index.ts`.
It is intentionally separate from the legacy live Worker while staging
resources are absent.

## API Worker target env shape (future)

- `HYPERDRIVE` via Cloudflare Hyperdrive binding
- `R2_ARTIFACTS` for versioned scientific/artifact payloads
- `MATERIAL_EVIDENCE_VECTORS` is the only staging Vectorize binding. Molecular
  serving dimensionality is not pinned and odor remains `RESEARCH_ONLY`, so
  neither is bound or provisioned.
- `SCIENCE_FEATURES_QUEUE` / `SCIENCE_MODEL_QUEUE` queue bindings
- `WORKFLOW_SCIENCE_INGEST` / `WORKFLOW_PRODUCTION` workflow bindings
- `SCIENTIFIC_FEATURE_CONTAINER` / `SCIENTIFIC_MODEL_CONTAINER` Durable Object
  container bindings for private scientific invocation
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` only for secure CI/ops
- `CI_ARTIFACT_DIGEST`, `CI_BUILD_METADATA` from remote build systems

## Implemented internal runtime responsibilities

- Hyperdrive PostgreSQL health and tenant-scoped transaction adapter
- Private R2 artifacts, segregated Vectorize access, and Queue/Workflow science
  orchestration
- Container invocation with a bounded reference contract

The public V2 Nest API, AuthN/AuthZ, and hostname routes remain outside this
isolated Worker. Do not represent this internal Worker as a public API cutover.

## Migration note

`worker/index.ts` still references D1 because it is the preserved legacy
runtime. The new V2 Worker has no D1 binding and uses Hyperdrive/PostgreSQL as
its only transactional path. Do not route production traffic to it until the
staging render, deploy and smoke gates are evidenced.
