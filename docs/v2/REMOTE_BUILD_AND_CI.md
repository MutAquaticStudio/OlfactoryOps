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

Expected pipeline:
1. checkout
2. node/npm setup and install
3. build container image for each scientific runtime
4. run scientific tests in container context (or deterministic compatibility tests)
5. run provenance/license checks
6. tag image with immutable git SHA
7. push to Cloudflare managed registry
8. record image tags and registry listing as build evidence; the staging render
   command accepts only immutable `sha256:` digests, never a mutable tag

If credentials are absent, the workflow reports:
`CLOUDFLARE_CI_CREDENTIALS = MANUAL_SETUP_REQUIRED`.

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
