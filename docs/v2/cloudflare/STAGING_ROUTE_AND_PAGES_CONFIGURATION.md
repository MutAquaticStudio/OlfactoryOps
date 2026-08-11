# Staging Route And Pages Configuration

## Status

| Item | Status | Evidence |
| --- | --- | --- |
| Staging route declarations | PASS | `wrangler.v2-api-staging.example.toml` declares the exact API host and `wrangler.v2-tenant-router-staging.example.toml` declares only `*.beta.labofscents.org`. |
| API wildcard exclusion | PASS | `api-beta.labofscents.org` does not match `*.beta.labofscents.org`; it has a separate exact API route. |
| Staging DNS records | BLOCKED | Not created until a remote staging PostgreSQL origin and Hyperdrive binding exist. |
| Staging Worker routes | BLOCKED | Not applied until the API Worker can use a real Hyperdrive binding and staging secrets. |
| Pages staging environment | BLOCKED | Existing `olfactoryops-beta` Pages project is not yet configured/deployed with the V2 staging variables below. |
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

## Activation Order

1. Approve a non-production PostgreSQL origin and create the staging
   Hyperdrive binding.
2. Set staging-only Worker secrets in Cloudflare secret storage.
3. Apply the API exact hostname route and the tenant wildcard route.
4. Add proxied staging-only DNS records for `api-beta` and `*.beta`; retain the
   existing `beta` Pages hostname as the public staging frontend.
5. Configure the Pages build variables above and deploy the existing
   `olfactoryops-beta` project.
6. Run authenticated API, tenant-router, R2, Vectorize, Queue, and browser
   checks. Do not promote or alter production during this sequence.
