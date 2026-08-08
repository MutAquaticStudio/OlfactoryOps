import { describe, expect, it, vi } from 'vitest'
import { CloudflareWorkersAiFormulaProvider, OpenAiResponsesProvider, configuredAgentProvider } from './agent-runtime'

describe('provider boundary', () => {
  it('keeps every deployment in deterministic mock mode until the provider rollout is explicitly completed', () => {
    expect(configuredAgentProvider({
      AGENT_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
      OPENAI_FORMULA_AGENT_MODEL: 'test-model',
      AGENT_CONTEXT_ENCRYPTION_KEY: 'test-context-key',
    })).toEqual({ provider: 'mock', model: 'deterministic-v1' })
  })

  it('selects Workers AI only when the binding and explicit provider flag are both present', () => {
    const ai = { run: vi.fn() }
    expect(configuredAgentProvider({
      AGENT_PROVIDER: 'workers_ai',
      WORKERS_AI_FORMULA_AGENT_MODEL: '@cf/openai/gpt-oss-120b',
      AI: ai,
    })).toEqual({ provider: 'workers_ai', model: '@cf/openai/gpt-oss-120b' })
    expect(configuredAgentProvider({ AGENT_PROVIDER: 'workers_ai' })).toEqual({ provider: 'mock', model: 'deterministic-v1' })
  })

  it('validates a bounded Workers AI tool-call plan and never executes model-supplied actions', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              function: {
                name: 'submit_formula_research_plan',
                arguments: JSON.stringify({
                  summary: 'Explore a marine mineral structure with a dry woody trail.',
                  searchQuery: 'marine mineral woody amber citrus',
                  focusNotes: ['marine', 'mineral', 'woody'],
                  avoidNotes: ['powdery'],
                  recommendedTools: ['search_materials', 'retrieve_material_evidence', 'validate_compliance'],
                }),
              },
            }],
          },
        }],
      }),
    }
    const provider = new CloudflareWorkersAiFormulaProvider(ai, '@cf/openai/gpt-oss-120b')
    const plan = await provider.researchPlan({ brief: 'Marine mineral fragrance', tools: [] })

    expect(plan.searchQuery).toBe('marine mineral woody amber citrus')
    expect(plan.recommendedTools).toEqual(['search_materials', 'retrieve_material_evidence', 'validate_compliance'])
    expect(ai.run).toHaveBeenCalledWith('@cf/openai/gpt-oss-120b', expect.objectContaining({
      tool_choice: 'required',
      parallel_tool_calls: false,
      store: false,
    }))
  })

  it('rejects Workers AI plans that request an unregistered tool', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        choices: [{ message: { tool_calls: [{ function: { name: 'submit_formula_research_plan', arguments: JSON.stringify({
          summary: 'Unsafe plan', searchQuery: 'amber', focusNotes: [], avoidNotes: [], recommendedTools: ['execute_sql'],
        }) } }] } }],
      }),
    }
    const provider = new CloudflareWorkersAiFormulaProvider(ai, '@cf/openai/gpt-oss-120b')
    await expect(provider.researchPlan({ brief: 'Amber fragrance', tools: [] })).rejects.toThrow('invalid research plan')
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
