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
| Pages | `olfactoryops-beta` | PASS | Existing staging Pages project; no deployment/config mutation in this cutover yet. |
| Vectorize | Existing material-evidence indexes | NOT_APPLICABLE | Not repurposed for isolated staging. |
| KV, Durable Objects, AI Gateway, Containers, Hyperdrive | Existing account inventory | NOT_APPLICABLE | No additional binding is needed before the blocked remote dependencies are satisfied. |

## Isolated Staging Resources

| Type | Name | Identifier or contract | Status |
| --- | --- | --- | --- |
| Private R2 | `olfactoryops-v2-artifacts-staging` | APAC, standard storage | PASS |
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
| Exact-Origin CORS / CSRF transport tests | PASS | API host plus one-label tenant-origin tests and preflight pass. |
| Agent Web Streams transport | PASS | Persisted event replay, trusted-origin session resolution, and cleanup are unit-tested. |
| R2 remote object lifecycle | BLOCKED | Requires deployed staging Worker; object APIs are not a Cloudflare control-plane mutation surface. |
| Vectorize remote tenant isolation | BLOCKED | Requires deployed staging Worker and a disposable tenant fixture. |
| Queue delivery, retry, DLQ | BLOCKED | Queues exist but no consumer Worker is deployed. |
| Workflow terminal failure | BLOCKED | Needs deployed Workflow and private Container images. |
| Container authorized/unauthorized invocation | BLOCKED | Needs private immutable image digests and Worker secret storage. |
| Remote staging PostgreSQL | BLOCKED | No approved remote staging origin is configured in the secure environment. |
| Hyperdrive | BLOCKED | Must be created only after an approved non-production PostgreSQL origin exists. |
| GitHub Cloudflare secrets | BLOCKED | `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are absent from repository secrets. |
| AI Gateway | NOT_APPLICABLE | Inventory only; provider credentials and approved policy are absent. |
| Production deployment | NOT_APPLICABLE | Explicitly out of scope. |

## Activation Sequence

1. Approve a remote staging PostgreSQL origin without placing its connection
   string in source control or chat.
2. Create Hyperdrive through Cloudflare MCP, apply the approved V2 migration
   baseline, and verify RLS/tenant role fixtures through the deployed Worker.
3. Set staging-only Worker secrets in Cloudflare secret storage.
4. Apply the exact `api-beta.labofscents.org` API route and the separate
   `*.beta.labofscents.org` tenant-router route, then add only their staging
   DNS records.
5. Configure and deploy the existing `olfactoryops-beta` Pages project with
   `.env.staging.example` values.
6. Run remote resource and browser acceptance tests. Production remains out of
   scope throughout.

## Current Verdict

```text
CLOUDFLARE_MCP_CONNECTED = PASS
LABOFSCENTS_ZONE_FOUND = PASS
MCP_STAGING_MUTATION_AUTHORIZED = PASS
REMOTE_POSTGRES_REQUIRED = PASS
HYPERDRIVE_STAGING = BLOCKED
STAGING_DNS_AND_ROUTES = BLOCKED
MATERIAL_EVIDENCE_VECTORIZE = PASS
MOLECULAR_VECTORIZE = NOT_APPLICABLE
ODOR_VECTORIZE = NOT_APPLICABLE
QUEUE_AND_DLQ_RESOURCES = PASS
REMOTE_STAGING_ACCEPTANCE = BLOCKED
PRODUCTION_DEPLOYED = NOT_APPLICABLE
STAGING_READY = BLOCKED
```
