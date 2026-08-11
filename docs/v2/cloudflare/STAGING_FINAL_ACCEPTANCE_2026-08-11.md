# Cloudflare Staging Final Acceptance - 2026-08-11

## Scope And Immutable Runtime Revision

This is a staging-only acceptance record. The verified application/runtime
source is `4da6dfa061fc5ca818238c555e3320fc77a858b5`. Protected dispatcher
workflows validate and check out that exact source revision before entering the
staging Environment; their own control-plane commit is not treated as the
application revision.

Production deployment, production DNS, production Workers, production
PostgreSQL, customer data, and unrelated Cloudflare resources were not changed.

| Runtime surface | Status | Evidence |
| --- | --- | --- |
| Pages | PASS | Protected dispatcher `31531996514` deployed the verified source to `beta.labofscents.org`; `release.json` reports that SHA and `environment: staging`. |
| API Worker | PASS | Protected dispatcher `31529476648` deployed the verified source through Hyperdrive. |
| Tenant Router Worker | PASS | Protected dispatcher `31529476750` deployed the verified source. |
| Cloud Runtime | PASS | Protected dispatcher `31529167424` rendered the same source with immutable scientific image bindings. |
| Source CI | PASS | GitHub run `31529038485` passed at `4da6dfa061fc5ca818238c555e3320fc77a858b5`. |

## Cloud Resources And Scientific Runtime

| Gate | Status | Evidence |
| --- | --- | --- |
| R2 staging | PASS | Private `olfactoryops-v2-artifacts-staging` is bound and the deployed scientific flow stored private provenance. |
| Material Evidence Vectorize | PASS | `olfactoryops-v2-material-evidence-staging` uses BGE-M3 1024D cosine with tenant/model/status metadata isolation. |
| Queue and DLQ resources | PASS | Scientific source queue `olfactoryops-v2-scientific-staging` and DLQ `olfactoryops-v2-scientific-dlq-staging` are configured with `max_retries=3`. |
| Workflow staging | PASS | Run `31529268097` completed API Worker -> Queue -> Workflow -> private scientific Container -> R2 -> PostgreSQL metadata. |
| Scientific Container staging | PASS | The private feature runtime completed the bounded remote fixture using image digest `sha256:bc02e087740cfbc4289ab1e2d1960142438b63b9ce6fdf1adc47d0231fa57e42`. |
| Scientific image publish | PASS | Staging-only GitHub publish run `31527078581` recorded the feature digest above and model image digest `sha256:dac572f05fbc2fca9ee6b50ab57ed830ed2129b452118d7493dd268859bf0bbe`. |
| RDKit, BCFP, MolFTP, Osmordred, KGCNN, Transformer-CNN | PASS | Remote Linux scientific build and reproducibility evidence are retained by run `31526728004`; the active runtime flow passed in `31529268097`. |
| AI Gateway | NOT_APPLICABLE | No approved provider policy or provider credential is configured. |

## Database, Identity, And Route Acceptance

| Gate | Status | Evidence |
| --- | --- | --- |
| PostgreSQL and Hyperdrive | PASS | Protected staging health and remote verifier use the non-local Supabase staging origin through Hyperdrive only. |
| Migrations and runtime DB privileges | PASS | Protected staging dispatcher previously applied the immutable V2 chain and retained the least-privilege `hyperdrive_user` role. |
| RLS staging | PASS | Run `31529928571` verified tenant-scoped reads, writes, direct IDs, search/list scope, membership, and role-policy scope through API Worker -> Hyperdrive -> Supabase PostgreSQL. |
| Tenant isolation staging | PASS | The same remote verifier denied cross-tenant reads and mutations and archived its isolated fixture after completion. |
| Role E2E staging | PASS | The same remote verifier independently passed Owner, Admin, Lab Manager, Perfumer, R&D Scientist, Lab Technician, Procurement, Sensory Panelist, Brand, Supplier, Finance, and Viewer. |
| Staging authentication | PASS | The remote verifier completed isolated signup, session, CSRF, and login against the deployed API Worker. |
| Staging home, login, signup | PASS | After the final Pages deployment, `https://beta.labofscents.org/`, `/v2/login`, and `/v2/signup` each returned HTTP 200 with CSP and `no-transform`. |
| Public V2 Worker route coverage | PASS | Run `31530804517` reported `PUBLIC_V2_WORKER_ROUTE_COVERAGE=100% 143/143` at the exact verified source revision. |

