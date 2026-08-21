import { inspectAgentTextSafety } from './context-safety.js'

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

export type AgentProviderStatus = 'NOT_CONFIGURED' | 'COMPLETED' | 'FAILED'
export type AgentProviderRequest = Readonly<{
  providerKey: string
  model: string | null
  correlationId: string
  workflowKey: string
  workflowVersion: string
  contextHash: string
  toolContextHash: string
}>
export type AgentProviderMetadata = Readonly<{
  providerRequestId?: string
  modelVersion?: string
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  costMicros?: number
  fallbackUsed?: boolean
}>
export type AgentProviderResult = Readonly<{
  status: AgentProviderStatus
  provider: string
  model: string | null
  correlationId: string
  metadata: AgentProviderMetadata
  /** Hash of the provider response retained by the adapter, never its body. */
  responseHash?: string
  /** A typed, workflow-owned artifact only; never raw responses or reasoning. */
  structuredArtifact?: Readonly<Record<string, unknown>>
  errorCode?: string
}>

export interface AgentProviderGateway {
  invoke(input: AgentProviderRequest): Promise<AgentProviderResult>
}

const BLOCKED_PROVIDER_FIELDS = new Set([
  'prompt', 'systemprompt', 'systemmessage', 'developermessage', 'instruction', 'messages', 'reasoning', 'chainofthought',
  'rawresponse', 'rawprovidererror', 'rawproviderpayload', 'rawcompletion', 'completion',
  'apikey', 'accesskey', 'authorization', 'secret', 'clientsecret', 'token', 'accesstoken', 'refreshtoken', 'sessiontoken',
  'password', 'credential', 'privatekey', 'cookie', 'bearer',
])
const HASH = /^[a-f0-9]{64}$/i
const PROVIDER_IDENTIFIER = /^[a-z][a-z0-9._-]{0,119}$/i
const MODEL_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/

function assertMetadataOnly(value: unknown, depth = 0): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) throw new Error('Provider structured artifacts must be bounded objects.')
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (BLOCKED_PROVIDER_FIELDS.has(key.replaceAll(/[^a-z]/gi, '').toLowerCase())) throw new Error(`Provider artifacts must not contain ${key}.`)
    if (typeof child === 'string') {
      if (child.length > 4_000) throw new Error('Provider artifacts must use bounded structured values.')
      if (inspectAgentTextSafety(child).unsafe) throw new Error('Provider artifacts must not contain unsafe prompt-like or credential-like text.')
    }
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        if (child.length > 100) throw new Error('Provider artifacts must use bounded arrays.')
        for (const entry of child) if (entry && typeof entry === 'object') assertMetadataOnly(entry, depth + 1)
      } else {
        assertMetadataOnly(child, depth + 1)
      }
    }
  }
}

function normalizedFailure(request: AgentProviderRequest, result: AgentProviderResult, errorCode: string): AgentProviderResult {
  return Object.freeze({
    status: 'FAILED' as const,
    provider: PROVIDER_IDENTIFIER.test(result.provider) ? result.provider.toUpperCase() : 'UNKNOWN',
    model: result.model && MODEL_IDENTIFIER.test(result.model) ? result.model : null,
    correlationId: request.correlationId,
    metadata: Object.freeze({ fallbackUsed: Boolean(result.metadata?.fallbackUsed) }),
    errorCode,
  })
}

/**
 * Normalizes an adapter response to the only values that may cross into the
 * durable runtime. A completion without a provider response provenance hash is
 * deliberately downgraded to FAILED before any usage row can be recorded.
 */
export function normalizeAgentProviderResult(request: AgentProviderRequest, result: AgentProviderResult): AgentProviderResult {
  if (result.correlationId !== request.correlationId) throw new Error('Provider result correlation does not match the request.')
  if (!PROVIDER_IDENTIFIER.test(result.provider)) return normalizedFailure(request, result, 'AGENT_PROVIDER_IDENTIFIER_INVALID')
  if (result.model !== null && !MODEL_IDENTIFIER.test(result.model)) return normalizedFailure(request, result, 'AGENT_PROVIDER_MODEL_INVALID')
  if (result.status === 'COMPLETED' && (!result.responseHash || !HASH.test(result.responseHash))) {
    return normalizedFailure(request, result, 'AGENT_PROVIDER_RESPONSE_PROVENANCE_REQUIRED')
  }
  if (result.structuredArtifact) assertMetadataOnly(result.structuredArtifact)
  if (result.status === 'NOT_CONFIGURED' && result.structuredArtifact) throw new Error('A not-configured provider cannot produce an artifact.')
  const sourceMetadata = result.metadata ?? {}
  const metadata = Object.freeze({
    ...(typeof sourceMetadata.providerRequestId === 'string' && /^[A-Za-z0-9._:/@-]{1,160}$/.test(sourceMetadata.providerRequestId) ? { providerRequestId: sourceMetadata.providerRequestId } : {}),
    ...(typeof sourceMetadata.modelVersion === 'string' && /^[A-Za-z0-9._:/@-]{1,120}$/.test(sourceMetadata.modelVersion) ? { modelVersion: sourceMetadata.modelVersion } : {}),
    ...(Number.isInteger(sourceMetadata.latencyMs) && sourceMetadata.latencyMs! >= 0 ? { latencyMs: sourceMetadata.latencyMs } : {}),
    ...(Number.isInteger(sourceMetadata.inputTokens) && sourceMetadata.inputTokens! >= 0 ? { inputTokens: sourceMetadata.inputTokens } : {}),
    ...(Number.isInteger(sourceMetadata.outputTokens) && sourceMetadata.outputTokens! >= 0 ? { outputTokens: sourceMetadata.outputTokens } : {}),
    ...(Number.isInteger(sourceMetadata.costMicros) && sourceMetadata.costMicros! >= 0 ? { costMicros: sourceMetadata.costMicros } : {}),
    fallbackUsed: Boolean(sourceMetadata.fallbackUsed),
  })
  return Object.freeze({
    ...result,
    provider: result.provider.toUpperCase(),
    metadata,
    ...(result.responseHash ? { responseHash: result.responseHash.toLowerCase() } : {}),
    ...(result.structuredArtifact ? { structuredArtifact: Object.freeze({ ...result.structuredArtifact }) } : {}),
  })
}

/**
 * No provider is active by default. This path intentionally performs no network
 * request and supplies only a configuration state that may be persisted.
 */
export class NotConfiguredAgentProviderGateway implements AgentProviderGateway {
  async invoke(input: AgentProviderRequest): Promise<AgentProviderResult> {
    return normalizeAgentProviderResult(input, {
      status: 'NOT_CONFIGURED', provider: 'NONE', model: null, correlationId: input.correlationId,
      metadata: { fallbackUsed: false }, errorCode: 'AGENT_PROVIDER_NOT_CONFIGURED',
    })
  }
}

export type ScriptedProviderResponse = Omit<AgentProviderResult, 'correlationId'>

/** Deterministic test-only adapter. It cannot make outbound requests. */
export class ScriptedAgentProviderGateway implements AgentProviderGateway {
  constructor(private readonly responses: Readonly<Record<string, ScriptedProviderResponse>>) {}

  async invoke(input: AgentProviderRequest): Promise<AgentProviderResult> {
    const scripted = this.responses[`${input.providerKey}:${input.workflowKey}`] ?? this.responses[input.providerKey]
    if (!scripted) return new NotConfiguredAgentProviderGateway().invoke(input)
    return normalizeAgentProviderResult(input, { ...scripted, correlationId: input.correlationId })
  }
}
