# Vectorize Index Contracts

## Purpose

- Enable tenant-scoped Material Evidence retrieval in the one approved staging
  serving index.

## Staging index family

1. `material-evidence`: BGE-M3, 1024D, cosine.

Molecular serving dimensionality is not pinned and odor retrieval is
`RESEARCH_ONLY`; neither is provisioned or bound in this cutover.

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

- Material Evidence Worker adapter: PASS
- Staging Material Evidence index: PASS
- Live tenant query smoke: BLOCKED
- Molecular/odor staging indexes: NOT_APPLICABLE
