# Scientific Container Runtime Layout

## Purpose

Run CPU/GPU-bound scientific workloads outside Cloudflare Workers using Cloudflare Containers.

## Planned runtimes

- `scientific-feature-runtime`
  - Feature extraction and structure normalization services
  - RDKit / BCFP / MolFTP / Osmordred boundaries
- `scientific-model-runtime`
  - KGCNN / Transformer-CNN / embedding/inference jobs

## Invocation contract

- Workers dispatch jobs via queue/workflow references only.
- Containers receive bounded job envelopes:
  - `jobId`
- `tenantRef`
- `artifactReference`
- `resultChannel`
- `timeLimitSec`
- `schemaVersion`

## Output contract

- Containers return structured results references.
- No direct DB writes from container runtime.
- Domain verification and persistence remain in PostgreSQL + Worker orchestration.

## Image strategy

- Immutable image tags: `olfactoryops-scientific-<name>:<git-sha>`
- Keep at least:
  - current
  - previous known-good
  - release candidate tag

## Checkpoint status

- Remote build pipeline: PASS (documented)
- Container deployment bindings: BLOCKED (cloud env setup pending)

