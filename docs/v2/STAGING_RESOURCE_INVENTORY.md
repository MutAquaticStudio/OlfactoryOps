# OlfactoryOps Cloudflare Staging Resource Inventory

## Scope

This inventory covers only the V2 staging cutover for `beta.labofscents.org`.
It does not authorize production deployment, production DNS or Worker changes,
production PostgreSQL access, or changes to unrelated Cloudflare resources.

## Control Plane

| Check | Status | Evidence |
| --- | --- | --- |
| Cloudflare MCP account access | PASS | Authenticated account inventory completed on 2026-08-11. |
| `labofscents.org` zone | PASS | Active zone `aab925895e9a7871978c43f90ad5a72c` is in the authorized account. |
| Reversible MCP write | PASS | A unique private R2 write-test bucket was created, verified, deleted, and confirmed absent. No `10000`, `401`, or `403` response occurred. |
| Production preservation | PASS | No production Worker, route, DNS record, PostgreSQL, customer data, or unrelated project changed. |

## Existing Resources Preserved

| Type | Name | Status | Handling |
| --- | --- | --- | --- |
| Worker | `olfactoryops-api` | NOT_APPLICABLE | Existing production/legacy surface; unchanged. |
| Worker | `olfactoryops-api-test` | NOT_APPLICABLE | Existing test surface; unchanged. |
| Worker | `olfactoryops-tenant-router` | NOT_APPLICABLE | Legacy D1 router; unchanged. |
| Worker | `olfactoryops-v2-api-staging` | BLOCKED | The existing staging-only Hyperdrive Worker remains reachable, but GitHub run `31480119688` could not deploy the approved SHA because its staging token returned Cloudflare authentication error `10000` before mutation. |
| Pages | `olfactoryops-beta` | PASS | Existing staging Pages project; no deployment/config mutation in this cutover yet. |
| Vectorize | Existing material-evidence indexes | NOT_APPLICABLE | Not repurposed for isolated staging. |
| Hyperdrive | `olfactoryops-staging-hyperdrive` | PASS | Cloudflare API GET confirmed configuration `d7ac83bd79944e9dbd1f6eef30518dc3`, a non-local Supabase origin, and no credential value was read. |
| KV, Durable Objects, AI Gateway, Containers | Existing account inventory | NOT_APPLICABLE | No additional binding is needed before the blocked remote dependencies are satisfied. |

## Isolated Staging Resources

| Type | Name | Identifier or contract | Status |
| --- | --- | --- | --- |
| Private R2 | `olfactoryops-v2-artifacts-staging` | Private, standard storage | PASS |
| Vectorize | `olfactoryops-v2-material-evidence-staging` | BGE-M3, 1024D, cosine; metadata indexes: `organizationId`, `embeddingVersion`, `modelVersion`, `status`, `sourceKind` | PASS |
| Scientific queue | `olfactoryops-v2-scientific-staging` | `27cfb24e0ec44399a499c60d4d39623b` | PASS |
| Scientific DLQ | `olfactoryops-v2-scientific-dlq-staging` | `e951f2834df84f3890d3021fdac21884` | PASS |
| RAG queue | `olfactoryops-v2-rag-staging` | `c3af137441284e3c999a5fb31ec7ef96` | PASS |
| RAG DLQ | `olfactoryops-v2-rag-dlq-staging` | `7ed4aaf9cc8b48a1b5b0f63d88c371e8` | PASS |
| Notification queue | `olfactoryops-v2-notifications-staging` | `61c83ea9eee4405eba0d463758347b20` | PASS |
| Notification DLQ | `olfactoryops-v2-notifications-dlq-staging` | `229957f9dffd4c2eb2aabdc1a684dbd3` | PASS |
| Molecular Vectorize | None | No fixed serving dimension | NOT_APPLICABLE |
| Odor Vectorize | None | `RESEARCH_ONLY` | NOT_APPLICABLE |
| Workflow | `olfactoryops-v2-scientific-staging` | Needs a deployed Worker with real image digests | BLOCKED |
| Feature/Model Containers | None | Need private immutable images and Hyperdrive-backed runtime | BLOCKED |

## Runtime And Verification Boundaries

