# Production RC1 Staging Revalidation

Status: PASS

## Verified candidate

| Field | Evidence |
| --- | --- |
| Release branch | `codex/v2-production-go-live` |
| Release SHA | `342f53f4b4aa812e853a2005899049c822d3426e` |
| Candidate tag | `v2-production-rc1` |
| Staging workflow | `V2 Production RC Staging Revalidation` run `31577515686` |
| Staging deployment | API Worker, Tenant Router, Cloud Runtime, and beta Pages completed successfully for the exact SHA. |

## Acceptance result

| Gate | Result |
| --- | --- |
| Canonical `/login` and `/signup` | PASS |
| `/v2/login` and `/v2/signup` compatibility routes | PASS |
| Public V2 Worker route parity | PASS, 163/163 |
| API Worker to Hyperdrive RLS | PASS |
| Tenant isolation and direct cross-tenant denial | PASS |
| Twelve tenant roles | PASS |
| Platform Owner, tenant-owner denial, lifecycle, entitlement, audit and disabled-operator controls | PASS |
| Queue, Workflow, private Scientific Container and R2 bounded smoke | PASS |
| Known and unknown tenant hostname TLS/browser routing | PASS |

This evidence revalidates staging only. It does not authorize production
migrations, DNS changes, candidate deployment, or public cutover.

## Remaining production gates

- `ROTATE_EXPOSED_PRODUCTION_RUNTIME_SECRETS_BEFORE_FIRST_PRODUCTION_DEPLOY = YES`
- `PRODUCTION_DATA_GATE = BLOCKED_LEGACY_D1_DECISION`
- Production PostgreSQL migration, RLS/runtime-role validation, backup evidence,
  Platform Owner ceremony with MFA enrollment, and isolated production-candidate
  smoke remain unperformed.
- `PRODUCTION_DEPLOYED = NO`
