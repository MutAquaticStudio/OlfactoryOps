import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { compileAgentToolRegistry } from './tool-registry.js'
import { compileAgentWorkflow, runnableWorkflowNodes } from './workflow-compiler.js'

const registry = () => compileAgentToolRegistry([{
  definition: {
    tool: { name: 'material.search', version: '1.0.0' }, description: 'Search tenant materials.', mode: 'READ_ONLY', permissions: [{ permissionKey: 'materials.view', required: true }],
    input: { schemaVersion: 'tool/1', jsonSchema: { type: 'object' } }, output: { schemaVersion: 'tool/1', jsonSchema: { type: 'object' } }, timeout: { timeoutMs: 1_000 }, retry: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] }, confirmation: { required: false }, auditEventType: 'agent.tool.called',
  }, inputSchema: z.object({}).strict(), outputSchema: z.object({}).strict(), maxInputBytes: 1_024, maxOutputBytes: 1_024, execute: async () => ({}),
}])

const configuration = () => ({
  definition: { id: 'definition_1', key: 'formula-research', displayName: 'Formula Research', status: 'ACTIVE' as const, policyVersion: 'policy/1', defaultVersion: '1.0.0', metadata: {} },
  version: {
    id: 'version_1', definitionId: 'definition_1', version: '1.0.0', status: 'PUBLISHED' as const, policyVersion: 'policy/1', toolManifest: [{ name: 'material.search', version: '1.0.0' }],
    workflow: { workflowKey: 'formula-research/1', schemaVersion: 'workflow/1', nodes: [
      { key: 'search', kind: 'TOOL' as const, toolKey: 'material.search', dependsOn: [], inputSchemaVersion: 'tool/1', outputSchemaVersion: 'tool/1', timeoutMs: 1_000, maxAttempts: 1 },
      { key: 'summary', kind: 'ARTIFACT' as const, artifactType: 'research_summary', dependsOn: ['search'], inputSchemaVersion: 'artifact/1', outputSchemaVersion: 'artifact/1', timeoutMs: 1_000, maxAttempts: 1 },
    ] },
  },
  policy: { id: 'policy_1', definitionId: 'definition_1', version: 'policy/1', status: 'ACTIVE' as const, allowedToolKeys: ['material.search'], allowedProviderKeys: [], maxRunsPerActor: 2, maxRunsPerTenant: 10, metadata: {} },
})

describe('agent workflow compiler', () => {
  it('pins a published definition, policy, and exact registered tool version', () => {
    const compiled = compileAgentWorkflow({ ...configuration(), registry: registry() })
    expect(compiled.nodes.map((node) => node.key)).toEqual(['search', 'summary'])
    expect(compiled.nodes[0]).toMatchObject({ toolKey: 'material.search', toolVersion: '1.0.0' })
    expect(compiled.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(runnableWorkflowNodes(compiled, new Map())).toHaveLength(1)
    expect(runnableWorkflowNodes(compiled, new Map([['search', 'SUCCEEDED']]))).toMatchObject([{ key: 'summary' }])
  })

  it('rejects a published workflow whose registered adapter version is unavailable', () => {
    const input = configuration()
    input.version.toolManifest = [{ name: 'material.search', version: '9.0.0' }]
    expect(() => compileAgentWorkflow({ ...input, registry: registry() })).toThrow('unavailable')
  })

  it('rejects an indirect cycle even if an unvalidated persisted workflow reaches the compiler', () => {
    const input = configuration()
    input.version.workflow.nodes[0]!.dependsOn = ['summary']
    expect(() => compileAgentWorkflow({ ...input, registry: registry() })).toThrow('cyclic')
  })

  it('pins an immutable workflow and policy snapshot against later runtime configuration drift', () => {
    const input = configuration()
    const compiled = compileAgentWorkflow({ ...input, registry: registry() })
    input.policy.allowedToolKeys.length = 0
    input.version.workflow.nodes[0]!.toolKey = 'inventory.visibility'
    expect(compiled.policy.allowedToolKeys).toEqual(['material.search'])
    expect(compiled.nodes[0]).toMatchObject({ toolKey: 'material.search', toolVersion: '1.0.0' })
    expect(Object.isFrozen(compiled.policy.allowedToolKeys)).toBe(true)
  })
})
