# Phase 8 Production Manufacturing Architecture

## Ledger Ownership

An approved Formula Version is the only Formula input to a Production Order.
Creation captures an immutable Formula snapshot and hash, then derives the
material requirements from that snapshot. Later Formula edits cannot rewrite
the batch's source definition.

Raw materials remain Phase 2 inventory:

- Production allocation is reservation-backed against an eligible raw lot.
- Confirmed production weighing links the requirement/allocation to the
  Phase 2 lab-weighing line and immutable raw-material consumption movement.
- `v2_production_material_usages` records controlled production provenance; it
  is not a replacement raw-material ledger.
- A pre-process correction is a controlled compensating workflow. Once a
  process stage is complete, the batch must be managed through hold and rework
  rather than a direct raw-material reversal.

Finished goods remain Phase 8 records:

- `v2_finished_good_lots` owns the produced lot and release relationship.
- `v2_finished_good_ledger_entries` is the append-only finished-good balance
  source. `PRODUCTION_OUTPUT` moves output to `QUARANTINE`; `QUALITY_RELEASE`
  moves `QUARANTINE` or `HOLD` to `AVAILABLE`.
- A post-release `QUALITY_HOLD` moves the complete available lot balance from
  `AVAILABLE` to `HOLD`, creates a documented QC deviation, and never writes a
  raw-material movement or reservation. Its controlled outcomes are:

| Finished-good path | Ledger record | Bucket effect |
|---|---|---|
| First release | `PRODUCTION_OUTPUT`, then `QUALITY_RELEASE` | `null -> QUARANTINE -> AVAILABLE` |
| Post-release hold | `QUALITY_HOLD` | `AVAILABLE -> HOLD` |
| Hold cleared after controlled investigation | `QUALITY_RELEASE` | `HOLD -> AVAILABLE` |
| Controlled finished-good rework | `REWORK_CONSUMPTION` | `HOLD -> REWORK` |
| Controlled rejection | `WASTE` | `HOLD -> null` |
| Future finished-good reservation/fulfillment | `RESERVATION`, `RELEASE_RESERVATION`, `FULFILLMENT` | `AVAILABLE -> RESERVED -> AVAILABLE/null` |

Adjustments and returns likewise remain finished-good ledger events. None of
these paths creates a raw-material movement or reservation.

The Phase 8 finished-good tables do not have a foreign key to `v2_inventory_*`
or `v2_shipments`. Raw provenance is retained through the production usage and
genealogy links instead of merging the two ledgers.

## Persistence And Tenant Fence

The current migration chain is `0012` through `0014`. It covers 19
tenant-scoped Phase 8 tables: production order/snapshot/requirements,
allocation/weighing/usage, process/QC, deviation/CAPA/deviation evidence,
yield/rework/release, finished-good lot/ledger, genealogy, and document
snapshots. The chain declares 51 composite tenant foreign keys.

Every Phase 8 tenant table has RLS enabled and forced. Composite
`(organization_id, id)` foreign keys bind related production, raw-material,
finished-good, evidence, and release records to the same tenant. Formula
snapshots, finished-good ledger entries, genealogy edges, and deviation-evidence
links are append-only. QC corrections and releases retain explicit revision and
supersession provenance rather than overwriting the historical decision.

## Production State Machine

```text
DRAFT -> PLANNED -> READY_FOR_WEIGHING -> WEIGHING
WEIGHING -> COMPOUNDING | HOLD
COMPOUNDING -> CONDITIONING | HOLD | REWORK
CONDITIONING -> FILTRATION | HOLD | REWORK
FILTRATION -> FILLING | HOLD | REWORK
FILLING -> QC | HOLD | REWORK
QC -> RELEASED | REJECTED | HOLD | REWORK
HOLD -> READY_FOR_WEIGHING | WEIGHING | COMPOUNDING | CONDITIONING |
        FILTRATION | FILLING | QC | REWORK | RELEASED | REJECTED
REWORK -> COMPOUNDING | CONDITIONING | FILTRATION | FILLING | QC | HOLD
RELEASED -> HOLD | CLOSED
REJECTED -> CLOSED
```

`DRAFT`, `PLANNED`, and `READY_FOR_WEIGHING` may transition to `CANCELLED`.
`CANCELLED` and `CLOSED` are terminal. A batch in `WEIGHING` cannot be
cancelled, because immutable raw-material consumption may already exist; it
must move through a documented hold/correction or rework path. The `RELEASED`
to `HOLD` transition is restricted to the dedicated post-release
finished-good quality-hold workflow, which moves the corresponding
finished-good balance in the same transaction. The generic hold-resume action
can return only to an operational production state; it cannot release or
reject a held order. `HOLD -> RELEASED` is the controlled `CONTINUE`
disposition for a full held finished-good lot and writes `QUALITY_RELEASE`.
For a held released finished-good lot, `HOLD -> REJECTED` writes `WASTE`; an
in-process QC rejection has no finished-good waste event. The public release
action itself still accepts only an order in `QC`.

