# Production Dispatchers

The production workflows are manual, environment-protected dispatchers. They
never run on pull requests or pushes and accept only a 40-character release
SHA from `codex/v2-production-go-live` or an approved `v2-production-*` tag.

| Workflow                                         | Confirmation                              | Scope                                                                                                   |
| ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `V2 Production PostgreSQL Migration`             | `APPLY_PRODUCTION`                        | Immutable V2 migration chain and least-privilege Hyperdrive runtime-role verification.                  |
| `V2 Production Release Dispatcher` API           | `DEPLOY_PRODUCTION_API`                   | Render and deploy the production API Worker candidate.                                                  |
| `V2 Production Release Dispatcher` tenant router | `DEPLOY_PRODUCTION_TENANT_ROUTER`         | Render and deploy the production tenant-router candidate.                                               |
| `V2 Production Release Dispatcher` Pages         | `DEPLOY_PRODUCTION_PAGES`                 | Build and deploy the production Pages candidate.                                                        |
| `V2 Production Release Dispatcher` Cloud Runtime | `DEPLOY_PRODUCTION_CLOUD_RUNTIME`         | Render and deploy the private Cloud Runtime candidate.                                                  |
| `V2 Production Release Dispatcher` route handoff | `HANDOFF_PRODUCTION_FIRST_RELEASE_ROUTES` | Reverify the approved first-release baseline and transfer only the API and tenant-router route targets. |
| `V2 Production Release Dispatcher` smoke         | `RUN_PRODUCTION_SMOKE`                    | Run the bounded, non-customer production smoke harness.                                                 |
| `V2 Production First-Release Rollback`           | `ROLLBACK_RC10_FIRST_RELEASE`             | Restore the exact baseline route targets before any optional cleanup of first-release RC10 Workers.     |

Every production job uses the GitHub `production` Environment, which must
retain a required reviewer. Secret values are never logged or copied into
source.

## First-production route handoff

When the exact RC10 production Workers are absent but the public API and
tenant-router patterns already have deterministic named Worker targets, the
readiness gate uses FIRST_RELEASE_ABSENCE_AND_ROUTE_HANDOFF_BASELINE.

The Pages preparation workflow captures exactly those two routes, verifies the
previous targets have one active version, proves the three RC10 production
Workers are absent and have no Custom Domains, and persists the approved
snapshot in the protected production Environment variable
PRODUCTION_FIRST_RELEASE_ROUTE_BASELINE. It emits only a fingerprint and safe
classifications, never route IDs or target names.

The dispatcher first deploys the exact RC10 API and tenant-router Workers with
their public routes removed from the rendered deployment config. Only the
separate route-handoff operation may update the existing route IDs, after
re-reading the approved baseline and proving the new exact RC10 Workers are
active. It verifies each handoff and bounded public health check immediately;
any failed handoff restores the approved targets.

The rollback workflow always restores the existing targets first and verifies
them before it can optionally delete only the exact RC10 first-release
Workers. It never deletes or changes the previous targets. Leaving failed RC10
Workers unrouted is the default recovery policy.

## First-deployment secret rotation gate

`ROTATE_EXPOSED_PRODUCTION_RUNTIME_SECRETS_BEFORE_FIRST_PRODUCTION_DEPLOY = YES`

Before a first production API or Cloud Runtime deployment, an authorized
operator must rotate the following GitHub Environment secrets outside the
repository: `V2_SESSION_PEPPER`, `V2_PASSWORD_PEPPER`,
`V2_INVITATION_ENCRYPTION_KEY`, and `SCIENTIFIC_CONTAINER_SHARED_SECRET`.
The operator must then set both non-secret Environment variables
`PRODUCTION_RUNTIME_SECRET_ROTATION_RELEASE_SHA` and
`PRODUCTION_ENVIRONMENT_REVALIDATED_RELEASE_SHA` to the exact release SHA.
The dispatcher refuses an API or Cloud Runtime deployment unless both values
match its validated input SHA. It writes the rotated secret values only through
Cloudflare's protected Worker secret API and verifies binding names only.

Before a dispatcher may be approved, operators must set the required
production Environment variables for the exact candidate: `PRODUCTION_HYPERDRIVE_ID`,
`PRODUCTION_CANDIDATE_PAGES_ORIGIN`, `PRODUCTION_PAGES_PROJECT`, pinned
scientific image references/digests, and isolated smoke endpoints. The
dispatcher fails closed when any required value is absent. It does not replace
the legacy D1 retention decision, staging revalidation, migration/RLS evidence,
Platform Owner bootstrap, rollback preparation, or production-candidate smoke.
