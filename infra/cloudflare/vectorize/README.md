# Vectorize Index Contracts

## Purpose

- Enable semantic search for molecular/odor/multiple evidence families in separate logical indexes.

## Planned index families

1. `material-evidence`
2. `molecular-embedding`
3. `odor-embedding`

## Data governance rules

- Keep tenant filtering both at query boundary and in result post-check.
- Never mix semantic domains in one index.
- Use bounded query envelopes and explicit metadata constraints.
- Preserve provenance and schema version per indexed artifact.

## Index fields (minimum)

- `organizationId`
- `type`
- `status`
- `materialId` (where applicable)
- `documentId`
- `indexVersion`
- `projectionVersion`
- `sourceKind`

## Acceptance status

- Contract and runbook: PASS
- Provisioned indexes and runtime hooks: BLOCKED (env/provisioning pending)

