# OlfactoryOps Signup Tenant Test Report

Generated: 2026-07-13T18:29:41.279Z
Run started: 2026-07-13T18:29:27.857Z
API URL: https://api.labofscents.org/api/v1
App origin: https://labofscents.pages.dev
Workspace slug: signup-2026-07-13t18-29-27-857z
Signup email: owner+signup-2026-07-13t18-29-27-857z@labofscents.test

## Summary

- Result: PASS
- Expected organization: org-signup-2026-07-13t18-29-27-857z
- Expected brand: brand-signup-2026-07-13t18-29-27-857z

## Assertions

- POST /auth/signup creates organization, brand, active owner membership, owner session, and CSRF token.
- Signup cookie is HttpOnly, Secure, SameSite=None.
- GET /me hydrates the signup session from the persisted Worker state.
- GET /security/tenant-console returns only the new tenant's organization, brand, membership, and sessions.
- GET /billing/console returns the new tenant's Free subscription and full plan catalog.
- POST /billing/subscription/select-plan starts a tenant-scoped paid trial.
- Cross-tenant probe to org-nxl is blocked.

## Evidence

- Signup organization: org-signup-2026-07-13t18-29-27-857z / signup-2026-07-13t18-29-27-857z
- Signup brand: brand-signup-2026-07-13t18-29-27-857z
- Signup membership: MBR-SIGNUP-2026-07-13T18-29-27-857Z / owner+signup-2026-07-13t18-29-27-857z@labofscents.test
- Signup session: SES-0035
- Signup subscription: SUB-ORG-SIGNUP-2026-07-13T18-29-27-857Z / PLAN-APPRENTICE
- /me tenant: org-signup-2026-07-13t18-29-27-857z
- Tenant console memberships: 1
- Tenant console role policies: 9
- Billing plan catalog: PLAN-APPRENTICE, PLAN-ARTISAN, PLAN-ATELIER, PLAN-MAISON
- Selected billing plan: PLAN-ARTISAN / trialing
- Cross-tenant probe status: 403
