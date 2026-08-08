import { describe, expect, it } from 'vitest'
import { validateToolDefinition } from './contracts'

const readTool = { tool: { name: 'materials.search', version: '1.0.0' }, description: 'Search authorized materials', mode: 'READ_ONLY', permissions: [{ permissionKey: 'materials.view', required: true }], input: { schemaVersion: '1', jsonSchema: { type: 'object' } }, output: { schemaVersion: '1', jsonSchema: { type: 'object' } }, timeout: { timeoutMs: 5000 }, retry: { maxAttempts: 2, backoffMs: 100, retryableErrors: ['TIMEOUT'] }, confirmation: { required: false }, auditEventType: 'agent.tool.called' }

describe('agent tool contract', () => {
  it('accepts allow-listed shape without allowing arbitrary execution fields', () => {
    expect(validateToolDefinition(readTool).mode).toBe('READ_ONLY')
  })

  it('requires permission and confirmation for mutating tools', () => {
    expect(() => validateToolDefinition({ ...readTool, mode: 'MUTATING', permissions: [], confirmation: { required: false } })).toThrow()
  })
})
