import { describe, expect, it } from 'vitest'

import { inspectPublicAcceptanceRun, verifyProductionLiveFinalization } from './verify-v2-production-live-finalization.mjs'

const runId = '32453125941'
const now = Date.parse('2026-08-21T06:08:00Z')
const successfulRun = {
  id: Number(runId),
  name: 'V2 Production Public Acceptance',
  event: 'workflow_dispatch',
  head_branch: 'main',
  status: 'completed',
  conclusion: 'success',
  updated_at: '2026-08-21T06:06:30Z',
}

describe('production live finalization', () => {
  it('accepts only a fresh successful main public acceptance run', () => {
    expect(inspectPublicAcceptanceRun(successfulRun, { runId, now })).toEqual({ pass: true, state: 'READY' })
  })

  it('fails closed for a stale or non-production-acceptance run', () => {
    expect(inspectPublicAcceptanceRun({ ...successfulRun, updated_at: '2026-08-21T01:00:00Z' }, { runId, now })).toEqual({ pass: false, state: 'RUN_STALE' })
    expect(inspectPublicAcceptanceRun({ ...successfulRun, name: 'unexpected' }, { runId, now })).toEqual({ pass: false, state: 'RUN_IDENTITY_INVALID' })
  })

  it('emits only bounded evidence without the raw run payload', () => {
    const output = []
    const result = verifyProductionLiveFinalization({
      environment: { PUBLIC_ACCEPTANCE_RUN_ID: runId, PUBLIC_ACCEPTANCE_RUN_FILE: 'fixture.json' },
      readFile: () => JSON.stringify({ ...successfulRun, diagnostic: 'do-not-emit' }),
      emit: (line) => output.push(line),
      now,
    })

    expect(result).toEqual({ pass: true, state: 'READY' })
    expect(output).toEqual([
      'PUBLIC_ACCEPTANCE_RUN_VERIFIED=PASS',
      'PUBLIC_ACCEPTANCE_RUN_STATE=READY',
      `PUBLIC_ACCEPTANCE_RUN_ID=${runId}`,
    ])
    expect(JSON.stringify(output)).not.toContain('do-not-emit')
  })
})
