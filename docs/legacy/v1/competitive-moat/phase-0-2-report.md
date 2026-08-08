# Competitive Moat Phase 0-2 Report

## Outcome

PASS for the local Phase 0-2 implementation. Design Studio now has immutable
raw and structured brief lineage, a reviewed-version generation gate, and an
explicit manual-only compiler state. No provider, deployment, remote migration,
or operational domain behavior was changed.

## Changed Surfaces

- `migrations/0036_competitive_moat_briefs.sql` adds immutable brief versions,
  constraint snapshots, generation contexts, direction evaluations, tenant
  indexes, and a non-inferential legacy backfill.
- `src/data/agentRuntime.ts` defines structured brief validation, controlled
  vocabulary normalization, unresolved-question projection, and conversion to
  the existing deterministic Design Studio brief contract.
- Worker and local Formula Intelligence services expose brief-version history,
  manual compiler status, structured-version save, reviewed generation gates,
  and run-to-brief context lineage.
- The Formula Design Studio UI now presents raw brief creation, structured
  review, constraints, and direction generation as separate steps.

## Public API

- `GET /formula-intelligence/design-projects/:id/brief-versions`
- `POST /formula-intelligence/design-projects/:id/brief-versions/compile`
  returns `NOT_CONFIGURED` in the current deterministic beta.
- `POST /formula-intelligence/design-projects/:id/brief-versions`
  creates an immutable `REVIEW_REQUIRED` or `REVIEWED` version. It requires the
  existing mutation safeguards and an `Idempotency-Key`.

## Security And Compatibility

- Organization and actor are derived from the authenticated server context.
- All project/version reads and writes use tenant scope and existing project or
  brand authorization checks.
- Unknown markets and missing IFRA/concentration/creative constraints become
  explicit unresolved questions; no business constraint is inferred.
- Existing projects are backfilled to `LEGACY_UNSTRUCTURED` and retain their
  previous generation behavior. New projects require `REVIEWED`.
- The checkpoint does not expose provider text, reasoning, headers, secrets,
  material documents, inventory, cost, or formula-side effects.

## Verification

- PASS: `npm.cmd test` - 15 files, 187 tests.
- PASS: frontend build, API build, Worker typecheck, Worker dry-run build,
  lint, client bundle secret scan, dependency audit, and diff check.
- PASS: scratch SQLite execution of `0036` verified legacy backfill and all
  new lineage tables.
- BLOCKED: full `d1:migrate:local` reaches a pre-existing `0010` local schema
  drift (`sidebar_mode` already exists) before it reaches `0036`.
- PARTIAL: no tracked Playwright configuration or authenticated browser fixture
  exists for this route; local service and shared-contract tests cover the
  reviewed gate, cross-tenant denial, validation, and checksum stability.

## Deferred

Candidate generation from a pinned material-universe snapshot, deterministic
candidate evaluations, Trial entry, sensory-memory retrieval, formula graph,
and commercial learning remain later Competitive Moat phases.
