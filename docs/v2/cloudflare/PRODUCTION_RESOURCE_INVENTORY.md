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
| Production GitHub Environment | PRODUCTION_CANDIDATE | `production` exists with administrator bypass disabled and a required reviewer. Metadata-only verification confirmed the seven expected secret names; no values were read. |
| V2 R2 / Queue / Workflow / Container bindings | MISSING | Candidate names exist only in non-deployable templates. |
| `admin.labofscents.org` | MISSING | Requires certificate, DNS and candidate-routing preflight. |

## Release Gate

`PRODUCTION_POSTGRES_ISOLATED_FROM_STAGING = YES`

## GitHub production Environment

The GitHub `production` Environment exists. Metadata-only verification found a
required reviewer and disabled administrator bypass. The following secret names
are present; their values were neither requested nor retrieved:

- `PRODUCTION_DATABASE_URL`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `V2_SESSION_PEPPER`
- `V2_PASSWORD_PEPPER`
- `V2_INVITATION_ENCRYPTION_KEY`
- `SCIENTIFIC_CONTAINER_SHARED_SECRET`

`PRODUCTION_SECRET_VALUES_REQUIRED = NO` for the existing protected
Environment. The default-branch dispatcher change is pending human review in
PR [#14](https://github.com/MutAquaticStudio/OlfactoryOps/pull/14); it does
not authorize a production deployment.

Production deployment, migrations, DNS changes, and tag promotion remain
blocked until the protected production runtime-role SQL verification,
legacy-data migration decision, release-candidate staging revalidation, and
rollback evidence are available.
