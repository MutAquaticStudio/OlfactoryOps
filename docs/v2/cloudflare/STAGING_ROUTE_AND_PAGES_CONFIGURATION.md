# Staging Route And Pages Configuration

## Status

| Item | Status | Evidence |
| --- | --- | --- |
| Staging route declarations | PASS | The active tenant router uses only `*.api-beta.labofscents.org/*`; the exact API route is independent. |
| API wildcard exclusion | PASS | `api-beta.labofscents.org/*` -> `olfactoryops-v2-api-staging` is more specific than `*.api-beta.labofscents.org/*` -> `olfactoryops-v2-tenant-router-staging`. |
| Staging DNS records | PASS | `beta.labofscents.org` remains the proxied Pages CNAME; `api-beta.labofscents.org` is the isolated API host; proxied `*.api-beta.labofscents.org` is the staging tenant fallback. No production record changed. |
| Staging Worker routes | PASS | Protected API, Tenant Router, Pages, and Cloud Runtime dispatchers deployed verified source `4da6dfa061fc5ca818238c555e3320fc77a858b5` with Hyperdrive only. |
| Pages staging environment | PASS | Protected Pages dispatcher `31531996514` deployed `olfactoryops-beta` with the declared public V2 variables and a staging release manifest. |
| Production changes | NOT_APPLICABLE | This document covers staging only. |

## Pages Build Variables

Set these public values only in the `olfactoryops-beta` Pages staging project:

```text
VITE_API_BASE_URL=https://api-beta.labofscents.org/api/v1
VITE_V2_WORKSPACE_BASE_DOMAIN=api-beta.labofscents.org
VITE_V2_STAGING_PUBLIC_CUTOVER=true
```

`VITE_V2_STAGING_PUBLIC_CUTOVER` intentionally hides Phase 7+ UI entry points
and returns a bounded staging-boundary page for direct Phase 7+ paths. It does
not grant access; the API Worker also omits those route modules.

## Current Acceptance Boundary

The active staging tenant convention is
`<workspace>.api-beta.labofscents.org`. This is a staging-only fallback because
the account does not have `*.beta.labofscents.org` certificate coverage, while
active Advanced Certificate `ac20e8dd-080f-47e8-a435-2046c5514145` covers both
`api-beta.labofscents.org` and `*.api-beta.labofscents.org`.

Browser run `31532127144` passed known-tenant and unknown-tenant TLS/router
acceptance at `4da6dfa061fc5ca818238c555e3320fc77a858b5`. Route parity run
`31530804517` passed `143/143`. Production remains out of scope.
