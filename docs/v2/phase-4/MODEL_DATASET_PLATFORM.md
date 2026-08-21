# Phase 4 Model and Dataset Platform

## Boundary

Phase 4 creates a PostgreSQL-backed registry for research datasets and model
versions. A registry record is evidence about a prospective scientific asset;
it is never permission to load a model, produce a prediction, approve a
formula, or use tenant material data outside the existing authorization
boundary.

The Phase 4 migration is additive:

- `v2_datasets`, `v2_dataset_versions`, `v2_dataset_licenses`,
  `v2_dataset_transformations`, and `v2_dataset_artifacts` preserve source,
  license, citation, content checksum, material-universe hash, transformation,
  and artifact evidence.
- `v2_models`, `v2_model_versions`, `v2_model_architectures`,
  `v2_feature_contracts`, and `v2_model_checkpoints` preserve purpose,
  architecture, input contract, checkpoint hash, model card, and lifecycle.
- `v2_training_runs`, `v2_training_dataset_relations`, `v2_evaluation_runs`,
  and `v2_model_metrics` preserve seeded split evidence, group-level leakage
  protection, data lineage, evaluation result, and metric values.
- `v2_model_component_pins` is a global read-only provenance registry. It does
  not contain tenant data or credentials.

All tenant-owned rows include `organization_id`, use PostgreSQL RLS, and are
accessed only after server-side session and permission resolution. Composite
tenant foreign keys bind every stored parent/child relationship to the same
organization. The browser cannot select an organization by supplying an ID.

## Dataset Lifecycle

```text
REVIEW_REQUIRED -> APPROVED -> ARCHIVED
                      |
                   BLOCKED
```

Every version requires a SHA-256 content checksum, source repository/ref,
citation, source/schema version, material-universe hash, license evidence,
at least one versioned transformation, and at least one content-addressed
artifact. Approval is an explicit audited mutation. Phase 4 imports no bulk
dataset and creates no Global Material dataset.

## Reproducible Training

Training runs require a fixed seed and a `SCAFFOLD_GROUP` or `TIME_SPLIT`
strategy. Each run must attach exactly `TRAIN`, `VALIDATION`, and `TEST`
relations with distinct group-set hashes. The service rejects random-only
splits and duplicate group evidence before the run is recorded. A checkpoint
must be content-addressed. Evaluation results cannot claim a pass unless
leakage status is `PASS`; individual metrics record name, numeric value,
direction, and source.

## Runtime Gate

`GET /v2/model-dataset/model-versions/:id/runtime` deliberately returns
`NOT_CONFIGURED` with `MODEL_RUNTIME_NOT_CONFIGURED`. The V2 application has
no serving endpoint in Phase 4. The isolated Docker compatibility image proves
that pinned upstream source can load, round-trip a synthetic checkpoint, make
one synthetic inference, and calculate a finite metric. It does not load a
tenant checkpoint, training corpus, or customer material record.

## Service/API Surface

`ModelDatasetService` is the only Phase 4 business entry point. Mutations
require `scientific_ai.manage`, a bounded `Idempotency-Key`, tenant context,
transactional RLS scope, and an append-only audit row. Read paths require
`scientific_ai.use`. The controller under `/v2/model-dataset` applies the
existing cookie session, exact origin, and CSRF checks before invoking the
service.

## Non-goals

- No model training scheduler or prediction endpoint.
- No odor prediction, embedding, similarity, or scientific score.
- No bulk import from Osmo publications.
- No external LLM, Workers AI, D1, or production deployment.
- No automatic change to Materials, Formula, Inventory, or compliance.
