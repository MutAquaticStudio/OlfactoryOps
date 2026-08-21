import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentRunsApiBase, createAgentOperationKeyCache, loadAgentConfirmationPreview, loadAgentEvidence } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('agent runtime client protocol', () => {
  it('derives the compatibility run endpoint from the Phase 9 catalog endpoint', () => {
    expect(agentRunsApiBase('/api/v1/v2/agent-runtime')).toBe('/api/v1/v2/agent-runs')
    expect(agentRunsApiBase('https://api.example.test/api/v1/v2/agent-runtime/')).toBe('https://api.example.test/api/v1/v2/agent-runs')
  })

  it('retains the same mutation key until the persisted operation has reconciled', () => {
    const cache = createAgentOperationKeyCache()
    const first = cache.acquire('run.confirm.run_1.confirm_1', '{"decision":"APPROVE"}')

    expect(cache.acquire('run.confirm.run_1.confirm_1', '{"decision":"APPROVE"}')).toBe(first)

    cache.settle('run.confirm.run_1.confirm_1', '{"decision":"APPROVE"}')
    expect(cache.acquire('run.confirm.run_1.confirm_1', '{"decision":"APPROVE"}')).not.toBe(first)
  })

  it('projects the run-evidence envelope without exposing raw metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      evidence: {
        runId: 'run_1',
        lineage: [{
          id: 'lineage_1', sourceKind: 'RUN_INPUT', sourceRef: 'run_1', targetKind: 'TOOL_OUTPUT', targetRef: 'tool_1',
          relationType: 'PRODUCED', sourceContentHash: 'source-hash', targetContentHash: 'target-hash', metadata: { secret: 'not-rendered' }, createdAt: '2026-08-10T10:00:00.000Z',
        }],
        providerUsage: [{
          id: 'usage_1', providerKey: 'none', modelIdentifier: 'not-configured', usageStatus: 'NOT_CONFIGURED',
          requestHash: 'request-hash', responseHash: 'response-hash', inputTokens: 12, outputTokens: 0, totalCostMicros: '0', createdAt: '2026-08-10T10:01:00.000Z',
        }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const evidence = await loadAgentEvidence('https://api.example.test/api/v1/v2/agent-runtime', 'run_1')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.test/api/v1/v2/agent-runs/run_1/evidence')
    expect(evidence).toEqual({
      runId: 'run_1',
      lineage: [{
        id: 'lineage_1', sourceKind: 'RUN_INPUT', sourceRef: 'run_1', targetKind: 'TOOL_OUTPUT', targetRef: 'tool_1',
        relationType: 'PRODUCED', sourceContentHash: 'source-hash', targetContentHash: 'target-hash', createdAt: '2026-08-10T10:00:00.000Z',
      }],
      providerUsage: [{
        id: 'usage_1', providerKey: 'none', modelIdentifier: 'not-configured', usageStatus: 'NOT_CONFIGURED',
        requestHash: 'request-hash', responseHash: 'response-hash', inputTokens: 12, outputTokens: 0, totalCostMicros: '0', createdAt: '2026-08-10T10:01:00.000Z',
      }],
    })
  })

  it('whitelists only bounded confirmation context and evidence hashes', async () => {
    const actionHash = 'a'.repeat(64)
    const evidenceHash = 'b'.repeat(64)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      preview: {
        runId: 'run_1', confirmationId: 'confirm_1', actionKey: 'CANDIDATE_SAVE_DRAFT', status: 'PENDING',
        candidateId: 'candidate_1', formulaProjectId: 'formula_project_1', actionHash, initiatorUserId: 'user_1',
        evidenceHashes: [{ kind: 'RUN_INPUT', hash: evidenceHash, metadata: { rawPrompt: 'must not render' } }],
        actionPayload: { composition: [{ materialId: 'secret-material', percentage: 100 }] },
        rawPrompt: 'must not render', authorization: 'must not render', secret: 'must not render',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const preview = await loadAgentConfirmationPreview('https://api.example.test/api/v1/v2/agent-runtime', 'run_1', 'confirm_1')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.test/api/v1/v2/agent-runs/run_1/confirmations/confirm_1/preview')
    expect(preview).toEqual({
      runId: 'run_1', confirmationId: 'confirm_1', actionKey: 'CANDIDATE_SAVE_DRAFT', status: 'PENDING',
      candidateId: 'candidate_1', formulaProjectId: 'formula_project_1', actionHash, initiatorUserId: 'user_1',
      evidenceHashes: [{ kind: 'RUN_INPUT', hash: evidenceHash }],
    })
    expect(JSON.stringify(preview)).not.toMatch(/composition|prompt|authorization|secret/i)
  })
})
