import { describe, expect, it } from 'vitest'
import {
  agentDefinitionCreateRequestSchema,
  agentDefinitionVersionCreateRequestSchema,
  agentEventEnvelopeSchema,
  agentProviderUsageCreateRequestSchema,
  agentToolVersionCreateRequestSchema,
  agentWorkflowVersionCreateRequestSchema,
} from './agent-runtime'

const hash = 'a'.repeat(64)
const published = { status: 'PUBLISHED' as const, publishedAt: '2026-08-10T00:00:00.000Z' }
const schema = { schemaVersion: '1.0.0', jsonSchema: { type: 'object', additionalProperties: false } }

describe('Phase 9 agent runtime contracts', () => {
  it('marks system bootstrap records explicitly and does not accept tenant spoofing', () => {
    expect(agentDefinitionCreateRequestSchema.safeParse({
      agentKey: 'formula-research',
      displayName: 'Formula research',
      sourceKind: 'SYSTEM',
      bootstrapKey: 'formula-research',
    }).success).toBe(true)

    expect(agentDefinitionCreateRequestSchema.safeParse({
      agentKey: 'formula-research',
      displayName: 'Formula research',
      sourceKind: 'SYSTEM',
    }).success).toBe(false)

    expect(agentDefinitionCreateRequestSchema.safeParse({
      agentKey: 'tenant-research',
      displayName: 'Tenant research',
      bootstrapKey: 'formula-research',
    }).success).toBe(false)
  })

  it('uses a server-owned template reference and requires publication evidence for runnable versions', () => {
    const base = {
      agentDefinitionId: 'agent-1',
      versionNumber: 1,
      protocolVersion: 'agent-runtime/v1',
      instructionTemplate: { key: 'formula.research', version: '1.0.0', contentHash: hash },
      inputSchema: schema,
      outputSchema: schema,
      modelPolicy: { providerAllowlist: ['openai'], modelAllowlist: ['gpt-5'], maxInputTokens: 1000, maxOutputTokens: 500 },
      contentHash: hash,
      publication: published,
    }
    expect(agentDefinitionVersionCreateRequestSchema.safeParse(base).success).toBe(true)
    expect(agentDefinitionVersionCreateRequestSchema.safeParse({
      ...base,
      instructionTemplate: { ...base.instructionTemplate, prompt: 'Never persist this.' },
    }).success).toBe(false)
    expect(agentDefinitionVersionCreateRequestSchema.safeParse({ ...base, publication: { status: 'PUBLISHED' } }).success).toBe(false)
  })

  it('requires explicit confirmation for mutating tools', () => {
    const base = {
      toolId: 'tool-1',
      versionNumber: 1,
      mode: 'MUTATING',
      adapterKey: 'formula.candidate_save_draft',
      requiredPermissions: ['formula.edit', 'production.finishedGoods.view'],
      inputSchema: schema,
      outputSchema: schema,
      timeoutMs: 5_000,
      retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableCodes: [] },
      confirmationPolicy: { required: true, expiresInSeconds: 3_600 },
      contentHash: hash,
      publication: published,
    }
    expect(agentToolVersionCreateRequestSchema.safeParse(base).success).toBe(true)
    expect(agentToolVersionCreateRequestSchema.safeParse({ ...base, confirmationPolicy: { required: false } }).success).toBe(false)
    expect(agentToolVersionCreateRequestSchema.safeParse({ ...base, adapterKey: 'production.release' }).success).toBe(false)
  })

  it('keeps workflow graphs and bindings deterministic', () => {
    const base = {
      workflowId: 'workflow-1',
      versionNumber: 1,
      agentDefinitionVersionId: 'agent-version-1',
      policyVersionId: 'policy-version-1',
      nodes: [{ key: 'research', kind: 'AGENT' }, { key: 'lookup', kind: 'TOOL' }, { key: 'done', kind: 'TERMINAL' }],
      edges: [{ from: 'research', to: 'lookup' }, { from: 'lookup', to: 'done' }],
      toolBindings: [{ nodeKey: 'lookup', toolVersionId: 'tool-version-1' }],
      inputSchema: schema,
      outputSchema: schema,
      contentHash: hash,
      publication: published,
    }
    expect(agentWorkflowVersionCreateRequestSchema.safeParse(base).success).toBe(true)
    expect(agentWorkflowVersionCreateRequestSchema.safeParse({ ...base, edges: [{ from: 'research', to: 'missing' }] }).success).toBe(false)
    expect(agentWorkflowVersionCreateRequestSchema.safeParse({ ...base, toolBindings: [{ nodeKey: 'research', toolVersionId: 'tool-version-1' }] }).success).toBe(false)
    expect(agentWorkflowVersionCreateRequestSchema.safeParse({ ...base, toolBindings: [] }).success).toBe(false)
  })

  it('keeps event and provider evidence metadata-only', () => {
    const event = {
      eventId: 'event-1',
      runId: 'run-1',
      sequence: 1,
      eventType: 'run.created',
      eventSchemaVersion: '1.0.0',
      correlationId: 'corr-1',
      payload: { status: 'QUEUED' },
    }
    expect(agentEventEnvelopeSchema.safeParse(event).success).toBe(true)
    expect(agentEventEnvelopeSchema.safeParse({ ...event, payload: { metadata: { system_prompt: 'secret' } } }).success).toBe(false)

    const usage = {
      providerKey: 'openai',
      modelIdentifier: 'gpt-5',
      usageStatus: 'RECORDED',
      requestHash: hash,
      responseHash: hash,
      startedAt: '2026-08-10T00:00:00.000Z',
      completedAt: '2026-08-10T00:00:01.000Z',
      correlationId: 'corr-1',
    }
    expect(agentProviderUsageCreateRequestSchema.safeParse(usage).success).toBe(true)
    expect(agentProviderUsageCreateRequestSchema.safeParse({ ...usage, responseHash: undefined }).success).toBe(false)
  })
})
