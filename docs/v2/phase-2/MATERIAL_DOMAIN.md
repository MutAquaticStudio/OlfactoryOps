# Phase 2 Material Domain

## Authority

`v2_materials` is tenant-scoped PostgreSQL data. There is no V2 global
catalogue, legacy Lluch import, or shared master material path.

## Aggregate

A material owns business identity, reviewed identifiers, sensory metadata,
compliance facets, controlled document references, supplier offers, inventory
lots, and an optional molecular-identity reference. The only allowed material
scope is `TENANT`.

`DRAFT`, `REVIEW_REQUIRED`, `ACTIVE`, `BLOCKED`, and `ARCHIVED` are the
material states. `ACTIVE` and `BLOCKED` require `materials.approve`. A blocked
material or a material with a `BLOCKED` compliance facet cannot be received,
reserved, or consumed.

## Evidence boundary

Material document rows retain a kind, object reference, version, content hash,
review state, and reviewer. They do not store document payloads, run RAG, or
claim that a storage provider is configured. Molecular identities default to
`NOT_RESOLVED`; Phase 2 neither creates nor infers structure data.
