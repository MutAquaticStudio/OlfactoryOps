# Governed Material Intelligence Bulk Persistence

This operator-only runner consumes the exact artifact produced by
`scripts/material_intelligence_bulk_precheck.py`. It does not expose a browser
bulk-write route and it never performs enrichment or model work.

## Preview

```powershell
npm run material-intelligence:bulk-import -- --file <approved.xlsx> --mode preview --expected-sha256 <approved-sha256>
```

Preview is the default when `--mode` is omitted. It validates the file, runs the
canonical precheck in an isolated temporary directory, reconciles all source
rows and waves, reports planned record counts, and performs zero database writes.

## Staging apply

Required protected environment values:

- `STAGING_DATABASE_URL`: staging PostgreSQL connection used only by the
  operator workflow.
- `V2_RUNTIME_DATABASE_ROLE`: the non-superuser, non-`BYPASSRLS` runtime role
  whose migration `0027` grants and tenant policies are attested.

Required operator inputs:

- immutable XLSX path or downloaded workflow artifact;
- approved SHA-256;
- exact organization ID;
- exact active actor user ID;
- `--environment staging`;
- `--mode apply`;
- `--confirm-apply APPLY_MATERIAL_INTELLIGENCE_STAGING`.

```powershell
npm run material-intelligence:bulk-import -- --file <approved.xlsx> --sheet "Material Intelligence" --expected-sha256 a49bede2801da2e0edb25a305fc3df8b751837e3d0aba6779bf0750e1e456ef4 --environment staging --tenant <organization-id> --actor-user <active-operator-user-id> --mode apply --confirm-apply APPLY_MATERIAL_INTELLIGENCE_STAGING
```

The runner never accepts a database URL as a command-line argument. It rejects
production with `PRODUCTION_BULK_IMPORT_NOT_AUTHORIZED` and has no bypass flag.

## Apply gates

Before the first write, the runner verifies:

1. the source is a bounded regular `.xlsx` file and its SHA is unchanged before
   and after canonical precheck;
2. every source row is present in exactly one precheck wave;
3. migration `0027` has all five tables with forced tenant RLS and canonical
   policies;
4. the configured runtime role is non-superuser/non-`BYPASSRLS` and has exact
   mutable versus append-only grants;
5. the organization, actor, membership and role policy are active, with
   `materials.edit`, `materials.approve`, and `imports.commit`.

## Batching, replay, and failure

Rows are committed in batches of 50 by default (allowed range 25-100). Stable
record IDs are derived from tenant, source file hash, sheet and source row ID.
A replay validates the deterministic material and its append-only provenance,
then counts it as `skippedIdempotentRows`.

A failed batch rolls back as one unit. Earlier batches remain committed and a
retry resumes idempotently. The final report reconciles:

```text
inputRows = persistedRows + skippedIdempotentRows + failedRows
unaccountedRows = 0
```

A partial run reports non-zero unaccounted rows and fails. No cleanup/drop is
required before retry.

## Scientific boundary

Source CAS, FEMA, EINECS, formula, molecular-weight and trade-name values remain
claims. They do not merge entities or make a material model-eligible. Verified
molecular identity is created only for a canonical precheck
`CREATE_VERIFIED_CANDIDATE` carrying verified structure evidence. Dilution
active/carrier components remain separate, and unknown concentration basis is
retained as unknown rather than inferred.
