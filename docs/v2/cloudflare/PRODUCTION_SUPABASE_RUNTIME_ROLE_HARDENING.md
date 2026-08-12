# Production Supabase Runtime Role Hardening

## Scope

This document records the compatibility correction for the protected production
PostgreSQL dispatcher. It is source and local-test evidence only; it does not
authorize a production deployment or replace the protected production rerun.

## Observed failure

| Item | Evidence |
| --- | --- |
| Release candidate left unchanged | `v2-production-rc1` at `342f53f4b4aa812e853a2005899049c822d3426e` |
| Failed protected run | GitHub Actions `31579907325` |
| Migration chain | Completed before runtime-role hardening failed |
| PostgreSQL error | `SQLSTATE 42501`, only a role with `SUPERUSER` may alter a role with the `SUPERUSER` attribute |
| Root cause | The old hardening statement attempted to alter privileged role attributes from a Supabase-hosted administrative connection. |

`ROOT_CAUSE = SUPABASE_HOSTED_SUPERUSER_ATTRIBUTE_RESTRICTION`

## Corrected hardening sequence

1. Read `rolcanlogin`, `rolsuper`, `rolcreatedb`, `rolcreaterole`,
   `rolinherit`, `rolbypassrls`, and `rolreplication` before any mutation.
2. Fail closed with
   `PRODUCTION_RUNTIME_PRIVILEGES=BLOCKED_PRIVILEGED_ROLE_ATTRIBUTE` when
   `rolsuper`, `rolbypassrls`, or `rolreplication` is true. The dispatcher does
   not attempt to remediate those attributes.
3. Revoke all direct parent-role memberships.
4. When needed, issue only:
   `ALTER ROLE "hyperdrive_user" LOGIN NOCREATEDB NOCREATEROLE NOINHERIT`.
5. Preserve the existing least-privilege grant model, then reread role
   attributes, direct memberships, schema/table/function privileges, and
   ownership of public relations, sequences, views, materialized views, and
   functions.

The runtime role is never granted `SUPERUSER`, `BYPASSRLS`, `REPLICATION`, a
privileged parent role, schema `CREATE`, or ownership of V2 objects.

## Local evidence

- `scripts/production-runtime-role-hardening.test.mjs` proves privileged
  attributes are checked read-only and the generated statement contains none
  of `NOSUPERUSER`, `NOBYPASSRLS`, or `NOREPLICATION`.
- Full local release regression is recorded with the RC2 source change.

## Protected RC2 requirement

Before any production candidate or public deployment, the required-reviewer
production Environment must run the protected dispatcher with the exact
`v2-production-rc2` SHA and `confirm_production=APPLY_PRODUCTION`.

Required remote result:

```text
PRODUCTION_MIGRATIONS = PASS
PRODUCTION_RUNTIME_PRIVILEGES = PASS
```

Until that run completes, production role attributes, memberships, object
ownership, and effective grants remain `PENDING_PRODUCTION_RERUN`.
