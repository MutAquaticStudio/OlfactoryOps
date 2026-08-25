# Identity Resolution Policy

## Principle

Identity is an evidence-backed assertion. A plausible name match is not a resolution.

## Allowed evidence progression

1. Capture the material product and source context without resolving identity.
2. Record supplier/document/database claims with source version, retrieval time, content hash, and evidence status.
3. Normalize an explicitly supplied structure only through the existing RDKit adapter.
4. Compare verified structure hash and verified InChIKey.
5. Resolve only when the evidence and normalized structure are compatible.
6. Store conflicts explicitly and require human review.

## Strong identity and deduplication

An automatic same-entity decision requires both:

- identical verified normalized structure hash; and
- compatible identical verified InChIKey.

The strong key is scoped to one organization. Structure-hash or InChIKey disagreement creates distinct verified entities or a conflict; it never falls back to a name match.

The following are not deduplication keys:

- material or trade name;
- supplier product code;
- CAS/INCI text without verified provenance;
- molecular formula;
- generic stereochemical name;
- odor description;
- embedding or prediction similarity.

## Stereochemistry and isomers

Generic Linalool and Limonene records with unspecified stereochemistry remain `REVIEW_REQUIRED`, even when their non-isomeric structure record is verified. `(R)` and `(S)` entries retain distinct isomeric SMILES, InChIKeys, and structure hashes. Geraniol/Nerol, Geranial/Neral, and alpha/beta Ionone are tested as distinct identities.

## Mixtures, naturals, and bases

- Defined mixtures preserve components and concentration evidence; the product is not a single molecule.
- Undefined/variable composition, natural complexes, and proprietary bases use `NOT_APPLICABLE` or `UNRESOLVED` molecular resolution as appropriate.
- A representative molecule is forbidden for these product classes.
- Dilutions preserve active and carrier/solvent components; the diluted product itself is not model-eligible.

## Pilot source boundary

The only verified public records in Pilot 50 are pinned PubChem CID records returned by the official PubChem PUG REST service on 2026-08-25. Each fixture entry stores the CID, source canonical/isomeric SMILES, InChIKey, source version, and content hash. The source structure was normalized locally through the repository's exact `ScientificRuntimeService` adapter using RDKit `2023.09.3`; the resulting canonical SMILES and structure hash are stored separately. All other pilot cases remain unverified rather than relying on model memory.

Production persistence must normalize again through the active governed runtime and record its runtime and normalization versions. The local pilot output is evidence for this bounded validation, not permission to bypass the production normalization boundary.

Source: [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest)
