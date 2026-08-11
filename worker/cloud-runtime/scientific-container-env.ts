/**
 * Container images intentionally accept a service-specific secret name. Keep
 * the Cloudflare Worker binding name private to the runtime boundary.
 */
export const scientificContainerHealthEndpoint = 'localhost/health'
export const scientificContainerStartupTimeoutMs = 90_000
export const scientificContainerStartupPollIntervalMs = 1_000
export const scientificFeatureContainerEntrypoint = ['/opt/conda/bin/python', '-m', 'scientific_runtime.server']

export type ScientificContainerDiagnostic = {
  code:
    | 'SCIENTIFIC_CONTAINER_CRASHED_DURING_STARTUP'
    | 'SCIENTIFIC_CONTAINER_EXITED_BEFORE_HEALTHY'
    | 'SCIENTIFIC_CONTAINER_NO_INSTANCE'
    | 'SCIENTIFIC_CONTAINER_PORT_UNAVAILABLE'
    | 'SCIENTIFIC_CONTAINER_RATE_LIMITED'
    | 'SCIENTIFIC_CONTAINER_REQUEST_ABORTED'
    | 'SCIENTIFIC_CONTAINER_RUNTIME_SIGNALLED'
    | 'SCIENTIFIC_CONTAINER_STARTUP_FAILED'
    | 'SCIENTIFIC_CONTAINER_RUNTIME_ERROR'
  exitCode: number | null
}

export function scientificContainerEnvironment(sharedSecret: string | undefined): Record<string, string> {
  return sharedSecret
    ? {
        SCIENTIFIC_SERVICE_SHARED_SECRET: sharedSecret,
        // Cloudflare forwards traffic across the VM boundary, not from the
        // Python process itself, so the private service must bind all interfaces.
        SCIENTIFIC_SERVICE_HOST: '0.0.0.0',
      }
    : {}
}

/**
 * Container lifecycle errors can include transport details. Retain only a
 * stable error class and the process exit code for staging diagnostics.
 */
function safeErrorMessages(error: unknown): string[] {
  const messages: string[] = []
  const seen = new Set<object>()
  let current = error

  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current === 'string') {
      messages.push(current)
      break
    }
    if (!current || typeof current !== 'object' || seen.has(current)) break
    seen.add(current)
    const candidate = current as { message?: unknown; cause?: unknown }
    if (typeof candidate.message === 'string') messages.push(candidate.message)
    current = candidate.cause
  }

  return messages
}

export function scientificContainerDiagnostic(error: unknown): ScientificContainerDiagnostic {
  const message = safeErrorMessages(error).join('\n')
  const exitCode = Number(message.match(/(?:unexpected )?exit code:\s*(\d+)|runtime signalled the container to exit:\s*(\d+)/i)?.slice(1).find(Boolean))

  if (Number.isInteger(exitCode)) {
    return { code: 'SCIENTIFIC_CONTAINER_EXITED_BEFORE_HEALTHY', exitCode }
  }
  if (/there is no container instance/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_NO_INSTANCE', exitCode: null }
  }
  if (/too many containers per second/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_RATE_LIMITED', exitCode: null }
  }
  if (/runtime signalled the container to exit/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_RUNTIME_SIGNALLED', exitCode: null }
  }
  if (/container crashed while checking for ports/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_CRASHED_DURING_STARTUP', exitCode: null }
  }
  if (/container request aborted/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_REQUEST_ABORTED', exitCode: null }
  }
  if (/not listening|port|verify port/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_PORT_UNAVAILABLE', exitCode: null }
  }
  if (/start|health/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_STARTUP_FAILED', exitCode: null }
  }
  return { code: 'SCIENTIFIC_CONTAINER_RUNTIME_ERROR', exitCode: null }
}