## Final Local Regression

No local Docker or local PostgreSQL was started for this final staging record.
The remote Supabase staging verification above remains the database evidence.

| Gate | Status | Current result |
| --- | --- | --- |
| Unit and integration tests | PASS | `npm.cmd test`: 75 test files, 412 tests passed. |
| Lint | PASS | `npm.cmd run lint` completed with four pre-existing non-blocking warnings outside this acceptance-doc scope. |
| V2 typecheck | PASS | `npm.cmd run typecheck:v2`. |
| Frontend build | PASS | `npm.cmd run build`. |
| API build | PASS | `npm.cmd run build:api`. |
| Worker typecheck and dry-run | PASS | `npm.cmd run typecheck:worker` and `npm.cmd run build:worker`. |
| V2 API Worker and tenant-router dry-runs | PASS | `npm.cmd run build:v2-api-worker` and `npm.cmd run build:v2-tenant-router`. |
| Rendered Cloud Runtime dry-run | PASS | The staging renderer used the verified Hyperdrive ID, source SHA, and immutable feature/model image digests with no placeholders. |
| Client secret scan | PASS | `npm.cmd run security:client-bundle`. |
| Dependency audit | PASS | `npm.cmd audit --omit=dev --audit-level=high`: 0 vulnerabilities. |
| Git whitespace | PASS | `git diff --check`. |

## Terminal DLQ Acceptance

The deterministic `STAGING_DLQ_TERMINAL_FAILURE_PROBE` is internal-only,
staging-only, authenticated by the protected dispatcher, and contains no
customer, Formula, inventory, or persistent business artifact. It is not
reachable from an unauthenticated public request and it deliberately fails on
every consumer delivery.

| Gate | Status | Evidence |
| --- | --- | --- |
| Terminal failure fixture submitted | PASS | Run `31529596072` submitted exactly one source-queue fixture. |
| Queue retry policy executed | PASS | Job `job_staging_dlq_b474be1295004ea8a3a12d25b49e78e1` recorded attempts 1, 2, and 3. |
| Terminal failure reached DLQ | PASS | The exact fixture reached `olfactoryops-v2-scientific-dlq-staging` and was observed before exact-reference cleanup. |
| Terminal job status | PASS | The fixture status is `FAILED`. |
| Business side effects | PASS | `0` customer or business side effects were recorded. |
| Final queue backlog | PASS | Scientific source queue `0`; test DLQ backlog `0`; no unrelated message was purged. |

The detailed timestamps, correlation ID, and DLQ message evidence are in
[`STAGING_DLQ_ACCEPTANCE_2026-08-11.md`](STAGING_DLQ_ACCEPTANCE_2026-08-11.md).

## Tenant Hostname, Route, TLS, And Browser Evidence

The initially preferred `<workspace>.beta.labofscents.org` convention was not
used because Cloudflare did not have a second-level `*.beta.labofscents.org`
certificate. The zero-cost staging-only fallback is:

```text
<workspace>.api-beta.labofscents.org
```

This leaves `beta.labofscents.org` as the Pages host and protects the exact
`api-beta.labofscents.org` API host from wildcard capture.

