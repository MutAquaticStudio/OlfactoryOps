import { describe, expect, it } from 'vitest'
import { NotConfiguredAgentProviderGateway, NotConfiguredFormulaLlmGateway, ScriptedAgentProviderGateway } from './provider-gateway.js'

describe('NotConfiguredFormulaLlmGateway', () => {
  it('returns an honest provider state without a synthetic completion', async () => {
    const result = await new NotConfiguredFormulaLlmGateway().research({ correlationId: 'corr-test', workflowKey: 'design-studio/1', toolContextHash: 'a'.repeat(64) })
    expect(result).toMatchObject({ status: 'NOT_CONFIGURED', provider: 'NONE', model: null })
  })

  it('uses only deterministic scripted structured artifacts and never invokes a network provider', async () => {
    const input = { providerKey: 'scripted', model: 'fixture', correlationId: 'corr-scripted', workflowKey: 'formula-research/1', workflowVersion: '1.0.0', contextHash: 'a'.repeat(64), toolContextHash: 'b'.repeat(64) }
    const scripted = await new ScriptedAgentProviderGateway({
      scripted: { status: 'COMPLETED', provider: 'SCRIPTED', model: 'fixture', responseHash: 'c'.repeat(64), metadata: { latencyMs: 1 }, structuredArtifact: { recommendation: 'Review cited material evidence.' } },
    }).invoke(input)
    expect(scripted).toMatchObject({ status: 'COMPLETED', provider: 'SCRIPTED', correlationId: 'corr-scripted' })
    expect(scripted.structuredArtifact).toEqual({ recommendation: 'Review cited material evidence.' })
    await expect(new ScriptedAgentProviderGateway({ scripted: { status: 'COMPLETED', provider: 'SCRIPTED', model: 'fixture', responseHash: 'd'.repeat(64), metadata: {}, structuredArtifact: { reasoning: 'hidden' } } }).invoke(input)).rejects.toThrow('reasoning')
    const unavailable = await new NotConfiguredAgentProviderGateway().invoke(input)
    expect(unavailable).toMatchObject({ status: 'NOT_CONFIGURED', provider: 'NONE' })
    expect(unavailable.structuredArtifact).toBeUndefined()
  })
})
