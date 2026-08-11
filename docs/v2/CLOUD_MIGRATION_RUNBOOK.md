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
| Staging tenant wildcard and Pages deploy | BLOCKED | Requires migrated PostgreSQL hostname data, RLS verification, then the isolated tenant router and Pages deployment. |
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

Current staging evidence: Linux build and compatibility checks completed in
GitHub run `31477266765`, but `wrangler containers push` returned `403
Forbidden` from the staging Cloudflare token. Do not retry Cloudflare mutations
until its Container Registry permission/scope is corrected.

The separate exact-SHA API Worker deployment also returned Cloudflare
authentication error `10000` in GitHub run `31480119688` before mutating the
Worker. Correct the `staging` Environment token in place; it needs account
`Workers Scripts: Write` and zone `Workers Routes: Write` for
`labofscents.org`. Retain the protected Environment boundary and use account
`Containers: Write` only for the scientific publish job.

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
   `*.beta.labofscents.org/*` tenant route declared in the two staging Wrangler
   templates. The wildcard cannot match `api-beta`.
5. Add only proxied staging DNS for `api-beta` and `*.beta`; preserve the
   existing `beta.labofscents.org` Pages hostname for public staging.

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
