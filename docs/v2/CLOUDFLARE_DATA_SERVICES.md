# Cloudflare Data Services Integration

## Scope

This document defines the required Cloudflare data services for the cloud-native
runtime checkpoint in branch `codex/cloudflare-cloud-native-runtime`.

- PostgreSQL remains the authoritative transactional store for V2.
- V2 services are expected to access PostgreSQL via Hyperdrive where possible.
- Cloud-native managed services are used only for non-authoritative workflows
  (artifacts, vector retrieval, async dispatch, durable orchestration).

## Service contracts

### Hyperdrive (Primary PostgreSQL path)

- Purpose: managed PostgreSQL connectivity from Workers.
- Direction: API Worker (`wrangler.toml`) and Tenant Router Worker read-only
  routing state.
- Contract:
  - Worker transaction boundaries remain server-side and tenant-scoped.
  - All writes that currently pass through D1-internal SQL patterns are migrated to
    PostgreSQL adapters before this service becomes authoritative.
- Runtime adapter: **PASS** in `worker/cloud-runtime/hyperdrive.ts`; it builds
  `PrismaPg` from `env.HYPERDRIVE.connectionString` and scopes PostgreSQL
  transaction settings for the resolved tenant.
- Remote status: **BLOCKED** until an approved staging PostgreSQL instance and
  Hyperdrive configuration are supplied. No provider is selected by code.

### R2 (Artifacts)

- Purpose: immutable or versioned large payloads and generated outputs.
- Usage in-scope:
  - scientific outputs and model artifacts references
  - evidence packages and report exports
  - generated RAG chunks/previews and signed references
  - binary upload snapshots used by outbox notifications
- Non-goals:
  - no business truth storage
  - no direct inventory/material master replacement
- Governance:
  - tenant-scoped object paths and organization metadata
  - artifact hash + content type + retention tag
  - provenance and version metadata in PostgreSQL rows

Current status: **PASS** for the private Worker adapter and local contract
tests. The scientific Workflow verifies the input content hash before sending
the parsed, bounded payload to a Container and records the actual persisted R2
key in PostgreSQL. **BLOCKED** for the absent staging bucket binding.

### Vectorize (Vector search)

- Purpose: vector retrieval and similarity lookups.
- Staging index family: `material-evidence` only.
- `molecular-embedding` is not provisioned because it has no pinned serving
  dimension. `odor-embedding` remains `RESEARCH_ONLY` and is not provisioned.
- Requirements:
  - separate semantic models/index settings per family
  - tenant boundaries enforced on query + metadata filtering
  - no mixed-vector semantics in a single index
- Current status: **PASS** for the Material Evidence binding adapter and
  tenant/model/version filter tests; **NOT_APPLICABLE** for molecular and odor
  provisioning in this staging cutover.

### Queues (Async dispatch)

- Purpose: durable async command/event fan-out where eventual consistency is acceptable.
- Expected message shape:
  - `job_id`, `tenant_id`, `correlation_id`, `idempotency_key`, `job_type`,
    `schema_version`
  - references only (no unbounded raw payloads)
- Hard requirements:
  - idempotent consumption
  - bounded retry and dead-letter policy
  - immutable audit linkage back to originating request

Current status: **PASS** for the producer/consumer contract and PostgreSQL
idempotency state machine. Submission, workflow reservation, completion and
retry/DLQ transitions emit append-only correlation-linked events. **BLOCKED**
for staging Queue/DLQ provisioning.

### Workflows (Durable orchestration)

- Purpose: resumable multi-step science/ingest/agent pipelines.
- Requirements:
  - tenant-aware, permission-aware checkpoints
  - bounded step graph with versioned transitions
  - compensating/retry model without mutating authoritative business truth directly
- Current status: **PASS** for the isolated scientific Workflow implementation;
  **BLOCKED** for staging Workflow/Container deployment and smoke evidence.

### Container compute (Scientific workloads)

- Purpose: CPU/GPU-bound scientific computation outside Worker boundaries.
- Runtime tiers:
  - scientific-feature-runtime (`RDKit`, `BCFP`, `MolFTP`, `Osmordred`)
  - scientific-model-runtime (`KGCNN`, `Transformer-CNN`, embeddings, prediction)
- Contract model:
  - queue/workflow submits a bounded job reference
  - container receives no tenant session credentials
  - output is structured artifact reference(s), not side-effect SQL writes

Current status: **PASS** for the private Container entrypoint and immutable
image CI configuration; **BLOCKED** for registry credentials, pushed digest,
and an isolated staging invocation.

## Checkpoint rule for this branch

- Do not move production traffic to this architecture until all sections above
  are proven in non-production environment.
- This file is documentation-first during the migration checkpoint:
  _architecture contracts first, deployment execution second_.
