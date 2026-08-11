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
- Separate logical indexes for material evidence, molecular embeddings, and odor embeddings.
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

- Architectural docs and migration structure are being established in this checkpoint.
- Existing runtime code still uses D1 local adapters in many paths.
- Hyperdrive migration and runtime adapter swap are not yet complete.

## Acceptance status

| Item | Status |
|---|---|
| Cloudflare migration docs | PASS |
| CI container build pipeline | PASS (configured) |
| Remote cloud-worker/queue/workflow runtime adapter | BLOCKED |
| Hyperdrive cutover from D1 usage | BLOCKED |
| Production Docker default removal in CI/dev loop | In progress |

