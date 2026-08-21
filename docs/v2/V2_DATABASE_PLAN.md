# OlfactoryOps V2 Database Plan

## Authority

PostgreSQL is the sole authoritative V2 system of record. It owns tenant membership, materials, suppliers, inventory, procurement, formulas, trials, sensory evidence, production, commerce, lineage, provenance, RAG metadata, scientific artifacts, sentiment evidence, and agent jobs.

D1 remains the current V1 edge/control-plane store. Phase 0 does not add or alter D1 migrations. There must be no second writer for authoritative V2 records.

## Tenancy and security

- Every tenant-owned table has `organization_id` and a composite index beginning with it.
- Repositories require a validated `TenantContext`; no repository accepts a tenant ID from untrusted request body data.
- PostgreSQL row-level security is the final defense; service authorization and permission checks remain explicit.
- Public sensory links use opaque, hashed tokens and a reduced projection.
- Audit and provenance records are append-only; administrative correction creates a new event rather than rewriting evidence.

## Migration and transaction rules

- Migrations are additive, numbered, reversible where practical, and reviewed with record-count and tenant-scope checks.
- A domain mutation and its outbox/domain event commit in one transaction.
- Idempotency records are scoped by organization, actor, route, key, and request hash.
- Cross-service work uses an outbox/queue; workers claim leases and fence writes with the lease token.
- Legacy reads are dual-read only during an approved transition window. No fabricated backfill is permitted.

## Required indexes

Tenant-scoped lookup indexes are required for `organization_id`, status, created/updated time, and domain-specific foreign keys. Unique constraints must include the tenant where the business identity is tenant-local. Global master data uses an explicit global scope and cannot silently merge with tenant-private rows.

## Connectivity and operations

- API services use pooled PostgreSQL connections with bounded timeouts and transaction tracing.
- Cloudflare Workers call the API or dedicated edge endpoints; they do not open an unbounded direct database connection.
- Local, test, and production databases are separate credentials and projects. Destructive tests run only on test data.
- Backups, point-in-time recovery, restore drills, migration checksums, and retention policies are release gates before production cutover.

## Object and vector data

Object storage contains private documents and scientific artifacts; PostgreSQL stores metadata, ownership, hashes, and lifecycle state. Vector indexes store derived embeddings only with tenant/source/version metadata. Revocation or supersession invalidates vectors through durable jobs.

## Phase 0 status

The directory `infra/postgres/` is a planning boundary only. No database server, migration, credential, or production schema is created by this checkpoint.
