import { execFileSync } from 'node:child_process'

import { expect, test } from 'vitest'

test('RC10 smoke tenant selection is production-gated and read-only', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/verify-v2-rc10-production-smoke-tenant-selection-workflow.mjs'],
    { encoding: 'utf8' },
  )

  expect(output).toContain('PRODUCTION_SMOKE_TENANT_SELECTION_WORKFLOW=PASS')
  expect(output).toContain('PRODUCTION_SMOKE_TENANT_SELECTION_BOUNDARY=PASS')
})
