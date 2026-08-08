# Competitive Moat: Current-State Audit

## Baseline

OlfactoryOps has a React 19/Vite workspace, a local NestJS/Fastify API, and a
Cloudflare Worker/D1 hosted API. The Worker is the hosted authority for
authentication, tenant scope, audit persistence, idempotency, and operational
mutations. The local API is a deterministic development target.

The existing Formula Intelligence surface already provides tenant-scoped
Design Studio projects, durable agent runs, direction sharing, confirmation
based formula draft saves, deterministic formula validation, and project-level
audit evidence. Formula Design projects currently keep their brief in the
mutable `formula_design_projects.brief_json` column.

## Reusable Seams

- `src/data/agentRuntime.ts` owns shared Zod contracts for Design Studio,
  optimizer, agent events, artifacts, and workflow configuration.
- `worker/formula-intelligence.ts` owns hosted Design Studio persistence,
  generation authorization, direction projection, and audit helpers.
- `server/src/services/agent-local-runtime.service.ts` is the local durable
  mock equivalent. It persists its test state in a local JSON file.
- `worker/agent-runtime.ts` provides durable run state, job leasing, event
  replay, bounded retries, and confirmation records.
- `worker/material-evidence-rag.ts` is evidence retrieval only. It does not
  decide formula math, compliance, inventory, or approval outcomes.
- `worker/index.ts` and the Nest controller expose the existing
  `/formula-intelligence/design-projects` API family.
- Trials and Sensory, Formula approvals, Lab Usage, inventory ledger, and
  Formula Intelligence draft saves already enforce separate domain workflows.

## Parity Gaps At Checkpoint Start

- The Worker uses D1 project records while the local API stores a compatible
  but independently shaped project object in `.olfactoryops-agent.local.json`.
- Hosted projects have recipient-scoped shares and D1 audit-chain evidence;
  local development records equivalent integration audit events but not the
  hosted audit-chain table.
- Existing Design Studio brief data has no immutable version history or
  reviewed structured-brief gate on either target.
- Existing deterministic direction generation reads `brief_json` directly.
  This checkpoint adds a reviewed-version gate for new projects while keeping
  historical projects operational through an explicit legacy state.

## Checkpoint Boundary

This work does not enable an LLM, make provider calls, alter RAG retrieval,
consume or reserve inventory, change formula approval, deploy a Worker or
Pages build, apply a remote migration, or change secrets. Existing dirty
working-tree changes are preserved and are not reset or reformatted.
