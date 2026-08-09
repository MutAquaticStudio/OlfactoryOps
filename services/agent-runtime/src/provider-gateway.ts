export type FormulaProviderStatus = 'NOT_CONFIGURED'
export type FormulaProviderResult = Readonly<{
  status: FormulaProviderStatus
  provider: 'NONE'
  model: null
  correlationId: string
  message: string
}>

/**
 * The provider boundary is deliberately server-only. Phase 6 ships without a
 * configured provider and never fabricates a completion, usage total, or
 * candidate. A future adapter must implement this interface behind secrets.
 */
export interface FormulaLlmGateway {
  research(input: Readonly<{ correlationId: string; workflowKey: string; toolContextHash: string }>): Promise<FormulaProviderResult>
}

export class NotConfiguredFormulaLlmGateway implements FormulaLlmGateway {
  async research(input: Readonly<{ correlationId: string; workflowKey: string; toolContextHash: string }>): Promise<FormulaProviderResult> {
    return {
      status: 'NOT_CONFIGURED',
      provider: 'NONE',
      model: null,
      correlationId: input.correlationId,
      message: 'No Formula Intelligence provider is configured for this environment.',
    }
  }
}
