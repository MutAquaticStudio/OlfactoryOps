import { describe, expect, it, vi } from 'vitest'
import { agentEventStreamResponse } from './agent-stream.js'
import type { V2ApiServices } from './service-container.js'

const config = { publicHostname: 'api-beta.labofscents.org', publicPageHostname: 'beta.labofscents.org', tenantBaseDomain: 'api-beta.labofscents.org' }

function services(): V2ApiServices {
  const context = { userId: 'user_a', organizationId: 'org_a', sessionId: 'session_a', role: 'Owner' as const, hostname: 'tenant-a.api-beta.labofscents.org' }
  return {
    prisma: {} as V2ApiServices['prisma'],
    platform: {
      cookieName: 'oo_v2_session',
      contextFromToken: vi.fn(async () => ({ context })),
      requirePermission: vi.fn(async () => undefined),
    } as unknown as V2ApiServices['platform'],
    agent: {
      replay: vi.fn(async () => ({
        run: { id: 'run_a', status: 'RUNNING' },
        events: [{ id: 'event_a', sequence: 1, type: 'run.started', payload: { status: 'RUNNING' }, createdAt: '2026-08-11T00:00:00.000Z' }],
        cursor: '1',
        resyncRequired: false,
      })),
    } as unknown as V2ApiServices['agent'],
  } as V2ApiServices
}

describe('Worker Agent event stream', () => {
  it('replays persisted events through the exact trusted tenant origin', async () => {
    const close = vi.fn(async () => undefined)
    const response = await agentEventStreamResponse({
      request: new Request('https://api-beta.labofscents.org/api/v1/v2/agent-runs/run_a/stream?afterSequence=0', {
        headers: { Origin: 'https://tenant-a.api-beta.labofscents.org', Cookie: 'oo_v2_session=session-token' },
      }),
      services: services(),
      config,
      onClose: close,
    })
    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toContain('text/event-stream')
    expect(response?.headers.get('access-control-allow-origin')).toBe('https://tenant-a.api-beta.labofscents.org')
    const reader = response!.body!.getReader()
    const first = await reader.read()
    const second = await reader.read()
    const decoder = new TextDecoder()
    expect(decoder.decode(first.value)).toContain('event: connection.snapshot')
    expect(decoder.decode(second.value)).toContain('event: agent.event')
    await reader.cancel()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('requires an exact staging Origin before resolving a tenant session', async () => {
    const value = services()
    const response = await agentEventStreamResponse({
      request: new Request('https://api-beta.labofscents.org/api/v1/v2/agent-runs/run_a/stream', { headers: { Cookie: 'oo_v2_session=session-token' } }),
      services: value,
      config,
      onClose: async () => undefined,
    })
    expect(response?.status).toBe(403)
    expect(value.platform.contextFromToken).not.toHaveBeenCalled()
  })
})
