import { describe, expect, it } from 'vitest'
import {
  AGENT_PROTOCOL_VERSION,
  agentNodeDefinitions,
  createAgentRunSnapshot,
  reduceAgentRuntimeEvent,
} from './agentRuntime'

const runId = '67c0f8be-6f4b-465d-b8e4-25d84c0b6681'
const tenantId = 'org-test'

function event(sequence: number, type: 'run.created' | 'node.completed' | 'artifact.created', payload: Record<string, unknown>) {
  return {
    protocolVersion: AGENT_PROTOCOL_VERSION,
    eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    tenantId,
    runId,
    sequence,
    type,
    timestamp: '2026-07-29T00:00:00.000Z',
    payload,
  } as const
}

describe('agent runtime reducer', () => {
  it('reconstructs node and artifact state from persisted events', () => {
    let snapshot = createAgentRunSnapshot(runId)
    snapshot = reduceAgentRuntimeEvent(snapshot, event(1, 'run.created', { status: 'QUEUED' }))
    snapshot = reduceAgentRuntimeEvent(snapshot, event(2, 'node.completed', {
      nodeId: 'node-1', nodeType: 'analyze_brief', status: 'COMPLETED', progress: 10,
    }))
    snapshot = reduceAgentRuntimeEvent(snapshot, event(3, 'artifact.created', {
      artifactId: 'artifact-1',
      artifact: {
        type: 'assumptions', version: 1,
        data: { assumptions: ['Workspace evidence only'], warnings: [] },
      },
    }))
    expect(snapshot.status).toBe('QUEUED')
    expect(snapshot.nodes['node-1']).toMatchObject({ status: 'COMPLETED', progress: 10 })
    expect(snapshot.artifacts).toHaveLength(1)
  })

  it('ignores duplicate and out-of-order event sequences until the gap is replayed', () => {
    const initial = reduceAgentRuntimeEvent(createAgentRunSnapshot(runId), event(1, 'run.created', { status: 'QUEUED' }))
    const outOfOrder = reduceAgentRuntimeEvent(initial, event(3, 'node.completed', { nodeId: 'node-3', nodeType: 'prepare_result', status: 'COMPLETED', progress: 90 }))
    const duplicate = reduceAgentRuntimeEvent(initial, event(1, 'run.created', { status: 'RUNNING' }))
    expect(outOfOrder).toBe(initial)
    expect(duplicate).toBe(initial)
  })

  it('rejects invalid artifact payloads without corrupting the snapshot', () => {
    const snapshot = reduceAgentRuntimeEvent(createAgentRunSnapshot(runId), event(1, 'artifact.created', { artifact: { type: 'not-registered' } }))
    expect(snapshot.artifacts).toEqual([])
  })

  it('keeps versioned workflow schemas available for every registered node', () => {
    expect(agentNodeDefinitions).toHaveLength(8)
    for (const node of agentNodeDefinitions) {
      expect(node.version).toBe(1)
      expect(node.inputSchema.safeParse({ brief: 'marine woody' }).success).toBe(true)
      expect(node.outputSchema.safeParse({ status: 'ok' }).success).toBe(true)
    }
  })
})
