import { describe, expect, it } from 'vitest'
import { resolveLocalApiConfig } from './local-api-config.js'

describe('local API configuration', () => {
  it('defaults to a loopback development binding with local browser origins', () => {
    expect(resolveLocalApiConfig({})).toEqual({
      host: '127.0.0.1',
      port: 4000,
      corsOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
    })
  })

  it('fails closed for hosted runtime and non-loopback binding requests', () => {
    expect(() => resolveLocalApiConfig({ NODE_ENV: 'production' })).toThrow('only runs in development or test')
    expect(() => resolveLocalApiConfig({ HOST: '0.0.0.0' })).toThrow('must bind to a loopback host')
  })

  it('rejects wildcard credentialed CORS configuration', () => {
    expect(() => resolveLocalApiConfig({ CORS_ORIGINS: 'https://*.labofscents.pages.dev' })).toThrow(
      'must contain exact origins without wildcards',
    )
  })
})
