# AI Formula Intelligence Runtime

## Architecture

The agent is a tenant-scoped orchestration layer over the existing material,
formula, inventory, cost, and compliance domain services. It does not calculate
financial, inventory, or compliance values with a language model. The shared
runtime contract lives in `src/data/agentRuntime.ts` and is imported by React,
the Nest local API, and the Cloudflare Worker.

Runs, messages, nodes, tool calls, artifacts, confirmations, durable jobs, and
versioned events are stored in D1. Event replay uses a per-run monotonic
sequence; SSE is a delivery transport and is never the source of truth.

## Provider Modes

`mock` is the default local and CI provider. It runs the same tool registry
against tenant-scoped domain data and produces deterministic artifact output.

`OpenAiResponsesProvider` is isolated and server-only, so its `fetch` contract
can be mocked without an SDK. The current beta rollout intentionally executes
only `mock` mode. This prevents a secret-only configuration from falsely
labeling deterministic output as an OpenAI result. A later provider rollout
must add its tool-call continuation loop, then enable it only with the following
Worker secrets or variables:

- `AGENT_PROVIDER=openai`
- `OPENAI_API_KEY`
- `OPENAI_FORMULA_AGENT_MODEL`
- `AGENT_CONTEXT_ENCRYPTION_KEY`

Until that rollout is complete, the application remains in `Deterministic mock
mode`, regardless of any partially configured provider variable. No browser
bundle, D1 record, audit event, or response exposes the provider secret.

## Security Boundaries

- Every run query is filtered by both organization and creator user ID.
- The agent never receives browser credentials, private document objects, raw
  provenance documents, provider secrets, shell commands, SQL, HTML, or JS.
- Every tool has an allow-listed name, validated input/output, timeout, retry
  policy, and permission check.
- Formula draft creation waits for an explicit confirmation and is idempotent.
- Formula research is advisory. IFRA and substitution output identifies its data
  source and is not a legal compliance determination.

## Runtime Limits

- 8 nodes, 12 tool calls, 2 retry attempts, 10 minutes per run.
- 64 KiB maximum event payload and bounded persisted tool-result excerpts.
- A D1 lease prevents duplicate job workers. The Worker starts a new job with
  `waitUntil` and the one-minute cron recovers interrupted jobs.

## Extending The Agent

Add a tool by defining its schema and permission in the registry, implementing
the executor through an existing domain service, adding its event lifecycle,
and writing unit plus tenant-isolation coverage. Add a node through the
versioned node registry; add an artifact through the allow-listed React renderer
registry. Never permit provider-produced markup or executable code.

## Formula Intelligence Workflows

The runtime powers two separate tenant-safe modules while the legacy
`/ai/formula-agent` URL redirects to Formula Design Studio for compatibility.

- **Formula Design Studio** stores a structured brand brief and produces three
  deterministic directions from compliance-approved workspace materials. Brand
  users can create a brief and review only deliberately shared safe summaries.
  Perfumers with `formulas.edit`, `formulas.viewSensitive`, and
  `materials.view` generate directions, share them, and request an explicit
  non-consuming formula-draft confirmation.
- **Reformulation Optimizer** requires an immutable material-only formula
  version. It creates candidate proposals for cost, compliance, inventory, or
  combined intent, then ranks validation feasibility before inventory, cost,
  and composition change. Cost and lot evidence are omitted when the current
  role lacks `costing.view` or `inventory.view`.

`migrations/0031_formula_intelligence.sql` adds project, direction, feedback,
run mapping, and candidate tables. Every record is organization-scoped; a
brand user may read only their own project and only directions explicitly
shared with them. Audit-chain events cover project create, generation, share,
feedback, optimizer runs, save requests, completion, and failures. No workflow
reserves or consumes inventory until an existing downstream operational flow
does so explicitly.
