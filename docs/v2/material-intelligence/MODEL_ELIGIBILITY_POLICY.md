# Scientific Model Eligibility Policy

## Stable result contract

`getScientificEligibility({ materialId | chemicalEntityId })` returns one of:

- `ELIGIBLE`
- `NOT_ELIGIBLE`
- `REVIEW_REQUIRED`

It includes stable reason codes, subject identity, verified structure hash/normalization version when available, and a policy version. No downstream feature, similarity, prediction, or explainability path should bypass this decision.

## Evaluation order

Product classification is evaluated before molecular evidence. This prevents an active ingredient from accidentally making its dilution, mixture, natural, base, or formulation eligible.

| Condition | Result | Reason |
| --- | --- | --- |
| Resolved, verified single substance; supported structure; stereochemistry resolved/not applicable | `ELIGIBLE` | `RESOLVED_SINGLE_SUBSTANCE` |
| Dilution | `NOT_ELIGIBLE` | `DILUTION_PRODUCT` |
| Defined mixture | `NOT_ELIGIBLE` | `DEFINED_MIXTURE` |
| Undefined mixture | `NOT_ELIGIBLE` | `UNDEFINED_MIXTURE` |
| Natural complex | `NOT_ELIGIBLE` | `NATURAL_COMPLEX` |
| Proprietary base | `NOT_ELIGIBLE` | `PROPRIETARY_BASE` |
| Formulation | `NOT_ELIGIBLE` | `FORMULATION` |
| Unknown composition | `REVIEW_REQUIRED` | `UNKNOWN_COMPOSITION` |
| Identity unresolved/conflicted | `REVIEW_REQUIRED` | `UNRESOLVED_IDENTITY` / `IDENTITY_CONFLICT` |
| Structure absent/unverified/unsupported | `REVIEW_REQUIRED` | `NO_STRUCTURE` / `UNVERIFIED_STRUCTURE` / `UNSUPPORTED_STRUCTURE` |
| Required stereochemistry unresolved | `REVIEW_REQUIRED` | `STEREOCHEMISTRY_UNRESOLVED` |

## Operational boundary

- Eligibility is not a prediction and does not imply regulatory, safety, or olfactory validity.
- An eligible entity permits a later feature request; it does not schedule computation.
- Feature cache identity includes Chemical Entity, structure hash, normalization version, method, and method version.
- Model/dataset registration and existing scientific permissions remain authoritative.
- The Pilot 50 run performs no feature bulk compute and no model retraining.
