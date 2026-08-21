# Cloud Migration Runbook

## Scope

Use this runbook for the Cloudflare cloud-native migration branch:
`codex/cloudflare-cloud-native-runtime`

## 1. Freeze and preserve source

1. Stop current feature work.
2. Confirm no local secret values are introduced in pending edits.
3. Verify checkpoint branch and tag:
   - `pre-cloudflare-cloud-native-migration-20260810`
4. Keep D1 migration history untouched and do not destructively edit `0001-0017`.

## 2. Architecture verification

- Verify required docs exist:
  - `docs/v2/CLOUDFLARE_CLOUD_NATIVE_ARCHITECTURE.md`
  - `docs/v2/CLOUD_MIGRATION_RUNBOOK.md`
  - `docs/v2/REMOTE_BUILD_AND_CI.md`
  - `docs/v2/SCIENTIFIC_CONTAINER_RUNTIME.md`
  - `docs/v2/CLOUDFLARE_DATA_SERVICES.md`
  - `docs/v2/LOCAL_DOCKER_DECOMMISSION.md`
  - `docs/v2/adr/ADR-012-cloudflare-cloud-native-runtime.md`
- Verify folder contract:
  - `infra/cloudflare/{hyperdrive,r2,vectorize,queues,workflows,containers}`
- Verify cleanup script:
  - `scripts/cleanup-olfactoryops-docker.ps1`

## 3. Staging Control Plane

| Gate | Status | Evidence |
| --- | --- | --- |
| Cloudflare MCP connection | PASS | Authorized account and `labofscents.org` zone inventory completed. |
| Reversible R2 write test | PASS | Dedicated private test bucket was created, verified, deleted, and confirmed absent. |
| Staging R2 | PASS | `olfactoryops-v2-artifacts-staging` exists and is private. |
| Staging Material Evidence Vectorize | PASS | `olfactoryops-v2-material-evidence-staging` is BGE-M3 1024D cosine with tenant/model/status indexes. |
| Staging queues and DLQs | PASS | Scientific, RAG, and notification queues plus DLQs exist. |
| Molecular/odor Vectorize | NOT_APPLICABLE | Molecular has no fixed serving dimension; odor is `RESEARCH_ONLY`. |
| Hyperdrive configuration | PASS | `olfactoryops-staging-hyperdrive` is a configured non-local Supabase origin. |
| Remote staging PostgreSQL runtime path | PASS | The staging-only `api-beta` Worker health check completed PostgreSQL `SELECT 1` through Hyperdrive. Migration, role, and RLS gates remain separate. |
| Vectorize control-plane tenant filter | PASS | Disposable two-tenant BGE-M3 1024D metadata-filter test passed and cleaned up. |
| Queue control-plane fixture | PASS | Disposable publish/preview/acknowledgement test passed and left zero backlog. |
| Staging API DNS and Worker route | PASS | `api-beta.labofscents.org` uses a Cloudflare-managed Worker custom domain plus a more-specific route that bypasses the legacy wildcard router. |
| Staging Pages deploy | PASS | `beta.labofscents.org` is active on `olfactoryops-beta`; protected Pages run `31531996514` deployed source SHA `4da6dfa061fc5ca818238c555e3320fc77a858b5` and the release manifest reports `environment: staging`. |
| Staging API, Tenant Router, and Cloud Runtime deploy | PASS | Protected dispatchers `31529476648`, `31529476750`, and `31529167424` deployed the verified source through Hyperdrive, private containers, R2, Queues, and Workflow. |
| Remote tenancy and role verification | PASS | GitHub run `31529928571` passed RLS, tenant isolation, direct-ID denial, membership validation, authentication, and all twelve roles through API Worker to Hyperdrive to Supabase PostgreSQL. |
| Public API route parity | PASS | GitHub run `31530804517` verified `100% 143/143` public Phase 1-6 V2 routes at the exact source SHA. |
| Staging tenant wildcard browser acceptance | PASS | GitHub run `31532127144` passed fixture known and unknown tenant browser/TLS/router behavior on `<workspace>.api-beta.labofscents.org`. |
| Queue/DLQ terminal failure | PASS | GitHub run `31529596072` submitted one staging-only fixture, observed natural attempts 1-3, DLQ arrival, exact-message cleanup, and zero test backlog. |
| Reviewed model serving E2E | NOT_APPLICABLE_SCOPE_DEFERRED | The runtime intentionally returns `NOT_CONFIGURED` until a reviewed tenant model artifact and serving dispatch contract are in scope. |
| Production deployment | NOT_APPLICABLE | Explicitly excluded. |

## 4. Configuration and CI

1. Add/update Wrangler configs for migration previews.
2. Add `scientific-container.yml`, `cloud-verification.yml`, and the protected
   manual `v2-staging-postgres.yml` workflow.
3. Create the protected GitHub `staging` environment, then configure its
   `STAGING_DATABASE_URL` secret for the migration/admin connection. The
   workflow applies `0001` through `0018`, then restricts the existing
   `hyperdrive_user` role without reading or printing credentials. The runtime
   role must have no membership escalation, schema `CREATE`, superuser, or
   `BYPASSRLS` privilege.

   Current staging evidence: GitHub run `31481271211` applied/verified the
   role policy. `hyperdrive_user` can log in but is not a superuser, cannot
   bypass RLS, cannot create databases or roles, cannot replicate, and has no
   inherited privileged membership. The workflow preserves database grants and
   RLS rather than treating safe role attributes as proof of access control.
4. Make the protected workflow available on the repository default branch
   before manual dispatch. GitHub requires a `workflow_dispatch` file on that
   branch; do not merge unrelated cloud-runtime work merely to satisfy this
   control-plane requirement.
