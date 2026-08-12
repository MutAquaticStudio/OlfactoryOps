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

No candidate deployment or public cutover may begin until
`ROTATE_EXPOSED_PRODUCTION_RUNTIME_SECRETS_BEFORE_FIRST_PRODUCTION_DEPLOY = YES`
has been satisfied by an actual protected-Environment rotation and exact-SHA
revalidation. The rotation markers are a deployment guard, not rollback
evidence.

The legacy D1 production database is not a rollback target for V2. It must be
backed up and given an explicit approved migration/retention decision before
any public production cutover.

The protected Platform Owner bootstrap remains a separate post-migration
ceremony documented in [PLATFORM_OWNER_BOOTSTRAP_PREPARATION.md](PLATFORM_OWNER_BOOTSTRAP_PREPARATION.md). It must not run against staging or with the runtime Hyperdrive role.
