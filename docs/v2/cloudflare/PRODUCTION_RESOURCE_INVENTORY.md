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
| Production V2 Hyperdrive | PRODUCTION_CANDIDATE | `olfactoryops-production-hyperdrive` / `b415b7572d9f45058ebb4ec4166b8739`; read-only Cloudflare inventory confirmed it is distinct from `olfactoryops-staging-hyperdrive`. |
| Production GitHub Environment | PRODUCTION_CANDIDATE | `production` exists with administrator bypass disabled and a required reviewer. Metadata-only verification confirmed the seven expected secret names; no values were read. |
| Production V2 artifacts R2 | PRODUCTION_CANDIDATE | Private APAC bucket `olfactoryops-v2-artifacts-production` was created for the isolated candidate. It has no public custom domain and contains no customer artifact. |
| Production Material Evidence Vectorize | PRODUCTION_CANDIDATE | `olfactoryops-v2-material-evidence-production`, BGE-M3 `1024D` cosine, has only the tenant/model/status/source metadata indexes required by the V2 runtime. |
| Production V2 Queue/DLQ pairs | PRODUCTION_CANDIDATE | Empty scientific, RAG, and notification source/DLQ pairs were created with the canonical `-production` names; no Worker consumer is bound until the protected Cloud Runtime candidate deploy runs. |
| Candidate Pages project | PRODUCTION_CANDIDATE | `olfactoryops-v2-production-candidate` / `cc37bd8d-f331-4e4d-b73b-3c95713d1c9c`, branch `production-candidate`; no deployment or custom domain exists yet. |
| Candidate API / router / Cloud Runtime | MISSING | The protected dispatcher will create candidate-only Workers after required-reviewer approval. The existing public wildcard remains bound to the legacy router and must not be repointed as a workaround. |
| `admin.labofscents.org` | MISSING | Requires a separately reviewed certificate, DNS, and candidate-routing preflight. |

## Release Gate

`PRODUCTION_POSTGRES_ISOLATED_FROM_STAGING = YES`

## RC2 production PostgreSQL checkpoint

GitHub Actions run `31583751600` used its protected dispatcher definition from
`main`, validated the requested release against
`codex/v2-production-go-live`, then checked out exact RC2 source
`5985834a0e14728c81c8c028a72122ded544bd6b` for the migration and runtime-role
jobs. This evidence did not deploy a Worker, Pages project, route, or DNS
record.

| Gate | Status | Evidence |
| --- | --- | --- |
| Immutable V2 production migrations | PASS | 24 migrations and 9 required RLS tables were verified. |
| Production runtime role | PASS | The protected script verified `LOGIN=true`; `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, and `REPLICATION` false; `INHERIT=false`; no direct parent memberships; zero public V2 object ownership; and required grants only. |
| Production RLS through API -> Hyperdrive | BLOCKED | No isolated production API/tenant-router candidate is deployed. Local or direct-admin PostgreSQL checks are not a substitute. |
| Initial Platform Owner | BLOCKED | The protected bootstrap inputs are not present in the production Environment. |

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
Environment. Protected production dispatchers were merged in
[#14](https://github.com/MutAquaticStudio/OlfactoryOps/pull/14); they do not
authorize a production deployment.

## Mandatory pre-go-live security gate

The production Environment currently contains the required runtime secret
names, but their values have not been inspected, changed, or rotated in this
preflight. The accepted temporary exposure risk does not authorize first
production deployment.

`ROTATE_EXPOSED_PRODUCTION_RUNTIME_SECRETS_BEFORE_FIRST_PRODUCTION_DEPLOY = YES`

The following values must be replaced through the protected production
Environment, rebound to the production Workers without logging them, and then
the Environment must be revalidated for the exact release SHA before any
production deployment:

- `V2_SESSION_PEPPER`
- `V2_PASSWORD_PEPPER`
- `V2_INVITATION_ENCRYPTION_KEY`
- `SCIENTIFIC_CONTAINER_SHARED_SECRET`

The merged dispatchers require both
`PRODUCTION_RUNTIME_SECRET_ROTATION_RELEASE_SHA` and
`PRODUCTION_ENVIRONMENT_REVALIDATED_RELEASE_SHA` to match the requested
release SHA. These non-secret markers must only be set after that rotation and
revalidation have actually completed.

The production Environment now exposes the RC2-specific non-secret deployment
markers and identifiers through `vars.*`, matching the candidate dispatcher:
`PRODUCTION_HYPERDRIVE_ID`, both rotation/revalidation SHA markers, the
candidate Pages project, and pinned scientific feature/model image references
and digests. The feature image is
`sha256:bc02e087740cfbc4289ab1e2d1960142438b63b9ce6fdf1adc47d0231fa57e42`;
the model image is
`sha256:dac572f05fbc2fca9ee6b50ab57ed830ed2129b452118d7493dd268859bf0bbe`.
Both were derived from Cloudflare Container Registry deployments, not guessed.
`PRODUCTION_CANDIDATE_SMOKE_TENANT_URL` remains intentionally unset until a
candidate-only fixture workspace and hostname exist.

The protected Platform Owner ceremony needs the single manual secure identity
input `PLATFORM_OWNER_BOOTSTRAP_EMAIL`. Its dedicated migration/admin database
connection can be mapped from the existing protected
`PRODUCTION_DATABASE_URL` secret only inside a dedicated production bootstrap
job or approved untracked operator session; it must never use the Hyperdrive
runtime role. No email or connection value is stored in this repository.

`v2-production-rc1` was created at
`342f53f4b4aa812e853a2005899049c822d3426e` after the staging revalidation
passed. See [PRODUCTION_RC1_STAGING_REVALIDATION.md](PRODUCTION_RC1_STAGING_REVALIDATION.md).

Production deployment, DNS changes, and tag promotion remain blocked until
production RLS/tenant isolation is proven through an isolated candidate, the
Platform Owner ceremony is complete, a rollback backup reference is recorded,
and candidate acceptance passes. The mandatory runtime-secret rotation and
exact-SHA Environment revalidation gate has passed for RC2; it must be repeated
for any later release candidate.
The Supabase-hosted compatibility correction and RC2 evidence are recorded
in [PRODUCTION_SUPABASE_RUNTIME_ROLE_HARDENING.md](PRODUCTION_SUPABASE_RUNTIME_ROLE_HARDENING.md).
