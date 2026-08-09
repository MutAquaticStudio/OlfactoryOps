import { describe, expect, it } from 'vitest'
import { PlatformError } from '../../platform/src/service.js'
import { z } from 'zod'
import { boundedToolPayload, compileAgentToolRegistry, formulaAgentToolPolicy } from './tool-registry.js'

describe('Formula agent tool registry', () => {
  it('allows only named read-only tools with bounded output', () => {
    expect(formulaAgentToolPolicy('material.search').destructive).toBe(false)
    expect(boundedToolPayload({ materials: ['one'] }, 100)).toEqual({ materials: ['one'] })
  })

  it('fails closed for arbitrary execution and oversized tool output', () => {
    expect(() => formulaAgentToolPolicy('sql.execute')).toThrow(PlatformError)
    expect(() => boundedToolPayload({ text: 'x'.repeat(100) }, 10)).toThrow(PlatformError)
  })

  it('compiles only registered typed adapters and applies policy, permission, and payload bounds', async () => {
    const registry = compileAgentToolRegistry([{
      definition: {
        tool: { name: 'material.search', version: '1.0.0' }, description: 'Search materials through the domain service.', mode: 'READ_ONLY',
        permissions: [{ permissionKey: 'materials.view', required: true }], input: { schemaVersion: 'tool/1', jsonSchema: { type: 'object' } }, output: { schemaVersion: 'tool/1', jsonSchema: { type: 'object' } },
        timeout: { timeoutMs: 1_000 }, retry: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] }, confirmation: { required: false }, auditEventType: 'agent.tool.called',
      },
      inputSchema: z.object({ query: z.string().min(1).max(20) }).strict(),
      outputSchema: z.object({ matches: z.array(z.string()) }).strict(),
      maxInputBytes: 1_024,
      maxOutputBytes: 1_024,
      execute: async (context, input) => {
        expect(context.organizationId).toBe('org_test')
        return { matches: [input.query] }
      },
    }])
    const permissions: string[] = []
    const context = {
      organizationId: 'org_test', actorUserId: 'user_test', runId: 'run_test', stepId: 'step_test', correlationId: 'corr_test', context: [],
      requirePermission: async (permission: string) => { permissions.push(permission) },
    }
    const result = await registry.invoke(context, { toolKey: 'material.search', value: { query: 'orris' }, allowedToolKeys: ['material.search'] })
    expect(result.output).toEqual({ matches: ['orris'] })
    expect(permissions).toEqual(['materials.view'])
    await expect(registry.invoke(context, { toolKey: 'material.search', value: { query: 'orris' }, allowedToolKeys: [] })).rejects.toMatchObject({ code: 'AGENT_TOOL_POLICY_DENIED' })
    await expect(registry.invoke(context, { toolKey: 'sql.execute', value: {}, allowedToolKeys: ['sql.execute'] })).rejects.toMatchObject({ code: 'AGENT_TOOL_DENIED' })
  })
})
