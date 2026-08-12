# Production Rollback Plan

Status: BLOCKED

No production V2 candidate or public V2 release has been deployed, so this is
a preflight runbook rather than executable rollback evidence. The current
public product remains the legacy Pages/Worker/D1 path.

## Current rollback snapshot

| Surface | Current evidence | Rollback state |
| --- | --- | --- |
| Public Pages | Project `labofscents`, canonical deployment `36fc32c6-ccd3-475e-a4f8-867acde16e7a`, source `356b4e078247dcb6bed6a8a7a9b6e64de6afa141` | PRESERVED |
| Public API | Legacy Worker `olfactoryops-api` on `api.labofscents.org/*`, route `9848a5891c7842548e39404ade7b7a47` | PRESERVED; Cloudflare reported no Worker version-history entry through the current API, so an immutable version identifier must be captured immediately before public cutover. |
| Public tenant router | Legacy Worker `olfactoryops-tenant-router` on `*.labofscents.org/*`, route `34adabc0524c41dcbaf00fc5bdd055eb` | PRESERVED; Cloudflare reported no Worker version-history entry through the current API, so an immutable version identifier must be captured immediately before public cutover. |
| Public DNS | Existing apex, `www`, `api`, and wildcard records are proxied and unchanged | PRESERVED; no candidate hostname record is present. |
| Production V2 Hyperdrive | `olfactoryops-production-hyperdrive` / `b415b7572d9f45058ebb4ec4166b8739` | PROVISIONED, not publicly bound. |
| Production PostgreSQL | RC2 protected run `31583751600` applied/verified 24 V2 migrations | BACKUP_REFERENCE_BLOCKED: no provider backup/export reference is recorded yet. |
| Legacy D1 | Archive-only export recorded in [PRODUCTION_LEGACY_D1_RETENTION_PLAN.md](PRODUCTION_LEGACY_D1_RETENTION_PLAN.md) | PRESERVED; never a V2 rollback target. |
| Production V2 Cloud Runtime / R2 / Vectorize / Queue / Workflow / Containers | Not provisioned | No V2 deployment exists to roll back. |
| RC2 candidate | `v2-production-rc2` / `5985834a0e14728c81c8c028a72122ded544bd6b` | Verified in staging only; not publicly deployed. |

## Current exact rollback command

There is no public V2 deployment to reverse. The only correct current rollback
command is therefore **no Cloudflare, DNS, or PostgreSQL mutation**. The
production release dispatcher must not be used as a substitute for a rollback
operation, and no destructive down migration is authorized.

1. Before any candidate or public V2 cutover, create and record a production
   Supabase backup/export reference through the approved provider control plane.
   Record only its opaque reference, timestamp, scope, and checksum if the
   provider exposes one; never record database credentials.
2. Immediately before a public cutover, capture the active Pages deployment,
   API Worker version, Tenant Router version, Cloud Runtime version, route
   records, container digests, and the new backup reference. The legacy Worker
   version IDs are not currently available through the account API and must be
   captured from the release control plane at that time.
3. Deploy the release SHA only to isolated candidate surfaces. Confirm the
   candidate uses production-only Hyperdrive, R2, queues and secrets.
4. On a failed candidate smoke, delete or disable only the isolated candidate
   surfaces and retain all public legacy routes unchanged. On a failed public
   cutover, restore the recorded Pages/Worker versions and
   exact prior routes. Do not attempt a destructive PostgreSQL down migration.
5. If a migrated schema introduces an application defect, deploy the prior
   compatible application version and use a forward corrective migration after
   the incident is contained.

No candidate deployment or public cutover may begin until
`ROTATE_EXPOSED_PRODUCTION_RUNTIME_SECRETS_BEFORE_FIRST_PRODUCTION_DEPLOY = YES`
has been satisfied by an actual protected-Environment rotation and exact-SHA
revalidation. The rotation markers are a deployment guard, not rollback
evidence.

The legacy D1 production database is not a rollback target for V2. Its
archive-only decision and Cloudflare D1 export evidence are recorded in
[PRODUCTION_LEGACY_D1_RETENTION_PLAN.md](PRODUCTION_LEGACY_D1_RETENTION_PLAN.md).
It remains preserved separately and must never be pointed at Hyperdrive.

The protected Platform Owner bootstrap remains a separate post-migration
ceremony documented in [PLATFORM_OWNER_BOOTSTRAP_PREPARATION.md](PLATFORM_OWNER_BOOTSTRAP_PREPARATION.md). It must not run against staging or with the runtime Hyperdrive role.

`ROLLBACK_READY = BLOCKED_PRODUCTION_BACKUP_AND_CANDIDATE_SNAPSHOT`
