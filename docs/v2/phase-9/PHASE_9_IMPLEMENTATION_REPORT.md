# OlfactoryOps V2 Phase 9 Implementation Report

## Local Acceptance Position

Phase 9 documents the active V2 governed-agent implementation: versioned definitions, workflows, tools and policies; durable execution evidence; governed domain adapters; persisted replay; confirmation; and evaluation boundaries. It is not a remote migration, production deployment, or enabled external-provider statement. Phase 10 later connected the existing read-only `commerce.status` tool to the tenant-scoped Commerce domain service.

The current local evidence set is scoped: the focused Phase 9 Vitest selection passed 15 files and 62 tests, and `npm.cmd run typecheck:v2`, `npm.cmd run v2:postgres:verify`, and `npm.cmd run v2:postgres:rls` passed on the current tree. That evidence covers contracts, registry/domain controls, controller/client edge controls, disposable migration checks, and disposable application-role RLS/workflow checks. Disposable PostgreSQL confirmation checks also verify the fenced effect claim, Formula-origin unique-draft invariant, and terminal failure with quota release for invalid candidate/project input. They verify both cancel/approve race outcomes: cancel-first leaves the run and confirmation `CANCELLED` with no Formula draft, while a staged `APPROVE` makes cancel return `AGENT_CONFIRMATION_PROCESSING` and the approval completes `SUCCEEDED`. Phase 9 local acceptance is `PASS` for that repository-local scope. This evidence does not replace an authenticated live HTTP/SSE or browser acceptance run.

## Requirements Boundary

| Requirement | Evidence boundary | Status |
|---|---|---|
| FR-AG-001, FR-AG-002 | Durable runs/jobs/events plus versioned definition, workflow, node and protocol contracts | PASS |
| FR-AG-003 | Allow-listed typed registry with schemas, payload bounds, timeout and retry policies | PASS |
| FR-AG-004 | Route-specific runtime permission gates, domain-service re-authorization, and no database client exposed to an adapter | PASS |
| FR-AG-005 | Runtime mutation idempotency, operation replay, and tool invocation uniqueness boundary | PASS |
| FR-AG-006 | Confirmation-required Formula Draft mutation: fenced durable effect claim, Formula-origin unique-draft invariant, invalid candidate/project terminal handling with quota release, and cancel/approve race outcomes verified on disposable PostgreSQL | PASS |
| FR-AG-007, FR-AG-008 | Server-only provider gateway, bounded structured artifact contract, and no raw prompt/reasoning/secret persistence | PASS |
| FR-AG-009 | Persisted sequence replay, REST replay cursor, and SSE resynchronization control frame | PASS |
| FR-AG-010 | Durable job lease/fencing, cancellation, quota reservation, and bounded retry controls | PASS |
| FR-AG-011 | Governed non-generic tool boundary; generic SQL, database-write, shell, URL, HTTP, MCP, and unregistered-tool paths are absent | PASS |
| Credential-backed outbound provider completion and usage | Default provider is `NOT_CONFIGURED`; no credential-backed outbound adapter is configured | BLOCKED |
| Commerce-backed order status result | Phase 10 connects `commerce.status` to `CommerceService.listOrders`; its bounded, redacted tenant-scoped projection is covered by focused tests and the Owner role-browser run | PASS |
| Authenticated Commerce-Agent browser acceptance | The isolated Owner fixture starts and executes the read-only Commerce run in `test:v2:role-e2e` | PASS |
| Remote PostgreSQL migration | No remote target is part of this checkpoint | NOT_APPLICABLE |
| Production deployment | No deployment is part of this checkpoint | NOT_APPLICABLE |

## Persistence and Security Position

Migration `0015_phase9_agentic_ai_platform.sql` is additive to the Phase 6 runtime. It adds tenant-scoped identities, version snapshots, workflow tool bindings, node/message/confirmation-intent/provider-usage/evaluation/lineage evidence, confirmation effects, quota reservations, composite tenant references, indexed replay and observation paths, published-only active versions, and forced RLS. Existing Phase 6 event rows retain their existing replay behavior.

Version snapshots and immutable evidence records are append-only. Protocol-scoped `agent-runtime/v1` events and artifacts are also immutable, while run nodes, confirmations/effects, and quota reservations use controlled lifecycle updates. Completed or recorded provider usage requires a response hash; a truthful `NOT_CONFIGURED` usage record remains valid. Evaluation nodes are bound to the same run by a composite foreign key.

The API uses the global `/api/v1` prefix. Run commands and replay are served from `/api/v1/v2/agent-runs`; catalog, evaluation, and observability routes are served from `/api/v1/v2/agent-runtime`. Every route resolves tenant and actor context and applies its route-specific agent permission. Mutations also require CSRF and service-level idempotency. SSE is a replay transport over persisted events, never the source of truth; a sequence gap or exhausted window triggers persisted-state resynchronization.

## Documentation Checks

| Check | Status |
|---|---|
| Phase 9 architecture documents the active migration, contracts, services and controller boundary | PASS |
| Tool security document records the server/domain/MCP/provider/Commerce constraints | PASS |
| V2 index, traceability matrix and Vietnamese root README include the Phase 9 boundary | PASS |
| Focused Phase 9 contract, controller, client, and runtime tests (15 files, 62 tests) | PASS |
| Service/package typecheck and disposable PostgreSQL migration/RLS gates | PASS |
| Confirmation-saga effect claim, unique draft, invalid-input recovery, and cancel/approve race acceptance on disposable PostgreSQL | PASS |
| Authenticated HTTP/SSE and browser acceptance | BLOCKED |

`BLOCKED` is an evidence dependency. It does not authorize a provider, enable Commerce, or turn an SSE transport into durable state.
