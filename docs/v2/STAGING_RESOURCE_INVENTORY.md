# OlfactoryOps Cloudflare Staging Resource Inventory

## Scope

This inventory covers only the V2 staging cutover for `beta.labofscents.org`.
It does not authorize production deployment, production DNS or Worker changes,
production PostgreSQL access, or changes to unrelated Cloudflare resources.

## Current Acceptance Status

The current staging evidence record is
[`STAGING_FINAL_ACCEPTANCE_2026-08-11.md`](cloudflare/STAGING_FINAL_ACCEPTANCE_2026-08-11.md).
It supersedes earlier deployment-blocker entries below. The verified runtime
source SHA is `4da6dfa061fc5ca818238c555e3320fc77a858b5`; final acceptance
is complete only because the remote fixture, route, TLS, and browser evidence
below were independently recorded.

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
| Worker | `olfactoryops-v2-api-staging` | PASS | Protected dispatcher `31529476648` deployed application source `4da6dfa061fc5ca818238c555e3320fc77a858b5` through Hyperdrive. |
| Worker | `olfactoryops-v2-tenant-router-staging` | PASS | Protected dispatcher `31529476750` deployed the PostgreSQL-backed staging router. |
| Pages | `olfactoryops-beta` | PASS | Protected Pages dispatcher `31531996514` deployed the same verified source and its release manifest reports `environment: staging`. |
| Vectorize | Existing material-evidence indexes | NOT_APPLICABLE | Not repurposed for isolated staging. |
| Hyperdrive | `olfactoryops-staging-hyperdrive` | PASS | Cloudflare API GET confirmed configuration `d7ac83bd79944e9dbd1f6eef30518dc3`, a non-local Supabase origin, and no credential value was read. |
| KV, Durable Objects, AI Gateway | Existing account inventory | NOT_APPLICABLE | No current staging binding is required. |
| Feature Container | Private staging application | PASS | Immutable feature image digest `sha256:bc02e087740cfbc4289ab1e2d1960142438b63b9ce6fdf1adc47d0231fa57e42` completed the remote scientific flow. |
| Model Container | Private staging application | PASS | Immutable compatibility image digest `sha256:dac572f05fbc2fca9ee6b50ab57ed830ed2129b452118d7493dd268859bf0bbe` is registered; serving remains scope-deferred. |

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
| Workflow | `olfactoryops-v2-scientific-staging` | API Worker -> Queue -> Workflow -> private Container -> R2 -> PostgreSQL metadata | PASS |
| Feature/Model Containers | Private staging applications | Immutable published image digests above; no production binding | PASS |

## Runtime And Verification Boundaries

