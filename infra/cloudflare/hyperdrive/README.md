# Hyperdrive Integration (Cloudflare PostgreSQL Proxy)

## Purpose

- Provide managed, low-latency PostgreSQL connectivity from Workers.
- Keep PostgreSQL as the single V2 source of truth while removing local Docker/Postgres sidecars
  from API command execution paths.

## Target binding

- API Worker:
  - `HYPERDRIVE` (Cloudflare binding)
- Tenant Router:
- `ROUTER_HYPERDRIVE` or equivalent read-only tenancy resolution path (if needed)

## Migration notes

- The current checkpoint is architecture-first and does not switch all runtime call sites to
  Hyperdrive yet.
- Keep D1 migration history untouched (`0001-0017`).
- Before enabling production cutover:
  1. Validate PostgreSQL socket + transaction behavior with a disposable local smoke tenant.
  2. Confirm no remaining critical code path depends on `DB`-style Workers D1 bindings.
  3. Add explicit migration/verification evidence for Hyperdrive route and session/host projections.

## Deployment contract (checkpoint)

- `DATABASE_URL` is used only by local/offline and migration tooling.
- Workers use only the Cloudflare Hyperdrive binding in the migration phase.
- Tenant isolation, RLS, and auditability remain enforced at PostgreSQL layer.

## Acceptance status

- Architecture docs: PASS
- Binding configuration in production workers: BLOCKED (credentials/service binding pending)
- D1 cutover safety verification: BLOCKED