| Gate | Status | Evidence |
| --- | --- | --- |
| Tenant wildcard DNS | PASS | Proxied CNAME `*.api-beta.labofscents.org` -> `olfactoryops-beta.pages.dev`, record `4279616e3e1e6b6f8ff6150a0257b3a6`. |
| Tenant wildcard route | PASS | `*.api-beta.labofscents.org/*` -> `olfactoryops-v2-tenant-router-staging`, route `031d876a8b18420282967754468891e1`. |
| Exact API route | PASS | `api-beta.labofscents.org/*` -> `olfactoryops-v2-api-staging`, route `cf0c59cfaee34fc8a906d0c0c2835730`; it is more specific than the tenant route. |
| Tenant wildcard TLS | PASS | Active Advanced Certificate `ac20e8dd-080f-47e8-a435-2046c5514145` covers `api-beta.labofscents.org` and `*.api-beta.labofscents.org`. |
| Known tenant browser | PASS | Run `31532127144` opened `tenant-host-c56a93d7afb341e68c.api-beta.labofscents.org`; browser TLS, router, server-side resolution, shell, and no fatal console/network errors passed. |
| Unknown tenant browser | PASS | The same run opened `unknown-c56a93d7afb341e68c.api-beta.labofscents.org`; DNS/TLS/router passed and authoritative lookup returned the controlled unknown-workspace response without fallback or loop. |
| Public header tenant override | PASS | The browser verifier confirmed the public header override was denied. |

The tenant browser artifact is
`staging-tenant-host-evidence-4da6dfa061fc5ca818238c555e3320fc77a858b5`
from run `31532127144` and contains the known/unknown browser screenshots plus
the bounded JSON evidence envelope.

## Model-Serving Classification

| Gate | Status | Evidence |
| --- | --- | --- |
| Model serving required for current staging | NO | Phase 4 records remote model serving outside its runtime scope; Phase 5 explicitly permits only `NOT_EVALUATED` when no reviewed serving model exists. |
| Model serving status | NOT_APPLICABLE_SCOPE_DEFERRED | `services/scientific/model-runtime/README.md` defines the image as a compatibility runtime and returns `NOT_CONFIGURED` until a reviewed tenant model artifact is registered. |
| Staging model artifact | NOT_APPLICABLE_SCOPE_DEFERRED | No invented or unreviewed tenant artifact was registered. |
| Staging model E2E | NOT_APPLICABLE_SCOPE_DEFERRED | No serving dispatch contract exists in the current scope. Compatibility and scientific Container evidence remain PASS. |
| User-facing model claims | PASS | Formula Intelligence retains the explicit Not configured/Not evaluated path and does not substitute deterministic or mock output as model output. |

Relevant requirement references are
`docs/v2/phase-4/PHASE_4_IMPLEMENTATION_REPORT.md`,
`docs/v2/phase-4/MODEL_DATASET_PLATFORM.md`,
`docs/v2/phase-5/OLFACTORY_INTELLIGENCE.md`, and
`docs/v2/REQUIREMENTS_TRACEABILITY.md` Phase 4-5 evidence.

## Final Staging Status

```text
PAGES_API_RUNTIME_SHA = 4da6dfa061fc5ca818238c555e3320fc77a858b5
PUBLIC_V2_WORKER_ROUTE_COVERAGE = PASS (100% 143/143)
RLS_STAGING = PASS
TENANT_ISOLATION_STAGING = PASS
ROLE_E2E_STAGING = PASS
STAGING_AUTH = PASS
STAGING_SCIENTIFIC_E2E = PASS
STAGING_KNOWN_TENANT_HOST = PASS
STAGING_UNKNOWN_TENANT_HOST = PASS
DLQ_STAGING = PASS
MODEL_SERVING_REQUIRED_FOR_CURRENT_STAGING = NO
STAGING_MODEL_E2E = NOT_APPLICABLE_SCOPE_DEFERRED

CLOUD_NATIVE_ARCHITECTURE_READY = YES
REMOTE_SCIENTIFIC_BUILD_READY = YES
STAGING_READY = YES
SAFE_TO_DEPLOY_LABOFSCENTS = YES
BOT_FIGHT_MODE_REENABLE_REQUIRED = YES
PRODUCTION_DEPLOYED = NO
```

`SAFE_TO_DEPLOY_LABOFSCENTS=YES` means the completed staging acceptance gates
permit a separately authorized production-release decision. It is not a
production deployment, DNS change, production migration, or production smoke
test. Bot Fight Mode was disabled only for protected staging browser acceptance
and must be re-enabled after this evidence checkpoint is committed.
