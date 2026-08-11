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

- Local Container class and private Worker/Workflow invocation contract: PASS
- Input integrity: Worker reads a tenant-scoped R2 artifact, checks its hash,
  and sends only the validated bounded scientific fields with an internal
  shared-secret header. The returned payload is persisted by the Worker; a
  Container never receives database credentials or performs a direct write.
- Remote Linux/amd64 build workflow: PASS (configured, credential-gated)
- Registry image digest and Container deployment: BLOCKED (staging
  credentials/resources are not configured)
