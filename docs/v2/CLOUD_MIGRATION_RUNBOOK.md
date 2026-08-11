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

## 3. Configuration and CI

1. Add/update Wrangler configs for migration previews.
2. Add `scientific-container.yml` and `cloud-verification.yml` workflows.
3. Keep deployment workflow manual and non-production.

## 4. Remote scientific build

1. Use immutable image tag format:
   - `olfactoryops-scientific:<git-sha>`
2. Build and push via GitHub Actions + Wrangler container support (or explicit Cloudflare support in target account).
3. Record digest into runbook or environment run metadata.
4. Store at least:
   - active image digest
   - known-good backup digest

## 5. Containerized workloads

- Scientific inference remains outside Workers.
- API submits jobs and validates completion state via durable queue/workflow evidence.
- Container jobs return bounded, structured artifacts only.

## 6. Data services integration

- R2: artifact payload references, provenance records, tenant metadata.
- Vectorize: separated indexes by semantic family.
- Queues: idempotent message contract.
- Workflows: explicit state machine and retry policy.
- Hyperdrive: adapter-first connectivity to PostgreSQL.

## 7. Release gate before local cleanup

Do not remove local Docker resources until:
- remote build workflow exists and can execute,
- local build/test gates pass for this checkpoint,
- migration verification and architecture checks pass,
- commit/tag is safely pushed.

## 8. Local Docker decommission

- Use `scripts/cleanup-olfactoryops-docker.ps1`.
- Run default dry-run first.
- Only run with `-Apply` when approved.
- Never use global prune.

## 9. Rollback

Rollback command stays:
- `git switch <source-branch>`
- create recovery branch from `pre-cloudflare-cloud-native-migration-20260810`.
- Do not delete the pre-migration tag.

