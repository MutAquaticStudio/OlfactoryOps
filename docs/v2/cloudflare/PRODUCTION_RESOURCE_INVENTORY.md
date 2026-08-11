# Production Resource Inventory

Status: BLOCKED

This inventory is a read-only preflight snapshot. No production resource was
created, changed, or deleted while producing it.

| Resource | Current classification | Evidence |
| --- | --- | --- |
| Pages `labofscents` | LEGACY | Current public Pages release predates the accepted V2 staging SHA. |
| API Worker `olfactoryops-api` | LEGACY | `api.labofscents.org/*` is served by the D1-era Worker. |
| Tenant Router `olfactoryops-tenant-router` | LEGACY | `*.labofscents.org/*` remains the D1-era router. |
| Production D1 `olfactoryops-production` | PRODUCTION_ACTIVE | Meaningful legacy data exists; no migration or overwrite is authorized. |
| Production V2 Hyperdrive | MISSING | A dedicated production PostgreSQL origin and Hyperdrive configuration are required. |
| Production GitHub Environment | MISSING | Only the `staging` Environment was present during preflight. |
| V2 R2 / Queue / Workflow / Container bindings | MISSING | Candidate names exist only in non-deployable templates. |
| `admin.labofscents.org` | MISSING | Requires certificate, DNS and candidate-routing preflight. |

## Release Gate

`PRODUCTION_POSTGRES_ISOLATED_FROM_STAGING = NO`

Production deployment, migrations, DNS changes, and tag promotion remain
blocked until a dedicated approved production PostgreSQL origin, protected
GitHub Environment, legacy-data migration decision, and rollback evidence are
available.
