# OlfactoryOps V2 Phase 1 Implementation Report

**Scope:** Platform Security Core only. V1 routes and legacy D1 migrations `0001-0044` were not rewritten. No Phase 2, scientific, formula, material, inventory, procurement, or AI implementation was started.

**Branch:** `codex/v2-phase1-platform-security`
**Starting checkpoint:** `v2-phase0-foundation`
**Production deployment:** `NOT_APPLICABLE`

## Implemented surface

| Area | Status | Evidence |
|---|---|---|
| PostgreSQL Prisma schema and additive migrations | PASS | `infra/postgres/prisma/schema.prisma`, migrations `0001` and `0002` |
| Tenant RLS and non-bypass verification | PASS | `scripts/verify-v2-rls.ts`: loopback-only disposable PostgreSQL, `v2_app` with `NOBYPASSRLS`, unscoped denial, tenant-scoped visibility and cross-host denial |
| Signup transaction and default role policies | PASS | `PlatformService.signup`, `PrismaPlatformRepository.createSignup`, role-policy assertions |
| Opaque sessions, CSRF, expiry, revoke, credential rotation | PASS | `services/platform/src/service.test.ts`; hash-only persistence and rotation tests |
| Email verification, resend throttling, invalidation | PASS | Verification hash tests, `EMAIL_NOT_VERIFIED` gate, resend route and outbox enqueue |
| Hostname registry and safe routing boundary | PASS | Hostname contracts, tenant-router base-domain tests, exact host/session matching |
| Managed-beta billing projection | PASS | Server-side `MANAGED_BETA` capability projection; no checkout/portal route in V2 |
| Notification preferences, durable outbox, retry worker and push boundary | PASS | `services/platform/src/notification-worker.ts`, `notification-worker.test.ts`, migration `0002` |
| Consent, privacy export, workspace export, erasure review | PASS | Separate authorization paths and persisted request records |
| Append-only audit evidence | PASS | PostgreSQL mutation trigger `v2_reject_audit_mutation` and service audit events |
| Member invitation, resend, revoke and acceptance | PASS | Invitation repository/service/controller flow, encrypted handoff payload, service invitation tests |
| V2 UI routes and EN/VI shell | PASS | `src/features/v2-platform/V2PlatformApp.tsx`, isolated `/v2/*` route projection |
| V2 authenticated role Playwright matrix | PASS | `docs/v2/phase-1/ROLE_E2E_MATRIX.md`, 12/12 role tests on disposable PostgreSQL |
| Cloudflare SaaS/custom-domain activation | NOT_APPLICABLE | Provider adapter remains `NOT_CONFIGURED`; no production provisioning or DNS mutation is allowed in this checkpoint |

## Authenticated role matrix

All roles are independently fixture-backed and PASS: Owner, Admin, Lab Manager, Perfumer, R&D Scientist, Lab Technician, Procurement, Sensory Panelist, Brand, Supplier, Finance, and Viewer. Each flow checks login/session, navigation projection, protected and denied routes, tenant isolation, sensitive/cost/inventory capability projection, Owner-only observability, member visibility, and horizontal overflow at 390/768/1280/1440px. See [`ROLE_E2E_MATRIX.md`](ROLE_E2E_MATRIX.md).

## Verification matrix

| Gate | Status | Result |
|---|---|---|
| `npm test` | PASS | 225 tests passed |
| `npm run lint` | PASS | exit 0 |
| `npm run typecheck:v2` | PASS | exit 0 |
| `npm run build` | PASS | Vite production build; chunk-size warning only |
| `npm run build:api` | PASS | exit 0 |
| `npm run typecheck:worker` | PASS | exit 0 |
| `npm run build:worker` | PASS | dry-run only |
| `npm run build:tenant-router` | PASS | dry-run only |
| `npm run security:client-bundle` | PASS | no client secret detected |
| `npm audit --omit=dev --audit-level=high` | PASS | 0 vulnerabilities |
| `npm run v2:postgres:verify` | PASS | test-only loopback PostgreSQL migrations executed |
| `npm run v2:postgres:rls` | PASS | non-bypass `v2_app` role, unscoped denial, scoped visibility and cross-tenant denial verified |
| `npm run release:migrations:verify` | PASS | legacy D1 head `0044`, count `44` |
| `npm run release:docs:check` | PASS | release documentation valid |
| `npm run test:ux` | PASS | public/V2 UX and accessibility baseline passed; legacy role tests remain explicitly skipped |
| `npm run test:v2:role-e2e` | PASS | 12/12 authenticated roles passed; fixture cleanup PASS |
| Remote migration / production smoke / deployment | NOT_APPLICABLE | transition checkpoint only; no production mutation |
| `git diff --check` | PASS | no whitespace errors |

## Security notes

- Browser-provided organization IDs and public `X-Organization-ID` headers are not trusted.
- Session, CSRF, password, verification, push endpoint, invitation token, and provider credentials are never returned as persistent audit payloads.
- V2 controller errors use a stable normalized envelope; cross-tenant host mismatch returns `403 TENANT_ACCESS_DENIED`, not an internal error.
- The non-bypass RLS test self-provisions a local `v2_app` role without superuser or `BYPASSRLS`, then cleans its random tenant fixtures. It and the authenticated role matrix accept only disposable loopback PostgreSQL.
- Cloudflare provider status remains `NOT_CONFIGURED` until an explicitly configured adapter and credentials are supplied.

## Exit verdict

`PHASE_1_READY = YES`

All material Phase 1 requirements and applicable local verification gates PASS. Cloudflare provisioning, remote migrations, production smoke, and production deployment are intentionally `NOT_APPLICABLE` for this transition checkpoint. Phase 2 remains out of scope and must not begin in this checkpoint.
