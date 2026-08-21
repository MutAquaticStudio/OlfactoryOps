# Platform Owner Bootstrap Preparation

Status: BLOCKED

This is a one-time production control-plane ceremony. It does not run during
schema migration, application deployment, or ordinary staging verification.

## Preconditions

- `PRODUCTION_MIGRATIONS = PASS`
- `PRODUCTION_RLS = PASS`
- `PRODUCTION_RUNTIME_PRIVILEGES = PASS`
- The designated production user already exists and has a verified email.
- A dedicated production migration/admin PostgreSQL connection is available.
- The user has refreshed or re-authenticated after assignment.
- The four mandatory production runtime secret rotations and exact-SHA
  Environment revalidation are complete before any deployment.

The runtime Hyperdrive role must not be used for this ceremony. It remains
non-superuser, `BYPASSRLS=false`, and inherits no privileged parent role.

## Protected inputs

Supply these only through an approved production Environment/job input or an
untracked operator shell. Never place values in source, workflow logs, issue
comments, release notes, or this document.

- `PLATFORM_OWNER_BOOTSTRAP_EMAIL`
- `PLATFORM_BOOTSTRAP_DATABASE_URL`
- `PLATFORM_OWNER_BOOTSTRAP_ENVIRONMENT=production`
- `CONFIRM_PLATFORM_OWNER_BOOTSTRAP=ASSIGN_PLATFORM_OWNER`
- `V2_PRODUCTION_PLATFORM_OWNER_BOOTSTRAP_APPROVED=ASSIGN_PLATFORM_OWNER`

## Expected behavior

`scripts/bootstrap-platform-owner.mjs` refuses missing confirmation, a
non-production environment marker, non-PostgreSQL or loopback URLs, zero or
ambiguous verified users, and a second active `PLATFORM_OWNER`. It creates a
single active operator assignment with `mfa_required=true` and a corresponding
append-only platform audit event. It never creates a tenant Membership.

`INITIAL_PLATFORM_OWNER = BLOCKED` until this exact production ceremony has
completed and an authorized user has refreshed the session. Because no TOTP
enrollment/recovery ceremony is yet active, the bootstrap owner can view the
control plane but remains unable to perform MFA-gated mutations. That is an
intentional fail-closed production blocker, not a bypass condition.
