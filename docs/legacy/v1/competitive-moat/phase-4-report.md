# Competitive Moat: Phase 4 Report

## Outcome

**PASS (local static and focused functional verification)**

Phase 4 adds a controlled entry point from a saved Formula Design Studio
direction to the existing Trials & Sensory workflow. It does not create a new
approval path and does not move inventory.

## Changed Surface

- `src/data/northStar.ts`: an immutable `FormulaIntelligenceTrialSource` on a
  private trial record holds direction, reviewed-brief, constraint, universe,
  and evaluation hashes only.
- `server/src/services/northstar.service.ts`: the existing trial creator now
  has an internal Formula Intelligence variant. It still requires
  `trials.create`, `formulas.view`, and an approved formula version.
- `worker/formula-intelligence.ts` and `worker/index.ts`: a tenant- and
  creator-scoped `POST /formula-intelligence/design-projects/:id/directions/:directionId/trial`
  endpoint verifies durable candidate lineage, source/evaluation consistency,
  and current permissions before invoking the existing trial service.
- `server/src/services/agent-local-runtime.service.ts` and controller: local
  mode mirrors the same lineage, permission, approval, duplicate, and
  non-consuming behavior.
- `src/features/formula-intelligence/FormulaIntelligenceWorkspaces.tsx`: a
  private direction can expose `Plan trial` only after its draft exists and the
  current user has the trial capability. The action explains that an approved
  immutable version is still needed.

## Workflow

1. A perfumer saves a reviewed direction as a normal editable draft.
2. The normal formula review and approval workflow creates an immutable
   approved version.
3. The same perfumer may plan a trial. The Trial record captures candidate
   lineage plus the actual approved formula-version snapshot.
4. Planning creates neither a reservation nor an inventory movement. Existing
   Lab Usage remains the sole path that consumes material.

## Controls

- Organization and actor always come from the authenticated session.
- The request has the existing server-side idempotency contract. Replaying the
  same local direction returns its planned trial rather than creating another.
- The Worker rehydrates Trial state before the new route, then checks durable
  trial records for an already linked direction.
- Candidate lineage must have a reviewed brief, matching constraint snapshot,
  matching material-universe hash, and validated evaluation. Blocked
  directions are rejected.
- Formula Intelligence provenance is never included in the sensory-safe trial
  projection.

## Verification

- Focused `NorthStarService` and local Formula Intelligence tests: PASS
  (119 tests).
- Frontend build: PASS.
- Worker typecheck: PASS.
- Local API build: PASS.

## Compatibility And Deferred Work

- Existing Trial records and normal `POST /trials` behavior are unchanged.
- Existing saved legacy directions without structured candidate lineage use the
  normal Formula R&D trial entry point; no missing provenance is invented.
- The next phase is read-only completed Trial/Sensory evidence for Formula and
  Optimizer decisions. It remains tenant-scoped and must preserve panelist and
  public-link redaction.
