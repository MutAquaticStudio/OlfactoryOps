# Material Intelligence Read API Contract

Base path: `/api/v1/v2/material-intelligence`.

All endpoints require an authenticated tenant session and
`materials.viewSensitive`. Queries execute inside the canonical
`app.organization_id` and `app.user_id` PostgreSQL transaction context.
Migration `0027` absence is returned as
`MATERIAL_INTELLIGENCE_NOT_AVAILABLE` without raw database text.

## Endpoints

| Method | Path                                 | Response purpose                                                        |
| ------ | ------------------------------------ | ----------------------------------------------------------------------- |
| GET    | `/materials`                         | Bounded catalog summary                                                 |
| GET    | `/materials/:materialId`             | Product, entity, components, current eligibility and provenance summary |
| GET    | `/materials/:materialId/components`  | Explicit component rows                                                 |
| GET    | `/materials/:materialId/evidence`    | Bounded evidence summaries                                              |
| GET    | `/materials/:materialId/eligibility` | Separate current product/entity decisions                               |
| GET    | `/chemical-entities/:entityId`       | Entity, identifiers, verified molecular summary and eligibility         |

There is deliberately no public bulk-import endpoint.

## List query

Supported query parameters:

- `page`: integer, default 1;
- `pageSize`: integer, default 50, maximum 100;
- `text`: bounded 160-character name/trade-name/supplier search;
- `productClassification`;
- `eligibility`;
- `resolutionStatus`;
- `reviewRequired=true|false`.

The list query returns `items`, `page`, `pageSize`, and `total`. Each item
contains ID, name, trade name, supplier, product classification, resolution
status, current eligibility result/reasons, review state, and an optional
primary ChemicalEntity summary. It does not fan out evidence or component blobs.

## Detail projections

Material detail returns product classification and supplier/trade metadata,
explicit components, bounded evidence summaries, and distinct material versus
ChemicalEntity eligibility decisions with reason codes.

ChemicalEntity detail returns preferred name, entity/resolution/evidence status,
bounded identifier claims, current entity eligibility, and a molecular identity
summary. `canonicalSmiles`, `InChI`, `InChIKey`, structure hash,
normalization version, molecular formula and molecular weight are populated only
from canonical stored identity. The current schema has no separate isomeric
SMILES column, so `isomericSmiles` is explicitly `null`.

Cross-tenant IDs return the same not-found response as absent IDs. Evidence
metadata blobs are excluded from default responses.
