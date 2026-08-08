# V2 Phase 1 Authenticated Role E2E Matrix

**Environment:** disposable loopback PostgreSQL, local API, Vite preview, `V2_QA_ENVIRONMENT=test`
**Storage states:** generated per run by `scripts/create-v2-role-fixtures.mjs`
**Viewports:** 390, 768, 1280, and 1440 pixels
**Production credentials/data:** not used

| Role | Login/session | Navigation projection | Protected/denied routes | Tenant isolation | Sensitive/cost/inventory projection | Owner-only surfaces | Responsive | Status |
|---|---|---|---|---|---|---|---|---|
| Owner | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Admin | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Lab Manager | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Perfumer | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| R&D Scientist | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Lab Technician | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Procurement | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Sensory Panelist | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Brand | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Supplier | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Finance | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Viewer | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

## Assertions

- Every role uses an independent storage state and is checked individually; no role inherits another role's result.
- `/me` returns the authenticated role, verified user, tenant membership, and capability projection.
- `/v2/workspace` renders only capability-allowed navigation. Members and observability views are checked against role capability.
- Protected observability access is `PASS` for Owner and denied for every other role. Cross-tenant `x-forwarded-host` access returns the normalized `403 TENANT_ACCESS_DENIED` envelope.
- The role harness checks horizontal overflow after navigating through workspace, observability, and members surfaces at all listed viewports.
- Fixture teardown drops the disposable PostgreSQL schema in separate statements and removes all generated storage states.
