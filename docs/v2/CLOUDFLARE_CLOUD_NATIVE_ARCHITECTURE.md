# Cloudflare Cloud-Native Architecture

## Current checkpoint intent

This checkpoint defines the migration target from local scientific runtime dependencies to a
Cloudflare-first runtime topology while keeping PostgreSQL as the V2 transactional source of truth.

Do not continue feature development while this architecture checkpoint is active.

## Target runtime topology

- Internet
  - Cloudflare edge
    - Tenant Router Worker (hostname routing + tenant resolution)
    - API Worker (authn/authz, orchestration, command fan-out)
- Runtime services
  - Postgres (authoritative data store)
    - accessed through Hyperdrive from API Worker
  - Cloudflare Queues (durable async handoff)
  - Cloudflare Workflows (long-running orchestration)
  - Cloudflare R2 (artifact and science payload storage)
  - Cloudflare Vectorize (vector index service)
  - Cloudflare Containers (scientific feature/runtime inference workloads)

## Non-negotiable principles

- PostgreSQL remains authoritative for all V2 domain data.
- Do not replace PostgreSQL with D1 for V2 transactional write paths.
- Domain services do not run full scientific inference inside Workers.
- Tenant isolation, RLS, and auditability are preserved unchanged.
- No production deployment from this checkpoint.

## Binding goals by layer

### Tenant Router Worker
- Resolve tenant by system hostname or API host routing.
- Delegate tenant-authenticated requests to API Worker.

### API Worker
- Keep API orchestration and security boundaries.
- Resolve PostgreSQL via Hyperdrive binding.
- Submit async jobs to Queues and Workflows where needed.
- Never expose secret tenant context by client payload.

### R2
- Store immutable or versioned artifacts only.
- Record tenant, type, hash, version, provenance metadata for each object.

### Vectorize
- The staging cutover binds only the approved Material Evidence index.
- Molecular embedding serving dimensionality is not pinned and odor remains
  `RESEARCH_ONLY`, so neither is bound or provisioned.
- Tenant filtering enforced at query boundary and RLS/re-check in API domain logic.

### Queues + Workflows
- Queue messages are idempotency-safe and contain references, not raw payloads.
- Workflows are resumable and bounded; they do not replace authoritative mutations.

### Containers
- Two bounded containers are the initial target:
  - Scientific feature runtime (RDKit, BCFP, MolFTP, Osmordred)
  - Scientific model/runtime (KGCNN, Transformer-CNN, embeddings/prediction)
- Containers receive minimum job references; container does not own tenant auth.

## Current state

- `worker/cloud-runtime/**` is the isolated V2 Worker entrypoint. It creates
  PostgreSQL clients from the `HYPERDRIVE` binding, not a browser URL or D1.
- The existing `worker/index.ts` and tenant router remain legacy/live
  compatibility paths; this migration does not hot-swap production traffic.
- R2 writes are private, hash/provenance-carrying and tenant-prefixed.
- Vectorize is fixed to the BGE-M3 1024D cosine Material Evidence binding. The
  caller cannot select another binding and tenant/model/status filtering is
  checked again in Worker code.
- Queue delivery has a PostgreSQL idempotency record, a unique Workflow id,
  append-only lifecycle events, bounded retry/DLQ state, and a
  hash-verified Workflow-to-container-to-R2 path for science.
- `wrangler.v2-cloud-runtime.example.toml` deliberately contains non-deployable
  staging placeholders. `cloud-runtime:render-staging` requires a real staging
  Hyperdrive UUID and immutable image digests before rendering a deployable file.
- The staging-only API Worker now derives 143 in-scope routes from the V2
  controller metadata and invokes the same shared application services through
  Hyperdrive. It is not deployed until a remote staging PostgreSQL origin and
  Hyperdrive configuration are approved.

## Acceptance status

| Item | Status |
|---|---|
| Cloudflare migration docs | PASS |
| Isolated V2 Worker bindings/adapters | PASS |
| Staging API and tenant-router source cutover | PASS |
| Remote cloud-worker/queue/workflow runtime | BLOCKED |
| Hyperdrive staging connectivity | BLOCKED |
| Local Docker required for normal development | PASS |
