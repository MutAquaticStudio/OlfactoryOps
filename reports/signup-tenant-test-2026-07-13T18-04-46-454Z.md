# OlfactoryOps Signup Tenant Test Report

Generated: 2026-07-13T18:05:14.681Z
Run started: 2026-07-13T18:04:46.454Z
API URL: https://api.labofscents.org/api/v1
App origin: https://labofscents.pages.dev
Workspace slug: signup-2026-07-13t18-04-46-454z
Signup email: owner+signup-2026-07-13t18-04-46-454z@labofscents.test

## Summary

- Result: PASS
- Expected organization: org-signup-2026-07-13t18-04-46-454z
- Expected brand: brand-signup-2026-07-13t18-04-46-454z

## Assertions

- POST /auth/signup creates organization, brand, active owner membership, owner session, and CSRF token.
- Signup cookie is HttpOnly, Secure, SameSite=None.
- GET /me hydrates the signup session from the persisted Worker state.
- GET /security/tenant-console returns only the new tenant's organization, brand, membership, and sessions.
- Cross-tenant probe to org-nxl is blocked.

## Evidence

- Signup organization: org-signup-2026-07-13t18-04-46-454z / signup-2026-07-13t18-04-46-454z
- Signup brand: brand-signup-2026-07-13t18-04-46-454z
- Signup membership: MBR-SIGNUP-2026- / owner+signup-2026-07-13t18-04-46-454z@labofscents.test
- Signup session: SES-0030
- /me tenant: org-signup-2026-07-13t18-04-46-454z
- Tenant console memberships: 1
- Tenant console role policies: 9
- Cross-tenant probe status: 403
