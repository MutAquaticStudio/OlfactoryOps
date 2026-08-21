# OlfactoryOps pre-V2 baseline

Snapshot captured before pre-V2 cleanup edits.

| Field | Value |
|---|---|
| Repository | `MutAquaticStudio/OlfactoryOps` (remote currently `MutAquaticStudio/OlfactoryOps-NorthStar`) |
| Working branch | `codex/formula-intelligence-hardening` |
| HEAD commit | `356b4e078247dcb6bed6a8a7a9b6e64de6afa141` (`fix: bound session restoration`) |
| Snapshot ref | `refs/heads/archive/pre-v2-legacy-final` at the same commit |
| Capture date | `2026-08-08` (Asia/Bangkok) |
| Migration head | `0044_email_verification.sql` (historical chain; no migration will be edited) |
| Working tree | Dirty before cleanup; pre-existing user changes are preserved and are out of scope for rollback |
| Known local database | Wrangler local D1 binding `olfactoryops-production` |
| Known test database | D1 `olfactoryops-test` (`a5144134-3f58-4f6b-b516-05789ef05fbc`) |
| Known production database | D1 `olfactoryops-production` (`d70bc633-a4d8-4898-8149-d795032cf497`) |
| Known test runtime | Worker `olfactoryops-api-test`, tenant router test, Pages `test.labofscents.pages.dev` |
| Known production runtime | Worker `olfactoryops-api`, tenant router, Pages `labofscents.pages.dev` / tenant hostnames |
| External credentials | Not read or changed during cleanup |

## Safety rules

- Historical migrations remain immutable evidence.
- No production D1 or customer records are deleted by this cleanup.
- Real/unknown tenant formulas, materials, lots, documents, orders, trials and audit evidence remain intact.
- Legacy source is archived or disabled at the runtime boundary before any source removal.
- V2 scientific-core implementation is explicitly out of scope.

## Pre-existing dirty paths

The baseline includes the dirty worktree shown by `git status --short` at capture time. Those changes include release scripts, QA fixtures, frontend/API hardening, screenshots and reports. They are not reset, squashed or silently reverted.