5. Keep deployment workflow manual and non-production.

## 5. Remote scientific build

1. Use immutable image tag format:
   - `olfactoryops-scientific:<git-sha>`
2. Build and push via GitHub Actions + Wrangler container support (or explicit Cloudflare support in target account).
3. Record digest into runbook or environment run metadata only after the
   staging Container Registry accepts the image.
4. Store at least:
   - active image digest
   - known-good backup digest

Current staging evidence: GitHub Linux build and compatibility checks completed
in `31526728004`; staging-only publish `31527078581` recorded immutable feature
digest `sha256:bc02e087740cfbc4289ab1e2d1960142438b63b9ce6fdf1adc47d0231fa57e42`
and model digest
`sha256:dac572f05fbc2fca9ee6b50ab57ed830ed2129b452118d7493dd268859bf0bbe`.
The staging Environment secret boundary remains unchanged: build jobs receive
no Cloudflare credential, while the manual publish job alone receives the
`staging` Environment.

## 6. Containerized workloads

- Scientific inference remains outside Workers.
- API submits jobs and validates completion state via durable queue/workflow evidence.
- Container jobs return bounded, structured artifacts only.

## 7. API and Tenant Router Cutover

1. Build the V2 API Worker with `npm.cmd run build:v2-api-worker` and the
   staging router with `npm.cmd run build:v2-tenant-router`.
2. The generated route matrix at
   `docs/v2/cloudflare/V2_WORKER_ROUTE_MATRIX.md` is authoritative for the
   in-scope Worker transport. It contains the Platform, Lab Ops/Procurement,
   Formula/Design, Evidence/RAG, Scientific, Olfactory, Consumer, Model/Dataset
   and Agent boundaries, including persisted Agent Web Stream replay.
3. Do not add Phase 7+ routes to this public cutover. The Pages staging build
   uses `VITE_V2_STAGING_PUBLIC_CUTOVER=true` to hide those entries and bound
   direct links.
4. Create the remote staging Hyperdrive binding first. Then apply the exact
   `api-beta.labofscents.org/*` API route and the independent
   `*.api-beta.labofscents.org/*` tenant route. The exact API route is more
   specific and therefore cannot be captured by the tenant wildcard.
5. Keep `beta.labofscents.org` as the Pages hostname. The active staging
   tenant fallback is proxied `*.api-beta.labofscents.org` because the active
   Advanced Certificate covers that wildcard, not `*.beta.labofscents.org`.

## 8. Data services integration

- R2: artifact payload references, provenance records, tenant metadata.
- Vectorize: separated indexes by semantic family.
- Queues: idempotent message contract.
- Workflows: explicit state machine and retry policy.
- Hyperdrive: adapter-first connectivity to PostgreSQL.

## 9. Release gate before local cleanup

Do not remove local Docker resources until:
- remote build workflow exists and can execute,
- local build/test gates pass for this checkpoint,
- migration verification and architecture checks pass,
- commit/tag is safely pushed.

## 10. Local Docker decommission

- Use `scripts/cleanup-olfactoryops-docker.ps1`.
- Run default dry-run first.
- Only run with `-Apply` when approved.
- Never use global prune.

## 11. Rollback

Rollback command stays:
- `git switch <source-branch>`
- create recovery branch from `pre-cloudflare-cloud-native-migration-20260810`.
- Do not delete the pre-migration tag.

## 12. Final Staging Acceptance (2026-08-11)

This final section supersedes earlier historical blocker notes in this runbook.
The verified application/runtime source is
`4da6dfa061fc5ca818238c555e3320fc77a858b5`; all protected dispatchers checked
out that exact revision before using the staging Environment.

| Gate | Status | Evidence |
| --- | --- | --- |
| Pages, API, Tenant Router, Cloud Runtime | PASS | Dispatchers `31531996514`, `31529476648`, `31529476750`, and `31529167424`. |
| Remote RLS, tenant isolation, role E2E, authentication | PASS | Remote verifier `31529928571` through API Worker -> Hyperdrive -> Supabase PostgreSQL. |
| Public Worker route parity | PASS | `31530804517`: `100% 143/143`. |
| Scientific Queue -> Workflow -> private Container -> R2 | PASS | `31529268097`; immutable feature image `sha256:bc02e087740cfbc4289ab1e2d1960142438b63b9ce6fdf1adc47d0231fa57e42`. |
| Terminal Queue -> DLQ retry | PASS | `31529596072`: one internal-only fixture failed naturally on attempts 1-3, reached the configured DLQ, and left both test backlogs at zero. |
| Tenant wildcard DNS, route, and TLS | PASS | Staging fallback `<workspace>.api-beta.labofscents.org`; proxied wildcard DNS and active certificate cover the route. |
| Known and unknown tenant browser | PASS | `31532127144`: browser TLS, trusted server-side resolution, public-header denial, controlled unknown-host response, and no fatal console/network errors. |
| Model serving | NOT_APPLICABLE_SCOPE_DEFERRED | The compatibility runtime is live, but no reviewed tenant serving model or serving dispatch contract is in scope. |
| Production deployment | NOT_APPLICABLE | Explicitly prohibited. |

```text
CLOUD_NATIVE_ARCHITECTURE_READY = YES
REMOTE_SCIENTIFIC_BUILD_READY = YES
STAGING_READY = YES
SAFE_TO_DEPLOY_LABOFSCENTS = YES
BOT_FIGHT_MODE_REENABLE_REQUIRED = YES
PRODUCTION_DEPLOYED = NO
```

`SAFE_TO_DEPLOY_LABOFSCENTS=YES` is a completed staging gate, not an executed
production deployment. Re-enable Bot Fight Mode after this acceptance record is
committed.
