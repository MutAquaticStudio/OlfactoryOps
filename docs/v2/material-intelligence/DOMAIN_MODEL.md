# Material Intelligence Domain Model

## Aggregate graph

```text
MaterialProduct (v2_materials)
  |-- supplier offers and documents (existing)
  |-- MaterialComponent[]
        |-- role + concentration + provenance
        `-- ChemicalEntity (tenant-owned)
              |-- evidence-qualified identifiers
              `-- MolecularIdentity (existing RDKit normalization)
                    `-- structure hash + InChIKey + normalization version

MaterialProduct/ChemicalEntity
  `-- ScientificEligibilityDecision[] (append-only)
```

## Material product

`v2_materials` continues to represent the thing purchased, stored, weighed, and formulated. `product_classification` is one of:

`NEAT_SUBSTANCE`, `DILUTION`, `DEFINED_MIXTURE`, `UNDEFINED_MIXTURE`, `NATURAL`, `BASE`, `FORMULATION`, `UNKNOWN`.

A neat product may point to a verified single Chemical Entity. A dilution or mixture points to component records. A natural/base/unknown product must not receive a representative molecule merely to satisfy a model input.

## Chemical entity

A Chemical Entity is tenant-owned and typed as:

`SINGLE_SUBSTANCE`, `DEFINED_MIXTURE`, `UNDEFINED_OR_VARIABLE_COMPOSITION`, `NATURAL_COMPLEX`, or `UNKNOWN`.

Resolution and evidence are independent dimensions:

- resolution: `UNRESOLVED`, `RESOLVED`, `CONFLICTED`, `NOT_APPLICABLE`;
- evidence: `UNVERIFIED`, `VERIFIED`, `CONFLICTED`, `REJECTED`.

Only `SINGLE_SUBSTANCE + RESOLVED + VERIFIED` may carry verified structure hash and InChIKey fields. The database constraint and contract enforce this invariant. Canonical SMILES, isomeric SMILES, InChI, InChIKey, molecular formula, and molecular weight are owned by `v2_molecular_identities`; ChemicalEntity stores only the verified strong keys needed to guard its link.

## Material component

Components are explicit product facts, not inferred formula lines. Each component has:

- role: `ACTIVE`, `CARRIER`, `SOLVENT`, `STABILIZER`, `OTHER`, `UNKNOWN`;
- concentration: exact, range, or unknown;
- unit: percent, fraction, ppm, or unknown;
- basis: mass, volume, mass-per-volume, or unknown;
- evidence status and source references.

An active component's eligibility never makes the containing dilution or mixture eligible as a neat substance.

## Evidence and decisions

Evidence and eligibility decisions are append-only. Corrections create new evidence/decision records; they do not rewrite prior provenance. Every evidence assertion identifies its kind (`STRUCTURE`, `IDENTIFIER`, `COMPOSITION`, or `PRODUCT_IDENTITY`) and exact subject. A molecular identity may reference only verified structure evidence for that same ChemicalEntity.

Eligibility decisions have an explicit `subject_type`. A MaterialProduct decision and a ChemicalEntity decision may coexist for the same linked entity and are queried independently. Material/chemical/component foreign keys include `organization_id`, and all new tables use forced tenant RLS.

## Feature cache identity

Future feature artifacts must use the full cache identity:

```text
chemicalEntityId
+ structureHash
+ normalizationVersion
+ method
+ version
```

Names, material IDs alone, trade labels, and raw input SMILES are not valid feature-cache keys.
