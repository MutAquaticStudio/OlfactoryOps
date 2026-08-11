# Cloudflare Staging Final Acceptance - 2026-08-11

## Scope

This is an evidence record for staging only. The verified application source is
`29b2233d09840dae34cb92802c34dfc5feea89a2`. Production deployment, production
DNS, production data, and production PostgreSQL changes are
`NOT_APPLICABLE`.

## Verified Gates

| Gate | Status | Evidence |
| --- | --- | --- |
| API Worker staging deploy | PASS | Protected dispatcher `31509584372`; `/health` reports the exact source SHA and `database: hyperdrive`. |
| Cloud Runtime staging deploy | PASS | Protected dispatcher `31509462615` rendered staging bindings with immutable scientific image digests. |
| Pages staging deploy | PASS | Protected dispatcher `31509284274`; `beta.labofscents.org` is active on `olfactoryops-beta`. |
| R2 runtime binding | PASS | Cloud Runtime dispatcher checked the private artifact-bucket metadata; the scientific flow stored private artifact provenance. |
| Material Evidence Vectorize | PASS | Isolated BGE-M3 tenant-filter fixture was created, queried, and cleaned up. |
| Queue staging | PASS | Scientific queue has one Cloud Runtime producer/consumer, `max_retries=3`, and zero backlog after the successful flow. |
| Workflow staging | PASS | Dispatcher `31509715143` completed API Worker to Queue to Workflow to private feature container to R2. |
| Scientific container staging | PASS | The private feature container completed the bounded remote fixture with immutable image evidence. |
| RLS staging | PASS | Dispatcher `31509892505` passed staging RLS through API Worker to Hyperdrive to Supabase PostgreSQL. |
| Tenant isolation staging | PASS | The same run denied cross-tenant reads, writes, and direct IDs; list/search stayed tenant scoped. |
| Role E2E staging | PASS | The same run independently passed Owner, Admin, Lab Manager, Perfumer, R&D Scientist, Lab Technician, Procurement, Sensory Panelist, Brand, Supplier, Finance, and Viewer. |
| Public V2 Worker route coverage | PASS | Dispatcher `31510839527` returned `100% 143/143` at the exact source SHA. |
| Staging home, login, signup | PASS | Real browser smoke on `beta.labofscents.org`, `/v2/login`, and `/v2/signup` returned HTTP 200 with no captured console or CSP errors. |
| Staging auth | PASS | Remote tenant verifier performed isolated signup, session, CSRF, and login through API Worker to Hyperdrive. |
| Staging scientific E2E | PASS | Bounded scientific feature flow persisted queue, Workflow, container, R2, and PostgreSQL provenance. |
| Runtime observability | PASS | The remote tenant verifier reported no safe runtime failure codes for its acceptance window. |
| Local regression | PASS | `npm.cmd test` passed `404/404`; lint, V2/Worker typechecks, frontend/API/Worker/router builds, client secret scan, dependency audit, and `git diff --check` passed. |
| Local PostgreSQL rerun | NOT_APPLICABLE | No local database or Docker was started; actual remote staging RLS verification passed. |

## Blocking Gates

| Gate | Status | Exact reason |
| --- | --- | --- |
| DLQ staging | BLOCKED | Configuration is verified, but no isolated terminal failure has reached the scientific DLQ after the configured retry policy. |
| Tenant wildcard browser acceptance | BLOCKED | An isolated `<fixture>.beta.labofscents.org` flow plus unknown/archived-host browser behavior has not been recorded at the verified SHA; the deliberate unknown hostname does not currently resolve in public DNS. |
| Staging model E2E | BLOCKED | No reviewed tenant model artifact is registered for serving and the current model runtime intentionally returns `NOT_CONFIGURED`; there is no approved public `SCIENTIFIC_MODEL` dispatch contract. |

## Final Status

```text
CLOUD_NATIVE_ARCHITECTURE_READY = BLOCKED
REMOTE_SCIENTIFIC_BUILD_READY = PASS
STAGING_READY = BLOCKED
SAFE_TO_DEPLOY_LABOFSCENTS = BLOCKED
PRODUCTION_DEPLOYED = NOT_APPLICABLE
V2_CLOUDFLARE_STAGING_TAG = NOT_APPLICABLE
```

No `v2-cloudflare-staging-ready` tag was created because every required
staging gate has not passed. Bot Fight Mode was disabled only to allow the
protected staging browser suite; re-enable it after the acceptance window.
