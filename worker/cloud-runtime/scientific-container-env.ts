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
  errorShape: 'STRING' | 'ERROR' | 'OBJECT_MESSAGE' | 'OBJECT_ERROR' | 'OBJECT_REASON' | 'OBJECT_CONTEXT' | 'OBJECT' | 'UNKNOWN'
  statusCode: number | null
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
type SafeErrorInspection = {
  messages: string[]
  errorShape: ScientificContainerDiagnostic['errorShape']
  statusCode: number | null
}

function propertyOf(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

function safeErrorInspection(error: unknown): SafeErrorInspection {
  const messages: string[] = []
  const seen = new Set<object>()
  const pending: unknown[] = [error]
  let statusCode: number | null = null
  let errorShape: SafeErrorInspection['errorShape'] = 'UNKNOWN'

  if (typeof error === 'string') errorShape = 'STRING'
  else if (error instanceof Error) errorShape = 'ERROR'
  else if (error && typeof error === 'object') {
    if (propertyOf(error, 'error') !== undefined) errorShape = 'OBJECT_ERROR'
    else if (propertyOf(error, 'reason') !== undefined) errorShape = 'OBJECT_REASON'
    else if (propertyOf(error, 'context') !== undefined) errorShape = 'OBJECT_CONTEXT'
    else if (propertyOf(error, 'message') !== undefined) errorShape = 'OBJECT_MESSAGE'
    else errorShape = 'OBJECT'
  }

  for (let depth = 0; depth < 4 && pending.length > 0; depth += 1) {
    const current = pending.shift()
    if (typeof current === 'string') {
      messages.push(current)
      continue
    }
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    const message = propertyOf(current, 'message')
    if (typeof message === 'string') messages.push(message)
    for (const key of ['cause', 'error', 'reason', 'context']) {
      const nested = propertyOf(current, key)
      if (nested !== undefined) pending.push(nested)
    }
    for (const key of ['status', 'statusCode']) {
      const candidate = propertyOf(current, key)
      if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 100 && candidate <= 599) {
        statusCode ??= candidate
      }
    }
  }

  return { messages, errorShape, statusCode }
}

export function scientificContainerDiagnostic(error: unknown): ScientificContainerDiagnostic {
  const inspection = safeErrorInspection(error)
  const message = inspection.messages.join('\n')
  const exitCode = Number(message.match(/(?:unexpected )?exit code:\s*(\d+)|runtime signalled the container to exit:\s*(\d+)/i)?.slice(1).find(Boolean))

  if (Number.isInteger(exitCode)) {
    return { code: 'SCIENTIFIC_CONTAINER_EXITED_BEFORE_HEALTHY', exitCode, errorShape: inspection.errorShape, statusCode: inspection.statusCode }
  }
  if (/there is no container instance/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_NO_INSTANCE', exitCode: null, errorShape: inspection.errorShape, statusCode: inspection.statusCode }
  }
  if (/too many containers per second/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_RATE_LIMITED', exitCode: null, errorShape: inspection.errorShape, statusCode: inspection.statusCode }
  }
  if (/runtime signalled the container to exit/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_RUNTIME_SIGNALLED', exitCode: null, errorShape: inspection.errorShape, statusCode: inspection.statusCode }
  }
  if (/container crashed while checking for ports/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_CRASHED_DURING_STARTUP', exitCode: null, errorShape: inspection.errorShape, statusCode: inspection.statusCode }
  }
  if (/container request aborted/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_REQUEST_ABORTED', exitCode: null, errorShape: inspection.errorShape, statusCode: inspection.statusCode }
  }
  if (/not listening|port|verify port/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_PORT_UNAVAILABLE', exitCode: null, errorShape: inspection.errorShape, statusCode: inspection.statusCode }
  }
  if (/start|health/i.test(message)) {
    return { code: 'SCIENTIFIC_CONTAINER_STARTUP_FAILED', exitCode: null, errorShape: inspection.errorShape, statusCode: inspection.statusCode }
  }
  return { code: 'SCIENTIFIC_CONTAINER_RUNTIME_ERROR', exitCode: null, errorShape: inspection.errorShape, statusCode: inspection.statusCode }
}
