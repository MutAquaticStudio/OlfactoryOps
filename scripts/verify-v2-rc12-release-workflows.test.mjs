import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('RC12 lifecycle workflows remain immutable, main-owned, protected, and route-free', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-v2-rc12-release-workflows.mjs'], { encoding: 'utf8' })
  expect(output).toContain('RC12_RELEASE_WORKFLOW_CONTRACT=PASS')
  expect(output).toContain('RC12_CANDIDATE_PAGES_PROJECT_ROOT_ORIGIN_CONTRACT=PASS')
})
