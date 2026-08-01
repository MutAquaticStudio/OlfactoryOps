# Agent Platform: Implementation Plan

## Phase A: Contract and observability

- Establish the protocol document and standard error envelope.
- Align `Last-Event-ID` and `afterSequence` replay in Worker and local APIs.
- Reconcile SSE events in the browser with event-id deduplication, ordered buffering, bounded recovery, and an authoritative detail refresh.
- Record documentation for current and target architecture.

## Phase B: Runtime durability

- Add direct Worker/D1 integration tests for stale lease fencing, event sequence contention, cancellation, retry ceilings, and expired sessions.
- Verify every lifecycle transition writes an audit-chain event without exposing tool input or provider text.
- Add checkpoint records at node boundaries and reject workflow definitions that do not reference a published version.

## Phase C: Local parity

- Keep local mutation idempotency, quotas, confirmation expiry, sensitive-data redaction, and ranking semantics equivalent to the Worker.
- Test restart recovery of confirmed drafts and duplicate confirmation handling.

## Phase D: UI resilience

- Show node progress, reconnecting, restored, cancellation, and retry states.
- Keep confirmation and sharing in accessible dialogs with restored state after refresh.
- Render only allow-listed artifacts and distinguish `Not evaluated` from a favorable score.

## Release gate

Run unit tests, frontend build, local API build, Worker typecheck/build, lint, client secret scan, dependency audit, migration verification, and an authenticated beta smoke test. Deployment is not a substitute for role-based workflow verification.
