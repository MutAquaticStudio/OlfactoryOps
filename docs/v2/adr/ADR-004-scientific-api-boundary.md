# ADR-004: Scientific Python/C++ API Boundary

## Context
Scientific computation may need Python/C++ ecosystems that should not leak into the domain application.

## Decision
Expose versioned scientific service contracts and adapters. Domain services communicate through the Scientific API; no engine is implemented in Phase 0.

## Alternatives considered
Import RDKit/vendor code into the TypeScript domain; call notebooks directly; postpone all contracts.

## Consequences
Independent scaling and reproducible artifacts are possible, at the cost of API and provenance discipline.

## Security impact
Inputs are schema-bounded and outputs are treated as advisory evidence, never arbitrary code.

## Migration impact
Adapters must provide fixtures, checksums, timeouts, and version compatibility before activation.

## Status
Accepted for Phase 0.
