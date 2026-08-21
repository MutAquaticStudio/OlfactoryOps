import { describe, expect, it } from 'vitest'
import { readConfiguredSeededAdminPasswordHash, seededAdminCredentialsForEnv } from './auth-credentials.js'

const validHash = 'pbkdf2:v1:sha256:100000:0123456789ABCDEFGHIJKL:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'

describe('seeded admin credentials', () => {
  it('only accepts the PBKDF2 verifier format used by the service', () => {
    expect(readConfiguredSeededAdminPasswordHash(undefined)).toBeUndefined()
    expect(readConfiguredSeededAdminPasswordHash('sha256:legacy')).toBeUndefined()
    expect(readConfiguredSeededAdminPasswordHash(` ${validHash} `)).toBe(validHash)
  })

  it('creates no local credential unless an explicit verifier is supplied', () => {
    expect(seededAdminCredentialsForEnv(undefined)).toEqual([])
    expect(seededAdminCredentialsForEnv(validHash)).toEqual([
      {
        email: 'm.thuanwork@gmail.com',
        passwordHash: validHash,
        passwordSetAt: '2026-07-16T00:00:00.000Z',
      },
    ])
  })
})
