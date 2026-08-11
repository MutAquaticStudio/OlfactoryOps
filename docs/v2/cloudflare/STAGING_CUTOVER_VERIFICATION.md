# Cloudflare Staging Runtime Cutover Verification

## Scope And Safety Boundary

This verification covers `beta.labofscents.org` staging source and isolated
Cloudflare resources only. Production DNS, routes, Workers, PostgreSQL,
customer data, and unrelated Cloudflare projects were not changed.

## Control Plane And Resources

| Check | Status | Evidence |
| --- | --- | --- |
| Cloudflare MCP connection | PASS | Authenticated account inventory completed. |
| `labofscents.org` zone | PASS | Active zone `aab925895e9a7871978c43f90ad5a72c` found. |
| Reversible MCP R2 test | PASS | Unique private bucket create, verify, delete, and post-delete absence check completed. |
| Private artifact bucket | PASS | `olfactoryops-v2-artifacts-staging` created in APAC. |
| Material Evidence Vectorize | PASS | `olfactoryops-v2-material-evidence-staging`, BGE-M3 1024D cosine, required tenant/model/status metadata indexes. |
| Scientific, RAG, notification queues/DLQs | PASS | Isolated staging queue pairs created. |
| Molecular Vectorize | NOT_APPLICABLE | No fixed serving dimension. |
| Odor Vectorize | NOT_APPLICABLE | `RESEARCH_ONLY`. |
| KV and AI Gateway | NOT_APPLICABLE | Inventory completed; no binding is required in the current staging cutover. |
| Hyperdrive configuration | PASS | Cloudflare API GET confirmed `olfactoryops-staging-hyperdrive` with a configured, non-local Supabase origin; credentials were not read. |
| Durable Objects, Workflows, Containers | BLOCKED | The declared scientific runtime bindings require immutable private images and a deployed runtime. |
| Vectorize control-plane tenant filter | PASS | Two disposable BGE-M3 1024D vectors returned only their matching `organizationId` filter and were deleted. |
| Queue control-plane fixture | PASS | Publish, preview, acknowledgement, and zero-backlog cleanup completed without a consumer. |

## Source Cutover

| Check | Status | Evidence |
| --- | --- | --- |
| V2 API Worker boundary | PASS | 143 decorator-derived controller routes use shared Platform/domain services through Hyperdrive only. |
| Session, CSRF, exact-Origin CORS | PASS | Unit tests cover `beta` Pages, tenant-specific origins, unsafe mutation denial, and preflight. |
| Agent event stream | PASS | Worker Web Streams replay persisted events through the existing governed Agent service; no second event store. |
| V2 tenant router | PASS | `*.beta.labofscents.org` resolver queries PostgreSQL through Hyperdrive and returns `404` for unknown/archived hosts. |
| D1 as V2 substitute | PASS | No V2 API or staging tenant-router D1 binding exists. |
| API/wildcard route separation | PASS | Exact `api-beta.labofscents.org/*` and separate `*.beta.labofscents.org/*` route declarations are checked in the staging templates. |
| Phase 7+ public staging API | NOT_APPLICABLE | Trial/Sensory, Production, Commerce, and Advanced controllers are absent from the Worker matrix. |
| Phase 7+ staging UI boundary source | PASS | Staging Pages build flag hides them and bounds direct paths; lazy chunks keep them out of initial load. |
| Staging Pages build source | PASS | Build passed with `VITE_API_BASE_URL`, `VITE_V2_WORKSPACE_BASE_DOMAIN`, and `VITE_V2_STAGING_PUBLIC_CUTOVER`. |

## Local Verification

| Gate | Status | Evidence |
| --- | --- | --- |
| Unit and integration tests | PASS | 70 files, 394 tests. |
| Cloud runtime/transport focused tests | PASS | 4 files, 12 tests. |
| Lint | PASS | Completed with three pre-existing non-blocking warnings outside the staging transport files. |
| V2 typecheck | PASS | `npm.cmd run typecheck:v2`. |
| Worker typecheck | PASS | `npm.cmd run typecheck:worker`. |
| Frontend build | PASS | Default and staging-variable builds completed; Phase surfaces are lazy-loaded. |
| API build | PASS | `npm.cmd run build:api`. |
| API Worker dry-run | PASS | `npm.cmd run build:v2-api-worker`. |
| Tenant-router dry-run | PASS | `npm.cmd run build:v2-tenant-router`. |
| Cloud-runtime bundle dry-run | PASS | The declared Worker, queue, R2, Vectorize, Hyperdrive, Workflow, and Container bindings bundle without deployment. |
| Cloud-runtime deployment configuration | BLOCKED | The immutable scientific image digests, release SHA, and rendered Hyperdrive binding have not been recorded. |
| PostgreSQL migration chain | PASS | `0018` applied on disposable loopback PostgreSQL. |
| PostgreSQL RLS workflow | PASS | Tenant isolation and cross-domain V2 verification completed on disposable loopback PostgreSQL. |
| Current local PostgreSQL re-run | BLOCKED | On 2026-08-11, `npm.cmd run v2:postgres:verify` could not reach `127.0.0.1:5432` (`P1001`). No local database was started or substituted; staging verification remains remote-only. |
| Role matrix | PASS | 12 of 12 isolated roles passed. |
| Scientific model runtime | BLOCKED | Remote Linux image build is intentionally required for this staging cutover; no local Windows image was built. |
| Client secret scan | PASS | `npm.cmd run security:client-bundle`. |
| Dependency audit | PASS | `npm.cmd audit --omit=dev --audit-level=high` reports zero vulnerabilities. |
| Git diff whitespace | PASS | `git diff --check`. |

