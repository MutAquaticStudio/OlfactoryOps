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
- Current status in this checkpoint: **BLOCKED** until remote PostgreSQL + Hyperdrive
  adapter rollout is fully validated.

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

Current status in this checkpoint: **BLOCKED** (documentation + folder contract only).

### Vectorize (Vector search)

- Purpose: vector retrieval and similarity lookups.
- Index families:
  - `material-evidence`
  - `molecular-embedding`
  - `odor-embedding`
- Requirements:
  - separate semantic models/index settings per family
  - tenant boundaries enforced on query + metadata filtering
  - no mixed-vector semantics in a single index
- Current status in this checkpoint: **BLOCKED** (index contracts documented, runtime
  integration pending).

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

Current status in this checkpoint: **BLOCKED** (contract references only).

### Workflows (Durable orchestration)

- Purpose: resumable multi-step science/ingest/agent pipelines.
- Requirements:
  - tenant-aware, permission-aware checkpoints
  - bounded step graph with versioned transitions
  - compensating/retry model without mutating authoritative business truth directly
- Current status in this checkpoint: **BLOCKED** (no production workflow bindings yet).

### Container compute (Scientific workloads)

- Purpose: CPU/GPU-bound scientific computation outside Worker boundaries.
- Runtime tiers:
  - scientific-feature-runtime (`RDKit`, `BCFP`, `MolFTP`, `Osmordred`)
  - scientific-model-runtime (`KGCNN`, `Transformer-CNN`, embeddings, prediction)
- Contract model:
  - queue/workflow submits a bounded job reference
  - container receives no tenant session credentials
  - output is structured artifact reference(s), not side-effect SQL writes

Current status in this checkpoint: **BLOCKED** (remote build pipeline in progress).

## Checkpoint rule for this branch

- Do not move production traffic to this architecture until all sections above
  are proven in non-production environment.
- This file is documentation-first during the migration checkpoint:
  _architecture contracts first, deployment execution second_.

