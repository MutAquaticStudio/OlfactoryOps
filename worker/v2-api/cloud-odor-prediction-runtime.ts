import type { OdorResearchPrediction } from '../../packages/contracts/src/olfactory-intelligence.js'
import {
  cloudOdorPredictionMaximumResponseBytes,
  cloudOdorPredictionOperation,
  cloudOdorPredictionRequestSchema,
  cloudOdorPredictionResponseSchema,
  cloudOdorPredictionTimeoutMs,
  cloudRuntimeProtocol,
} from '../cloud-runtime/contracts.js'
import {
  OdorPredictionRuntimeUnavailable,
  type OdorPredictionRuntime,
  type OdorPredictionRuntimeInput,
} from '../../services/scientific/src/model-http-runtime.js'

export type InternalCloudRuntimeBinding = Pick<Fetcher, 'fetch'>

async function readBoundedResponse(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > cloudOdorPredictionMaximumResponseBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error('MODEL_RUNTIME_RESPONSE_TOO_LARGE')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

function responseError(status: number, text: string): Error {
  if (status === 409) return new Error('MODEL_NOT_EVALUATED')
  if (status === 413 || status === 422) return new Error('MODEL_RUNTIME_INVALID_INPUT')
  if (status === 504) return new Error('MODEL_RUNTIME_TIMEOUT')
  if (status === 503) {
    try {
      const payload = JSON.parse(text) as { code?: unknown }
      if (payload.code === 'MODEL_RUNTIME_NOT_CONFIGURED') return new Error('MODEL_RUNTIME_NOT_CONFIGURED')
    } catch {
      // Treat malformed error bodies as an unavailable private runtime.
    }
  }
  return new Error('MODEL_RUNTIME_UNAVAILABLE')
}

/**
 * Worker-only adapter. The binding has no public URL and Cloud Runtime owns
 * the container authentication secret.
 */
export class CloudflareOdorPredictionRuntime implements OdorPredictionRuntime {
  constructor(
    private readonly binding: InternalCloudRuntimeBinding,
    private readonly timeoutMs = cloudOdorPredictionTimeoutMs,
  ) {}

  async predict(input: OdorPredictionRuntimeInput): Promise<OdorResearchPrediction> {
    const requestBody = cloudOdorPredictionRequestSchema.parse({
      protocolVersion: cloudRuntimeProtocol,
      operation: cloudOdorPredictionOperation,
      payload: {
        modelVersionId: input.artifactModelVersion,
        canonicalSmiles: input.canonicalSmiles,
        ...(input.requestedTargets ? { requestedTargets: input.requestedTargets } : {}),
      },
    })
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), this.timeoutMs)
    try {
      const response = await this.binding.fetch(new Request('https://cloud-runtime.internal/internal/odor-prediction', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-olfactoryops-internal-dispatch': cloudRuntimeProtocol,
        },
        body: JSON.stringify(requestBody),
        signal: abort.signal,
      }))
      const text = await readBoundedResponse(response)
      if (!response.ok) throw responseError(response.status, text)
      try {
        return cloudOdorPredictionResponseSchema.parse(JSON.parse(text))
      } catch {
        throw new Error('MODEL_RUNTIME_RESPONSE_INVALID')
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('MODEL_RUNTIME_TIMEOUT')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function odorPredictionRuntimeForBinding(binding: InternalCloudRuntimeBinding | undefined): OdorPredictionRuntime {
  return binding ? new CloudflareOdorPredictionRuntime(binding) : new OdorPredictionRuntimeUnavailable()
}
