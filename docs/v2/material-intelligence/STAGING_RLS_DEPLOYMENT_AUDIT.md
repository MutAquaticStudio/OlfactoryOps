# Material Intelligence staging RLS deployment audit

BLOCKING_SCRIPT=scripts/apply-v2-staging-migrations.mjs
BLOCKING_POLICY=The staging migration attestation must enumerate every tenant-owned table, prove ENABLE/FORCE RLS, and prove the canonical v2_tenant_scope USING/WITH CHECK policy before reporting PASS.
EXPECTED_RLS_CONTRACT=Five Material Intelligence tables use the repository-standard app.organization_id tenant context; mutable tables permit tenant-scoped CRUD, while evidence and eligibility tables permit SELECT/INSERT only and reject UPDATE/DELETE.
MIGRATION_0027_CURRENT_STATE=Migration 0027 creates all five tenant-owned tables, enables and forces RLS, installs v2_tenant_scope, uses tenant-composite foreign keys, and installs append-only triggers.
MISSING_REQUIREMENT=The staging and production migration runners did not attest the five new tables or their policy expressions, and the Hyperdrive runtime-role configurators restored UPDATE/DELETE on the two append-only tables through a schema-wide CRUD grant.

## Root cause

The blocker was governance coverage, not a missing domain table definition. Migration
0027 was already registered in each controlled PostgreSQL migration chain. Its dynamic
loop creates the same explicit policy name and canonical tenant expression on a closed,
literal list of five tables; no repository verifier rejects that implementation.

The controlled runners verified only their pre-0027 RLS inventories. A successful run
therefore could not prove that all five Material Intelligence tables existed with forced
RLS and the expected policy. Separately, runtime-role hardening granted CRUD on all
tables after migrations, which was broader than the append-only evidence and eligibility
contract.

## Corrective contract

- Keep migration 0027 and its domain model unchanged.
- Add a shared, fail-closed five-table governance inventory.
- Require exact table coverage, ENABLE/FORCE RLS, one permissive ALL policy named
  `v2_tenant_scope`, and canonical `app.organization_id` expressions in both
  `USING` and `WITH CHECK`.
- Revoke UPDATE and DELETE from `v2_app` and the configured Hyperdrive runtime role
  on `v2_material_intelligence_evidence` and
  `v2_scientific_eligibility_decisions`.
- Verify mutable-table CRUD and append-only SELECT/INSERT grants after runtime-role
  configuration.
- Exercise tenant A/B visibility, cross-tenant mutation and foreign-key rejection,
  positive tenant writes, and append-only triggers in a loopback PostgreSQL database.

No production or staging database is mutated by this code-fix PR.
