# Phase 2 Material and Supplier Domain

## Scope

Phase 2 introduces a tenant-owned V2 Material aggregate and separately models Supplier Profiles and Supplier Offers. It does not import, migrate, or expose any legacy Lluch catalogue, Global Master Material, legacy formula material, or assumed scientific identity.

## Material

- Scope is structurally constrained to `TENANT`.
- States are `DRAFT`, `REVIEW_REQUIRED`, `ACTIVE`, `BLOCKED`, and `ARCHIVED`.
- Identity identifiers, sensory metadata, document references, supplier offers, inventory lots, and future `molecular_identity_id` are separate facets.
- Molecular identity defaults to `NOT_RESOLVED`; Phase 2 never invents SMILES, InChI, or structure claims.
- `ACTIVE` and `BLOCKED` transitions require `materials.approve`.

## Compliance

Compliance is a material facet, not an LLM conclusion. Each record includes jurisdiction, category, source/version/effective date, limits, evidence reference, reviewer, and one of `APPROVED`, `REVIEW_REQUIRED`, `BLOCKED`, or `NOT_EVALUATED`.

## Supplier and Offer

A supplier is an operational counterparty. An offer is a separate, versionable commercial relation from one supplier to one material. A purchase order can use an offer only when the matching supplier, material, and offer are `ACTIVE`.

## Security

All Phase 2 tables have forced PostgreSQL RLS by `organization_id`. The browser never supplies a trusted organization ID. Every mutating operation needs a server-side permission and scoped idempotency key; the write and its audit event occur in the same transaction.