| Gate | Status | Detail |
| --- | --- | --- |
| V2 API Worker local build | PASS | Decorator-free transport generated from 143 in-scope controller routes; Hyperdrive only. |
| V2 tenant-router local build | PASS | `*.beta.labofscents.org` PostgreSQL resolver; no D1 path. |
| Exact-Origin CORS / CSRF transport tests | PASS | API host, exact `beta` Pages origin, one-label tenant origin, unsafe mutation denial, and preflight pass. |
| Agent Web Streams transport | PASS | Persisted event replay, trusted-origin session resolution, and cleanup are unit-tested. |
| R2 control-plane fixture cleanup | PASS | Isolated object PUT and cleanup completed; the MCP wrapper cannot consume raw object GET bytes. |
| R2 tenant lifecycle | BLOCKED | Hash/provenance and tenant-denial must run through the deployed Worker. |
| Vectorize control-plane tenant filter | PASS | Two 1024D fixture vectors propagated, each exact-origin metadata filter returned only its own tenant record, and both were deleted. |
| Queue control-plane fixture | PASS | Scientific queue publish, preview, acknowledgement, and zero-backlog cleanup completed. |
| Queue retry, consumer idempotency, DLQ | BLOCKED | HTTP pull is not enabled and no consumer Worker is deployed. |
| Workflow terminal failure | BLOCKED | Needs deployed Workflow and private Container images. |
| Container authorized/unauthorized invocation | BLOCKED | Needs private immutable image digests and Worker secret storage. |
| Remote staging PostgreSQL | PASS | `GET https://api-beta.labofscents.org/health` completed `SELECT 1` through the deployed Hyperdrive Worker. No origin credential was read. |
| Hyperdrive runtime path | PASS | The staging API Worker reports `database: hyperdrive` only after its PostgreSQL `SELECT 1` succeeds. |
| API Worker custom domain and exact route | PASS | Cloudflare-managed `api-beta.labofscents.org` custom domain/certificate and a more-specific Worker route bypass the legacy `*.labofscents.org` router. |
| Staging tenant-router wildcard | BLOCKED | The PostgreSQL hostname registry must be migrated and RLS-verified before `*.beta.labofscents.org` can be routed publicly. |
| GitHub staging environment secrets | PASS | The protected `staging` Environment contains only `STAGING_DATABASE_URL`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`; values were not read. |
| Default-branch protected dispatch | PASS | Default branch dispatchers validate an exact `codex/cloudflare-cloud-native-runtime` SHA before the staging Environment is entered. |
| Staging migration chain | PASS | GitHub run `31477033801` applied the immutable V2 migration chain before role hardening began. |
| Hyperdrive runtime role hardening | PASS | GitHub run `31479091142` verified `LOGIN=true`, no `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, or inherited privileged membership. Least-privilege runtime grants and PostgreSQL RLS were preserved. |
| AI Gateway | NOT_APPLICABLE | Inventory only; provider credentials and approved policy are absent. |
| Production deployment | NOT_APPLICABLE | Explicitly out of scope. |

## Activation Sequence

1. Correct only the `staging` Environment Cloudflare API token, which currently
   returns `10000` before updating the staging API Worker. Grant account
   `Workers Scripts: Write`, zone `Workers Routes: Write` for
`labofscents.org`, and account `Containers: Write` for the
   separate scientific publish dispatcher. Do not move the secret or grant
   production scope.
2. Re-run the protected exact-SHA API deployment and require a health response
   whose `releaseGitSha` matches the approved staging SHA before remote tests.
3. Run the remote API Worker-to-Hyperdrive tenant verifier, then deploy the
   separate `*.beta.labofscents.org` tenant-router only after the PostgreSQL
   hostname registry/RLS gate passes.
4. Configure and deploy the existing `olfactoryops-beta` Pages project with
   `.env.staging.example` values.
5. Run remote resource and browser acceptance tests. Production remains out of
   scope throughout.

## Current Verdict

```text
CLOUDFLARE_MCP_CONNECTED = PASS
LABOFSCENTS_ZONE_FOUND = PASS
MCP_STAGING_MUTATION_AUTHORIZED = PASS
REMOTE_POSTGRES_REQUIRED = PASS
HYPERDRIVE_EXISTS = PASS
HYPERDRIVE_STAGING = PASS
STAGING_API_WORKER = BLOCKED
MIGRATIONS_STAGING = PASS
RUNTIME_DB_PRIVILEGES = PASS
STAGING_DNS_AND_ROUTES = BLOCKED
MATERIAL_EVIDENCE_VECTORIZE = PASS
MOLECULAR_VECTORIZE = NOT_APPLICABLE
ODOR_VECTORIZE = NOT_APPLICABLE
QUEUE_AND_DLQ_RESOURCES = PASS
REMOTE_STAGING_ACCEPTANCE = BLOCKED
PRODUCTION_DEPLOYED = NOT_APPLICABLE
STAGING_READY = BLOCKED
```
