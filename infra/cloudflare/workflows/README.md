# Cloudflare Workflows (Durable Orchestration)

## Purpose

- Run bounded long-running cross-step processes (science/import/agent orchestration) in Cloudflare durable format.
- Keep authoritative writes in PostgreSQL.

## Required principles

- Workflow steps are resumable and versioned.
- Every workflow run has:
  - `organizationId`
  - `tenantActorId`
- Step boundaries are auditable and correlation-linked.
- No workflow must apply tenant-protecting business mutations directly.

## Step model

- `input_validation`
- `dispatch_jobs`
- `await_result`
- `artifact_projection`
- `completion_gate`

## Retry and cancellation

- Bounded retries only.
- Idempotent job keys required before dispatch.
- Manual cancellation path preserves immutable audit event and run state.

## Checkpoint status

- Architecture and step contract: PASS
- Runtime workflow bindings in worker/router: BLOCKED (post-cutover validation pending)

