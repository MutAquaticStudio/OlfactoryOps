# Agent Platform: Tool Security Model

## Registry rules

Only these tools can run: material search/detail, inventory and lot lookup, formula cost and math validation, compliance validation, substitutions, approved material-evidence retrieval, and draft-save preparation. Each tool has a typed input/output schema, timeout, retry policy, capability requirement, and audit action.

## Authorization and data handling

- Tool execution repeats tenant scope and permission checks. A run never grants more access than its caller currently has.
- Formula composition requires sensitive formula and material permissions. Cost and lot evidence require their own capabilities.
- Brand-facing results are safe projections. Material ids, CAS, ratios, costs, lots, raw warnings, and unapproved evidence are removed before persistence or response.
- Material Evidence RAG returns only reviewed, tenant-authorized citations and bounded excerpts. Deterministic formula, IFRA, inventory, costing, and compliance engines remain the decision authority.

## Write controls

Write tools require a route-scoped idempotency key and request hash. Draft save uses a 24-hour confirmation and a durable confirmation-to-draft mapping; concurrent acceptance returns the same draft. Save revalidates permissions, tenant scope, material visibility, blocked status, formula math, compliance, locks, and an explicitly requested inventory gate immediately before mutation.

## Prohibited behavior

No tool may execute SQL, shell commands, browser JavaScript, HTML, arbitrary URLs, or dynamically named functions from model/client output. No document, embedding, secret, opaque session credential, or raw provider response may be sent to the frontend or audit payload.
