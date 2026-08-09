import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { PlatformError, PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformContext } from '../../../services/platform/src/types.js'
import { DurableAgentService } from '../../../services/agent-runtime/src/durable-agent-service.js'
import { V2AgentRuntimeController } from './v2-agent-runtime.controller.js'

const context: PlatformContext = {
  organizationId: 'org_1', userId: 'user_1', sessionId: 'session_1', role: 'Perfumer', hostname: 'org.example.test',
}

function reply(raw?: EventEmitter) {
  return {
    raw,
    header: vi.fn(),
    hijack: vi.fn(),
  } as unknown as FastifyReply
}

function request(raw?: EventEmitter) {
  return {
    headers: { cookie: 'oo_v2_session=session-token', host: 'org.example.test' },
    raw,
  } as unknown as FastifyRequest
}

function platform(requirePermission = vi.fn().mockResolvedValue(undefined)) {
  return {
    cookieName: 'oo_v2_session',
    contextFromToken: vi.fn().mockResolvedValue({ context }),
    requirePermission,
  } as unknown as PlatformService
}

describe('V2AgentRuntimeController edge controls', () => {
  it('does not allocate SSE timers after the initial persisted replay requires resync', async () => {
    const raw = Object.assign(new EventEmitter(), {
      writableEnded: false,
      destroyed: false,
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(function end(this: { writableEnded: boolean }) { this.writableEnded = true }),
    })
    const agent = {
      replay: vi.fn().mockResolvedValue({
        run: { id: 'run_1', status: 'RUNNING' }, events: [], cursor: '0', resyncRequired: true,
      }),
    } as unknown as DurableAgentService
    const controller = new V2AgentRuntimeController(platform(), agent)
    const interval = vi.spyOn(global, 'setInterval')
    const timeout = vi.spyOn(global, 'setTimeout')

    await controller.stream(request(raw), 'run_1', '0', undefined, reply(raw))

    expect(raw.end).toHaveBeenCalledOnce()
    expect(interval).not.toHaveBeenCalled()
    expect(timeout).not.toHaveBeenCalled()
    interval.mockRestore()
    timeout.mockRestore()
  })

  it('requires both confirmation and Formula-sensitive access before loading a preview', async () => {
    const denied = new PlatformError('PERMISSION_DENIED', 'Formula-sensitive access is required.', 403)
    const requirePermission = vi.fn().mockImplementation(async (_context: PlatformContext, permission: string) => {
      if (permission === 'formula.viewSensitive') throw denied
    })
    const agent = { confirmationPreview: vi.fn() } as unknown as DurableAgentService
    const controller = new V2AgentRuntimeController(platform(requirePermission), agent)

    await expect(controller.confirmationPreview(request(), 'run_1', 'confirm_1', reply())).rejects.toBe(denied)

    expect(requirePermission).toHaveBeenNthCalledWith(1, context, 'agent.confirmWrite')
    expect(requirePermission).toHaveBeenNthCalledWith(2, context, 'formula.viewSensitive')
    expect((agent as unknown as { confirmationPreview: ReturnType<typeof vi.fn> }).confirmationPreview).not.toHaveBeenCalled()
  })

  it('projects a confirmation preview without forwarding an action payload or raw metadata', async () => {
    const actionHash = 'a'.repeat(64)
    const evidenceHash = 'b'.repeat(64)
    const agent = {
      confirmationPreview: vi.fn().mockResolvedValue({
        runId: 'run_1', confirmationId: 'confirm_1', actionKey: 'CANDIDATE_SAVE_DRAFT', status: 'PENDING',
        candidateId: 'candidate_1', formulaProjectId: 'formula_project_1', actionHash, initiatorUserId: 'user_1',
        evidenceHashes: [{ kind: 'RUN_INPUT', hash: evidenceHash, metadata: { prompt: 'do not expose' } }],
        actionPayload: { formulaComposition: [{ materialId: 'secret-material' }] }, rawPrompt: 'do not expose', secret: 'do not expose',
      }),
    } as unknown as DurableAgentService
    const controller = new V2AgentRuntimeController(platform(), agent)

    const result = await controller.confirmationPreview(request(), 'run_1', 'confirm_1', reply())

    expect(result).toEqual({
      preview: {
        runId: 'run_1', confirmationId: 'confirm_1', actionKey: 'CANDIDATE_SAVE_DRAFT', status: 'PENDING',
        candidateId: 'candidate_1', formulaProjectId: 'formula_project_1', actionHash, initiatorUserId: 'user_1',
        evidenceHashes: [{ kind: 'RUN_INPUT', hash: evidenceHash }],
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/composition|prompt|secret/i)
  })
})
