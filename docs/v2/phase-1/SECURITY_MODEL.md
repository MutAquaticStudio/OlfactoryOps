# V2 Phase 1 Security Model

Phase 1 uses server-derived actor and organization context. Browser payloads cannot override tenant scope.

- Sessions are high-entropy opaque credentials; PostgreSQL stores only a verifier hash.
- Unsafe cookie-authenticated methods require a session-bound CSRF token and exact Origin validation.
- Permission registry keys and organization role policies authorize every operation.
- The last active Owner cannot be removed or stripped of workspace governance permissions.
- Audit records store action, outcome, subject, correlation ID, and optional payload hash; never secrets, tokens, passwords, or private document content.
- Cloudflare provider adapters normalize errors and return `NOT_CONFIGURED` until credentials are explicitly configured.
- PostgreSQL RLS is defense in depth; repositories set `app.organization_id` and `app.user_id` in transactions.
