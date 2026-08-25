import {
  cloudOdorPredictionMaximumRequestBytes,
  cloudOdorPredictionMaximumResponseBytes,
  cloudOdorPredictionRequestSchema,
  cloudOdorPredictionResponseSchema,
  cloudRuntimeProtocol,
} from './contracts.js'
import type { BufferedScientificContainerResponse, ScientificModelContainer } from './scientific-containers.js'

export type CloudOdorPredictionEnv = {
  SCIENTIFIC_MODEL_CONTAINER: DurableObjectNamespace<ScientificModelContainer>
  SCIENTIFIC_CONTAINER_SHARED_SECRET?: string
}

type ModelContainerStub = Pick<DurableObjectStub<ScientificModelContainer>, 'runOdorPrediction'>
export type ModelContainerResolver = (binding: DurableObjectNamespace<ScientificModelContainer>) => Promise<ModelContainerStub>

function json(status: number, code: string, body?: unknown): Response {
  return new Response(JSON.stringify(body ?? { code }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function readBoundedRequest(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > cloudOdorPredictionMaximumRequestBytes) {
    throw new Error('MODEL_RUNTIME_REQUEST_TOO_LARGE')
  }
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > cloudOdorPredictionMaximumRequestBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error('MODEL_RUNTIME_REQUEST_TOO_LARGE')
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

function containerFailure(response: BufferedScientificContainerResponse): Response {
  if (response.status === 409) return json(409, 'MODEL_NOT_EVALUATED')
  if (response.status === 413 || response.status === 422) return json(422, 'MODEL_RUNTIME_INVALID_INPUT')
  if (response.status === 503) return json(503, 'MODEL_RUNTIME_NOT_CONFIGURED')
  return json(503, 'MODEL_RUNTIME_UNAVAILABLE')
}

function runtimeFailure(error: unknown): Response {
  const code = error instanceof Error ? error.message : ''
  if (code === 'MODEL_RUNTIME_REQUEST_TOO_LARGE') return json(413, 'MODEL_RUNTIME_INVALID_INPUT')
  if (code === 'MODEL_RUNTIME_TIMEOUT') return json(504, 'MODEL_RUNTIME_TIMEOUT')
  if (code === 'SCIENTIFIC_CONTAINER_NOT_CONFIGURED') return json(503, 'MODEL_RUNTIME_NOT_CONFIGURED')
  return json(503, 'MODEL_RUNTIME_UNAVAILABLE')
}

/** Internal service-binding endpoint. It has no public route or tenant context. */
export async function handleInternalOdorPrediction(
  request: Request,
  env: CloudOdorPredictionEnv,
  resolveContainer: ModelContainerResolver,
): Promise<Response> {
  if (request.method !== 'POST' || request.headers.get('x-olfactoryops-internal-dispatch') !== cloudRuntimeProtocol) {
    return json(403, 'INTERNAL_DISPATCH_DENIED')
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return json(415, 'INVALID_CONTENT_TYPE')
  }
  if (!env.SCIENTIFIC_CONTAINER_SHARED_SECRET) return json(503, 'MODEL_RUNTIME_NOT_CONFIGURED')

  try {
    const raw = await readBoundedRequest(request)
    let candidate: unknown
    try {
      candidate = JSON.parse(raw)
    } catch {
      return json(422, 'MODEL_RUNTIME_INVALID_INPUT')
    }
    const parsed = cloudOdorPredictionRequestSchema.safeParse(candidate)
    if (!parsed.success) return json(422, 'MODEL_RUNTIME_INVALID_INPUT')

    const container = await resolveContainer(env.SCIENTIFIC_MODEL_CONTAINER)
    const response = await container.runOdorPrediction(parsed.data.payload, env.SCIENTIFIC_CONTAINER_SHARED_SECRET)
    if (response.status < 200 || response.status >= 300) return containerFailure(response)
    if (new TextEncoder().encode(response.body).byteLength > cloudOdorPredictionMaximumResponseBytes) {
      return json(503, 'MODEL_RUNTIME_UNAVAILABLE')
    }
    try {
      const prediction = cloudOdorPredictionResponseSchema.parse(JSON.parse(response.body))
      return json(200, 'PASS', prediction)
    } catch {
      return json(503, 'MODEL_RUNTIME_UNAVAILABLE')
    }
  } catch (error) {
    return runtimeFailure(error)
  }
}
