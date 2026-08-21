# Phase 5 Olfactory Intelligence

## Scope

Phase 5 turns verified Phase 3 molecular feature artifacts into tenant-private,
reproducible evidence. It does not claim that a chemical fingerprint is an
odor embedding and it does not activate an odor model without a reviewed,
licensed odor-labelled dataset and calibrated model version.

## Molecular evidence

`FINGERPRINT_BINARY_VECTOR` and `FUSION_CONCAT` are versioned sparse molecular
projections over verified ECFP/BCFP `onBits` artifacts. Each record retains:

- material and tenant scope;
- source artifact hashes and feature-manifest hash;
- method, dimension, normalization and index version;
- embedding hash and evidence status.

Similarity is exact Tanimoto/Jaccard over the same verified fingerprint bits.
Every result identifies source/candidate materials, feature method,
metric version, index version, score, status and reason. Cross-tenant material
references are blocked by application scope, RLS, and composite foreign keys.

## Odor boundary

An odor prediction request requires a tenant-visible model version and is
persisted with model/input/task provenance. In the absence of a reviewed
odor-labelled dataset, evaluated prediction head and calibration record, the
only permitted result is `NOT_EVALUATED` with `ODOR_MODEL_NOT_EVALUATED`.
No placeholder labels, confidence scores, formula advice or synthetic odor
claims are generated.

Likewise, explainability returns a feature association only when the requested
artifact is verified. Every explanation contains the fixed disclaimer:
`Association is not causal proof.` Missing MolFTP target evidence is recorded
as `NOT_EVALUATED`.

## Persistence

Migration `0006_phase5_olfactory_intelligence.sql` adds molecular/odor
embeddings, prediction evidence, similarity records and explainability records.
All rows are tenant-scoped, RLS protected and linked to parents through
composite organization foreign keys. Materializing a molecular embedding
requires `scientific_ai.manage`; querying similarity, prediction provenance or
explainability requires `scientific_ai.use` plus sensitive-material access.
Every mutation uses server-derived organization context, CSRF/origin checks,
bounded idempotency, transactions and an append-only audit event.

## Non-goals

- No public/vector-hosted similarity index.
- No production model serving, odor head, calibration, or LLM.
- No material/formula/inventory/compliance mutation.
- No causal chemistry assertion.
