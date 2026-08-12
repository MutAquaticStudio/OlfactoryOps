# Production Resource Inventory

Status: BLOCKED

This inventory is a read-only preflight snapshot. No production resource was
created, changed, or deleted while producing it.

| Resource | Current classification | Evidence |
| --- | --- | --- |
| Pages `labofscents` | LEGACY | Current public Pages release predates the accepted V2 staging SHA. |
| API Worker `olfactoryops-api` | LEGACY | `api.labofscents.org/*` is served by the D1-era Worker. |
| Tenant Router `olfactoryops-tenant-router` | LEGACY | `*.labofscents.org/*` remains the D1-era router. |
| Production D1 `olfactoryops-production` | PRODUCTION_ACTIVE | D1 migration head `0044`, 121 tables and meaningful legacy data; no migration or overwrite is authorized. |
| Production V2 Hyperdrive | PRODUCTION_CANDIDATE | `olfactoryops-production-hyperdrive` / `b415b7572d9f45058ebb4ec4166b8739`; its Supabase PostgreSQL origin hostname is distinct from staging. |
| Production GitHub Environment | MISSING | Only the `staging` Environment was present during preflight. |
| V2 R2 / Queue / Workflow / Container bindings | MISSING | Candidate names exist only in non-deployable templates. |
| `admin.labofscents.org` | MISSING | Requires certificate, DNS and candidate-routing preflight. |

## Release Gate

`PRODUCTION_POSTGRES_ISOLATED_FROM_STAGING = YES`

Production deployment, migrations, DNS changes, and tag promotion remain
blocked until the protected GitHub Environment, production runtime-role SQL
verification, legacy-data migration decision, and rollback evidence are
available.
