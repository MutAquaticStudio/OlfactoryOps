# Competitive Moat: Phase 0-2 Data Flow

## New Project

1. An authenticated Formula Intelligence user submits a name and raw brief.
2. The API derives tenant and actor from the session, applies the existing
   mutation/idempotency boundary, and creates a `RAW` brief version.
3. The raw input is preserved verbatim as user data. No inferred market, IFRA,
   budget, material, or compliance value is added.
4. The UI presents a structured review form. In this checkpoint the provider
   endpoint reports `NOT_CONFIGURED`; users enter structured constraints
   manually.
5. Server validation normalizes only allow-listed values. Missing critical
   values become unresolved questions.
6. Saving a valid reviewed brief creates a new immutable version, updates the
   project current-version pointer, writes an audit event, and makes the
   project eligible for direction generation.

## Compatibility Flow

Historical projects receive a `LEGACY_UNSTRUCTURED` version during migration.
Their original `brief_json` remains the input to existing generation paths.
No structure or constraint is inferred during backfill. New projects need a
`REVIEWED` version; legacy projects retain their existing behavior until a
user creates a reviewed version.

## Candidate Generation

1. A reviewed project starts a tenant-scoped run and links its immutable brief
   version plus constraint snapshot to that run.
2. The deterministic catalog filters material visibility and blocked/source-only
   status. The eligible universe is normalized, SHA-256 hashed, and pinned once
   to the snapshot before proposals are generated.
3. Three Design Studio candidates are generated from that pinned universe.
   Formula math, required-material constraints, compliance, availability, and
   cost when permitted are evaluated deterministically.
4. Directions and evaluation records are persisted together. The private
   comparison artifact includes the brief version, snapshot ID, universe hash,
   and ranked evaluation; a brand share receives only the existing safe
   projection.
5. No candidate reserves or consumes stock. Trial release, Lab Usage, sensory
   evidence, and Formula approval remain separate controlled workflows.

## Candidate To Trial

1. A perfumer saves one private direction as a normal formula draft, then
   follows the existing formula review and approval workflow.
2. The trial entry point rechecks direction ownership, tenant scope, reviewed
   brief lineage, constraint snapshot, material-universe hash, evaluation, and
   the current formula approval state.
3. A `PLANNED` Trial receives both the approved immutable formula snapshot and
   a compact Formula Intelligence provenance record. It does not copy prompt,
   provider, cost, lot, raw compliance, or sensitive material data.
4. Trial planning never reserves or consumes stock. Only the existing Lab Usage
   commit can write material movements and attach actual lot/weight evidence.

## Completed Trial Evidence

1. A Formula or Optimizer requests evidence for one immutable formula version.
2. The server derives tenant and actor from the authenticated session, requires
   sensitive Formula, Materials, and Trials visibility, and builds the target
   snapshot server-side.
3. Only `DECIDED` comparable trials in the same tenant contribute aggregate
   sensory evidence. Three overall scorecards are the minimum threshold.
4. The response contains status, sample count, confidence, aggregate scores,
   and a descriptive limitation. It never contains raw observation comments,
   evaluator identity, public-link data, lot, cost, or composition.
5. The response is read-only: no formula, candidate, Trial, approval, or
   inventory record changes during retrieval.

## Private Sensory Memory And Operational Trace

1. A manager closes a Trial with `ACCEPT`, `REVISE`, or `REJECT` after normal
   Trial and sensory workflow controls have completed.
2. The server writes one tenant-scoped derived memory record without copying raw
   comments, evaluator identity, public tokens, or the decision rationale.
3. It appends an immutable workspace preference-profile version. Fewer than
   three records remains `NOT_ENOUGH_EVIDENCE`.
4. Design Studio may use the profile only as a bounded ranking adjustment; it
   never changes a formula proposal, consumes inventory, or claims a predicted
   sensory outcome.
5. The lineage endpoint derives a bounded projection from formula versions,
   Trials, Lab Usage lot allocations, production batches, finished goods,
   orders, and evidence documents. The source operating records remain the
   only source of truth.

## Controlled Reformulation

1. A user selects an immutable formula version and sends explicit objective and
   constraint data with an idempotency key.
2. The server validates material visibility, formula math, locked/prohibited
   material constraints, and current permissions.
3. The deterministic optimizer considers only reviewer-approved substitution
   records unless an authorized future policy explicitly changes that rule.
4. Compliance, eligible inventory, visible cost, and composition change are
   ordered lexically. Missing commercial evidence is `NOT_EVALUATED`.
5. An accepted candidate still enters the normal confirmation and formula-draft
   workflow. It never reserves or consumes stock.
