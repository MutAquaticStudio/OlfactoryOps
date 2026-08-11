# Scientific Container Runtime

## Objective

Move expensive scientific compute out of Workers and into containerized runtimes.

## Planned runtimes

### 1) scientific-feature-runtime
- RDKit
- BCFP
- MolFTP
- Osmordred
- Feature extract and structure normalization services

### 2) scientific-model-runtime
- KGCNN
- Transformer-CNN
- embedding/inference services
- prediction orchestration

## Adapter model

The platform keeps separate adapter contracts:
- `StructureAdapter`
- `FingerprintAdapter`
- `FragmentFeatureAdapter`
- `DescriptorAdapter`
- `GraphModelAdapter`
- `SmilesModelAdapter`
- `EmbeddingService`
- `PredictionService`

Adapters remain server-owned and versioned in contracts.
No domain module imports Osmo repositories directly.

## Invocation model

- Workers enqueue jobs through Queues/Workflows.
- Containers run bounded compute and return structured artifacts.
- Workers persist artifact references and provenance in PostgreSQL.

## Security and tenancy

- No tenant authorization in container payload.
- Signed/internal service call boundaries only.
- Containers never expose public APIs by default.
- Tenant IDs are always validated at Worker boundary before and after container execution.

## Container artifact policy

- Image tags use immutable Git SHA.
- Maintain retention of:
  - current deployed image
  - previous known-good image
  - release-tagged image

## Remote build integration

Scientific containers are built in GitHub Actions (`scientific-container.yml`), not as part of normal local development.

## Local fallback

Local Docker remains explicit manual-only:
`npm run test:model-runtime` (existing compatibility) and manual `docker build/run` in runtime folders.

