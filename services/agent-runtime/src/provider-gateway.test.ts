import { describe, expect, it } from 'vitest'
import { NotConfiguredFormulaLlmGateway } from './provider-gateway.js'

describe('NotConfiguredFormulaLlmGateway', () => {
  it('returns an honest provider state without a synthetic completion', async () => {
    const result = await new NotConfiguredFormulaLlmGateway().research({ correlationId: 'corr-test', workflowKey: 'design-studio/1', toolContextHash: 'a'.repeat(64) })
    expect(result).toMatchObject({ status: 'NOT_CONFIGURED', provider: 'NONE', model: null })
  })
})
