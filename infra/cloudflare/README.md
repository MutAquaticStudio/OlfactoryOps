# Cloudflare Infrastructure Boundary

This directory is the migration landing zone for the Cloudflare cloud-native
runtime architecture.

## Scope of this checkpoint

- The product architecture now targets:
  - Cloudflare Workers for API and tenant routing.
- PostgreSQL remains the V2 transactional system of record.
- Hyperdrive is the intended runtime path from Workers to PostgreSQL.
- R2, Vectorize, Queues, and Workflows host artifacts, vector/search, async
  dispatch, and durable orchestration.
- Scientific workloads are containerized and remote-built; local Docker is
  not a required default execution path for Codex/QA.
- Local Docker remains only for explicit developer opt-in troubleshooting.
- Production deployment is intentionally not part of this checkpoint.

## Current branch/tag

- Working branch: `codex/cloudflare-cloud-native-runtime`
- Pre-migration checkpoint: `pre-cloudflare-cloud-native-migration-20260810`
- Current migration tag (planned): `v2-cloudflare-runtime-foundation` will be created after this branch is validated.

## Top-level map

- `workers/` Worker entrypoints, bindings, and environment projection
- `hyperdrive/` PostgreSQL connectivity strategy and migration notes
- `r2/` Artifact and evidence storage layout
- `vectorize/` Vector search index families and tenant scoping
- `queues/` Queue contracts, idempotency, and retry/ DLQ policy
- `workflows/` Durable flow topologies and state transitions
- `containers/` Scientific container runtime separation and CI build notes

## Contract-first migration state

This checkpoint focuses on:

- Cloudflare architecture runbooks and contract docs
- CI workflow layout for remote scientific container builds
- Queue/workflow/container test boundaries and evidence paths
- Safe local Docker decommission strategy and script support

Production architecture hardening is blocked until migration credentials,
remote PostgreSQL, and environment smoke deployment are available.

Do not treat this folder as a runtime-complete handoff until all required
remote gates and verification steps are completed.
