# Competitive Moat: Phase 7 Report

## Outcome

**PASS (local deterministic verification)**

Phase 7 adds an operational-lineage read projection. It derives edges from the
normal operational records rather than duplicating them into a second graph
source of truth.

## Surface

- `GET /api/v1/lineage/:type/:id` is available in local API and Worker.
- The request is tenant-scoped and rechecks access for the named subject.
- A bounded three-hop traversal returns at most 240 deterministic edges across
  Formula, Formula Version, Material, Lot, Trial, Batch, Finished-good Lot,
  Order, Document, and Design Direction.
- Formula R&D presents compact impact counts only to sensitive Formula/Trial
  users. Historical records remain immutable when future evidence appears.

## Verification

The service test creates formula-version Trial history, checks three linked
Trials and associated lots in the Formula projection, and retains tenant
isolation: PASS.
