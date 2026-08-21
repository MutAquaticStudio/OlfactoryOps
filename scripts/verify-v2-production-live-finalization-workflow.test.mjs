import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const verifier = fileURLToPath(new URL('./verify-v2-production-live-finalization-workflow.mjs', import.meta.url))

describe('production live finalization workflow contract', () => {
  it('requires protected exact-RC10 finalization without force mutation', () => {
    const output = execFileSync(process.execPath, [verifier], { encoding: 'utf8' })
    expect(output).toBe('RC10_PRODUCTION_LIVE_FINALIZATION_WORKFLOW=PASS\n')
  })
})
