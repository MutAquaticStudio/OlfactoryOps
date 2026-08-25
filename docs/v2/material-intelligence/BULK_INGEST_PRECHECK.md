# Bulk Ingest Precheck

Source `OlfactoryOps_Material_Intelligence_Master_v1.xlsx` (`a49bede2801da2e0edb25a305fc3df8b751837e3d0aba6779bf0750e1e456ef4`) was processed locally in preview mode. No database, provider, external enrichment, deployment, or model-training operation is implemented by this command.

## Safety policy

- `FORMULA_TO_SMILES_ALLOWED=NO`
- `NAME_ONLY_STRUCTURE_GUESSING_ALLOWED=NO`
- `CAS_ONLY_MODEL_ELIGIBLE=NO`
- Source chemistry fields remain unverified assertions until supported by governed evidence.
- Candidate entity reuse requires verified compatible structure evidence; CAS/name matches are review signals only.
- All future persistence remains tenant-scoped.

## Counts

| Metric | Count |
| --- | --- |
| `SOURCE_ROW_COUNT` | 1986 |
| `DRY_RUN_INPUT_ROWS` | 1986 |
| `DRY_RUN_RESULT_ROWS` | 1986 |
| `NONEMPTY_NAME_COUNT` | 1986 |
| `MISSING_NAME_COUNT` | 0 |
| `UNIQUE_NORMALIZED_PRODUCT_COUNT` | 1982 |
| `NEAT_SUBSTANCE_COUNT` | 1445 |
| `DILUTION_COUNT` | 30 |
| `DEFINED_MIXTURE_COUNT` | 0 |
| `UNDEFINED_MIXTURE_COUNT` | 4 |
| `NATURAL_COUNT` | 495 |
| `BASE_COUNT` | 12 |
| `FORMULATION_COUNT` | 0 |
| `UNKNOWN_COUNT` | 0 |
| `ROWS_WITH_CAS_CLAIMS` | 1928 |
| `ROWS_WITH_STRUCTURE_CLAIMS` | 0 |
| `ROWS_WITH_FORMULA_ONLY` | 0 |
| `INVALID_STRUCTURE_CLAIM_COUNT` | 0 |
| `DUPLICATE_ROW_COUNT` | 8 |
| `DUPLICATE_GROUP_COUNT` | 4 |
| `EXACT_PRODUCT_DUPLICATE_GROUPS` | 4 |
| `CHEMICAL_ENTITY_DUPLICATE_CANDIDATE_GROUPS` | 0 |
| `CAS_COLLISION_GROUPS` | 415 |
| `STRUCTURE_CONFLICT_GROUPS` | 0 |
| `IDENTITY_CONFLICT_COUNT` | 1 |
| `COMPONENT_PLAN_COUNT` | 31 |
| `CHEMICAL_ENTITY_LINK_EXISTING_COUNT` | 0 |
| `CHEMICAL_ENTITY_CREATE_VERIFIED_CANDIDATE_COUNT` | 0 |
| `CHEMICAL_ENTITY_CREATE_UNRESOLVED_COUNT` | 853 |
| `CHEMICAL_ENTITY_CREATE_COMPLEX_COUNT` | 123 |
| `CHEMICAL_ENTITY_REVIEW_REQUIRED_COUNT` | 1010 |
| `CHEMICAL_ENTITY_NOT_APPLICABLE_COUNT` | 0 |
| `EXPECTED_UNIQUE_CHEMICAL_ENTITY_CANDIDATES` | 976 |
| `AUTHORITATIVE_LOOKUP_READY_COUNT` | 809 |
| `SUPPLIER_DOCUMENT_REQUIRED_COUNT` | 30 |
| `MANUAL_REVIEW_REQUIRED_COUNT` | 636 |
| `NO_SINGLE_MOLECULE_LOOKUP_COUNT` | 511 |

## Recommended ingest waves

| Wave | Rows | Boundary |
| --- | --- | --- |
| Wave A | 0 | Verified/reusable deterministic records |
| Wave B | 809 | Authoritative identity lookup candidates |
| Wave C | 30 | Trade materials and explicit dilutions requiring supplier evidence |
| Wave D | 511 | Natural and complex products with no representative single molecule |
| Wave E | 636 | Manual duplicate, CAS-collision, malformed, and identity-conflict review |

`BULK_DATA_PRECHECK_READY=YES` means the deterministic data artifacts reconcile. The goal-level `BULK_INGEST_PRECHECK_READY` remains pending until Pilot50, Osmo, freeze, full-test, and PR-CI gates pass.
