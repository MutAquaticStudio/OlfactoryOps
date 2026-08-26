# ADR-013: Adopt the pinned Osmo Scent Taxonomy under ODbL 1.0

## Context

OlfactoryOps needs a complete, versioned scent vocabulary for global Material Intelligence. The existing 20-target Dravnieks research model is a separate prediction contract and is not a taxonomy.

## Decision

Adopt `osmoai/taxonomy` release `v1.2` at immutable commit `fcd538b578e0a3c6261503380de03d0691b47344` through `osmo-scent-taxonomy-adapter/1.0.0`.

The exact upstream `data/taxonomy.json` artifact is vendored with SHA-256 `3181c43e9d094235eb2125b3301d6d323b1337acea5eaa4242e2e3d3e3493b2d` and its upstream license notice. The imported database release records the upstream commit, content hash, license, adapter version, and actual node counts.

The taxonomy database is licensed under ODbL 1.0. Public use must attribute "The Osmo Scent Taxonomy" and link to `https://github.com/osmoai/taxonomy`. A publicly shared derivative database must remain available under ODbL 1.0. OlfactoryOps application source, tenant data, formulas, and model artifacts are not relicensed merely because they consume the taxonomy as a produced work.

Assignments remain separate evidence records. `MODEL_PREDICTED`, `NORMALIZED`, `SENSORY_PANEL`, and `SOURCE_VERIFIED` provenance are never interchangeable.

## Consequences

- The earlier taxonomy exclusion in ADR-005 is superseded for this component only.
- Taxonomy releases are immutable and fail closed on checksum or count drift.
- Upstream `main` is never followed implicitly.
- The official JSON does not map descriptors to subfamilies. OlfactoryOps must not invent that hierarchy.
- Any shared extension or modification to the taxonomy database must satisfy ODbL attribution, share-alike, and keep-open obligations.
