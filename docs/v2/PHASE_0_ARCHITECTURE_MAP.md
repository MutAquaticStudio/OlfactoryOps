# V2 Phase 0 Architecture Map

## Current to target boundaries

| Current surface | Target boundary | Phase 0 action | Migration rule |
|---|---|---|---|
| `src/` React/Vite workspace | `apps/web` | Boundary README only | Move by feature with route and permission tests; no blind copy |
| `server/src/` Nest/Fastify API | `apps/api` and `services/*` | Contract references only | Keep compatibility routes until parity is verified |
| `worker/` Cloudflare API | `infra/cloudflare` edge plus adapters | Boundary README only | D1 remains edge/control plane, never a second Postgres writer |
| Existing D1 migrations `0001-0044` | V1 compatibility | Frozen | No destructive edits; no new migration in Phase 0 |
| Existing formula/material/inventory logic | `services/lab-ops`, `services/formula` | No move yet | Extract behind contracts after invariant tests pass |
| Existing trials and sensory flow | `services/trials-sensory` | Contract boundary | Preserve private sensory memory and consent boundaries |
| Existing RAG runtime | `services/rag` | Contract boundary | Evidence/citations only; tenant re-check remains server-side |
| Existing Formula Intelligence runtime | `services/agent-runtime` | Tool contracts only | AI never becomes authority for deterministic decisions |

## Logical V2 layout

```text
apps/
  web/                 React application boundary
  api/                 HTTP/BFF boundary
services/
  platform/            tenant, security, members, billing, observability
  lab-ops/             materials, suppliers, inventory, procurement, documents
  formula/             formulas, costing, compliance, approvals
  trials-sensory/      trials, panel sessions, private sensory memory
  lineage/             events, audit, provenance, traceability
  rag/                 evidence retrieval and citation projection
  agent-runtime/       allow-listed tools and durable orchestration contracts
  scientific/          adapter boundary to Python/C++ services
  sentiment/           consented consumer feedback and perception contracts
packages/
  contracts/           shared API and workflow contracts
  permissions/         versioned authorization registry
  domain-events/       event envelope and compatibility helpers
  provenance/          source, dataset, model, artifact vocabulary
  ui/                  shared UI primitives (future extraction)
infra/
  postgres/            V2 database plan and migrations
  cloudflare/          edge, Pages, SaaS, router, queues
  object-storage/      private document/object boundary
  vector/               tenant-filtered vector index boundary
  queues/               durable job transport boundary
```

## Data flow

1. Browser requests enter the Cloudflare edge and tenant router.
2. API derives `TenantContext` and `ActorContext` from the authenticated session; body fields cannot override either.
3. Application services validate permission, idempotency, and transaction scope.
4. PostgreSQL writes authoritative domain state and an append-only event/outbox record in the same transaction.
5. Edge services may cache or queue derived work, but never become an authoritative domain writer.
6. RAG/scientific adapters return versioned evidence and provenance references. Deterministic domain services retain final authority.

## Incremental migration sequence

1. Phase 0: contracts, boundaries, ADRs, and verification.
2. Phase 1: tenant/platform and lineage repositories with dual-read compatibility.
3. Phase 2: materials, inventory, formula, and trials extraction behind invariant-preserving service interfaces.
4. Phase 3: scientific, sentiment, and agent adapters using the contracts here.
5. Cutover only after record-count, tenant-scope, event, and reconciliation checks pass. Remove compatibility paths only in a separately approved phase.