Each controlled process step is one of `COMPOUNDING`, `CONDITIONING`,
`FILTRATION`, or `FILLING`; its status transitions from `NOT_STARTED` to
`IN_PROGRESS` to `COMPLETED`, with controlled `SKIPPED` and `FAILED` paths.

## Permissions And Human Authority

The registered Phase 8 capability keys are:

`production.view`, `production.create`, `production.plan`,
`production.allocate`, `production.weigh`, `production.process`,
`production.qc`, `production.qc.record`, `production.qc.approve`,
`production.deviation.manage`, `production.release`, `production.cancel`,
`production.close`, `production.finishedGoods.view`,
`production.documents.view`, and `production.documents.manage`.

`production.qc` remains a compatibility key. Runtime QC actions use the
granular `production.qc.record` and `production.qc.approve` permissions.

| Default role boundary | Phase 8 authority |
|---|---|
| Owner / Admin | Full registered Phase 8 set, including release. Existing policies receive the additive Phase 8 backfill. |
| Lab Manager | View/create/plan/allocate/weigh/process, QC record/approve, deviation/CAPA, cancel/close, finished-good view, and document view/manage. No `production.release`. |
| Lab Technician | View, weigh, process, QC record, finished-good view, and document view only. No create, plan, allocate, QC approval, deviation management, release, cancel, close, or document management. |
| Perfumer | Production view and document view only. Finished-good genealogy remains denied because it also requires `production.finishedGoods.view`. |
| Other roles | No Phase 8 authority is inferred without an explicit tenant policy grant. |

Release needs both `production.release` and `production.qc.approve`. In the
default policy this leaves release with Owner/Admin. The post-release
quality-hold action needs deviation management, QC approval, finished-good
view, document view, and at least one active controlled document snapshot. It
also requires both the Production Order and finished-good lot to be `RELEASED`,
the full initial lot quantity to remain in `AVAILABLE`, and no quantity in
`QUARANTINE`, `HOLD`, `REWORK`, or `RESERVED`; partial lots must be resolved by
their owning workflow before the quality hold can start.

## Deterministic Release Gate

Only an order in `QC` may be released. Before a release record is created, the
server evaluates and snapshots all of the following:

1. An immutable Formula snapshot exists.
2. At least one material requirement and at least one allocation exist, and
   every requirement and allocation is `CONSUMED`.
3. All four process stages are `COMPLETED`.
4. An active QC specification exists and every required check's latest revision
   is `PASSED`; an older passing revision cannot mask a later invalidation or
   replacement.
5. All deviations are `CLOSED` or `VOIDED`, and all CAPA actions are
   `EFFECTIVE`.
6. The latest yield record is `RECONCILED`; all rework records are `COMPLETED`
   or `CANCELLED`.
7. At least one active controlled document snapshot is supplied before release
   and the finished quantity is positive. Generated process/release documents
   are captured after the gate succeeds and do not satisfy this pre-release
   requirement.

The decision persists a gate snapshot and checksum, a release revision, a
finished-good lot, ledger entries, genealogy edges, and generated release
documents. A post-release hold followed by documented finished-good rework
invalidates prior QC results and creates a `REVIEW_REQUIRED` yield revision.
It therefore requires fresh QC results and a new reconciled yield before a
subsequent release. A successful re-release creates a new release revision that
supersedes the prior decision and a new finished-good lot; it does not rewrite
the released history.

## Traceability And Boundaries

Genealogy joins the Production Order to Formula version/snapshot, planned
materials (with planned quantity carried in edge evidence), raw-material uses,
weighing, process steps, QC,
deviations/CAPA, yield/rework, release, finished-good lot/ledger, and document
snapshots. QC result revisions use explicit supersession, releases retain
revision/supersession provenance, and the append-only
`v2_production_deviation_evidence` junction links a deviation to its controlled
document snapshots. The finished-good genealogy projection returns the
associated active document snapshots, rather than a full archived/superseded
document history, and requires both
`production.finishedGoods.view` and `production.documents.view`; document-only
access is insufficient. QC revisions, release supersession, and
deviation-evidence document links retain their own provenance rather than
replacing the preceding record.

This provides the Phase 8 raw-lot-to-finished-good lineage required for
production. The downstream Order/Shipment segment of BR-081 is a Commerce
dependency and is `BLOCKED`: Phase 8 does not add sales-order, SKU, or shipment
edges or make `v2_shipments` a finished-good ledger.

## Deployment Boundary

Remote migration and production deployment are `NOT_APPLICABLE` for this local
checkpoint. No remote environment or deployment is asserted by the local
database, RLS, contract, or role/browser evidence.
