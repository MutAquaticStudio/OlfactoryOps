# Material Intelligence Foundation Audit

## Scope

This audit covers the V2 material, supplier, molecular identity, scientific artifact, and material-evidence paths at `main` commit `80d3444427d6a194b0930fcf7bd4e4296907903c`. It authorizes a local/test-only 50-case pilot. It does not authorize a staging or production migration, feature backfill, model training, or release deployment.

## Existing capabilities

| Area | Existing owner | Finding |
| --- | --- | --- |
| Material product | `v2_materials` / `LabOperationsService` | Tenant-scoped operational aggregate exists. It owns name, internal code, lifecycle status, sensory metadata, documents, inventory, and supplier offers. |
| Molecular identity | `v2_molecular_identities` / `ScientificFeatureService` | RDKit-normalized structure identity exists, but is attached directly to a material and cannot represent dilution, mixture, natural, base, or multiple components. |
| Scientific evidence | `v2_scientific_jobs`, `v2_scientific_artifacts` | Provenance-bearing structure/feature artifacts exist. Feature generation currently assumes a material has one resolved molecular identity. |
| Material evidence | `v2_material_evidence_sources`, `v2_material_evidence_chunks` | Approved tenant evidence can be indexed and retrieved with citations. It does not model assertion status or chemical-entity resolution. |
| Supplier context | `v2_supplier_offers` | Product code, trade name, grade, price, and supplier relations exist. Supplier offers remain commercial records, not chemical identity evidence by themselves. |
| Authorization | V2 permission registry and Platform context | `materials.view`, `materials.edit`, `materials.approve`, `scientific_ai.use`, and `scientific_ai.manage` already provide the required policy boundaries. No new permission key is necessary. |

## Proven gaps

1. The existing direct Material-to-MolecularIdentity relation cannot distinguish a sold product from its active chemical component.
2. There is no normalized representation for composition, carrier/solvent roles, exact/range/unknown concentration, or evidence status.
3. There is no tenant-owned Chemical Entity record with strong, evidence-gated deduplication.
4. There is no stable, fail-closed scientific eligibility result or reason-code contract.
5. Trade names and naturals can reach the current structure endpoint only through an operator-supplied SMILES; the database does not state whether the product itself is model-eligible.
6. Scientific cache identity does not yet include ChemicalEntity plus normalized structure identity as an explicit contract.

## Additive foundation

Migration `0027_material_intelligence_foundation.sql` preserves `v2_materials` and adds:

- product classification and bounded supplier/product presentation fields on `v2_materials`;
- tenant-owned `v2_chemical_entities` and `v2_chemical_identifiers`;
- `v2_material_components` with roles and explicit concentration semantics;
- append-only `v2_material_intelligence_evidence`;
- append-only `v2_scientific_eligibility_decisions`;
- tenant-composite foreign keys, forced RLS, strong-identity uniqueness scoped by tenant, and least-privilege grants.

The TypeScript contract and `MaterialIntelligenceService.getScientificEligibility()` provide the stable read boundary. The pilot intentionally does not expose a new mutation route. Production write enablement requires a later reviewed API operation with CSRF, idempotency, permission, audit, and transaction tests.

## Boundary decisions

- `v2_materials` remains the operational aggregate root. No legacy/global material catalog is introduced.
- `v2_molecular_identities` remains the RDKit-owned normalized structure record. The foundation does not create a second canonicalization engine.
- Chemical entities are tenant-owned. No cross-tenant global entity or identifier registry exists.
- Supplier/trade labels are evidence inputs, never strong identity keys.
- No name-to-SMILES, formula-to-SMILES, fuzzy trade-name resolution, feature backfill, or model retraining is included.
- Frozen Osmo checkpoint/dataset/split/target identities are regression-tested and unchanged.

## Review hardening

PR review hardening closes three fail-open/correctness gaps before merge: molecular evidence references are cross-validated against verified structure assertions for the exact ChemicalEntity; eligibility persistence and lookup use explicit MaterialProduct/ChemicalEntity subjects; and the composite molecular-identity foreign key uses restrictive deletion without nulling the tenant key. Pilot 50 now reports every primary ChemicalEntity action, five bounded supporting entities, and all ten component links while keeping naturals, bases, dilutions, and unknown composition fail-closed.

## Audit result

`MATERIAL_INTELLIGENCE_FOUNDATION_AUDIT=PASS`

The additive model closes the identified representation and eligibility gaps while preserving the existing operational, evidence, and scientific owners.
