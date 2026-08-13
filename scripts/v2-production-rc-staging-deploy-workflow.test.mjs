import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/v2-production-rc-staging-deploy.yml', 'utf8')

describe('production RC staging deployment dispatcher', () => {
  it('is manual, staging-only, and accepts only the current immutable release candidate', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('environment: staging')
    expect(workflow).toContain('DEPLOY_TAGGED_PRODUCTION_RC_TO_STAGING')
    expect(workflow).toContain('test "$RELEASE_SHA" = "$(git rev-parse FETCH_HEAD)"')
    expect(workflow).toContain("git tag --points-at \"$RELEASE_SHA\" -l 'v2-production-rc*' | grep -qx 'v2-production-rc[0-9][0-9]*'")
    expect(workflow).toContain('cancel-in-progress: false')
  })

  it('deploys only staging surfaces with existing immutable images and no database secret', () => {
    expect(workflow).toContain('RELEASE_ENVIRONMENT: staging')
    expect(workflow).toContain('STAGING_HYPERDRIVE_ID: d7ac83bd79944e9dbd1f6eef30518dc3')
    expect(workflow).toContain('SCIENTIFIC_FEATURE_IMAGE_DIGEST: ${{ env.FEATURE_IMAGE_DIGEST }}')
    expect(workflow).toContain('SCIENTIFIC_MODEL_IMAGE_DIGEST: ${{ env.MODEL_IMAGE_DIGEST }}')
    expect(workflow).toContain('npx wrangler deploy --config "$CLOUD_RUNTIME_STAGING_CONFIG" --keep-vars')
    expect(workflow).toContain('npx wrangler pages deploy dist --project-name olfactoryops-beta --branch beta')
    expect(workflow).not.toContain('STAGING_DATABASE_URL')
    expect(workflow).not.toContain('environment: production')
  })

  it('does not run acceptance fixtures or perform a production deployment', () => {
    expect(workflow).not.toContain('verify-v2-staging-scientific.mjs')
    expect(workflow).not.toContain('verify-v2-staging-remote.mjs')
    expect(workflow).not.toContain('run-production-smoke.mjs')
    expect(workflow).toContain('STAGING_RC_DEPLOY=PASS')
  })
})
