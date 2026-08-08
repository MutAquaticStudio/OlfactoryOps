# ADR-006: Dataset, Model, and Artifact Provenance

## Context
Scientific and AI evidence must be reproducible and legally attributable.

## Decision
Represent source, dataset/license/version, component, model/version, artifact, transformation, and prediction provenance as typed references.

## Alternatives considered
Free-text citations; provider-only metadata; no provenance until production.

## Consequences
Evidence is auditable and reproducible, with additional metadata overhead.

## Security impact
Hashes and references are stored instead of secrets or raw sensitive content.

## Migration impact
Existing V1 records remain unchanged; V2 adapters add provenance at creation time and legacy data is marked unknown rather than fabricated.

## Status
Accepted for Phase 0.
