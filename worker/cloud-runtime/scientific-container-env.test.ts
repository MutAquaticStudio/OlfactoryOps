import { describe, expect, it } from 'vitest'
import {
  scientificContainerDiagnostic,
  scientificContainerEnvironment,
  scientificContainerHealthEndpoint,
} from './scientific-container-env.js'

describe('scientificContainerEnvironment', () => {
  it('uses the only bounded health endpoint for Container startup probes', () => {
    expect(scientificContainerHealthEndpoint).toBe('localhost/health')
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
  })
})
