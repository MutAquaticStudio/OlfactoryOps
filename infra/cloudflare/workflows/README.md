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

- Scientific Workflow implementation: PASS (dry-run bundle and private input contract tests)
- Staging Workflow/Container invocation: BLOCKED (no staging bindings or image digest)
