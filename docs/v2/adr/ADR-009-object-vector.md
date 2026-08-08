# ADR-009: Object and Vector Storage

## Context
Documents, scientific artifacts, and embeddings have different access and lifecycle needs.

## Decision
Private objects live behind a storage adapter; PostgreSQL owns metadata and authorization; vector indexes contain derived, revocable, tenant-filtered embeddings.

## Alternatives considered
Store full documents in vectors; expose signed URLs as authorization; put all content in the relational database.

## Consequences
Retrieval is efficient and revocable, but invalidation jobs and metadata consistency are required.

## Security impact
Post-query authorization rechecks prevent stale or cross-tenant evidence leakage.

## Migration impact
Existing document storage remains compatible until a reviewed V2 adapter and backfill exist.

## Status
Accepted for Phase 0.