## Remote Staging Acceptance

| Gate | Status | Reason |
| --- | --- | --- |
| Remote staging PostgreSQL origin | PASS | `api-beta` Worker health completed `SELECT 1` through the configured non-local Supabase Hyperdrive origin. |
| GitHub staging Environment and dispatch | PASS | The `staging` Environment exists with the approved secret names, and default-branch dispatchers validate exact staging SHAs before entering it. |
| Staging migration chain | PASS | GitHub run `31477033801` completed the immutable V2 migration chain. |
| Hyperdrive runtime role hardening | PASS | GitHub run `31479091142` applied/verified the current role policy: `LOGIN=true`; `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, and `REPLICATION` are false; no inherited privileged memberships. No credential value was read or recorded. |
| Hyperdrive Worker transaction/RLS smoke | BLOCKED | Health proves connectivity only. Remote RLS fixtures must wait for `RUNTIME_DB_PRIVILEGES=PASS`. |
| API Worker staging deployment at approved SHA | BLOCKED | GitHub run `31480119688` reached Wrangler but Cloudflare returned authentication error `10000` before a Worker mutation. The currently reachable health endpoint is a prior revision and does not report the required approved release SHA. |
| Remote route parity for the 143-route source matrix | BLOCKED | It must be verified only after the approved API Worker SHA is deployed; a prior staging revision and local route generation are not parity evidence. |
| Tenant-router wildcard and Pages deployment | BLOCKED | The PostgreSQL hostname registry/RLS gate and staging Pages deployment remain outstanding. |
| R2 Worker PUT/GET/metadata/hash/tenant-denial/delete fixture | BLOCKED | Control-plane PUT/delete passed, but raw GET and tenant-denial require the deployed Worker. |
| Vectorize Worker tenant isolation | BLOCKED | Control-plane metadata filters passed; application authorization still requires the deployed Worker and fixture tenant. |
| Queue retry/DLQ and Workflow terminal-failure smoke | BLOCKED | No consumer Worker or Workflow is deployed. |
| Private Container authorized/unauthorized calls | BLOCKED | Immutable remote images and Cloudflare secret storage are not available. |
| Remote scientific Linux build | PASS | GitHub run `31477266765` completed provenance, feature runtime, and model compatibility checks without a staging Environment or Cloudflare credentials. |
| GitHub scientific image publishing | BLOCKED | The staging-only publish job received its Environment secrets but Cloudflare Container Registry rejected the configured token with `403 Forbidden`. Cloudflare mutations stopped immediately. |
| AI Gateway | NOT_APPLICABLE | No approved provider policy or staging provider credential. |
| Browser rendered routes | PASS | `beta.labofscents.org`, `/login`, and `/signup` rendered in a real browser with no captured console errors. |
| Browser authenticated staging flow | BLOCKED | No isolated remote role fixture may be created until the least-privilege Hyperdrive role gate passes. |
| Production deployment | NOT_APPLICABLE | Explicitly prohibited in this cutover. |

## Verdict

```text
SOURCE_CUTOVER = PASS
ISOLATED_CLOUDFLARE_RESOURCES = PASS
LOCAL_ACCEPTANCE = PASS
REMOTE_POSTGRES_REQUIRED = PASS
HYPERDRIVE_EXISTS = PASS
HYPERDRIVE_STAGING = PASS
MIGRATIONS_STAGING = PASS
RUNTIME_DB_PRIVILEGES = PASS
RUNTIME_ROLE_LOGIN = PASS
RUNTIME_ROLE_SUPERUSER = NO
RUNTIME_ROLE_BYPASSRLS = NO
RUNTIME_ROLE_CREATEDB = NO
RUNTIME_ROLE_CREATEROLE = NO
RUNTIME_ROLE_PRIVILEGED_MEMBERSHIP = NONE
RLS_STAGING = BLOCKED
TENANT_ISOLATION_STAGING = BLOCKED
ROLE_E2E_STAGING = BLOCKED
PUBLIC_V2_WORKER_ROUTE_COVERAGE = BLOCKED
REMOTE_SCIENTIFIC_BUILD = PASS
SCIENTIFIC_CONTAINER_STAGING = BLOCKED
REMOTE_STAGING_ACCEPTANCE = BLOCKED
PRODUCTION_DEPLOYED = NOT_APPLICABLE
V2_CLOUDFLARE_STAGING_READY = BLOCKED
```

The staging Environment token must first be replaced or corrected without
changing its scope boundary. The minimal deploy scope is account `Workers
Scripts: Write`; because the Worker config owns an `api-beta` route, grant
zone `Workers Routes: Write` for `labofscents.org` as well. Container publishing
also remains blocked until the token has account `Containers: Write`. After
that, re-run the exact-SHA API deployment, remote API-to-
Hyperdrive tenant verifier, and staging scientific publish in that order.

The tag `v2-cloudflare-staging-ready` must not be created until every blocked
remote staging gate is independently verified.
