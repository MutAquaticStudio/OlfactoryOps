import { describe, expect, it } from 'vitest'
import { agentWorkflowSchema, assertPublishedAgentVersion, validateToolDefinition } from './contracts'

const readTool = { tool: { name: 'materials.search', version: '1.0.0' }, description: 'Search authorized materials', mode: 'READ_ONLY', permissions: [{ permissionKey: 'materials.view', required: true }], input: { schemaVersion: '1', jsonSchema: { type: 'object' } }, output: { schemaVersion: '1', jsonSchema: { type: 'object' } }, timeout: { timeoutMs: 5000 }, retry: { maxAttempts: 2, backoffMs: 100, retryableErrors: ['TIMEOUT'] }, confirmation: { required: false }, auditEventType: 'agent.tool.called' }

describe('agent tool contract', () => {
  it('accepts allow-listed shape without allowing arbitrary execution fields', () => {
    expect(validateToolDefinition(readTool).mode).toBe('READ_ONLY')
  })

  it('requires permission and confirmation for mutating tools', () => {
    expect(() => validateToolDefinition({ ...readTool, mode: 'MUTATING', permissions: [], confirmation: { required: false } })).toThrow()
  })

  it('allows only candidate-save-draft as a confirmed domain write', () => {
    expect(() => validateToolDefinition({ ...readTool, tool: { name: 'inventory.adjust', version: '1.0.0' }, mode: 'MUTATING', confirmation: { required: true, expiresInSeconds: 300 } })).toThrow('candidate-save-draft')
    expect(validateToolDefinition({ ...readTool, tool: { name: 'formula.candidate_save_draft', version: '1.0.0' }, mode: 'MUTATING', confirmation: { required: true, expiresInSeconds: 300 } }).mode).toBe('MUTATING')
  })

  it('rejects unpublished, cyclic, or unallowlisted workflow configuration', () => {
    const workflow = agentWorkflowSchema.parse({
      workflowKey: 'formula-research/1', schemaVersion: 'workflow/1', nodes: [
        { key: 'search', kind: 'TOOL', toolKey: 'material.search', dependsOn: [], inputSchemaVersion: 'tool/1', outputSchemaVersion: 'tool/1', timeoutMs: 1000 },
        { key: 'summary', kind: 'ARTIFACT', artifactType: 'research_summary', dependsOn: ['search'], inputSchemaVersion: 'artifact/1', outputSchemaVersion: 'artifact/1', timeoutMs: 1000 },
      ],
    })
    expect(() => agentWorkflowSchema.parse({ ...workflow, nodes: [{ ...workflow.nodes[0], dependsOn: ['missing'] }] })).toThrow('Unknown workflow dependency')
    expect(() => agentWorkflowSchema.parse({
      ...workflow,
      nodes: [
        { ...workflow.nodes[0], dependsOn: ['summary'] },
        { ...workflow.nodes[1], dependsOn: ['search'] },
      ],
    })).toThrow('must not contain a cycle')
    expect(() => assertPublishedAgentVersion(
      { id: 'definition_1', key: 'formula-research', displayName: 'Formula Research', status: 'ACTIVE', policyVersion: 'policy/1', defaultVersion: '1.0.0', metadata: {} },
      { id: 'version_1', definitionId: 'definition_1', version: '1.0.0', status: 'PUBLISHED', workflow, toolManifest: [{ name: 'material.search', version: '1.0.0' }], policyVersion: 'policy/1' },
      { id: 'policy_1', definitionId: 'definition_1', version: 'policy/1', status: 'ACTIVE', allowedToolKeys: [], allowedProviderKeys: [], maxRunsPerActor: 2, maxRunsPerTenant: 10, metadata: {} },
    )).toThrow('not allowed')
  })

  it('enforces the cumulative tool-attempt ceiling, not only the node count', () => {
    expect(() => agentWorkflowSchema.parse({
      workflowKey: 'formula-research/1', schemaVersion: 'workflow/1',
      nodes: Array.from({ length: 8 }, (_, index) => ({
        key: `tool_${index}`, kind: 'TOOL', toolKey: 'material.search', dependsOn: [], inputSchemaVersion: 'tool/1', outputSchemaVersion: 'tool/1', timeoutMs: 1_000, maxAttempts: 2,
      })),
    })).toThrow('at most 12 tools')
  })
})
