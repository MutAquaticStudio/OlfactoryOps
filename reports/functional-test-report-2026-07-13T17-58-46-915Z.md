# OlfactoryOps Functional Test Report

Generated: 2026-07-13T17:59:32.854Z
Run started: 2026-07-13T17:58:46.915Z
App URL: https://labofscents.pages.dev
API URL: https://api.labofscents.org/api/v1
Browser path: Playwright fallback
Fallback reason: Browser plugin invocation failed during setup with "Invalid or unexpected token"; regular Playwright was used.
Production mutation mode: disabled

## Summary

- Total: 7
- Passed: 7
- Failed: 0
- Result: PASS

## Test Case Matrix

| ID | Module | Priority | Result | Duration | Evidence |
| --- | --- | --- | --- | --- | --- |
| TC-001 | Edge API / Auth Boundary | P0 | PASS | 7.60s | Health service: olfactoryops-worker-api |
| TC-002 | Auth Session | P0 | PASS | 5.02s | Session id: SES-0028 |
| TC-003 | Tenant / Permission Guard | P0 | PASS | 7.07s | Memberships scoped: 3 |
| TC-004 | Core Read Models | P1 | PASS | 7.68s | Materials: 8 |
| TC-005 | Documents | P1 | PASS | 4.36s | Missing CSRF status: 403 |
| TC-006 | Production Phase 9 | P0 | PASS | 1.57s | Batches: 2 |
| TC-007 | Frontend Auth / Production UI | P0 | PASS | 12.64s | Title: OlfactoryOps |

## Detailed Test Cases

### TC-001 - Public health is open and protected routes reject anonymous access

Module: Edge API / Auth Boundary
Priority: P0
Result: PASS
Duration: 7.60s

Objective:
Verify the production Worker is reachable while tenant and secret-bearing routes require authentication.

Steps:
1. Call GET /health without cookies.
2. Call GET /persistence/status without cookies.
3. Call GET /security/tenant-console without cookies.
4. Call GET /api-keys without cookies.

Assertions:
- /health returns 200 and service identity.
- Persistence status reports hybrid D1 with normalized sell-ready domain tables outside Formula.
- Tenant console returns 401 without a session.
- API keys return 401 without a session.

Evidence:
- Health service: olfactoryops-worker-api
- Persistence: cloudflare-d1-hybrid / auth_sessions, audit_events, security_rate_limits, tenant_organizations, tenant_brands, tenant_memberships, role_policies, material_records, molecule_components, storage_locations, stock_take_records, tenant_settings, feature_flags, numbering_sequences, custom_fields, tenant_branding, document_records, production_batches, suppliers, purchase_orders, price_history, commercial_skus, price_lists, quotes, sample_requests, customers, sales_orders, order_shipments, order_documents, scheduled_reports, billing_subscriptions, billing_invoices, webhook_deliveries, inventory_lots, inventory_movements, lab_usage_records
- Anonymous tenant status: 401
- Anonymous api-key status: 401

### TC-002 - Login issues HttpOnly cookie and server session can bootstrap /me

Module: Auth Session
Priority: P0
Result: PASS
Duration: 5.02s

Objective:
Verify auth no longer depends on frontend-stored bearer secrets and the API can authenticate with the session cookie.

Steps:
1. POST /auth/login with owner@example.test.
2. Inspect Set-Cookie security attributes.
3. Call GET /me with the cookie.
4. Call GET /me with bearer fallback for tooling compatibility.

Assertions:
- Login returns a session for org-nxl Owner.
- Set-Cookie includes HttpOnly, Secure, SameSite=None, and oo_session.
- /me works with cookie auth.
- /me works with bearer fallback.

Evidence:
- Session id: SES-0028
- Tenant: org-nxl
- Role: Owner

### TC-003 - Tenant console is scoped and permission probes block unauthorized roles

Module: Tenant / Permission Guard
Priority: P0
Result: PASS
Duration: 7.07s

Objective:
Verify server-side tenant isolation and role permission decisions for the active session.

