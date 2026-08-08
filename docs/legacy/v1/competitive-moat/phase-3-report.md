# Competitive Moat Phase 3 Report

## Outcome

PASS for local Phase 3 candidate lineage. A reviewed Design Studio brief now
creates three deterministic directions from a single pinned material universe.
Each direction receives a durable, tenant-scoped evaluation before a user can
move it into the existing share or draft-save workflows.

## Changed Surfaces

- `src/data/agentRuntime.ts` registers a bounded, typed
  `design_candidate_comparison` artifact and strict candidate evaluation schema.
- `worker/formula-intelligence.ts` pins the eligible material universe to the
  constraint snapshot, updates the durable run context with its hash, evaluates
  each candidate, writes `formula_design_direction_evaluations`, and exposes
  the evaluation only to its generating perfumer.
- `server/src/services/agent-local-runtime.service.ts` mirrors the Worker
  behavior with atomic local persistence so development and CI retain the same
  candidate lineage semantics.
- The Design Studio detail surface shows a private decision summary. The legacy
  Formula Agent artifact renderer understands the registered comparison type.

## Security And Compatibility

- The eligible universe is derived from the authenticated tenant service, not
  from browser input. It contains the deterministic selection attributes only
  and is hashed before it is persisted in run context.
- A previously pinned snapshot rejects a different universe rather than silently
  mutating history. Concurrent pinning accepts only an identical resulting hash.
- Brand shares remain safe: no proposal, material identifier, ratio, cost, lot,
  evaluation, or raw warning is added to their projection.
- Candidate evaluation is advisory. It does not reserve or consume stock and
  does not alter Formula approval, Trial/Sensory, RAG, or provider settings.
- Existing legacy projects retain their previous generation compatibility and
  therefore do not manufacture a false reviewed snapshot.

## Verification

- PASS: focused shared-contract test, 13 tests.
- PASS: focused Worker persistence test, 8 tests.
- PASS: focused local runtime parity test, 8 tests.
- PASS: full `npm.cmd test`, 15 files and 191 tests.
- PASS: frontend build, local API build, Worker typecheck, Worker dry-run build,
  lint, client bundle secret scan, dependency audit, and diff check.
- BLOCKED: full local D1 migration still has the pre-existing migration `0010`
  `sidebar_mode` schema drift documented in Phase 0-2. This checkpoint does not
  reset or mutate local D1 state.

## Next Phase

Create an explicit candidate-to-Trial entry point. It must retain the immutable
brief/version/candidate lineage while leaving normal Formula approval and only
Lab Usage stock consumption unchanged.
