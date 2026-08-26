# ADR-005: Osmo Adapter Integration

## Context

Osmo components may provide useful chemistry and odor capabilities, but domain ownership and licenses must remain clear.

## Decision

Use only reviewed, pinned Osmo components through named adapters. The original decision excluded `osmoai/taxonomy`; ADR-013 supersedes that exclusion with an explicit ODbL 1.0 adoption and immutable artifact contract.

## Alternatives considered

Direct domain imports; copied vendor code; unreviewed taxonomy/ODbL adoption.

## Consequences

Integration is replaceable and license-aware; adapter work is required later.

## Security impact

Component provenance, dependency scanning, and input/output validation are mandatory.

## Migration impact

Registry pinning and golden fixtures precede any production activation.

## Status

Proposed for Phase 0; activation deferred.
