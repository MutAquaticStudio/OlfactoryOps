# Production Dispatchers

The production workflows are manual, environment-protected dispatchers. They
never run on pull requests or pushes and accept only a 40-character release
SHA from `codex/v2-production-go-live` or an approved `v2-production-*` tag.

| Workflow | Confirmation | Scope |
| --- | --- | --- |
| `V2 Production PostgreSQL Migration` | `APPLY_PRODUCTION` | Immutable V2 migration chain and least-privilege Hyperdrive runtime-role verification. |
| `V2 Production Release Dispatcher` API | `DEPLOY_PRODUCTION_API` | Render and deploy the production API Worker candidate. |
| `V2 Production Release Dispatcher` tenant router | `DEPLOY_PRODUCTION_TENANT_ROUTER` | Render and deploy the production tenant-router candidate. |
| `V2 Production Release Dispatcher` Pages | `DEPLOY_PRODUCTION_PAGES` | Build and deploy the production Pages candidate. |
| `V2 Production Release Dispatcher` Cloud Runtime | `DEPLOY_PRODUCTION_CLOUD_RUNTIME` | Render and deploy the private Cloud Runtime candidate. |
| `V2 Production Release Dispatcher` smoke | `RUN_PRODUCTION_SMOKE` | Run the bounded, non-customer production smoke harness. |

Every production job uses the GitHub `production` Environment, which must
retain a required reviewer and disabled administrator bypass. Secret values are
never logged or copied into source.

Before a dispatcher may be approved, operators must set the required
production Environment variables for the exact candidate: `PRODUCTION_HYPERDRIVE_ID`,
`PRODUCTION_CANDIDATE_PAGES_ORIGIN`, `PRODUCTION_PAGES_PROJECT`, pinned
scientific image references/digests, and isolated smoke endpoints. The
dispatcher fails closed when any required value is absent. It does not replace
the legacy D1 retention decision, staging revalidation, migration/RLS evidence,
Platform Owner bootstrap, rollback preparation, or production-candidate smoke.
