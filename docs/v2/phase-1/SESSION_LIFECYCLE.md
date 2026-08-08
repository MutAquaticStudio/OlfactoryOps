# V2 Phase 1 Session Lifecycle

1. Login or signup creates a random opaque token and session-bound CSRF token.
2. PostgreSQL stores SHA-256 verifier hashes only; raw values exist only in the response cookie/header flow.
3. Sessions have idle and absolute expiry, last-seen timestamps, device metadata, and optional rotation lineage.
4. Logout, revoke-one, revoke-all, password change, and email change revoke or rotate sessions according to policy.
5. Every protected request revalidates the session, membership, active hostname, expiry, and permission.
6. Missing/invalid CSRF or Origin returns a normalized security error and an audit event.

Raw session credentials are excluded from logs, audit payloads, persistent notifications, and client state.
