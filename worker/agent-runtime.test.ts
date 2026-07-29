import { describe, expect, it, vi } from 'vitest'
import { OpenAiResponsesProvider, configuredAgentProvider } from './agent-runtime'

describe('formula agent provider boundary', () => {
  it('keeps every deployment in deterministic mock mode until the provider rollout is explicitly completed', () => {
    expect(configuredAgentProvider({
      AGENT_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
      OPENAI_FORMULA_AGENT_MODEL: 'test-model',
      AGENT_CONTEXT_ENCRYPTION_KEY: 'test-context-key',
    })).toEqual({ provider: 'mock', model: 'deterministic-v1' })
  })

  it('keeps the Responses adapter isolated, streamed, strict, and provider-store disabled', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.close() } })
    let sentInit: RequestInit | undefined
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentInit = init
      return new Response(body, { status: 200 })
    }) as unknown as typeof fetch
    const provider = new OpenAiResponsesProvider('test-key', 'test-model', fetcher)
    await provider.stream({ brief: 'Marine woody formula', tools: [{ name: 'search_materials', description: 'Search', parameters: { type: 'object' } }] })

    expect(fetcher).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({ method: 'POST' }))
    const payload = JSON.parse(String(sentInit?.body))
    expect(payload).toMatchObject({ model: 'test-model', stream: true, store: false })
    expect(payload.tools[0]).toMatchObject({ type: 'function', name: 'search_materials', strict: true })
  })
})
