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
      const body = await response.clone().text()
      if (body.startsWith('Failed to start container:')) return 'SCIENTIFIC_CONTAINER_START_FAILED'
      if (body.startsWith('Origin is disallowed')) return 'SCIENTIFIC_CONTAINER_NETWORK_DENIED'
      const payload = JSON.parse(body) as { error?: unknown }
      if (typeof payload.error === 'string' && runtimeCodes.has(payload.error)) return payload.error
    } catch {
      // The response is intentionally treated as opaque unless it matches our protocol.
    }
  }

  if (response.status >= 400 && response.status <= 599) return `SCIENTIFIC_CONTAINER_HTTP_${response.status}`

  return 'SCIENTIFIC_CONTAINER_FAILED'
}
