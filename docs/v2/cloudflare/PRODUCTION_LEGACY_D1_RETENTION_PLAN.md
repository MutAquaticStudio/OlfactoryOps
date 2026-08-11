# Production Legacy D1 Retention Plan

Status: BLOCKED

Classification: **A. Archive-only, no V2 import**, pending an explicit owner
decision. This is not authorization to delete, overwrite, export, or alter
the legacy database.

## Read-only inventory

| Item | Observed value |
| --- | --- |
| Database | `olfactoryops-production` |
| Cloudflare database ID | `d70bc633-a4d8-4898-8149-d795032cf497` |
| Migration head | `0044_email_verification.sql` |
| Tables | 121 |
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

## Required decision before V2 production cutover

1. Retain an immutable export/backup with an owner, timestamp and checksum.
2. Decide whether the legacy application remains read-only/archived or whether
   a separately reviewed selective/full migration is required.
3. If a migration is approved, create a dedicated mapping, reconciliation,
   rollback and customer-notification plan. Do not point V2 PostgreSQL at D1.

Until that decision is approved:

`PRODUCTION_DATA_GATE = BLOCKED_LEGACY_D1_DECISION`
