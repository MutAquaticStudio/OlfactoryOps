# Staging Route And Pages Configuration

## Status

| Item | Status | Evidence |
| --- | --- | --- |
| Staging route declarations | PASS | `wrangler.v2-api-staging.example.toml` declares the exact API host and `wrangler.v2-tenant-router-staging.example.toml` declares only `*.beta.labofscents.org`. |
| API wildcard exclusion | PASS | `api-beta.labofscents.org` does not match `*.beta.labofscents.org`; it has a separate exact API route. |
| Staging DNS records | PASS | `beta.labofscents.org` is the active staging Pages hostname; `api-beta.labofscents.org` is the isolated API hostname. No production DNS record was changed. |
| Staging Worker routes | PASS | The API and Cloud Runtime dispatchers deployed source SHA `29b2233d09840dae34cb92802c34dfc5feea89a2` with Hyperdrive only. |
| Pages staging environment | PASS | Protected Pages dispatcher run `31509284274` built and deployed `olfactoryops-beta` with the declared public V2 variables. |
| Production changes | NOT_APPLICABLE | This document covers staging only. |

## Pages Build Variables

Set these public values only in the `olfactoryops-beta` Pages staging project:

```text
VITE_API_BASE_URL=https://api-beta.labofscents.org/api/v1
VITE_V2_WORKSPACE_BASE_DOMAIN=beta.labofscents.org
VITE_V2_STAGING_PUBLIC_CUTOVER=true
```

`VITE_V2_STAGING_PUBLIC_CUTOVER` intentionally hides Phase 7+ UI entry points
and returns a bounded staging-boundary page for direct Phase 7+ paths. It does
not grant access; the API Worker also omits those route modules.

## Current Acceptance Boundary

The API/Pages routing and authenticated API-to-Hyperdrive verification are
complete at source SHA `29b2233d09840dae34cb92802c34dfc5feea89a2`. Final
staging acceptance remains `BLOCKED` until a terminal Queue/DLQ fixture, a
tenant wildcard browser fixture (including unknown/archived behavior), and a
reviewed-model serving E2E are each independently verified. Production remains
out of scope.
