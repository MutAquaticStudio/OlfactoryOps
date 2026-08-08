# Competitive Moat Execution State

## Checkpoint

**Phase 0-9 Formula Intelligence Foundation, Private Learning, Traceability, and Controlled Optimization**

## Scope Lock

- Local repository changes only.
- Deterministic mock mode only.
- No provider activation, external LLM calls, secrets, deployment, Git push,
  remote D1 migration, or changes to Formula/Inventory/Trial domain rules.

## Exit Criteria

- Architecture, data flow, risks, and deferred phases documented.
- Brief data is tenant-scoped, immutable, versioned, and backward-compatible.
- New projects require a reviewed structured brief before generation.
- Reviewed generation pins one eligible material universe with a SHA-256 hash
  before directions are built; private candidate evaluation is durable and
  replayable without exposing it through brand shares.
- A saved direction can enter Trials only through a normal approved formula
  version; its reviewed candidate lineage is immutable and inventory remains
  unchanged until existing Lab Usage is committed.
- Formula R&D and Optimizer can read only aggregate evidence from completed,
  tenant-scoped sensory history. Insufficient evidence remains explicit and
  panelists/public feedback never receive the comparable-history projection.
- Decided Trials create a tenant-private sensory-memory record and immutable
  preference-profile version. Learning is bounded descriptive ranking evidence,
  never cross-tenant training, a sensory guarantee, or a formula mutation.
- Formula, Trial, Lot, Batch, finished-good, Order, and document relationships
  are available through a bounded tenant-scoped operational-lineage projection.
- Optimizer objectives include approved substitutions, material preservation or
  prohibition, inventory and cost gates, and explicit Pareto uncertainty.
- Server-side feature flags act as Formula Intelligence kill switches for
  generation, optimizer, private sensory memory, and RAG evidence retrieval.
- Disabled provider behavior is explicit and never simulates AI extraction.
- Worker and local paths use the same contract and validation rules.
- Focused security, migration, schema, and UI checks pass.

## Verification Record

Baseline before checkpoint implementation:

- `npm.cmd test`: PASS, 195 tests after Phase 5 additions.
- `npm.cmd run typecheck:worker`: PASS.
- `npm.cmd run build:api`: PASS.

Implementation verification:

- Shared schema and local parity tests: PASS.
- Candidate comparison schema, Worker universe pinning, and local persisted
  candidate evaluation tests: PASS.
- Frontend build, local API build, Worker typecheck, and lint: PASS.
- Migration `0036_competitive_moat_briefs.sql` scratch verification: PASS.
  It created immutable lineage tables and backfilled a legacy project without
  inventing a structured brief.
- Test D1 local binding migration verification: PASS. The isolated
  `olfactoryops-test` binding applied `0034` through `0037`, including the new
  sensory-memory, preference-profile, and approved-substitution tables.
- Full `d1:migrate:local`: BLOCKED before `0036` by pre-existing local schema
  drift. Migration `0010_user_settings_accent_color.sql` attempts to add an
  already-present `user_settings.sidebar_mode` column. No local state was reset
  or repaired during this checkpoint.

Remote D1 and hosted checks remain intentionally out of scope for this
checkpoint.
