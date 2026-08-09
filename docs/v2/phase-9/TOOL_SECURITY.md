# Phase 9 Tool Security Model

## Trust Boundary

Phase 9 treats a tool as a declared contract, not arbitrary executable input. The registry validates tool name/version, read-only or mutating mode, required permissions, JSON input/output schemas, byte limits, timeout, retry policy, confirmation policy, and audit event type before execution. Tool and workflow version payloads are immutable; an active identity can reference only a published version.

The fixed server registry contains `material.search`, `material.get`, `evidence.search`, `inventory.visibility`, `sensory.memory.search`, `production.status`, `commerce.status`, `qa.traceability`, and the registered `formula.candidate_save_draft` mutation. There is no generic database, SQL, shell, URL, HTTP, MCP, or tool-discovery adapter.

## Authorization and Mutation Control

| Control | Enforcement |
|---|---|
| Runtime access | The controller applies the route-specific `agent.view`, `agent.execute`, `agent.observe`, `agent.evaluate`, `agent.confirmWrite`, or `agent.manageTools` permission. Confirmation preview also requires `formula.viewSensitive`; an APPROVE decision also requires `formula.edit`. |
| Tool access | Every registered tool declares required domain permissions; the owning V2 service repeats its own authorization and tenant checks. |
| Tenant isolation | The service transaction sets organization/user context; Phase 9 tables use composite tenant associations and forced RLS. |
| Mutation gate | The only registered mutation is `formula.candidate_save_draft`, which requires confirmation. Its adapter always rejects pipeline execution; only a durable APPROVE confirmation effect can call the Formula service with a fixed idempotency key. |
| Idempotency | Runtime mutations require an `Idempotency-Key`; the durable operation record rejects a key reused with different input and prevents duplicate completion. |
| Worker safety | Leased execution uses hashed lease tokens, expiry and fencing checks. Retry and active-run ceilings are bounded. |
| Cancellation | Registered adapter execution receives an abort signal and verifies it before and after its domain call. |

The available Formula handoff is a narrow `formula.candidate_save_draft` operation. An approved effect calls `FormulaService.saveCandidateAsDraft`, which revalidates candidate/project ownership, candidate state, material eligibility, and composition immediately before the write. It does not approve a Formula, reserve inventory, create a production record, or release product.

## Data Handling

Persisted messages, event payloads, and metadata are bounded structured data. Named raw-prompt, reasoning, credential, authorization-header, provider-token, and secret fields are rejected; unsafe text is reduced to a hash-only redacted projection before P9 event persistence. Provider artifacts are validated as bounded structured objects, and raw provider payloads/reasoning are forbidden by policy.

Audit records retain operation and payload hashes rather than raw sensitive input. Event envelopes are built from the tenant-scoped persisted record and expose the run ID, sequence, type, time, and persisted payload; the streaming controller does not sanitize arbitrary payload keys at replay time. SSE is explicitly `no-store`, and its replay cursor is based on persisted sequence numbers.

## Provider, MCP and Commerce Constraints

The default provider is `NOT_CONFIGURED`, makes no outbound request, and cannot produce an artifact. The runtime may persist that status as provider-usage evidence, but no completion, token/cost totals, or raw response are invented. Provider credentials and raw response content do not cross the client or audit boundary.

No MCP integration is registered in this checkpoint. A future MCP integration would need a registered typed adapter with the same permission, schema, payload, timeout, retry, confirmation, audit, and durable-evidence controls. Generic MCP/database writes are prohibited. Domain writes must pass through the owning V2 service.

`commerce.status` is read-only but returns `NOT_CONFIGURED` until Phase 10 provides Commerce records. It cannot produce order or fulfillment data merely because a caller holds `orders.view`.

## Evaluation Signals

Evaluation records are bounded tenant-scoped `RUN` evaluations recorded by `RULE` or `HUMAN`, optionally tied to a node from that same run. Provider-sourced evaluators are rejected. They retain a result hash and safe result summary, not hidden model reasoning.
