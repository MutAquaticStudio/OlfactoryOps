# Competitive Moat: Phase 8 Report

## Outcome

**PASS (local deterministic verification)**

Phase 8 completes the controlled Reformulation Optimizer without enabling an
external provider or automated formula save.

## Controls

- Objectives support cost target/ceiling, inventory preference, material
  preservation, prohibited materials, compliance requirement, and trial-evidence
  preference.
- The default only permits human-reviewed `APPROVED` substitutions with a
  verified one-to-one strength factor. Similarity or lower cost alone is never
  sufficient.
- Candidate order is lexical: compliance, evaluated inventory, visible cost,
  then minimum composition change. Unknown evidence cannot improve rank.
- Pareto status is `NOT_EVALUATED` without cost or inventory evidence.
- Cost objectives require `costing.view`; an eligible-inventory hard gate
  requires `inventory.view`. Candidates failing an explicit cost ceiling,
  cost-reduction target, blocked-compliance gate, or inventory gate are not
  returned for draft confirmation.
- Save remains the existing explicit confirmation flow; it creates one normal
  non-consuming formula draft after final revalidation.

## Verification

Unit coverage demonstrates rejection without an approved substitute, permitted
replacement with a reviewed record, and Pareto uncertainty. Tenant-scoped
substitution service coverage passes.
