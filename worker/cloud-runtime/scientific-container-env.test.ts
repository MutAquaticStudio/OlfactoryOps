import { describe, expect, it } from 'vitest'
import { scientificContainerEnvironment } from './scientific-container-env.js'

describe('scientificContainerEnvironment', () => {
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
