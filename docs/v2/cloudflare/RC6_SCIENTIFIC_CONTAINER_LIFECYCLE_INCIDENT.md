# RC6 Scientific Container Lifecycle Incident

## Scope

This record documents a staging-only RC6 lifecycle defect. It contains no
customer data, secrets, raw scientific inputs, or production operation.

| Field | Evidence |
| --- | --- |
| Active immutable candidate | `v2-production-rc6` / `87851cfd9dbd866547a6debd099ba9cc16c49e93` |
| Historical stale recovery | GitHub Actions run `31690411334` |
| Recovery result | Both explicit historical `sciencejob_*` targets stopped; temporary Worker cleanup passed. |
| Single RC6 canary | GitHub Actions run `31691731132` |
| Canary result | One isolated job completed through API Worker, Queue, Workflow, Cloud Runtime, feature Container, R2, and PostgreSQL metadata. |
| Post-canary Queue/DLQ | Both backlogs were `0`. |
| Affected application | `a036640d-69ba-4a68-9446-8e990e051e76` staging feature Container application. |
| Affected canonical lane | `instance-1`; no customer-derived lane identity is used. |

## Passive Verification

The initial post-canary check was corrected to use the documented conservative
deadline. The observation made only control-plane inventory calls and did not
invoke the canary Durable Object, Container RPC, or maintenance Worker after
the canary completed.

| Field | Value |
| --- | --- |
| Canary workflow completed | `2026-08-13T10:36:55Z` |
| Conservative observation start | `2026-08-13T10:36:55Z` (an upper bound for the last request) |
| Force-stop deadline | `2026-08-13T11:06:55Z` (`10m sleepAfter + 15m graceful shutdown + 5m reconciliation`) |
| Final passive inventory | After the deadline, `instance-1` remained `running`; `assigned=0`, `active=1`, `healthy=1`, `failed=0`. |
| Capacity | One of two feature slots remained consumed despite no queued or assigned work. |

This satisfies the true failure condition:

```text
AUTOMATIC_CONTAINER_IDLE_SHUTDOWN_DID_NOT_RELEASE_POOL_CAPACITY
```

## Root Cause And Narrow RC7 Contract

RC6 uses `@cloudflare/containers` `0.3.7`, declares `sleepAfter = '10m'`, and
inherits the package default `onActivityExpired() -> stop()`. Its Workflow
forwards a raw `fetch()` to a shared randomly selected pool lane and relies on
the asynchronous idle timer for all normal teardown. The evidence shows that
this fallback did not release the canonical lane's capacity within the full
documented window.

The RC7 change is deliberately bounded:

- one typed `runScientificJob()` RPC serializes a full job per named lane;
- request validation, bounded response buffering, and response validation all
  complete before cleanup;
- a drained lane sends exactly one graceful stop, verifies a terminal state,
  then makes at most one destroy fallback;
- a queued successor prevents a predecessor from tearing down the shared lane;
- failures follow the same drained-lane cleanup path;
- pool size and `max_instances` remain `2`; no image, migration, secret,
  tenant data model, or production binding changes are included;
- the package idle hook remains a diagnostic fallback rather than the only
  lifecycle mechanism.

## Required RC7 Evidence

Before RC7 may replace RC6 for staging, CI and staging must demonstrate:

1. lane serialization and one-stop/one-destroy bounded cleanup tests;
2. worker typecheck and Cloud Runtime dry build;
3. native scientific image tests through the existing GitHub Linux workflow;
4. one RC7 staging canary with explicit cleanup and released capacity;
5. canonical full staging revalidation and a final capacity check.

No production deployment, production DNS mutation, or public cutover is
authorized by this incident record.
