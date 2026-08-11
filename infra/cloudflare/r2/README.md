# R2 Artifact Storage (Cloud-native)

## Purpose

- Store immutable/versioned large artifacts outside Worker edge runtime limits.
- Persist references in PostgreSQL, not raw payloads only.

## Current intended artifact classes

- Scientific output artifacts and reports
- Evidence packages and export bundles
- RAG chunk previews and signed bundle snapshots
- Uploaded binary snapshots used by outbox/notification workflows

## Key rules (checkpoint)

- Tenant-scoped object keys and organization metadata required.
- Persist at least:
  - `organizationId`
  - `artifactFamily`
  - `contentHash`
  - `mimeType`
- Keep only references (`bucket`, `key`, `version`, `contentHash`) in domain rows.
- No business truth (master data, ledger, approval rights) is stored in R2.

## Bucket naming (examples)

- `olfactoryops-v2-artifacts-staging`

## Acceptance status

- Architecture docs: PASS
- Private Worker adapter: PASS
- Private staging bucket: PASS
- Deployed Worker binding and live tenant read/write smoke: BLOCKED
