import { odorResearchPredictionSchema, type OdorResearchPrediction } from '../../../packages/contracts/src/olfactory-intelligence.js'

export type OdorPredictionRuntimeInput = {
  artifactModelVersion: string
  canonicalSmiles: string
  requestedTargets?: string[]
}

export interface OdorPredictionRuntime {
  predict(input: OdorPredictionRuntimeInput): Promise<OdorResearchPrediction>
}

export class OdorPredictionRuntimeUnavailable implements OdorPredictionRuntime {
  async predict(): Promise<OdorResearchPrediction> {
    throw new Error('MODEL_RUNTIME_NOT_CONFIGURED')
  }
}

export class OdorPredictionHttpRuntime implements OdorPredictionRuntime {
  constructor(private readonly options: { baseUrl: string; sharedSecret: string; timeoutMs?: number; maxResponseBytes?: number }) {}

  async predict(input: OdorPredictionRuntimeInput): Promise<OdorResearchPrediction> {
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), this.options.timeoutMs ?? 12_000)
    try {
      const response = await fetch(new URL('/v1/predictions', this.options.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-olfactoryops-scientific-key': this.options.sharedSecret },
        body: JSON.stringify({
          modelVersionId: input.artifactModelVersion,
          canonicalSmiles: input.canonicalSmiles,
          ...(input.requestedTargets ? { requestedTargets: input.requestedTargets } : {}),
        }),
        signal: abort.signal,
      })
      const text = await response.text()
      if (new TextEncoder().encode(text).byteLength > (this.options.maxResponseBytes ?? 65_536)) throw new Error('MODEL_RUNTIME_RESPONSE_TOO_LARGE')
      if (!response.ok) {
        if (response.status === 409) throw new Error('MODEL_NOT_EVALUATED')
        if (response.status === 422) throw new Error('MODEL_RUNTIME_INVALID_INPUT')
        if (response.status === 503) throw new Error('MODEL_RUNTIME_NOT_CONFIGURED')
        throw new Error('MODEL_RUNTIME_UNAVAILABLE')
      }
      return odorResearchPredictionSchema.parse(JSON.parse(text))
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('MODEL_RUNTIME_TIMEOUT')
      if (error instanceof SyntaxError) throw new Error('MODEL_RUNTIME_RESPONSE_INVALID')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}
