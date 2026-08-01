# Competitive Moat: Phase 6 Report

## Outcome

**PASS (local deterministic verification)**

Phase 6 adds tenant-private sensory memory after a Trial has reached a decided
outcome. It does not change Trial release, Lab Usage, formula approval, or
inventory movements.

## Controls

- `fragrance_sensory_memory` holds one derived record per tenant Trial.
- `workspace_preference_profiles` is immutable and versioned; it does not
  persist raw observations, evaluator identity, public tokens, or rationale.
- Only `formulas.viewSensitive`, `materials.view`, and `trials.view` can read
  the workspace projection.
- Fewer than three decided records is explicitly `NOT_ENOUGH_EVIDENCE`.
- Direction evidence is a bounded presentation/ranking adjustment and never
  changes a proposed composition or claims a sensory prediction.

## Verification

- Unit coverage verifies disabled, insufficient, and bounded learning states.
- Service coverage creates three tenant Trials, confirms profile readiness, and
  confirms cross-tenant Formula evidence is denied: PASS.

## Deployment Boundary

Apply migration `0037_competitive_moat_memory.sql` before Worker deployment.
Full local D1 migration remains blocked by the pre-existing migration `0010`
schema drift documented in `EXECUTION_STATE.md`.
