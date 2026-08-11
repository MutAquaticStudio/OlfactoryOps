/**
 * Container images intentionally accept a service-specific secret name. Keep
 * the Cloudflare Worker binding name private to the runtime boundary.
 */
export const scientificContainerHealthEndpoint = 'localhost/health'
export const scientificContainerStartupTimeoutMs = 90_000
export const scientificContainerStartupPollIntervalMs = 1_000

export type ScientificContainerDiagnostic = {
  code:
    | 'SCIENTIFIC_CONTAINER_EXITED_BEFORE_HEALTHY'
    | 'SCIENTIFIC_CONTAINER_PORT_UNAVAILABLE'
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
export function scientificContainerDiagnostic(error: unknown): ScientificContainerDiagnostic {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  const exitCode = Number(message.match(/exit code:\s*(\d+)/i)?.[1])

  if (Number.isInteger(exitCode)) {
    return { code: 'SCIENTIFIC_CONTAINER_EXITED_BEFORE_HEALTHY', exitCode }
  }
  if (/not listening|port|verify port/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_PORT_UNAVAILABLE', exitCode: null }
  }
  if (/start|health/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_STARTUP_FAILED', exitCode: null }
  }
  return { code: 'SCIENTIFIC_CONTAINER_RUNTIME_ERROR', exitCode: null }
}
