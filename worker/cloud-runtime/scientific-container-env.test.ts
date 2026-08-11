import { describe, expect, it } from 'vitest'
import { scientificContainerEnvironment, scientificContainerHealthEndpoint } from './scientific-container-env.js'

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
})
