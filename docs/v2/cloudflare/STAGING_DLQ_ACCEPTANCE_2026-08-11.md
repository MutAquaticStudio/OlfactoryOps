# Staging DLQ Acceptance - 2026-08-11

## Scope

This evidence is restricted to one deterministic, authenticated,
staging-only `STAGING_DLQ_TERMINAL_FAILURE_PROBE`. The protected GitHub
dispatcher created it with a unique job and correlation ID. The fixture cannot
be submitted from an unauthenticated public request and its consumer path
deliberately fails every delivery before any business, Formula, inventory, or
customer mutation.

| Field | Evidence |
| --- | --- |
| Dispatcher run | `31529596072` (`V2 Staging Scientific DLQ Acceptance Probe`) |
| Verified application source | `4da6dfa061fc5ca818238c555e3320fc77a858b5` |
| Job ID | `job_staging_dlq_b474be1295004ea8a3a12d25b49e78e1` |
| Correlation ID | `corr_staging_dlq_b474be1295004ea8a3a12d25b49e78e1` |
| Source queue | `olfactoryops-v2-scientific-staging` |
| Dead-letter queue | `olfactoryops-v2-scientific-dlq-staging` |
| DLQ message ID | `76e1b12eb4ea8d2c244372ec413f8a5e` |
| Configured retry policy | `max_retries=3` |

## Delivery Timeline

| Event | Timestamp (UTC) | Status |
| --- | --- | --- |
| Source queue submission | `2026-08-11T19:47:54.509Z` | PASS |
| Deliberate delivery failure, attempt 1 | `2026-08-11T19:48:02.472Z` | PASS |
| Deliberate delivery failure, attempt 2 | `2026-08-11T19:48:08.873Z` | PASS |
| Deliberate delivery failure, attempt 3 | `2026-08-11T19:48:17.985Z` | PASS |
| Terminal job verification | `2026-08-11T19:48:20.121Z` | PASS |
| Exact message observed in DLQ | `2026-08-11T19:48:29.411Z` | PASS |
| Exact test-reference cleanup | `2026-08-11T19:48:32Z` | PASS |

The DLQ timestamp is represented by the evidence payload's epoch value
`1786477709411`; the displayed ISO timestamp is the same event normalized for
human review.

## Acceptance Matrix

| Gate | Status | Evidence |
| --- | --- | --- |
| TERMINAL_FAILURE_FIXTURE_SUBMITTED | PASS | Exactly one internal fixture was submitted through the scientific source queue. |
| QUEUE_RETRY_POLICY_EXECUTED | PASS | Three natural consumer deliveries failed; no direct DLQ write was used. |
| TERMINAL_FAILURE_REACHED_DLQ | PASS | The exact fixture message arrived in the configured scientific DLQ. |
| TERMINAL_JOB_STATUS | PASS | Job status is `FAILED` after attempt 3. |
| BUSINESS_SIDE_EFFECTS | PASS | `0`; no Formula, inventory, customer, or persistent business artifact was created. |
| SOURCE_QUEUE_FINAL_BACKLOG | PASS | `0`. |
| TEST_DLQ_FINAL_BACKLOG | PASS | `0`; only the exact fixture reference was acknowledged/removed. |

The protected workflow uploaded artifact
`staging-dlq-probe-evidence-4da6dfa061fc5ca818238c555e3320fc77a858b5`
containing the bounded JSON evidence. It contains no secret value or customer
data.
