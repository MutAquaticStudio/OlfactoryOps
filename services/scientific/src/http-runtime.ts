import {
  scientificFeatureRequestSchema,
  scientificRuntimeResponseSchema,
  structureNormalizeRequestSchema,
  type ScientificFeatureRequest,
  type ScientificRuntimeResponse,
  type StructureNormalizeRequest,
} from '../../../packages/contracts/src/scientific.js'
import type { ScientificRuntime } from './service.js'

export class ScientificHttpRuntime implements ScientificRuntime {
  constructor(
    private readonly options: { baseUrl: string; sharedSecret: string; timeoutMs?: number },
  ) {}

  private async request(path: string, body: unknown): Promise<ScientificRuntimeResponse> {
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), this.options.timeoutMs ?? 8_000)
    try {
      const response = await fetch(new URL(path, this.options.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-olfactoryops-scientific-key': this.options.sharedSecret },
        body: JSON.stringify(body),
        signal: abort.signal,
      })
      if (!response.ok) {
        if (response.status === 422) throw new Error('SCIENTIFIC_RUNTIME_INVALID_SMILES')
        throw new Error(`SCIENTIFIC_RUNTIME_HTTP_${response.status}`)
      }
      return scientificRuntimeResponseSchema.parse(await response.json())
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('SCIENTIFIC_RUNTIME_TIMEOUT')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  async normalize(input: StructureNormalizeRequest) {
    return this.request('/v1/structure/normalize', structureNormalizeRequestSchema.parse(input))
  }

  async generateFeatures(input: { canonicalSmiles: string; featureKinds: ScientificFeatureRequest['featureKinds'] }) {
    return this.request('/v1/features/generate', { canonicalSmiles: structureNormalizeRequestSchema.shape.smiles.parse(input.canonicalSmiles), ...scientificFeatureRequestSchema.parse({ featureKinds: input.featureKinds }) })
  }
}
