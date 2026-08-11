const statusCodes: Record<number, string> = {
  401: 'SCIENTIFIC_CONTAINER_AUTH_DENIED',
  403: 'SCIENTIFIC_CONTAINER_AUTH_DENIED',
  404: 'SCIENTIFIC_CONTAINER_ROUTE_NOT_FOUND',
  413: 'SCIENTIFIC_CONTAINER_REQUEST_TOO_LARGE',
  422: 'SCIENTIFIC_CONTAINER_INVALID_REQUEST',
  429: 'SCIENTIFIC_CONTAINER_RATE_LIMITED',
  503: 'SCIENTIFIC_CONTAINER_UNAVAILABLE',
}

const runtimeCodes = new Set([
  'SCIENTIFIC_RUNTIME_FAILED',
  'SCIENTIFIC_RUNTIME_NOT_CONFIGURED',
  'INVALID_MOLECULAR_STRUCTURE',
  'INVALID_SCIENTIFIC_REQUEST',
])

/** Never surface an opaque container response or request content to the job ledger. */
export async function safeScientificContainerError(response: Response): Promise<string> {
  const statusCode = statusCodes[response.status]
  if (statusCode) return statusCode

  if (response.status === 500) {
    try {
      const payload = await response.clone().json() as { error?: unknown }
      if (typeof payload.error === 'string' && runtimeCodes.has(payload.error)) return payload.error
    } catch {
      // The response is intentionally treated as opaque unless it matches our protocol.
    }
  }

  return 'SCIENTIFIC_CONTAINER_FAILED'
}
