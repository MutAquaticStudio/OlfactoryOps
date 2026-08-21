import { describe, expect, it } from 'vitest'
import {
  scientificContainerDiagnostic,
  scientificContainerEnvironment,
  scientificFeatureContainerEntrypoint,
  scientificContainerHealthEndpoint,
  scientificContainerStopPollAttempts,
  scientificContainerStopPollIntervalMs,
  scientificContainerStartupPollIntervalMs,
  scientificContainerStartupTimeoutMs,
} from './scientific-container-env.js'

describe('scientificContainerEnvironment', () => {
  it('uses the only bounded health endpoint for Container startup probes', () => {
    expect(scientificContainerHealthEndpoint).toBe('localhost/health')
    expect(scientificContainerStartupTimeoutMs).toBe(300_000)
    expect(scientificContainerStartupPollIntervalMs).toBe(1_000)
    expect(scientificContainerStopPollAttempts).toBe(10)
    expect(scientificContainerStopPollIntervalMs).toBe(1_000)
    expect(scientificFeatureContainerEntrypoint).toEqual(['/opt/conda/bin/python', '-m', 'scientific_runtime.server'])
  })

  it('maps the runtime secret only to the image service variable', () => {
    expect(scientificContainerEnvironment('runtime-secret')).toEqual({
      SCIENTIFIC_SERVICE_SHARED_SECRET: 'runtime-secret',
      SCIENTIFIC_SERVICE_HOST: '0.0.0.0',
    })
  })

  it('does not manufacture a fallback secret', () => {
    expect(scientificContainerEnvironment(undefined)).toEqual({})
  })

  it('reduces lifecycle errors to a safe code and exit status', () => {
    expect(scientificContainerDiagnostic(new Error('Container exited before we could determine the container health, exit code: 1'))).toEqual({
      code: 'SCIENTIFIC_CONTAINER_EXITED_BEFORE_HEALTHY',
      exitCode: 1,
      errorShape: 'ERROR',
      statusCode: null,
    })
    expect(scientificContainerDiagnostic(new Error('startup details secret=never-log'))).toEqual({
      code: 'SCIENTIFIC_CONTAINER_STARTUP_FAILED',
      exitCode: null,
      errorShape: 'ERROR',
      statusCode: null,
    })
    expect(scientificContainerDiagnostic('Failed to verify port 8099 is available after 20000ms, last error: opaque')).toEqual({
      code: 'SCIENTIFIC_CONTAINER_PORT_UNAVAILABLE',
      exitCode: null,
      errorShape: 'STRING',
      statusCode: null,
    })
    expect(scientificContainerDiagnostic(new Error('outer opaque', {
      cause: new Error('There is no container instance that can be provided to this Durable Object'),
    }))).toEqual({
      code: 'SCIENTIFIC_CONTAINER_NO_INSTANCE',
      exitCode: null,
      errorShape: 'ERROR',
      statusCode: null,
    })
    expect(scientificContainerDiagnostic({ message: 'You are requesting too many containers per second' })).toEqual({
      code: 'SCIENTIFIC_CONTAINER_RATE_LIMITED',
      exitCode: null,
      errorShape: 'OBJECT_MESSAGE',
      statusCode: null,
    })
    expect(scientificContainerDiagnostic(new Error('Container crashed while checking for ports, did you start the container and setup the entrypoint correctly?'))).toEqual({
      code: 'SCIENTIFIC_CONTAINER_CRASHED_DURING_STARTUP',
      exitCode: null,
      errorShape: 'ERROR',
      statusCode: null,
    })
  })

  it('classifies nested opaque lifecycle errors without logging their values', () => {
    expect(scientificContainerDiagnostic({
      error: { reason: new Error('Container request aborted') },
      status: 503,
    })).toEqual({
      code: 'SCIENTIFIC_CONTAINER_REQUEST_ABORTED',
      exitCode: null,
      errorShape: 'OBJECT_ERROR',
      statusCode: 503,
    })
  })
})
