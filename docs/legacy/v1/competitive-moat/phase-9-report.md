# Competitive Moat: Phase 9 Report

## Outcome

**PARTIAL (local release controls complete; hosted acceptance pending)**

## Completed Release Controls

- Tenant feature flags are server-side kill switches for Formula Intelligence
  generation, optimization, private sensory memory, and RAG retrieval.
- Worker and local capability responses only enable actions when both the
  permission and the corresponding runtime feature flag are present.
- Existing run quotas, idempotency, append-only audit evidence, confirmation
  gates, lease fencing, and durable event replay remain the execution controls.
- `GET /api/v1/formula-intelligence/operational-metrics` is Owner/Admin-only
  and reports tenant Trial decision and private-memory facts. Agent telemetry
  is explicitly `NOT_EVALUATED` until the D1-backed Worker telemetry gate is
  active; it never returns a simulated success rate.
- UI now makes unavailable evidence and paused capabilities explicit instead
  of treating missing evidence as favorable.

## Pending Hosted Gate

1. Deploy Worker test and verify new normalized-table hydration.
2. Run authenticated beta smoke for Owner, Admin, Perfumer, and restricted
   user roles, including feature-flag disable/restore and a fresh optimizer run.
3. Run the existing remote functional test after a valid functional credential
   is configured.

No provider, secret, remote migration, deploy, Git push, or production
promotion was performed by this local checkpoint.

## Local D1 Evidence

The isolated `olfactoryops-test` local binding applied migrations `0034` to
`0037` successfully. The primary production-named local binding remains blocked
earlier at migration `0010` by its pre-existing duplicate `sidebar_mode` column
drift; that state was not reset or modified.