| Gate | Status | Detail |
| --- | --- | --- |
| V2 API Worker local build | PASS | Decorator-free transport generated from 143 in-scope controller routes; Hyperdrive only. |
| V2 tenant-router local build | PASS | `*.api-beta.labofscents.org` PostgreSQL resolver; no D1 path. |
| Exact-Origin CORS / CSRF transport tests | PASS | API host, exact `beta` Pages origin, one-label tenant origin, unsafe mutation denial, and preflight pass. |
| Agent Web Streams transport | PASS | Persisted event replay, trusted-origin session resolution, and cleanup are unit-tested. |
| R2 control-plane fixture cleanup | PASS | Isolated object PUT and cleanup completed; the MCP wrapper cannot consume raw object GET bytes. |
| R2 tenant lifecycle | PASS | Deployed scientific flow persisted private artifact/provenance through the Worker binding. |
| Vectorize control-plane tenant filter | PASS | Two 1024D fixture vectors propagated, each exact-origin metadata filter returned only its own tenant record, and both were deleted. |
| Queue control-plane fixture | PASS | Scientific queue publish, preview, acknowledgement, and zero-backlog cleanup completed. |
| Queue retry, consumer idempotency, DLQ | PASS | Run `31529596072` exercised one internal-only terminal failure naturally through three retries into the scientific DLQ, then removed only that reference. |
| Workflow terminal failure | NOT_APPLICABLE | The terminal DLQ probe deliberately fails in the Queue consumer before a Workflow starts; a separate workflow-terminal fixture is not required for this staging acceptance. |
| Container authorized/unauthorized invocation | NOT_APPLICABLE | The Container has no public invocation surface. The deployed private Workflow invocation is PASS, while a public authorized/unauthorized probe would test a route that deliberately does not exist. |
| Remote staging PostgreSQL | PASS | `GET https://api-beta.labofscents.org/health` completed `SELECT 1` through the deployed Hyperdrive Worker. No origin credential was read. |
| Hyperdrive runtime path | PASS | The staging API Worker reports `database: hyperdrive` only after its PostgreSQL `SELECT 1` succeeds. |
| API Worker custom domain and exact route | PASS | Cloudflare-managed `api-beta.labofscents.org` custom domain/certificate and a more-specific Worker route bypass the legacy `*.labofscents.org` router. |
| Staging tenant-router wildcard | PASS | Proxied `*.api-beta.labofscents.org` routes only to `olfactoryops-v2-tenant-router-staging`; browser tests passed known and unknown hosts with server-side resolution. |
| GitHub staging environment secrets | PASS | The protected `staging` Environment contains only `STAGING_DATABASE_URL`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`; values were not read. |
| Default-branch protected dispatch | PASS | Default branch dispatchers validate an exact `codex/cloudflare-cloud-native-runtime` SHA before the staging Environment is entered. |
| Staging migration chain | PASS | GitHub run `31481271211` verified the 18-migration immutable V2 chain for approved staging source SHA `7cabd0a1bfc42366404e446ea6bd305d79fd5a36`. |
| Hyperdrive runtime role hardening | PASS | GitHub run `31481271211` verified `LOGIN=true`, no `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, or inherited privileged membership. Least-privilege runtime grants and PostgreSQL RLS were preserved. |
| AI Gateway | NOT_APPLICABLE | Inventory only; provider credentials and approved policy are absent. |
| Production deployment | NOT_APPLICABLE | Explicitly out of scope. |

## Final Acceptance Evidence

| Gate | Status | Evidence |
| --- | --- | --- |
| Exact API route | PASS | `api-beta.labofscents.org/*` -> `olfactoryops-v2-api-staging`. |
| Tenant wildcard route | PASS | `*.api-beta.labofscents.org/*` -> `olfactoryops-v2-tenant-router-staging`; the exact API route remains protected. |
| Tenant wildcard TLS | PASS | Active Advanced Certificate covers `api-beta.labofscents.org` and `*.api-beta.labofscents.org`. |
| Known tenant browser | PASS | Run `31532127144` passed TLS, router, server-side resolution, and no fatal console/network errors. |
| Unknown tenant browser | PASS | The same run produced a controlled unknown-workspace response with no tenant fallback or loop. |
| Remote RLS, tenant isolation, role E2E, auth | PASS | Run `31529928571` through API Worker -> Hyperdrive -> Supabase PostgreSQL. |
| Public route parity | PASS | Run `31530804517` reported `100% 143/143`. |
| Model serving | NOT_APPLICABLE_SCOPE_DEFERRED | No reviewed tenant serving artifact or serving dispatch contract is in scope; compatibility runtime remains operational. |
| Production deployment | NOT_APPLICABLE | Explicitly prohibited. |

## Current Verdict

```text
CLOUDFLARE_MCP_CONNECTED = PASS
LABOFSCENTS_ZONE_FOUND = PASS
MCP_STAGING_MUTATION_AUTHORIZED = PASS
REMOTE_POSTGRES_REQUIRED = PASS
HYPERDRIVE_EXISTS = PASS
HYPERDRIVE_STAGING = PASS
STAGING_API_WORKER = PASS
MIGRATIONS_STAGING = PASS
RUNTIME_DB_PRIVILEGES = PASS
STAGING_DNS_AND_ROUTES = PASS
MATERIAL_EVIDENCE_VECTORIZE = PASS
MOLECULAR_VECTORIZE = NOT_APPLICABLE
ODOR_VECTORIZE = NOT_APPLICABLE
QUEUE_AND_DLQ_RESOURCES = PASS
REMOTE_STAGING_ACCEPTANCE = PASS
PRODUCTION_DEPLOYED = NOT_APPLICABLE
STAGING_READY = YES
```
