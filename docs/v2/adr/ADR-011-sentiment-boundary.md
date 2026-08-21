# ADR-011: Sentiment and Consumer Intelligence Boundary

## Context
Consumer feedback and internal sensory observations are related but have different consent, privacy, and analytical semantics.

## Decision
Keep tenant-scoped sentiment contracts and raw/aggregate data separate from Private Sensory Memory, RAG evidence, and scientific predictions. No cross-tenant learning or automatic formula mutation.

## Alternatives considered
Merge all feedback into sensory memory; train globally by default; let sentiment directly edit formulas.

## Consequences
Consent and explainability are clearer, with additional data-model separation.

## Security impact
Feedback source, consent, visibility, retention, and tenant scope remain explicit.

## Migration impact
Legacy evaluation notes remain legacy; structured sentiment requires explicit source and evidence status.

## Status
Accepted for Phase 0.
