# Remote Build and CI for Cloud-Native Runtime

## Scope

This document defines the CI checkpoints for:
- Cloudflare Workers (web + tenant router + API worker)
- Scientific container builds for feature/model workloads
- Cloud verification smoke checks

## Workers build baseline

- Frontend, API Worker, and Tenant Router builds run in GitHub Actions.
- Use standard `wrangler deploy --dry-run` style checks on non-production branches.
- Production deploy remains manually gated and outside this checkpoint.

## Scientific container build

Workflow: `.github/workflows/scientific-container.yml`

The workflow deliberately separates the two trust boundaries:

1. `scientific-images` checks out the exact SHA, builds Linux/amd64 images,
   runs the feature/model fixtures and provenance checks, and uploads only
   non-sensitive CI evidence. It has no `staging` Environment and no
   Cloudflare credential reference.
2. `publish-scientific-images` depends on that build and runs only after the
   explicit staging publish confirmation. It alone enters `environment:
   staging`, rebuilds the immutable images, pushes them to Cloudflare, and
   uploads immutable image evidence.

The staging render command accepts only immutable `sha256:` digests, never a
mutable tag.

If the configured staging token is missing a Container Registry permission,
publishing stops at the Cloudflare authorization error. It must not fall back
to a broader repository secret, a local credential, or production token.

## Current Staging Evidence

| Gate | Status | Evidence |
| --- | --- | --- |
| Staging secret boundary | PASS | Cloudflare credentials are referenced only by `publish-scientific-images`, which uses the `staging` Environment. |
| Remote Linux scientific build | PASS | GitHub run `31480933921` completed the feature and model compatibility checks for SHA `7cabd0a1bfc42366404e446ea6bd305d79fd5a36`; its publish job was skipped because `push_images=false`. |
| Staging Container Registry publish | BLOCKED | The environment-scoped Cloudflare token returned `403 Forbidden` from `wrangler containers push`; Cloudflare mutations stopped. It needs account `Containers: Write` without changing the staging Environment boundary. |
| Staging API Worker publish | BLOCKED | GitHub run `31480119688` reached Wrangler but the staging token returned Cloudflare authentication error `10000` before any Worker mutation. The minimum required scope is account `Workers Scripts: Write` and zone `Workers Routes: Write` for `labofscents.org`. |
| Immutable image digest | BLOCKED | No image was accepted by the registry, so no digest may be recorded. |

The workflow does not build images on a developer Windows machine. It runs
Linux/amd64 builds, native feature tests, model compatibility tests, provenance
comparison, then `wrangler containers push` only on an explicitly requested
manual workflow dispatch with configured GitHub secrets.

## Cloud verification

Workflow: `.github/workflows/cloud-verification.yml`

Runs a gated verification set:
- manifest + docs checks
- non-prod worker build checks
- worker/router build checks
- optional smoke commands when credentials exist:
  - worker health endpoints
  - tenant-router pass-through
  - API `/health` and bounded science endpoint check

## Security in CI

- CI secrets only referenced by environment variable names, not committed.
- Do not print token values.
- Workflow fails fast on `npm run release:identity:check` and migration/doc checks.

## Non-production policy

- All deployment actions in CI are preview/test-oriented.
- No production traffic, DNS, or production PostgreSQL writes in this checkpoint.
