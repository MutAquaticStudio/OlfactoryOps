import { describe, expect, it } from 'vitest'
import {
  scientificContainerDiagnostic,
  scientificContainerEnvironment,
  scientificContainerHealthEndpoint,
  scientificContainerStartupPollIntervalMs,
  scientificContainerStartupTimeoutMs,
} from './scientific-container-env.js'

describe('scientificContainerEnvironment', () => {
  it('uses the only bounded health endpoint for Container startup probes', () => {
    expect(scientificContainerHealthEndpoint).toBe('localhost/health')
    expect(scientificContainerStartupTimeoutMs).toBe(90_000)
    expect(scientificContainerStartupPollIntervalMs).toBe(1_000)
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
    })
    expect(scientificContainerDiagnostic(new Error('startup details secret=never-log'))).toEqual({
      code: 'SCIENTIFIC_CONTAINER_STARTUP_FAILED',
      exitCode: null,
    })
    expect(scientificContainerDiagnostic('Failed to verify port 8099 is available after 20000ms, last error: opaque')).toEqual({
      code: 'SCIENTIFIC_CONTAINER_PORT_UNAVAILABLE',
      exitCode: null,
    })
  })
})