Steps:
1. Call GET /security/tenant-console with owner cookie.
2. Call GET /security/tenant-probe?organizationId=org-other.
3. Call GET /security/permission-probe for Viewer inventory.adjust.
4. Call GET /security/permission-probe for Owner inventory.adjust.

Assertions:
- Tenant console only returns org-nxl memberships and brands.
- Cross-tenant probe returns 403.
- Viewer inventory.adjust returns 403.
- Owner inventory.adjust returns 200.

Evidence:
- Memberships scoped: 3
- Brands scoped: 2
- Cross-tenant status: 403
- Viewer adjust status: 403

### TC-004 - Primary SaaS modules return authenticated read models

Module: Core Read Models
Priority: P1
Result: PASS
Duration: 7.68s

Objective:
Verify the main OlfactoryOps modules still hydrate from the production Worker and D1 snapshot.

Steps:
1. Call GET /materials.
2. Call GET /formulas.
3. Call GET /inventory/console.
4. Call GET /documents.
5. Call GET /billing/console.

Assertions:
- Materials and formulas contain records.
- Inventory console contains lots and movements arrays.
- Documents contain at least one seeded document.
- Billing console exposes plan and usage data.

Evidence:
- Materials: 8
- Formulas: 2
- Lots: 9
- Documents: 4
- Billing plan: Atelier

### TC-005 - Signed document URL is nonce-bearing and audited behind auth

Module: Documents
Priority: P1
Result: PASS
Duration: 4.36s

Objective:
Verify document download signing remains permission-gated and private object paths are represented as signed URLs.

Steps:
1. POST /documents/DOC-118/signed-url with owner cookie.
2. Inspect the returned signed URL metadata.

Assertions:
- Cookie-authenticated mutation without CSRF returns 403.
- Response returns document, signedUrl, and audit data.
- Signed URL includes expires and nonce query parameters.
- Audit outcome is allowed.

Evidence:
- Missing CSRF status: 403
- Document: DOC-118
- Signed URL expires: 2026-07-13T18:04:19.622Z
- Audit: allowed

### TC-006 - Production read model includes work order, QC protocol, genealogy, and output lot evidence

Module: Production Phase 9
Priority: P0
Result: PASS
Duration: 1.57s

Objective:
Verify the Phase 9 production hardening is visible through API read models without creating a new batch by default.

Steps:
1. Call GET /production/batches.
2. Inspect the newest batch for work order steps and QC checks.
3. Find a released batch with output lot genealogy.

Assertions:
- At least one batch exists.
- Every inspected batch has a workOrder, qcChecks, and genealogy.
- At least one released batch has outputLot and genealogy.outputLotId.

Evidence:
- Batches: 2
- Inspected: BTH-2026-119, BTH-2025-118
- Released output: FG-BTH-2026-119
- Genealogy outputLotId: FG-BTH-2026-119

### TC-007 - Live UI logs in without frontend secrets and renders Production phase evidence

Module: Frontend Auth / Production UI
Priority: P0
Result: PASS
Duration: 12.64s

Objective:
Verify the deployed Pages app can authenticate with the cookie session, survive reload, and render the Phase 9 production panels.

Steps:
1. Open the live Pages app in Chromium.
2. Login with owner@example.test.
3. Inspect localStorage and API-domain cookies.
4. Reload and confirm the console restores from cookie.
5. Open the Production module and capture screenshot evidence.

Assertions:
- No framework overlay or blank page is shown.
- localStorage does not contain olfactoryops.auth.v1.
- localStorage only stores the session marker.
- API cookie named oo_session is HttpOnly and Secure.
- Production UI shows Work Order & QC Protocol, Batch Board, and Phase 9 Guardrails.
- No relevant console errors, page errors, or failed requests are emitted.

Evidence:
- Title: OlfactoryOps
- localStorage keys: olfactoryops.has_session.v1
- oo_session cookie: HttpOnly=true, Secure=true, SameSite=None
- Auth screenshot: evidence/2026-07-13T17-58-46-915Z/ui-authenticated-dashboard.png
- Production screenshot: evidence/2026-07-13T17-58-46-915Z/ui-production-phase9.png
