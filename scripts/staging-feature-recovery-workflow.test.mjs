import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/v2-staging-feature-recovery.yml', 'utf8')
const config = readFileSync('wrangler.staging-feature-recovery.toml', 'utf8')

describe('staging feature recovery dispatcher', () => {
  it('is manual, staging-only, and always removes only the temporary worker', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('environment: staging')
    expect(workflow).toContain('if: always()')
    expect(workflow).toContain('oo-staging-feature-recovery')
    expect(workflow).toContain('workers/scripts/$RECOVERY_WORKER_NAME')
    expect(workflow).not.toContain('containers delete')
    expect(workflow).not.toMatch(/max_instances\s*=/)
    expect(workflow).not.toContain('production')
  })

  it('hard-codes the only two permitted target names and full ids', () => {
    for (const value of [
      'sciencejob_cdcc54472dad4869ac5ced448aa2d8f9',
      'a81ce16d83a0dc49ff25fc8befb815b1a587bbdf2013eb436ccde39abb67f94e',
      'sciencejob_b97a60d3aaab405f8e4612efb12e38bd',
      'd93296bfdb9e18b246708de0303f9b157e611855750e27dba4adbc4884ce699d',
    ]) expect(workflow).toContain(value)
    expect(workflow).toContain('RECOVER_ONLY_PROVEN_STALE_STAGING_FEATURE_CONTAINERS')
  })

  it('binds externally to the existing staging namespace without creating a Container application', () => {
    expect(config).toContain('workers_dev = true')
    expect(config).toContain('class_name = "ScientificFeatureContainer"')
    expect(config).toContain('script_name = "olfactoryops-v2-cloud-runtime-staging"')
    expect(config).not.toContain('[[containers]]')
    expect(config).not.toContain('[[migrations]]')
    expect(config).not.toContain('routes =')
  })
})
