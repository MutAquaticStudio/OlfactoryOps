# Production Rollback Plan

Status: BLOCKED

No production V2 candidate has been deployed, so this is a preflight runbook
rather than executable rollback evidence.

1. Record the active Pages deployment, API Worker version, Tenant Router
   version, Cloud Runtime version, route records, container digests and a
   production PostgreSQL backup checksum before any cutover.
2. Deploy the release SHA only to isolated candidate surfaces. Confirm the
   candidate uses production-only Hyperdrive, R2, queues and secrets.
3. On a failed candidate smoke, restore the recorded Pages/Worker versions and
   exact prior routes. Do not attempt a destructive PostgreSQL down migration.
4. If a migrated schema introduces an application defect, deploy the prior
   compatible application version and use a forward corrective migration after
   the incident is contained.

The legacy D1 production database is not a rollback target for V2. It must be
backed up and given an explicit approved migration/retention decision before
any public production cutover.
