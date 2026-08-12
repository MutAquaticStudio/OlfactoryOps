# Production Legacy D1 Retention Plan

Status: PASS

Classification: **A. Archive-only, no V2 import**, authorized for this
release. The legacy database remains preserved; it is neither deleted,
overwritten, nor used by the V2 PostgreSQL transactional core.

## Read-only inventory

| Item | Observed value |
| --- | --- |
| Database | `olfactoryops-production` |
| Cloudflare database ID | `d70bc633-a4d8-4898-8149-d795032cf497` |
| Migration head | `0044_email_verification.sql`, applied `2026-08-03 10:54:55` |
| Provider table count | 119 |
| SQLite catalog table count | 121 |
| Indexes | 344 |
| Approximate size | 20,930,560 bytes |
| Tenant organizations | 2 |
| Tenant memberships | 4 |
| Auth sessions | 75 |
| Formula records | 2 |
| Inventory lots | 9 |
| Audit events | 216 |

The inventory used Cloudflare D1 metadata and aggregate-only count queries.
No customer, formula, credential, session, or audit row content was read.

## Archive evidence

On `2026-08-12T08:46:31Z`, Cloudflare D1 completed a full SQL export through
the provider's polling export API. The response recorded the non-sensitive
provider artifact name
`d70bc633-a4d8-4898-8149-d795032cf497-0000007d-00000170-000050c5-2637a1250ea266d813613b9842a58f12.sql`.
The expiring signed download URL and exported row data were intentionally not
logged, committed, or displayed. Cloudflare's D1 export API does not expose a
content checksum, so no checksum is claimed.

The source D1 is retained unchanged as the historical archive and is separate
from V2 PostgreSQL. Its production legacy writers must be retired only as part
of the later, separately authorized public cutover; no legacy route or D1
binding was changed by this archive operation.

## Inspection and restore procedure

1. Use a production-authorized Cloudflare operator session to inspect D1
   metadata and aggregate-only counts for database
   `d70bc633-a4d8-4898-8149-d795032cf497`.
2. Do not browse customer, session, Formula, or audit rows. Use the retained
   D1 source plus the provider export only for a narrowly approved incident,
   legal-retention, or migration review.
3. A restore must target an isolated non-production D1 instance and requires a
   separate approval. Reconcile only the export filename, migration head,
   schema/table counts, and aggregate manifests before any authorized deeper
   investigation.
4. D1 is not a V2 rollback database and must never be attached to the V2
   Hyperdrive runtime.

`LEGACY_D1_DECISION = ARCHIVE_ONLY`

`LEGACY_D1_ARCHIVE = PASS`

`PRODUCTION_DATA_GATE = PASS_ARCHIVE_ONLY`
