# Competitive Moat: Phase 5 Report

## Outcome

**PASS (local static and service verification)**

Phase 5 turns completed Trials & Sensory records into permission-checked,
read-only comparable evidence for Formula R&D and Reformulation Optimizer.
It does not alter trial stages, formula approval, candidate ranking, Lab Usage,
or inventory movements.

## Changed Surface

- `server/src/services/northstar.service.ts`: `formulaTrialEvidence` resolves
  an immutable tenant formula version and returns only descriptive aggregate
  evidence from decided comparable trials.
- `worker/index.ts` and `server/src/routes/northstar.controller.ts`: add
  `GET /formulas/:id/trial-evidence?version=...`; the Worker hydrates current
  Trial state before this read.
- `src/features/trials/TrialEvidenceSummary.tsx`: shared responsive summary
  renders status, confidence, aggregate 1-10 scores, and the honest
  `Not enough evidence` state.
- Formula R&D and Optimizer call the API only when the current role has
  `formulas.viewSensitive`, `materials.view`, and `trials.view`.

## Evidence Rules

1. The requested formula and version are derived and checked in the current
   authenticated tenant.
2. Only trials in `DECIDED` state with comparable formula type and
   concentration band contribute evidence.
3. Fewer than three overall scorecards returns `NOT_ENOUGH_EVIDENCE`; the UI
   does not present a favorable score or a predictive claim.
4. Formula/Optimizer receive aggregate scorecards and confidence only. They do
   not receive sensory comments, evaluator identity, public-link token, lot,
   cost, or material composition.
5. Trial viewers without sensitive formula/material access receive
   `NOT_AVAILABLE` in Trial detail. Public feedback APIs remain presentation-
   only and do not expose comparable history.

## Verification

- Service test creates, releases, weighs, evaluates, and decides three trials;
  Formula evidence returns `READY`, three scorecards, and the expected overall
  aggregate: PASS.
- Same test verifies cross-tenant Formula evidence lookup is rejected: PASS.
- A `SENSORY_PANELIST` can read the blind Trial timeline but receives no formula
  identity or comparable-history aggregate: PASS.
- Full `npm.cmd test` (195 tests), lint, frontend build, Worker typecheck,
  local API build, client bundle secret scan, dependency audit, and
  `git diff --check`: PASS.

## Compatibility And Deferred Work

- Existing `retrieveTrialMemory` matching and Trial UI remain compatible;
  redacted roles now receive an explicit `NOT_AVAILABLE` state instead of a
  potentially misleading absence result.
- No migration was added. Existing completed Trial records become available as
  evidence without fabricated backfill.
- Next phases remain Formula graph, reformulation, and commercial-learning
  only after trial evidence is observed in the intended tenant workflows.
