# ADR-003: Cloudflare Edge and SaaS Boundary

## Context
The product uses Pages, Workers, tenant hostnames, D1, queues, and optional SaaS custom domains.

## Decision
Cloudflare handles edge routing, caching, tenant hostname/SaaS lifecycle, and bounded control-plane work. It never becomes the V2 authoritative data writer.

## Alternatives considered
Serve everything directly from PostgreSQL; use a different edge provider; make D1 the primary V2 database.

## Consequences
Low-latency tenant routing is retained while API/database boundaries must remain explicit.

## Security impact
Exact-origin CORS, host matching, secrets in bindings, and tenant revalidation are mandatory.

## Migration impact
Keep existing Worker routes compatible and add V2 routing only after test environment verification.

## Status
Accepted for Phase 0.
