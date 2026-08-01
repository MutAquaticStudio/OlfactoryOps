# Agent Platform: Current Architecture

## Scope

OlfactoryOps runs Formula Intelligence on the existing React, NestJS, and Cloudflare Worker/D1 architecture. The active provider is deterministic mock mode. It executes registered tools against the caller's tenant data and does not call an external model or persist model reasoning.

## Runtime boundaries

- `src/data/agentRuntime.ts` is the shared protocol and artifact contract.
- `src/features/ai-formula-agent/` is the compatibility research workspace.
- `src/features/formula-intelligence/` contains Design Studio and Reformulation Optimizer surfaces.
- `server/src/services/agent-local-runtime.service.ts` persists local mock runs atomically in `.olfactoryops-agent.local.json` for development.
- `worker/agent-runtime.ts` persists runs, nodes, jobs, events, artifacts, and confirmations in tenant-scoped D1 records.
- `worker/formula-intelligence.ts` owns projects, direction shares, feedback, proposal redaction, scoring, and audit-chain evidence.
- `worker/index.ts` authenticates requests, applies tenant and permission gates, and mounts the agent routes under `/api/v1`.

## Existing durable flow

1. An authenticated user creates a run or Formula Intelligence workflow.
2. The Worker writes a run, durable job, user message, and append-only events.
3. `ctx.waitUntil` starts worker execution; the scheduled handler can reclaim an expired job lease.
4. Registered deterministic tools call the existing NorthStar domain service.
5. Structured artifacts are persisted and rendered through an allowlist.
6. A draft save pauses for explicit confirmation and remains non-consuming.
7. The confirmation id is the durable exactly-once key for formula draft save.

## Security model already in place

- Every run, project, share, event, artifact, and confirmation is scoped by `organization_id`.
- A run creator owns its conversation and tool payloads. Audit evidence is available to authorized administrators without automatically exposing those payloads.
- Formula composition, materials, cost, inventory lots, and evidence are independently capability-gated.
- Direction sharing is recipient-scoped, revocable, and defaults to hiding material names. Brand projections exclude ids, CAS, ratios, lots, costs, and raw compliance warnings.
- Mutations use an idempotency scope of organization, actor, route, key, and request hash. Conflicting key reuse is rejected.

## Known gaps at this checkpoint

- The local and Worker transports had different replay behavior. The shared protocol now accepts `Last-Event-ID` semantics in both targets, but direct Worker/D1 contention coverage still needs expansion.
- Design Studio and Optimizer previously refreshed the full run for each SSE event. They are being moved to buffered persisted-event replay with a throttled authoritative detail refresh.
- External provider execution remains intentionally disabled. `AGENT_PROVIDER` configuration alone must never make the beta appear model-backed.
